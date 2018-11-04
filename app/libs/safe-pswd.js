/**
 * safe-pswd
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

module.exports = pswd => {
    return pswd
        .replace(/\\/g, '\\\\')
        //.replace(/'/g, "\\''")
        .replace(/'/g, '\\x27')
}
