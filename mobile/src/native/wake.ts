import { requireOptionalNativeModule } from 'expo-modules-core';

interface VexaDeckNetNative {
  wake(mac: string, port: number): Promise<boolean>;
  localSubnets(): Promise<string[]>;
  acquireMulticast(): Promise<void>;
  releaseMulticast(): Promise<void>;
}

const Native = requireOptionalNativeModule<VexaDeckNetNative>('VexaDeckNet');

/**
 * Wake-on-LAN needs a UDP broadcast, which the WebView cannot do. The Kotlin
 * module sends the magic packet on every IPv4 broadcast address.
 */
export async function wakeOnLan(mac?: string | null, port = 9): Promise<boolean> {
  if (!mac) return false;
  if (!Native) return false;
  try {
    return await Native.wake(mac, port);
  } catch {
    return false;
  }
}

export async function localSubnets(): Promise<string[]> {
  if (!Native) return [];
  try {
    return await Native.localSubnets();
  } catch {
    return [];
  }
}

export async function acquireMulticast(): Promise<void> {
  if (!Native) return;
  try { await Native.acquireMulticast(); } catch { }
}

export async function releaseMulticast(): Promise<void> {
  if (!Native) return;
  try { await Native.releaseMulticast(); } catch { }
}
