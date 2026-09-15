/** Tiny linear scale + tick helpers shared by the SVG chart primitives (no charting library). */
export interface Scale {
  (v: number): number;
  readonly domain: readonly [number, number];
}

export function linear(domain: readonly [number, number], range: readonly [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 === 0 ? 1 : d1 - d0;
  const fn = ((v: number) => r0 + ((v - d0) / span) * (r1 - r0)) as Scale & { domain: readonly [number, number] };
  fn.domain = domain;
  return fn;
}

export function extent(values: readonly number[], fallback: readonly [number, number] = [0, 1]): [number, number] {
  if (values.length === 0) return [fallback[0], fallback[1]];
  return [Math.min(...values), Math.max(...values)];
}

/** Evenly spaced "nice" ticks: at most `count`, step rounded to 1/2/5 × 10^k. */
export function ticks(domain: readonly [number, number], count = 5): number[] {
  const [lo, hi] = domain;
  if (hi <= lo) return [lo];
  const rough = (hi - lo) / count;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? pow;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

/** Chart margins shared by the primitives; width/height are viewBox units. */
export const frame = { w: 520, h: 200, left: 44, right: 12, top: 12, bottom: 24 } as const;
export const plot = {
  x0: frame.left,
  x1: frame.w - frame.right,
  y0: frame.h - frame.bottom,
  y1: frame.top,
} as const;
