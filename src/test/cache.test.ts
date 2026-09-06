import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TtlCache } from '../cache';

function makeMemento(initial: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...initial };
  return {
    get<T>(key: string, defaultValue?: T): T | undefined {
      const value = store[key];
      return (value === undefined ? defaultValue : value) as T | undefined;
    },
    update(key: string, value: unknown): Thenable<void> {
      store[key] = value;
      return Promise.resolve();
    },
    keys(): readonly string[] {
      return Object.keys(store);
    },
  };
}

test('TtlCache returns undefined for a key that was never set', () => {
  const cache = new TtlCache(makeMemento(), 'testKey', 1000 * 60);
  assert.equal(cache.get('missing'), undefined);
});

test('TtlCache returns a stored value within the TTL window', async () => {
  const cache = new TtlCache(makeMemento(), 'testKey', 1000 * 60);
  await cache.set('acme.widget', { lastUpdated: '2024-01-01' });
  assert.deepEqual(cache.get('acme.widget'), { lastUpdated: '2024-01-01' });
});

test('TtlCache treats entries older than the TTL as missing', () => {
  const memento = makeMemento({
    testKey: {
      'acme.widget': { data: { lastUpdated: '2024-01-01' }, fetchedAt: Date.now() - 1000 * 60 * 60 },
    },
  });
  const cache = new TtlCache(memento, 'testKey', 1000 * 60); // 1 minute TTL, entry is an hour old
  assert.equal(cache.get('acme.widget'), undefined);
});

test('TtlCache.clear removes all stored entries', async () => {
  const cache = new TtlCache(makeMemento(), 'testKey', 1000 * 60);
  await cache.set('a', 1);
  await cache.set('b', 2);
  await cache.clear();
  assert.equal(cache.get('a'), undefined);
  assert.equal(cache.get('b'), undefined);
});
