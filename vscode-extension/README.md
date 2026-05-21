# SwitchHosts VS Code Extension

VS Code 扩展版 SwitchHosts，UI 与 Tauri 桌面版相同，业务逻辑通过 Rust WASM（`switchhosts-core`）与 Extension Host 共享。

## 构建

在项目根目录：

```bash
npm run package:vscode-extension
```

产出：`vscode-extension/switchhosts-vscode-5.0.0.vsix`

## 安装测试

```bash
code --install-extension vscode-extension/switchhosts-vscode-5.0.0.vsix
```

或在 VS Code：**扩展 → … → 从 VSIX 安装**

命令面板运行 **SwitchHosts: Open** 打开完整 UI。

## 架构

- `media/app/` — Vite 构建的 React UI（`vite.vscode.config.mts`）
- `src/renderer/core/agent.vscode.ts` — Webview 侧 Tauri agent 替代
- `src/backend/` — Node 存储层 + command 路由（对应 Tauri `commands.rs`）
- `wasm/pkg/` — `switchhosts-wasm` 产物

数据目录与桌面版相同：`~/.SwitchHosts`

## 当前能力

- 完整主界面（列表、编辑、偏好、回收站、Apply）
- 导入/导出 v5 备份 JSON
- Find 页基础搜索（替换/远程刷新/自动更新在扩展版中降级或暂不可用）
