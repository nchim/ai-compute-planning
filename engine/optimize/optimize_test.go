package optimize

import (
	"bytes"
	"os"
	"testing"

	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"

	"github.com/nchim/ai-compute-planning/engine/core"
	"github.com/nchim/ai-compute-planning/engine/pb"
)

const fixturePath = "../../fixtures/abilene-1.json"

// t3Plan is the acceptance-session T3 scenario: the Abilene fixture with a BTM gas bridge, the phasing
// policy from the session script and a capex cap. gpus_per_rack is pinned to 22 so the capex cap is
// satisfiable whichever fixture revision is checked out.
func t3Plan(t testing.TB) *pb.SitePlan {
	t.Helper()
	raw, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var plan pb.SitePlan
	if err := protojson.Unmarshal(raw, &plan); err != nil {
		t.Fatalf("parse fixture: %v", err)
	}
	plan.Compute.GpusPerRack = 22
	plan.Power.Sources = append(plan.Power.Sources, &pb.PowerSource{
		Id: "gas", Type: pb.PowerType_BTM_GAS, CapacityMw: 80, AvailableMonth: 12, CostPerMwh: 85, CapexPerKw: 1200, LeadTimeMonths: 12,
	})
	plan.Phasing = &pb.Phasing{Mode: pb.PhasingMode_OPTIMIZE, Policy: &pb.PhasingPolicy{
		MaxPhases: 4, MinPhaseMw: 25, MaxPhaseMw: 100, MinMonthsBetweenPhases: 6, MaxShortfallMw: 20,
	}}
	plan.Optimization = &pb.Optimization{
		Objective:   &pb.Objective{Type: pb.ObjectiveType_MIN_STRANDED_PLUS_LCOC},
		Constraints: []*pb.Constraint{{Metric: "total_capex", Op: pb.CompareOp_LE, Value: 8e9}},
	}
	plan.Run.Mode = pb.RunMode_RUN_OPTIMIZE
	return &plan
}

func findDiag(r *pb.Result, code string) *pb.Diagnostic {
	for _, d := range r.GetDiagnostics() {
		if d.GetCode() == code {
			return d
		}
	}
	return nil
}

// baseline is the frontier entry for the single-shot reference build.
func baseline(t *testing.T, r *pb.Result) *pb.Candidate {
	t.Helper()
	for _, c := range r.GetOptimization().GetFrontier() {
		if c.GetDecisionVarValues()[keyBaseline] == 1 {
			return c
		}
	}
	t.Fatal("frontier has no baseline candidate")
	return nil
}

func TestOptimizeT3BeatsSingleShot(t *testing.T) {
	plan := t3Plan(t)
	r := Optimize(plan)
	if r.GetStatus() != pb.Status_OK && r.GetStatus() != pb.Status_OK_WITH_WARNINGS {
		t.Fatalf("status %v; diagnostics %v", r.GetStatus(), r.GetDiagnostics())
	}
	opt := r.GetOptimization()
	if !opt.GetConverged() {
		t.Errorf("not converged after %d evaluations", opt.GetEvaluations())
	}
	if opt.GetEvaluations() <= 0 || opt.GetEvaluations() > evalBudget {
		t.Errorf("evaluations = %d, want 1..%d", opt.GetEvaluations(), evalBudget)
	}
	if !r.GetConservation().GetAllPassed() {
		t.Errorf("conservation failed: %v", r.GetConservation())
	}
	best := opt.GetBestPlan()
	if best.GetPhasing().GetMode() != pb.PhasingMode_EXPLICIT || len(best.GetPhasing().GetPhases()) < 2 {
		t.Fatalf("best plan must be EXPLICIT with ≥ 2 phases, got %v", best.GetPhasing())
	}
	if first := best.GetPhasing().GetPhases()[0]; first.GetPowerSourceId() != "gas" || first.GetEnergizeMonth() >= 30 {
		t.Errorf("first phase = %v, want gas before the m30 grid", first)
	}
	prev := int32(-1)
	for _, ph := range best.GetPhasing().GetPhases() {
		if ph.GetEnergizeMonth() <= prev {
			t.Errorf("phase energize months not strictly increasing: %v", best.GetPhasing().GetPhases())
		}
		prev = ph.GetEnergizeMonth()
	}

	// The winner must beat the single-shot reference on the objective and on both of its terms.
	base := baseline(t, r)
	win := opt.GetDecisionVarValues()
	if win[keyObjective] >= base.GetDecisionVarValues()[keyObjective] {
		t.Errorf("objective %g not better than baseline %g", win[keyObjective], base.GetDecisionVarValues()[keyObjective])
	}
	bm, wm := base.GetMetrics(), opt.GetBestMetrics()
	if wm.GetDemandCapturePct() <= bm.GetDemandCapturePct() {
		t.Errorf("demand capture %g ≤ baseline %g", wm.GetDemandCapturePct(), bm.GetDemandCapturePct())
	}
	if wm.GetStrandedCapacityMwMonths() >= bm.GetStrandedCapacityMwMonths() {
		t.Errorf("stranded %g ≥ baseline %g", wm.GetStrandedCapacityMwMonths(), bm.GetStrandedCapacityMwMonths())
	}
	if wm.GetTotalCapex() > 8e9 {
		t.Errorf("total_capex %g violates the 8e9 cap", wm.GetTotalCapex())
	}

	// The winner is a plan Analyze accepts as-is, and the Result carries its outputs for the UI.
	again := core.Analyze(best)
	if again.GetStatus() == pb.Status_INVALID_INPUT || !again.GetConservation().GetAllPassed() {
		t.Errorf("best plan does not re-analyze cleanly: %v", again.GetDiagnostics())
	}
	if !proto.Equal(again.GetSummary(), r.GetSummary()) || len(r.GetTables()) == 0 || len(r.GetCharts()) == 0 || r.GetSchematic() == nil {
		t.Error("top-level Result must carry the winner's summary, tables, charts and schematic")
	}
	if len(opt.GetFrontier()) < 3 {
		t.Errorf("frontier has %d entries, want the baseline plus explored candidates", len(opt.GetFrontier()))
	}
	t.Logf("baseline: objective=%.3f capture=%.1f%% stranded=%g lcoc=%.3f capex=%.3g feasible=%v",
		base.GetDecisionVarValues()[keyObjective], bm.GetDemandCapturePct(), bm.GetStrandedCapacityMwMonths(), bm.GetLcocPerGpuHour(), bm.GetTotalCapex(), base.GetFeasible())
	t.Logf("winner:   objective=%.3f capture=%.1f%% stranded=%g lcoc=%.3f capex=%.3g evaluations=%d phases=%v",
		win[keyObjective], wm.GetDemandCapturePct(), wm.GetStrandedCapacityMwMonths(), wm.GetLcocPerGpuHour(), wm.GetTotalCapex(), opt.GetEvaluations(), best.GetPhasing().GetPhases())
}

func TestOptimizeIsDeterministic(t *testing.T) {
	opts := proto.MarshalOptions{Deterministic: true}
	a, err := opts.Marshal(Optimize(t3Plan(t)))
	if err != nil {
		t.Fatal(err)
	}
	b, err := opts.Marshal(Optimize(t3Plan(t)))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(a, b) {
		t.Fatal("two runs on identical input produced different bytes")
	}
}

func TestOptimizeInfeasibleConstraints(t *testing.T) {
	plan := t3Plan(t)
	plan.Optimization.Constraints[0].Value = 1
	r := Optimize(plan)
	if r.GetStatus() != pb.Status_INFEASIBLE {
		t.Fatalf("status %v, want INFEASIBLE", r.GetStatus())
	}
	d := findDiag(r, codeNoFeasible)
	if d == nil || d.GetProtoPath() != "optimization.constraints[0]" {
		t.Fatalf("want NO_FEASIBLE_CANDIDATE naming the capex constraint, got %v", r.GetDiagnostics())
	}
	if r.GetOptimization().GetBestPlan() != nil || len(r.GetOptimization().GetFrontier()) == 0 {
		t.Error("infeasible result must carry the frontier but no best plan")
	}
	for _, c := range r.GetOptimization().GetFrontier() {
		if c.GetFeasible() {
			t.Fatalf("frontier entry marked feasible under an impossible constraint: %v", c)
		}
	}
}

func TestOptimizeInputErrors(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(*pb.SitePlan)
		code   string
		path   string
	}{
		{"wrong mode", func(p *pb.SitePlan) { p.Phasing.Mode = pb.PhasingMode_SINGLE_SHOT }, codeUseAnalyze, "phasing.mode"},
		{"missing policy", func(p *pb.SitePlan) { p.Phasing.Policy = nil }, codeMissingRequired, "phasing.policy"},
		{"max_phases out of range", func(p *pb.SitePlan) { p.Phasing.Policy.MaxPhases = 9 }, codeOutOfRange, "phasing.policy.max_phases"},
		{"min > max", func(p *pb.SitePlan) { p.Phasing.Policy.MinPhaseMw = 150 }, codeOutOfRange, "phasing.policy.max_phase_mw"},
		{"negative spacing", func(p *pb.SitePlan) { p.Phasing.Policy.MinMonthsBetweenPhases = -1 }, codeOutOfRange, "phasing.policy.min_months_between_phases"},
		{"negative shortfall", func(p *pb.SitePlan) { p.Phasing.Policy.MaxShortfallMw = -1 }, codeOutOfRange, "phasing.policy.max_shortfall_mw"},
		{"unknown metric", func(p *pb.SitePlan) { p.Optimization.Constraints[0].Metric = "capex" }, codeUnknownMetric, "optimization.constraints[0].metric"},
		{"missing op", func(p *pb.SitePlan) { p.Optimization.Constraints[0].Op = pb.CompareOp_OP_UNSPECIFIED }, codeMissingRequired, "optimization.constraints[0].op"},
		{"broken site", func(p *pb.SitePlan) { p.Site.UsableAcres = 0 }, "OUT_OF_RANGE", "site.usable_acres"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			plan := t3Plan(t)
			tc.mutate(plan)
			r := Optimize(plan)
			if r.GetStatus() != pb.Status_INVALID_INPUT {
				t.Fatalf("status %v, want INVALID_INPUT", r.GetStatus())
			}
			d := findDiag(r, tc.code)
			if d == nil || d.GetProtoPath() != tc.path {
				t.Fatalf("want %s@%s, got %v", tc.code, tc.path, r.GetDiagnostics())
			}
			if d.GetMessage() == "" || d.GetExpected() == "" || d.GetActual() == "" || d.GetHint() == "" {
				t.Errorf("incomplete diagnostic: %v", d)
			}
		})
	}
}

func TestOptimizeDefaultsObjective(t *testing.T) {
	plan := t3Plan(t)
	plan.Optimization.Objective = nil
	r := Optimize(plan)
	if d := findDiag(r, codeObjectiveDefaulted); d == nil || d.GetSeverity() != pb.Severity_INFO {
		t.Fatalf("want INFO OBJECTIVE_DEFAULTED, got %v", r.GetDiagnostics())
	}
	if r.GetOptimization().GetBestPlan() == nil {
		t.Fatal("defaulted objective must still optimize")
	}
}

// Every objective runs through the same loop; each must produce a feasible winner on T3.
func TestOptimizeAllObjectives(t *testing.T) {
	for _, obj := range []pb.ObjectiveType{pb.ObjectiveType_MIN_LCOC, pb.ObjectiveType_MIN_TIME_TO_REVENUE, pb.ObjectiveType_MAX_MW_CAPTURED, pb.ObjectiveType_MIN_RISK} {
		t.Run(obj.String(), func(t *testing.T) {
			plan := t3Plan(t)
			plan.Optimization.Objective.Type = obj
			r := Optimize(plan)
			if r.GetOptimization().GetBestPlan() == nil || !r.GetConservation().GetAllPassed() {
				t.Fatalf("status %v, diagnostics %v", r.GetStatus(), r.GetDiagnostics())
			}
		})
	}
}

func BenchmarkOptimize(b *testing.B) {
	plan := t3Plan(b)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if Optimize(plan).GetOptimization().GetBestPlan() == nil {
			b.Fatal("T3 must optimize")
		}
	}
}

// WS10 live run: dense racks round each phase's load up, so three small gas phases nominally within
// the 150 MW bridge drew 150.23 MW and the winner failed power_supply_ge_demand_t. Such a candidate
// must be reported as invalid, never chosen. (Root cause — the optimizer's per-source cap uses nominal
// MW while the core rounds to whole racks — is tracked as a follow-up.)
func TestOptimizeNeverPicksAConservationFailure(t *testing.T) {
	plan := t3Plan(t)
	plan.Compute.KwPerRack, plan.Compute.GpusPerRack, plan.Compute.Cooling = 130, 72, pb.CoolingMode_LIQUID_DTC
	plan.Site.FloorLoadPsf = 300
	gas := plan.Power.Sources[1]
	gas.CapacityMw, gas.CapexPerKw, gas.LeadTimeMonths, gas.CostPerMwh = 150, 700, 15, 90
	plan.Phasing.Policy = &pb.PhasingPolicy{MaxPhases: 6, MinPhaseMw: 10, MaxPhaseMw: 100, MinMonthsBetweenPhases: 6, MaxShortfallMw: 20}
	plan.Optimization.Constraints = append(plan.Optimization.Constraints, &pb.Constraint{Metric: "shortfall_mw_months", Op: pb.CompareOp_LE, Value: 400})
	res := Optimize(plan)
	if res.GetStatus() == pb.Status_INVALID_INPUT {
		t.Fatalf("unexpected INVALID_INPUT: %v", res.GetDiagnostics())
	}
	if res.GetOptimization().GetBestPlan() != nil && !res.GetConservation().GetAllPassed() {
		t.Fatalf("winner fails conservation: %v", res.GetDiagnostics())
	}
	for _, c := range res.GetOptimization().GetFrontier() {
		if c.GetFeasible() && c.GetDecisionVarValues()[keyInvalid] == 1 {
			t.Fatal("an invalid candidate is marked feasible")
		}
	}
}
