/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

const EventEmitter = require('events');

let event = new EventEmitter();
event.setMaxListeners(50);

exports.event = event;
