package core

import (
	"fmt"
	"os"
	"sort"
	"strings"
	"testing"

	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

// floatTolerance is the relative tolerance for golden comparisons: Go fuses multiply-adds on arm64
// but not amd64, so the last bits of a double legitimately differ between a Mac and CI.
const floatTolerance = 1e-9

// requireProtoClose fails the test at the first field where got and want differ: floats/doubles are
// compared with a relative tolerance, everything else (ints, strings, enums, bools, list lengths,
// map keys) exactly. Reusable for any golden Result (WS3/WS4).
func requireProtoClose(t *testing.T, got, want proto.Message) {
	t.Helper()
	if path, ok := protoDiff(got.ProtoReflect(), want.ProtoReflect(), ""); !ok {
		t.Fatalf("Result differs from golden at %s; review and rerun with -update if intended", path)
	}
}

// protoDiff returns the path of the first difference, or ok=true if the messages are close.
func protoDiff(got, want protoreflect.Message, path string) (string, bool) {
	fields := map[protoreflect.FieldNumber]protoreflect.FieldDescriptor{}
	collect := func(m protoreflect.Message) {
		m.Range(func(fd protoreflect.FieldDescriptor, _ protoreflect.Value) bool {
			fields[fd.Number()] = fd
			return true
		})
	}
	collect(got)
	collect(want)
	nums := make([]int, 0, len(fields))
	for n := range fields {
		nums = append(nums, int(n))
	}
	sort.Ints(nums)
	for _, n := range nums {
		fd := fields[protoreflect.FieldNumber(n)]
		p := path + "." + string(fd.Name())
		// Presence only matters for singular messages. A proto3 scalar at its zero value is "unset",
		// and a residual of 8.9e-15 (arm64 FMA) vs 0 (amd64) must compare as close, not as present vs
		// absent; Get returns the zero default for unset scalars, lists and maps.
		if singularMessage(fd) {
			if got.Has(fd) != want.Has(fd) {
				return p + " (presence)", false
			}
			if !got.Has(fd) {
				continue
			}
		}
		if q, ok := valueDiff(fd, got.Get(fd), want.Get(fd), p); !ok {
			return q, false
		}
	}
	return "", true
}

func singularMessage(fd protoreflect.FieldDescriptor) bool {
	return fd.Kind() == protoreflect.MessageKind && !fd.IsList() && !fd.IsMap()
}

func valueDiff(fd protoreflect.FieldDescriptor, got, want protoreflect.Value, path string) (string, bool) {
	switch {
	case fd.IsList():
		g, w := got.List(), want.List()
		if g.Len() != w.Len() {
			return fmt.Sprintf("%s (len %d vs %d)", path, g.Len(), w.Len()), false
		}
		for i := 0; i < g.Len(); i++ {
			if q, ok := scalarOrMessageDiff(fd, g.Get(i), w.Get(i), fmt.Sprintf("%s[%d]", path, i)); !ok {
				return q, false
			}
		}
	case fd.IsMap():
		g, w := got.Map(), want.Map()
		if g.Len() != w.Len() {
			return fmt.Sprintf("%s (len %d vs %d)", path, g.Len(), w.Len()), false
		}
		var keys []protoreflect.MapKey
		g.Range(func(k protoreflect.MapKey, _ protoreflect.Value) bool { keys = append(keys, k); return true })
		sort.Slice(keys, func(i, j int) bool { return keys[i].String() < keys[j].String() })
		for _, k := range keys {
			if !w.Has(k) {
				return fmt.Sprintf("%s[%v] (missing in golden)", path, k), false
			}
			if q, ok := scalarOrMessageDiff(fd.MapValue(), g.Get(k), w.Get(k), fmt.Sprintf("%s[%v]", path, k)); !ok {
				return q, false
			}
		}
	default:
		return scalarOrMessageDiff(fd, got, want, path)
	}
	return "", true
}

func scalarOrMessageDiff(fd protoreflect.FieldDescriptor, got, want protoreflect.Value, path string) (string, bool) {
	switch fd.Kind() {
	case protoreflect.MessageKind, protoreflect.GroupKind:
		return protoDiff(got.Message(), want.Message(), path)
	case protoreflect.DoubleKind, protoreflect.FloatKind:
		if !approxEq(got.Float(), want.Float(), floatTolerance) {
			return fmt.Sprintf("%s (%g vs %g)", path, got.Float(), want.Float()), false
		}
	default:
		if got.Interface() != want.Interface() {
			return fmt.Sprintf("%s (%v vs %v)", path, got.Interface(), want.Interface()), false
		}
	}
	return "", true
}

// loadFixture returns a fresh copy of the reference plan; tests mutate it freely.
func loadFixture(t testing.TB) *pb.SitePlan {
	t.Helper()
	raw, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var plan pb.SitePlan
	if err := protojson.Unmarshal(raw, &plan); err != nil {
		t.Fatalf("parse fixture: %v", err)
	}
	return &plan
}

func clonePlan(p *pb.SitePlan) *pb.SitePlan { return proto.Clone(p).(*pb.SitePlan) }

// findDiag returns the first diagnostic with the code, or nil.
func findDiag(r *pb.Result, code string) *pb.Diagnostic {
	for _, d := range r.GetDiagnostics() {
		if d.GetCode() == code {
			return d
		}
	}
	return nil
}

func diagCodes(r *pb.Result) []string {
	var out []string
	for _, d := range r.GetDiagnostics() {
		out = append(out, d.GetCode()+"@"+d.GetProtoPath())
	}
	return out
}

func failedChecks(r *pb.ConservationReport) string {
	var s string
	for _, c := range r.GetChecks() {
		if !c.GetPassed() {
			s += c.GetName() + " residual=" + num(c.GetResidual()) + "; "
		}
	}
	return s
}

// requireComplete asserts the verbose-diagnostic rule: every validation diagnostic names where to fix.
func requireComplete(t *testing.T, d *pb.Diagnostic) {
	t.Helper()
	if d.GetCode() == "" || d.GetMessage() == "" || d.GetProtoPath() == "" || d.GetExpected() == "" || d.GetActual() == "" || d.GetHint() == "" {
		t.Errorf("incomplete diagnostic: %v", d)
	}
}

// explicitTwoPhase turns the fixture into a two-phase plan on a gas bridge + grid.
func explicitTwoPhase(plan *pb.SitePlan) *pb.SitePlan {
	p := clonePlan(plan)
	p.Power.Sources = append(p.Power.Sources, &pb.PowerSource{
		Id: "gas", Type: pb.PowerType_BTM_GAS, CapacityMw: 130, AvailableMonth: 12, CostPerMwh: 80, CapexPerKw: 1200, LeadTimeMonths: 12,
	})
	p.Phasing = &pb.Phasing{Mode: pb.PhasingMode_EXPLICIT, Phases: []*pb.Phase{
		{Id: "a", ItLoadMw: 100, StartMonth: 0, EnergizeMonth: 12, PowerSourceId: "gas"},
		{Id: "b", ItLoadMw: 100, StartMonth: 12, EnergizeMonth: 30, PowerSourceId: "grid"},
	}}
	return p
}

func TestRequireProtoCloseHelper(t *testing.T) {
	base := Analyze(loadFixture(t))
	drift := clonePlan(loadFixture(t))
	got := Analyze(drift)
	got.Summary.Npv *= 1 + 1e-12 // last-bit drift (FMA) must be tolerated
	if path, ok := protoDiff(got.ProtoReflect(), base.ProtoReflect(), ""); !ok {
		t.Fatalf("1e-12 drift reported as a difference at %s", path)
	}
	// A scalar at exactly zero is "unset" in proto3; FMA drift to 1e-15 on the other platform must
	// still compare as close (this is the arm64-vs-amd64 residual case).
	got.Conservation.Checks[6].Residual, base.Conservation.Checks[6].Residual = 1e-15, 0
	if path, ok := protoDiff(got.ProtoReflect(), base.ProtoReflect(), ""); !ok {
		t.Fatalf("zero vs 1e-15 residual reported as a difference at %s", path)
	}
	got.Summary.Npv *= 1.01
	if path, ok := protoDiff(got.ProtoReflect(), base.ProtoReflect(), ""); ok || !strings.HasPrefix(path, ".summary.npv") {
		t.Fatalf("1%% change must be reported at .summary.npv, got %q ok=%v", path, ok)
	}
	got.Summary.Npv = base.Summary.Npv
	got.Charts[0].Meta["x"] = "changed"
	if path, ok := protoDiff(got.ProtoReflect(), base.ProtoReflect(), ""); ok || !strings.HasPrefix(path, ".charts[0].meta[x]") {
		t.Fatalf("map value change must be reported at .charts[0].meta[x], got %q ok=%v", path, ok)
	}
}
