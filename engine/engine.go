// Package engine is the public entry point of the analytical engine. It composes the pure core with
// the risk (Monte Carlo, sensitivity) and optimizer layers as they land; today it is the core alone.
package engine

import (
	"github.com/nchim/ai-compute-planning/engine/core"
	"github.com/nchim/ai-compute-planning/engine/optimize"
	"github.com/nchim/ai-compute-planning/engine/pb"
)

// Analyze evaluates a SitePlan. STUB: Monte Carlo and sensitivity (run.monte_carlo, run.sensitivity)
// are composed here by WS3; until then the corresponding Result fields stay empty.
func Analyze(plan *pb.SitePlan) *pb.Result {
	return core.Analyze(plan)
}

// Optimize designs the phasing of a plan in phasing.mode=OPTIMIZE (see engine/optimize).
func Optimize(plan *pb.SitePlan) *pb.Result {
	return optimize.Optimize(plan)
}
