export function epochDay(): number {
  return Math.floor(Date.now() / 86_400_000);
}

function ab(u: Uint8Array): Uint8Array<ArrayBuffer> {
  if (u.buffer instanceof ArrayBuffer) return u as Uint8Array<ArrayBuffer>;
  const copy = new Uint8Array(u.byteLength);
  copy.set(u);
  return copy;
}

async function hkdfExtract(salt: Uint8Array, ikm: Uint8Array): Promise<CryptoKey> {
  const saltKey = await crypto.subtle.importKey("raw", ab(salt), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prk = await crypto.subtle.sign("HMAC", saltKey, ab(ikm));
  return crypto.subtle.importKey("raw", prk, { name: "HKDF" }, false, ["deriveBits"]);
}

async function hkdfExpand(prk: CryptoKey, info: string, length: number): Promise<Uint8Array> {
  const infoBytes = new TextEncoder().encode(info);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: infoBytes },
    prk,
    length * 8
  );
  return new Uint8Array(bits);
}

export interface DerivedKeys {
  K1: Uint8Array;
  K2: Uint8Array;
}

export async function deriveKeys(groupCode: string, gcmIv: Uint8Array): Promise<DerivedKeys> {
  const day = epochDay();
  const password = `${groupCode}:${day}`;
  const pwBytes = new TextEncoder().encode(password);
  const prk = await hkdfExtract(gcmIv, pwBytes);
  const [K1, K2] = await Promise.all([
    hkdfExpand(prk, "hexglyph-k1-primary-v1", 32),
    hkdfExpand(prk, "hexglyph-k2-secondary-v1", 32),
  ]);
  return { K1, K2 };
}

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest("SHA-256", ab(data));
  return new Uint8Array(hash);
}

export async function fisherYatesSeed(K1: Uint8Array): Promise<Uint8Array> {
  return sha256(K1);
}
