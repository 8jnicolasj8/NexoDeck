jest.mock('expo-crypto', () => ({
  getRandomBytes: (length: number) => Uint8Array.from({ length }, (_, index) => index + 1),
}));

import { randomBytes } from '../src/native/random';
import { randomNonce } from '../src/native/protocol';

describe('random bytes', () => {
  test('come from expo-crypto, not Web Crypto', () => {
    expect(Array.from(randomBytes(4))).toEqual([1, 2, 3, 4]);
    expect(randomNonce()).toHaveLength(22);
  });
});
