# KPI Architecture — Proprietary Model (DRAFT v0.1)

Working skeleton for our proprietary model. **Evolving — under active discussion with the user.**

## Core reframe (2026-09-15)

The model is **not** a cost-of-compute calculator with strategy bolted on. It is a **competitive-
positioning model** in which core development economics set the *floor* and **timing + agility decide
who wins**. A deal can be economically attractive yet competitively losing (too slow, too rigid), or
economically marginal yet winning (captures the demand window, adapts to inference shifts). The winner
sits at the intersection.

**The model's central job:** price the tradeoff — *how much economic margin (LCOC / yield) should be
sacrificed for timing and adaptability, given the competitive window?* The tension is real but **not
uniform**: speed costs margin (BTM-gas premium, over-provisioning), and so does agility-by-over-spec —
**yet agility-by-phasing (modular/staged build) can be cost-*negative* (~30% TCO savings).** The real
cost lives in design-time levers that can't be retrofitted later (notably floor loading). The model
makes explicit both the tension *and* where flexibility is cheap vs. expensive to buy.

**"First-mover advantage" — defined precisely** (refined with the user, 2026-09-15): NOT being first
with a model (capability leads decay in 2–6 months). It is the early head start used to build **(i)
supply lock-up** (scarce power, land, queue position, take-or-pay) *and* **(ii) a demand moat** —
brand/mindshare (OpenAI → consumer, Anthropic → enterprise), architecture/ecosystem lock-in, and
user/enterprise switching costs. This early moat is real but **decays unless model quality & cost stay
competitive** — so it must be defended with Layer-2 economics. The first mover keeps the advantage only
by converting the head start into lock-in *and* remaining cost/quality-competitive.

---

## The KPI stack (top layer dominates)

### Layer 1 — Competitive dynamics *(the game; weighted highest)*

**1a. Timing / demand-capture**
- **Time-to-serve** — end-to-end months from decision to revenue-generating, qualified capacity
  (land → power → fit-out → energize → qualify → serve). The honest clock, gated by energization.
- **Capacity-timing fit** — does capacity land *within* the demand window? Penalizes both late arrival
  and premature over-build. "Right capacity at the right time," not merely fast.
- **Demand-capture share** — fraction of an addressable demand window secured before competitors fill
  it; tied to input lock-up and customer take-or-pay.
- **Window value / opportunity cost of delay** — $ value of the capturable window and its decay with
  delay (research: ~9% "rational" delay-avoidance floor; window-specific above that).

**1b. Agility / adaptability** *(respond to shifts in inference technology)*
- **Adaptability index** — how cheaply/fast the facility reconfigures for new architectures: cooling
  headroom (air→liquid→ can it reach 600 kW/rack?), power headroom, structural/floor loading, network
  topology flexibility, lease/contract flexibility.
- **Architectural obsolescence exposure** — how locked-in the design is to today's compute generation
  (stranded-asset risk; ties to facility-lifecycle work).
- **Refresh optionality** — ability to swap hardware generations without rebuilding the shell; capex
  re-deployability.
- **Inference-shift resilience** — exposure to the training→inference transition (inference overtakes
  ~2027; latency-proximate, different hardware/right-sizing).
- **Pipeline optionality value** — real-option value of a land+power bank exercisable when tech/demand
  clarifies (from portfolio-siting research).
- *Grounded (agility deep dive, 2026-09-15):* scoreable as → floor-load capacity (psf), power-headroom
  ratio, cooling mode & max kW/rack, structural-upgrade cost/MW if needed, modularity index, lease-tenor
  ÷ refresh-cycle ratio, contract-flexibility type, latency-tier fit, site power scale vs. workload
  class. Facts: liquid-ready ~7–10% premium; high floor-loading is a low-single-digit % premium at
  greenfield but **near-infeasible to retrofit** (highest cost-asymmetry lever); ~68% of pre-2015 DCs
  can't support AI density (82% still have 10+ yr on lease → effectively stranded). **Tradeoff = real
  option:** EV(flexibility) = P(obsolescence before shell EOL) × avoided retrofit/strand cost − upfront
  agility premium (P high: ~18–36 mo density-tier cadence vs. 15–30 yr shell life).

**1c. Demand durability / moat** *(does captured demand stick?)* — added 2026-09-15
- **Brand / mindshare position** — durable segment association (OpenAI → consumer, Anthropic →
  enterprise/coding). Proxy: segment market share, developer adoption, API-revenue mix.
- **Architecture / ecosystem lock-in** — customers building on your APIs, agent frameworks, fine-tunes,
  tool integrations → switching cost. Proxy: platform stickiness, ecosystem size, net revenue retention.
- **Enterprise switching cost** — data gravity, workflows, compliance, trust, integration depth.
- **Moat-decay condition** — the early moat erodes if model quality/cost fall behind; demand durability
  is *contingent on staying quality/cost-competitive* (→ links to Layer 2). First-mover advantage is a
  time-limited head start that must be *converted* into lock-in before it decays.

### The strategic loop (why the layers are one system)
Timing (1a) captures the early window → converts into a demand moat (1c: brand / lock-in / switching
cost) → the moat buys durable demand and time → **but persists only if quality/cost stay competitive**,
which depends on compute economics (Layer 2, esp. LCOC) → durable demand justifies the compute
investment and funds the next capacity race (1a). Agility (1b) determines whether the fleet can keep
serving that demand as inference tech shifts. The model should make this loop legible, not model each
layer in isolation.

**Real-estate bridge (for the developer lens):** a lab tenant's demand moat is its **demand credit
quality** — the compute analog of underwriting a tenant's covenant before a build-to-suit. Strong-moat
tenants (durable, sticky demand) make aggressive/speculative buildout bankable; weak-moat tenants make
it a bet on fleeting capability leads. This is how the strategic layer feeds the build decision.

### The capacity-risk asymmetry (why paying premiums for capacity is rational) — added 2026-09-15
The two capacity risks are **not symmetric**, and competitive actors treat them very differently:
- **Cost of being capacity-SHORT** (demand outruns your capacity) — a *Layer-1 (competitive)* cost:
  missed demand window, lost demand-capture share, moat erosion, competitor gain. Large, non-linear, and
  **partly irreversible**. Demand-rich / capacity-poor actors (e.g., OpenAI's massive external
  contracting via Oracle / Stargate) pay **20–60% premiums** to secure capacity from whoever has it —
  the premium is *capacity insurance*, sized by the **buyer's** cost-of-shortage.
- **Cost of being capacity-LONG** (your capacity outruns your *own* demand) — a *Layer-2 (economics)*
  cost: below-breakeven carry + depreciation on idle assets. Painful but **bounded and partly
  recoverable — chiefly by becoming a merchant seller.** Real example: **xAI and Meta are *selling*
  capacity precisely because their own model demand generation lagged their buildout** — they over-built
  (rational insurance), came up long, and now monetize the excess by renting to capacity-short buyers.
  Recovery is real but contingent on the merchant market clearing.
- **The mismatch clears through a merchant market:** the long sell to the short at a premium set by the
  short's stakes (shortage cost >> underutilization cost). Capacity is a **call option on demand** — the
  premium is the option premium; underutilization is the option finishing partly out-of-the-money.
- **Capacity generation ≠ demand generation — two separate races.** Winning the capacity race does not
  make demand appear; you must also generate consumption (product/model adoption = Layer 1c in action).
  The **gap between secured capacity and your own demand generation** is a first-class signal: a
  persistent *long* gap (xAI, Meta) reveals a weaker demand moat and pushes you into the merchant-supplier
  role; a *short* gap (demand outrunning capacity) signals a strong moat and forces you to buy. The
  scarce asset may be **profitable demand generation**, not capacity.

**This flips the utilization KPI.** Utilization-breakeven (~70–75%) is NOT a one-sided "stay above this"
guardrail — it is one tail of a two-sided risk. The model must price **both tails** under demand
scenarios: E[cost of shortage] vs. E[cost of underutilization], with the balance set by demand-moat
strength (Layer 1c). Strong/durable demand → shortage risk dominates → over-secure. Weak/speculative
demand → underutilization risk dominates → the overbuild/bubble case.

**Firm-optimal ≠ system-safe.** Individually rational capacity insurance (every strong-demand actor
over-securing) is exactly the mechanism that produces a *system-level* glut — reconciling the firm-level
"secure capacity now" logic with the macro overbuild risk from the value-capture dive. The model keeps
these two levels distinct.

### Layer 2 — Core compute economics *(the floor; necessary, not sufficient)*
- **LCOC (Levelized Cost of Compute)** — $/GPU-hr or $/Mtok to break even; fuses capex + power +
  depreciation + utilization. Candidate anchor for the *economics floor*.
- **Utilization / MFU** — the linchpin: LCOC denominator AND overbuild guardrail; least-observable input.
- **Yield-on-cost / development spread** (developer/landlord); **IRR / equity multiple** (capital).
- **Cost per token / depreciation-adjusted EBIT margin** (operator/buyer).
- **Margin-by-layer / value-capture position** — which slice of the stack you occupy (ends fat, middle thin).

### Layer 3 — Constraints / guardrails *(bound the feasible set)*
- Interconnection & transformer lead times by market; **utilization-breakeven (~70–75%)**; WUE/water;
  rack-density & cooling headroom; DSCR / debt yield.

---

## Open design questions
- Does the model output a single composite "win-probability / positioning score," a two-axis map
  (economics × competitive position), or a dashboard? *(leaning two-axis map)*
- How to quantify **agility** rigorously — it's the least-researched dimension (see gap below).
- Per-audience headline: developer (spread + timing) vs. compute buyer (LCOC + demand-capture)?
- Nominal vs. real; per-MW vs. per-fleet; monthly vs. annual conventions.

## Research status
- ✅ Deep-dived: **timing** (speed-to-market), **value-capture/overbuild**, and **agility/adaptability**
  (`topics/05-facility-lifecycle/agility-adaptability-L2.md`). Layers 1a, 1b and the capacity-risk
  asymmetry are grounded.
- **Layer 1c (demand moat)** — framed with the user; not yet separately researched. Candidate next dive:
  proxying brand/mindshare, ecosystem lock-in, and enterprise switching cost as a "demand credit
  quality" rating, incl. the consumer-vs-enterprise durability asymmetry.
- Primary-source follow-ups flagged by the agility dive: $/MW premium for power-distribution
  over-provisioning; whether facility loan covenants price floor-loading/power-headroom as collateral.
