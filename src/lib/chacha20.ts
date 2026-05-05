function rotl32(v: number, n: number): number {
  return ((v << n) | (v >>> (32 - n))) >>> 0;
}

function quarterRound(s: Uint32Array, a: number, b: number, c: number, d: number): void {
  s[a] = (s[a] + s[b]) >>> 0; s[d] ^= s[a]; s[d] = rotl32(s[d], 16);
  s[c] = (s[c] + s[d]) >>> 0; s[b] ^= s[c]; s[b] = rotl32(s[b], 12);
  s[a] = (s[a] + s[b]) >>> 0; s[d] ^= s[a]; s[d] = rotl32(s[d], 8);
  s[c] = (s[c] + s[d]) >>> 0; s[b] ^= s[c]; s[b] = rotl32(s[b], 7);
}

// Copy TypedArray slice into a fresh standalone ArrayBuffer so DataView
// always starts at byteOffset 0 — avoids bugs on Samsung Internet and older
// Android WebViews when the input is a subarray() view of a larger buffer.
function freshCopy(u: Uint8Array, len: number): Uint8Array {
  const out = new Uint8Array(len);
  out.set(u.subarray(0, len));
  return out;
}

function chachaBlock(key: Uint8Array, nonce: Uint8Array, counter: number): Uint8Array {
  const state = new Uint32Array(16);
  state[0] = 0x61707865;
  state[1] = 0x3320646e;
  state[2] = 0x79622d32;
  state[3] = 0x6b206574;

  const keyView = new DataView(freshCopy(key, 32).buffer);
  for (let i = 0; i < 8; i++) {
    state[4 + i] = keyView.getUint32(i * 4, true);
  }

  state[12] = counter >>> 0;

  const nonceView = new DataView(freshCopy(nonce, 12).buffer);
  state[13] = nonceView.getUint32(0, true);
  state[14] = nonceView.getUint32(4, true);
  state[15] = nonceView.getUint32(8, true);

  const working = new Uint32Array(state);

  for (let i = 0; i < 10; i++) {
    quarterRound(working, 0, 4, 8, 12);
    quarterRound(working, 1, 5, 9, 13);
    quarterRound(working, 2, 6, 10, 14);
    quarterRound(working, 3, 7, 11, 15);
    quarterRound(working, 0, 5, 10, 15);
    quarterRound(working, 1, 6, 11, 12);
    quarterRound(working, 2, 7, 8, 13);
    quarterRound(working, 3, 4, 9, 14);
  }

  for (let i = 0; i < 16; i++) {
    working[i] = (working[i] + state[i]) >>> 0;
  }

  const out = new Uint8Array(64);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 16; i++) {
    outView.setUint32(i * 4, working[i], true);
  }
  return out;
}

export function chacha20XOR(key: Uint8Array, nonce: Uint8Array, data: Uint8Array): Uint8Array {
  const result = new Uint8Array(data.length);
  let counter = 0;
  let offset = 0;

  while (offset < data.length) {
    const block = chachaBlock(key, nonce, counter);
    const blockLen = Math.min(64, data.length - offset);
    for (let i = 0; i < blockLen; i++) {
      result[offset + i] = data[offset + i] ^ block[i];
    }
    offset += blockLen;
    counter++;
  }

  return result;
}
