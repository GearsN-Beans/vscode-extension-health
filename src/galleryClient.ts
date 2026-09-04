import { GalleryInfo } from './types';

// Undocumented/internal Marketplace API — endpoint, request shape, and response field
// names below are reverse-engineered and may change or break without notice.
const GALLERY_API_URL = 'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery';

// Filter type 7 = query by "publisher.extensionName". Multiple criteria of this type in a
// single filter are OR'd together by the service, which lets us batch-lookup many extensions.
const FILTER_TYPE_EXTENSION_NAME = 7;

// Flags: IncludeVersions(1) | IncludeFiles(2) | IncludeVersionProperties(16)
// | ExcludeNonValidated(32) | IncludeStatistics(256) | IncludeLatestVersionOnly(512) = 818
const QUERY_FLAGS = 818;

const BATCH_SIZE = 50;

interface GalleryVersionProperty {
  key: string;
  value: string;
}

interface GalleryVersion {
  version: string;
  lastUpdated: string;
  properties?: GalleryVersionProperty[];
}

interface GalleryStatistic {
  statisticName: string;
  value: number;
}

interface GalleryExtension {
  publisher: { publisherName: string };
  extensionName: string;
  flags?: string;
  versions?: GalleryVersion[];
  statistics?: GalleryStatistic[];
}

interface GalleryQueryResponse {
  results?: Array<{ extensions?: GalleryExtension[] }>;
}

function findProperty(version: GalleryVersion | undefined, keySubstring: string): string | undefined {
  return version?.properties?.find((prop) => prop.key.toLowerCase().includes(keySubstring.toLowerCase()))?.value;
}

function parseExtension(ext: GalleryExtension): GalleryInfo {
  const latestVersion = ext.versions?.[0];
  const installCount = ext.statistics?.find((stat) => stat.statisticName === 'install')?.value;

  // Best-effort: exact deprecation field names are not documented publicly and may need
  // adjustment based on real observed responses.
  const deprecated = ext.flags?.toLowerCase().includes('deprecated') ?? false;
  const deprecationMessage = findProperty(latestVersion, 'deprecationmessage');
  const repositoryUrl = findProperty(latestVersion, 'links.source') ?? findProperty(latestVersion, 'links.repository');

  return {
    lastUpdated: latestVersion?.lastUpdated,
    deprecated,
    deprecationMessage,
    repositoryUrl,
    installCount,
  };
}

async function queryBatch(ids: string[]): Promise<Map<string, GalleryInfo>> {
  const body = {
    filters: [
      {
        criteria: ids.map((id) => ({ filterType: FILTER_TYPE_EXTENSION_NAME, value: id })),
      },
    ],
    flags: QUERY_FLAGS,
  };

  const response = await fetch(GALLERY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json;api-version=3.0-preview.1',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Marketplace gallery query failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as GalleryQueryResponse;
  const extensions = data.results?.[0]?.extensions ?? [];

  const result = new Map<string, GalleryInfo>();
  for (const ext of extensions) {
    const id = `${ext.publisher.publisherName}.${ext.extensionName}`.toLowerCase();
    result.set(id, parseExtension(ext));
  }
  return result;
}

/** Looks up Marketplace metadata (last updated, deprecated flag, repo link) for the given extension ids. */
export async function fetchGalleryInfo(ids: string[]): Promise<Map<string, GalleryInfo>> {
  const merged = new Map<string, GalleryInfo>();
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const batchResult = await queryBatch(batch);
    for (const [id, info] of batchResult) {
      merged.set(id, info);
    }
  }
  return merged;
}
