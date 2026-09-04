const GITHUB_API_BASE = 'https://api.github.com';

export function parseGithubRepo(url: string | undefined): { owner: string; repo: string } | undefined {
  if (!url) {
    return undefined;
  }
  const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?\/?$/i);
  if (!match) {
    return undefined;
  }
  return { owner: match[1], repo: match[2] };
}

export class GithubClient {
  private rateLimited = false;

  constructor(private readonly getToken: () => Thenable<string | undefined>) {}

  /** Returns the ISO date of the most recent commit, or undefined if unavailable/rate-limited. */
  async fetchLastCommitDate(owner: string, repo: string): Promise<string | undefined> {
    if (this.rateLimited) {
      return undefined;
    }

    const token = await this.getToken();
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/commits?per_page=1`, { headers });

      if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
        this.rateLimited = true;
        return undefined;
      }

      if (!response.ok) {
        return undefined;
      }

      const commits = (await response.json()) as Array<{ commit?: { committer?: { date?: string } } }>;
      return commits[0]?.commit?.committer?.date;
    } catch {
      return undefined;
    }
  }

  get isRateLimited(): boolean {
    return this.rateLimited;
  }
}
