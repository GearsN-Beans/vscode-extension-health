import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { GithubClient, parseGithubRepo } from '../githubClient';

test('parseGithubRepo extracts owner/repo from an https URL', () => {
  assert.deepEqual(parseGithubRepo('https://github.com/acme/widget'), { owner: 'acme', repo: 'widget' });
});

test('parseGithubRepo strips a trailing .git suffix', () => {
  assert.deepEqual(parseGithubRepo('https://github.com/acme/widget.git'), { owner: 'acme', repo: 'widget' });
});

test('parseGithubRepo handles an SSH-style URL', () => {
  assert.deepEqual(parseGithubRepo('git@github.com:acme/widget.git'), { owner: 'acme', repo: 'widget' });
});

test('parseGithubRepo returns undefined for a non-GitHub URL', () => {
  assert.equal(parseGithubRepo('https://example.com/acme/widget'), undefined);
});

test('parseGithubRepo returns undefined when no URL is given', () => {
  assert.equal(parseGithubRepo(undefined), undefined);
});

test('GithubClient.fetchLastCommitDate returns the latest commit date', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => [{ commit: { committer: { date: '2024-05-01T00:00:00Z' } } }],
  }));

  const client = new GithubClient(async () => undefined);
  const date = await client.fetchLastCommitDate('acme', 'widget');

  assert.equal(date, '2024-05-01T00:00:00Z');
  fetchMock.mock.restore();
});

test('GithubClient sends the token as a bearer header when provided', async () => {
  let receivedAuth: string | undefined;
  const fetchMock = mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    receivedAuth = (init.headers as Record<string, string>).Authorization;
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => [],
    };
  });

  const client = new GithubClient(async () => 'my-token');
  await client.fetchLastCommitDate('acme', 'widget');

  assert.equal(receivedAuth, 'Bearer my-token');
  fetchMock.mock.restore();
});

test('GithubClient stops making requests after hitting the rate limit', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => ({
    ok: false,
    status: 403,
    headers: new Headers({ 'x-ratelimit-remaining': '0' }),
    json: async () => ({}),
  }));

  const client = new GithubClient(async () => undefined);
  const first = await client.fetchLastCommitDate('acme', 'widget');
  assert.equal(first, undefined);
  assert.equal(client.isRateLimited, true);
  fetchMock.mock.restore();

  const secondFetchMock = mock.method(globalThis, 'fetch', async () => {
    throw new Error('fetch should not be called once rate-limited');
  });
  const second = await client.fetchLastCommitDate('acme', 'widget');
  assert.equal(second, undefined);
  secondFetchMock.mock.restore();
});
