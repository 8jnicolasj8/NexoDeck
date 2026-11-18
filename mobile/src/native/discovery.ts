import Zeroconf from 'react-native-zeroconf';
import { localSubnets } from './wake';

export interface IdentInfo {
  serverId: string;
  pcName: string;
  pcColor: string;
  pcIcon: string;
  version: string;
  addresses: string[];
  httpPort: number;
  mac?: string | null;
  macs?: string[];
  wake?: boolean;
}

export async function fetchIdent(address: string, port = 47801, timeoutMs = 800): Promise<IdentInfo | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://${address}:${port}/api/ident`, { signal: controller.signal });
    if (!response.ok) return null;
    const data = await response.json();
    if (data?.app !== 'nexodeck' || typeof data.serverId !== 'string') return null;
    return data as IdentInfo;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** mDNS lookup by serverId, used when the saved IP stops working. */
export function findHostByMdns(serverId: string, timeoutMs = 3000): Promise<string | null> {
  return new Promise((resolve) => {
    let finished = false;
    const zeroconf = new Zeroconf();
    const finish = (address: string | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { zeroconf.stop(); } catch { }
      try { zeroconf.removeAllListeners(); } catch { }
      resolve(address);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);

    zeroconf.on('resolved', (service: any) => {
      const txt = service?.txt || {};
      if (txt.sid !== serverId) return;
      const address = (service.addresses || []).find((item: string) => /^\d+\.\d+\.\d+\.\d+$/.test(item));
      if (address) finish(address);
    });

    try {
      zeroconf.scan('nexodeck', 'tcp', 'local.');
    } catch {
      finish(null);
    }
  });
}

/** Lists every NexoDeck PC visible through mDNS. */
export function discoverHosts(timeoutMs = 4000): Promise<IdentInfo[]> {
  return new Promise((resolve) => {
    const found = new Map<string, IdentInfo>();
    const zeroconf = new Zeroconf();
    const finish = () => {
      clearTimeout(timer);
      try { zeroconf.stop(); } catch { }
      try { zeroconf.removeAllListeners(); } catch { }
      resolve([...found.values()]);
    };
    const timer = setTimeout(finish, timeoutMs);

    zeroconf.on('resolved', (service: any) => {
      const txt = service?.txt || {};
      if (!txt.sid) return;
      const addresses = (service.addresses || []).filter((item: string) => /^\d+\.\d+\.\d+\.\d+$/.test(item));
      found.set(txt.sid, {
        serverId: txt.sid,
        pcName: txt.name || service.name || 'PC',
        pcColor: txt.color || '#00FF9C',
        pcIcon: txt.icon || 'monitor',
        version: txt.v || '',
        addresses,
        httpPort: service.port || 47801,
      });
    });

    try {
      zeroconf.scan('nexodeck', 'tcp', 'local.');
    } catch {
      finish();
    }
  });
}

/**
 * Brute-force scan of the local /24s. Only used when the user taps "Buscar"
 * or a saved PC does not answer, never in the background.
 */
export async function scanLan(port = 47801): Promise<IdentInfo[]> {
  const subnets = await localSubnets();
  const addresses: string[] = [];
  for (const subnet of subnets) {
    for (let host = 1; host < 255; host++) addresses.push(`${subnet}.${host}`);
  }
  if (addresses.length === 0) return [];

  const results: IdentInfo[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < addresses.length) {
      const index = cursor++;
      const ident = await fetchIdent(addresses[index], port, 400);
      if (ident) results.push(ident);
    }
  };
  await Promise.all(Array.from({ length: Math.min(64, addresses.length) }, worker));
  return results;
}
