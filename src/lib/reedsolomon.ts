const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x = x << 1;
    if (x & 0x100) x ^= 0x11d;
    x &= 0xff;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255];
}

function gfDiv(a: number, b: number): number {
  if (b === 0) throw new Error("Division by zero in GF");
  if (a === 0) return 0;
  return GF_EXP[(GF_LOG[a] + 255 - GF_LOG[b]) % 255];
}

function gfPow(x: number, power: number): number {
  return GF_EXP[(GF_LOG[x] * power) % 255];
}

function polyScale(p: Uint8Array, x: number): Uint8Array<ArrayBuffer> {
  const r = new Uint8Array(p.length);
  for (let i = 0; i < p.length; i++) r[i] = gfMul(p[i], x);
  return r;
}

function polyAdd(p: Uint8Array, q: Uint8Array): Uint8Array {
  const r = new Uint8Array(Math.max(p.length, q.length));
  for (let i = 0; i < p.length; i++) r[i + r.length - p.length] ^= p[i];
  for (let i = 0; i < q.length; i++) r[i + r.length - q.length] ^= q[i];
  return r;
}

function polyMul(p: Uint8Array, q: Uint8Array): Uint8Array<ArrayBuffer> {
  const r = new Uint8Array(p.length + q.length - 1);
  for (let i = 0; i < p.length; i++)
    for (let j = 0; j < q.length; j++)
      r[i + j] ^= gfMul(p[i], q[j]);
  return r;
}

function polyEval(p: Uint8Array, x: number): number {
  let y = p[0];
  for (let i = 1; i < p.length; i++) y = gfMul(y, x) ^ p[i];
  return y;
}

function rsGenPoly(nsym: number): Uint8Array {
  let g = new Uint8Array([1]);
  for (let i = 0; i < nsym; i++) {
    g = polyMul(g, new Uint8Array([1, gfPow(2, i)]));
  }
  return g;
}

export const ECC_NSYM = 10;

export function rsEncode(data: Uint8Array): Uint8Array {
  const gen = rsGenPoly(ECC_NSYM);
  const msg = new Uint8Array(data.length + ECC_NSYM);
  msg.set(data);
  for (let i = 0; i < data.length; i++) {
    const coeff = msg[i];
    if (coeff !== 0) {
      for (let j = 1; j < gen.length; j++) {
        msg[i + j] ^= gfMul(gen[j], coeff);
      }
    }
  }
  const out = new Uint8Array(data.length + ECC_NSYM);
  out.set(data);
  out.set(msg.slice(data.length), data.length);
  return out;
}

export function rsDecode(data: Uint8Array): Uint8Array {
  const msg = new Uint8Array(data);

  const syndromes = new Uint8Array(ECC_NSYM);
  let hasErrors = false;
  for (let i = 0; i < ECC_NSYM; i++) {
    syndromes[i] = polyEval(msg, gfPow(2, i));
    if (syndromes[i] !== 0) hasErrors = true;
  }

  if (!hasErrors) return msg.slice(0, msg.length - ECC_NSYM);

  let sigma = new Uint8Array([1]);
  let B = new Uint8Array([1]);
  let L = 0;
  let m = 1;
  let b = 1;

  for (let n = 0; n < ECC_NSYM; n++) {
    let d = syndromes[n];
    for (let i = 1; i <= L; i++) {
      if (i < sigma.length) d ^= gfMul(sigma[i], syndromes[n - i]);
    }
    B = new Uint8Array([0, ...B]);
    if (d === 0) { m++; continue; }
    const T = sigma.slice();
    const scaledB = polyScale(B, d);
    const paddedB = new Uint8Array(sigma.length > scaledB.length ? sigma.length : scaledB.length);
    paddedB.set(scaledB, paddedB.length - scaledB.length);
    const paddedSigma = new Uint8Array(paddedB.length);
    paddedSigma.set(sigma, paddedSigma.length - sigma.length);
    sigma = new Uint8Array(paddedB.length);
    for (let i = 0; i < paddedB.length; i++) sigma[i] = paddedSigma[i] ^ paddedB[i];

    if (2 * L <= n) {
      L = n + 1 - L;
      B = polyScale(T, gfDiv(1, d));
      m = 1;
    } else m++;
  }

  const errorPositions: number[] = [];
  for (let i = 0; i < msg.length; i++) {
    if (polyEval(sigma, gfPow(2, i)) === 0) {
      errorPositions.push(msg.length - 1 - i);
    }
  }

  if (errorPositions.length !== L) {
    throw new Error("RS decode failed: too many errors");
  }

  const omega = polyMul(syndromes, sigma).slice(0, ECC_NSYM);
  for (const pos of errorPositions) {
    const x = gfPow(2, msg.length - 1 - pos);
    const num = polyEval(omega, gfPow(2, msg.length - 1 - pos));
    let denom = 1;
    for (const otherPos of errorPositions) {
      if (otherPos !== pos) denom = gfMul(denom, 1 ^ gfMul(gfPow(2, msg.length - 1 - otherPos), x));
    }
    msg[pos] ^= gfMul(gfDiv(num, denom), x);
  }

  return msg.slice(0, msg.length - ECC_NSYM);
}
