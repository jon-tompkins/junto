// Squarified treemap layout (Bruls, Huijsen, van Wijk 2000).
// Tile area is proportional to value; rows are oriented along the shorter side
// to keep tile aspect ratios near 1.

export interface TreemapTile<T> {
  x: number;
  y: number;
  w: number;
  h: number;
  data: T;
}

export function squarifiedTreemap<T>(
  items: { value: number; data: T }[],
  width: number,
  height: number,
): TreemapTile<T>[] {
  if (items.length === 0 || width <= 0 || height <= 0) return [];
  const sorted = [...items].filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const total = sorted.reduce((s, i) => s + i.value, 0);
  if (total === 0) return [];
  const scale = (width * height) / total;
  const scaled = sorted.map((i) => ({ area: i.value * scale, data: i.data }));
  const result: TreemapTile<T>[] = [];
  layoutRow(scaled, 0, 0, width, height, result);
  return result;
}

function worstAspect(areas: number[], side: number): number {
  if (areas.length === 0 || side === 0) return Infinity;
  const sum = areas.reduce((s, a) => s + a, 0);
  const max = Math.max(...areas);
  const min = Math.min(...areas);
  if (sum === 0 || min === 0) return Infinity;
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
}

function layoutRow<T>(
  items: { area: number; data: T }[],
  x: number,
  y: number,
  w: number,
  h: number,
  out: TreemapTile<T>[],
) {
  if (items.length === 0 || w <= 0 || h <= 0) return;
  if (items.length === 1) {
    out.push({ x, y, w, h, data: items[0].data });
    return;
  }
  const side = Math.min(w, h);
  const row: typeof items = [];
  let bestWorst = Infinity;
  let i = 0;
  while (i < items.length) {
    const candidate = [...row.map((r) => r.area), items[i].area];
    const candidateWorst = worstAspect(candidate, side);
    if (row.length === 0 || candidateWorst <= bestWorst) {
      row.push(items[i]);
      bestWorst = candidateWorst;
      i++;
    } else {
      break;
    }
  }
  const rowSum = row.reduce((s, r) => s + r.area, 0);
  if (w <= h) {
    const rowH = rowSum / w;
    let cx = x;
    for (const r of row) {
      const cw = r.area / rowH;
      out.push({ x: cx, y, w: cw, h: rowH, data: r.data });
      cx += cw;
    }
    layoutRow(items.slice(i), x, y + rowH, w, h - rowH, out);
  } else {
    const rowW = rowSum / h;
    let cy = y;
    for (const r of row) {
      const ch = r.area / rowW;
      out.push({ x, y: cy, w: rowW, h: ch, data: r.data });
      cy += ch;
    }
    layoutRow(items.slice(i), x + rowW, y, w - rowW, h, out);
  }
}

export const STANCE_BG: Record<string, string> = {
  bullish: '#3ecf6a',
  bearish: '#e8453c',
  cautious: '#d97706',
  neutral: '#4b5563',
};

export const STANCE_LABEL: Record<string, string> = {
  bullish: 'Long',
  bearish: 'Short',
  cautious: 'Cautious',
  neutral: 'Neutral',
};

export function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}
