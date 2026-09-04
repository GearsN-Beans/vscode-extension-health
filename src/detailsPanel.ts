import * as vscode from 'vscode';
import { HealthInfo } from './types';

const panelsById = new Map<string, vscode.WebviewPanel>();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function commandUri(command: string, arg: string): string {
  return `command:${command}?${encodeURIComponent(JSON.stringify([arg]))}`;
}

function renderHtml(info: HealthInfo): string {
  const rows: string[] = [
    `<div class="row"><span class="label">Identifier</span><span>${escapeHtml(info.id)}</span></div>`,
    `<div class="row"><span class="label">Version</span><span>${escapeHtml(info.version)}</span></div>`,
    `<div class="row"><span class="label">Enabled</span><span>${info.enabled ? 'Yes' : 'No'}</span></div>`,
  ];

  if (info.lastUpdated) {
    rows.push(
      `<div class="row"><span class="label">Marketplace last updated</span><span>${escapeHtml(
        new Date(info.lastUpdated).toLocaleDateString()
      )}</span></div>`
    );
  }
  if (info.lastCommitDate) {
    rows.push(
      `<div class="row"><span class="label">GitHub last commit</span><span>${escapeHtml(
        new Date(info.lastCommitDate).toLocaleDateString()
      )}</span></div>`
    );
  }
  if (typeof info.installCount === 'number') {
    rows.push(`<div class="row"><span class="label">Installs</span><span>${info.installCount.toLocaleString()}</span></div>`);
  }

  const banner = info.deprecated
    ? `<div class="banner deprecated">Deprecated${
        info.deprecationMessage ? `: ${escapeHtml(info.deprecationMessage)}` : ''
      }</div>`
    : info.status === 'stale'
      ? `<div class="banner stale">No Marketplace update in a while — may be unmaintained.</div>`
      : info.status === 'disabled'
        ? `<div class="banner disabled">Installed but currently disabled.</div>`
        : '';

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';" />
  <style>
    body { font-family: var(--vscode-font-family); padding: 24px; color: var(--vscode-foreground); }
    h1 { margin-bottom: 4px; }
    .subtitle { color: var(--vscode-descriptionForeground); margin-bottom: 20px; }
    .banner { padding: 10px 14px; border-radius: 4px; margin-bottom: 16px; }
    .banner.deprecated { background: var(--vscode-inputValidation-errorBackground); border: 1px solid var(--vscode-inputValidation-errorBorder); }
    .banner.stale { background: var(--vscode-inputValidation-warningBackground); border: 1px solid var(--vscode-inputValidation-warningBorder); }
    .banner.disabled { background: var(--vscode-inputValidation-infoBackground); border: 1px solid var(--vscode-inputValidation-infoBorder); }
    .row { display: flex; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--vscode-widget-border); }
    .label { width: 220px; color: var(--vscode-descriptionForeground); }
    .actions { margin-top: 24px; display: flex; gap: 12px; }
    a.button {
      display: inline-block; padding: 6px 14px; border-radius: 2px; text-decoration: none;
      background: var(--vscode-button-background); color: var(--vscode-button-foreground);
    }
    a.button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  </style>
</head>
<body>
  <h1>${escapeHtml(info.displayName)}</h1>
  <div class="subtitle">${escapeHtml(info.id)}</div>
  ${banner}
  ${rows.join('\n')}
  <div class="actions">
    <a class="button" href="${commandUri('extensionHealth.openInMarketplace', info.id)}">Open in Marketplace</a>
    <a class="button secondary" href="${commandUri('extensionHealth.uninstall', info.id)}">Uninstall</a>
  </div>
</body>
</html>`;
}

/** Opens (or reveals an already-open) details panel for the given extension in the main editor area. */
export function showExtensionDetails(info: HealthInfo): void {
  const existing = panelsById.get(info.id);
  if (existing) {
    existing.webview.html = renderHtml(info);
    existing.reveal(vscode.ViewColumn.One);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'extensionHealth.details',
    info.displayName,
    vscode.ViewColumn.One,
    { enableScripts: false, enableCommandUris: true }
  );
  panel.webview.html = renderHtml(info);
  panelsById.set(info.id, panel);
  panel.onDidDispose(() => panelsById.delete(info.id));
}
