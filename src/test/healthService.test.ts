import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStatus } from '../healthService';

test('computeStatus reports deprecated even for a disabled or stale extension', () => {
  assert.equal(computeStatus({ enabled: false }, { deprecated: true, lastUpdated: '2000-01-01' }, 12), 'deprecated');
  assert.equal(computeStatus({ enabled: true }, { deprecated: true }, 12), 'deprecated');
});

test('computeStatus reports disabled even when the extension is also stale', () => {
  const status = computeStatus({ enabled: false }, { lastUpdated: '2000-01-01' }, 12);
  assert.equal(status, 'disabled');
});

test('computeStatus reports stale for an enabled extension with an old lastUpdated date', () => {
  const status = computeStatus({ enabled: true }, { lastUpdated: '2000-01-01' }, 12);
  assert.equal(status, 'stale');
});

test('computeStatus reports healthy for an enabled, recently updated extension', () => {
  const status = computeStatus({ enabled: true }, { lastUpdated: new Date().toISOString() }, 12);
  assert.equal(status, 'healthy');
});

test('computeStatus reports healthy when no gallery lastUpdated info is available', () => {
  const status = computeStatus({ enabled: true }, {}, 12);
  assert.equal(status, 'healthy');
});
