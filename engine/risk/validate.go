package risk

import (
	"errors"
	"fmt"
	"strings"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

// Validate checks every enabled risk run before a single draw is made: each distribution's path
// and parameters, the iteration count, and each sensitivity path. Disabled runs are not checked.
// Any ERROR here makes the whole Result INVALID_INPUT, as in the core.
func Validate(plan *pb.SitePlan) []*pb.Diagnostic {
	var d diags
	if mc := plan.GetRun().GetMonteCarlo(); mc.GetEnabled() {
		if mc.GetIterations() <= 0 {
			d.errorf(codeOutOfRange, "run.monte_carlo.iterations", "> 0", itoa(mc.GetIterations()),
				"set run.monte_carlo.iterations to e.g. 1000", "Monte Carlo needs a positive iteration count")
		}
		for i, dist := range plan.GetRisk().GetDistributions() {
			validateDistribution(plan, dist, fmt.Sprintf("risk.distributions[%d]", i), &d)
		}
		if len(plan.GetRisk().GetDistributions()) == 0 {
			d.warnf(codeNoDistributions, "risk.distributions", "≥ 1 InputDistribution", "none",
				"declare distributions on the uncertain inputs (e.g. revenue.compute.gpu_hour_price)",
				"Monte Carlo is enabled but no input distributions are declared; every iteration repeats the base case")
		}
	}
	if s := plan.GetRun().GetSensitivity(); s.GetEnabled() {
		if s.GetDeltaPct() < 0 {
			d.errorf(codeOutOfRange, "run.sensitivity.delta_pct", "≥ 0 (0 means the default 10%)", fmt.Sprintf("%g", s.GetDeltaPct()),
				"set run.sensitivity.delta_pct to a positive percentage", "sensitivity delta must not be negative")
		}
		for i, path := range s.GetInputPaths() {
			validatePath(plan, path, fmt.Sprintf("run.sensitivity.input_paths[%d]", i), &d)
		}
	}
	return d
}

func validateDistribution(plan *pb.SitePlan, dist *pb.InputDistribution, protoPath string, d *diags) {
	validatePath(plan, dist.GetInputPath(), protoPath+".input_path", d)
	if _, err := newSampler(dist); err != nil {
		field, actual := ".params", fmt.Sprintf("%v", dist.GetParams())
		if dist.GetType() == pb.DistributionType_DIST_UNSPECIFIED {
			field, actual = ".type", dist.GetType().String()
		}
		d.errorf(codeOutOfRange, protoPath+field, "NORMAL[mean, sd>0] | TRIANGULAR[min ≤ mode ≤ max] | UNIFORM[min < max]", actual,
			"fix the distribution parameters for "+dist.GetInputPath(), "%s: %v", dist.GetInputPath(), err)
	}
}

func validatePath(plan *pb.SitePlan, path, protoPath string, d *diags) {
	_, err := GetNumeric(plan, path)
	var pe *PathError
	if errors.As(err, &pe) {
		d.errorf(codeUnknownInputPath, protoPath, "a dotted path to a numeric SitePlan field", path,
			"known fields at that level: "+strings.Join(pe.Known, ", "), "%v", err)
	}
}
