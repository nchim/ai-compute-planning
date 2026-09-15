// Package optimize designs the phasing of a SitePlan against its demand ramp (docs/engine-design.md
// §Optimizer). Optimize is a pure, deterministic function of its input: a staged search over
// core.Analyze with a fixed evaluation budget, no randomness and no goroutines.
package optimize

import (
	"fmt"
	"math"
	"strings"

	"google.golang.org/protobuf/proto"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

// Diagnostic codes. Stable: the agent and the harness match on them.
const (
	codeUseAnalyze          = "USE_ANALYZE"
	codeMissingRequired     = "MISSING_REQUIRED"
	codeOutOfRange          = "OUT_OF_RANGE"
	codeUnknownMetric       = "UNKNOWN_METRIC"
	codeNoFeasible          = "NO_FEASIBLE_CANDIDATE"
	codeObjectiveDefaulted  = "OBJECTIVE_DEFAULTED"
	codeDecisionVarsIgnored = "DECISION_VARS_IGNORED"
	codePhaseCountSkipped   = "PHASE_COUNT_SKIPPED"
	codeSearchTruncated     = "SEARCH_TRUNCATED"
)

// Keys in Candidate.decision_var_values besides the per-phase "p<k>.mw", "p<k>.energize" and
// "p<k>.source" (index into power.sources; -1 = pooled supply).
const (
	keyPhases       = "phases"
	keyObjective    = "objective"        // the objective value the search minimizes
	keyAvgShortfall = "avg_shortfall_mw" // shortfall_mw_months / hold months (the policy's shortfall measure)
	keyBaseline     = "baseline"         // 1 on the single-shot reference build
	keyInvalid      = "invalid"          // 1 when Analyze rejected the candidate
)

const maxPhasesLimit = 8

// Optimize designs phases for a plan in phasing.mode=OPTIMIZE and returns the winner as an EXPLICIT
// plan, re-analyzed by the core so conservation holds. Model errors are diagnostics in the Result.
func Optimize(plan *pb.SitePlan) *pb.Result {
	var d diags
	if mode := plan.GetPhasing().GetMode(); mode != pb.PhasingMode_OPTIMIZE {
		d.errorf(codeUseAnalyze, "phasing.mode", "OPTIMIZE", mode.String(),
			"set phasing.mode=OPTIMIZE with a phasing.policy, or call Analyze for SINGLE_SHOT/EXPLICIT plans",
			"Optimize only handles phasing.mode=OPTIMIZE")
		return &pb.Result{Status: pb.Status_INVALID_INPUT, Diagnostics: d}
	}
	validatePolicy(plan.GetPhasing().GetPolicy(), &d)
	obj := objectiveOf(plan.GetOptimization(), &d)
	cons := constraintsOf(plan, &d)
	if d.hasErrors() {
		return &pb.Result{Status: pb.Status_INVALID_INPUT, Diagnostics: d}
	}
	s := newSearch(plan, obj, cons)
	if base := s.evaluateBaseline(); base.GetStatus() == pb.Status_INVALID_INPUT {
		// The plan is broken independently of phasing (or supply never reaches the target): fail here
		// with the core's precise diagnostics rather than reporting every candidate as infeasible.
		return &pb.Result{Status: pb.Status_INVALID_INPUT, Diagnostics: append(d, base.GetDiagnostics()...)}
	}
	converged := s.run(&d)
	return s.result(d, converged)
}

func validatePolicy(p *pb.PhasingPolicy, d *diags) {
	if p == nil {
		d.errorf(codeMissingRequired, "phasing.policy", "present", "missing",
			"set phasing.policy {max_phases, min_phase_mw, max_phase_mw, min_months_between_phases, max_shortfall_mw}",
			"phasing.policy is required in OPTIMIZE mode")
		return
	}
	within(d, "phasing.policy.max_phases", float64(p.GetMaxPhases()), 1, maxPhasesLimit)
	if p.GetMinPhaseMw() <= 0 {
		d.errorf(codeOutOfRange, "phasing.policy.min_phase_mw", "> 0", num(p.GetMinPhaseMw()), "set the smallest phase worth building, e.g. 25 MW", "min_phase_mw must be positive")
	}
	if p.GetMaxPhaseMw() < p.GetMinPhaseMw() {
		d.errorf(codeOutOfRange, "phasing.policy.max_phase_mw", fmt.Sprintf("≥ min_phase_mw (%g)", p.GetMinPhaseMw()), num(p.GetMaxPhaseMw()),
			"raise max_phase_mw or lower min_phase_mw", "max_phase_mw is below min_phase_mw")
	}
	nonNegative(d, "phasing.policy.min_months_between_phases", float64(p.GetMinMonthsBetweenPhases()))
	nonNegative(d, "phasing.policy.max_shortfall_mw", p.GetMaxShortfallMw())
}

// --- objective ------------------------------------------------------------------------------------

// objective is the scalar the search minimizes. MIN_STRANDED_PLUS_LCOC adds stranded MW-months and
// LCOC after dividing each by the single-shot baseline's value, so both terms equal 1.0 at the
// baseline and carry equal weight; a candidate scoring 1.6 has cut the combined waste by 20%.
type objective struct {
	typ                      pb.ObjectiveType
	strandedScale, lcocScale float64
}

func objectiveOf(o *pb.Optimization, d *diags) objective {
	typ := o.GetObjective().GetType()
	if typ == pb.ObjectiveType_OBJECTIVE_UNSPECIFIED {
		typ = pb.ObjectiveType_MIN_STRANDED_PLUS_LCOC
		d.infof(codeObjectiveDefaulted, "optimization.objective.type", "an ObjectiveType", "unspecified",
			"set optimization.objective.type to choose another objective", "objective defaulted to MIN_STRANDED_PLUS_LCOC")
	}
	if len(o.GetDecisionVars()) > 0 {
		d.infof(codeDecisionVarsIgnored, "optimization.decision_vars", "none", num(float64(len(o.GetDecisionVars())))+" vars",
			"bound the search with phasing.policy; decision_vars are reserved for later",
			"STUB: decision_vars are not honored; the optimizer varies phase count, size, timing and power source within phasing.policy")
	}
	return objective{typ: typ, strandedScale: 1, lcocScale: 1}
}

// normalize sets the MIN_STRANDED_PLUS_LCOC scales from the baseline; a zero baseline term keeps
// scale 1 so the term still counts in absolute units.
func (o *objective) normalize(base *pb.SummaryMetrics) {
	if v := base.GetStrandedCapacityMwMonths(); v > 0 {
		o.strandedScale = v
	}
	if v := base.GetLcocPerGpuHour(); v > 0 {
		o.lcocScale = v
	}
}

func (o objective) value(m *pb.SummaryMetrics) float64 {
	switch o.typ {
	case pb.ObjectiveType_MIN_LCOC:
		return m.GetLcocPerGpuHour()
	case pb.ObjectiveType_MIN_TIME_TO_REVENUE:
		return float64(m.GetTimeToEnergizeMonths())
	case pb.ObjectiveType_MAX_MW_CAPTURED:
		return -m.GetDemandCapturePct()
	case pb.ObjectiveType_MIN_RISK:
		return m.GetCompositeRiskScore()
	default:
		return m.GetStrandedCapacityMwMonths()/o.strandedScale + m.GetLcocPerGpuHour()/o.lcocScale
	}
}

// --- constraints ----------------------------------------------------------------------------------

const constraintRelTol = 1e-6

// constraint is one bound on a SummaryMetrics key; path says where the caller set it.
type constraint struct {
	path   string
	metric string
	op     pb.CompareOp
	value  float64
}

// constraintsOf reads optimization.constraints and appends the policy's shortfall bound. The policy's
// max_shortfall_mw is applied to the hold-average shortfall (shortfall_mw_months / hold months), i.e.
// as an equivalent bound on shortfall_mw_months. The instantaneous maximum is not usable: demand
// typically starts before any power source can energize, so every candidate would violate it.
func constraintsOf(plan *pb.SitePlan, d *diags) []constraint {
	var out []constraint
	for i, c := range plan.GetOptimization().GetConstraints() {
		path := fmt.Sprintf("optimization.constraints[%d]", i)
		if _, ok := metricValue(&pb.SummaryMetrics{}, c.GetMetric()); !ok {
			d.errorf(codeUnknownMetric, path+".metric", "one of "+strings.Join(metricKeys, ", "), c.GetMetric(),
				"use a SummaryMetrics field name", "constraint metric %q is not a summary metric", c.GetMetric())
		}
		if c.GetOp() == pb.CompareOp_OP_UNSPECIFIED {
			d.errorf(codeMissingRequired, path+".op", "LE, GE or EQ", "unspecified", "set the comparison operator", "%s.op is required", path)
		}
		out = append(out, constraint{path: path, metric: c.GetMetric(), op: c.GetOp(), value: c.GetValue()})
	}
	if mx := plan.GetPhasing().GetPolicy().GetMaxShortfallMw(); mx > 0 {
		hold := float64(plan.GetFinance().GetHoldPeriodMonths())
		out = append(out, constraint{path: "phasing.policy.max_shortfall_mw", metric: "shortfall_mw_months", op: pb.CompareOp_LE, value: mx * hold})
	}
	return out
}

// violation is 0 when the metric satisfies the bound within constraintRelTol, else the excess
// relative to the bound (so violations of different metrics are comparable).
func (c constraint) violation(m *pb.SummaryMetrics) float64 {
	v, _ := metricValue(m, c.metric)
	scale := math.Max(1, math.Abs(c.value))
	tol := constraintRelTol * scale
	var excess float64
	switch c.op {
	case pb.CompareOp_LE:
		excess = v - c.value - tol
	case pb.CompareOp_GE:
		excess = c.value - v - tol
	default:
		excess = math.Abs(v-c.value) - tol
	}
	return math.Max(0, excess) / scale
}

func (c constraint) String() string {
	return fmt.Sprintf("%s %s %g", c.metric, c.op, c.value)
}

// metricKeys are the SummaryMetrics fields a constraint may reference, in proto order.
var metricKeys = []string{
	"lcoc_per_gpu_hour", "total_capex", "capex_per_mw", "yield_on_cost_pct", "dev_spread_bps", "unlevered_irr_pct",
	"npv", "time_to_energize_months", "mw_online_final", "demand_capture_pct", "stranded_capacity_mw_months",
	"shortfall_mw_months", "composite_risk_score", "utilization_breakeven_pct",
}

func metricValue(m *pb.SummaryMetrics, key string) (float64, bool) {
	switch key {
	case "lcoc_per_gpu_hour":
		return m.GetLcocPerGpuHour(), true
	case "total_capex":
		return m.GetTotalCapex(), true
	case "capex_per_mw":
		return m.GetCapexPerMw(), true
	case "yield_on_cost_pct":
		return m.GetYieldOnCostPct(), true
	case "dev_spread_bps":
		return m.GetDevSpreadBps(), true
	case "unlevered_irr_pct":
		return m.GetUnleveredIrrPct(), true
	case "npv":
		return m.GetNpv(), true
	case "time_to_energize_months":
		return float64(m.GetTimeToEnergizeMonths()), true
	case "mw_online_final":
		return m.GetMwOnlineFinal(), true
	case "demand_capture_pct":
		return m.GetDemandCapturePct(), true
	case "stranded_capacity_mw_months":
		return m.GetStrandedCapacityMwMonths(), true
	case "shortfall_mw_months":
		return m.GetShortfallMwMonths(), true
	case "composite_risk_score":
		return m.GetCompositeRiskScore(), true
	case "utilization_breakeven_pct":
		return m.GetUtilizationBreakevenPct(), true
	}
	return 0, false
}

// --- result ---------------------------------------------------------------------------------------

// result assembles the Result: the winner's full analysis at the top level (so the UI renders it
// directly) plus the OptimizationResult; INFEASIBLE names the constraint violated most often.
func (s *search) result(d diags, converged bool) *pb.Result {
	opt := &pb.OptimizationResult{Frontier: s.frontier, Evaluations: int32(s.evaluations), Converged: converged}
	if s.best == nil {
		s.explainInfeasible(&d)
		return &pb.Result{Status: pb.Status_INFEASIBLE, Diagnostics: d, Optimization: opt}
	}
	b := s.best
	opt.BestPlan = s.toPlan(b.cand)
	opt.BestMetrics = b.res.GetSummary()
	opt.DecisionVarValues = b.entry.GetDecisionVarValues()
	d = append(d, b.res.GetDiagnostics()...)
	return &pb.Result{
		Status:       d.status(),
		Diagnostics:  d,
		Summary:      b.res.GetSummary(),
		Conservation: b.res.GetConservation(),
		Tables:       b.res.GetTables(),
		Charts:       b.res.GetCharts(),
		Schematic:    b.res.GetSchematic(),
		Optimization: opt,
	}
}

func (s *search) explainInfeasible(d *diags) {
	worst, count := -1, 0
	for i, n := range s.violations {
		if n > count {
			worst, count = i, n
		}
	}
	if worst < 0 {
		d.errorf(codeNoFeasible, "phasing.policy", "phase sizes and timings Analyze accepts", num(float64(s.evaluations))+" candidates rejected",
			"widen min/max_phase_mw or add firm supply so phases summing to target_it_load_mw can energize within the hold",
			"no candidate passed validation")
		return
	}
	c := s.cons[worst]
	d.errorf(codeNoFeasible, c.path, c.String(), fmt.Sprintf("violated by %d of %d candidates", count, s.evaluations),
		"relax "+c.path+" or change the inputs it depends on", "no candidate satisfies every constraint; %s is violated most often", c.String())
}

// toPlan is the candidate as an EXPLICIT plan Analyze accepts as-is. Construction starts one lead
// time before energization (never before t0); cooling follows compute.cooling.
func (s *search) toPlan(c candidate) *pb.SitePlan {
	p := proto.Clone(s.plan).(*pb.SitePlan)
	p.Phasing.Mode = pb.PhasingMode_EXPLICIT
	p.Phasing.Phases = make([]*pb.Phase, len(c))
	for k, ph := range c {
		var id string
		if ph.src >= 0 {
			id = s.srcs[ph.src].id
		}
		p.Phasing.Phases[k] = &pb.Phase{
			Id: fmt.Sprintf("p%d", k+1), ItLoadMw: ph.mw, StartMonth: int32(max(ph.energize-constructionLeadMonths, 0)),
			EnergizeMonth: int32(ph.energize), PowerSourceId: id,
		}
	}
	setAnalyzeMode(p)
	return p
}

// --- diagnostics ----------------------------------------------------------------------------------

type diags []*pb.Diagnostic

func (d *diags) add(sev pb.Severity, code, path, msg, expected, actual, hint string) {
	*d = append(*d, &pb.Diagnostic{Severity: sev, Code: code, Message: msg, ProtoPath: path, Expected: expected, Actual: actual, Hint: hint})
}

func (d *diags) errorf(code, path, expected, actual, hint, format string, args ...any) {
	d.add(pb.Severity_ERROR, code, path, fmt.Sprintf(format, args...), expected, actual, hint)
}

func (d *diags) infof(code, path, expected, actual, hint, format string, args ...any) {
	d.add(pb.Severity_INFO, code, path, fmt.Sprintf(format, args...), expected, actual, hint)
}

func (d diags) hasErrors() bool {
	for _, x := range d {
		if x.GetSeverity() == pb.Severity_ERROR {
			return true
		}
	}
	return false
}

func (d diags) status() pb.Status {
	if d.hasErrors() {
		return pb.Status_INVALID_INPUT
	}
	for _, x := range d {
		if x.GetSeverity() == pb.Severity_WARNING {
			return pb.Status_OK_WITH_WARNINGS
		}
	}
	return pb.Status_OK
}

func nonNegative(d *diags, path string, v float64) {
	if v < 0 {
		d.errorf(codeOutOfRange, path, "≥ 0", num(v), "set "+path+" to zero or a positive value", "%s must not be negative", path)
	}
}

func within(d *diags, path string, v, lo, hi float64) {
	if v < lo || v > hi {
		d.errorf(codeOutOfRange, path, fmt.Sprintf("%g..%g", lo, hi), num(v), fmt.Sprintf("set %s within %g..%g", path, lo, hi), "%s is out of range", path)
	}
}

func num(v float64) string { return fmt.Sprintf("%g", v) }
