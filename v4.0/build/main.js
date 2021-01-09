/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, { enumerable: true, get: getter });
/******/ 		}
/******/ 	};
/******/
/******/ 	// define __esModule on exports
/******/ 	__webpack_require__.r = function(exports) {
/******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 		}
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
/******/ 	};
/******/
/******/ 	// create a fake namespace object
/******/ 	// mode & 1: value is a module id, require it
/******/ 	// mode & 2: merge all properties of value into the ns
/******/ 	// mode & 4: return value when already ns object
/******/ 	// mode & 8|1: behave like require
/******/ 	__webpack_require__.t = function(value, mode) {
/******/ 		if(mode & 1) value = __webpack_require__(value);
/******/ 		if(mode & 8) return value;
/******/ 		if((mode & 4) && typeof value === 'object' && value && value.__esModule) return value;
/******/ 		var ns = Object.create(null);
/******/ 		__webpack_require__.r(ns);
/******/ 		Object.defineProperty(ns, 'default', { enumerable: true, value: value });
/******/ 		if(mode & 2 && typeof value != 'string') for(var key in value) __webpack_require__.d(ns, key, function(key) { return value[key]; }.bind(null, key));
/******/ 		return ns;
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = "./src/main/main.ts");
/******/ })
/************************************************************************/
/******/ ({

/***/ "./src/main/actions/index.ts":
/*!***********************************!*\
  !*** ./src/main/actions/index.ts ***!
  \***********************************/
/*! exports provided: ping */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _ping__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./ping */ "./src/main/actions/ping.ts");
/* harmony reexport (safe) */ __webpack_require__.d(__webpack_exports__, "ping", function() { return _ping__WEBPACK_IMPORTED_MODULE_0__["default"]; });

/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */


/***/ }),

/***/ "./src/main/actions/ping.ts":
/*!**********************************!*\
  !*** ./src/main/actions/ping.ts ***!
  \**********************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/**
 * ping
 * @author: oldj
 * @homepage: https://oldj.net
 */
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/* harmony default export */ __webpack_exports__["default"] = (async (ms = 1000) => {
  await wait(ms);
  return 'pong';
});

/***/ }),

/***/ "./src/main/agent.ts":
/*!***************************!*\
  !*** ./src/main/agent.ts ***!
  \***************************/
/*! no exports provided */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var electron__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! electron */ "electron");
/* harmony import */ var electron__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(electron__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _main_actions__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @main/actions */ "./src/main/actions/index.ts");
/**
 * agent
 * @author: oldj
 * @homepage: https://oldj.net
 */



function sendBack(sender, event_name, data) {
  try {
    sender.send(event_name, ...data);
  } catch (e) {
    console.error(e);
  }
}

electron__WEBPACK_IMPORTED_MODULE_0__["ipcMain"].on('x_action', async (e, action_data) => {
  let sender = e.sender;
  let {
    action,
    data,
    callback
  } = action_data;
  let fn = _main_actions__WEBPACK_IMPORTED_MODULE_1__[action];

  if (typeof fn === 'function') {
    let params = data || [];

    if (!Array.isArray(params)) {
      params = [params];
    }

    try {
      let v = await fn(...params);
      sendBack(sender, callback, [null, v]);
    } catch (e) {
      console.error(e);
      sendBack(sender, callback, [e]);
    }
  } else {
    let e = `unknow action [${action}].`;
    console.error(e);
    sendBack(sender, callback, [e]);
  }
});

/***/ }),

/***/ "./src/main/main.ts":
/*!**************************!*\
  !*** ./src/main/main.ts ***!
  \**************************/
/*! no exports provided */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _agent__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./agent */ "./src/main/agent.ts");
/* harmony import */ var _root_version_json__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @root/version.json */ "./src/version.json");
var _root_version_json__WEBPACK_IMPORTED_MODULE_1___namespace = /*#__PURE__*/__webpack_require__.t(/*! @root/version.json */ "./src/version.json", 1);
/* harmony import */ var electron__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! electron */ "electron");
/* harmony import */ var electron__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(electron__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var path__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! path */ "path");
/* harmony import */ var path__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(path__WEBPACK_IMPORTED_MODULE_3__);
/* harmony import */ var url__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! url */ "url");
/* harmony import */ var url__WEBPACK_IMPORTED_MODULE_4___default = /*#__PURE__*/__webpack_require__.n(url__WEBPACK_IMPORTED_MODULE_4__);





let win;

const createWindow = async () => {
  win = new electron__WEBPACK_IMPORTED_MODULE_2__["BrowserWindow"]({
    width: 800,
    height: 600,
    webPreferences: {
      contextIsolation: true,
      preload: path__WEBPACK_IMPORTED_MODULE_3__["join"](__dirname, 'preload.js'),
      spellcheck: true
    }
  });

  if (true) {
    process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = '1'; // eslint-disable-line require-atomic-updates

    win.loadURL(`http://127.0.0.1:8084`);
  } else {}

  if (true) {
    // Open DevTools, see https://github.com/electron/electron/issues/12438 for why we wait for dom-ready
    win.webContents.once('dom-ready', () => {
      win.webContents.openDevTools();
    });
  }

  win.on('closed', () => {
    win = null;
  });
};

electron__WEBPACK_IMPORTED_MODULE_2__["app"].on('ready', async () => {
  console.log(`VERSION: ${_root_version_json__WEBPACK_IMPORTED_MODULE_1__.join('.')}`);
  await createWindow();
});
electron__WEBPACK_IMPORTED_MODULE_2__["app"].on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    electron__WEBPACK_IMPORTED_MODULE_2__["app"].quit();
  }
});
electron__WEBPACK_IMPORTED_MODULE_2__["app"].on('activate', () => {
  if (win === null) {
    createWindow();
  }
});

/***/ }),

/***/ "./src/version.json":
/*!**************************!*\
  !*** ./src/version.json ***!
  \**************************/
/*! exports provided: 0, 1, 2, 3, default */
/***/ (function(module) {

module.exports = JSON.parse("[4,0,0,6000]");

/***/ }),

/***/ "electron":
/*!***************************!*\
  !*** external "electron" ***!
  \***************************/
/*! no static exports found */
/***/ (function(module, exports) {

module.exports = require("electron");

/***/ }),

/***/ "path":
/*!***********************!*\
  !*** external "path" ***!
  \***********************/
/*! no static exports found */
/***/ (function(module, exports) {

module.exports = require("path");

/***/ }),

/***/ "url":
/*!**********************!*\
  !*** external "url" ***!
  \**********************/
/*! no static exports found */
/***/ (function(module, exports) {

module.exports = require("url");

/***/ })

/******/ });
//# sourceMappingURL=main.js.map