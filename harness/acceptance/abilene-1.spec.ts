/**
 * docs/acceptance-session.md T1–T7 over one `Session`. `COPILOT_MODE=scripted` (default, the CI
 * gate) has the harness issue the tool calls the Copilot is expected to make; `COPILOT_MODE=live`
 * sends the human's words to the real Copilot and additionally checks its narration. Both modes
 * assert the same engine/UI facts per turn and archive every turn under harness/runs/<ts>/.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test, type TestInfo } from "@playwright/test";

import { Session, type Json, type PatchEntry } from "../src/session";
import { KEY_PANEL_SELECTOR, copilotSnapshot, copilotTurn, keyInitScript, loadApiKey, turnMarkdown, type Turn } from "./lib/copilot";
import { lastOptimization, lastSeq, mutationsSince } from "./lib/log";
import { deltaFacts, missingDimensions, numbersIn, traceable, untraceable } from "./lib/narration";
import { conservationGreen, findDiagnostic, metric, numbersOf, parsePlan, parseResult, type Result } from "./lib/result";

type Mode = "scripted" | "live";
const mode = modeFromEnv();
const live = mode === "live";

const fixture = readFileSync(fileURLToPath(new URL("../../fixtures/abilene-1.json", import.meta.url)), "utf8");

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
} as const;

/**
 * Cross-cutting performance budgets (WASM): a plain Analyze, and one carrying 1,000 Monte Carlo
 * draws. Live runs are recorded with `slowMo`, which taxes every harness call; they get some slack.
 */
const slowMoSlackMs = live ? 300 : 0;
const budgetMs = { analyze: 100 + slowMoSlackMs, monteCarlo: 1000 + slowMoSlackMs } as const;
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

test.describe.configure({ timeout: live ? 30 * 60_000 : 5 * 60_000 });

test(`acceptance session: Abilene-1 T1–T7 (${mode})`, async ({}, info) => {
  const session = await launch(info);
  const grounding = new Grounding(session);
  try {
    // ---- T1 — Orientation ---------------------------------------------------------------------
    const t1 = await session.step("T1 orientation", async (s) => {
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
    });

    // ---- T2 — A bad idea, caught early ---------------------------------------------------------
    const t2 = await session.step("T2 density diagnostics", async (s) => {
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
      expect(findDiagnostic(firstResult, "DENSITY_EXCEEDS_COOLING")?.proto_path).toBe("compute.kw_per_rack");
      expect(findDiagnostic(firstResult, "FLOOR_LOAD_INSUFFICIENT")?.proto_path).toBe("site.floor_load_psf");
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
      if (!live) expect(fixMs, "Analyze after the fix").toBeLessThanOrEqual(budgetMs.analyze);
      return checkpoint(s, result);
    });

    // ---- T3 — Phase to the demand ramp ---------------------------------------------------------
    const t3 = await session.step("T3 optimize phasing", async (s) => {
      // T3b: the human pins the single-shot plan before anything is optimized.
      await s.setBaseline("single-shot");
      let optimization: Result;
      if (live) {
        const turn = await grounding.turn(s, "T3", H.t3);
        expect(turn.toolCalls.some((c) => c.name === "run_optimize" && !c.isError), "the Copilot ran the optimizer").toBe(true);
        optimization = lastOptimization(await s.getCommandLog(), t2.seq);
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
      await expect(s.page.locator('[data-block^="hall_"]')).toHaveCount(1);
      await s.screenshot("T3 scrubber at first phase");
      await scrubber.fill(String(phases.at(-1)?.energize_month));
      await expect(s.page.locator('[data-block^="hall_"]')).toHaveCount(phases.length);
      return checkpoint(s, result);
    });

    // ---- T3b — Pin and compare -----------------------------------------------------------------
    await session.step("T3b baseline compare", async (s) => {
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

      await s.toggleCompare();
      expect(((await s.getViewContext()) as { compare: boolean }).compare).toBe(true);
      const tiles = s.page.locator(".tile");
      await expect(s.page.locator(".tile .delta[data-delta]"), "every metric tile shows a Δ vs. baseline").toHaveCount(await tiles.count());
      const captureDelta = Number(await s.page.locator('[data-metric="demand_capture_pct"] .delta').getAttribute("data-delta"));
      expect(captureDelta).toBeCloseTo(metric(t3.result, "demand_capture_pct") - (baselineSummary["demand_capture_pct"] as number), 6);
      await expect(s.page.locator(".step-chart .line.baseline"), "ghosted baseline demand + capacity").toHaveCount(2);
      if (live) {
        grounding.addFacts(deltaFacts(baselineSummary, (t3.result.summary ?? {}) as Record<string, unknown>));
        await grounding.turn(s, "T3b", H.t3b);
      }
    });

    // ---- T4 — Monte Carlo + sensitivity --------------------------------------------------------
    const t4 = await session.step("T4 monte carlo", async (s) => {
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
      expect(result.monte_carlo?.iterations).toBe(1000);
      for (const key of ["lcoc_per_gpu_hour", "npv"]) {
        const dist = result.monte_carlo?.metrics?.[key];
        expect(dist, `Monte Carlo distribution for ${key}`).toBeDefined();
        expect(dist!.p10!).toBeLessThan(dist!.p50!);
        expect(dist!.p50!).toBeLessThan(dist!.p90!);
        expect(sum((dist!.histogram ?? []).map((b) => b.count ?? 0)), `${key} histogram counts`).toBe(1000);
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
      expect(Math.max(mcMs, rerunMs), "1,000-iteration Monte Carlo").toBeLessThanOrEqual(budgetMs.monteCarlo);
      return checkpoint(s, result);
    });

    // ---- T5 — What-if on the linchpin ----------------------------------------------------------
    const t5 = await session.step("T5 utilization what-if", async (s) => {
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
    });

    // ---- T6 — Undo, then a human-driven lever --------------------------------------------------
    await session.step("T6 undo and depreciation slider", async (s) => {
      await s.undo();
      await s.waitIdle();
      expect(await s.getPlan(), "undo restores the T4 plan byte-for-byte").toBe(t4.plan);
      const afterUndo = lastSeq(await s.getCommandLog());

      await s.page.locator('[data-path="costs.gpu.depreciation_years"] input[type="range"]').fill("4");
      const analyzeMs = (timings["T6 slider analyze"] = await timedIdle(s));
      expect(mutationsSince(await s.getCommandLog(), afterUndo).map((m) => m.paths)).toEqual([["costs.gpu.depreciation_years"]]);
      expect(analyzeMs, "slider re-analyze (Monte Carlo still enabled)").toBeLessThanOrEqual(budgetMs.monteCarlo);
      const result = parseResult(await s.getResult());
      expect(metric(result, "lcoc_per_gpu_hour"), "shorter GPU life raises LCOC").toBeGreaterThan(metric(t4.result, "lcoc_per_gpu_hour"));
      if (live) {
        const turn = await grounding.turn(s, "T6", H.t6);
        expect(turn.text, "the Copilot saw the slider move in the ViewContext").toMatch(/depreciation/i);
        expect(numbersIn(turn.text)).toContain(4);
        expect(mutationsSince(await s.getCommandLog(), t5.seq).length, "answering 'what changed' mutates nothing").toBe(1);
      }
      return checkpoint(s, result);
    });

    // ---- T7 — Steering-committee summary + cross-cutting checks -------------------------------
    await session.step("T7 summary and replay", async (s) => {
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
    });
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

async function launch(info: TestInfo): Promise<Session> {
  const { baseURL, headless } = info.project.use;
  return Session.launch({
    ...(baseURL === undefined ? {} : { baseURL }),
    ...(headless === undefined ? {} : { headless }),
    ...(live ? { initScript: keyInitScript(loadApiKey()), maskSelectors: [KEY_PANEL_SELECTOR] } : {}),
  });
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
  private lastSummary: Record<string, unknown> | null = null;
  private markdown = "";
  private transcriptPath: string | null = null;

  constructor(private readonly session: Session) {}

  addFacts(facts: readonly number[]): void {
    this.facts.push(...facts);
  }

  async learn(s: Session): Promise<void> {
    const result = await s.getResult();
    const plan = await s.getPlan();
    this.facts.push(...numbersOf(JSON.parse(plan) as Json));
    if (result === null) return;
    const parsed = JSON.parse(result) as { summary?: Record<string, unknown> };
    this.facts.push(...numbersOf(JSON.parse(result) as Json));
    if (this.lastSummary !== null && parsed.summary !== undefined) this.facts.push(...deltaFacts(this.lastSummary, parsed.summary));
    this.lastSummary = parsed.summary ?? null;
  }

  /** Sends one human turn, learns what the engine said during it, and checks the narration. */
  async turn(s: Session, label: string, prompt: string): Promise<Turn> {
    const turn = await copilotTurn(s, prompt);
    for (const r of turn.resultsAfterCards) this.facts.push(...numbersOf(r as unknown as Json));
    for (const c of turn.toolCalls) if (c.output !== null) this.facts.push(...numbersOf(c.output), ...numbersInStrings(c.output));
    await this.learn(s);
    this.markdown += turnMarkdown(label, turn);
    await this.flush();
    expect(untraceable(turn.text, this.facts), `${label}: every number in the narration traces to a Result`).toEqual([]);
    if (label !== "T1") expect(turn.usage?.cache_read_input_tokens ?? 0, `${label}: prompt cache hit`).toBeGreaterThan(0);
    return turn;
  }

  async flush(): Promise<void> {
    if (this.markdown === "") return;
    this.transcriptPath = await this.session.writeArtifact("transcript.md", `# Abilene-1 acceptance session (live)\n\n${this.markdown}`);
  }

  get transcript(): string | null {
    return this.transcriptPath;
  }
}
