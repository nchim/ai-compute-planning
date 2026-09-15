package core

import (
	"bytes"
	"flag"
	"os"
	"testing"

	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

var update = flag.Bool("update", false, "rewrite the golden Result under testdata/")

const goldenPath = "testdata/abilene-1.result.json"

func TestAbileneGolden(t *testing.T) {
	res := Analyze(loadFixture(t))
	if res.GetStatus() != pb.Status_OK {
		t.Fatalf("status = %v, diags %v", res.GetStatus(), diagCodes(res))
	}
	if !res.GetConservation().GetAllPassed() {
		t.Fatalf("conservation failed: %s", failedChecks(res.GetConservation()))
	}
	s := res.GetSummary()
	// Plausibility (reviewed): $30–40M/MW incl. GPUs; LCOC on the order of $1.5–2.5/GPU-hr, below the
	// $3.25 GB300-class price.
	if s.GetCapexPerMw() < 25e6 || s.GetCapexPerMw() > 45e6 || s.GetLcocPerGpuHour() < 1.5 || s.GetLcocPerGpuHour() > 2.5 {
		t.Fatalf("implausible economics: capex/MW %g, LCOC %g", s.GetCapexPerMw(), s.GetLcocPerGpuHour())
	}
	if s.GetTimeToEnergizeMonths() != 30 || s.GetMwOnlineFinal() != 200 || s.GetDemandCapturePct() >= 100 || s.GetShortfallMwMonths() <= 0 {
		t.Fatalf("summary inconsistent with the fixture: %v", s)
	}
	got, err := protojson.MarshalOptions{Multiline: true, Indent: "  "}.Marshal(res)
	if err != nil {
		t.Fatal(err)
	}
	if *update {
		if err := os.WriteFile(goldenPath, got, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	raw, err := os.ReadFile(goldenPath)
	if err != nil {
		t.Fatalf("read golden (run with -update to create): %v", err)
	}
	var want pb.Result
	if err := protojson.Unmarshal(raw, &want); err != nil {
		t.Fatal(err)
	}
	requireProtoClose(t, res, &want)
}

// T2 of the acceptance session: a bad density is caught with both codes and their proto_paths, and
// fixing exactly the named fields yields OK with a smaller footprint and a visible agility premium.
func TestT2DensityScenario(t *testing.T) {
	baseline := Analyze(loadFixture(t))
	bad := loadFixture(t)
	bad.Compute.KwPerRack = 130
	res := Analyze(bad)
	if res.GetStatus() != pb.Status_INVALID_INPUT {
		t.Fatalf("status = %v, want INVALID_INPUT", res.GetStatus())
	}
	for code, path := range map[string]string{codeDensityExceedsCooling: "compute.kw_per_rack", codeFloorLoadInsufficient: "site.floor_load_psf"} {
		d := findDiag(res, code)
		if d == nil || d.GetProtoPath() != path || d.GetSeverity() != pb.Severity_ERROR {
			t.Fatalf("want ERROR %s@%s, got %v", code, path, diagCodes(res))
		}
		requireComplete(t, d)
	}

	// The agent's correction: an NVL72 rack (130 kW, 72 GPUs) on liquid cooling with a liquid-rated
	// slab. GPU count stays ≈ constant, so capex/MW rises only through the agility premium.
	fixed := clonePlan(bad)
	fixed.Compute.Cooling = pb.CoolingMode_LIQUID_DTC
	fixed.Compute.GpusPerRack = 72
	fixed.Site.FloorLoadPsf = 300
	res = Analyze(fixed)
	if res.GetStatus() != pb.Status_OK || !res.GetConservation().GetAllPassed() {
		t.Fatalf("fixed plan: status %v, diags %v, checks %s", res.GetStatus(), diagCodes(res), failedChecks(res.GetConservation()))
	}
	if res.GetSchematic().GetFootprintUsedPct() >= baseline.GetSchematic().GetFootprintUsedPct() {
		t.Error("denser racks must shrink the footprint")
	}
	if res.GetSummary().GetCapexPerMw() <= baseline.GetSummary().GetCapexPerMw() {
		t.Errorf("agility premium must raise capex per MW: %g vs baseline %g", res.GetSummary().GetCapexPerMw(), baseline.GetSummary().GetCapexPerMw())
	}
	premium := capexPerMw(res, compAgility)
	if premium <= 0 || !approxEq(premium, 0.12*(capexPerMw(res, compShell)+capexPerMw(res, compElec)+capexPerMw(res, compCooling)), 1e-9) {
		t.Errorf("agility premium line = %g/MW, want 12%% of shell+electrical+cooling", premium)
	}
}

// capexPerMw reads the per_mw_usd column of the capex_stack table for a component (0 if absent).
func capexPerMw(res *pb.Result, component string) float64 {
	for _, r := range res.GetTables()[1].GetRows() {
		if r.GetCells()[0].GetS() == component {
			return r.GetCells()[2].GetN()
		}
	}
	return 0
}

func TestExplicitPhasesAnalyzeOK(t *testing.T) {
	res := Analyze(explicitTwoPhase(loadFixture(t)))
	if res.GetStatus() != pb.Status_OK || !res.GetConservation().GetAllPassed() {
		t.Fatalf("status %v, diags %v, checks %s", res.GetStatus(), diagCodes(res), failedChecks(res.GetConservation()))
	}
	if res.GetSummary().GetTimeToEnergizeMonths() != 12 {
		t.Fatalf("gas bridge should energize phase a at m12, got %d", res.GetSummary().GetTimeToEnergizeMonths())
	}
}

func TestBessIsVisiblyIgnored(t *testing.T) {
	p := loadFixture(t)
	p.Power.Sources = append(p.Power.Sources, &pb.PowerSource{Id: "bess", Type: pb.PowerType_BESS, CapacityMw: 100})
	res := Analyze(p)
	if d := findDiag(res, codeStorageNotFirm); d == nil || d.GetSeverity() != pb.Severity_INFO || res.GetStatus() != pb.Status_OK {
		t.Fatalf("storage must be flagged as an INFO stub without downgrading status: %v", diagCodes(res))
	}
}

// Determinism: identical input bytes → identical output bytes. Deterministic marshalling is required
// because Result carries maps (chart meta, summary.extra); the WASM bridge must marshal the same way.
func TestAnalyzeIsDeterministic(t *testing.T) {
	opts := proto.MarshalOptions{Deterministic: true}
	for _, plan := range []*pb.SitePlan{loadFixture(t), explicitTwoPhase(loadFixture(t))} {
		a, err := opts.Marshal(Analyze(plan))
		if err != nil {
			t.Fatal(err)
		}
		b, err := opts.Marshal(Analyze(clonePlan(plan)))
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(a, b) {
			t.Fatal("two runs on the same plan produced different bytes")
		}
	}
}

func TestAnalyzeNeverPanicsOnEmptyPlan(t *testing.T) {
	res := Analyze(&pb.SitePlan{})
	if res.GetStatus() != pb.Status_INVALID_INPUT || len(res.GetDiagnostics()) == 0 {
		t.Fatalf("empty plan must be INVALID_INPUT with diagnostics, got %v", res.GetStatus())
	}
}

func BenchmarkAnalyze(b *testing.B) {
	plan := loadFixture(b)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if Analyze(plan).GetStatus() != pb.Status_OK {
			b.Fatal("fixture must analyze OK")
		}
	}
}
