import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ExtensionRecord } from './types';

// Extensions installed on disk (enabled + disabled) live here; vscode.extensions.all
// only reports *enabled* ones, so disk scan + diff is the only way to see disabled-but-installed.
function getExtensionsDir(): string {
  const portableDataDir = process.env.VSCODE_PORTABLE;
  if (portableDataDir) {
    return path.join(portableDataDir, 'extensions');
  }
  return path.join(os.homedir(), '.vscode', 'extensions');
}

async function readObsoleteSet(extensionsDir: string): Promise<Set<string>> {
  try {
    const raw = await fs.readFile(path.join(extensionsDir, '.obsolete'), 'utf8');
    const obsolete = JSON.parse(raw) as Record<string, boolean>;
    return new Set(Object.keys(obsolete).filter((key) => obsolete[key]));
  } catch {
    return new Set();
  }
}

interface ExtensionsJsonEntry {
  identifier?: { id?: string };
  relativeLocation?: string;
}

// extensions.json is VS Code's own ledger of what's actually installed (enabled + disabled).
// Folders left on disk after a failed/partial uninstall or update won't appear here, even
// though a raw directory listing would still see them — cross-referencing against it is the
// only reliable way to avoid reporting long-gone extensions as "installed".
async function readTrackedFolderNames(extensionsDir: string): Promise<Set<string> | undefined> {
  try {
    const raw = await fs.readFile(path.join(extensionsDir, 'extensions.json'), 'utf8');
    const entries = JSON.parse(raw) as ExtensionsJsonEntry[];
    const folderNames = entries.map((entry) => entry.relativeLocation).filter((name): name is string => !!name);
    return new Set(folderNames);
  } catch {
    // Missing/unreadable extensions.json (e.g. unexpected install layout) — fail open rather
    // than hiding every extension.
    return undefined;
  }
}

async function resolveIconPath(extensionPath: string, icon: unknown): Promise<string | undefined> {
  if (typeof icon !== 'string' || icon.length === 0) {
    return undefined;
  }
  const iconPath = path.join(extensionPath, icon);
  try {
    await fs.access(iconPath);
    return iconPath;
  } catch {
    return undefined;
  }
}

// Manifest fields like "displayName" are often an NLS placeholder (e.g. "%displayName%") that VS
// Code's own extension host resolves against package.nls.json — we read package.json raw, so we
// have to do that resolution ourselves or these show up to users as the literal placeholder text.
async function resolveNlsString(extensionPath: string, value: string): Promise<string> {
  const match = /^%(.+)%$/.exec(value);
  if (!match) {
    return value;
  }
  try {
    const nlsRaw = await fs.readFile(path.join(extensionPath, 'package.nls.json'), 'utf8');
    const nls = JSON.parse(nlsRaw) as Record<string, string>;
    return nls[match[1]] ?? value;
  } catch {
    return value;
  }
}

async function readExtensionRecord(extensionsDir: string, folderName: string): Promise<ExtensionRecord | undefined> {
  const extensionPath = path.join(extensionsDir, folderName);
  try {
    const stat = await fs.stat(extensionPath);
    if (!stat.isDirectory()) {
      return undefined;
    }
    const pkgRaw = await fs.readFile(path.join(extensionPath, 'package.json'), 'utf8');
    const pkg = JSON.parse(pkgRaw);
    if (!pkg.name || !pkg.publisher) {
      return undefined;
    }
    const id = `${pkg.publisher}.${pkg.name}`.toLowerCase();
    const iconPath = await resolveIconPath(extensionPath, pkg.icon);
    const resolvedDisplayName = await resolveNlsString(extensionPath, pkg.displayName ?? pkg.name);
    // If it's still a "%...%" placeholder, the nls lookup failed (missing file/key) — fall back
    // to the raw package name rather than showing unresolved placeholder text to the user.
    const displayName = /^%.+%$/.test(resolvedDisplayName) ? pkg.name : resolvedDisplayName;
    return {
      id,
      publisher: pkg.publisher,
      name: pkg.name,
      displayName,
      version: pkg.version ?? 'unknown',
      extensionPath,
      enabled: false, // filled in by caller via diff against vscode.extensions.all
      iconPath,
    };
  } catch {
    return undefined;
  }
}

/** Scans the extensions folder on disk and cross-references vscode.extensions.all to flag disabled ones. */
export async function scanInstalledExtensions(): Promise<ExtensionRecord[]> {
  const extensionsDir = getExtensionsDir();
  let folderNames: string[];
  try {
    folderNames = await fs.readdir(extensionsDir);
  } catch {
    return [];
  }

  const obsolete = await readObsoleteSet(extensionsDir);
  const trackedFolderNames = await readTrackedFolderNames(extensionsDir);
  const enabledIds = new Set(vscode.extensions.all.map((ext) => ext.id.toLowerCase()));

  const records = await Promise.all(
    folderNames
      .filter((folderName) => !folderName.startsWith('.') && !obsolete.has(folderName))
      .filter((folderName) => trackedFolderNames === undefined || trackedFolderNames.has(folderName))
      .map((folderName) => readExtensionRecord(extensionsDir, folderName))
  );

  return records
    .filter((record): record is ExtensionRecord => record !== undefined)
    .map((record) => ({ ...record, enabled: enabledIds.has(record.id) }));
}
