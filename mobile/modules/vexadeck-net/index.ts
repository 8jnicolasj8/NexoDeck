import { requireNativeModule } from 'expo-modules-core';

export interface VexaDeckNetModule {
  wake(mac: string, port: number): Promise<boolean>;
  localSubnets(): Promise<string[]>;
  acquireMulticast(): Promise<void>;
  releaseMulticast(): Promise<void>;
}

export default requireNativeModule<VexaDeckNetModule>('VexaDeckNet');
