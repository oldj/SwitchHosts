import * as vscode from 'vscode'

import { createSwitchHostsPanel } from './webview/panel'

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('switchhosts.open', () => {
      createSwitchHostsPanel(context)
    }),
  )
}

export function deactivate() {}
