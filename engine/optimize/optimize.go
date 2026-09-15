// Package optimize searches phasing plans against a demand ramp (see docs/engine-design.md).
package optimize

import "github.com/nchim/ai-compute-planning/engine/pb"

// Optimize returns the best feasible phasing for plan.
//
// STUB: the staged search lands in WS4. Until then every call is INVALID_INPUT with a visible
// NOT_IMPLEMENTED diagnostic so no caller can mistake the placeholder for an optimizer.
func Optimize(plan *pb.SitePlan) *pb.Result {
	return &pb.Result{
		Status: pb.Status_INVALID_INPUT,
		Diagnostics: []*pb.Diagnostic{{
			Severity: pb.Severity_INFO,
			Code:     "NOT_IMPLEMENTED",
			Message:  "optimize.Optimize is a placeholder; the optimizer is not implemented yet (WS4).",
			Hint:     "Do not interpret any number in this Result.",
		}},
	}
}
