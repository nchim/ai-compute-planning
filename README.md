# AI-Lab Capacity Planner

A site-feasibility planner for AI data-center capacity: a pure Go analytical engine (compiled to WASM),
a React SPA that renders its results, and an embedded Copilot that operates the view. The contract
between all three is one protobuf: `SitePlan → Result`.

## Layout
| Path | What |
|---|---|
| `proto/` | buf module; `capplanner/v1/engine.proto` is **the** contract |
| `engine/` | Go engine: `pb/` (generated), `core/` (pure model), `wasm/` (JS bridge) |
| `web/` | Vite + React 18 + TypeScript SPA; `src/gen/` is generated |
| `harness/` | Playwright remote-control harness + acceptance scripts |
| `fixtures/` | Shared protojson `SitePlan`s (`abilene-1.json` is the acceptance reference plan) |
| `docs/`, `research/` | Design docs and the research corpus (start at `docs/README.md`) |

## Build
Requires Go 1.25, Node 22+, [`buf`](https://buf.build/docs/cli/installation) and
`staticcheck` (`go install honnef.co/go/tools/cmd/staticcheck@2025.1.1`).

```sh
make deps    # npm ci in web/ and harness/ (once)
make check   # lint + tests, Go and web — what CI runs
make wasm    # web/public/engine.wasm + wasm_exec.js (both gitignored build artifacts)
make gen     # regenerate engine/pb + web/src/gen after editing the proto; commit the output
```

Generated code is committed so nothing beyond `buf` (with remote plugins) is needed to build.
`wasm_exec.js` is copied from `$(go env GOROOT)/lib/wasm` by `make wasm`, not committed, so it
always matches the Go toolchain that built the module.

## Fixtures
`fixtures/abilene-1.json` is a protojson `SitePlan`. Conventions (JSON has no comments):
- Fields named `*_pct` hold whole percents: `utilization_pct: 80` means 80%.
- Fields named `*_rate` hold fractions: `discount_rate: 0.1` means 10%.
- Money is USD; per-MW costs are per MW of IT load; months are indices from t0.
- Physics must be self-consistent: `power.sources[].capacity_mw` is checked against *facility* MW
  (IT × PUE), and `gpus_per_rack` must fit `kw_per_rack` (22 GPUs in a 40 kW air rack; an NVL72 is
  72 GPUs at ~130 kW on liquid).
- `revenue.compute.gpu_hour_price: 3.25` is GB300-class rental pricing. $2.25 is H100-era; at that
  price the air-cooled baseline is underwater (breakeven utilization > 100%), which would make the
  acceptance session start from an infeasible business rather than a slow one.
- The golden `engine/core/testdata/abilene-1.result.json` is compared with a 1e-9 relative tolerance on
  floats (arm64 fuses multiply-adds, amd64 does not); regenerate with
  `go test ./engine/core -run TestAbileneGolden -update` and review the diff.

## Docs
- Process: `.claude/skills/development/SKILL.md` (read first)
- Plan and workstreams: `docs/implementation-plan.md`
- Acceptance criterion: `docs/acceptance-session.md`
- Component specs: `docs/architecture.md`, `docs/engine-design.md`, `docs/ui-spec.md`,
  `docs/agent-integration.md`
