# SwitchHosts VS Code Extension

这是 `SwitchHosts` 的 VS Code 扩展，通过 **Rust WASM** 复用与 Tauri 桌面版相同的业务逻辑（`src-tauri/crates/switchhosts-core`）。

## 架构

```
src-tauri/crates/switchhosts-core   ← 纯业务逻辑（normalize、aggregate、tree_format）
         ↑                    ↑
         │                    │
  src-tauri (Tauri)    switchhosts-wasm → vscode-extension/wasm/pkg
```

- **Tauri**：`switchhosts-core` + 原生文件 I/O / 系统 hosts 写入
- **VS Code**：`switchhosts-wasm` + Node.js 读写 `~/.SwitchHosts`

## 使用

在项目根目录：

```bash
# 编译 WASM 并构建扩展
npm run build:vscode-extension

# 生成 VSIX
npm run package:vscode-extension
```

仅编译 WASM：

```bash
npm run build:wasm
```

依赖：`rustup`、`wasm32-unknown-unknown` target、`wasm-pack`（脚本会自动安装）。

## 当前能力

- WASM 健康检查（`ping`）
- 从 `~/.SwitchHosts` 读取 manifest / entries
- 使用与桌面版相同的 Rust 逻辑聚合已选 hosts 并预览
- manifest 树格式互转（`legacy_root_to_v5` / `v5_root_to_legacy`）

后续可将更多 `switchhosts-core` 模块（如 find/replace 纯计算部分）继续导出到 WASM。

## 命令

命令面板运行 **SwitchHosts: Open** 打开 Webview 面板。
