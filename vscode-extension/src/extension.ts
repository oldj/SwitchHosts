import * as vscode from 'vscode'

import {
  getAggregatedHostsContent,
  getBasicData,
  initWasm,
  type HostNode,
} from './core/wasmBridge'

let wasmReady: Promise<void> | undefined

function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = initWasm()
  }
  return wasmReady
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('switchhosts.open', async () => {
      try {
        await ensureWasm()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        vscode.window.showErrorMessage(`SwitchHosts WASM 初始化失败: ${message}`)
        return
      }

      const panel = vscode.window.createWebviewPanel(
        'switchhosts',
        'SwitchHosts',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        },
      )

      panel.webview.html = getWebviewContent(panel.webview, context.extensionUri)

      panel.webview.onDidReceiveMessage(async (message) => {
        if (message?.type !== 'getPreview') {
          return
        }
        try {
          await ensureWasm()
          const basic = getBasicData()
          const content = getAggregatedHostsContent(basic.list)
          panel.webview.postMessage({
            type: 'preview',
            wasmPing: basic.wasmPing,
            dataDir: basic.dataDir,
            listCount: countNodes(basic.list),
            content,
          })
        } catch (error) {
          const text = error instanceof Error ? error.message : String(error)
          panel.webview.postMessage({ type: 'error', message: text })
        }
      })
    }),
  )
}

function countNodes(nodes: HostNode[]): number {
  let count = 0
  for (const node of nodes) {
    count += 1
    if (node.children?.length) {
      count += countNodes(node.children)
    }
  }
  return count
}

function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = getNonce()
  const cspSource = webview.cspSource

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SwitchHosts</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        margin: 0;
        padding: 24px;
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
      }
      h1 { margin-top: 0; }
      .card {
        padding: 20px;
        border-radius: 12px;
        background: var(--vscode-editorWidget-background);
        border: 1px solid var(--vscode-widget-border, transparent);
        max-width: 960px;
      }
      pre {
        white-space: pre-wrap;
        word-break: break-word;
        padding: 12px;
        border-radius: 8px;
        background: var(--vscode-textCodeBlock-background);
        font-size: 12px;
        line-height: 1.5;
        max-height: 420px;
        overflow: auto;
      }
      .meta { opacity: 0.85; font-size: 13px; }
      .error { color: var(--vscode-errorForeground); }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>SwitchHosts VS Code 扩展</h1>
      <p class="meta">业务逻辑由 Rust WASM 提供（与 Tauri 桌面版共享 <code>switchhosts-core</code>）。</p>
      <p id="status" class="meta">正在加载预览…</p>
      <h2>已选 Hosts 聚合预览</h2>
      <pre id="preview">（等待 WASM 聚合结果）</pre>
    </div>
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      window.addEventListener('message', (event) => {
        const msg = event.data;
        const status = document.getElementById('status');
        const preview = document.getElementById('preview');
        if (msg.type === 'preview') {
          status.textContent = 'WASM ping: ' + msg.wasmPing + ' · 数据目录: ' + msg.dataDir + ' · 节点数: ' + msg.listCount;
          preview.textContent = msg.content || '（无已选 hosts 内容）';
        } else if (msg.type === 'error') {
          status.innerHTML = '<span class="error">错误: ' + msg.message + '</span>';
        }
      });
      vscode.postMessage({ type: 'getPreview' });
    </script>
  </body>
</html>`
}

function getNonce(): string {
  let text = ''
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length))
  }
  return text
}

export function deactivate() {}
