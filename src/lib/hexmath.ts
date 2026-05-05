export interface HexCell {
  q: number;
  r: number;
}

// R=17 only gives 114 bytes capacity (9 bytes max plaintext) — not enough for URLs.
// R=28 gives 2437 total cells → 2434 data cells → 304 bytes.
// With the 14-byte glyph header (gcmIv + rsLen) and 10 RS ECC bytes + 83 bytes
// of crypto overhead, this leaves 197 bytes of plaintext — enough for typical URLs.
export const GRID_RADIUS = 28;

export function hexNeighbors(q: number, r: number): HexCell[] {
  return [
    { q: q + 1, r: r },
    { q: q + 1, r: r - 1 },
    { q: q, r: r - 1 },
    { q: q - 1, r: r },
    { q: q - 1, r: r + 1 },
    { q: q, r: r + 1 },
  ];
}

export function hexRing(center: HexCell, radius: number): HexCell[] {
  if (radius === 0) return [{ q: center.q, r: center.r }];
  const results: HexCell[] = [];
  let q = center.q - radius;
  let r = center.r + radius;
  const directions: Array<{ dq: number; dr: number }> = [
    { dq:  1, dr:  0 },
    { dq:  1, dr: -1 },
    { dq:  0, dr: -1 },
    { dq: -1, dr:  0 },
    { dq: -1, dr:  1 },
    { dq:  0, dr:  1 },
  ];
  for (const dir of directions) {
    for (let i = 0; i < radius; i++) {
      results.push({ q, r });
      q += dir.dq;
      r += dir.dr;
    }
  }
  return results;
}

export function spiralCells(radius: number): HexCell[] {
  const cells: HexCell[] = [];
  for (let ring = 0; ring <= radius; ring++) {
    cells.push(...hexRing({ q: 0, r: 0 }, ring));
  }
  return cells;
}

export function axialToPixel(q: number, r: number, size: number): { x: number; y: number } {
  const x = size * (3 / 2) * q;
  const y = size * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r);
  return { x, y };
}

export function hexCorners(cx: number, cy: number, size: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angleDeg = 60 * i;
    const angleRad = (Math.PI / 180) * angleDeg;
    const x = cx + size * Math.cos(angleRad);
    const y = cy + size * Math.sin(angleRad);
    pts.push(`${x},${y}`);
  }
  return pts.join(" ");
}

export const ANCHOR_POSITIONS: HexCell[] = (() => {
  const ring = hexRing({ q: 0, r: 0 }, GRID_RADIUS);
  const total = ring.length;
  const step = total / 3;
  return [
    ring[0],
    ring[Math.round(step)],
    ring[Math.round(step * 2)],
  ];
})();

export function isAnchor(cell: HexCell): boolean {
  return ANCHOR_POSITIONS.some((a) => a.q === cell.q && a.r === cell.r);
}

export function getDataCells(): HexCell[] {
  return spiralCells(GRID_RADIUS).filter((c) => !isAnchor(c));
}

export function totalDataBits(): number {
  return getDataCells().length;
}

export function totalDataBytes(): number {
  return Math.floor(totalDataBits() / 8);
}
