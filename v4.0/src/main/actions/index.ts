/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

export { default as ping } from './ping'

export { default as getDataFolder } from './getDataFolder'
export { default as getBasicData } from './getBasicData'

export { default as configGet } from './config/get'
export { default as configSet } from './config/set'
export { default as configAll } from './config/all'
export { default as configUpdate } from './config/update'

export { default as getPathOfSystemHosts } from './hosts/getPathOfSystemHostsPath'
export { default as getHostsContent } from './hosts/getContent'
export { default as setHostsContent } from './hosts/setContent'
export { default as refreshHosts } from './hosts/refresh'
export { default as getSystemHosts } from './hosts/getSystemHosts'
export { default as setSystemHosts } from './hosts/setSystemHosts'
export { default as getHistoryList } from './hosts/getHistoryList'
export { default as deleteHistory } from './hosts/deleteHistory'

export { default as getList } from './list/getList'
export { default as setList } from './list/setList'
export { default as getItemFromList } from './list/getItem'
export { default as moveToTrashcan } from './list/moveItemToTrashcan'
export { default as getContentOfList } from './list/getContentOfList'

export { default as getTrashcanList } from './trashcan/getList'
export { default as clearTrashcan } from './trashcan/clear'
export { default as deleteItemFromTrashcan } from './trashcan/deleteItem'
export { default as restoreItemFromTrashcan } from './trashcan/restoreItem'

export { default as openUrl } from './openUrl'
export { default as showItemInFolder } from './showItemInFolder'

export { default as migrateCheck } from './migrate/checkIfMigration'
export { default as migrateData } from './migrate/migrateData'
