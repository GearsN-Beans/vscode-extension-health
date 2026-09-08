import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { scanInstalledExtensions } from '../extensionScanner';
import { resetVscodeMock, state as vscodeMockState } from './vscodeMock';

async function makeTempExtensionsDir(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ext-health-test-'));
  process.env.VSCODE_PORTABLE = root;
  const extensionsDir = path.join(root, 'extensions');
  await fs.mkdir(extensionsDir, { recursive: true });
  return extensionsDir;
}

async function writeExtension(extensionsDir: string, folderName: string, pkg: Record<string, unknown>): Promise<void> {
  const dir = path.join(extensionsDir, folderName);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify(pkg));
}

test.beforeEach(() => {
  resetVscodeMock();
});

test.afterEach(() => {
  delete process.env.VSCODE_PORTABLE;
});

test('scanInstalledExtensions reads extensions from disk and flags which are enabled', async () => {
  const extensionsDir = await makeTempExtensionsDir();
  await writeExtension(extensionsDir, 'acme.widget-1.0.0', {
    name: 'widget',
    publisher: 'acme',
    displayName: 'Widget',
    version: '1.0.0',
  });
  await writeExtension(extensionsDir, 'acme.gadget-2.0.0', {
    name: 'gadget',
    publisher: 'acme',
    displayName: 'Gadget',
    version: '2.0.0',
  });
  vscodeMockState.extensionsAll = [{ id: 'acme.widget' }];

  const records = await scanInstalledExtensions();

  assert.equal(records.length, 2);
  assert.equal(records.find((r) => r.id === 'acme.widget')?.enabled, true);
  assert.equal(records.find((r) => r.id === 'acme.gadget')?.enabled, false);
});

test('scanInstalledExtensions skips folders marked obsolete', async () => {
  const extensionsDir = await makeTempExtensionsDir();
  await writeExtension(extensionsDir, 'acme.widget-1.0.0', { name: 'widget', publisher: 'acme', version: '1.0.0' });
  await fs.writeFile(path.join(extensionsDir, '.obsolete'), JSON.stringify({ 'acme.widget-1.0.0': true }));

  const records = await scanInstalledExtensions();
  assert.equal(records.length, 0);
});

test('scanInstalledExtensions skips folders with an unreadable package.json', async () => {
  const extensionsDir = await makeTempExtensionsDir();
  const dir = path.join(extensionsDir, 'broken-folder');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'package.json'), 'not json');

  const records = await scanInstalledExtensions();
  assert.equal(records.length, 0);
});

test('scanInstalledExtensions ignores folders not tracked in extensions.json (orphaned leftovers)', async () => {
  const extensionsDir = await makeTempExtensionsDir();
  await writeExtension(extensionsDir, 'acme.widget-1.0.0', { name: 'widget', publisher: 'acme', version: '1.0.0' });
  await writeExtension(extensionsDir, 'acme.orphan-0.1.0', { name: 'orphan', publisher: 'acme', version: '0.1.0' });
  await fs.writeFile(
    path.join(extensionsDir, 'extensions.json'),
    JSON.stringify([{ identifier: { id: 'acme.widget' }, relativeLocation: 'acme.widget-1.0.0' }])
  );

  const records = await scanInstalledExtensions();

  assert.equal(records.length, 1);
  assert.equal(records[0]?.id, 'acme.widget');
});

test('scanInstalledExtensions falls back to a full disk scan when extensions.json is missing', async () => {
  const extensionsDir = await makeTempExtensionsDir();
  await writeExtension(extensionsDir, 'acme.widget-1.0.0', { name: 'widget', publisher: 'acme', version: '1.0.0' });

  const records = await scanInstalledExtensions();
  assert.equal(records.length, 1);
});

test('scanInstalledExtensions resolves an extension icon when present on disk', async () => {
  const extensionsDir = await makeTempExtensionsDir();
  const dir = path.join(extensionsDir, 'acme.widget-1.0.0');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'widget', publisher: 'acme', icon: 'icon.png' }));
  await fs.writeFile(path.join(dir, 'icon.png'), 'fake-png-bytes');

  const records = await scanInstalledExtensions();
  assert.equal(records[0]?.iconPath, path.join(dir, 'icon.png'));
});

test('scanInstalledExtensions leaves iconPath undefined when the declared icon file is missing', async () => {
  const extensionsDir = await makeTempExtensionsDir();
  await writeExtension(extensionsDir, 'acme.widget-1.0.0', { name: 'widget', publisher: 'acme', icon: 'missing.png' });

  const records = await scanInstalledExtensions();
  assert.equal(records[0]?.iconPath, undefined);
});

test('scanInstalledExtensions resolves an NLS displayName placeholder via package.nls.json', async () => {
  const extensionsDir = await makeTempExtensionsDir();
  const dir = path.join(extensionsDir, 'acme.widget-1.0.0');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'widget', publisher: 'acme', displayName: '%displayName%' })
  );
  await fs.writeFile(path.join(dir, 'package.nls.json'), JSON.stringify({ displayName: 'Widget Tools' }));

  const records = await scanInstalledExtensions();
  assert.equal(records[0]?.displayName, 'Widget Tools');
});

test('scanInstalledExtensions falls back to the raw name when an NLS placeholder cannot be resolved', async () => {
  const extensionsDir = await makeTempExtensionsDir();
  await writeExtension(extensionsDir, 'acme.widget-1.0.0', {
    name: 'widget',
    publisher: 'acme',
    displayName: '%displayName%',
  });

  const records = await scanInstalledExtensions();
  assert.equal(records[0]?.displayName, 'widget');
});

