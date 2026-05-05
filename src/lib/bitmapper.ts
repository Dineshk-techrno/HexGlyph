import { getDataCells, HexCell } from "./hexmath";

export function bytesToBits(data: Uint8Array): number[] {
  const bits: number[] = [];
  for (const byte of data) {
    for (let i = 7; i >= 0; i--) {
      bits.push((byte >> i) & 1);
    }
  }
  return bits;
}

export function bitsToBytes(bits: number[]): Uint8Array {
  const byteCount = Math.floor(bits.length / 8);
  const result = new Uint8Array(byteCount);
  for (let i = 0; i < byteCount; i++) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | (bits[i * 8 + j] ?? 0);
    }
    result[i] = byte;
  }
  return result;
}

export interface CellBitMap {
  cell: HexCell;
  bit: number;
}

export function mapBitsToCells(data: Uint8Array): CellBitMap[] {
  const cells = getDataCells();
  const bits = bytesToBits(data);
  const result: CellBitMap[] = [];
  for (let i = 0; i < cells.length && i < bits.length; i++) {
    result.push({ cell: cells[i], bit: bits[i] });
  }
  return result;
}

export function unmapCellsToBytes(cellValues: number[]): Uint8Array {
  return bitsToBytes(cellValues);
}
