package core

import (
	"testing"

	"github.com/nchim/ai-compute-planning/engine/pb"
	"google.golang.org/protobuf/proto"
)

// Every fixture's blocks must lie inside the parcel, whatever its size: nova-colo is 5 acres,
// abilene-1 is 400 (issue #39: a single row ran off the right edge of the small parcel).
func TestSchematicFitsEveryFixture(t *testing.T) {
	for _, name := range []string{"nova-colo", "abilene-1", "epoch-100mw"} {
		t.Run(name, func(t *testing.T) {
			res := Analyze(loadFixtureNamed(t, name))
			if d := findDiag(res, codeSchematicOverflow); d != nil {
				t.Fatalf("unexpected overflow: %v", d)
			}
			requireBlocksInside(t, res.GetSchematic(), usableRect(res.GetSchematic()))
			requireNoOverlap(t, res.GetSchematic())
			if !res.GetConservation().GetAllPassed() {
				t.Fatalf("conservation: %s", failedChecks(res.GetConservation()))
			}
		})
	}
}

// Halls keep phase order after wrapping: reading order (top-to-bottom, then left-to-right) is phase order.
func TestSchematicWrapsInPhaseOrder(t *testing.T) {
	s := Analyze(loadFixtureNamed(t, "nova-colo")).GetSchematic()
	var halls []*pb.Block
	for _, b := range s.GetBlocks() {
		if b.GetKind() == pb.BlockKind_DATA_HALL {
			halls = append(halls, b)
		}
	}
	if len(halls) != 2 {
		t.Fatalf("want 2 halls, got %d", len(halls))
	}
	a, b := halls[0], halls[1]
	if b.GetYM() < a.GetYM() || (b.GetYM() == a.GetYM() && b.GetXM() <= a.GetXM()) {
		t.Errorf("hall_p2 (%g,%g) must follow hall_p1 (%g,%g) in reading order", b.GetXM(), b.GetYM(), a.GetXM(), a.GetYM())
	}
	if rows := distinctRows(s); rows < 2 {
		t.Errorf("a 5-acre parcel must wrap into rows, got %d", rows)
	}
}

// A parcel whose area holds the footprint but whose shape cannot hold the 2:1 blocks and gaps is a
// WARNING, and the drawing is clamped to the parcel rather than spilling outside it.
func TestSchematicOverflowIsWarnedAndClamped(t *testing.T) {
	p := loadFixtureNamed(t, "nova-colo")
	p.Site.LandAcres, p.Site.UsableAcres = 3.5, 2.5 // the build needs ~2.45 acres: the area fits, four rows of blocks do not
	res := Analyze(p)
	if res.GetStatus() != pb.Status_OK_WITH_WARNINGS {
		t.Fatalf("status %v, diags %v", res.GetStatus(), diagCodes(res))
	}
	d := findDiag(res, codeSchematicOverflow)
	if d == nil {
		t.Fatalf("want %s, got %v", codeSchematicOverflow, diagCodes(res))
	}
	requireComplete(t, d)
	if d.GetSeverity() != pb.Severity_WARNING || d.GetProtoPath() != "site.usable_acres" {
		t.Errorf("overflow must be a WARNING on site.usable_acres, got %v", d)
	}
	s := res.GetSchematic()
	requireBlocksInside(t, s, [4]float64{0, 0, s.GetParcelWM(), s.GetParcelHM()})
	if !res.GetConservation().GetAllPassed() {
		t.Errorf("clamped blocks must still satisfy conservation: %s", failedChecks(res.GetConservation()))
	}
	if findDiag(Analyze(loadFixtureNamed(t, "nova-colo")), codeSchematicOverflow) != nil {
		t.Error("the fixture itself must not overflow")
	}
}

func TestBlocksWithinParcelCheck(t *testing.T) {
	var d diags
	m := build(loadFixture(t), &d)
	var check *pb.ConservationCheck
	for _, c := range conserve(m, &d).GetChecks() {
		if c.GetName() == "blocks_within_parcel" {
			check = c
		}
	}
	if check == nil || !check.GetPassed() {
		t.Fatalf("blocks_within_parcel must exist and pass on the fixture: %v", check)
	}
	m.schematic.Blocks[len(m.schematic.Blocks)-1].XM += m.schematic.GetParcelWM() // push the last block outside, as a layout bug would
	if report := conserve(m, &d); report.GetAllPassed() {
		t.Error("a block outside the parcel must fail blocks_within_parcel")
	}
}

func TestSchematicDeterministic(t *testing.T) {
	a := Analyze(loadFixtureNamed(t, "nova-colo")).GetSchematic()
	b := Analyze(loadFixtureNamed(t, "nova-colo")).GetSchematic()
	if !proto.Equal(a, b) {
		t.Error("schematic layout is not deterministic")
	}
}

// usableRect is the parcel minus the setback ring: [x0, y0, x1, y1].
func usableRect(s *pb.Schematic) [4]float64 {
	r := [4]float64{0, 0, s.GetParcelWM(), s.GetParcelHM()}
	for _, b := range s.GetBlocks() {
		if b.GetKind() != pb.BlockKind_SETBACK {
			continue
		}
		switch b.GetId() {
		case "setback_n":
			r[1] = b.GetHM()
		case "setback_w":
			r[0] = b.GetWM()
		case "setback_s":
			r[3] = b.GetYM()
		case "setback_e":
			r[2] = b.GetXM()
		}
	}
	return r
}

func requireBlocksInside(t *testing.T, s *pb.Schematic, r [4]float64) {
	t.Helper()
	const eps = 1e-6
	for _, b := range s.GetBlocks() {
		if b.GetKind() == pb.BlockKind_SETBACK {
			continue
		}
		if b.GetXM() < r[0]-eps || b.GetYM() < r[1]-eps || b.GetXM()+b.GetWM() > r[2]+eps || b.GetYM()+b.GetHM() > r[3]+eps {
			t.Errorf("block %q [%g,%g %gx%g] leaves %v", b.GetId(), b.GetXM(), b.GetYM(), b.GetWM(), b.GetHM(), r)
		}
	}
}

func requireNoOverlap(t *testing.T, s *pb.Schematic) {
	t.Helper()
	bs := s.GetBlocks()
	for i, a := range bs {
		for _, b := range bs[i+1:] {
			if a.GetKind() == pb.BlockKind_SETBACK || b.GetKind() == pb.BlockKind_SETBACK {
				continue
			}
			if overlapArea(a, b) > 1e-6 {
				t.Errorf("blocks %q and %q overlap", a.GetId(), b.GetId())
			}
		}
	}
}

func overlapArea(a, b *pb.Block) float64 {
	w := minf(a.GetXM()+a.GetWM(), b.GetXM()+b.GetWM()) - maxf(a.GetXM(), b.GetXM())
	h := minf(a.GetYM()+a.GetHM(), b.GetYM()+b.GetHM()) - maxf(a.GetYM(), b.GetYM())
	return maxf(0, w) * maxf(0, h)
}

func distinctRows(s *pb.Schematic) int {
	seen := map[float64]bool{}
	for _, b := range s.GetBlocks() {
		if b.GetKind() == pb.BlockKind_DATA_HALL || b.GetKind() == pb.BlockKind_SUBSTATION || b.GetKind() == pb.BlockKind_GAS_PAD {
			seen[b.GetYM()] = true
		}
	}
	return len(seen)
}
