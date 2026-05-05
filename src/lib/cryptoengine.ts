import { deriveKeys, fisherYatesSeed } from "./keyderivation";
import { chacha20XOR } from "./chacha20";
import { rsEncode, rsDecode, ECC_NSYM } from "./reedsolomon";
import { applyObfuscation, undoObfuscation } from "./obfuscator";
import { totalDataBytes } from "./hexmath";

const MAGIC = new Uint8Array([0x48, 0x47, 0x4c, 0x59]); // "HGLY"
const VERSION = 0x01;

// Glyph payload layout (bytes mapped to hex cells):
//   [ gcmIv (12) | rsLen (2, big-endian) | obfuscated RS block (rsLen) ]
//
// rsLen tells the decoder exactly how many bytes the RS block occupies so it
// can slice off the trailing dark-cell zeros before passing to rsDecode.
// Without this header, the scanner (which always reads all data cells) would
// feed trailing zeros into rsDecode, causing "too many errors".
const GLYPH_HEADER_BYTES = 14; // 12 (gcmIv) + 2 (rsLen)

// Maximum RS block bytes that fit inside one glyph.
// totalDataBytes() accounts for the current GRID_RADIUS.
function maxRsBytes(): number {
  return totalDataBytes() - GLYPH_HEADER_BYTES;
}

// Maximum plaintext bytes:
//   glyph capacity − header − RS ECC symbols − fixed crypto overhead (83 bytes)
//   fixed overhead = gcmIv(12)+chachaNonce(12)+ctrNonce(16)+authTag(16)+plainblock_overhead(27)
export function maxPlaintextBytes(): number {
  return maxRsBytes() - ECC_NSYM - 83;
}

function ab(u: Uint8Array): Uint8Array<ArrayBuffer> {
  if (u.buffer instanceof ArrayBuffer) return u as Uint8Array<ArrayBuffer>;
  const copy = new Uint8Array(u.byteLength);
  copy.set(u);
  return copy;
}

function concatBuffers(...bufs: Uint8Array[]): Uint8Array {
  const total = bufs.reduce((s, b) => s + b.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const b of bufs) { out.set(b, offset); offset += b.length; }
  return out;
}

function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return buf;
}

async function aesCtrXOR(K1: Uint8Array, ctrNonce: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ab(K1), { name: "AES-CTR" }, false, ["encrypt"]);
  // AES-CTR-encrypt(data) already returns data XOR keystream — that IS the XOR result.
  // Do NOT XOR with data again; that would cancel out and return just the keystream.
  const result = await crypto.subtle.encrypt({ name: "AES-CTR", counter: ab(ctrNonce), length: 64 }, key, ab(data));
  return new Uint8Array(result);
}

async function fisherYatesShuffle(data: Uint8Array, K1: Uint8Array): Promise<Uint8Array> {
  const seed = await fisherYatesSeed(K1);
  const arr = new Uint8Array(data);
  let seedIdx = 0;
  for (let i = arr.length - 1; i > 0; i--) {
    const jBytes = seed[seedIdx % seed.length] * 256 + seed[(seedIdx + 1) % seed.length];
    const j = jBytes % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
    seedIdx += 2;
  }
  return arr;
}

async function fisherYatesUnshuffle(data: Uint8Array, K1: Uint8Array): Promise<Uint8Array> {
  const seed = await fisherYatesSeed(K1);
  const arr = new Uint8Array(data);
  const indices: number[] = [];
  let seedIdx = 0;
  for (let i = arr.length - 1; i > 0; i--) {
    const jBytes = seed[seedIdx % seed.length] * 256 + seed[(seedIdx + 1) % seed.length];
    indices.push(jBytes % (i + 1));
    seedIdx += 2;
  }
  for (let i = 1; i < arr.length; i++) {
    const j = indices[arr.length - 1 - i];
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function encodeFull(plaintext: string, groupCode: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const ptBytes = encoder.encode(plaintext);
  const maxPt = maxPlaintextBytes();
  if (ptBytes.length > maxPt) {
    throw new Error(`Message too long — max ${maxPt} bytes for this glyph size`);
  }

  const gcmIv = randomBytes(12);
  const { K1, K2 } = await deriveKeys(groupCode, gcmIv);

  // 64-bit timestamp as two 32-bit halves (avoids setBigUint64 on older WebViews)
  const timestampBuf = new ArrayBuffer(8);
  const timestampView = new DataView(timestampBuf);
  const tsMs = Date.now();
  const tsHi = Math.floor(tsMs / 4294967296);
  const tsLo = tsMs - tsHi * 4294967296;
  timestampView.setUint32(0, tsHi, false);
  timestampView.setUint32(4, tsLo, false);

  const ptLen = new Uint8Array(2);
  new DataView(ptLen.buffer).setUint16(0, ptBytes.length, false);

  const plainBlock = concatBuffers(MAGIC, new Uint8Array([VERSION]), new Uint8Array(timestampBuf), gcmIv, ptLen, ptBytes);

  const aesKey = await crypto.subtle.importKey("raw", ab(K1), { name: "AES-GCM" }, false, ["encrypt"]);
  const gcmResult = await crypto.subtle.encrypt({ name: "AES-GCM", iv: ab(gcmIv), tagLength: 128 }, aesKey, ab(plainBlock));
  const gcmOut = new Uint8Array(gcmResult);
  const ciphertext = gcmOut.slice(0, gcmOut.length - 16);
  const authTag = gcmOut.slice(gcmOut.length - 16);

  const chachaNonce = randomBytes(12);
  const chacha20d = chacha20XOR(K2, chachaNonce, ciphertext);

  const ctrNonce = randomBytes(16);
  const ctrMasked = await aesCtrXOR(K1, ctrNonce, chacha20d);

  const shuffled = await fisherYatesShuffle(ctrMasked, K1);

  const outputBlock = concatBuffers(gcmIv, chachaNonce, ctrNonce, shuffled, authTag);
  const rsEncoded = rsEncode(outputBlock);
  const obfuscated = await applyObfuscation(rsEncoded, K1);

  // Safety check: ensure payload fits in glyph
  if (obfuscated.length > maxRsBytes()) {
    throw new Error(`Encoded payload (${obfuscated.length} bytes) exceeds glyph capacity`);
  }

  // 2-byte big-endian RS block length header — lets the decoder trim trailing
  // dark-cell zeros before calling rsDecode.
  const lenHeader = new Uint8Array(2);
  lenHeader[0] = (obfuscated.length >> 8) & 0xff;
  lenHeader[1] = obfuscated.length & 0xff;

  // Layout: gcmIv(12) | rsLen(2) | obfuscated(rsLen)
  // Cells not covered by this payload remain dark (0) and are ignored on decode.
  return concatBuffers(gcmIv, lenHeader, obfuscated);
}

export async function decodeFull(data: Uint8Array, groupCode: string): Promise<string> {
  // Minimum: gcmIv(12) + rsLen(2) + at least ECC_NSYM+1 RS bytes
  if (data.length < GLYPH_HEADER_BYTES + ECC_NSYM + 1) {
    throw new Error("Invalid or unsupported glyph image — payload too short");
  }

  const gcmIv = data.slice(0, 12);

  // Read 2-byte big-endian RS block length
  const rsLen = (data[12] << 8) | data[13];

  // Validate: rsLen must be plausible (at least ECC_NSYM+1 bytes, fits in data)
  if (rsLen < ECC_NSYM + 1 || rsLen > data.length - GLYPH_HEADER_BYTES) {
    throw new Error(
      "Invalid or unsupported glyph image — length header is corrupt or this glyph " +
      "was created with a different version of HexGlyph"
    );
  }

  const obfuscatedPayload = data.slice(GLYPH_HEADER_BYTES, GLYPH_HEADER_BYTES + rsLen);

  const { K1, K2 } = await deriveKeys(groupCode, gcmIv);

  const rsEncoded = await undoObfuscation(obfuscatedPayload, K1);

  let outputBlock: Uint8Array;
  try {
    outputBlock = rsDecode(rsEncoded);
  } catch {
    throw new Error(
      "Invalid or unsupported glyph image — the glyph data could not be recovered. " +
      "Ensure the image is a HexGlyph and is not cropped, blurry, or corrupted."
    );
  }

  const parsedGcmIv = outputBlock.slice(0, 12);
  const chachaNonce = outputBlock.slice(12, 24);
  const ctrNonce = outputBlock.slice(24, 40);
  const shuffledCiphertext = outputBlock.slice(40, outputBlock.length - 16);
  const authTag = outputBlock.slice(outputBlock.length - 16);

  const unshuffled = await fisherYatesUnshuffle(shuffledCiphertext, K1);
  const aesCtrDecrypted = await aesCtrXOR(K1, ctrNonce, unshuffled);
  const ciphertext = chacha20XOR(K2, chachaNonce, aesCtrDecrypted);

  const aesKey = await crypto.subtle.importKey("raw", ab(K1), { name: "AES-GCM" }, false, ["decrypt"]);
  const gcmInput = concatBuffers(ciphertext, authTag);
  let plainBlock: ArrayBuffer;
  try {
    plainBlock = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ab(parsedGcmIv), tagLength: 128 },
      aesKey,
      ab(gcmInput)
    );
  } catch {
    throw new Error("Authentication failed — wrong Group Code or tampered glyph");
  }

  const plainView = new Uint8Array(plainBlock);
  for (let i = 0; i < MAGIC.length; i++) {
    if (plainView[i] !== MAGIC[i]) throw new Error("Incompatible glyph format — not a HexGlyph");
  }
  const version = plainView[4];
  if (version !== VERSION) throw new Error("Incompatible glyph version — update HexGlyph to decode this glyph");

  const ptLenOffset = 4 + 1 + 8 + 12;
  const ptLen = new DataView(plainBlock, ptLenOffset, 2).getUint16(0, false);
  const ptOffset = ptLenOffset + 2;
  const ptBytes = new Uint8Array(plainBlock, ptOffset, ptLen);
  return new TextDecoder().decode(ptBytes);
}

export async function runSelfTest(): Promise<{ ok: boolean; detail: string }> {
  const MSG = "HexGlyph self-test — https://example.com/verify?ok=1";
  const CODE = "SELFTEST-0000";
  try {
    const payload = await encodeFull(MSG, CODE);
    const decoded = await decodeFull(payload, CODE);
    if (decoded !== MSG) {
      return { ok: false, detail: `Text mismatch: got "${decoded}"` };
    }
    return { ok: true, detail: "Encode → decode roundtrip passed" };
  } catch (err: unknown) {
    return { ok: false, detail: (err as Error).message };
  }
}
