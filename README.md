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
| `fixtures/` | Shared protojson `SitePlan`s: three grounding scenarios (`abilene-1.json` is the acceptance reference plan) |
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
`fixtures/*.json` are protojson `SitePlan`s; every file is listed in the Canvas "Load fixture"
dropdown and reachable as `__harness.loadFixture(name)`. Each has a golden Result under
`engine/core/testdata/<name>.result.json`, Go + TS round-trip tests, a Monte Carlo + optimize smoke
(`engine/scenarios_test.go`) and a harness smoke step. Conventions (JSON has no comments):
- Fields named `*_pct` hold whole percents: `utilization_pct: 80` means 80%.
- Fields named `*_rate` hold fractions: `discount_rate: 0.1` means 10%.
- Money is USD; per-MW costs are per MW of IT load; months are indices from t0.
- Physics must be self-consistent: `power.sources[].capacity_mw` is checked against *facility* MW
  (IT × PUE), and `gpus_per_rack` must fit `kw_per_rack` (22 GPUs in a 40 kW air rack; an NVL72 is
  72 GPUs at ~130 kW on liquid).
- `revenue.compute.gpu_hour_price: 3.25` is GB300-class rental pricing. $2.25 is H100-era; at that
  price the air-cooled baseline is underwater (breakeven utilization > 100%), which would make the
  acceptance session start from an infeasible business rather than a slow one.
- Goldens are compared with a 1e-9 relative tolerance on floats (arm64 fuses multiply-adds, amd64
  does not); regenerate with `go test ./engine/core -run 'TestAbileneGolden|TestScenarioGoldens' -update`
  and review the diff.

### abilene-1 — GB300 compute-sales campus, ERCOT (acceptance reference)
200 MW IT of air-cooled 22-GPU racks selling GPU-hours at $3.25, grid-only at m30, single shot. It is
the plan the acceptance session (`docs/acceptance-session.md`) starts from and the worked LCOC example
in `engine/core/doc.go`. Reconciliation: plausibility bands only ($25–45M/MW, LCOC $1.5–2.5).

### nova-colo — A.CRE-style colo development, PJM / Northern Virginia (L0 lens)
`revenue.mode=COLO_LEASE`. The operating assumptions are the sample deal shipped in the A.CRE Data
Center Development Model v1.7 (`research/sources/Data-Center-Development-Model-v1.7.zip`, local only;
read with openpyxl `data_only=True`, cells on the `Underwriting` tab; see
`research/topics/01-lifecycle-pro-forma/reference-model-teardown.md`). The geometry is not the
sample's: it is a NoVA site with a 60-month grid interconnection, a 15 MW BTM gas bridge carrying
phase 1 from m24, an explicit second 10 MW phase on the grid at m60, liquid-cooled 125 kW racks on a
300 psf slab (so the 12% agility premium applies) and expensive land. Exercises: colo revenue with
escalation and vacancy, `mgmt_fee_pct_of_egr`, EXPLICIT phasing with per-phase power sources, a gas
pad in the schematic, energy dispatch across two sources with different prices, yield-on-cost and
development spread against an exit cap.

| A.CRE cell (Underwriting) | Value | Our field | Value | Note |
|---|---|---|---|---|
| K18 land area | 5 acres | `site.land_acres` / `usable_acres` | 5 / 4 | |
| K33+K34 land + closing | $11.3M | `costs.land_capex_per_acre` | 2,260,000 | $11.3M ÷ 5 acres; NoVA is $2–8M/acre (pro-forma §1.1) |
| K23 target PUE | 1.5 | `compute.pue` | 1.5 | model placeholder; a liquid hall would run ~1.2 — kept so utilities reconcile |
| E131 IT load | 20,000 kW | `compute.target_it_load_mw` | 20 | 2 × 10 MW phases per E23 ("modular … 2 × 10MW") |
| K41–K44, K47–K49 civil, structure, envelope, floor, fire, security, interiors | $65.02M | `costs.shell_capex_per_mw` | 4,207,000 | (65.02 + soft costs K66 $19.12M) ÷ 20 MW |
| K46 electrical systems | $31.88M | `costs.electrical_capex_per_mw` | 1,594,000 | ÷ 20 MW |
| K45 mechanical (HVAC + cooling) | $22.95M | `costs.cooling_capex_per_mw` | 1,147,500 | ÷ 20 MW |
| K50 utility interconnections | $7.65M | `power.sources[grid].capex_per_kw` | 255 | ÷ 30,000 kW facility |
| — | — | `costs.network_capex_per_mw` | 0 | the colo tenant brings its own fabric; A.CRE has no network line |
| H153 utilities (pre-PUE) | $109.5/kW/mo | `power.sources[grid].cost_per_mwh` | 150 | $109.5 ÷ 730 h = $0.15/kWh; billed on IT × PUE like F153 |
| H155 staffing + H157 G&A | $5 + $0.75/kW/mo | `costs.opex.staffing_per_mw_yr` | 69,000 | × 12 × 1,000 |
| H154 maintenance | $10/kW/mo = $2.4M/yr | `costs.opex.maintenance_pct_of_capex` | 1.64 | ÷ $146.6M facility capex (hard + soft + interconnection, no land) |
| H156 insurance | $0.5/kW/mo = $0.12M/yr | `costs.opex.insurance_pct_of_capex` | 0.082 | same base |
| I158 management fee | 3% of EGR | `costs.opex.mgmt_fee_pct_of_egr` | 3 | |
| K159 property taxes | $1.1M/yr | `costs.opex.property_tax_per_yr` | 1,100,000 | ours runs from t0 (land owned); A.CRE from operations |
| I121–I126 rent | $285/kW/mo | `revenue.colo.rate_per_kw_month` | 285 | |
| J121–J126 rent growth | 2% | `revenue.colo.annual_escalation_pct` | 2 | ours compounds from t0 (#29); A.CRE per tenant from lease start |
| I147 general vacancy | 5% | `revenue.colo.vacancy_pct` | 5 | |
| K176 cap rate at sale | 6.75% | `finance.exit_cap_rate` | 0.0675 | K175 "cap rate today" (6.0%) has no field |
| D178 sale month | 72 | `finance.hold_period_months` | 72 | |
| E84 construction loan rate | 9% | `finance.discount_rate` | 0.09 | A.CRE has no unlevered discount rate; its cost of debt is the nearest cell |
| K26 construction period | 24 mo | `phasing.phases[0].energize_month` | 24 | EXPLICIT phases take the caller's energize month; SINGLE_SHOT would use the 18-month STUB |
| — | — | `power.sources[gas]` | 15 MW, m18, $95/MWh, $1,200/kW | NoVA bridge, not in A.CRE; `grid_energize_month` 60 (PJM queue) |

Reconciliation (`engine/core/scenarios_test.go` `TestAcreReconciliation`) runs the workbook's own
geometry (20 MW air-cooled on 5 acres, grid at m24, tenant waves of 13 MW at m25 and 7 MW at m37,
72-month hold) through the engine with these fields. Total capex equals K68 ($157.92M) exactly.
Untrended (escalation 0, as A.CRE's column I): stabilized NOI $18.606M vs I195 $18.611M (**−0.03%**);
yield-on-cost 11.78% vs I195/K68 (−0.03%). A.CRE's headline yield I233 = 8.73% divides by K76
($213.1M), which adds $20.4M capitalized construction interest and a $34.7M operating-shortfall reserve
that our 100%-equity STUB does not book; restated on K76 our yield is 8.732% (−0.02%) and the
development spread over the sale cap rate 198 bps vs 198 bps. Tolerance 1%. Trended (fixture escalation
2%): our NOI is **+24.8%** above J195 because escalation compounds from t0 and opex never grows (#29);
the test pins the direction and a 0..+30% band rather than claiming agreement. Other structural
differences that do not touch stabilized NOI: no S-curve (capex lumped at construction start, which
also starts maintenance/insurance early), no debt, no tenant absorption ramp (417 kW/mo in A.CRE),
asset-based terminal value instead of NOI ÷ exit cap (#30 — the reason nova-colo's breakeven occupancy
is above 100% on a 72-month hold).

### epoch-100mw — Epoch AI 100 MW GB200 campus, MISO / Illinois (compute sales)
`revenue.mode=COMPUTE_SALES`, SINGLE_SHOT, PUE 1.14, 125 kW NVL72 racks (72 GPUs), 71% utilization,
$3.00/GPU-h contracted flat, grid (70 MW, $88/MWh) + nuclear PPA (31 MW, $95/MWh) energized at m36.
Source: `research/topics/01-lifecycle-pro-forma/pro-forma-reconstruction.md` §0–§1.2 (Epoch AI's
1 GW TCO model rescaled to 100 MW *facility* power → 87.7 MW IT → 702 racks, 50,544 GPUs). Exercises:
a two-source power mix with cheapest-first dispatch, a PPA type, a near-zero agility line, zero
insurance/mgmt-fee lines, a stranded-vs-shortfall ramp and GPU-heavy capex.

| Epoch line (§1.1 / §1.2) | Value | Our field | Value | Note |
|---|---|---|---|---|
| Facility (shell + electrical + cooling) | $1,143M | `shell` / `electrical` / `cooling_capex_per_mw` | 2,867,000 / 6,517,000 / 3,649,000 | $13.03M per IT MW split 22/50/28% (§1.1: electrical 48–54%, mechanical 22–33%) |
| Network infrastructure | $493M | `costs.network_capex_per_mw` | 5,621,000 | ÷ 87.7 MW IT |
| Land | $17M | `site.land_acres` × `costs.land_capex_per_acre` | 60 × 283,333 | 40–80 acres for 100 MW (§1.1) |
| Utility works (site-side interconnection) | $16M | `power.sources[*].capex_per_kw` | 160 | ÷ 101 MW of sources |
| GPUs/servers | $2,119M | `costs.gpu.unit_cost` | 41,900 | ÷ 50,544 GPUs; table range $27.8–41.7k/GPU |
| — | — | `costs.agility_premium_pct` | 0 | Epoch's facility line already prices a liquid-cooled hall |
| Energy | $59.4M/yr at 71% util. | `power.sources[*].cost_per_mwh` | 88 / 95 | EIA industrial $88; Constellation-type PPA ~$100 (§4 #13); blended $90 |
| Maintenance | $12.0M/yr | `costs.opex.maintenance_pct_of_capex` | 0.726 | ÷ $1,653M facility + network + utility capex |
| Property taxes | $14.3M/yr | `costs.opex.property_tax_per_yr` | 14,300,000 | |
| Labor + water + recurring utility | $4.0 + $0.6 + $2.0M/yr | `costs.opex.staffing_per_mw_yr` | 75,200 | $6.6M ÷ 87.75 MW IT; no water/utility fields |
| — | — | `insurance_pct_of_capex`, `mgmt_fee_pct_of_egr` | 0 | not in Epoch's stack |
| Utilization | 71% | `revenue.compute.utilization_pct` | 71 | |
| Contracted price (§1.4 base case) | $3.00/GPU-h | `revenue.compute.gpu_hour_price` | 3.0 | flat (`price_decay_pct_yr` 0): a multi-year anchor contract |
| GPU life (Epoch base) | 5 yr | `costs.gpu.depreciation_years` | 5 | |
| Cap rate (JLL 5.5–6.5%) | 6% | `finance.exit_cap_rate` | 0.06 | |

Reconciliation (`TestEpochReconciliation`): total capex $3.7878B vs $3.788B (**−0.00%**, tolerance 5%),
$37.86M per facility MW; each component line within 1% (utility works +1.0%). Note
`summary.capex_per_mw` is per *IT* MW ($43.2M) — Epoch quotes per gross MW. Stabilized year (year 4):
non-energy opex $32.9M vs $32.9M (**0.0%**); energy $54.8M vs $59.4M (−7.7%) — both at 71%
utilization, since COMPUTE_SALES bills energy on IT × utilization × PUE (`engine/core/doc.go` §Energy;
the residual is Epoch's higher implied $/MWh) — and total opex $87.7M vs $92.3M (**−5.0%**, tolerance
10%). Cross-check: our yield-on-cost 22.6% vs the reconstruction's 19.7% EBITDA yield (which adds
~10% of revenue for bandwidth/support/G&A).

## Docs
- Process: `.claude/skills/development/SKILL.md` (read first)
- Plan and workstreams: `docs/implementation-plan.md`
- Acceptance criterion: `docs/acceptance-session.md`
- Component specs: `docs/architecture.md`, `docs/engine-design.md`, `docs/ui-spec.md`,
  `docs/agent-integration.md`
