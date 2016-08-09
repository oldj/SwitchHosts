/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

import React from 'react';
import ReactDom from 'react-dom';
import App from './components/app';
import {hosts} from './mock';
const io = require('./agent/io');

ReactDom.render(
    <App hosts={hosts}/>, document.getElementById('app')
);
