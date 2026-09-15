package core

import (
	"math"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

// Layout rules. The parcel is drawn as a square; the setback ring is whatever land is not usable.
// Yards, halls and pads are 2:1 rectangles laid left-to-right in phase order so the timeline scrubber
// can reveal them; the expansion pad is the unused remainder along the bottom. Deterministic by
// construction (no map iteration, no randomness).
const (
	blockAspect      = 2.0 // w:h
	blockGapM        = 20.0
	coolingYardRatio = 0.5 // cooling yard area relative to the hall
)

func layoutSchematic(m *model) *pb.Schematic {
	site := m.plan.GetSite()
	parcel := math.Sqrt(site.GetLandAcres() * sqmPerAcre)
	inner := math.Sqrt(site.GetUsableAcres() * sqmPerAcre)
	setback := (parcel - inner) / 2
	s := &pb.Schematic{ParcelWM: parcel, ParcelHM: parcel}
	s.Blocks = append(s.Blocks, setbackRing(parcel, setback)...)

	cursor := &placer{x: setback + blockGapM, y: setback + blockGapM}
	var used float64
	place := func(id string, kind pb.BlockKind, acres float64, phaseID string, energize int) {
		used += acres
		s.Blocks = append(s.Blocks, cursor.next(id, kind, acres, phaseID, energize))
	}
	place("substation", pb.BlockKind_SUBSTATION, m.site.facilityMw*substationAcresPerMw, "", m.phases[0].energize)
	for _, src := range m.srcs {
		if src.typ == pb.PowerType_BTM_GAS {
			place("gas_pad_"+src.id, pb.BlockKind_GAS_PAD, src.capacityMw*gasPadAcresPerMw, "", src.ready)
		}
	}
	for _, ph := range m.phases {
		hall := cursor.next("hall_"+ph.id, pb.BlockKind_DATA_HALL, ph.size.buildingAcres, ph.id, ph.energize)
		yard := cursor.below(hall, "cooling_"+ph.id, pb.BlockKind_COOLING_YARD, ph.size.buildingAcres*coolingYardRatio, ph.id, ph.energize)
		s.Blocks = append(s.Blocks, hall, yard)
		used += ph.footprintAcres
	}
	usable := site.GetUsableAcres()
	if spare := usable - used; spare > 0 {
		h := spare * sqmPerAcre / inner
		s.Blocks = append(s.Blocks, &pb.Block{Id: "expansion", Kind: pb.BlockKind_EXPANSION_PAD, XM: setback, YM: parcel - setback - h, WM: inner, HM: h})
	}
	s.FootprintUsedPct = used / usable * 100
	return s
}

// setbackRing is the non-usable margin as four strips (top, bottom, left, right).
func setbackRing(parcel, w float64) []*pb.Block {
	if w <= 0 {
		return nil
	}
	k := pb.BlockKind_SETBACK
	return []*pb.Block{
		{Id: "setback_n", Kind: k, XM: 0, YM: 0, WM: parcel, HM: w},
		{Id: "setback_s", Kind: k, XM: 0, YM: parcel - w, WM: parcel, HM: w},
		{Id: "setback_w", Kind: k, XM: 0, YM: w, WM: w, HM: parcel - 2*w},
		{Id: "setback_e", Kind: k, XM: parcel - w, YM: w, WM: w, HM: parcel - 2*w},
	}
}

// placer walks a single row left to right.
type placer struct{ x, y float64 }

func (p *placer) next(id string, kind pb.BlockKind, acres float64, phaseID string, energize int) *pb.Block {
	w, h := rect(acres)
	b := &pb.Block{Id: id, Kind: kind, XM: p.x, YM: p.y, WM: w, HM: h, PhaseId: phaseID, EnergizeMonth: int32(energize)}
	p.x += w + blockGapM
	return b
}

// below stacks a block under an existing one, sharing its left edge.
func (p *placer) below(above *pb.Block, id string, kind pb.BlockKind, acres float64, phaseID string, energize int) *pb.Block {
	w, h := rect(acres)
	return &pb.Block{Id: id, Kind: kind, XM: above.GetXM(), YM: above.GetYM() + above.GetHM() + blockGapM, WM: w, HM: h, PhaseId: phaseID, EnergizeMonth: int32(energize)}
}

func rect(acres float64) (w, h float64) {
	h = math.Sqrt(acres * sqmPerAcre / blockAspect)
	return h * blockAspect, h
}
