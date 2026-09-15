# Reference Model Teardown — A.CRE Data Center Development Model (v1.6/1.7)

**Status:** 🔵 — 2026-09-15
**Source:** user-supplied (`sources/Data-Center-Development-Model-v1.7.zip`). One developer's approach;
treated as a reference data point, **not** a template. The point of this teardown is to locate it on
an abstraction ladder and define where *our* analysis should sit ("a level or two higher").

> ⚠️ Per user: don't over-bias toward this one approach. It's a well-built example of the *physical
> development* frame — which is exactly the layer we want to rise above.

---

## What it is

The **A.CRE (Adventures in CRE) Data Center Development Model** — a classic real-estate
ground-up **development underwriting** model, adapted for data centers. It ships as an `.xlsm` plus a
packaged Claude skill (SKILL.md + schema.yaml + reference docs) that operates it in chat or live in Excel.

- **Structure:** monthly-period, single-asset. Sheets: Version · Underwriting · Annual CF · S-Curve Reference.
- **Inputs:** development budget (land / hard / soft costs, each with funding timing + draw curves);
  construction financing (senior construction loan + one mezzanine tranche + optional refinance/perm-debt
  takeout, sized to a target LTC); tenant-by-tenant **colocation lease-up priced in $/kW/month** against
  IT loads in **kW**; a **PUE** assumption; opex (utilities scaled by PUE, staffing, maintenance, insurance,
  G&A, mgmt fee as % of EGR, property tax); a stabilized sale (exit cap).
- **Outputs:** unlevered/levered **IRR** & **equity multiple**, net profit, **yield-on-cost**,
  **development spread** (yield-on-cost − market cap rate), and trended/untrended **stabilized valuation**.
- **Explicit non-goals (from SKILL.md):** no acquisition of stabilized assets, no JV/partnership waterfall,
  **no portfolio roll-up**, no multi-tranche debt, no native sensitivity tables, no DSCR/debt-yield.

## The revealing part: it's a *real estate* model, not a *compute* model

The single most important observation is what the model **does not contain**:

- **No compute layer at all.** No GPU/server capex, no accelerator depreciation or obsolescence, no
  compute-sales revenue (GPU-hours / tokens), no utilization/MFU, no hardware refresh cycle.
- Revenue is **colo landlord** revenue only — leasing a powered shell at $/kW/month. The tenant (an
  operator or lab) is the one who buys the GPUs, bears obsolescence, and earns the compute margin.
- Power appears only as an **opex line scaled by PUE** — not as a procurement strategy, not as a
  critical-path *timeline* driver, not as a $/MWh sourcing decision.
- Time-to-energization — the variable our deep dives found dominates AI-DC returns — is modeled as a
  construction S-curve, i.e. *construction* time, not *interconnection/power* time.

**So the AI-specific economics begin exactly where this model ends.** It underwrites the building; the
interesting questions (GPU capex vs depreciation, speed-to-power, compute-sales margin, obsolescence
risk, build-vs-buy) live one and two levels above it. This is the concrete justification for the user's
"level or two higher" steer.

---

## The abstraction ladder (where we choose to sit)

**L0 — Physical development / parcel underwriting** *(where the A.CRE model sits).*
"Does *this specific ground-up build* pencil for a real-estate developer/lender/LP?" Frame: real estate.
Asset: a powered shell leased to a tenant. Levers: hard/soft costs, draw curve, debt stack, colo rent,
exit cap. Output: development spread, IRR. **Necessary but not where the AI story is.**

**L1 — Compute-asset economics** *(where our reconstructed pro forma already reaches).*
Treat the facility as a **compute-production asset**, not a building. Abstract construction into $/MW +
timeline; add the layers A.CRE omits: **GPU capex, depreciation/obsolescence, utilization, revenue mode
(lease vs compute-sales vs self-use), and the training-vs-inference split.** Center the three master
levers our research identified: **GPU-hour price, energization date, depreciation life.** See
`pro-forma-reconstruction.md`.

**L2 — Strategic / market / portfolio** *(the level the user is pointing us toward).*
Above the single asset entirely:
- **Build vs. buy vs. lease** for a compute buyer (AI lab) — make-or-buy across the whole compute need.
- **Speed-to-market as strategy** — the value of reaching a given compute scale first; opportunity cost
  of a 12–24 month delay measured in competitive/market terms, not just PV.
- **Portfolio siting & staging** across power markets; hedging obsolescence; capacity phasing.
- **Where value accrues in the stack** — chip vendor ↔ landlord ↔ operator/neocloud ↔ lab — and who
  captures the development spread vs the compute margin.
- **Demand / overbuild / bubble exposure** — scenario analysis on utilization and committed-vs-buildable GW.
- **Financing & collateral risk** at the fleet level (GPU-backed debt, correlated obsolescence).

## Implication for the tools we build

- Adopt A.CRE's **good bones** where they transfer: power-based pricing ($/kW/month, not $/SF),
  yield-on-cost / development-spread discipline, trended-vs-untrended honesty, explicit source-flagging.
- **Do not** rebuild an L0 parcel underwriter — that already exists and isn't the differentiated need.
- Build **up**: an L1 compute-asset layer (the pieces A.CRE structurally lacks) feeding an L2
  strategic/decision layer (build-vs-buy, speed-to-market value, portfolio, scenario/bubble exposure)
  that serves both the developer's portfolio strategy and the lab's compute strategy.

## Reference: A.CRE headline metrics worth keeping in our vocabulary
Yield-on-cost (stabilized NOI ÷ total project cost) · development spread (yield-on-cost − market cap,
in bps — "the core value-creation metric for any development deal") · unlevered vs levered IRR & the
spread between them · trended vs untrended valuation · per-MW cost basis (derivable: project cost ÷ MW).
