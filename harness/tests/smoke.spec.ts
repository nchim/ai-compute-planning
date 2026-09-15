import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { Session } from "../src/session";

const fixture = readFileSync(fileURLToPath(new URL("../../fixtures/abilene-1.json", import.meta.url)), "utf8");
const depreciation = "costs.gpu.depreciation_years";

test("smoke: load abilene-1, move depreciation, undo restores the plan byte-for-byte", async ({}, info) => {
  const baseURL = info.project.use.baseURL;
  const headless = info.project.use.headless;
  const session = await Session.launch({
    ...(baseURL === undefined ? {} : { baseURL }),
    ...(headless === undefined ? {} : { headless }),
  });
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

    await session.screenshot("final");
    expect(await session.getConsoleErrors()).toEqual([]);
  } finally {
    await session.close();
  }
});
