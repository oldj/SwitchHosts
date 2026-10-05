export const httpApiEnglish = {
  http_api_description: 'Allow Alfred and other tools to switch hosts through this API.',
  http_api_port: 'Listening port',
  http_api_save_port: 'Save port',
  http_api_reset_port: 'Restore default',
  http_api_port_help: '1–65535, default 50761. Saving takes effect without restarting.',
  http_api_port_invalid: 'Enter an integer between 1 and 65535.',
  http_api_port_clients:
    'After changing the port, update the port setting in Alfred and other tools.',
  http_api_listening: 'Listening',
  http_api_stopped: 'HTTP API is off',
  http_api_unavailable: 'HTTP API is not running',
  http_api_status_unknown: 'Unable to read HTTP API status',
  http_api_port_in_use: 'Port {0} is already in use. Try another port.',
  http_api_port_denied:
    'Access to port {0} was denied. It may be reserved by the system or require permission. Try another port.',
}

export const httpApiChinese: typeof httpApiEnglish = {
  http_api_description: '可用于 Alfred 等第三方软件切换 hosts。',
  http_api_port: '监听端口',
  http_api_save_port: '保存端口',
  http_api_reset_port: '恢复默认',
  http_api_port_help: '1–65535，默认 50761。保存后生效，无需重启。',
  http_api_port_invalid: '请输入 1–65535 之间的整数。',
  http_api_port_clients: '修改端口后，请同步更新 Alfred 等第三方工具中的端口设置。',
  http_api_listening: '正在监听',
  http_api_stopped: 'HTTP API 已关闭',
  http_api_unavailable: 'HTTP API 未运行',
  http_api_status_unknown: '无法读取 HTTP API 状态',
  http_api_port_in_use: '端口 {0} 已被占用，请尝试其他端口。',
  http_api_port_denied:
    '无法使用端口 {0}：访问被系统拒绝，可能是保留端口或权限限制。请尝试其他端口。',
}

export const httpApiTraditionalChinese: typeof httpApiEnglish = {
  http_api_description: '可用於 Alfred 等第三方軟體切換 hosts。',
  http_api_port: '監聽通訊埠',
  http_api_save_port: '儲存通訊埠',
  http_api_reset_port: '還原預設值',
  http_api_port_help: '1–65535，預設 50761。儲存後生效，無需重新啟動。',
  http_api_port_invalid: '請輸入 1–65535 之間的整數。',
  http_api_port_clients: '修改通訊埠後，請同步更新 Alfred 等第三方工具中的通訊埠設定。',
  http_api_listening: '正在監聽',
  http_api_stopped: 'HTTP API 已關閉',
  http_api_unavailable: 'HTTP API 未執行',
  http_api_status_unknown: '無法讀取 HTTP API 狀態',
  http_api_port_in_use: '通訊埠 {0} 已被占用，請嘗試其他通訊埠。',
  http_api_port_denied:
    '無法使用通訊埠 {0}：系統拒絕存取，可能是保留通訊埠或權限限制。請嘗試其他通訊埠。',
}
