/**
 * The shared `fixtures/*.json` SitePlans, bundled as raw protojson at build time (Vite glob) so the
 * Canvas dropdown and `__harness.loadFixture(name)` list exactly the files in the repo.
 */
const modules = import.meta.glob("../../fixtures/*.json", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

const byName = new Map<string, string>(
  Object.entries(modules).map(([path, raw]) => [path.slice(path.lastIndexOf("/") + 1).replace(/\.json$/, ""), raw]),
);

/** Fixture names (file names without `.json`), sorted. */
export const fixtureNames: readonly string[] = [...byName.keys()].sort();

/** The protojson of `fixtures/<name>.json`; throws naming the known fixtures for an unknown name. */
export function fixtureJson(name: string): string {
  const raw = byName.get(name);
  if (raw === undefined) throw new Error(`unknown fixture "${name}"; known: ${fixtureNames.join(", ")}`);
  return raw;
}
