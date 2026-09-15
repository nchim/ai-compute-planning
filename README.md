# AI-Lab Capacity Planner

A site-feasibility planner for AI data-center capacity: a pure Go analytical engine (compiled to WASM),
a React SPA that renders its results, and an embedded Copilot that operates the view. The contract
between all three is one protobuf: `SitePlan → Result`.

## Layout
| Path | What |
|---|---|
| `proto/` | buf module; `capplanner/v1/engine.proto` is **the** contract |
| `engine/` | Go engine: `pb/` (generated), `core/` (pure model + conservation), `risk/` (Monte Carlo + sensitivity), `optimize/` (phasing search), `bridge/` + `wasm/` (JS boundary); `engine.go` composes them |
| `web/` | Vite + React 18 + TypeScript SPA: `src/bus` (command bus), `src/engine` (worker client), `src/views/site` (Site Feasibility), `src/copilot`, `src/harness`; `src/gen/` is generated |
| `harness/` | Playwright remote-control harness: `src/session.ts` + `tests/smoke.spec.ts`; `acceptance/` (the T1–T7 session) arrives with the WS10 PR |
| `deploy/` | Cloud Run host: Go static server + Basic Auth + Anthropic relay (`server/`), `Dockerfile`, `cloudrun.md` runbook |
| `fixtures/` | Shared protojson `SitePlan`s (`abilene-1.json` is the acceptance reference plan; `nova-colo.json` and `epoch-100mw.json` arrive with the WS12 PR) |
| `docs/`, `research/` | Design docs (start at `docs/README.md`) and the research corpus the Copilot is grounded in |
| `.claude/skills/development/` | The shared dev process every worker follows |

## Build
Requires Go 1.25, Node 22+, [`buf`](https://buf.build/docs/cli/installation) and
`staticcheck` (`go install honnef.co/go/tools/cmd/staticcheck@2025.1.1`).

```sh
make deps    # npm ci in web/ and harness/ (once)
make check   # lint + tests, Go (engine + deploy) and web — what CI runs
make wasm    # web/public/engine.wasm + wasm_exec.js (both gitignored build artifacts)
make gen     # regenerate engine/pb + web/src/gen after editing the proto; commit the output
make web     # production build of the SPA (web/dist)
make harness # harness typecheck + every Playwright spec against the dev server
```

Generated code is committed so nothing beyond `buf` (with remote plugins) is needed to build; CI fails
if it is stale. `wasm_exec.js` is copied from `$(go env GOROOT)/lib/wasm` by `make wasm`, not
committed, so it always matches the Go toolchain that built the module. Go targets use the explicit
package list `./engine/... ./deploy/...` (never `./...`: `web/node_modules` contains stray Go code).

Dev loop: `make wasm`, then `cd web && VITE_ENGINE=wasm npm run dev` (without `VITE_ENGINE=wasm` the
SPA runs a fake engine that stamps a `FAKE_ENGINE` diagnostic into every Result). The harness starts
its own dev server with `VITE_HARNESS=1`; see `harness/README.md`.

## Deploy
The tester deployment is one Cloud Run service (`deploy/`): a Go server that hosts the built SPA behind
a shared password (user `tester`) and relays the Copilot's Anthropic calls with a server-held key, with a
per-day request cap. Full runbook, IAM and security notes: `deploy/cloudrun.md`.

```sh
# 1. once: the two secrets (and grant the Cloud Run service account roles/secretmanager.secretAccessor)
printf '%s' 'sk-ant-...' | gcloud secrets create anthropic-api-key --data-file=- --project ai-compute-planner
printf '%s' 'choose-a-password' | gcloud secrets create app-password --data-file=- --project ai-compute-planner
# 2. every release: build on Cloud Build from source and roll out
make deploy
# 3. share the printed service URL with user `tester` and the password
```

`make serve` runs the same configuration locally (`ANTHROPIC_API_KEY` and `APP_PASSWORD` in the env,
http://localhost:8080). Relay mode is selected at build time by `VITE_COPILOT_RELAY=/api/anthropic`;
a plain `npm run build` produces the BYO-key dev build, which must never be deployed.

## Fixtures
`fixtures/*.json` are protojson `SitePlan`s. Conventions (JSON has no comments):
- `meta.plan_id` equals the file name.
- Fields named `*_pct` hold whole percents: `utilization_pct: 80` means 80%.
- Fields named `*_rate` hold fractions: `discount_rate: 0.1` means 10%.
- Money is USD; per-MW costs are per MW of IT load; months are indices from t0.
- Physics must be self-consistent: `power.sources[].capacity_mw` is checked against *facility* MW
  (IT × PUE), and `gpus_per_rack` must fit `kw_per_rack` (22 GPUs in a 40 kW air rack; an NVL72 is
  72 GPUs at ~130 kW on liquid).
- `revenue.compute.gpu_hour_price: 3.25` is GB300-class rental pricing. $2.25 is H100-era; at that
  price the air-cooled baseline is underwater (breakeven utilization > 100%), which would make the
  acceptance session start from an infeasible business rather than a slow one.
- Goldens live in `engine/core/testdata/<plan_id>.result.json` and are compared with a 1e-9 relative
  tolerance on floats (arm64 fuses multiply-adds, amd64 does not); regenerate `abilene-1` with
  `go test ./engine/core -run TestAbileneGolden -update` and review the diff.
- `abilene-1` is the acceptance reference plan (`docs/acceptance-session.md`). The WS12 PR adds
  `nova-colo` (A.CRE colo development) and `epoch-100mw` (Epoch AI 100 MW campus), each with a
  source → field table and reconciliation tests; see `docs/engine-design.md` §Grounding.

## Status
WS1–WS9 (scaffold, engine core, risk, optimizer, WASM bridge, SPA + bus, site view, Copilot, harness),
WS11 (baseline pin + compare) and WS13 (Cloud Run deploy + relay) are merged. Open PRs: WS10
(acceptance session T1–T7, scripted + live) and WS12 (grounding scenarios). In flight: the fidelity
follow-ups #28–#30 (energy at utilization, colo escalation/opex growth, cap-rate terminal value).
Workstream table, merge process and deferred list: `docs/implementation-plan.md`.

## Docs
- Process: `.claude/skills/development/SKILL.md` (read first)
- Plan and workstreams: `docs/implementation-plan.md`
- Acceptance criterion: `docs/acceptance-session.md`; harness: `harness/README.md`
- Component specs: `docs/architecture.md`, `docs/engine-design.md`, `docs/ui-spec.md`,
  `docs/agent-integration.md`
- Deployment runbook: `deploy/cloudrun.md`
