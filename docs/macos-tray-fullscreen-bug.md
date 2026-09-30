# macOS 托盘小窗在全屏 Space 上的显示问题 — 三次修改历程

## 背景

SwitchHosts 的 macOS 托盘图标点击后会弹出一个小窗（`/tray` 路由），逻辑集中在
`src-tauri/src/tray.rs`。小窗由 Tauri 的 `WebviewWindowBuilder` 创建，配置了
`always_on_top(true)` 与 `visible_on_all_workspaces(true)`。

**初始 bug**：当其他 App 处于全屏（独立的 full-screen Space）时，点击托盘图标，
小窗无法显示在当前全屏页面上；用户必须手动回到桌面（常规 Space）才能看到它。

## 2026-09-17 修复进展

### 对历史分析的校正

重新以已回退到 `master` 的源码为基线核对后，确认本文原来的时间线有两处不准确：

1. 原始 `show_tray_window()` 并非只调用 `makeKeyAndOrderFront:`。当 App 不活跃时，它还会
   调用 `activateIgnoringOtherApps:`。所以 Fix #1 阶段仍包含 Regular App 的全局激活，
   “进入全屏 Space”和“激活 App 后发生 Space 切换”是两个叠加问题。
2. 最终方案不需要手写新的 `WKWebView` 容器。现有 Tauri `WebviewWindow` 可以在原地转换
   为 `NSPanel`，React `/tray` 页面、IPC、窗口定位和 capability 均可继续复用。

更准确的根因分为三层：

- `visible_on_all_workspaces(true)` 只有 `CanJoinAllSpaces`，缺少
  `FullScreenAuxiliary`；
- `always_on_top(true)` 只对应普通 floating level，不足以保证持续高于另一个 App 的
  全屏窗口；
- 普通 `NSWindow` 为获得交互而激活 Regular App，会触发或等待 Space 切换。

### Fix #4 — 将现有 Tauri 窗口转换为 nonactivating NSPanel

当前实现采用固定 revision 的 `tauri-nspanel 2.1.0`，只在 macOS 构建中启用。托盘
WebView 仍由原来的 `WebviewWindowBuilder` 创建，随后转换为专用 `TrayPanel`：

- `can_become_key_window = true`，允许 WebView 接收输入；
- `can_become_main_window = false`，避免成为主窗口；
- style mask 使用 `Borderless | NonactivatingPanel`；
- collection behavior 使用 `CanJoinAllSpaces | FullScreenAuxiliary | Transient |
  IgnoresCycle`；
- level 使用 `PopUpMenu`，足以覆盖全屏 App 内容，同时不遮挡屏保、锁屏等受保护的
  系统界面；
- `hidesOnDeactivate = false`；
- WebView 启用 `accept_first_mouse(true)`；
- 显示时通过 panel 的 `show_and_make_key()`，不再调用
  `activateIgnoringOtherApps:`。

关闭路径仍保留项目的轻量化设计：先从 panel manager 中移除窗口并把原生类恢复为
`NSWindow`，再交给 Tauri `close()` 销毁 WebView。这样不会因为 panel manager 持有引用
而在每次开关托盘小窗后残留一个已关闭的 WebView。

### 实测反馈与第二次调整

第一版 Fix #4 使用 `Transient + PopUpMenu level`。用户实测确认小窗已经能出现在其他
App 的全屏 Space 上，但移动鼠标后小窗会消失；普通桌面 Space 不受影响。

最初怀疑全屏窗口重新排序导致 panel 层级不稳定，因此曾试验 `Stationary +
ScreenSaver level`。用户第二次实测后现象完全不变，排除了窗口层级假设。

继续检查关闭路径后定位到确定原因：`install_dismiss_monitors()` 使用原始
`NSEventMask` 位运算，其中把 `1 << 5` 注释为 `OtherMouseDown`。但 NSEvent type 5 实际是
`MouseMoved`，`OtherMouseDown` 是 type 25。于是当另一个 App 位于前台时，任何细微鼠标
移动都会触发 global monitor，继而执行 `hide_tray_window()`；这也解释了为什么用户没有
把鼠标移出小窗范围，小窗仍会立刻消失。

当前修复将第三个掩码位改为 `1 << 25`，只监听左键、右键和其他鼠标键按下；同时撤回
已被实测否定的层级试验，恢复 `Transient + PopUpMenu level`。新增结构回归测试，防止
type 5 再次混入外部点击监听。修复已通过编译与自动化测试，等待用户进行第三轮真实
全屏交互验证。

### 自动化验证

- `cargo check`：通过；
- Rust：143 个单元测试通过；
- 窗口结构测试：27 个通过，其中新增 3 个托盘窗口回归测试；
- TypeScript 类型检查：通过；
- Vitest：13 个测试文件、84 个测试通过；
- ESLint：通过；
- Playwright：本机缺少对应 Chromium 二进制，44 个用例未启动，不属于断言失败。

> 后续真实 macOS 全屏行为由用户手工验证；自动化测试只保证配置与生命周期结构不会
> 静默退回普通 `NSWindow` / 全局激活路径。

下面记录针对这个 bug 家族连续做的三次修复，每次修复各自引入的新症状，以及最终
认定的根因和架构结论。

---

## Fix #1 — 补充 `FullScreenAuxiliary` collection behavior

### 根因分析

追到 vendored 的 `tao` 源码（`tao-0.35.2/src/platform_impl/macos/window.rs`）发现：

- `visible_on_all_workspaces(true)` 底层只设置了 `NSWindowCollectionBehaviorCanJoinAllSpaces`；
- 它**没有**设置 `NSWindowCollectionBehaviorFullScreenAuxiliary`（bit `1 << 8`）。

`CanJoinAllSpaces` 只让窗口能"加入所有常规 Space"，但要让窗口出现在**全屏 Space
之上**，还必须设置 `FullScreenAuxiliary`。缺了这一位，窗口就被 macOS 留在常规 Space
里，导致"必须回桌面才看得到"。

### 改动

在 `create_tray_window()` 里 `.build()?` 之后，新增并调用
`allow_tray_window_over_fullscreen_spaces()`：

```rust
#[cfg(target_os = "macos")]
fn allow_tray_window_over_fullscreen_spaces<R: Runtime>(window: &tauri::WebviewWindow<R>) {
    use objc2::{msg_send, runtime::AnyObject};
    const FULL_SCREEN_AUXILIARY: u64 = 1 << 8;
    let Ok(ns_window) = window.ns_window() else { return; };
    let ns_window = ns_window as *mut AnyObject;
    unsafe {
        let current: u64 = msg_send![ns_window, collectionBehavior];
        let _: () = msg_send![ns_window, setCollectionBehavior: current | FULL_SCREEN_AUXILIARY];
    }
}
```

### 验证

`cargo check` 通过，`cargo test tray::` 4 个既有单测通过。

### 结果 / 新 bug

症状从"回到桌面才**看得见**"变成了"回到桌面才**打得开**"——窗口现在能被安排到全屏
Space 上，但点击后没有任何可见反应，必须回到桌面才能打开。

原因（后见之明）：`FullScreenAuxiliary` 只解决了"窗口能不能出现在全屏 Space 上"，
没解决"窗口如何成为 key window 并获得交互焦点"。原来的 macOS 分支只调了
`makeKeyAndOrderFront:`（有意避开 Tauri 的 `set_focus()`，因为它会激活整个 App、可能
把主窗口也带到前面），而 App 未激活时这个调用不足以让窗口显示并交互。

---

## Fix #2 — 临时切 `Accessory` activation policy + `activateIgnoringOtherApps:`

### 根因假设

窗口显示需要 App 处于激活（前台）状态。默认配置 `hide_dock_icon: false` 对应
`NSApplicationActivationPolicyRegular`（显示 Dock 图标）。当一个 Regular 策略的 App
在"当前全屏 Space 被其他 App 占用"的情况下尝试激活时，macOS 会把这次激活**延迟**，
直到用户手动回到常规桌面——这正是 Fix #1 之后"打不开、回桌面才打开"的机制。

`NSApplicationActivationPolicyAccessory` 策略的 App 不与 Space 系统这样冲突，所以
借用 Accessory 策略来完成激活，然后再恢复。

### 改动

`show_tray_window` 的 macOS 分支改为在 `!app_is_active` 时调用新 helper
`activate_for_tray_window(app, ns_app)`：

```rust
// show_tray_window 内（macOS 分支）
let ns_window = window.ns_window().map_err(|e| e.to_string())? as *mut AnyObject;
unsafe {
    let ns_app: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
    let app_is_active: bool = msg_send![ns_app, isActive];
    if !app_is_active {
        activate_for_tray_window(app, ns_app);
    }
    let _: () = msg_send![ns_window, makeKeyAndOrderFront: std::ptr::null::<AnyObject>()];
}
```

新增 helper `activate_for_tray_window`：若用户仍要 Dock 图标（`hide_dock_icon ==
false`），先把 policy 临时设为 `Accessory`，执行 `activateIgnoringOtherApps: true`，
然后在 400ms 后（另起线程 + `run_on_main_thread`）重新检查配置，若用户仍要 Dock 图标
再恢复为 `Regular`：

```rust
#[cfg(target_os = "macos")]
fn activate_for_tray_window<R: Runtime + 'static>(
    app: &AppHandle<R>,
    ns_app: *mut objc2::runtime::AnyObject,
) {
    use objc2::msg_send;

    const POLICY_REGULAR: isize = 0;
    const POLICY_ACCESSORY: isize = 1;
    const RESTORE_DELAY_MS: u64 = 400;

    let wants_dock_icon = !app.state::<AppState>()
        .config.lock().map(|cfg| cfg.hide_dock_icon).unwrap_or(false);

    unsafe {
        if wants_dock_icon {
            let _: bool = msg_send![ns_app, setActivationPolicy: POLICY_ACCESSORY];
        }
        let _: () = msg_send![ns_app, activateIgnoringOtherApps: true];
    }

    if wants_dock_icon {
        let app = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(RESTORE_DELAY_MS));
            let app_for_check = app.clone();
            let _ = app.run_on_main_thread(move || {
                let still_wants_dock_icon = !app_for_check.state::<AppState>()
                    .config.lock().map(|cfg| cfg.hide_dock_icon).unwrap_or(false);
                if !still_wants_dock_icon { return; }
                unsafe {
                    let ns_app: *mut objc2::runtime::AnyObject =
                        msg_send![objc2::class!(NSApplication), sharedApplication];
                    let _: bool = msg_send![ns_app, setActivationPolicy: POLICY_REGULAR];
                }
            });
        });
    }
}
```

期间修复了一个编译错误（E0505，move-while-borrowed）：在 `run_on_main_thread` 闭包前
先 `let app_for_check = app.clone();` 再使用。

### 验证

`cargo check` 通过，`cargo test tray::` 4 个单测通过。用户手动勾选/取消 Preferences
里的 "Hide Dock icon" 也验证了 policy 切换确实是关键变量。

### 结果 / 新 bug

窗口能显示、能交互了，但点击托盘图标后会出现一段**滑回桌面 Space 的动画**，小窗在
桌面 Space 上显示，而不是原地显示在当前全屏页面上。

原因（后见之明）：`activateIgnoringOtherApps:` 本身会要求窗口服务器把 App 的 "home"
Space 拉到前台。在 Accessory 策略下这次请求**不再被延迟，而是直接执行**，于是表现为
可见的 Space 切换动画。

---

## Fix #3 — 去掉 `activateIgnoringOtherApps:`，只留 `makeKeyAndOrderFront:`

### 根因假设

两次修复其实共享同一个未解决的矛盾：`activateIgnoringOtherApps:` 无论 policy 是
Regular 还是 Accessory，都会要求系统切到 App 的 "home" Space——Regular 下被静默延迟
（对应"卡住"），Accessory 下变成可见的切换动画（对应"滑动"）。

于是假设：`FullScreenAuxiliary`（Fix #1 已加）+ `makeKeyAndOrderFront:` 本身可能已经
足够让窗口原地显示并交互，完全不需要 App 级激活。

### 改动

删掉 `activate_for_tray_window` 的调用（以及整个 helper 和它的常量），macOS 分支只剩
裸的 `makeKeyAndOrderFront:`：

```rust
#[cfg(target_os = "macos")]
{
    use objc2::{msg_send, runtime::AnyObject};
    let ns_window = window.ns_window().map_err(|e| e.to_string())? as *mut AnyObject;
    unsafe {
        let _: () = msg_send![ns_window, makeKeyAndOrderFront: std::ptr::null::<AnyObject>()];
    }
}
```

### 验证

`cargo check` 通过，`cargo test tray::` 4 个单测通过。

### 结果 / 新 bug

回到 Fix #1 之后的症状：在其他全屏页面点击托盘图标**没有任何反应**，回到桌面点击才
有反应。

原因：macOS 对**后台 App 的窗口**，`makeKeyAndOrderFront:`（以及普通 `orderFront:`）
基本是空操作——App 未激活时窗口不会真正显示，直到切回该 App 所在 Space。

---

## 结论与根因

三次修复都在"要不要激活 App"这一个维度上来回横跳，每次只是把症状挪了位置：

| 版本 | 是否激活 App | 症状 |
|------|-------------|------|
| 原始 + Fix #1（只补 `FullScreenAuxiliary`） | 否（仅 `makeKeyAndOrderFront:`） | 回桌面才看得到 / 打不开 |
| Fix #2（切 Accessory + `activateIgnoringOtherApps:`） | 是（Accessory 策略） | 可用，但滑回桌面 Space 再显示 |
| Fix #3（去掉激活） | 否 | 全屏页点击无反应 |

**真正的矛盾点**：普通 `NSWindow` 要在另一个 App 的全屏 Space 上**原地显示并接收
点击**，必须让 App 被认为是前台；而让 App 变前台的标准 API
（`activateIgnoringOtherApps:` / `activate`）又会触发 Space 切换。二者在普通
`NSWindow` 架构下无法两全。

**架构结论**：Alfred、Bartender 这类真正能"盖在任意全屏 App 上"的菜单栏小窗，用的
都不是普通 `NSWindow`，而是 `NSPanel`（`nonactivatingPanel` 样式）+ 更高的窗口层级
（如 `NSPopUpMenuWindowLevel`）。这种面板可以在**不激活宿主 App、不触发 Space 切换**
的前提下接收鼠标点击。Tauri 的 `WebviewWindowBuilder` 不支持这种面板，需要手写
AppKit 代码承载 `WKWebView`，工作量明显更大。

## 当前状态

上面的 Fix #1～#3 保留为排查历史，不再代表当前代码。当前实现已经进入 Fix #4：复用
原有 Tauri WebView，将 macOS 托盘窗转换为 nonactivating `NSPanel`，并移除托盘显示路径
中的 App 全局激活。最新代码与验证状态以本文开头的“2026-09-17 修复进展”为准。
