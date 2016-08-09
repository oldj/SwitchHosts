/**
 * util
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

export function getUserHome() {
    console.log(process);
    console.log(process.platform);
    return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}
