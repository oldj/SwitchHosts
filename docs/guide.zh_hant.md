# SwitchHosts 使用與開發指南

[← README](../README.zh_hant.md) · [English](guide.md)

## 數據備份

SwitchHosts 的數據文件儲存於 `~/.SwitchHosts` (Windows 下儲存使用者個人文件裡的 `.SwitchHosts` 資料夾），
v5 數據結構如下：

- `~/.SwitchHosts/manifest.json` 儲存 hosts 樹
- `~/.SwitchHosts/entries/` 儲存本機和遠端 hosts 內容
- `~/.SwitchHosts/trashcan.json` 儲存回收站項目
- `~/.SwitchHosts/internal/config.json` 儲存偏好設定
- `~/.SwitchHosts/internal/histories/` 儲存系統 hosts 和命令執行歷史

如需完整手動備份，請複製整個 `~/.SwitchHosts` 資料夾。應用程式內匯出會產生 hosts 資料備份 JSON，不包含偏好設定或歷史記錄。

## 開發及建置

### 前置要求

- [Node.js](https://nodejs.org/) 24 LTS
- [Rust](https://www.rust-lang.org/tools/install) >= 1.90
- Tauri 系統依賴，參見 [Tauri 前置要求](https://v2.tauri.app/start/prerequisites/)

### 開發

以下命令均在儲存庫根目錄執行，建置產物路徑也相對於儲存庫根目錄。

- 執行 `npm install` 安裝依賴
- 執行 `npm run tauri:dev` 啟動開發模式

### 建置及打包

- 執行 `npm run tauri:build` 進行生產建置
- 打包後的檔案位於 `./src-tauri/target/release/bundle/`

```bash
# 開發
npm run tauri:dev

# 生產建置
npm run tauri:build
```
