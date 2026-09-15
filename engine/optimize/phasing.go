package optimize

import (
	"fmt"
	"math"
	"sort"

	"google.golang.org/protobuf/proto"

	"github.com/nchim/ai-compute-planning/engine/core"
	"github.com/nchim/ai-compute-planning/engine/pb"
)

// Search budget and shape. The search is staged: (1) enumerate phase count × power-source assignment,
// (2) seed each with a demand-tracking heuristic, (3) refine the best seeds by coordinate descent.
const (
	evalBudget     = 400 // core.Analyze calls per Optimize, including the baseline
	maxAssignments = 64  // cap on (phase count, source assignment) combinations enumerated
	descentSeeds   = 3   // seeds refined by coordinate descent, best first
)

// energizeDeltas are the timing moves tried per phase, coarse to fine.
var energizeDeltas = []int{6, -6, 3, -3, 2, -2, 1, -1}

// source is a firm power source with its readiness resolved (grid waits for the interconnection).
type source struct {
	index      int // position in power.sources
	id         string
	ready      int
	capacityMw float64
}

// phaseVar is one phase's decision variables; src indexes search.srcs, -1 means pooled supply.
type phaseVar struct {
	mw       float64
	energize int
	src      int
}

type candidate []phaseVar

func (c candidate) clone() candidate { return append(candidate(nil), c...) }

func (c candidate) key() string { return fmt.Sprint([]phaseVar(c)) }

// evaluated is a candidate with its analysis and ranking data.
type evaluated struct {
	cand      candidate
	res       *pb.Result
	entry     *pb.Candidate // its frontier entry
	feasible  bool
	objective float64
	violation float64 // sum of relative constraint violations; +Inf when Analyze rejected it
}

// better ranks a over b: feasible beats infeasible; feasible candidates by objective (strictly
// lower), infeasible ones by total violation so the descent is pulled towards feasibility.
func better(a, b *evaluated) bool {
	if b == nil {
		return true
	}
	if a.feasible != b.feasible {
		return a.feasible
	}
	if a.feasible {
		return a.objective < b.objective
	}
	return a.violation < b.violation
}

type search struct {
	plan        *pb.SitePlan
	policy      *pb.PhasingPolicy
	srcs        []source // firm sources sorted by ready month, then id
	target, pue float64
	hold        int
	obj         objective
	cons        []constraint
	violations  []int // per constraint: candidates that violated it
	evaluations int
	memo        map[string]*evaluated // by candidate key; lookups only, never iterated
	frontier    []*pb.Candidate
	best        *evaluated
}

func newSearch(plan *pb.SitePlan, obj objective, cons []constraint) *search {
	return &search{
		plan: plan, policy: plan.GetPhasing().GetPolicy(), srcs: firmSources(plan.GetPower()),
		target: plan.GetCompute().GetTargetItLoadMw(), pue: plan.GetCompute().GetPue(),
		hold: int(plan.GetFinance().GetHoldPeriodMonths()), obj: obj, cons: cons,
		violations: make([]int, len(cons)), memo: map[string]*evaluated{},
	}
}

func firmSources(p *pb.PowerPlan) []source {
	var out []source
	for i, s := range p.GetSources() {
		if s.GetType() == pb.PowerType_BESS {
			continue // storage is not firm supply (core: STORAGE_NOT_FIRM)
		}
		ready := int(s.GetAvailableMonth())
		if s.GetType() == pb.PowerType_GRID {
			ready = max(ready, int(p.GetInterconnection().GetGridEnergizeMonth()))
		}
		out = append(out, source{index: i, id: s.GetId(), ready: ready, capacityMw: s.GetCapacityMw()})
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].ready != out[j].ready {
			return out[i].ready < out[j].ready
		}
		return out[i].id < out[j].id
	})
	return out
}

func (s *search) firmSupplyAt(t int) float64 {
	var mw float64
	for _, src := range s.srcs {
		if src.ready <= t {
			mw += src.capacityMw
		}
	}
	return mw
}

// --- evaluation -----------------------------------------------------------------------------------

// evaluateBaseline analyzes the SINGLE_SHOT build as the reference: it normalizes the flagship
// objective and appears in the frontier, but it ignores the policy so it never wins.
func (s *search) evaluateBaseline() *pb.Result {
	p := proto.Clone(s.plan).(*pb.SitePlan)
	p.Phasing.Mode = pb.PhasingMode_SINGLE_SHOT
	setAnalyzeMode(p)
	res := core.Analyze(p)
	s.evaluations++
	if res.GetStatus() == pb.Status_INVALID_INPUT {
		return res
	}
	s.obj.normalize(res.GetSummary())
	base := candidate{{mw: s.target, energize: int(res.GetSummary().GetTimeToEnergizeMonths()), src: -1}}
	s.score(base, res).entry.DecisionVarValues[keyBaseline] = 1
	return res
}

// setAnalyzeMode makes a cloned plan acceptable to core.Analyze, which rejects run.mode=RUN_OPTIMIZE.
func setAnalyzeMode(p *pb.SitePlan) {
	if p.Run == nil {
		p.Run = &pb.RunOptions{}
	}
	p.Run.Mode = pb.RunMode_RUN_ANALYZE
}

func (s *search) exhausted() bool { return s.evaluations >= evalBudget }

// evaluate analyzes a candidate (once; repeats are served from the memo) and records it.
func (s *search) evaluate(c candidate) *evaluated {
	if ev, ok := s.memo[c.key()]; ok {
		return ev
	}
	res := core.Analyze(s.toPlan(c))
	s.evaluations++
	ev := s.score(c, res)
	s.memo[c.key()] = ev
	if ev.feasible && better(ev, s.best) {
		s.best = ev
	}
	return ev
}

// score derives feasibility and the objective from an analysis and appends the frontier entry.
func (s *search) score(c candidate, res *pb.Result) *evaluated {
	ev := &evaluated{cand: c, res: res, entry: &pb.Candidate{DecisionVarValues: s.values(c)}}
	s.frontier = append(s.frontier, ev.entry)
	vals := ev.entry.DecisionVarValues
	// A candidate the core rejects, or whose ledger fails a conservation check (its numbers are not to
	// be trusted, per the check's own hint), can never be the winner.
	if res.GetStatus() == pb.Status_INVALID_INPUT || !res.GetConservation().GetAllPassed() {
		ev.violation = math.Inf(1)
		vals[keyInvalid] = 1
		return ev
	}
	m := res.GetSummary()
	for i, con := range s.cons {
		if v := con.violation(m); v > 0 {
			ev.violation += v
			s.violations[i]++
		}
	}
	ev.feasible = ev.violation == 0
	ev.objective = s.obj.value(m)
	ev.entry.Metrics, ev.entry.Feasible = m, ev.feasible
	vals[keyObjective] = ev.objective
	vals[keyAvgShortfall] = m.GetShortfallMwMonths() / float64(s.hold)
	return ev
}

func (s *search) values(c candidate) map[string]float64 {
	v := map[string]float64{keyPhases: float64(len(c))}
	for k, ph := range c {
		pre := fmt.Sprintf("p%d.", k+1)
		v[pre+"mw"], v[pre+"energize"], v[pre+"source"] = ph.mw, float64(ph.energize), -1
		if ph.src >= 0 {
			v[pre+"source"] = float64(s.srcs[ph.src].index)
		}
	}
	return v
}

// --- staged search --------------------------------------------------------------------------------

// run executes the staged search; it reports false when the budget ran out before the descent
// finished (converged=false).
func (s *search) run(d *diags) bool {
	seeds := s.seeds(d)
	sort.SliceStable(seeds, func(i, j int) bool { return better(seeds[i], seeds[j]) })
	for i, seed := range seeds {
		if i == descentSeeds {
			break
		}
		if !s.descend(seed) {
			return false
		}
	}
	return true
}

// seeds enumerates phase counts and non-decreasing source assignments (sources ordered by readiness,
// so later phases never sit on an earlier source than their predecessors — a deliberate cap on the
// categorical space) and evaluates the demand-tracking seed of each.
func (s *search) seeds(d *diags) []*evaluated {
	var out []*evaluated
	combos := 0
	for n := 1; n <= int(s.policy.GetMaxPhases()); n++ {
		if lo, hi := float64(n)*s.policy.GetMinPhaseMw(), float64(n)*s.policy.GetMaxPhaseMw(); s.target < lo-1e-9 || s.target > hi+1e-9 {
			d.infof(codePhaseCountSkipped, "phasing.policy", fmt.Sprintf("%d × [min,max] covering %g MW", n, s.target), fmt.Sprintf("%g..%g MW", lo, hi),
				"adjust min_phase_mw/max_phase_mw to allow this phase count", "%d-phase plans cannot sum to target_it_load_mw", n)
			continue
		}
		for _, assign := range assignments(n, len(s.srcs)) {
			if combos == maxAssignments {
				d.infof(codeSearchTruncated, "power.sources", fmt.Sprintf("≤ %d phase-count × source combinations", maxAssignments), "more",
					"reduce max_phases or the number of power sources", "search enumerated only the first %d combinations", maxAssignments)
				return out
			}
			combos++
			if c, ok := s.seed(assign); ok && !s.exhausted() {
				out = append(out, s.evaluate(c))
			}
		}
	}
	return out
}

// assignments lists the non-decreasing sequences of length n over [0, k).
func assignments(n, k int) [][]int {
	var out [][]int
	var rec func(prefix []int, from int)
	rec = func(prefix []int, from int) {
		if len(prefix) == n {
			out = append(out, append([]int(nil), prefix...))
			return
		}
		for i := from; i < k; i++ {
			rec(append(prefix, i), i)
		}
	}
	rec(nil, 0)
	return out
}

// seed builds the demand-tracking candidate for one source assignment: phase k energizes at the
// earliest month allowed by its source, the spacing rule and pooled firm supply, and is sized to close
// the projected demand gap there, within bounds that keep the remaining phases feasible. The last
// phase takes the remainder so sizes sum to the target.
func (s *search) seed(assign []int) (candidate, bool) {
	n := len(assign)
	c := make(candidate, n)
	var cumIt float64
	used := make([]float64, len(s.srcs)) // facility MW already placed on each source
	for k, si := range assign {
		rest := float64(n - k - 1)
		lo := math.Max(s.policy.GetMinPhaseMw(), s.target-cumIt-rest*s.policy.GetMaxPhaseMw())
		hi := math.Min(s.policy.GetMaxPhaseMw(), s.target-cumIt-rest*s.policy.GetMinPhaseMw())
		if k == n-1 {
			lo, hi = s.target-cumIt, s.target-cumIt
		}
		e := s.srcs[si].ready
		if k > 0 {
			e = max(e, c[k-1].energize+int(s.policy.GetMinMonthsBetweenPhases()))
		}
		own := (s.srcs[si].capacityMw - used[si]) / s.pue
		e, mw, ok := s.fit(e, cumIt, lo, hi, own)
		if !ok {
			return nil, false
		}
		c[k] = phaseVar{mw: mw, energize: e, src: si}
		cumIt += mw
		used[si] += mw * s.pue
	}
	return c, true
}

// fit finds the first month ≥ e0 at which pooled supply can carry at least lo more IT MW on top of
// cumIt, and sizes the phase to the demand gap (whole MW) clamped to [lo, hi], to the pooled supply
// and to the IT MW its own source still has (own).
func (s *search) fit(e0 int, cumIt, lo, hi, own float64) (int, float64, bool) {
	if own < lo-1e-9 {
		return 0, 0, false
	}
	for e := e0; e < s.hold; e++ {
		allowed := math.Floor(math.Min(s.firmSupplyAt(e)/s.pue-cumIt, own))
		if allowed < lo-1e-9 {
			continue
		}
		want := clamp(math.Floor(core.DemandAt(s.plan.GetDemand().GetPoints(), e)-cumIt), lo, hi)
		return e, math.Min(want, allowed), true
	}
	return 0, 0, false
}

// valid is the cheap pre-check for descent moves: policy bounds, source readiness and capacity,
// spacing, the hold and pooled supply. Moves failing it are not worth an evaluation. Core enforces
// per-source capacity too (SOURCE_OVERLOADED); repeating it here just saves the Analyze call.
func (s *search) valid(c candidate) bool {
	var cumFac float64
	used := make([]float64, len(s.srcs))
	for k, ph := range c {
		if ph.mw < s.policy.GetMinPhaseMw()-1e-9 || ph.mw > s.policy.GetMaxPhaseMw()+1e-9 || ph.energize >= s.hold {
			return false
		}
		if k > 0 && ph.energize < c[k-1].energize+int(s.policy.GetMinMonthsBetweenPhases()) {
			return false
		}
		cumFac += ph.mw * s.pue
		if s.firmSupplyAt(ph.energize) < cumFac-1e-9 {
			return false
		}
		if ph.src >= 0 {
			used[ph.src] += ph.mw * s.pue
			if ph.energize < s.srcs[ph.src].ready || used[ph.src] > s.srcs[ph.src].capacityMw+1e-9 {
				return false
			}
		}
	}
	return true
}

// descend is bounded coordinate descent from a seed: per phase, shift energization by
// energizeDeltas and move min_phase_mw of capacity to/from a neighbour, accepting only strict
// improvements. It converges when a full pass yields none; false means the budget ran out first.
func (s *search) descend(inc *evaluated) bool {
	step := s.policy.GetMinPhaseMw()
	for {
		improved := false
		try := func(c candidate) bool {
			if c == nil || !s.valid(c) {
				return true
			}
			if s.exhausted() {
				return false
			}
			if ev := s.evaluate(c); better(ev, inc) {
				inc, improved = ev, true
			}
			return true
		}
		for k := range inc.cand {
			for _, delta := range energizeDeltas {
				if !try(shifted(inc.cand, k, delta)) {
					return false
				}
			}
			for _, delta := range []float64{step, -step} {
				if !try(resized(inc.cand, k, delta)) {
					return false
				}
			}
		}
		if !improved {
			return true
		}
	}
}

func shifted(c candidate, k, months int) candidate {
	out := c.clone()
	out[k].energize += months
	return out
}

// resized moves mw from phase k to its successor (predecessor for the last phase), so Σ stays fixed.
func resized(c candidate, k int, mw float64) candidate {
	partner := k + 1
	if partner == len(c) {
		partner = k - 1
	}
	if partner < 0 {
		return nil // single phase: nothing to trade with
	}
	out := c.clone()
	out[k].mw += mw
	out[partner].mw -= mw
	return out
}

func clamp(x, lo, hi float64) float64 { return math.Min(math.Max(x, lo), hi) }
