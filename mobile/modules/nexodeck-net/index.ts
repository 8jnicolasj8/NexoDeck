import { requireNativeModule } from 'expo-modules-core';

export interface NexoDeckNetModule {
  wake(mac: string, port: number): Promise<boolean>;
  localSubnets(): Promise<string[]>;
  acquireMulticast(): Promise<void>;
  releaseMulticast(): Promise<void>;
}

export default requireNativeModule<NexoDeckNetModule>('NexoDeckNet');
