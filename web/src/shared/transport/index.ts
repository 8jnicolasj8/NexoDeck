import { BrowserTransport } from './browser';
import { NativeTransport } from './native';
import { Transport } from './types';

export * from './types';
export { BrowserTransport } from './browser';
export { NativeTransport } from './native';

export function isNativeShell(): boolean {
  return typeof window !== 'undefined' && (!!window.ReactNativeWebView || new URLSearchParams(window.location.search).get('native') === '1');
}

export function createTransport(): Transport {
  return isNativeShell() ? new NativeTransport() : new BrowserTransport();
}
