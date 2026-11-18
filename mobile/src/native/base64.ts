const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const LOOKUP: Record<string, number> = {};
for (let index = 0; index < ALPHABET.length; index++) LOOKUP[ALPHABET[index]] = index;

/** base64url without padding, as required by protocol v2. */
export function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const b0 = bytes[index];
    const b1 = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const b2 = index + 2 < bytes.length ? bytes[index + 2] : 0;
    out += ALPHABET[b0 >> 2];
    out += ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    if (index + 1 < bytes.length) out += ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)];
    if (index + 2 < bytes.length) out += ALPHABET[b2 & 0x3f];
  }
  return out;
}

export function fromBase64Url(value: string): Uint8Array {
  const clean = value.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const output = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let offset = 0;

  for (const character of clean) {
    const digit = LOOKUP[character];
    if (digit === undefined) throw new Error('base64url inválido');
    buffer = (buffer << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output[offset++] = (buffer >> bits) & 0xff;
    }
  }
  return output.subarray(0, offset);
}
