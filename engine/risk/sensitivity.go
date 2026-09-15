package risk

import (
	"fmt"
	"math"
	"sort"

	"github.com/nchim/ai-compute-planning/engine/core"
	"github.com/nchim/ai-compute-planning/engine/pb"
)

// targetMetrics are the tornado targets, in output order: LCOC (the cost view) and NPV (the value
// view, where revenue levers such as gpu_hour_price show up).
var targetMetrics = []string{"lcoc_per_gpu_hour", "npv"}

const defaultDeltaPct = 10.0

// Sensitivity runs each run.sensitivity.input_paths entry at base×(1∓delta_pct/100), one at a time,
// and reports one SensitivityVar per (input_path, target metric): all LCOC vars ordered by |high−low|
// descending, then all NPV vars likewise. base is the unperturbed core result. A variable whose
// perturbed plan cannot be built or fails validation is skipped for every target with one
// SENSITIVITY_INVALID_DRAW warning. The plan must have passed Validate and is never mutated.
func Sensitivity(plan *pb.SitePlan, base *pb.SummaryMetrics) (*pb.SensitivityResult, []*pb.Diagnostic) {
	var d diags
	opts := plan.GetRun().GetSensitivity()
	delta := opts.GetDeltaPct()
	if delta == 0 {
		delta = defaultDeltaPct
	}
	byTarget := make(map[string][]*pb.SensitivityVar, len(targetMetrics))
	for i, path := range opts.GetInputPaths() {
		v, err := GetNumeric(plan, path)
		lows, errLow := perturbed(plan, path, v*(1-delta/100))
		highs, errHigh := perturbed(plan, path, v*(1+delta/100))
		if err := firstErr(err, errLow, errHigh); err != nil {
			d.warnf(codeSensitivityInvalid, fmt.Sprintf("run.sensitivity.input_paths[%d]", i),
				fmt.Sprintf("%s ± %g%% inside the valid domain", path, delta), fmt.Sprintf("%g → [%g, %g]: %v", v, v*(1-delta/100), v*(1+delta/100), err),
				"lower run.sensitivity.delta_pct or move the base value away from its bound",
				"sensitivity on %s skipped: %v", path, err)
			continue
		}
		for _, target := range targetMetrics {
			byTarget[target] = append(byTarget[target], &pb.SensitivityVar{
				InputPath: path, TargetMetric: target, LowOutput: lows[target], HighOutput: highs[target],
				BaseOutput: metricValue(base, target),
			})
		}
	}
	var vars []*pb.SensitivityVar
	for _, target := range targetMetrics {
		set := byTarget[target]
		sort.SliceStable(set, func(a, b int) bool { return swing(set[a]) > swing(set[b]) })
		vars = append(vars, set...)
	}
	return &pb.SensitivityResult{Vars: vars}, d
}

// perturbed analyzes a clone with path set to v and returns every target metric; the error says why
// the perturbed plan could not be evaluated (override failure or core rejection).
func perturbed(plan *pb.SitePlan, path string, v float64) (map[string]float64, error) {
	trial := clone(plan)
	if err := SetNumeric(trial, path, v); err != nil {
		return nil, fmt.Errorf("override: %w", err)
	}
	res := core.Analyze(trial)
	if res.GetStatus() == pb.Status_INVALID_INPUT {
		return nil, fmt.Errorf("a ±step leaves the core's valid input domain (%s)", res.GetDiagnostics()[0].GetCode())
	}
	out := make(map[string]float64, len(targetMetrics))
	for _, target := range targetMetrics {
		out[target] = metricValue(res.GetSummary(), target)
	}
	return out, nil
}

func firstErr(errs ...error) error {
	for _, err := range errs {
		if err != nil {
			return err
		}
	}
	return nil
}

func swing(v *pb.SensitivityVar) float64 { return math.Abs(v.GetHighOutput() - v.GetLowOutput()) }
