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

const timeout = () => AbortSignal.timeout(8000);

async function readHashes(assets: Record<string, AssetInfo>, sumsUrl: string) {
  try {
    const text = await fetch(sumsUrl, { signal: timeout() }).then((r) => (r.ok ? r.text() : ''));
    for (const line of text.split(/\r?\n/)) {
      const match = line.trim().match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
      if (match && assets[match[2]]) assets[match[2]].hash = match[1].toLowerCase();
    }
  } catch {
    console.warn('[release] Could not read SHA256SUMS.txt; hashes will be hidden.');
  }
}

/** Preferred path: GitHub API, authenticated when a token is available at build time. */
async function fromApi(): Promise<ReleaseInfo | null> {
  try {
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const res = await fetch(`https://api.github.com/repos/${repoSlug}/releases/latest`, {
      headers,
      signal: timeout(),
    });
    if (!res.ok) {
      console.warn(`[release] GitHub API responded ${res.status}; trying the public release page.`);
      return null;
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
    if (sums?.browser_download_url) await readHashes(assets, sums.browser_download_url);
    return {
      version: String(data.tag_name || data.name || '').replace(/^v/, ''),
      publishedAt: data.published_at || data.created_at || '',
      notesUrl: data.html_url || `${brand.repo}/releases`,
      assets,
    };
  } catch (error) {
    console.warn(`[release] API lookup failed: ${(error as Error).message}.`);
    return null;
  }
}

/**
 * Fallback without the API: the unauthenticated limit is 60 requests per hour per IP and
 * shared build servers can exhaust it, which used to leave the landing without version data.
 * The public redirect, the release page and the download endpoints have no such limit.
 */
async function fromPublicRelease(): Promise<ReleaseInfo | null> {
  try {
    const res = await fetch(`${brand.repo}/releases/latest`, { redirect: 'manual', signal: timeout() });
    const tag = res.headers.get('location')?.match(/\/releases\/tag\/([^/?#]+)$/)?.[1];
    if (!tag) return null;

    const notesUrl = `${brand.repo}/releases/tag/${tag}`;
    const downloadUrl = (name: string) => `${brand.repo}/releases/download/${tag}/${name}`;

    let publishedAt = '';
    try {
      const html = await fetch(notesUrl, { signal: timeout() }).then((r) => (r.ok ? r.text() : ''));
      publishedAt = html.match(/<relative-time[^>]*datetime="([^"]+)"/)?.[1] ?? '';
    } catch {
      // The date is optional; the cards simply hide it.
    }

    const names = [assetNames.installer, assetNames.portable, assetNames.apk];
    const assets: Record<string, AssetInfo> = {};
    await Promise.all(
      names.map(async (name) => {
        const url = downloadUrl(name);
        let size = 0;
        try {
          const head = await fetch(url, { method: 'HEAD', signal: timeout() });
          size = Number(head.headers.get('content-length')) || 0;
        } catch {
          // Without Content-Length the card shows a dash instead of failing the build.
        }
        assets[name] = { size, hash: null, url };
      }),
    );
    await readHashes(assets, downloadUrl(assetNames.sums));

    return {
      version: decodeURIComponent(tag).replace(/^v/, ''),
      publishedAt,
      notesUrl,
      assets,
    };
  } catch (error) {
    console.warn(`[release] Public release lookup failed: ${(error as Error).message}.`);
    return null;
  }
}

/** Build-time GitHub lookup. Never throws: on any failure the site builds without release metadata. */
export async function getRelease(): Promise<ReleaseInfo | null> {
  if (cached !== undefined) return cached;
  cached = (await fromApi()) ?? (await fromPublicRelease());
  if (!cached) console.warn('[release] No release metadata available; building without version data.');
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
