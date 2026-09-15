// Package bridge is the bytes-in/bytes-out seam between the JS host and the engine. It is a plain Go
// package (no syscall/js) so its contract — decode failures, unknown ops and panics all come back as a
// Result with a diagnostic, never as an error or a crash — is tested natively under -race.
package bridge

import (
	"fmt"

	"google.golang.org/protobuf/proto"

	"github.com/nchim/ai-compute-planning/engine/core"
	"github.com/nchim/ai-compute-planning/engine/optimize"
	"github.com/nchim/ai-compute-planning/engine/pb"
)

// Op names accepted by Call; they are also the method names on globalThis.capplanner.
const (
	OpAnalyze  = "analyze"
	OpOptimize = "optimize"
)

// Model is a pure SitePlan → Result function (core.Analyze, optimize.Optimize).
type Model func(*pb.SitePlan) *pb.Result

// Bridge dispatches ops to injectable models. Tests substitute failing models to exercise recovery.
type Bridge struct {
	Analyze  Model
	Optimize Model
}

// Default wires the production models.
func Default() Bridge {
	return Bridge{Analyze: core.Analyze, Optimize: optimize.Optimize}
}

// Call decodes in as a SitePlan, runs op and returns the encoded Result. It never panics: every
// failure is a Result{INVALID_INPUT} carrying one ERROR diagnostic.
func (b Bridge) Call(op string, in []byte) (out []byte) {
	defer func() {
		if r := recover(); r != nil {
			out = Encode(Failure("INTERNAL_ERROR",
				"the engine panicked while handling "+op,
				fmt.Sprint(r),
				"This is an engine bug, not a plan error: report it with the SitePlan that triggered it."))
		}
	}()

	model, ok := b.model(op)
	if !ok {
		return Encode(Failure("UNKNOWN_OP", "unknown engine operation", op,
			"Use one of: "+OpAnalyze+", "+OpOptimize+"."))
	}
	var plan pb.SitePlan
	if err := proto.Unmarshal(in, &plan); err != nil {
		return Encode(Failure("MALFORMED_INPUT", "input is not a binary-encoded SitePlan", err.Error(),
			"Encode the SitePlan with the capplanner.v1 schema (toBinary) before calling the engine."))
	}
	res := model(&plan)
	if res == nil {
		panic(op + " returned a nil Result")
	}
	return Encode(res)
}

func (b Bridge) model(op string) (Model, bool) {
	switch op {
	case OpAnalyze:
		return b.Analyze, b.Analyze != nil
	case OpOptimize:
		return b.Optimize, b.Optimize != nil
	}
	return nil, false
}

// Failure builds the single-diagnostic INVALID_INPUT Result used for every bridge-level error.
func Failure(code, message, actual, hint string) *pb.Result {
	return &pb.Result{
		Status: pb.Status_INVALID_INPUT,
		Diagnostics: []*pb.Diagnostic{{
			Severity: pb.Severity_ERROR,
			Code:     code,
			Message:  message,
			Actual:   actual,
			Hint:     hint,
		}},
	}
}

// Encode marshals a Result. Marshalling a generated message only fails on invalid UTF-8 or
// oversized payloads; that is a model bug, so it is reported as an INTERNAL_ERROR Result (which,
// being all-ASCII, always marshals).
func Encode(res *pb.Result) []byte {
	out, err := proto.Marshal(res)
	if err != nil {
		return Encode(Failure("INTERNAL_ERROR", "the engine produced a Result that cannot be encoded",
			err.Error(), "This is an engine bug: report it with the SitePlan that triggered it."))
	}
	return out
}
