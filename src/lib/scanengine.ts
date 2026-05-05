import { axialToPixel, ANCHOR_POSITIONS, getDataCells, GRID_RADIUS } from "./hexmath";
import { unmapCellsToBytes } from "./bitmapper";

const CELL_SIZE = 18;
const PADDING = 30;

const MIN_ANCHOR_PIXELS = 8;

interface Blob {
  pixels: number[];
  sumX: number;
  sumY: number;
}

function isOrangePixel(r: number, g: number, b: number): boolean {
  if (r < 80) return false;
  const total = r + g + b;
  if (total < 30) return false;
  const rN = r / total;
  const gN = g / total;
  const bN = b / total;
  return rN > 0.35 && gN > 0.10 && gN < 0.50 && bN < 0.35;
}

function isOrangePixelLoose(r: number, g: number, b: number): boolean {
  if (r < 60) return false;
  const total = r + g + b;
  if (total < 20) return false;
  const rN = r / total;
  const bN = b / total;
  return rN > 0.30 && bN < 0.40 && r > g * 0.9;
}

function buildMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  loose: boolean,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  const fn = loose ? isOrangePixelLoose : isOrangePixel;
  for (let i = 0; i < width * height; i++) {
    if (fn(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])) mask[i] = 1;
  }
  return mask;
}

function connectedComponents(mask: Uint8Array, width: number, height: number): Blob[] {
  const labels = new Int32Array(width * height).fill(-1);
  const blobs: Blob[] = [];
  let nextLabel = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!mask[idx] || labels[idx] >= 0) continue;

      const label = nextLabel++;
      blobs.push({ pixels: [], sumX: 0, sumY: 0 });
      const queue: number[] = [idx];
      labels[idx] = label;

      while (queue.length > 0) {
        const cur = queue.pop()!;
        const cx = cur % width;
        const cy = Math.floor(cur / width);
        blobs[label].pixels.push(cur);
        blobs[label].sumX += cx;
        blobs[label].sumY += cy;

        for (const n of [cur - 1, cur + 1, cur - width, cur + width]) {
          if (n < 0 || n >= width * height) continue;
          const nx = n % width;
          const ny = Math.floor(n / width);
          if (Math.abs(nx - cx) > 1 || Math.abs(ny - cy) > 1) continue;
          if (mask[n] && labels[n] < 0) {
            labels[n] = label;
            queue.push(n);
          }
        }
      }
    }
  }
  return blobs;
}

interface AffineTransform {
  a: number; b: number; c: number;
  d: number; e: number; f: number;
}

function computeAffine(
  srcPoints: [number, number][],
  dstPoints: [number, number][],
): AffineTransform {
  const [x0, y0] = srcPoints[0]; const [u0, v0] = dstPoints[0];
  const [x1, y1] = srcPoints[1]; const [u1, v1] = dstPoints[1];
  const [x2, y2] = srcPoints[2]; const [u2, v2] = dstPoints[2];

  const detM = x0 * (y1 - y2) - y0 * (x1 - x2) + (x1 * y2 - x2 * y1);
  if (Math.abs(detM) < 1e-8) throw new Error("Glyph anchor markers are collinear — cannot align glyph. Ensure the image is not skewed or cropped.");

  const ia  = (u0 * (y1 - y2) - y0 * (u1 - u2) + (u1 * y2 - u2 * y1)) / detM;
  const ib  = (x0 * (u1 - u2) - u0 * (x1 - x2) + (x1 * u2 - x2 * u1)) / detM;
  const ic  = (x0 * (y1 * u2 - y2 * u1) - y0 * (x1 * u2 - x2 * u1) + u0 * (x1 * y2 - x2 * y1)) / detM;
  const id  = (v0 * (y1 - y2) - y0 * (v1 - v2) + (v1 * y2 - v2 * y1)) / detM;
  const ie  = (x0 * (v1 - v2) - v0 * (x1 - x2) + (x1 * v2 - x2 * v1)) / detM;
  const iff = (x0 * (y1 * v2 - y2 * v1) - y0 * (x1 * v2 - x2 * v1) + v0 * (x1 * y2 - x2 * y1)) / detM;

  return { a: ia, b: ib, c: ic, d: id, e: ie, f: iff };
}

function applyAffine(t: AffineTransform, x: number, y: number): [number, number] {
  return [t.a * x + t.b * y + t.c, t.d * x + t.e * y + t.f];
}

function sampleBrightness(imageData: ImageData, px: number, py: number, radius = 2): number {
  const { data, width, height } = imageData;
  let sum = 0;
  let count = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = Math.round(px + dx);
      const y = Math.round(py + dy);
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      const i = (y * width + x) * 4;
      sum += (data[i] + data[i + 1] + data[i + 2]) / (3 * 255);
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

function findAnchorBlobs(imageData: ImageData): Blob[] {
  const { data, width, height } = imageData;

  for (const loose of [false, true]) {
    const mask = buildMask(data as Uint8ClampedArray, width, height, loose);
    const blobs = connectedComponents(mask, width, height)
      .filter(b => b.pixels.length >= MIN_ANCHOR_PIXELS);
    blobs.sort((a, b) => b.pixels.length - a.pixels.length);

    if (blobs.length >= 3) return blobs.slice(0, 3);
  }

  throw new Error(
    "No valid glyph detected — the orange anchor markers were not found. " +
    "Ensure you are scanning a HexGlyph image (not a QR code or other format), " +
    "the image is well-lit and in focus, and the glyph fills most of the frame."
  );
}

export interface ScanResult {
  payload: Uint8Array;
}

export async function scanImage(imageData: ImageData): Promise<ScanResult> {
  const { width, height } = imageData;

  // Guard: reject zero-dimension or obviously blank images before any processing
  if (!width || !height) {
    throw new Error("Invalid image — zero dimensions");
  }

  const top3 = findAnchorBlobs(imageData);
  const detected: [number, number][] = top3.map(b => [
    b.sumX / b.pixels.length,
    b.sumY / b.pixels.length,
  ]);

  const imgSize = Math.min(width, height);
  // svgSize must match the squareSize produced by gridrenderer.ts, which uses
  // the same CELL_SIZE, GRID_RADIUS, and PADDING constants.
  const svgSize = Math.ceil(2 * (CELL_SIZE * Math.sqrt(3) * GRID_RADIUS + CELL_SIZE * 0.9)) + PADDING * 2;
  const scale   = imgSize / svgSize;

  const idealAnchorPixels: [number, number][] = ANCHOR_POSITIONS.map(cell => {
    const { x, y } = axialToPixel(cell.q, cell.r, CELL_SIZE * scale);
    return [width / 2 + x, height / 2 + y];
  });

  const detCx = (detected[0][0] + detected[1][0] + detected[2][0]) / 3;
  const detCy = (detected[0][1] + detected[1][1] + detected[2][1]) / 3;
  const idealCx = (idealAnchorPixels[0][0] + idealAnchorPixels[1][0] + idealAnchorPixels[2][0]) / 3;
  const idealCy = (idealAnchorPixels[0][1] + idealAnchorPixels[1][1] + idealAnchorPixels[2][1]) / 3;

  detected.sort((a, b) =>
    Math.atan2(a[1] - detCy, a[0] - detCx) - Math.atan2(b[1] - detCy, b[0] - detCx),
  );
  idealAnchorPixels.sort((a, b) =>
    Math.atan2(a[1] - idealCy, a[0] - idealCx) - Math.atan2(b[1] - idealCy, b[0] - idealCx),
  );

  const transform = computeAffine(idealAnchorPixels, detected);

  const dataCells = getDataCells();
  const cellValues: number[] = [];

  for (const cell of dataCells) {
    const { x, y } = axialToPixel(cell.q, cell.r, CELL_SIZE * scale);
    const idealPx = width / 2 + x;
    const idealPy = height / 2 + y;
    const [detPx, detPy] = applyAffine(transform, idealPx, idealPy);
    cellValues.push(sampleBrightness(imageData, detPx, detPy) > 0.5 ? 1 : 0);
  }

  const payload = unmapCellsToBytes(cellValues);
  return { payload };
}
