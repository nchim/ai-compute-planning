package core

import (
	"os"
	"testing"

	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

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
