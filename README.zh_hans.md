<div align="center" markdown="1">
  <sup>Special thanks to:</sup>
  <br>
  <a href="https://go.warp.dev/SwitchHosts">
    <img alt="Warp sponsorship" width="400" src="https://github.com/user-attachments/assets/bb4a0222-12bf-4c79-bb80-a8ed4672b801" />
  </a>

### [Warp, the intelligent terminal for developers](https://go.warp.dev/SwitchHosts)
[Available for MacOS, Linux, & Windows](https://go.warp.dev/SwitchHosts)<br>

</div>

---

# SwitchHosts

轻松管理和切换 hosts 文件，基于 [Tauri](https://tauri.app/) 和 [React](https://react.dev/) 构建。

[项目主页](https://switchhosts.app) · [English](README.md) · [繁體中文](README.zh_hant.md) · [Polski](README.pl.md) · [Türkçe](README.tr.md)

<img src="./screenshots/sh_light.png" alt="SwitchHosts 截图" width="978">

## 功能特性

- 管理本地和远程 hosts，支持组合与文件夹
- 从主窗口或系统托盘快速切换 hosts
- 支持语法高亮、查找和替换
- 自动刷新远程 hosts，导入与导出备份

## 下载

前往 [GitHub Releases](https://github.com/oldj/SwitchHosts/releases) 下载，或在 Windows 上通过 [Chocolatey](https://community.chocolatey.org/packages/switchhosts) 安装：`choco install switchhosts`。

## 文档与开发

编辑 hosts、数据备份、本地 HTTP API 和构建环境要求详见[使用与开发指南](docs/guide.zh_hans.md)。

```bash
npm install
npm run tauri:dev    # 开发
npm run tauri:build  # 生产构建
```

## 版权

SwitchHosts 是一个免费开源软件，基于 Apache-2.0 协议发布。
