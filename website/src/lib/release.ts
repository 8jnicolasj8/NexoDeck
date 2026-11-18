import { assetNames, brand, repoSlug } from './brand';

export interface AssetInfo {
  size: number;
  hash: string | null;
  url: string;
}

export interface ReleaseInfo {
  version: string;
  publishedAt: string;
  notesUrl: string;
  assets: Record<string, AssetInfo>;
}

const fallbackUrl = (name: string) => `${brand.repo}/releases/latest/download/${name}`;

let cached: ReleaseInfo | null | undefined;

/** Build-time GitHub lookup. Never throws: on any failure the site builds without release metadata. */
export async function getRelease(): Promise<ReleaseInfo | null> {
  if (cached !== undefined) return cached;
  cached = null;
  try {
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const res = await fetch(`https://api.github.com/repos/${repoSlug}/releases/latest`, {
      headers,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn(`[release] GitHub API responded ${res.status}; building without version data.`);
      return cached;
    }
    const data: any = await res.json();
    const assets: Record<string, AssetInfo> = {};
    for (const raw of data.assets ?? []) {
      assets[raw.name] = {
        size: Number(raw.size) || 0,
        hash: null,
        url: raw.browser_download_url || fallbackUrl(raw.name),
      };
    }
    const sums = (data.assets ?? []).find((a: any) => a.name === assetNames.sums);
    if (sums?.browser_download_url) {
      try {
        const text = await fetch(sums.browser_download_url, { signal: AbortSignal.timeout(8000) }).then((r) =>
          r.ok ? r.text() : '',
        );
        for (const line of text.split(/\r?\n/)) {
          const match = line.trim().match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
          if (match && assets[match[2]]) assets[match[2]].hash = match[1].toLowerCase();
        }
      } catch {
        console.warn('[release] Could not read SHA256SUMS.txt; hashes will be hidden.');
      }
    }
    cached = {
      version: String(data.tag_name || data.name || '').replace(/^v/, ''),
      publishedAt: data.published_at || data.created_at || '',
      notesUrl: data.html_url || `${brand.repo}/releases`,
      assets,
    };
  } catch (error) {
    console.warn(`[release] Lookup failed: ${(error as Error).message}. Building without version data.`);
  }
  return cached;
}

export function assetUrl(release: ReleaseInfo | null, name: string): string {
  return release?.assets[name]?.url || fallbackUrl(name);
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '—';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function formatDate(iso: string, lang: 'es' | 'en'): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(lang === 'es' ? 'es-AR' : 'en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso));
}
