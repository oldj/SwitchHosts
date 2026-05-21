import * as vscode from 'vscode'

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('switchhosts.open', () => {
      const panel = vscode.window.createWebviewPanel(
        'switchhosts',
        'SwitchHosts',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        },
      )

      panel.webview.html = getWebviewContent()
    }),
  )
}

function getWebviewContent(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SwitchHosts</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        margin: 0;
        padding: 24px;
        color: #333;
        background: #fafafa;
      }
      h1 {
        margin-top: 0;
        color: #0066cc;
      }
      p {
        line-height: 1.6;
      }
      .card {
        padding: 20px;
        border-radius: 12px;
        background: #fff;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
        max-width: 780px;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>SwitchHosts VS Code 扩展</h1>
      <p>扩展已安装并可打包为 VS Code 插件。</p>
      <p>当前版本提供基础面板占位页，后续可将现有应用功能移植到该扩展中。</p>
      <p>使用命令面板运行 <code>SwitchHosts: Open</code>。</p>
    </div>
  </body>
</html>`
}

export function deactivate() {}
