import { getRandomBytes } from 'expo-crypto';

/**
 * Hermes has no Web Crypto, so `@noble/hashes` cannot use its `randomBytes`
 * helper. expo-crypto reads from the platform's secure random generator.
 */
export const randomBytes = (length: number): Uint8Array => getRandomBytes(length);
