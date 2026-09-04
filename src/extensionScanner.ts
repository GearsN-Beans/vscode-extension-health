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
    return {
      id,
      publisher: pkg.publisher,
      name: pkg.name,
      displayName: pkg.displayName ?? pkg.name,
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
  const enabledIds = new Set(vscode.extensions.all.map((ext) => ext.id.toLowerCase()));

  const records = await Promise.all(
    folderNames
      .filter((folderName) => !folderName.startsWith('.') && !obsolete.has(folderName))
      .map((folderName) => readExtensionRecord(extensionsDir, folderName))
  );

  return records
    .filter((record): record is ExtensionRecord => record !== undefined)
    .map((record) => ({ ...record, enabled: enabledIds.has(record.id) }));
}
