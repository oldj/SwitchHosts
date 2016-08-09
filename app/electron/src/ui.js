/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

import React from 'react';
import ReactDom from 'react-dom';
import App from './components/app';

ReactDom.render(
    <App hosts={SH_Agent.getHosts()}/>, document.getElementById('app')
);
