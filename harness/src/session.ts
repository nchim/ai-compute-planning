import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, type Browser, type Page } from "@playwright/test";

import type { CommandLogEntry, Control, ControlValue, HarnessApi, Json, PatchEntry } from "../../web/src/harness/api";

export type { CommandLogEntry, Control, ControlValue, Json, PatchEntry } from "../../web/src/harness/api";

export interface LaunchOptions {
  /** Where the SPA is served (default http://localhost:5173). */
  readonly baseURL?: string;
  /** Default true; pass false (or run with HEADED=1) to watch the browser. */
  readonly headless?: boolean;
  /** Where step artifacts land; default `harness/runs/<timestamp>/`. */
  readonly runDir?: string;
  /** CSS selectors blacked out on every archived screenshot (e.g. the API-key panel). */
  readonly maskSelectors?: readonly string[];
  /** Runs before the page loads on every navigation (e.g. seeding sessionStorage). */
  readonly initScript?: string;
}

/** The `__harness` methods a Session can proxy (setCopilot takes functions, which cannot cross the wire). */
type Proxied = Exclude<keyof HarnessApi, "setCopilot">;

const runsRoot = fileURLToPath(new URL("../runs/", import.meta.url));

/** Anthropic API keys never reach an artifact, whatever logged them. */
export function redactSecrets(text: string): string {
  return text.replace(/sk-ant-[A-Za-z0-9_-]+/g, "sk-ant-[REDACTED]");
}

/**
 * One browser + one page against the running SPA, driving it only through `window.__harness`.
 * Every harness call rejects on failure with the in-page message. `step()` archives a screenshot,
 * the plan, the Result and the command log per step and fails on any uncaught page error, so a
 * run leaves a complete, inspectable trail under `runDir`.
 */
export class Session {
  readonly runDir: string;
  private stepCount = 0;
  private readonly consoleErrors: string[] = [];
  private readonly pageErrors: Error[] = [];
  private reportedPageErrors = 0;
  private readonly maskSelectors: readonly string[];

  private constructor(
    private readonly browser: Browser,
    readonly page: Page,
    runDir: string,
    maskSelectors: readonly string[],
  ) {
    this.runDir = runDir;
    this.maskSelectors = maskSelectors;
    page.on("pageerror", (err) => this.pageErrors.push(err));
    page.on("console", (msg) => {
      if (msg.type() === "error") this.consoleErrors.push(msg.text());
    });
  }

  static async launch(options: LaunchOptions = {}): Promise<Session> {
    const baseURL = options.baseURL ?? "http://localhost:5173";
    const headless = options.headless ?? process.env.HEADED !== "1";
    const runDir = options.runDir ?? path.join(runsRoot, timestamp());
    await mkdir(runDir, { recursive: true });

    const browser = await chromium.launch({ headless });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const session = new Session(browser, page, runDir, options.maskSelectors ?? []);
    try {
      if (options.initScript !== undefined) await page.addInitScript(options.initScript);
      await page.goto(baseURL, { waitUntil: "load" });
      await session.waitForHarness();
    } catch (err) {
      await browser.close();
      throw new Error(`Session.launch: ${baseURL} did not expose window.__harness (is the dev server running with VITE_HARNESS=1?): ${describe(err)}`);
    }
    return session;
  }

  /** Reloads the page (the init script re-runs) and waits for `window.__harness` again. */
  async reload(): Promise<void> {
    await this.page.reload({ waitUntil: "load" });
    await this.waitForHarness();
  }

  private waitForHarness(): Promise<unknown> {
    return this.page.waitForFunction(() => window.__harness !== undefined, null, { timeout: 15_000 });
  }

  // ---- typed wrappers over window.__harness -------------------------------------------------

  loadPlan(protojson: string): Promise<void> {
    return this.call("loadPlan", protojson);
  }
  getPlan(): Promise<string> {
    return this.call("getPlan");
  }
  getResult(): Promise<string | null> {
    return this.call("getResult");
  }
  setControl(pathName: string, value: ControlValue): Promise<void> {
    return this.call("setControl", pathName, value);
  }
  listControls(): Promise<Control[]> {
    return this.call("listControls");
  }
  optimize(): Promise<string> {
    return this.call("optimize");
  }
  proposeChange(summary: string, patch: readonly PatchEntry[]): Promise<string> {
    return this.call("proposeChange", summary, patch);
  }
  sendCopilot(text: string): Promise<void> {
    return this.call("sendCopilot", text);
  }
  getCopilotSnapshot(): Promise<Json> {
    return this.call("getCopilotSnapshot");
  }
  acceptCard(id?: string): Promise<void> {
    return id === undefined ? this.call("acceptCard") : this.call("acceptCard", id);
  }
  rejectCard(id?: string): Promise<void> {
    return id === undefined ? this.call("rejectCard") : this.call("rejectCard", id);
  }
  undo(): Promise<void> {
    return this.call("undo");
  }
  redo(): Promise<void> {
    return this.call("redo");
  }
  getViewContext(): Promise<Json> {
    return this.call("getViewContext");
  }
  getCommandLog(): Promise<CommandLogEntry[]> {
    return this.call("getCommandLog");
  }
  waitIdle(timeoutMs?: number): Promise<void> {
    return timeoutMs === undefined ? this.call("waitIdle") : this.call("waitIdle", timeoutMs);
  }
  /** Errors the page itself recorded (console.error, uncaught errors, unhandled rejections). */
  getConsoleErrors(): Promise<string[]> {
    return this.call("getConsoleErrors");
  }

  // ---- artifacts ---------------------------------------------------------------------------

  /** Saves `<runDir>/<name>.png` and returns its path. */
  async screenshot(name: string): Promise<string> {
    const file = path.join(this.runDir, `${slug(name)}.png`);
    await this.capture(file);
    return file;
  }

  /** Writes an extra artifact (secrets redacted) under the run directory and returns its path. */
  async writeArtifact(name: string, content: string): Promise<string> {
    const file = path.join(this.runDir, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, redactSecrets(content));
    return file;
  }

  /**
   * Runs `fn`, then archives the step under `<runDir>/<nn>-<name>/`: screenshot.png, plan.json,
   * result.json, command-log.json and console-errors.json. Fails if `fn` threw or if the page
   * raised an uncaught error during the step.
   */
  async step<T>(name: string, fn: (session: Session) => Promise<T>): Promise<T> {
    const dir = path.join(this.runDir, `${String(++this.stepCount).padStart(2, "0")}-${slug(name)}`);
    await mkdir(dir, { recursive: true });
    let outcome: { ok: true; value: T } | { ok: false; error: unknown };
    try {
      outcome = { ok: true, value: await fn(this) };
    } catch (error) {
      outcome = { ok: false, error };
    }
    try {
      await this.archive(dir);
    } catch (error) {
      if (outcome.ok) throw new Error(`step "${name}": archiving failed: ${describe(error)}`);
      throw new Error(`step "${name}" failed: ${describe(outcome.error)} (and archiving failed: ${describe(error)})`);
    }
    const pageErrors = this.freshPageErrors();
    if (!outcome.ok) {
      const suffix = pageErrors.length === 0 ? "" : ` (uncaught page errors: ${pageErrors.join("; ")})`;
      throw new Error(`step "${name}" failed: ${describe(outcome.error)}${suffix}`, { cause: outcome.error });
    }
    if (pageErrors.length > 0) throw new Error(`uncaught page error during step "${name}": ${pageErrors.join("; ")}`);
    return outcome.value;
  }

  /** Closes the browser; still fails if the page raised an uncaught error outside any step. */
  async close(): Promise<void> {
    await this.browser.close();
    const pageErrors = this.freshPageErrors();
    if (pageErrors.length > 0) throw new Error(`uncaught page error outside any step: ${pageErrors.join("; ")}`);
  }

  private capture(file: string): Promise<Buffer> {
    return this.page.screenshot({ path: file, fullPage: true, mask: this.maskSelectors.map((sel) => this.page.locator(sel)) });
  }

  private async archive(dir: string): Promise<void> {
    await this.capture(path.join(dir, "screenshot.png"));
    const [plan, result, log, pageConsole] = await Promise.all([
      this.getPlanOrNull(),
      this.getResult(),
      this.getCommandLog(),
      this.getConsoleErrors(),
    ]);
    const errors = { page: pageConsole, playwright: this.consoleErrors, uncaught: this.pageErrors.map(describe) };
    await Promise.all([
      writeFile(path.join(dir, "plan.json"), plan ?? "null"),
      writeFile(path.join(dir, "result.json"), result ?? "null"),
      writeFile(path.join(dir, "command-log.json"), JSON.stringify(log, null, 2)),
      writeFile(path.join(dir, "console-errors.json"), redactSecrets(JSON.stringify(errors, null, 2))),
    ]);
  }

  /** Archiving before any plan is loaded is legitimate; every other getPlan failure still fails. */
  private async getPlanOrNull(): Promise<string | null> {
    try {
      return await this.getPlan();
    } catch (err) {
      if (describe(err).includes("no plan loaded")) return null;
      throw err;
    }
  }

  /** Uncaught page errors not yet attributed to a step or to close(). */
  private freshPageErrors(): string[] {
    const fresh = this.pageErrors.slice(this.reportedPageErrors).map(describe);
    this.reportedPageErrors = this.pageErrors.length;
    return fresh;
  }

  private call<K extends Proxied>(method: K, ...args: Parameters<HarnessApi[K]>): ReturnType<HarnessApi[K]> {
    return this.page.evaluate(
      async ({ method, args }) => {
        const api = window.__harness;
        if (api === undefined) throw new Error("window.__harness is not installed");
        const fn = api[method] as (...a: unknown[]) => Promise<unknown>;
        return fn.apply(api, args);
      },
      { method, args: args as unknown[] },
    ) as ReturnType<HarnessApi[K]>;
  }
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function slug(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (s === "") throw new Error(`"${name}" is not a usable step/screenshot name`);
  return s;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
