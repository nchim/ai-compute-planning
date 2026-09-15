/**
 * docs/acceptance-session.md T1–T7 over one `Session`. `COPILOT_MODE=scripted` (default, the CI
 * gate) has the harness issue the tool calls the Copilot is expected to make; `COPILOT_MODE=live`
 * sends the human's words to the real Copilot and additionally checks its narration. Both modes
 * assert the same engine/UI facts per turn and archive every turn under harness/runs/<ts>/.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type TestInfo } from "@playwright/test";

import { Session, type Json, type PatchEntry } from "../src/session";
import { KEY_PANEL_SELECTOR, copilotSnapshot, copilotTurn, keyInitScript, loadApiKey, transcriptInitScript, turnMarkdown, type Effort, type Turn } from "./lib/copilot";
import { appliedOptimization, lastSeq, mutationsSince } from "./lib/log";
import { deltaFacts, missingDimensions, numbersIn, traceable, untraceable } from "./lib/narration";
import { conservationGreen, findDiagnostic, metric, numbersOf, parsePlan, parseResult, type Result } from "./lib/result";

type Mode = "scripted" | "live";
const mode = modeFromEnv();
const live = mode === "live";

const rawFixture = readFileSync(fileURLToPath(new URL("../../fixtures/abilene-1.json", import.meta.url)), "utf8");

/** The human's words, verbatim from docs/acceptance-session.md. */
const H = {
  t1: "Give me the picture on Abilene-1.",
  t2: "Push density to 130 kW/rack so we shrink the footprint.",
  t3: "We can't wait until 2029. Phase this to track demand and keep cost sane. Cap capex at $8B and never be short more than 20 MW.",
  t3b: "How much better is this than the baseline?",
  t4: "How robust is our LCOC, and where's the downside?",
  t5: "What if utilization is only 65%?",
  t6: "What just changed?",
  t7: "Summarize the recommendation for the steering committee across space, time, capital and risk, and remind me why a gas bridge is worth the premium.",
  t8: "Different idea: a colo operator has offered us 100 MW in Phoenix from Q1-2027 at a fixed $/kW-month for five years. Should we take that instead of building Abilene-1? What would you need to know to be sure?",
} as const;

/**
 * Cross-cutting performance budgets (WASM): a plain Analyze, and one carrying 1,000 Monte Carlo
 * draws. Live runs are recorded with `slowMo`, which taxes every harness call; they get some slack.
 */
const slowMoSlackMs = live ? 300 : 0;
const budgetMs = { analyze: 100 + slowMoSlackMs, monteCarlo: 1000 + slowMoSlackMs } as const;
/**
 * Budgets are hard on a developer machine and soft on shared CI runners (2 vCPU, WASM single-threaded),
 * where wall time says more about the runner than the engine: there a miss is logged and archived in
 * timings.json, not failed. `ACCEPTANCE_ENFORCE_BUDGETS=1` makes them hard anywhere.
 */
const enforceBudgets = process.env.ACCEPTANCE_ENFORCE_BUDGETS === "1" || !process.env.CI;
function withinBudget(ms: number, limit: number, label: string): void {
  if (enforceBudgets) expect(ms, label).toBeLessThanOrEqual(limit);
  else if (ms > limit) console.warn(`budget (soft on CI): ${label} took ${ms} ms > ${limit} ms`);
}
/** Timings the run archives (timings.json) so a budget miss in CI can be read, not guessed. */
const timings: Record<string, number> = {};
const gridMonth = 30;

// T3's acceptance inputs: the BTM gas bridge, the phasing policy and the capex cap.
const gasSource: PatchEntry[] = [
  { path: "power.sources[1].id", value: "gas" },
  { path: "power.sources[1].type", value: "BTM_GAS" },
  { path: "power.sources[1].capacity_mw", value: 80 },
  { path: "power.sources[1].available_month", value: 12 },
  { path: "power.sources[1].cost_per_mwh", value: 85 },
  { path: "power.sources[1].capex_per_kw", value: 1200 },
  { path: "power.sources[1].lead_time_months", value: 12 },
];
const optimizerSetup: PatchEntry[] = [
  { path: "phasing.policy.max_phases", value: 4 },
  { path: "phasing.policy.min_phase_mw", value: 25 },
  { path: "phasing.policy.max_phase_mw", value: 100 },
  { path: "phasing.policy.min_months_between_phases", value: 6 },
  { path: "phasing.policy.max_shortfall_mw", value: 20 },
  { path: "optimization.objective.type", value: "MIN_STRANDED_PLUS_LCOC" },
  { path: "optimization.constraints[0].metric", value: "total_capex" },
  { path: "optimization.constraints[0].op", value: "LE" },
  { path: "optimization.constraints[0].value", value: 8e9 },
];
// T4's risk setup: distributions on the master levers, seeded Monte Carlo, sensitivity on the levers.
const riskSetup: PatchEntry[] = [
  { path: "risk.distributions[0].input_path", value: "revenue.compute.gpu_hour_price" },
  { path: "risk.distributions[0].type", value: "TRIANGULAR" },
  { path: "risk.distributions[0].params[0]", value: 2.5 },
  { path: "risk.distributions[0].params[1]", value: 3.25 },
  { path: "risk.distributions[0].params[2]", value: 4 },
  { path: "risk.distributions[1].input_path", value: "revenue.compute.utilization_pct" },
  { path: "risk.distributions[1].type", value: "NORMAL" },
  { path: "risk.distributions[1].params[0]", value: 80 },
  { path: "risk.distributions[1].params[1]", value: 8 },
  { path: "risk.distributions[2].input_path", value: "costs.gpu.depreciation_years" },
  { path: "risk.distributions[2].type", value: "UNIFORM" },
  { path: "risk.distributions[2].params[0]", value: 3 },
  { path: "risk.distributions[2].params[1]", value: 7 },
  { path: "run.monte_carlo.enabled", value: true },
  { path: "run.monte_carlo.iterations", value: 1000 },
  { path: "run.monte_carlo.seed", value: 42 },
  { path: "run.sensitivity.enabled", value: true },
  { path: "run.sensitivity.input_paths[0]", value: "revenue.compute.gpu_hour_price" },
  { path: "run.sensitivity.input_paths[1]", value: "revenue.compute.utilization_pct" },
  { path: "run.sensitivity.input_paths[2]", value: "costs.gpu.depreciation_years" },
  { path: "run.sensitivity.input_paths[3]", value: "costs.gpu.unit_cost" },
];

interface Checkpoint {
  readonly plan: string;
  readonly result: Result;
  readonly seq: number;
}

/** The turns in session order; T8 has no scripted path. Resume points are turn ids. */
type TurnId = "T1" | "T2" | "T3" | "T3b" | "T4" | "T5" | "T6" | "T7" | "T8";
const order: readonly TurnId[] = ["T1", "T2", "T3", "T3b", "T4", "T5", "T6", "T7", "T8"];
const stepName: Record<TurnId, string> = {
  T1: "T1 orientation",
  T2: "T2 density diagnostics",
  T3: "T3 optimize phasing",
  T3b: "T3b baseline compare",
  T4: "T4 monte carlo",
  T5: "T5 utilization what-if",
  T6: "T6 undo and depreciation slider",
  T7: "T7 summary and replay",
  T8: "T8 build vs buy",
};
/** Reasoning effort per live turn: the what-ifs are cheap, the optimize/summary/advice turns are not. */
const effort: Partial<Record<TurnId, Effort>> = { T3: "high", T5: "low", T6: "low", T7: "high", T8: "high" };

/** `ACCEPTANCE_RESUME_FROM=<turn>` replays a previous run's archive up to that turn and starts there. */
const resumeFrom = resumeTurnFromEnv();
/** `ACCEPTANCE_MC_ITERATIONS` (default 1,000) lets iteration runs draw fewer Monte Carlo samples. */
const mcIterations = Number(process.env.ACCEPTANCE_MC_ITERATIONS ?? 1000);
const fixture = withIterations(rawFixture, mcIterations);

test.describe.configure({ timeout: live ? 30 * 60_000 : 5 * 60_000 });

test(`acceptance session: Abilene-1 T1–T8 (${mode}${resumeFrom === null ? "" : `, resumed at ${resumeFrom}`})`, async ({}, info) => {
  const previous = resumeFrom === null ? null : previousRun();
  const session = await launch(info, previous);
  const grounding = new Grounding(session);
  const checkpoints: Partial<Record<TurnId, Checkpoint>> = {};
  const cp = (id: TurnId): Checkpoint => {
    const c = checkpoints[id];
    if (c === undefined) throw new Error(`${id} has not run (or was not archived) yet`);
    return c;
  };

  const turns: Record<TurnId, (s: Session) => Promise<Checkpoint | void>> = {
    // ---- T1 — Orientation ---------------------------------------------------------------------
    async T1(s) {
      await s.loadPlan(fixture);
      await s.waitIdle();
      await grounding.learn(s);
      if (live) await grounding.turn(s, "T1", H.t1);
      const result = parseResult(await s.getResult());
      expect(result.status).toBe("OK");
      expect(conservationGreen(result)).toBe(true);
      expect(metric(result, "time_to_energize_months")).toBe(gridMonth);
      expect(metric(result, "demand_capture_pct"), "grid arrives late vs. the ramp").toBeLessThan(90);
      return checkpoint(s, result);
    },

    // ---- T2 — A bad idea, caught early ---------------------------------------------------------
    async T2(s) {
      const t1 = cp("T1");
      let firstResult: Result;
      let fixMs: number;
      if (live) {
        const turn = await grounding.turn(s, "T2", H.t2);
        firstResult = firstInvalidResult(turn);
        fixMs = 0; // the Copilot's own analyze timings are not observable from here
      } else {
        await s.acceptCard(await s.proposeChange("Push density to 130 kW/rack", [{ path: "compute.kw_per_rack", value: 130 }]));
        await s.waitIdle();
        firstResult = parseResult(await s.getResult());
        // Fix exactly the fields the diagnostics name (plus the NVL72 rack that keeps GPU count constant).
        await s.setControl("compute.cooling", "LIQUID_DTC");
        await s.setControl("site.floor_load_psf", requiredPsf(firstResult));
        await s.setControl("compute.gpus_per_rack", 72);
        fixMs = timings["T2 analyze after fix"] = await timedIdle(s);
      }
      expect(firstResult.status).toBe("INVALID_INPUT");
      // The slab is always too light for 130 kW/rack; the cooling error only fires when cooling was left on
      // AIR (a live Copilot may bundle the cooling switch into its proposal, which the doc allows).
      expect(findDiagnostic(firstResult, "FLOOR_LOAD_INSUFFICIENT")?.proto_path).toBe("site.floor_load_psf");
      const density = findDiagnostic(firstResult, "DENSITY_EXCEEDS_COOLING");
      if (!live) expect(density, "DENSITY_EXCEEDS_COOLING on the naive proposal").toBeDefined();
      if (density !== undefined) expect(density.proto_path).toBe("compute.kw_per_rack");
      for (const d of firstResult.diagnostics ?? []) expect(d, `diagnostic ${d.code} is complete`).toMatchObject({ proto_path: expect.any(String), expected: expect.any(String), actual: expect.any(String), hint: expect.any(String) });

      const allowed = new Set(["compute.kw_per_rack", "compute.cooling", "site.floor_load_psf", "compute.gpus_per_rack"]);
      for (const m of mutationsSince(await s.getCommandLog(), t1.seq)) {
        for (const p of m.paths) expect(allowed.has(p), `T2 edited only the named fields, not ${p}`).toBe(true);
      }
      const result = parseResult(await s.getResult());
      expect(result.status).toBe("OK");
      expect(conservationGreen(result)).toBe(true);
      expect(result.schematic?.footprint_used_pct).toBeLessThan(t1.result.schematic?.footprint_used_pct ?? 0);
      expect(metric(result, "capex_per_mw"), "agility premium is a visible capex line").toBeGreaterThan(metric(t1.result, "capex_per_mw"));
      if (!live) withinBudget(fixMs, budgetMs.analyze, "Analyze after the fix");
      return checkpoint(s, result);
    },

    // ---- T3 — Phase to the demand ramp ---------------------------------------------------------
    async T3(s) {
      const t2 = cp("T2");
      // T3b: the human pins the single-shot plan before anything is optimized.
      await s.setBaseline("single-shot");
      let optimization: Result;
      if (live) {
        const turn = await grounding.turn(s, "T3", H.t3);
        expect(turn.toolCalls.some((c) => c.name === "run_optimize" && !c.isError), "the Copilot ran the optimizer").toBe(true);
        optimization = appliedOptimization(await s.getCommandLog(), t2.seq, parsePlan(await s.getPlan()));
      } else {
        await s.acceptCard(await s.proposeChange("Add a BTM gas bridge and the optimizer policy", [...gasSource, ...optimizerSetup]));
        await s.waitIdle();
        optimization = parseResult(await s.optimize());
        const best = optimization.optimization?.best_plan?.phasing?.phases ?? [];
        await s.acceptCard(await s.proposeChange("Apply optimized phasing", phasePatch(best)));
        await s.waitIdle();
      }
      expectConvergedAndBetter(optimization);

      const result = parseResult(await s.getResult());
      const plan = parsePlan(await s.getPlan());
      expect(result.status).toBe("OK");
      expect(conservationGreen(result)).toBe(true);
      expect(metric(result, "demand_capture_pct")).toBeGreaterThan(metric(t2.result, "demand_capture_pct"));
      expect(metric(result, "stranded_capacity_mw_months")).toBeLessThan(metric(t2.result, "stranded_capacity_mw_months"));
      expect(metric(result, "total_capex")).toBeLessThanOrEqual(8e9);

      const phases = plan.phasing?.phases ?? [];
      expect(plan.phasing?.mode).toBe("EXPLICIT");
      expect(phases.length).toBeGreaterThanOrEqual(2);
      const first = phases[0]!;
      const firstSource = plan.power?.sources?.find((src) => src.id === first.power_source_id);
      expect(firstSource?.type, "first phase rides the BTM gas bridge").toBe("BTM_GAS");
      expect(first.energize_month ?? 0).toBeLessThan(gridMonth);
      expectStrictlyIncreasing(phases.map((p) => p.energize_month ?? 0), "phase energize months");
      expectStrictlyIncreasing(phaseEnergizeMonths(result), "schematic block energize months");

      // The timeline scrubber reveals the phases one by one (a human control; it dispatches `select`).
      const scrubber = s.page.locator('input[aria-label="time scrubber (month)"]');
      await scrubber.fill(String(first.energize_month));
      // `.block` scopes to the live plan's halls (compare mode also draws the baseline's, ghosted).
      await expect(s.page.locator('.block[data-block^="hall_"]')).toHaveCount(1);
      await s.screenshot("T3 scrubber at first phase");
      await scrubber.fill(String(phases.at(-1)?.energize_month));
      await expect(s.page.locator('.block[data-block^="hall_"]')).toHaveCount(phases.length);
      return checkpoint(s, result);
    },

    // ---- T3b — Pin and compare -----------------------------------------------------------------
    async T3b(s) {
      const t2 = cp("T2");
      const t3 = cp("T3");
      const baseline = await s.getBaseline();
      expect(baseline?.label).toBe("single-shot");
      const baselineSummary = baseline?.summary as Record<string, unknown>;
      expect(baselineSummary["time_to_energize_months"], "baseline is the pre-optimization single shot").toBe(gridMonth);
      expect(baselineSummary["demand_capture_pct"]).toBe(metric(t2.result, "demand_capture_pct"));

      // Undo/redo move the plan, never the baseline.
      await s.undo();
      await s.waitIdle();
      expect((await s.getBaseline())?.label).toBe("single-shot");
      await s.redo();
      await s.waitIdle();
      expect(await s.getPlan()).toBe(t3.plan);

      // A live Copilot may already have switched compare on itself (it has the tool); the human only
      // toggles when it is off.
      if (!((await s.getViewContext()) as { compare: boolean }).compare) await s.toggleCompare();
      expect(((await s.getViewContext()) as { compare: boolean }).compare).toBe(true);
      const tiles = s.page.locator(".tile");
      await expect(s.page.locator(".tile .delta[data-delta]"), "every metric tile shows a Δ vs. baseline").toHaveCount(await tiles.count());
      const captureDelta = Number(await s.page.locator('[data-metric="demand_capture_pct"] .delta').getAttribute("data-delta"));
      expect(captureDelta).toBeCloseTo(metric(t3.result, "demand_capture_pct") - (baselineSummary["demand_capture_pct"] as number), 6);
      await expect(s.page.locator(".step-chart .line.baseline"), "ghosted baseline demand + capacity").toHaveCount(2);
      if (live) {
        grounding.addFacts(deltaFacts(flattenNumbers(baselineSummary as Json), flattenNumbers((t3.result.summary ?? {}) as Json)));
        await grounding.turn(s, "T3b", H.t3b);
      }
      return checkpoint(s, t3.result);
    },

    // ---- T4 — Monte Carlo + sensitivity --------------------------------------------------------
    async T4(s) {
      let mcMs = 0;
      if (live) {
        await grounding.turn(s, "T4", H.t4);
      } else {
        await s.acceptCard(await s.proposeChange("Distributions on the master levers; Monte Carlo + sensitivity", riskSetup));
        mcMs = timings["T4 monte carlo"] = await timedIdle(s);
      }
      const before = await s.getResult();
      const result = parseResult(before);
      expect(result.status).toBe("OK");
      expect(result.monte_carlo?.iterations).toBe(mcIterations);
      for (const key of ["lcoc_per_gpu_hour", "npv"]) {
        const dist = result.monte_carlo?.metrics?.[key];
        expect(dist, `Monte Carlo distribution for ${key}`).toBeDefined();
        expect(dist!.p10!).toBeLessThan(dist!.p50!);
        expect(dist!.p50!).toBeLessThan(dist!.p90!);
        expect(sum((dist!.histogram ?? []).map((b) => b.count ?? 0)), `${key} histogram counts`).toBe(mcIterations);
      }
      const vars = result.sensitivity?.vars ?? [];
      expect(new Set(vars.map((v) => v.target_metric))).toEqual(new Set(["lcoc_per_gpu_hour", "npv"]));
      const npvTop3 = vars.filter((v) => v.target_metric === "npv").slice(0, 3).map((v) => v.input_path);
      expect(npvTop3).toContain("revenue.compute.gpu_hour_price");
      expect(npvTop3).toContain("revenue.compute.utilization_pct");
      await expect(s.page.locator(".bands")).toHaveCount(2);

      // Same seed → byte-identical Result (the seed write forces a re-analyze of an identical plan).
      await s.setControl("run.monte_carlo.seed", 42);
      const rerunMs = (timings["T4 monte carlo rerun"] = await timedIdle(s));
      expect(await s.getResult(), "Monte Carlo is deterministic for a fixed seed").toBe(before);
      withinBudget(Math.max(mcMs, rerunMs), budgetMs.monteCarlo, `${mcIterations}-iteration Monte Carlo`);
      return checkpoint(s, result);
    },

    // ---- T5 — What-if on the linchpin ----------------------------------------------------------
    async T5(s) {
      const t4 = cp("T4");
      if (live) {
        const turn = await grounding.turn(s, "T5", H.t5);
        const breakeven = metric(parseResult(await s.getResult()), "utilization_breakeven_pct");
        expect(numbersIn(turn.text).some((n) => traceable(n, [breakeven])), `narration cites the breakeven (${breakeven.toFixed(1)}%)`).toBe(true);
      } else {
        await s.setControl("revenue.compute.utilization_pct", 65);
        await s.waitIdle();
      }
      const mutations = mutationsSince(await s.getCommandLog(), t4.seq);
      expect(mutations.map((m) => m.paths), "exactly one plan mutation this turn").toEqual([["revenue.compute.utilization_pct"]]);
      const result = parseResult(await s.getResult());
      expect(metric(result, "lcoc_per_gpu_hour")).toBeGreaterThan(metric(t4.result, "lcoc_per_gpu_hour"));
      return checkpoint(s, result);
    },

    // ---- T6 — Undo, then a human-driven lever --------------------------------------------------
    async T6(s) {
      const t4 = cp("T4");
      const t5 = cp("T5");
      await s.undo();
      await s.waitIdle();
      expect(await s.getPlan(), "undo restores the T4 plan byte-for-byte").toBe(t4.plan);
      const afterUndo = lastSeq(await s.getCommandLog());

      await s.page.locator('[data-path="costs.gpu.depreciation_years"] input[type="range"]').fill("4");
      const analyzeMs = (timings["T6 slider analyze"] = await timedIdle(s));
      expect(mutationsSince(await s.getCommandLog(), afterUndo).map((m) => m.paths)).toEqual([["costs.gpu.depreciation_years"]]);
      withinBudget(analyzeMs, budgetMs.monteCarlo, "slider re-analyze (Monte Carlo still enabled)");
      const result = parseResult(await s.getResult());
      expect(metric(result, "lcoc_per_gpu_hour"), "shorter GPU life raises LCOC").toBeGreaterThan(metric(t4.result, "lcoc_per_gpu_hour"));
      if (live) {
        const turn = await grounding.turn(s, "T6", H.t6);
        expect(turn.text, "the Copilot saw the slider move in the ViewContext").toMatch(/depreciation/i);
        expect(numbersIn(turn.text)).toContain(4);
        expect(mutationsSince(await s.getCommandLog(), t5.seq).length, "answering 'what changed' mutates nothing").toBe(1);
      }
      return checkpoint(s, result);
    },

    // ---- T7 — Steering-committee summary + cross-cutting checks -------------------------------
    async T7(s) {
      const plan = await s.getPlan();
      const before = await s.getResult();
      let messageCount = 0;
      if (live) {
        const turn = await grounding.turn(s, "T7", H.t7);
        expect(missingDimensions(turn.text), "all four dimensions named").toEqual([]);
        expect(grounding.transcript, "the transcript is archived").not.toBeNull();
        expect(turn.toolCalls.map((c) => c.name), "grounded in the research corpus").toContain("query_research");
        messageCount = turn.messageCount;
      }
      // Errors bubble: a malformed plan is rejected at the boundary and changes nothing.
      await expect(s.loadPlan("{not a plan")).rejects.toThrow("invalid SitePlan protojson");
      expect(await s.getPlan()).toBe(plan);

      // Determinism: the same plan bytes analyze to the same Result bytes (Monte Carlo included).
      if (live) await s.reload();
      await s.loadPlan(plan);
      await s.waitIdle();
      expect(await s.getResult(), "replay is byte-identical").toBe(before);
      if (live) {
        const restored = await copilotSnapshot(s);
        expect(restored.messages.length, "transcript restored after reload").toBe(messageCount);
      }
      expect(await s.getConsoleErrors(), "no page errors during the session").toEqual([]);
      return checkpoint(s, parseResult(before));
    },

    // ---- T8 — Open-ended advice (live only: no deterministic tool path to script) -------------
    async T8(s) {
      const turn = await grounding.turn(s, "T8", H.t8);
      expect(turn.toolCalls.map((c) => c.name), "pulled the build-vs-buy framing from the corpus").toContain("query_research");
      expect(turn.text, "an explicit recommendation").toMatch(/\brecommend/i);
      expect(turn.text, "an explicit list of unknowns").toMatch(/need to know|unknown|would need|open question|to be sure/i);
      expect(turn.text, "the timing / optionality argument").toMatch(/option(al)?(ity)?|buys? (us )?time|time to market|speed/i);
      // No fabricated colo economics: the human gave no $/kW figure, so none may appear as a fact.
      for (const m of turn.text.matchAll(/\$\s?(\d[\d,]*(?:\.\d+)?)\s*(?:\/|per)\s*kW/gi)) {
        const context = turn.text.slice(Math.max(0, (m.index ?? 0) - 160), (m.index ?? 0) + 40);
        expect(/assum|placeholder|illustrat|hypothet|if |say |e\.g\.|example|for instance|would need/i.test(context), `unsourced colo rate "${m[0]}" (context: …${context.trim()}…)`).toBe(true);
      }
    },
  };

  try {
    if (previous !== null) {
      await session.step(`resume from ${previous.dir}`, async (s) => {
        Object.assign(checkpoints, await replayArchive(s, previous, resumeFrom!, grounding));
      });
    }
    for (const id of order) {
      if (resumeFrom !== null && order.indexOf(id) < order.indexOf(resumeFrom)) continue;
      if (id === "T8" && !live) {
        info.annotations.push({ type: "skipped turn", description: "T8 is an open-ended advice turn with no deterministic tool path; live mode only" });
        continue;
      }
      const result = await session.step(stepName[id], turns[id]);
      if (result !== undefined) checkpoints[id] = result;
    }
    await session.screenshot("final");
  } finally {
    await session.writeArtifact("timings.json", JSON.stringify(timings, null, 2));
    await grounding.flush();
    await session.close();
  }
});

// ---- helpers -------------------------------------------------------------------------------------

function modeFromEnv(): Mode {
  const raw = process.env.COPILOT_MODE ?? "scripted";
  if (raw !== "scripted" && raw !== "live") throw new Error(`COPILOT_MODE must be "scripted" or "live", got "${raw}"`);
  return raw;
}

async function launch(info: TestInfo, previous: PreviousRun | null): Promise<Session> {
  const { baseURL, headless } = info.project.use;
  // Live: the key, plus the previous run's transcript when resuming, seeded before the app loads.
  const initScript = live ? [keyInitScript(loadApiKey()), previous?.transcript === null || previous === null ? "" : transcriptInitScript(previous.transcript)].join("\n") : undefined;
  return Session.launch({
    ...(baseURL === undefined ? {} : { baseURL }),
    ...(headless === undefined ? {} : { headless }),
    ...(initScript === undefined ? {} : { initScript, maskSelectors: [KEY_PANEL_SELECTOR] }),
  });
}

/** The fixture with `run.monte_carlo.iterations` set to the run's draw count. */
function withIterations(protojson: string, iterations: number): string {
  if (!Number.isInteger(iterations) || iterations < 1) throw new Error(`ACCEPTANCE_MC_ITERATIONS must be a positive integer, got ${iterations}`);
  const plan = JSON.parse(protojson) as { run: { monte_carlo: { iterations: number } } };
  plan.run.monte_carlo.iterations = iterations;
  return JSON.stringify(plan, null, 2);
}

function resumeTurnFromEnv(): TurnId | null {
  const raw = process.env.ACCEPTANCE_RESUME_FROM;
  if (raw === undefined || raw === "") return null;
  if (!(order as readonly string[]).includes(raw) || raw === "T1") throw new Error(`ACCEPTANCE_RESUME_FROM must be one of ${order.slice(1).join(", ")}, got "${raw}"`);
  if (!live) throw new Error("ACCEPTANCE_RESUME_FROM only applies to live mode (scripted runs take seconds)");
  return raw as TurnId;
}

interface PreviousRun {
  readonly dir: string;
  /** Per turn: the archived plan/result of that step, when the step ran and was archived. */
  readonly steps: Partial<Record<TurnId, { plan: string; result: string }>>;
  /** The raw Copilot transcript (localStorage form) archived by that run, if any. */
  readonly transcript: string | null;
}

/** `ACCEPTANCE_RESUME_RUN=<dir>` or the newest run under harness/runs, with its archived steps. */
function previousRun(): PreviousRun {
  const root = fileURLToPath(new URL("../runs/", import.meta.url));
  const dir = process.env.ACCEPTANCE_RESUME_RUN ?? readdirSync(root).filter((d) => /^\d{4}-/.test(d)).sort().map((d) => path.join(root, d)).at(-1);
  if (dir === undefined) throw new Error("ACCEPTANCE_RESUME_FROM: no previous run under harness/runs");
  const steps: Partial<Record<TurnId, { plan: string; result: string }>> = {};
  for (const entry of readdirSync(dir)) {
    const id = order.find((t) => entry.startsWith(`${entry.slice(0, 3)}${t.toLowerCase()}-`) && /^\d\d-/.test(entry));
    if (id === undefined) continue;
    const plan = path.join(dir, entry, "plan.json");
    const result = path.join(dir, entry, "result.json");
    if (!existsSync(plan) || !existsSync(result)) continue;
    const planText = readFileSync(plan, "utf8");
    if (planText === "null") continue;
    steps[id] = { plan: planText, result: readFileSync(result, "utf8") };
  }
  const transcriptFile = path.join(dir, "transcript.json");
  return { dir, steps, transcript: existsSync(transcriptFile) ? readFileSync(transcriptFile, "utf8") : null };
}

/**
 * Rebuilds the state the resume turn expects from the archive: every earlier turn's plan is loaded in
 * order (so undo history matches a fresh run), the baseline is pinned before T3's plan and compare
 * is switched on after T3b, the checkpoints come from the archived Results, and the grounding facts
 * cover everything the engine said before. Returns the reconstructed checkpoints.
 */
async function replayArchive(s: Session, previous: PreviousRun, from: TurnId, grounding: Grounding): Promise<Partial<Record<TurnId, Checkpoint>>> {
  const earlier = order.slice(0, order.indexOf(from));
  const checkpoints: Partial<Record<TurnId, Checkpoint>> = {};
  for (const id of earlier) {
    const step = previous.steps[id];
    if (step === undefined) throw new Error(`resume from ${from}: ${previous.dir} has no archived ${id} step`);
    if (id === "T3") await s.setBaseline("single-shot");
    await s.loadPlan(step.plan);
    await s.waitIdle();
    expect(await s.getResult(), `${id}'s archived Result reproduces on this engine`).toBe(step.result);
    grounding.learnFrom(step.plan, step.result);
    checkpoints[id] = { plan: step.plan, result: parseResult(step.result), seq: 0 };
  }
  if (earlier.includes("T3b")) await s.toggleCompare();
  const seq = lastSeq(await s.getCommandLog());
  for (const id of earlier) checkpoints[id] = { ...checkpoints[id]!, seq };
  return checkpoints;
}

async function checkpoint(s: Session, result: Result): Promise<Checkpoint> {
  return { plan: await s.getPlan(), result, seq: lastSeq(await s.getCommandLog()) };
}

/** Milliseconds until the store is idle again — the debounce plus the engine round trip. */
async function timedIdle(s: Session): Promise<number> {
  const t0 = performance.now();
  await s.waitIdle();
  return performance.now() - t0;
}

/** The slab the FLOOR_LOAD_INSUFFICIENT diagnostic asks for ("≥ 300 psf"). */
function requiredPsf(result: Result): number {
  const expected = findDiagnostic(result, "FLOOR_LOAD_INSUFFICIENT")?.expected ?? "";
  const m = /(\d+(?:\.\d+)?)\s*psf/.exec(expected);
  if (m === null) throw new Error(`FLOOR_LOAD_INSUFFICIENT.expected "${expected}" names no psf value`);
  return Number(m[1]);
}

/** The patch the Copilot's propose_change carries for an optimizer winner: explicit phasing + phases. */
function phasePatch(phases: readonly { id?: string; it_load_mw?: number; start_month?: number; energize_month?: number; power_source_id?: string }[]): PatchEntry[] {
  const ops: PatchEntry[] = [{ path: "phasing.mode", value: "EXPLICIT" }];
  phases.forEach((p, i) => {
    ops.push(
      { path: `phasing.phases[${i}].id`, value: p.id ?? `p${i + 1}` },
      { path: `phasing.phases[${i}].it_load_mw`, value: p.it_load_mw ?? 0 },
      { path: `phasing.phases[${i}].start_month`, value: p.start_month ?? 0 },
      { path: `phasing.phases[${i}].energize_month`, value: p.energize_month ?? 0 },
      { path: `phasing.phases[${i}].power_source_id`, value: p.power_source_id ?? "" },
    );
  });
  return ops;
}

function expectConvergedAndBetter(optimization: Result): void {
  const opt = optimization.optimization;
  expect(opt, "an OptimizationResult").toBeDefined();
  expect(opt!.converged).toBe(true);
  expect(conservationGreen(optimization), "the winner's analysis conserves").toBe(true);
  const objective = opt!.decision_var_values?.["objective"];
  const baseline = opt!.frontier?.find((c) => c.decision_var_values?.["baseline"] === 1)?.decision_var_values?.["objective"];
  expect(typeof objective).toBe("number");
  expect(typeof baseline).toBe("number");
  expect(objective!, "objective strictly better than the single-shot baseline").toBeLessThan(baseline!);
  expect(opt!.frontier?.some((c) => c.feasible === true && c.decision_var_values?.["objective"] === objective), "the winner is a feasible frontier point").toBe(true);
}

/** Energize month per phase, in phase order, from the schematic's data-hall blocks. */
function phaseEnergizeMonths(result: Result): number[] {
  const seen = new Map<string, number>();
  for (const b of result.schematic?.blocks ?? []) {
    if (b.phase_id !== undefined && !seen.has(b.phase_id)) seen.set(b.phase_id, b.energize_month ?? 0);
  }
  return [...seen.values()];
}

function expectStrictlyIncreasing(xs: readonly number[], what: string): void {
  for (let i = 1; i < xs.length; i++) expect(xs[i]!, `${what} strictly increasing at ${i}: ${xs.join(", ")}`).toBeGreaterThan(xs[i - 1]!);
}

/** Leaf numbers of a summary keyed by dotted path (`extra.racks`), so deltas cover the extras too. */
function flattenNumbers(value: Json, prefix = ""): Record<string, number> {
  if (typeof value === "number") return { [prefix]: value };
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.assign({}, ...Object.entries(value).map(([k, v]) => flattenNumbers(v, prefix === "" ? k : `${prefix}.${k}`))) as Record<string, number>;
}

/** Numbers quoted inside a tool output's prose (research excerpts, glossary text). */
function numbersInStrings(value: Json): number[] {
  if (typeof value === "string") return numbersIn(value);
  if (Array.isArray(value)) return value.flatMap(numbersInStrings);
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(numbersInStrings);
  return [];
}

function sum(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

/** Live T2: the INVALID_INPUT Result the Copilot hit — after the accepted card, or inside a tool result. */
function firstInvalidResult(turn: Turn): Result {
  const fromCard = turn.resultsAfterCards.find((r) => r.status === "INVALID_INPUT");
  if (fromCard !== undefined) return fromCard;
  for (const call of turn.toolCalls) {
    const analysis = analysisOf(call.output);
    if (analysis?.status === "INVALID_INPUT") return analysis;
  }
  throw new Error(`T2: the Copilot never saw INVALID_INPUT (tools: ${turn.toolCalls.map((c) => c.name).join(", ")})`);
}

/** edit_site_plan / set_control return `{applied, analysis}`; run_analyze returns the analysis itself. */
function analysisOf(output: Json | null): Result | null {
  if (output === null || typeof output !== "object" || Array.isArray(output)) return null;
  const inner = "analysis" in output ? output["analysis"] : output;
  if (inner === null || typeof inner !== "object" || Array.isArray(inner) || typeof inner["status"] !== "string") return null;
  return inner as unknown as Result;
}

/**
 * Live-mode narration grounding. Collects every number the engine has produced (Results, tool
 * outputs) and the plan's inputs, plus per-metric deltas between consecutive summaries, so a stated
 * figure must trace to one of them within two significant figures.
 */
class Grounding {
  /** Benchmarks the system prompt itself cites (interconnection years, $/MW…) are fair to quote. */
  private facts: number[] = numbersIn(readFileSync(fileURLToPath(new URL("../../docs/agent-system-prompt.md", import.meta.url)), "utf8"));
  private lastSummary: Record<string, number> | null = null;
  private markdown = "";
  private turns: Turn[] = [];
  private transcriptPath: string | null = null;

  constructor(private readonly session: Session) {}

  addFacts(facts: readonly number[]): void {
    this.facts.push(...facts);
  }

  async learn(s: Session): Promise<void> {
    this.learnFrom(await s.getPlan(), await s.getResult());
  }

  /** Facts from an archived (or current) plan + Result pair. */
  learnFrom(plan: string, result: string | null): void {
    this.facts.push(...numbersOf(JSON.parse(plan) as Json));
    if (result === null) return;
    const parsed = JSON.parse(result) as { summary?: Record<string, unknown> };
    this.facts.push(...numbersOf(JSON.parse(result) as Json));
    const summary = parsed.summary === undefined ? null : flattenNumbers(parsed.summary as Json);
    if (this.lastSummary !== null && summary !== null) this.facts.push(...deltaFacts(this.lastSummary, summary));
    this.lastSummary = summary;
  }

  /** Sends one human turn, learns what the engine said during it, and checks the narration. */
  async turn(s: Session, label: TurnId, prompt: string): Promise<Turn> {
    const turn = await copilotTurn(s, prompt, effort[label]);
    for (const r of turn.resultsAfterCards) this.facts.push(...numbersOf(r as unknown as Json));
    for (const c of turn.toolCalls) if (c.output !== null) this.facts.push(...numbersOf(c.output), ...numbersInStrings(c.output));
    await this.learn(s);
    this.markdown += turnMarkdown(label, turn);
    this.turns.push(turn);
    await this.flush();
    expect(untraceable(turn.text, this.facts), `${label}: every number in the narration traces to a Result`).toEqual([]);
    if (label !== "T1") expect(turn.usage?.cache_read_input_tokens ?? 0, `${label}: prompt cache hit`).toBeGreaterThan(0);
    return turn;
  }

  async flush(): Promise<void> {
    if (this.markdown === "") return;
    this.transcriptPath = await this.session.writeArtifact("transcript.md", `# Abilene-1 acceptance session (live)\n\n${this.markdown}`);
    // The raw turns (tool inputs/outputs included) for debugging a narration or tool-loop miss, and the
    // transcript in the form the page persists it, so a later run can resume from here.
    await this.session.writeArtifact("copilot-turns.json", JSON.stringify(this.turns, null, 2));
    const snapshot = await copilotSnapshot(this.session);
    await this.session.writeArtifact("transcript.json", JSON.stringify({ version: 1, messages: snapshot.messages, droppedTurns: snapshot.droppedTurns ?? 0 }));
  }

  get transcript(): string | null {
    return this.transcriptPath;
  }
}
