/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

const EventEmitter = require('events');

let event = new EventEmitter();
event.setMaxListeners(20);

exports.event = event;
