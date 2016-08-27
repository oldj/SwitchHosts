/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

import React from 'react';
import ReactDom from 'react-dom';
import App from './components/app';

let _data = SH_Agent.getHosts();

ipcRenderer.setMaxListeners(20);

ReactDom.render(
    <App hosts={_data}/>
    , document.getElementById('app')
);
