package risk

import (
	"os"
	"testing"

	"google.golang.org/protobuf/encoding/protojson"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

const fixturePath = "../../fixtures/abilene-1.json"

// loadFixture returns a fresh copy of the reference plan; tests mutate it freely.
func loadFixture(t testing.TB) *pb.SitePlan {
	t.Helper()
	raw, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var plan pb.SitePlan
	if err := protojson.Unmarshal(raw, &plan); err != nil {
		t.Fatalf("parse fixture: %v", err)
	}
	return &plan
}

// t4Distributions are the acceptance-session T4 levers: price (triangular), utilization (normal),
// depreciation years (uniform 3–7, rounded).
func t4Distributions() []*pb.InputDistribution {
	return []*pb.InputDistribution{
		{InputPath: "revenue.compute.gpu_hour_price", Type: pb.DistributionType_TRIANGULAR, Params: []float64{1.5, 2.25, 3.0}},
		{InputPath: "revenue.compute.utilization_pct", Type: pb.DistributionType_NORMAL, Params: []float64{80, 8}},
		{InputPath: "costs.gpu.depreciation_years", Type: pb.DistributionType_UNIFORM, Params: []float64{3, 7}},
	}
}

// riskFixture is the fixture with T4 distributions and both risk runs enabled.
func riskFixture(t testing.TB, iterations int32) *pb.SitePlan {
	t.Helper()
	plan := loadFixture(t)
	plan.Risk = &pb.RiskParams{Distributions: t4Distributions()}
	plan.Run.MonteCarlo = &pb.MonteCarloOptions{Enabled: true, Iterations: iterations, Seed: 42}
	plan.Run.Sensitivity = &pb.SensitivityOptions{Enabled: true, InputPaths: []string{
		"revenue.compute.gpu_hour_price", "revenue.compute.utilization_pct",
		"power.interconnection.grid_energize_month", "costs.gpu.depreciation_years", "costs.gpu.unit_cost",
	}}
	return plan
}

func findDiag(ds []*pb.Diagnostic, code string) *pb.Diagnostic {
	for _, d := range ds {
		if d.GetCode() == code {
			return d
		}
	}
	return nil
}

// requireComplete asserts the verbose-diagnostic rule: every diagnostic names where to fix.
func requireComplete(t *testing.T, d *pb.Diagnostic) {
	t.Helper()
	if d == nil {
		t.Fatal("diagnostic missing")
	}
	if d.GetCode() == "" || d.GetMessage() == "" || d.GetProtoPath() == "" || d.GetExpected() == "" || d.GetActual() == "" || d.GetHint() == "" {
		t.Errorf("incomplete diagnostic: %v", d)
	}
}
