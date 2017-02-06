/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

import React from 'react';
import ReactDom from 'react-dom';
import App from './components/app';

ipcRenderer.setMaxListeners(20);

ReactDom.render(
    <App/>
    , document.getElementById('app')
);
