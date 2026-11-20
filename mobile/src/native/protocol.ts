import { hkdf } from '@noble/hashes/hkdf';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes } from '@noble/hashes/utils';
import { fromBase64Url, toBase64Url } from './base64';
import { randomBytes } from './random';

export interface PairLink {
  protocol: 2;
  serverId: string;
  name: string;
  color: string;
  addresses: string[];
  port: number;
  secret: string;
  expiresAt: number;
  mac?: string;
  version?: string;
}

export const randomNonce = (): string => toBase64Url(randomBytes(16));

export function parsePairLink(link: string): PairLink | null {
  try {
    const url = new URL(link.trim());
    if (url.protocol !== 'vexadeck:' || url.hostname !== 'pair') return null;
    const query = url.searchParams;
    if (query.get('v') !== '2') return null;
    const serverId = query.get('sid');
    const secret = query.get('s');
    if (!serverId || !secret) return null;
    return {
      protocol: 2,
      serverId,
      name: query.get('name') || 'PC',
      color: query.get('color') || '#00FF9C',
      addresses: (query.get('addr') || '').split(',').map((item) => item.trim()).filter(Boolean),
      port: Number(query.get('port')) || 47801,
      secret,
      expiresAt: Number(query.get('exp')) || 0,
      mac: query.get('mac') || undefined,
      version: query.get('ver') || undefined,
    };
  } catch {
    return null;
  }
}

export function pairProof(secret: string, serverId: string, deviceId: string, nonceC: string): string {
  const key = fromBase64Url(secret);
  return toBase64Url(hmac(sha256, key, utf8ToBytes(`pair|${serverId}|${deviceId}|${nonceC}`)));
}

export function deriveDeviceKey(secret: string, deviceId: string, serverId: string, nonceC: string, nonceS: string): Uint8Array {
  const ikm = fromBase64Url(secret);
  const salt = utf8ToBytes(deviceId);
  const info = utf8ToBytes(`vexadeck-device-key|${serverId}|${nonceC}|${nonceS}`);
  return hkdf(sha256, ikm, salt, info, 32);
}

export function authProof(deviceKey: Uint8Array, serverId: string, nonceS: string, nonceC: string): string {
  return toBase64Url(hmac(sha256, deviceKey, utf8ToBytes(`auth|${serverId}|${nonceS}|${nonceC}`)));
}

export function deriveSessionKey(deviceKey: Uint8Array, serverId: string, nonceS: string, nonceC: string): Uint8Array {
  return hmac(sha256, deviceKey, utf8ToBytes(`sess|${serverId}|${nonceS}|${nonceC}`));
}

export function fixedEqual(left: string, right: string): boolean {
  try {
    const a = fromBase64Url(left);
    const b = fromBase64Url(right);
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let index = 0; index < a.length; index++) diff |= a[index] ^ b[index];
    return diff === 0;
  } catch {
    return false;
  }
}

/** Signed envelope for one direction of a v2 connection. */
export class SignedChannel {
  private sendCounter = 0;
  private receiveCounter = 0;

  constructor(private readonly sessionKey: Uint8Array, private readonly direction: 'c2s' | 's2c') {}

  wrap(payload: string): string {
    const counter = ++this.sendCounter;
    const mac = toBase64Url(hmac(sha256, this.sessionKey, utf8ToBytes(`${this.direction}|${counter}|${payload}`)).subarray(0, 16));
    return JSON.stringify({ n: counter, p: payload, m: mac });
  }

  unwrap(envelope: unknown): string | null {
    if (!envelope || typeof envelope !== 'object') return null;
    const { n, p, m } = envelope as { n?: number; p?: string; m?: string };
    if (typeof n !== 'number' || typeof p !== 'string' || typeof m !== 'string') return null;
    if (n !== this.receiveCounter + 1) return null;
    const expected = toBase64Url(hmac(sha256, this.sessionKey, utf8ToBytes(`${this.direction}|${n}|${p}`)).subarray(0, 16));
    if (!fixedEqual(expected, m)) return null;
    this.receiveCounter = n;
    return p;
  }
}
