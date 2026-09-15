// Package risk layers Monte Carlo and one-at-a-time sensitivity over the pure core: it draws input
// values from the plan's declared distributions (or ±delta steps), writes them into a cloned SitePlan
// by dotted input_path, and summarizes the resulting core.Analyze metrics. It is as pure and
// deterministic as the core: all randomness comes from run.monte_carlo.seed and there are no
// goroutines. Model errors are diagnostics in the Result, never Go errors.
package risk

import (
	"fmt"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

// Diagnostic codes. Stable: the agent and the harness match on them.
const (
	codeUnknownInputPath   = "UNKNOWN_INPUT_PATH"
	codeOutOfRange         = "OUT_OF_RANGE"
	codeInvalidDraws       = "MC_INVALID_DRAWS"
	codeNoDistributions    = "MC_NO_DISTRIBUTIONS"
	codeSensitivityInvalid = "SENSITIVITY_INVALID_DRAW"
)

// diags collects diagnostics in emission order.
type diags []*pb.Diagnostic

func (d *diags) add(sev pb.Severity, code, path, msg, expected, actual, hint string) {
	*d = append(*d, &pb.Diagnostic{
		Severity: sev, Code: code, Message: msg, ProtoPath: path,
		Expected: expected, Actual: actual, Hint: hint,
	})
}

func (d *diags) errorf(code, path, expected, actual, hint, format string, args ...any) {
	d.add(pb.Severity_ERROR, code, path, fmt.Sprintf(format, args...), expected, actual, hint)
}

func (d *diags) warnf(code, path, expected, actual, hint, format string, args ...any) {
	d.add(pb.Severity_WARNING, code, path, fmt.Sprintf(format, args...), expected, actual, hint)
}

func itoa(n int32) string { return fmt.Sprintf("%d", n) }
