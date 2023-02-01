# SwitchHosts

- [English](README.md)
- [简体中文](README.zh_hans.md)

項目主頁：[https://switchhosts.vercel.app](https://switchhosts.vercel.app)

SwitchHosts 是一個管理 hosts 檔案的應用程式，基於 [Electron](http://electron.atom.io/)
、[React](https://facebook.github.io/react/)、[Jotai](https://jotai.org/)
、[Chakra UI](https://chakra-ui.com/)、[CodeMirror](http://codemirror.net/) 等技術開發。

## 螢幕截圖

<img src="https://raw.githubusercontent.com/oldj/SwitchHosts/master/screenshots/sh_light.png" alt="Capture" width="960">

## 功能特性

- 快速切換 hosts 方案
- hosts 語法高亮顯示
- 支援從網路載入遠程 hosts 設定
- 可從系統菜單欄圖是快速切換 hosts

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
其中 `~/.SwitchHosts/data` 資料夾包含數據，`~/.SwitchHosts/config` 資料夾包含各種設定。

## 開發及建置

### 開發

- 安裝 [Node.js](https://nodejs.org/)
- 在項目根目錄 `./` 下，執行 `npm install` 指令安裝前置
- 執行 `npm run dev` 指令啟動開發服務
- 執行 `npm run start` 啟動應用程式，即可開始開發及測試

### 打包

- 推薦使用 [electron-builder](https://github.com/electron-userland/electron-builder) 進行打包
- 轉到項目根目錄 './'
- 執行 `npm run build`
- 執行 `npm run make`，如果一切順利，可在 `./dist` 目錄下找到打包後的檔案
- 首次執行可能需要花費一點時間，因為需要下載相關的前置檔案。你也可以從 [這裡](https://github.com/electron/electron/releases)
  手動下載，並儲存到 `~/.electron`目錄下。更多資訊可以參考 [Electron 文檔](http://electron.atom.io/docs/)。

```bash
# build
npm run build
# make
npm run make # the packed files will be in ./dist
```

## 版權聲明

SwitchHosts 是一個免費開源軟體，基於 Apache-2.0 開源協議發佈。
