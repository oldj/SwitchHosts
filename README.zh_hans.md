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
- [繁體中文](README.zh_hant.md)

项目主页：[https://switchhosts.vercel.app](https://switchhosts.vercel.app)

SwitchHosts 是一个管理 hosts 文件的应用，基于 [Tauri](https://tauri.app/)、[React](https://facebook.github.io/react/)、[Jotai](https://jotai.org/)、[Mantine](https://mantine.dev/) 等技术开发。

## 截图

<img src="https://raw.githubusercontent.com/oldj/SwitchHosts/master/screenshots/sh_light.png" alt="Capture" width="960">

## 功能特性

- 管理系统、本地、远程、组合和文件夹 hosts 条目
- 可在主窗口或系统托盘快速切换 hosts 方案
- hosts 文件语法高亮
- 跨 hosts 条目查找和替换
- 支持手动、定时或启动时刷新远程 hosts
- 导入/导出 hosts 数据，并支持从 URL 导入备份
- 将条目移入回收站，并可稍后恢复或彻底删除
- 偏好设置支持写入模式、代理、更新检查、开机启动、应用后命令和本地 HTTP API

## 安装

### 下载

你可以下载源码并自行构建，也可以从以下地址下载已构建好的版本：

- [SwitchHosts Download Page (GitHub release)](https://github.com/oldj/SwitchHosts/releases)

你也可以通过 [Chocolatey 包管理器](https://community.chocolatey.org/packages/switchhosts)安装已构建好的版本：
```powershell
choco install switchhosts
```

## 数据备份

SwitchHosts 的数据文件存储于 `~/.SwitchHosts` (Windows 下存储于用户个人文件夹下的 `.SwitchHosts` 文件夹），
v5 数据结构如下：

- `~/.SwitchHosts/manifest.json` 存储 hosts 树
- `~/.SwitchHosts/entries/` 存储本地和远程 hosts 内容
- `~/.SwitchHosts/trashcan.json` 存储回收站条目
- `~/.SwitchHosts/internal/config.json` 存储偏好设置
- `~/.SwitchHosts/internal/histories/` 存储系统 hosts 和命令运行历史

如需完整手动备份，请复制整个 `~/.SwitchHosts` 文件夹。应用内导出会生成 hosts 数据备份 JSON，不包含偏好设置或历史记录。

## 开发以及构建

### 前置要求

- [Node.js](https://nodejs.org/)
- [Rust](https://www.rust-lang.org/tools/install)
- Tauri 系统依赖，参见 [Tauri 前置要求](https://v2.tauri.app/start/prerequisites/)

### 开发

- 运行 `npm install` 安装依赖
- 运行 `npm run tauri:dev` 启动开发模式

### 构建及打包

- 运行 `npm run tauri:build` 进行生产构建
- 打包后的文件位于 `./src-tauri/target/release/bundle/`

```bash
# 开发
npm run tauri:dev

# 生产构建
npm run tauri:build
```

## 版权

SwitchHosts 是一个免费开源软件，基于 Apache-2.0 协议发布。
