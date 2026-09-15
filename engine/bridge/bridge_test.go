package bridge

import (
	"os"
	"strings"
	"testing"

	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

func decodeResult(t *testing.T, out []byte) *pb.Result {
	t.Helper()
	var res pb.Result
	if err := proto.Unmarshal(out, &res); err != nil {
		t.Fatalf("bridge returned bytes that are not a Result: %v", err)
	}
	return &res
}

func fixtureBytes(t *testing.T) []byte {
	t.Helper()
	raw, err := os.ReadFile("../../fixtures/abilene-1.json")
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var plan pb.SitePlan
	if err := protojson.Unmarshal(raw, &plan); err != nil {
		t.Fatalf("fixture is not a SitePlan: %v", err)
	}
	wire, err := proto.Marshal(&plan)
	if err != nil {
		t.Fatalf("marshal fixture: %v", err)
	}
	return wire
}

func okResult(*pb.SitePlan) *pb.Result { return &pb.Result{Status: pb.Status_OK} }

func TestCallRoutesOps(t *testing.T) {
	var gotAnalyze, gotOptimize string
	b := Bridge{
		Analyze: func(p *pb.SitePlan) *pb.Result {
			gotAnalyze = p.GetMeta().GetPlanId()
			return okResult(p)
		},
		Optimize: func(p *pb.SitePlan) *pb.Result {
			gotOptimize = p.GetMeta().GetPlanId()
			return &pb.Result{Status: pb.Status_OK_WITH_WARNINGS}
		},
	}
	in := fixtureBytes(t)

	if res := decodeResult(t, b.Call("analyze", in)); res.Status != pb.Status_OK || gotAnalyze != "abilene-1" {
		t.Fatalf("analyze: status=%v plan=%q", res.Status, gotAnalyze)
	}
	if res := decodeResult(t, b.Call("optimize", in)); res.Status != pb.Status_OK_WITH_WARNINGS || gotOptimize != "abilene-1" {
		t.Fatalf("optimize: status=%v plan=%q", res.Status, gotOptimize)
	}
}

func TestCallFailures(t *testing.T) {
	b := Bridge{
		Analyze:  func(*pb.SitePlan) *pb.Result { panic("boom") },
		Optimize: okResult,
	}
	tests := []struct {
		name, op   string
		in         []byte
		wantCode   string
		wantActual string // substring
	}{
		{"malformed input", "optimize", []byte{0xff, 0xff, 0xff}, "MALFORMED_INPUT", "proto"},
		{"unknown op", "explode", fixtureBytes(t), "UNKNOWN_OP", "explode"},
		{"panic recovered", "analyze", fixtureBytes(t), "INTERNAL_ERROR", "boom"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			res := decodeResult(t, b.Call(tc.op, tc.in))
			if res.Status != pb.Status_INVALID_INPUT {
				t.Fatalf("status = %v, want INVALID_INPUT", res.Status)
			}
			if len(res.Diagnostics) != 1 {
				t.Fatalf("diagnostics = %v, want exactly one", res.Diagnostics)
			}
			d := res.Diagnostics[0]
			if d.Severity != pb.Severity_ERROR || d.Code != tc.wantCode {
				t.Fatalf("diagnostic = %v/%s, want ERROR/%s", d.Severity, d.Code, tc.wantCode)
			}
			if !strings.Contains(d.Actual, tc.wantActual) {
				t.Fatalf("actual = %q, want it to contain %q", d.Actual, tc.wantActual)
			}
			if d.Hint == "" || d.Message == "" {
				t.Fatalf("diagnostic must carry message and hint: %v", d)
			}
		})
	}
}

// A nil Result from the model is a programming error; it must still surface as a Result.
func TestCallNilResult(t *testing.T) {
	b := Bridge{Analyze: func(*pb.SitePlan) *pb.Result { return nil }, Optimize: okResult}
	res := decodeResult(t, b.Call("analyze", fixtureBytes(t)))
	if res.Status != pb.Status_INVALID_INPUT || res.Diagnostics[0].Code != "INTERNAL_ERROR" {
		t.Fatalf("nil result must become INTERNAL_ERROR, got %v", res)
	}
}

func TestDefaultBridgeWiresStubs(t *testing.T) {
	for _, op := range []string{"analyze", "optimize"} {
		res := decodeResult(t, Default().Call(op, fixtureBytes(t)))
		if len(res.Diagnostics) == 0 {
			t.Fatalf("%s: expected at least one diagnostic from the core/optimize stub", op)
		}
	}
}
