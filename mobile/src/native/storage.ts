import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { toBase64Url } from './base64';
import { randomBytes } from './random';
import { SavedHost } from './types';

const HOSTS_KEY = 'vexadeck.hosts.v1';
const PREFER_USB_KEY = 'vexadeck.preferUsb';
const DEVICE_ID_KEY = 'vexadeck.deviceId';

/** Stable identity of this phone: one per installation, independent of the PC. */
export async function loadDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = `dev_${toBase64Url(randomBytes(9))}`;
  await AsyncStorage.setItem(DEVICE_ID_KEY, created);
  return created;
}

export async function loadHosts(): Promise<SavedHost[]> {
  try {
    const raw = await AsyncStorage.getItem(HOSTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveHosts(hosts: SavedHost[]): Promise<void> {
  await AsyncStorage.setItem(HOSTS_KEY, JSON.stringify(hosts));
}

export async function saveDeviceKey(serverId: string, key: Uint8Array): Promise<void> {
  const encoded = Array.from(key, (byte) => byte.toString(16).padStart(2, '0')).join('');
  await SecureStore.setItemAsync(`vexadeck.key.${serverId}`, encoded, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED,
  });
}

export async function loadDeviceKey(serverId: string): Promise<Uint8Array | null> {
  try {
    const stored = await SecureStore.getItemAsync(`vexadeck.key.${serverId}`);
    if (!stored) return null;
    const bytes = new Uint8Array(stored.length / 2);
    for (let index = 0; index < bytes.length; index++) {
      bytes[index] = parseInt(stored.slice(index * 2, index * 2 + 2), 16);
    }
    return bytes;
  } catch {
    return null;
  }
}

export async function deleteDeviceKey(serverId: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(`vexadeck.key.${serverId}`);
  } catch {
    // Nothing to delete.
  }
}

export async function getPreferUsb(): Promise<boolean> {
  return (await AsyncStorage.getItem(PREFER_USB_KEY)) !== 'false';
}

export async function setPreferUsb(value: boolean): Promise<void> {
  await AsyncStorage.setItem(PREFER_USB_KEY, String(value));
}
