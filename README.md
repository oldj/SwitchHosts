# SwitchHosts!

 - [简体中文](README_cn.md)

Homepage: [https://oldj.github.io/SwitchHosts/](https://oldj.github.io/SwitchHosts/)

SwitchHosts! is an App for managing hosts file, it is based on [Electron](http://electron.atom.io/), [React](https://facebook.github.io/react/), [Ant Design](https://ant.design), [CodeMirror](http://codemirror.net/), etc.

## Screenshot

<img src="https://raw.githubusercontent.com/oldj/SwitchHosts/master/screenshots/sh_light.png" alt="Capture" width="960">


## Features

 - Switch hosts quickly
 - Syntax highlight
 - Remote hosts
 - Switch from system tray
 - macOS only: [Alfred workflow](http://www.packal.org/workflow/switchhosts) support


## Install

### Download

You can download the source code and build it yourself, or download the built version from following links:

 - [SwitchHosts! Download Page (GitHub release)](https://github.com/oldj/SwitchHosts/releases)

### brew

On macOS you can install SwitchHosts! by `brew cask`:

```bash
brew cask install switchhosts
```

Thanks to [@gobinathm](https://github.com/gobinathm) and [@iamybj](https://github.com/iamybj) for updating the `brew cask` version.

### scoop

On Windows you can install SwitchHosts! by [scoop](https://scoop.sh/):

```
scoop install switchhosts
```

Thanks to [@batkiz](https://github.com/batkiz) for updating the `scoop` version.

## Backup

SwitchHosts! stores data at `~/.SwitchHosts` (Or folder `.SwitchHosts` under the current user's home path on Windows), the `~/.SwitchHosts/data.json` contains data, while the `~/.SwitchHosts/preferences.json` contains preferences info.


## Run and Build

### Environment

 - Install [Node.js](https://nodejs.org/)
 - Change to the folder `./`, run `npm install` to install dependented libraries
 - Change to the folder `./app`, run `npm install` again

    ```bash
    npm install
    cd app && npm install && cd ..
    ```

### Build and run

 - Change to the folder `./`, run `npm run dll` to build common files
 - Change to the folder `./`, run `npm run build`
 - Change to the folder `./`, run `npm start`, the App should start

    ```bash
    # create dll file
    npm run dll
 
    # build
    npm run build

    # start
    npm start

    # or start in developer mode
    npm run dev
    ```

### Package

 - It is recommended to use [electron-builder](https://github.com/electron-userland/electron-builder) for packaging.
 - Go to the `./` folder, run `npm run make` . The packaged files will be in the `./dist` folder.
 - This command may take several minutes to finish when you run it the first time, as it needs time to download dependent files. You can download the dependencies manually [here](https://github.com/electron/electron/releases), or [Taobao mirror](https://npm.taobao.org/mirrors/electron/), then save the files to `~/.electron`. You can check the [Electron Docs](http://electron.atom.io/docs/) for more infomation.

    ```bash
    # pack
    npm run make # the packed files will be in ./dist

    # or 
    npm run build-and-make
    ```

## Copyright

SwitchHosts! is a free and open source software, it is released under the MIT license.
