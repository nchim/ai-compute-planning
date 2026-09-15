// STUB: SitePlan has no t0 field; month 0 is taken as Jan 2026 (matches the wireframe's "m18 · Q3-27").
const T0_YEAR = 2026;

/** "Q3-27" for month 18. */
export function quarterLabel(month: number): string {
  const year = T0_YEAR + Math.floor(month / 12);
  const quarter = Math.floor((month % 12) / 3) + 1;
  return `Q${quarter}-${String(year).slice(2)}`;
}

/** "$7.4B", "$285M", "$15K", "$2.25". */
export function money(n: number, digits = 1): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(digits)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(digits)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(digits)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

export function pct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

export function num(n: number, digits = 0): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
