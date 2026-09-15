package engine

import (
	"os"
	"testing"

	"google.golang.org/protobuf/encoding/protojson"

	"github.com/nchim/ai-compute-planning/engine/core"
	"github.com/nchim/ai-compute-planning/engine/pb"
)

// Every grounding fixture must survive the risk layer and the optimizer, not just the core: no
// INTERNAL_ERROR, no conservation failure, a filled Monte Carlo block and a winning explicit plan
// that re-analyzes clean. Distributions and policies are per fixture because the businesses differ.
type scenario struct {
	name          string
	distributions []*pb.InputDistribution
	sensitivity   []string
	policy        *pb.PhasingPolicy
}

var scenarios = []scenario{
	{
		name: "abilene-1",
		distributions: []*pb.InputDistribution{
			{InputPath: "revenue.compute.gpu_hour_price", Type: pb.DistributionType_TRIANGULAR, Params: []float64{2.0, 3.25, 4.0}},
			{InputPath: "revenue.compute.utilization_pct", Type: pb.DistributionType_NORMAL, Params: []float64{80, 8}},
		},
		sensitivity: []string{"revenue.compute.gpu_hour_price", "costs.gpu.unit_cost"},
		policy:      &pb.PhasingPolicy{MaxPhases: 3, MinPhaseMw: 50, MaxPhaseMw: 200, MinMonthsBetweenPhases: 6, MaxShortfallMw: 60},
	},
	{
		name: "nova-colo",
		distributions: []*pb.InputDistribution{
			{InputPath: "revenue.colo.rate_per_kw_month", Type: pb.DistributionType_TRIANGULAR, Params: []float64{200, 285, 330}},
			{InputPath: "revenue.colo.vacancy_pct", Type: pb.DistributionType_TRIANGULAR, Params: []float64{0, 5, 15}},
			{InputPath: "power.sources[1].cost_per_mwh", Type: pb.DistributionType_NORMAL, Params: []float64{150, 20}},
		},
		sensitivity: []string{"revenue.colo.rate_per_kw_month", "costs.shell_capex_per_mw"},
		policy:      &pb.PhasingPolicy{MaxPhases: 3, MinPhaseMw: 5, MaxPhaseMw: 20, MinMonthsBetweenPhases: 6, MaxShortfallMw: 10},
	},
	{
		name: "epoch-100mw",
		distributions: []*pb.InputDistribution{
			{InputPath: "revenue.compute.gpu_hour_price", Type: pb.DistributionType_TRIANGULAR, Params: []float64{2.0, 3.0, 4.0}},
			{InputPath: "revenue.compute.utilization_pct", Type: pb.DistributionType_NORMAL, Params: []float64{71, 8}},
			{InputPath: "costs.gpu.unit_cost", Type: pb.DistributionType_NORMAL, Params: []float64{41900, 5000}},
		},
		sensitivity: []string{"revenue.compute.gpu_hour_price", "power.sources[0].cost_per_mwh"},
		policy:      &pb.PhasingPolicy{MaxPhases: 3, MinPhaseMw: 20, MaxPhaseMw: 90, MinMonthsBetweenPhases: 6, MaxShortfallMw: 30},
	},
}

func loadNamed(t testing.TB, name string) *pb.SitePlan {
	t.Helper()
	raw, err := os.ReadFile("../fixtures/" + name + ".json")
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var plan pb.SitePlan
	if err := protojson.Unmarshal(raw, &plan); err != nil {
		t.Fatalf("parse fixture %s: %v", name, err)
	}
	return &plan
}

func requireClean(t *testing.T, res *pb.Result) {
	t.Helper()
	for _, d := range res.GetDiagnostics() {
		if d.GetCode() == "INTERNAL_ERROR" || d.GetCode() == "CONSERVATION_FAILED" || d.GetSeverity() == pb.Severity_ERROR {
			t.Fatalf("diagnostic %s@%s: %s", d.GetCode(), d.GetProtoPath(), d.GetMessage())
		}
	}
	if res.GetStatus() != pb.Status_OK && res.GetStatus() != pb.Status_OK_WITH_WARNINGS {
		t.Fatalf("status %v", res.GetStatus())
	}
	if !res.GetConservation().GetAllPassed() {
		t.Fatalf("conservation failed: %v", res.GetConservation())
	}
}

func TestScenariosMonteCarloSmoke(t *testing.T) {
	for _, sc := range scenarios {
		t.Run(sc.name, func(t *testing.T) {
			plan := loadNamed(t, sc.name)
			plan.Risk = &pb.RiskParams{Distributions: sc.distributions}
			plan.Run.MonteCarlo = &pb.MonteCarloOptions{Enabled: true, Iterations: 200, Seed: 7}
			plan.Run.Sensitivity = &pb.SensitivityOptions{Enabled: true, InputPaths: sc.sensitivity}
			res := Analyze(plan)
			requireClean(t, res)
			if res.GetStatus() != pb.Status_OK {
				t.Fatalf("expected a clean OK (every draw valid), got %v with %v", res.GetStatus(), res.GetDiagnostics())
			}
			mc := res.GetMonteCarlo()
			if mc.GetIterations() != 200 || len(mc.GetMetrics()) == 0 {
				t.Fatalf("monte_carlo not filled: %v", mc)
			}
			for key, d := range mc.GetMetrics() {
				if d.GetP10() > d.GetP90() || d.GetStddev() < 0 || d.GetP50() != d.GetP50() {
					t.Errorf("%s: implausible distribution %v", key, d)
				}
			}
			if got, want := len(res.GetSensitivity().GetVars()), 2*len(sc.sensitivity); got != want {
				t.Fatalf("sensitivity vars = %d, want %d", got, want)
			}
		})
	}
}

func TestScenariosOptimizeSmoke(t *testing.T) {
	for _, sc := range scenarios {
		t.Run(sc.name, func(t *testing.T) {
			plan := loadNamed(t, sc.name)
			plan.Phasing = &pb.Phasing{Mode: pb.PhasingMode_OPTIMIZE, Policy: sc.policy}
			plan.Optimization = &pb.Optimization{Objective: &pb.Objective{Type: pb.ObjectiveType_MIN_STRANDED_PLUS_LCOC}}
			plan.Run.Mode = pb.RunMode_RUN_OPTIMIZE
			res := Optimize(plan)
			requireClean(t, res)
			opt := res.GetOptimization()
			if opt.GetBestPlan() == nil || opt.GetEvaluations() == 0 || len(opt.GetFrontier()) == 0 {
				t.Fatalf("optimization not filled: evaluations %d, frontier %d", opt.GetEvaluations(), len(opt.GetFrontier()))
			}
			best := core.Analyze(opt.GetBestPlan())
			requireClean(t, best)
			if best.GetSummary().GetMwOnlineFinal() <= 0 {
				t.Fatal("winning plan brings no capacity online")
			}
		})
	}
}
