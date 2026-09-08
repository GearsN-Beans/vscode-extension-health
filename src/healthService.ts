import * as vscode from 'vscode';
import { scanInstalledExtensions } from './extensionScanner';
import { fetchGalleryInfo } from './galleryClient';
import { GithubClient, parseGithubRepo } from './githubClient';
import { TtlCache } from './cache';
import { GalleryInfo, HealthInfo } from './types';

const GALLERY_CACHE_KEY = 'extensionHealth.galleryCache';
const GITHUB_CACHE_KEY = 'extensionHealth.githubCache';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const GITHUB_TOKEN_SECRET_KEY = 'extensionHealth.githubToken';

export function computeStatus(record: { enabled: boolean }, info: GalleryInfo, staleMonths: number): HealthInfo['status'] {
  if (info.deprecated) {
    return 'deprecated';
  }
  if (!record.enabled) {
    return 'disabled';
  }
  if (info.lastUpdated) {
    const monthsSinceUpdate = (Date.now() - new Date(info.lastUpdated).getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (monthsSinceUpdate > staleMonths) {
      return 'stale';
    }
  }
  return 'healthy';
}

export class HealthService {
  private readonly galleryCache: TtlCache<GalleryInfo>;
  private readonly githubCache: TtlCache<string | undefined>;
  private readonly githubClient: GithubClient;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.galleryCache = new TtlCache<GalleryInfo>(context.globalState, GALLERY_CACHE_KEY, CACHE_TTL_MS);
    this.githubCache = new TtlCache<string | undefined>(context.globalState, GITHUB_CACHE_KEY, CACHE_TTL_MS);
    this.githubClient = new GithubClient(() => context.secrets.get(GITHUB_TOKEN_SECRET_KEY));
  }

  async setGithubToken(token: string): Promise<void> {
    await this.context.secrets.store(GITHUB_TOKEN_SECRET_KEY, token);
  }

  async getHealthInfo(options: { force?: boolean } = {}): Promise<HealthInfo[]> {
    const config = vscode.workspace.getConfiguration('extensionHealth');
    const staleMonths = config.get<number>('staleMonths', 12);
    const excluded = new Set(config.get<string[]>('excludedExtensions', []));

    const records = (await scanInstalledExtensions()).filter((record) => !excluded.has(record.id));

    const idsNeedingFetch = options.force
      ? records.map((record) => record.id)
      : records.filter((record) => this.galleryCache.get(record.id) === undefined).map((record) => record.id);

    if (idsNeedingFetch.length > 0) {
      try {
        const fetched = await fetchGalleryInfo(idsNeedingFetch);
        for (const id of idsNeedingFetch) {
          await this.galleryCache.set(id, fetched.get(id) ?? {});
        }
      } catch (error) {
        // Undocumented API — fail soft so a Marketplace outage/shape-change doesn't break the view.
        console.error('Extension Health: gallery query failed', error);
      }
    }

    const results: HealthInfo[] = [];
    for (const record of records) {
      const galleryInfo = this.galleryCache.get(record.id) ?? {};
      let lastCommitDate = this.githubCache.get(record.id);

      const repo = parseGithubRepo(galleryInfo.repositoryUrl);
      if (repo && (options.force || lastCommitDate === undefined) && !this.githubClient.isRateLimited) {
        lastCommitDate = await this.githubClient.fetchLastCommitDate(repo.owner, repo.repo);
        await this.githubCache.set(record.id, lastCommitDate);
      }

      results.push({
        ...record,
        ...galleryInfo,
        lastCommitDate,
        status: computeStatus(record, galleryInfo, staleMonths),
      });
    }

    return results;
  }
}
