import * as vscode from 'vscode';
import { HealthService } from './healthService';
import { DetailDisplayMode, ExtensionHealthTreeProvider, ExtensionItem } from './treeProvider';
import { showExtensionDetails } from './detailsPanel';
import { HealthInfo } from './types';

const DISPLAY_MODE_KEY = 'extensionHealth.detailDisplayMode';

// Commands are invoked both from tree item context menus (ExtensionItem) and from
// command-uri links in the details webview (a plain extension id string).
function resolveExtensionId(arg: ExtensionItem | string | undefined): string | undefined {
  return typeof arg === 'string' ? arg : arg?.info.id;
}

export function activate(context: vscode.ExtensionContext): void {
  const healthService = new HealthService(context);
  const initialDisplayMode = context.globalState.get<DetailDisplayMode>(DISPLAY_MODE_KEY, 'dropdown');
  const treeProvider = new ExtensionHealthTreeProvider(healthService, initialDisplayMode);
  void vscode.commands.executeCommand('setContext', 'extensionHealth.detailDisplay', initialDisplayMode);

  const setDisplayMode = async (mode: DetailDisplayMode) => {
    treeProvider.setDisplayMode(mode);
    await context.globalState.update(DISPLAY_MODE_KEY, mode);
    await vscode.commands.executeCommand('setContext', 'extensionHealth.detailDisplay', mode);
  };

  const view = vscode.window.createTreeView('extensionHealth.view', { treeDataProvider: treeProvider });
  context.subscriptions.push(view);

  context.subscriptions.push(
    vscode.commands.registerCommand('extensionHealth.refresh', () => treeProvider.refresh({ force: true })),

    vscode.commands.registerCommand('extensionHealth.showDetails', (info: HealthInfo) => showExtensionDetails(info)),

    vscode.commands.registerCommand('extensionHealth.openInMarketplace', (arg?: ExtensionItem | string) => {
      const id = resolveExtensionId(arg);
      if (!id) {
        return;
      }
      vscode.env.openExternal(vscode.Uri.parse(`https://marketplace.visualstudio.com/items?itemName=${id}`));
    }),

    vscode.commands.registerCommand('extensionHealth.uninstall', async (arg?: ExtensionItem | string) => {
      const id = resolveExtensionId(arg);
      if (!id) {
        return;
      }
      const confirmed = await vscode.window.showWarningMessage(`Uninstall "${id}"?`, { modal: true }, 'Uninstall');
      if (confirmed === 'Uninstall') {
        await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', id);
        await treeProvider.refresh({ force: true });
      }
    }),

    vscode.commands.registerCommand('extensionHealth.setGithubToken', async () => {
      const token = await vscode.window.showInputBox({
        prompt: 'GitHub personal access token (used only to raise the API rate limit for last-commit lookups)',
        password: true,
        ignoreFocusOut: true,
      });
      if (token) {
        await healthService.setGithubToken(token);
        vscode.window.showInformationMessage('Extension Health: GitHub token saved.');
      }
    }),

    vscode.commands.registerCommand('extensionHealth.showInline', () => setDisplayMode('inline')),
    vscode.commands.registerCommand('extensionHealth.showDropdown', () => setDisplayMode('dropdown')),

    vscode.extensions.onDidChange(() => treeProvider.refresh())
  );

  void treeProvider.refresh();
}

export function deactivate(): void {
  // no-op
}
