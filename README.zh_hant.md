<div align="center" markdown="1">
  <sup>Special thanks to:</sup>
  <br>
  <a href="https://go.warp.dev/SwitchHosts">
    <img alt="Warp sponsorship" width="400" src="https://github.com/user-attachments/assets/352a755a-6776-43fd-b324-19dc649747b2" />
  </a>

### [Warp, the intelligent terminal for developers](https://go.warp.dev/SwitchHosts)

[Available for MacOS, Linux, & Windows](https://go.warp.dev/SwitchHosts)<br>

</div>

---

# SwitchHosts

- [English](README.md)
- [Polski](README.pl.md)
- [简体中文](README.zh_hans.md)

項目主頁：[https://switchhosts.vercel.app](https://switchhosts.vercel.app)

SwitchHosts 是一個管理 hosts 檔案的應用程式，基於 [Tauri](https://tauri.app/)、[React](https://facebook.github.io/react/)、[Jotai](https://jotai.org/)、[Mantine](https://mantine.dev/) 等技術開發。

## 螢幕截圖

<img src="https://raw.githubusercontent.com/oldj/SwitchHosts/master/screenshots/sh_light.png" alt="Capture" width="960">

## 功能特性

- 管理系統、本機、遠端、組合和資料夾 hosts 項目
- 可在主視窗或系統選單列圖示快速切換 hosts 方案
- hosts 檔案語法高亮顯示
- 跨 hosts 項目尋找和取代
- 支援手動、定時或啟動時重新整理遠端 hosts
- 匯入/匯出 hosts 資料，並支援從 URL 匯入備份
- 將項目移入回收站，並可稍後還原或永久刪除
- 偏好設定支援寫入模式、代理、更新檢查、開機啟動、套用後命令和本機 HTTP API

## 安裝

### 下載

你可以下載原始碼並自行建置，也可以從以下網址下載已經建置好的版本：

- [SwitchHosts Download Page (GitHub release)](https://github.com/oldj/SwitchHosts/releases)

你也可以通過 [Chocolatey 包管理器](https://community.chocolatey.org/packages/switchhosts)安裝已經建置好的版本：

```powershell
choco install switchhosts
```

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

- [Node.js](https://nodejs.org/)
- [Rust](https://www.rust-lang.org/tools/install)
- Tauri 系統依賴，參見 [Tauri 前置要求](https://v2.tauri.app/start/prerequisites/)

### 開發

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

## 版權聲明

SwitchHosts 是一個免費開源軟體，基於 Apache-2.0 開源協議發佈。
