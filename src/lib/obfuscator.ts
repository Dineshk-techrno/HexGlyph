import { sha256 } from "./keyderivation";

async function deriveObfKey(K1: Uint8Array, round: number): Promise<Uint8Array> {
  const label = new TextEncoder().encode(`hexglyph-obf-round-${round}`);
  const combined = new Uint8Array(K1.length + label.length);
  combined.set(K1);
  combined.set(label, K1.length);
  return sha256(combined);
}

function xorRotate(data: Uint8Array, key: Uint8Array): Uint8Array {
  const result = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const k = key[i % key.length];
    const rotated = ((data[i] << 1) | (data[i] >>> 7)) & 0xff;
    result[i] = rotated ^ k;
  }
  return result;
}

function undoXorRotate(data: Uint8Array, key: Uint8Array): Uint8Array {
  const result = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const k = key[i % key.length];
    const unxored = data[i] ^ k;
    result[i] = ((unxored >>> 1) | (unxored << 7)) & 0xff;
  }
  return result;
}

export async function applyObfuscation(data: Uint8Array, K1: Uint8Array): Promise<Uint8Array> {
  let result = data;
  for (let round = 0; round < 3; round++) {
    const key = await deriveObfKey(K1, round);
    result = xorRotate(result, key);
  }
  return result;
}

export async function undoObfuscation(data: Uint8Array, K1: Uint8Array): Promise<Uint8Array> {
  let result = data;
  for (let round = 2; round >= 0; round--) {
    const key = await deriveObfKey(K1, round);
    result = undoXorRotate(result, key);
  }
  return result;
}
