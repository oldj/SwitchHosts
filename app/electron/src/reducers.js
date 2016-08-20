/**
 * reducers.js
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

import {combineReducers} from 'redux';
import {TOGGLE} from './actions';

function list(state = [], action) {
    switch (action.type) {
        case TOGGLE:
            return state.map((item, idx) => {
                return Object.assign({}, item, idx == action.index ? {on: !item.on} : {});
            });
        default:
            return state;
    }
}

const SHApp = combineReducers({
    // sys: (state = {}) => state,
    list
});

export default SHApp;
