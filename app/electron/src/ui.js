/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

import React from 'react';
import ReactDom from 'react-dom';
import {createStore} from 'redux';
import {Provider} from 'react-redux';
import SHApp from './reducers';
import App from './components/app';

let _data = SH_Agent.getHosts();
let init_state = {
    list: _data.list || []
};
let store = createStore(SHApp, init_state);

ReactDom.render(
    <Provider store={store}>
        <App hosts={_data}/>
    </Provider>
    , document.getElementById('app')
);
