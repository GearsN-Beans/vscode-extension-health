import * as vscode from 'vscode';

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

/** Generic per-key TTL cache backed by extension globalState (persists across reloads). */
export class TtlCache<T> {
  private readonly store: Record<string, CacheEntry<T>>;

  constructor(
    private readonly memento: vscode.Memento,
    private readonly storageKey: string,
    private readonly ttlMs: number
  ) {
    this.store = this.memento.get<Record<string, CacheEntry<T>>>(storageKey, {});
  }

  get(key: string): T | undefined {
    const entry = this.store[key];
    if (!entry) {
      return undefined;
    }
    if (Date.now() - entry.fetchedAt > this.ttlMs) {
      return undefined;
    }
    return entry.data;
  }

  async set(key: string, data: T): Promise<void> {
    this.store[key] = { data, fetchedAt: Date.now() };
    await this.memento.update(this.storageKey, this.store);
  }

  async clear(): Promise<void> {
    for (const key of Object.keys(this.store)) {
      delete this.store[key];
    }
    await this.memento.update(this.storageKey, {});
  }
}
