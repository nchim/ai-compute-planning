// Package engine is the public entry point of the analytical engine. It composes the pure core with
// the risk layer (Monte Carlo, sensitivity); the optimizer joins here when it lands.
package engine

import (
	"github.com/nchim/ai-compute-planning/engine/core"
	"github.com/nchim/ai-compute-planning/engine/optimize"
	"github.com/nchim/ai-compute-planning/engine/pb"
	"github.com/nchim/ai-compute-planning/engine/risk"
)

// Analyze evaluates a SitePlan: the core first, then — on a valid plan — Monte Carlo and sensitivity
// as enabled in run. Risk validation errors follow the core's contract: the Result is INVALID_INPUT
// with diagnostics only. Risk warnings downgrade an OK status to OK_WITH_WARNINGS.
func Analyze(plan *pb.SitePlan) *pb.Result {
	res := core.Analyze(plan)
	if res.GetStatus() == pb.Status_INVALID_INPUT {
		return res
	}
	rd := risk.Validate(plan)
	if hasErrors(rd) {
		return &pb.Result{Status: pb.Status_INVALID_INPUT, Diagnostics: append(res.GetDiagnostics(), rd...)}
	}
	if plan.GetRun().GetMonteCarlo().GetEnabled() {
		var ds []*pb.Diagnostic
		res.MonteCarlo, ds = risk.MonteCarlo(plan)
		rd = append(rd, ds...)
	}
	if plan.GetRun().GetSensitivity().GetEnabled() {
		var ds []*pb.Diagnostic
		res.Sensitivity, ds = risk.Sensitivity(plan, res.GetSummary())
		rd = append(rd, ds...)
	}
	res.Diagnostics = append(res.Diagnostics, rd...)
	if res.Status == pb.Status_OK && hasWarnings(rd) {
		res.Status = pb.Status_OK_WITH_WARNINGS
	}
	return res
}

func hasErrors(ds []*pb.Diagnostic) bool { return has(ds, pb.Severity_ERROR) }

func hasWarnings(ds []*pb.Diagnostic) bool { return has(ds, pb.Severity_WARNING) }

func has(ds []*pb.Diagnostic, sev pb.Severity) bool {
	for _, d := range ds {
		if d.GetSeverity() == sev {
			return true
		}
	}
	return false
}

// Optimize designs the phasing of a plan in phasing.mode=OPTIMIZE (see engine/optimize).
func Optimize(plan *pb.SitePlan) *pb.Result {
	return optimize.Optimize(plan)
}
