package risk

import (
	"fmt"
	"math"
	"sort"

	"github.com/nchim/ai-compute-planning/engine/core"
	"github.com/nchim/ai-compute-planning/engine/pb"
)

const (
	targetMetric    = "lcoc_per_gpu_hour"
	defaultDeltaPct = 10.0
)

// Sensitivity runs each run.sensitivity.input_paths entry at base×(1∓delta_pct/100), one at a time,
// and reports the LCOC at each end ordered by |high−low| descending (the tornado). base is the
// unperturbed core result. A variable whose perturbed plan fails validation is skipped with a
// SENSITIVITY_INVALID_DRAW warning. The plan must have passed Validate and is never mutated.
func Sensitivity(plan *pb.SitePlan, base *pb.SummaryMetrics) (*pb.SensitivityResult, []*pb.Diagnostic) {
	var d diags
	opts := plan.GetRun().GetSensitivity()
	delta := opts.GetDeltaPct()
	if delta == 0 {
		delta = defaultDeltaPct
	}
	baseOut := metricValue(base, targetMetric)
	var vars []*pb.SensitivityVar
	for i, path := range opts.GetInputPaths() {
		v, _ := GetNumeric(plan, path) // Validate has already resolved every path
		low, lowOK := perturbed(plan, path, v*(1-delta/100))
		high, highOK := perturbed(plan, path, v*(1+delta/100))
		if !lowOK || !highOK {
			d.warnf(codeSensitivityInvalid, fmt.Sprintf("run.sensitivity.input_paths[%d]", i),
				fmt.Sprintf("%s ± %g%% inside the valid domain", path, delta), fmt.Sprintf("%g → [%g, %g]", v, v*(1-delta/100), v*(1+delta/100)),
				"lower run.sensitivity.delta_pct or move the base value away from its bound",
				"sensitivity on %s skipped: a ±%g%% step leaves the core's valid input domain", path, delta)
			continue
		}
		vars = append(vars, &pb.SensitivityVar{
			InputPath: path, TargetMetric: targetMetric, LowOutput: low, HighOutput: high, BaseOutput: baseOut,
		})
	}
	sort.SliceStable(vars, func(a, b int) bool { return swing(vars[a]) > swing(vars[b]) })
	return &pb.SensitivityResult{Vars: vars}, d
}

// perturbed analyzes a clone with path set to v and returns the target metric; ok is false when
// the core rejects the perturbed plan.
func perturbed(plan *pb.SitePlan, path string, v float64) (float64, bool) {
	trial := clone(plan)
	_ = SetNumeric(trial, path, v)
	res := core.Analyze(trial)
	if res.GetStatus() == pb.Status_INVALID_INPUT {
		return 0, false
	}
	return metricValue(res.GetSummary(), targetMetric), true
}

func swing(v *pb.SensitivityVar) float64 { return math.Abs(v.GetHighOutput() - v.GetLowOutput()) }
