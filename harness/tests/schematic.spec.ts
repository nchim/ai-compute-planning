import path from "node:path";

import { expect, test, type TestInfo } from "@playwright/test";

import { Session } from "../src/session";

const fixtureNames = ["abilene-1", "epoch-100mw", "nova-colo"];
const schematicRegion = '[data-region="site_schematic"]';
const scrubber = 'input[aria-label="time scrubber (month)"]';

function launch(info: TestInfo): Promise<Session> {
  const baseURL = info.project.use.baseURL;
  const headless = info.project.use.headless;
  return Session.launch({
    ...(baseURL === undefined ? {} : { baseURL }),
    ...(headless === undefined ? {} : { headless }),
  });
}

interface Geometry {
  readonly svg: { x: number; y: number; w: number; h: number };
  readonly blocks: { id: string; x: number; y: number; w: number; h: number }[];
  readonly labels: { id: string; heightPx: number; x: number; y: number; w: number; h: number }[];
}

/** On-screen boxes of the schematic, every block rect and every label (issue #39: labels and blocks must stay inside, readable). */
function measure(s: Session): Promise<Geometry> {
  return s.page.evaluate((region) => {
    const svg = document.querySelector(`${region} svg.schematic`);
    if (svg === null) throw new Error("schematic svg not rendered");
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    return {
      svg: box(svg),
      blocks: Array.from(svg.querySelectorAll("[data-block] rect")).map((r) => ({ id: r.closest("[data-block]")!.getAttribute("data-block")!, ...box(r) })),
      labels: Array.from(svg.querySelectorAll("[data-block] text")).map((t) => ({
        id: t.closest("[data-block]")!.getAttribute("data-block")!,
        heightPx: t.getBoundingClientRect().height,
        ...box(t),
      })),
    };
  }, schematicRegion);
}

/**
 * Loads each fixture, scrubs the phase reveal to its last month and screenshots the schematic region
 * to `<runDir>/schematic-<fixture>.png`, then checks on-screen geometry: every block and label inside
 * the SVG, labels at a readable, parcel-independent size, and a label on every hall.
 */
test("schematic: every fixture renders inside the parcel with readable labels", async ({}, info) => {
  const session = await launch(info);
  try {
    for (const name of fixtureNames) {
      await session.step(`schematic ${name}`, async (s) => {
        await s.loadFixture(name);
        await s.waitIdle();
        const range = s.page.locator(scrubber);
        const last = await range.getAttribute("max");
        if (last === null) throw new Error(`${name}: the scrubber has no max month`);
        await range.fill(last);
        await s.waitIdle();
        const file = path.join(s.runDir, `schematic-${name}.png`);
        await s.page.locator(schematicRegion).screenshot({ path: file });
        info.attachments.push({ name: `schematic-${name}`, path: file, contentType: "image/png" });

        const g = await measure(s);
        const inside = (b: { x: number; y: number; w: number; h: number }) =>
          b.x >= g.svg.x - 1 && b.y >= g.svg.y - 1 && b.x + b.w <= g.svg.x + g.svg.w + 1 && b.y + b.h <= g.svg.y + g.svg.h + 1;
        for (const b of g.blocks) expect(inside(b), `${name}: block ${b.id} is clipped`).toBe(true);
        for (const l of g.labels) {
          expect(inside(l), `${name}: label ${l.id} is clipped`).toBe(true);
          expect(l.heightPx, `${name}: label ${l.id} height`).toBeGreaterThan(8);
          expect(l.heightPx, `${name}: label ${l.id} height`).toBeLessThan(20);
        }
        const halls = g.blocks.filter((b) => b.id.startsWith("hall_"));
        expect(halls.length, `${name}: halls`).toBeGreaterThan(0);
        for (const h of halls) expect(g.labels.some((l) => l.id === h.id), `${name}: ${h.id} label`).toBe(true);
      });
    }
    expect(await session.getConsoleErrors()).toEqual([]);
  } finally {
    await session.close();
  }
});
