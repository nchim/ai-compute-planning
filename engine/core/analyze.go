// Package core is the pure analytical model: Analyze is a deterministic function of its input
// SitePlan with no I/O, no globals and no goroutines (see docs/engine-design.md).
package core

import "github.com/nchim/ai-compute-planning/engine/pb"

// Analyze evaluates a SitePlan and returns a Result. Model errors are diagnostics in the Result, never
// Go errors, so the agent can always read the correction channel.
//
// STUB: the pipeline (validate → sizing → schedule → capex → opex → revenue → cashflow → metrics →
// conserve → render) lands in WS2. Until then every call is INVALID_INPUT with a visible
// NOT_IMPLEMENTED diagnostic so no caller can mistake the placeholder for a model.
func Analyze(plan *pb.SitePlan) *pb.Result {
	return &pb.Result{
		Status: pb.Status_INVALID_INPUT,
		Diagnostics: []*pb.Diagnostic{{
			Severity: pb.Severity_INFO,
			Code:     "NOT_IMPLEMENTED",
			Message:  "core.Analyze is a placeholder; the analytical pipeline is not implemented yet (WS2).",
			Hint:     "Do not interpret any number in this Result.",
		}},
	}
}
