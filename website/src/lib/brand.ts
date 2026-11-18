import { readFileSync } from 'node:fs';
import features from '../data/features.json';

export interface Brand {
  name: string;
  tagline: string;
  repo: string;
  siteUrl: string;
  accent: string;
  accentAlt: string;
  bg: string;
}

export const brand: Brand = JSON.parse(
  readFileSync(new URL('../../../brand.json', import.meta.url), 'utf8'),
);

export const flags = features as Record<'windows' | 'pwa' | 'android' | 'multiPc' | 'usb', boolean>;

export const repoOwner = new URL(brand.repo).pathname.split('/').filter(Boolean);
export const repoSlug = `${repoOwner[0]}/${repoOwner[1]}`;
export const siteOrigin = (import.meta.env.SITE || brand.siteUrl).replace(/\/$/, '');

export const assetNames = {
  installer: `${brand.name}-Setup.exe`,
  portable: `${brand.name}-Portable.zip`,
  apk: `${brand.name}-Android.apk`,
  sums: 'SHA256SUMS.txt',
} as const;
