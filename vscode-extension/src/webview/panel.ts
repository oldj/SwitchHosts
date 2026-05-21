import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'

import { dispatchCommand } from '../backend/commandRouter'

interface PopupMenuItem {
  label?: string
  _click_evt?: string
  enabled?: boolean
}

export function createSwitchHostsPanel(
  context: vscode.ExtensionContext,
): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    'switchhosts',
    'SwitchHosts',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'media', 'app'),
      ],
    },
  )

  panel.webview.html = getWebviewHtml(panel.webview, context.extensionUri)

  panel.webview.onDidReceiveMessage(async (message) => {
    if (!message || typeof message !== 'object') return

    if (message.type === 'invoke') {
      try {
        const result = await dispatchCommand(String(message.cmd), message.args ?? [], {
          panel,
        })
        panel.webview.postMessage({
          type: 'invokeResult',
          id: message.id,
          result,
        })
      } catch (error) {
        panel.webview.postMessage({
          type: 'invokeResult',
          id: message.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
      return
    }

    if (message.type === 'popupMenu') {
      await showPopupMenu(panel, message)
    }
  })

  return panel
}

async function showPopupMenu(
  panel: vscode.WebviewPanel,
  message: { menu_id?: string; items?: PopupMenuItem[] },
): Promise<void> {
  const menuId = String(message.menu_id ?? '')
  const items = (message.items ?? []).filter((item) => item.enabled !== false)
  const picks = items
    .map((item, index) => ({
      label: item.label ?? `Item ${index + 1}`,
      evt: item._click_evt,
    }))
    .filter((item) => item.evt)

  if (!picks.length) {
    panel.webview.postMessage({ type: 'menuClose', menu_id: menuId })
    return
  }

  const selected = await vscode.window.showQuickPick(picks, {
    placeHolder: 'SwitchHosts',
  })

  if (selected?.evt) {
    panel.webview.postMessage({ type: 'menuClick', evt: selected.evt })
  }
  panel.webview.postMessage({ type: 'menuClose', menu_id: menuId })
}

function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const appDir = path.join(extensionUri.fsPath, 'media', 'app')
  const indexPath = path.join(appDir, 'index.html')
  if (!fs.existsSync(indexPath)) {
    return `<html><body><h1>SwitchHosts</h1><p>Webview assets missing. Run <code>npm run build:vscode-extension</code>.</p></body></html>`
  }

  let html = fs.readFileSync(indexPath, 'utf8')
  const nonce = getNonce()
  const cspSource = webview.cspSource

  html = html.replace(/((?:href|src)=)"(\.\/[^"]+)"/g, (_match, attr, relPath) => {
    const normalized = relPath.replace(/^\.\//, '')
    const uri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'app', normalized))
    return `${attr}"${uri}"`
  })

  const csp = [
    "default-src 'none'",
    `style-src ${cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}' ${cspSource}`,
    `font-src ${cspSource} data:`,
    `img-src ${cspSource} data:`,
    `connect-src ${cspSource}`,
  ].join('; ')

  html = html.replace(
    '<head>',
    `<head>
    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
  )

  html = html.replace(
    '<body>',
    `<body>
    <script nonce="${nonce}">
      window.__vscodeApi = acquireVsCodeApi();
    </script>`,
  )

  return html
}

function getNonce(): string {
  let text = ''
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length))
  }
  return text
}
