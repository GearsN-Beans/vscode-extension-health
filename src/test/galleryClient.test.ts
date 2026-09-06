import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { fetchGalleryInfo } from '../galleryClient';

function makeResponse(extensions: unknown[]) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({ results: [{ extensions }] }),
  };
}

test('fetchGalleryInfo parses lastUpdated, deprecated flag, install count, and repo link', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () =>
    makeResponse([
      {
        publisher: { publisherName: 'acme' },
        extensionName: 'widget',
        flags: 'validated deprecated',
        versions: [
          {
            version: '1.2.3',
            lastUpdated: '2024-01-01T00:00:00Z',
            properties: [{ key: 'Microsoft.VisualStudio.Services.Links.Source', value: 'https://github.com/acme/widget' }],
          },
        ],
        statistics: [{ statisticName: 'install', value: 42 }],
      },
    ])
  );

  const result = await fetchGalleryInfo(['acme.widget']);
  const info = result.get('acme.widget');

  assert.ok(info);
  assert.equal(info?.lastUpdated, '2024-01-01T00:00:00Z');
  assert.equal(info?.deprecated, true);
  assert.equal(info?.installCount, 42);
  assert.equal(info?.repositoryUrl, 'https://github.com/acme/widget');
  fetchMock.mock.restore();
});

test('fetchGalleryInfo batches ids into groups of 50', async () => {
  const batches: string[][] = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    batches.push(body.filters[0].criteria.map((c: { value: string }) => c.value));
    return makeResponse([]);
  });

  const ids = Array.from({ length: 75 }, (_, i) => `pub.ext${i}`);
  await fetchGalleryInfo(ids);

  assert.equal(batches.length, 2);
  assert.equal(batches[0].length, 50);
  assert.equal(batches[1].length, 25);
  fetchMock.mock.restore();
});

test('fetchGalleryInfo throws when the gallery responds with an error status', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => ({
    ok: false,
    status: 500,
    statusText: 'Internal Server Error',
    json: async () => ({}),
  }));

  await assert.rejects(() => fetchGalleryInfo(['acme.widget']));
  fetchMock.mock.restore();
});
