export interface ExtensionRecord {
  id: string; // "publisher.name", lowercase
  publisher: string;
  name: string;
  displayName: string;
  version: string;
  extensionPath: string;
  enabled: boolean;
  iconPath?: string; // absolute path to the extension's own icon file, if it declares one
}

export type HealthStatus = 'deprecated' | 'stale' | 'disabled' | 'healthy';

export interface GalleryInfo {
  lastUpdated?: string; // ISO date
  deprecated?: boolean;
  deprecationMessage?: string;
  repositoryUrl?: string;
  installCount?: number;
}

export interface HealthInfo extends ExtensionRecord, GalleryInfo {
  lastCommitDate?: string; // ISO date, from GitHub
  status: HealthStatus;
}
