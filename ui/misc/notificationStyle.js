/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

// 参考：https://github.com/igorprado/react-notification-system/blob/master/src/styles.js

export default {
  NotificationItem: { // Override the notification item
    DefaultStyle: { // Applied to every notification, regardless of the notification level
      'border-radius': 0
    },

    success: { // Applied only to the success notification item
      color: 'red'
    }
  }
}
