package risk

import (
	"bytes"
	"testing"

	"google.golang.org/protobuf/proto"

	"github.com/nchim/ai-compute-planning/engine/core"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

func TestValidate(t *testing.T) {
	dist := func(path string, typ pb.DistributionType, params ...float64) *pb.InputDistribution {
		return &pb.InputDistribution{InputPath: path, Type: typ, Params: params}
	}
	cases := []struct {
		name     string
		mutate   func(p *pb.SitePlan)
		code     string
		path     string
		hintHas  string
		noErrors bool
	}{
		{"valid", func(p *pb.SitePlan) {}, "", "", "", true},
		{"unknown path", func(p *pb.SitePlan) {
			p.Risk.Distributions[0] = dist("revenue.compute.gpu_price", pb.DistributionType_UNIFORM, 1, 2)
		}, codeUnknownInputPath, "risk.distributions[0].input_path", "gpu_hour_price", false},
		{"non-numeric path", func(p *pb.SitePlan) {
			p.Risk.Distributions[1] = dist("meta.site_name", pb.DistributionType_UNIFORM, 1, 2)
		}, codeUnknownInputPath, "risk.distributions[1].input_path", "", false},
		{"normal sd", func(p *pb.SitePlan) {
			p.Risk.Distributions[1] = dist("revenue.compute.utilization_pct", pb.DistributionType_NORMAL, 80, 0)
		}, codeOutOfRange, "risk.distributions[1].params", "", false},
		{"triangular order", func(p *pb.SitePlan) {
			p.Risk.Distributions[0] = dist("revenue.compute.gpu_hour_price", pb.DistributionType_TRIANGULAR, 3, 2, 1)
		}, codeOutOfRange, "risk.distributions[0].params", "", false},
		{"uniform arity", func(p *pb.SitePlan) {
			p.Risk.Distributions[2] = dist("costs.gpu.depreciation_years", pb.DistributionType_UNIFORM, 3)
		}, codeOutOfRange, "risk.distributions[2].params", "", false},
		{"unspecified type", func(p *pb.SitePlan) {
			p.Risk.Distributions[2].Type = pb.DistributionType_DIST_UNSPECIFIED
		}, codeOutOfRange, "risk.distributions[2].type", "", false},
		{"iterations", func(p *pb.SitePlan) { p.Run.MonteCarlo.Iterations = 0 }, codeOutOfRange, "run.monte_carlo.iterations", "", false},
		{"sensitivity path", func(p *pb.SitePlan) {
			p.Run.Sensitivity.InputPaths[2] = "power.sources[9].available_month"
		}, codeUnknownInputPath, "run.sensitivity.input_paths[2]", "sources", false},
		{"sensitivity delta", func(p *pb.SitePlan) { p.Run.Sensitivity.DeltaPct = -5 }, codeOutOfRange, "run.sensitivity.delta_pct", "", false},
		{"disabled runs are not validated", func(p *pb.SitePlan) {
			p.Run.MonteCarlo.Enabled, p.Run.Sensitivity.Enabled = false, false
			p.Risk.Distributions[0].InputPath = "nope"
			p.Run.Sensitivity.InputPaths[0] = "nope"
		}, "", "", "", true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			plan := riskFixture(t, 100)
			c.mutate(plan)
			ds := Validate(plan)
			if c.noErrors {
				if len(ds) != 0 {
					t.Fatalf("unexpected diagnostics: %v", ds)
				}
				return
			}
			d := findDiag(ds, c.code)
			requireComplete(t, d)
			if d.GetProtoPath() != c.path {
				t.Fatalf("proto_path %q, want %q", d.GetProtoPath(), c.path)
			}
			if c.hintHas != "" && !bytes.Contains([]byte(d.GetHint()), []byte(c.hintHas)) {
				t.Fatalf("hint %q does not mention %q", d.GetHint(), c.hintHas)
			}
		})
	}
}

func TestMonteCarloFixture(t *testing.T) {
	const iters = 300
	plan := riskFixture(t, iters)
	mc, ds := MonteCarlo(plan)
	if len(ds) != 0 {
		t.Fatalf("unexpected diagnostics: %v", ds)
	}
	if mc.GetIterations() != iters {
		t.Fatalf("iterations = %d, want %d", mc.GetIterations(), iters)
	}
	for _, key := range metricKeys {
		d, ok := mc.GetMetrics()[key]
		if !ok {
			t.Fatalf("metric %q missing", key)
		}
		var n int32
		for _, b := range d.GetHistogram() {
			n += b.GetCount()
		}
		if n != iters {
			t.Errorf("%s: histogram counts sum to %d, want %d", key, n, iters)
		}
	}
	for _, key := range []string{"lcoc_per_gpu_hour", "npv"} {
		d := mc.GetMetrics()[key]
		if !(d.GetP10() < d.GetP50() && d.GetP50() < d.GetP90()) {
			t.Errorf("%s: want P10 < P50 < P90, got %g %g %g", key, d.GetP10(), d.GetP50(), d.GetP90())
		}
		if d.GetStddev() <= 0 {
			t.Errorf("%s: stddev = %g", key, d.GetStddev())
		}
	}
}

func TestMonteCarloIsDeterministic(t *testing.T) {
	opts := proto.MarshalOptions{Deterministic: true}
	a, _ := MonteCarlo(riskFixture(t, 200))
	b, _ := MonteCarlo(riskFixture(t, 200))
	ab, err := opts.Marshal(a)
	if err != nil {
		t.Fatal(err)
	}
	bb, err := opts.Marshal(b)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(ab, bb) {
		t.Fatal("same seed produced different bytes")
	}
	other := riskFixture(t, 200)
	other.Run.MonteCarlo.Seed = 43
	c, _ := MonteCarlo(other)
	if proto.Equal(a, c) {
		t.Fatal("a different seed produced the same result")
	}
}

func TestMonteCarloDoesNotMutatePlan(t *testing.T) {
	plan := riskFixture(t, 50)
	before := proto.Clone(plan)
	MonteCarlo(plan)
	if !proto.Equal(before, plan) {
		t.Fatal("MonteCarlo mutated its input")
	}
}

// A price drawn ≤ 0 fails core validation: those draws are counted, reported, and excluded.
func TestMonteCarloCountsInvalidDraws(t *testing.T) {
	plan := riskFixture(t, 200)
	plan.Risk.Distributions = []*pb.InputDistribution{
		{InputPath: "revenue.compute.gpu_hour_price", Type: pb.DistributionType_UNIFORM, Params: []float64{-1, 1}},
	}
	mc, ds := MonteCarlo(plan)
	d := findDiag(ds, codeInvalidDraws)
	requireComplete(t, d)
	if d.GetSeverity() != pb.Severity_WARNING {
		t.Fatalf("severity %v, want WARNING", d.GetSeverity())
	}
	var n int32
	for _, b := range mc.GetMetrics()["npv"].GetHistogram() {
		n += b.GetCount()
	}
	if n == 0 || n == 200 || d.GetActual() != itoa(200-n) {
		t.Fatalf("valid=%d, invalid reported as %q", n, d.GetActual())
	}
}

func TestMonteCarloAllInvalid(t *testing.T) {
	plan := riskFixture(t, 20)
	plan.Risk.Distributions = []*pb.InputDistribution{
		{InputPath: "revenue.compute.gpu_hour_price", Type: pb.DistributionType_UNIFORM, Params: []float64{-2, -1}},
	}
	mc, ds := MonteCarlo(plan)
	if findDiag(ds, codeInvalidDraws) == nil || len(mc.GetMetrics()) != 0 {
		t.Fatalf("all-invalid run: diags %v, metrics %v", ds, mc.GetMetrics())
	}
}

func TestSensitivityFixture(t *testing.T) {
	plan := riskFixture(t, 10)
	s, ds := Sensitivity(plan, core.Analyze(plan).GetSummary())
	if len(ds) != 0 {
		t.Fatalf("unexpected diagnostics: %v", ds)
	}
	vars := s.GetVars()
	if len(vars) != len(plan.GetRun().GetSensitivity().GetInputPaths()) {
		t.Fatalf("%d vars, want %d", len(vars), len(plan.GetRun().GetSensitivity().GetInputPaths()))
	}
	base := vars[0].GetBaseOutput()
	for i, v := range vars {
		if v.GetTargetMetric() != targetMetric || v.GetBaseOutput() != base {
			t.Errorf("var %d: target %q base %g", i, v.GetTargetMetric(), v.GetBaseOutput())
		}
		if i > 0 && swing(vars[i-1]) < swing(v) {
			t.Errorf("vars not ordered by |high−low|: %v before %v", vars[i-1], v)
		}
	}
	// LCOC is a cost metric: utilization (denominator) and GPU unit cost (numerator) dominate, while
	// gpu_hour_price only reaches LCOC through the EGR-linked management fee and lands last.
	top := map[string]bool{vars[0].GetInputPath(): true, vars[1].GetInputPath(): true}
	if !top["costs.gpu.unit_cost"] || !top["revenue.compute.utilization_pct"] {
		t.Errorf("tornado top-2 = %v, want unit_cost and utilization", top)
	}
	if last := vars[len(vars)-1].GetInputPath(); last != "revenue.compute.gpu_hour_price" {
		t.Errorf("tornado last = %s, want gpu_hour_price", last)
	}
	// Utilization moves LCOC monotonically: more hours delivered → lower cost per hour.
	for _, v := range vars {
		if v.GetInputPath() == "revenue.compute.utilization_pct" && !(v.GetLowOutput() > base && base > v.GetHighOutput()) {
			t.Errorf("utilization: low %g base %g high %g", v.GetLowOutput(), base, v.GetHighOutput())
		}
	}
}

func TestSensitivitySkipsInvalidVar(t *testing.T) {
	plan := riskFixture(t, 10)
	plan.Run.Sensitivity.DeltaPct = 100 // −100% drives price to 0, which core rejects
	plan.Run.Sensitivity.InputPaths = []string{"revenue.compute.gpu_hour_price", "costs.gpu.unit_cost"}
	s, ds := Sensitivity(plan, core.Analyze(plan).GetSummary())
	d := findDiag(ds, codeSensitivityInvalid)
	requireComplete(t, d)
	if d.GetProtoPath() != "run.sensitivity.input_paths[0]" {
		t.Fatalf("proto_path = %q", d.GetProtoPath())
	}
	if len(s.GetVars()) != 1 || s.GetVars()[0].GetInputPath() != "costs.gpu.unit_cost" {
		t.Fatalf("vars = %v", s.GetVars())
	}
}

func BenchmarkMonteCarlo1k(b *testing.B) {
	plan := riskFixture(b, 1000)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, ds := MonteCarlo(plan); len(ds) != 0 {
			b.Fatalf("diagnostics: %v", ds)
		}
	}
}
