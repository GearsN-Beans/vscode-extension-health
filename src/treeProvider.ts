import * as vscode from 'vscode';
import { HealthInfo, HealthStatus } from './types';
import { HealthService } from './healthService';

export type DetailDisplayMode = 'inline' | 'dropdown';

const GROUP_ORDER: Array<{ status: HealthStatus; label: string; description: string; icon: string; color: string }> = [
  {
    status: 'deprecated',
    label: 'Deprecated',
    description: 'Flagged as deprecated by the publisher on the Marketplace.',
    icon: 'error',
    color: 'charts.red',
  },
  {
    status: 'stale',
    label: 'Stale',
    description: 'No Marketplace update within the configured staleness window.',
    icon: 'warning',
    color: 'charts.yellow',
  },
  {
    status: 'disabled',
    label: 'Disabled but installed',
    description: 'Installed on disk but currently disabled in VS Code.',
    icon: 'circle-slash',
    color: 'charts.orange',
  },
  {
    status: 'healthy',
    label: 'Healthy',
    description: 'Enabled and recently updated on the Marketplace.',
    icon: 'pass',
    color: 'charts.green',
  },
];

function formatRelativeDate(iso: string | undefined): string | undefined {
  if (!iso) {
    return undefined;
  }
  const days = Math.round((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (days < 30) {
    return `${days}d ago`;
  }
  if (days < 365) {
    return `${Math.round(days / 30)}mo ago`;
  }
  return `${Math.round(days / 365)}y ago`;
}

function buildDetailText(info: HealthInfo): string | undefined {
  const relative = formatRelativeDate(info.lastUpdated);
  if (relative) {
    return info.enabled ? `Updated ${relative}` : `Updated ${relative} · disabled`;
  }
  return info.enabled ? undefined : 'Disabled';
}

class GroupItem extends vscode.TreeItem {
  constructor(label: string, description: string, icon: string, color: string, public readonly children: HealthInfo[]) {
    super(`${label} (${children.length})`, vscode.TreeItemCollapsibleState.Expanded);
    this.tooltip = description;
    this.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor(color));
    this.contextValue = 'extensionHealthGroup';
  }
}

export class ExtensionItem extends vscode.TreeItem {
  readonly detailText: string | undefined;

  constructor(public readonly info: HealthInfo, mode: DetailDisplayMode) {
    const detailText = buildDetailText(info);
    const showAsChild = mode === 'dropdown' && Boolean(detailText);
    super(info.displayName, showAsChild ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    this.detailText = detailText;
    this.description = mode === 'inline' ? detailText : undefined;
    this.tooltip = ExtensionItem.buildTooltip(info);
    this.contextValue = 'extensionItem';
    this.iconPath = info.iconPath ? vscode.Uri.file(info.iconPath) : new vscode.ThemeIcon('extensions');
    this.command = { command: 'extensionHealth.showDetails', title: 'Show Details', arguments: [info] };
  }

  private static buildTooltip(info: HealthInfo): string {
    const lines = [info.id, `Version: ${info.version}`, `Enabled: ${info.enabled}`];
    if (info.lastUpdated) {
      lines.push(`Marketplace last updated: ${new Date(info.lastUpdated).toLocaleDateString()}`);
    }
    if (info.lastCommitDate) {
      lines.push(`GitHub last commit: ${new Date(info.lastCommitDate).toLocaleDateString()}`);
    }
    if (info.deprecated) {
      lines.push(`Deprecated${info.deprecationMessage ? `: ${info.deprecationMessage}` : ''}`);
    }
    if (typeof info.installCount === 'number') {
      lines.push(`Installs: ${info.installCount.toLocaleString()}`);
    }
    return lines.join('\n');
  }
}

class LoadingItem extends vscode.TreeItem {
  constructor() {
    super('Loading extension health…', vscode.TreeItemCollapsibleState.None);
  }
}

class DetailItem extends vscode.TreeItem {
  constructor(text: string) {
    super(text, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'extensionHealthDetail';
  }
}

export type ExtensionHealthTreeNode = GroupItem | ExtensionItem | LoadingItem | DetailItem;

export class ExtensionHealthTreeProvider implements vscode.TreeDataProvider<ExtensionHealthTreeNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private healthInfo: HealthInfo[] = [];
  private loading = false;

  constructor(private readonly healthService: HealthService, private displayMode: DetailDisplayMode) {}

  setDisplayMode(mode: DetailDisplayMode): void {
    this.displayMode = mode;
    this.onDidChangeTreeDataEmitter.fire();
  }

  async refresh(options: { force?: boolean } = {}): Promise<void> {
    this.loading = true;
    this.onDidChangeTreeDataEmitter.fire();
    try {
      this.healthInfo = await this.healthService.getHealthInfo(options);
    } finally {
      this.loading = false;
      this.onDidChangeTreeDataEmitter.fire();
    }
  }

  getTreeItem(element: ExtensionHealthTreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ExtensionHealthTreeNode): ExtensionHealthTreeNode[] {
    if (element instanceof GroupItem) {
      return element.children
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
        .map((info) => new ExtensionItem(info, this.displayMode));
    }

    if (element instanceof ExtensionItem) {
      return this.displayMode === 'dropdown' && element.detailText ? [new DetailItem(element.detailText)] : [];
    }

    if (this.loading && this.healthInfo.length === 0) {
      return [new LoadingItem()];
    }

    return GROUP_ORDER.filter((group) => this.healthInfo.some((info) => info.status === group.status)).map(
      (group) =>
        new GroupItem(
          group.label,
          group.description,
          group.icon,
          group.color,
          this.healthInfo.filter((info) => info.status === group.status)
        )
    );
  }
}
