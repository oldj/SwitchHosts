/**
 * actions.js
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

export const TOGGLE = 'toggle';

export function toggle(index) {
    return {type: TOGGLE, index}
}
