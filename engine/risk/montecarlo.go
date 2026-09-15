package risk

import (
	"math/rand/v2"

	"github.com/nchim/ai-compute-planning/engine/core"
	"github.com/nchim/ai-compute-planning/engine/pb"
)

// metricKeys are the SummaryMetrics collected per iteration, in output order.
var metricKeys = []string{
	"lcoc_per_gpu_hour", "npv", "unlevered_irr_pct", "total_capex", "demand_capture_pct", "yield_on_cost_pct",
}

func metricValue(s *pb.SummaryMetrics, key string) float64 {
	switch key {
	case "lcoc_per_gpu_hour":
		return s.GetLcocPerGpuHour()
	case "npv":
		return s.GetNpv()
	case "unlevered_irr_pct":
		return s.GetUnleveredIrrPct()
	case "total_capex":
		return s.GetTotalCapex()
	case "demand_capture_pct":
		return s.GetDemandCapturePct()
	case "yield_on_cost_pct":
		return s.GetYieldOnCostPct()
	}
	panic("risk: unknown metric key " + key) // programming error: metricKeys and metricValue disagree
}

// draw is one distribution bound to its resolved sampler.
type draw struct {
	path    string
	sampler sampler
}

// MonteCarlo runs run.monte_carlo.iterations draws of the plan's distributions through core.Analyze
// and summarizes the collected metrics. The plan must have passed Validate; the plan itself is never
// mutated. Iterations the core rejects (INVALID_INPUT) are excluded from the statistics and reported
// once as MC_INVALID_DRAWS; if every iteration is rejected, metrics is empty.
func MonteCarlo(plan *pb.SitePlan) (*pb.MonteCarloResult, []*pb.Diagnostic) {
	var d diags
	opts := plan.GetRun().GetMonteCarlo()
	draws := make([]draw, 0, len(plan.GetRisk().GetDistributions()))
	for _, dist := range plan.GetRisk().GetDistributions() {
		s, _ := newSampler(dist) // Validate has already rejected bad params
		draws = append(draws, draw{dist.GetInputPath(), s})
	}
	rng := newRNG(opts.GetSeed())
	samples := make(map[string][]float64, len(metricKeys))
	var invalid int32
	var overrideErr error // first override failure; Validate makes this unreachable, so it is an internal inconsistency
	for i := int32(0); i < opts.GetIterations(); i++ {
		trial, err := drawPlan(plan, draws, rng)
		if err != nil {
			invalid++
			if overrideErr == nil {
				overrideErr = err
			}
			continue
		}
		res := core.Analyze(trial)
		if res.GetStatus() == pb.Status_INVALID_INPUT {
			invalid++
			continue
		}
		for _, key := range metricKeys {
			samples[key] = append(samples[key], metricValue(res.GetSummary(), key))
		}
	}
	if invalid > 0 {
		actual := itoa(invalid)
		if overrideErr != nil {
			actual += "; override failed: " + overrideErr.Error()
		}
		d.warnf(codeInvalidDraws, "risk.distributions", "every draw within the core's valid domain", actual,
			"tighten the distributions (e.g. a positive lower bound on prices) so draws stay valid",
			"%d of %d Monte Carlo iterations were rejected and excluded from the statistics", invalid, opts.GetIterations())
	}
	out := &pb.MonteCarloResult{Iterations: opts.GetIterations(), Metrics: map[string]*pb.Distribution{}}
	for _, key := range metricKeys {
		if xs := samples[key]; len(xs) > 0 {
			out.Metrics[key] = summarize(xs)
		}
	}
	return out, d
}

// drawPlan clones plan and writes one fresh sample of every distribution into it. An override
// failure is returned rather than dropped: Validate makes it unreachable, so it would mean an
// internal inconsistency that must surface as a diagnostic.
func drawPlan(plan *pb.SitePlan, draws []draw, rng *rand.Rand) (*pb.SitePlan, error) {
	trial := clone(plan)
	for _, dr := range draws {
		if err := SetNumeric(trial, dr.path, clampToDomain(dr.path, dr.sampler.draw(rng))); err != nil {
			return nil, err
		}
	}
	return trial, nil
}
