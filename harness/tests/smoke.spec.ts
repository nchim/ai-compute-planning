import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test, type TestInfo } from "@playwright/test";

import { Session } from "../src/session";

const fixturesDir = new URL("../../fixtures/", import.meta.url);
const fixture = readFileSync(fileURLToPath(new URL("abilene-1.json", fixturesDir)), "utf8");
const fixtureNames = readdirSync(fileURLToPath(fixturesDir))
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))
  .sort();
const depreciation = "costs.gpu.depreciation_years";

interface ResultShape {
  status?: string;
  conservation?: { all_passed?: boolean };
}

function launch(info: TestInfo): Promise<Session> {
  const baseURL = info.project.use.baseURL;
  const headless = info.project.use.headless;
  return Session.launch({
    ...(baseURL === undefined ? {} : { baseURL }),
    ...(headless === undefined ? {} : { headless }),
  });
}

async function expectCleanResult(s: Session, what: string): Promise<void> {
  const raw = await s.getResult();
  expect(raw, `${what}: Result`).not.toBeNull();
  const result = JSON.parse(raw as string) as ResultShape;
  expect(["OK", "OK_WITH_WARNINGS"], `${what}: Result.status ${result.status}`).toContain(result.status);
  expect(result.conservation?.all_passed, `${what}: conservation`).toBe(true);
}

test("smoke: load abilene-1, move depreciation, undo restores the plan byte-for-byte", async ({}, info) => {
  const session = await launch(info);
  try {
    const baseline = await session.step("load fixture", async (s) => {
      await s.loadPlan(fixture);
      await s.waitIdle();
      const result = await s.getResult();
      expect(result).not.toBeNull();
      const { status } = JSON.parse(result as string) as { status?: string };
      expect(status, "Result.status").toBeTruthy();
      return s.getPlan();
    });

    await session.step("set depreciation", async (s) => {
      await s.setControl(depreciation, 4);
      await s.waitIdle();
      const plan = await s.getPlan();
      expect(plan).not.toBe(baseline);
      const log = await s.getCommandLog();
      const setField = log.find((e) => e.command.type === "setField" && e.command["path"] === depreciation);
      expect(setField, "setField command in the log").toBeDefined();
      expect(setField?.rejected).toBeNull();
    });

    await session.step("undo", async (s) => {
      await s.undo();
      await s.waitIdle();
      expect(await s.getPlan()).toBe(baseline);
    });

    await session.step("pin baseline, compare, undo leaves it", async (s) => {
      await expect(s.toggleCompare(), "compare before a baseline").rejects.toThrow("no baseline");
      await s.setBaseline("single-shot");
      expect((await s.getBaseline())?.label).toBe("single-shot");
      await s.setControl(depreciation, 4);
      await s.waitIdle();
      await s.toggleCompare();
      const ctx = (await s.getViewContext()) as { compare: boolean; baselineSummary: unknown };
      expect(ctx.compare).toBe(true);
      expect(ctx.baselineSummary).not.toBeNull();
      expect(await s.page.locator(".tile .delta").count()).toBeGreaterThan(0);
      expect(await s.page.locator(".step-chart .line.baseline").count()).toBe(2);
      await s.undo();
      await s.waitIdle();
      expect(await s.getPlan()).toBe(baseline);
      expect((await s.getBaseline())?.label).toBe("single-shot");
      expect(((await s.getViewContext()) as { compare: boolean }).compare).toBe(true);
    });

    await session.screenshot("final");
    expect(await session.getConsoleErrors()).toEqual([]);
  } finally {
    await session.close();
  }
});

test("smoke: every fixture loads by name, analyzes clean and survives a slider move", async ({}, info) => {
  expect(fixtureNames.length).toBeGreaterThanOrEqual(3);
  const session = await launch(info);
  try {
    for (const name of fixtureNames) {
      await session.step(`load ${name}`, async (s) => {
        await s.loadFixture(name);
        await s.waitIdle();
        expect(JSON.parse(await s.getPlan()).meta.plan_id).toBe(name);
        await expectCleanResult(s, name);
        await s.setControl(depreciation, 4);
        await s.waitIdle();
        expect(JSON.parse(await s.getPlan()).costs.gpu.depreciation_years).toBe(4);
        await expectCleanResult(s, `${name} after ${depreciation}=4`);
      });
    }
    await expect(session.loadFixture("no-such-fixture")).rejects.toThrow("unknown fixture");
    expect(await session.getConsoleErrors()).toEqual([]);
  } finally {
    await session.close();
  }
});
