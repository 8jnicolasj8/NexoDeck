import { readFileSync } from 'fs';
import { join } from 'path';
import { authProof, deriveDeviceKey, deriveSessionKey, pairProof, SignedChannel } from '../src/native/protocol';
import { toBase64Url } from '../src/native/base64';

const vectorsPath = join(__dirname, '..', '..', 'docs', 'protocol-v2-vectors.json');

describe('protocol v2 vectors', () => {
  const vectors = JSON.parse(readFileSync(vectorsPath, 'utf8'));

  test('pairProof matches the C# server', () => {
    const proof = pairProof(vectors.pairSecret, vectors.serverId, vectors.deviceId, vectors.nonceC);
    expect(proof).toBe(vectors.expected.pairProof);
  });

  test('device, auth and session keys match', () => {
    const deviceKey = deriveDeviceKey(
      vectors.pairSecret,
      vectors.deviceId,
      vectors.serverId,
      vectors.nonceC,
      vectors.nonceS
    );
    expect(toBase64Url(deviceKey)).toBe(vectors.expected.deviceKey);
    expect(authProof(deviceKey, vectors.serverId, vectors.nonceS, vectors.nonceC)).toBe(vectors.expected.authProof);

    const sessionKey = deriveSessionKey(deviceKey, vectors.serverId, vectors.nonceS, vectors.nonceC);
    expect(toBase64Url(sessionKey)).toBe(vectors.expected.sessionKey);
  });

  test('signed envelopes match and reject replays', () => {
    const deviceKey = deriveDeviceKey(
      vectors.pairSecret,
      vectors.deviceId,
      vectors.serverId,
      vectors.nonceC,
      vectors.nonceS
    );
    const sessionKey = deriveSessionKey(deviceKey, vectors.serverId, vectors.nonceS, vectors.nonceC);
    const channel = new SignedChannel(sessionKey, 's2c');

    for (const envelope of vectors.expected.envelopes) {
      const wrapped = JSON.parse(channel.wrap(envelope.payload));
      expect(wrapped.n).toBe(envelope.counter);
      expect(wrapped.m).toBe(envelope.mac);
    }

    // A repeated counter must be rejected.
    const replay = { n: 2, p: vectors.expected.envelopes[1].payload, m: vectors.expected.envelopes[1].mac };
    expect(channel.unwrap(replay)).toBeNull();
  });
});
