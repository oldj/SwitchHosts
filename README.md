# SwitchHosts!

 - [简体中文](README_cn.md)

Homepage: [https://oldj.github.io/SwitchHosts/](https://oldj.github.io/SwitchHosts/)

SwitchHosts! is an App for managing hosts file, it is based on [Electron](http://electron.atom.io/), [React](https://facebook.github.io/react/), and [Ant Design](https://ant.design), [CodeMirror](http://codemirror.net/), etc.

## Screenshot

<img src="https://raw.githubusercontent.com/oldj/SwitchHosts/master/assets/capture.png" alt="Capture" width="980" style="border:1px solid #979797;">


## Features

 - Switch hosts quickly
 - Syntax highlight
 - Remote hosts
 - Switch from system tray
 - macOS only: [Alfred workflow](http://www.packal.org/workflow/switchhosts) support


## Install

### Download

You can download the source code and build it yourself, or download the built version from following links:

 - [SwitchHosts! Download Page 1 (GitHub release)](https://github.com/oldj/SwitchHosts/releases)
 - [SwitchHosts! Download Page 2 (Baidu Yunpan)](http://pan.baidu.com/share/link?shareid=150951&uk=3607385901)

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

SwitchHosts! stores data at `~/.SwitchHosts` (Or folder `.SwitchHosts` under the current user's home path on Windows), the `~/.SwitchHosts/data.json` contains data, while the `~/.SwitchHosts/prefereces.json` contains preferences info.


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

### Package and Zip

 - It is recommended to use [electron-packager](https://github.com/electron-userland/electron-packager) for packaging.

    ```bash
    # install electron-packager for use from cli
    npm install electron-packager -g
    ```

 - Go to the `./` folder, run `npm run pack` . The packaged file will be the `./dist` folder.
 - This command may take several minutes to finish when you run it the first time, as it needs time to download dependent files. You can download the dependencies manually [here](https://github.com/electron/electron/releases), or [Taobao mirror](https://npm.taobao.org/mirrors/electron/), then save the files to `~/.electron`. You can check the [Electron Docs](http://electron.atom.io/docs/) for more infomation.

    ```bash
    # pack
    npm run pack  # the packed files will be in ./dist

    # or pack for a special platform
    npm run pack-mac  # pack for macOS, the packed files will be in ./dist
    npm run pack-win  # pack for Windows, the packed files will be in ./dist
    ```

 - After packaging, you can make a zip file by running the following command.

    ```bash
    # zip
    npm run zip  # the zipped files will be in ./dist
    ```


## Copyright

SwitchHosts! is a free and open source software, it is released under the MIT license.
