package engine

import (
	"bytes"
	"os"
	"testing"

	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"

	"github.com/nchim/ai-compute-planning/engine/core"
	"github.com/nchim/ai-compute-planning/engine/pb"
)

func loadFixture(t testing.TB) *pb.SitePlan {
	t.Helper()
	raw, err := os.ReadFile("../fixtures/abilene-1.json")
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var plan pb.SitePlan
	if err := protojson.Unmarshal(raw, &plan); err != nil {
		t.Fatalf("parse fixture: %v", err)
	}
	return &plan
}

func withRisk(t testing.TB) *pb.SitePlan {
	plan := loadFixture(t)
	plan.Risk = &pb.RiskParams{Distributions: []*pb.InputDistribution{
		{InputPath: "revenue.compute.gpu_hour_price", Type: pb.DistributionType_TRIANGULAR, Params: []float64{1.5, 2.25, 3.0}},
		{InputPath: "revenue.compute.utilization_pct", Type: pb.DistributionType_NORMAL, Params: []float64{80, 8}},
	}}
	plan.Run.MonteCarlo = &pb.MonteCarloOptions{Enabled: true, Iterations: 100, Seed: 42}
	plan.Run.Sensitivity = &pb.SensitivityOptions{Enabled: true, InputPaths: []string{"revenue.compute.gpu_hour_price", "costs.gpu.unit_cost"}}
	return plan
}

func TestAnalyzeRiskDisabledIsCore(t *testing.T) {
	plan := loadFixture(t)
	got, want := Analyze(plan), core.Analyze(plan)
	if !proto.Equal(got, want) {
		t.Fatal("with risk disabled, Analyze must equal core.Analyze")
	}
	if got.GetMonteCarlo() != nil || got.GetSensitivity() != nil {
		t.Fatal("risk fields must stay empty when disabled")
	}
}

func TestAnalyzeComposesRisk(t *testing.T) {
	res := Analyze(withRisk(t))
	if res.GetStatus() != pb.Status_OK {
		t.Fatalf("status %v, diags %v", res.GetStatus(), res.GetDiagnostics())
	}
	if res.GetMonteCarlo().GetIterations() != 100 || len(res.GetMonteCarlo().GetMetrics()) == 0 {
		t.Fatalf("monte_carlo not filled: %v", res.GetMonteCarlo())
	}
	if len(res.GetSensitivity().GetVars()) != 4 { // 2 paths × {lcoc, npv}
		t.Fatalf("sensitivity not filled: %v", res.GetSensitivity())
	}
	if res.GetSummary() == nil || !res.GetConservation().GetAllPassed() {
		t.Fatal("core outputs must be preserved")
	}
}

func TestAnalyzeIsDeterministic(t *testing.T) {
	opts := proto.MarshalOptions{Deterministic: true}
	a, err := opts.Marshal(Analyze(withRisk(t)))
	if err != nil {
		t.Fatal(err)
	}
	b, err := opts.Marshal(Analyze(withRisk(t)))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(a, b) {
		t.Fatal("same plan+seed produced different bytes")
	}
}

func TestAnalyzeRiskErrorsAreInvalidInput(t *testing.T) {
	plan := withRisk(t)
	plan.Risk.Distributions[0].InputPath = "revenue.compute.price"
	res := Analyze(plan)
	if res.GetStatus() != pb.Status_INVALID_INPUT || res.GetSummary() != nil || res.GetMonteCarlo() != nil {
		t.Fatalf("status %v, summary %v", res.GetStatus(), res.GetSummary())
	}
	if d := res.GetDiagnostics(); len(d) == 0 || d[len(d)-1].GetCode() != "UNKNOWN_INPUT_PATH" {
		t.Fatalf("diagnostics: %v", d)
	}
}

func TestAnalyzeCoreErrorsShortCircuitRisk(t *testing.T) {
	plan := withRisk(t)
	plan.Compute.Pue = 0.5
	res := Analyze(plan)
	if res.GetStatus() != pb.Status_INVALID_INPUT || res.GetMonteCarlo() != nil {
		t.Fatalf("status %v, mc %v", res.GetStatus(), res.GetMonteCarlo())
	}
}

func TestAnalyzeRiskWarningsDowngradeStatus(t *testing.T) {
	plan := withRisk(t)
	plan.Risk.Distributions = []*pb.InputDistribution{
		{InputPath: "revenue.compute.gpu_hour_price", Type: pb.DistributionType_UNIFORM, Params: []float64{-1, 1}},
	}
	res := Analyze(plan)
	if res.GetStatus() != pb.Status_OK_WITH_WARNINGS {
		t.Fatalf("status %v, diags %v", res.GetStatus(), res.GetDiagnostics())
	}
}
