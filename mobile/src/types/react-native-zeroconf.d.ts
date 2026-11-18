// react-native-zeroconf ships no type declarations; this covers the small
// surface the app uses (see src/native/discovery.ts).
declare module 'react-native-zeroconf' {
  type ZeroconfListener = (service: any) => void;

  export default class Zeroconf {
    scan(type?: string, protocol?: string, domain?: string): void;
    stop(): void;
    on(event: string, listener: ZeroconfListener): void;
    removeAllListeners(): void;
  }
}
