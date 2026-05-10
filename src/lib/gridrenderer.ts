import { axialToPixel, hexCorners, ANCHOR_POSITIONS, getDataCells, spiralCells, GRID_RADIUS, isAnchor } from "./hexmath";
import { mapBitsToCells } from "./bitmapper";

const CELL_SIZE = 18;
const PADDING = 30;
const ANCHOR_COLOR = "#FF6B35";
const LIT_COLOR = "#F0F0F0";
const DARK_COLOR = "#1A1A2E";
const BG_COLOR = "#0F0F1A";

export function renderGlyphSVG(payload: Uint8Array): string {
  const cellMap = mapBitsToCells(payload);

  const cellBits = new Map<string, number>();

  for (const { cell, bit } of cellMap) {
    cellBits.set(`${cell.q},${cell.r}`, bit);
  }

  const allCells = spiralCells(GRID_RADIUS);
  const cornerSize = CELL_SIZE * 0.9;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const cell of allCells) {
    const { x, y } = axialToPixel(cell.q, cell.r, CELL_SIZE);

    if (x - cornerSize < minX) minX = x - cornerSize;
    if (x + cornerSize > maxX) maxX = x + cornerSize;
    if (y - cornerSize < minY) minY = y - cornerSize;
    if (y + cornerSize > maxY) maxY = y + cornerSize;
  }

  const gridW = Math.ceil(maxX - minX) + PADDING * 2;
  const gridH = Math.ceil(maxY - minY) + PADDING * 2;

  const squareSize = Math.max(gridW, gridH);

  const extraX = Math.floor((squareSize - gridW) / 2);
  const extraY = Math.floor((squareSize - gridH) / 2);

  const cx = -minX + PADDING + extraX;
  const cy = -minY + PADDING + extraY;

  let svgCells = "";

  for (const cell of allCells) {
    const { x, y } = axialToPixel(cell.q, cell.r, CELL_SIZE);

    const px = cx + x;
    const py = cy + y;

    const pts = hexCorners(px, py, cornerSize);

    if (isAnchor(cell)) {
      svgCells += `<polygon points="${pts}" fill="${ANCHOR_COLOR}" />`;
    } else {
      const bit = cellBits.get(`${cell.q},${cell.r}`) ?? 0;

      const fill = bit === 1 ? LIT_COLOR : DARK_COLOR;

      svgCells += `<polygon points="${pts}" fill="${fill}" />`;
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${squareSize}" height="${squareSize}" viewBox="0 0 ${squareSize} ${squareSize}">
  <rect width="${squareSize}" height="${squareSize}" fill="${BG_COLOR}" />
  ${svgCells}
</svg>`;
}

export async function svgToPng(
  svgString: string,
  maxSize = 1024
): Promise<string> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgString], {
      type: "image/svg+xml;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);

    const img = new Image();

    img.onload = () => {
      const svgW = img.naturalWidth || img.width || maxSize;
      const svgH = img.naturalHeight || img.height || maxSize;

      const scale = Math.min(maxSize / svgW, maxSize / svgH);

      const canvas = document.createElement("canvas");

      canvas.width = Math.round(svgW * scale);
      canvas.height = Math.round(svgH * scale);

      const ctx = canvas.getContext("2d")!;

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      URL.revokeObjectURL(url);

      resolve(canvas.toDataURL("image/png"));
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);

      reject(new Error("Failed to render SVG to PNG"));
    };

    img.src = url;
  });
}

function isNative(): boolean {
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

export async function downloadSVG(
  svgString: string,
  filename = "hexglyph.svg"
): Promise<void> {

  const blob = new Blob([svgString], {
    type: "image/svg+xml",
  });

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");

  a.href = url;
  a.download = filename;

  document.body.appendChild(a);

  a.click();

  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

export async function downloadPNG(
  svgString: string,
  filename = "hexglyph.png",
  maxSize = 1024
): Promise<void> {

  const dataUrl = await svgToPng(svgString, maxSize);

  const a = document.createElement("a");

  a.href = dataUrl;
  a.download = filename;

  document.body.appendChild(a);

  a.click();

  document.body.removeChild(a);
      }
