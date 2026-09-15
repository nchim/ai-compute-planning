package core

import (
	"fmt"
	"math"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

// Layout rules. The parcel is drawn as a square; the setback ring is whatever land is not usable.
// Substation, gas pads, then each phase's hall and cooling yard are placed in that order into rows
// that fill the usable rectangle top to bottom, so the timeline scrubber reveals them in order. A
// block is a 2:1 rectangle of its acreage when the row has room and is narrowed with its row-mates
// (down to 1:1) when it has not; a phase's hall and yard never split across rows. The free space
// right of the last row and below it becomes expansion pads. Deterministic by construction.
const (
	blockAspect      = 2.0 // w:h when the row has room
	minAspectScale   = 1 / math.Sqrt2
	blockGapM        = 20.0 // between blocks; shrunk on small parcels so gaps do not eat the site
	gapFraction      = 1.0 / 40
	coolingYardRatio = 0.5 // cooling yard area relative to the hall
)

func layoutSchematic(m *model, d *diags) *pb.Schematic {
	site := m.plan.GetSite()
	parcel := math.Sqrt(site.GetLandAcres() * sqmPerAcre)
	inner := math.Sqrt(site.GetUsableAcres() * sqmPerAcre)
	setback := (parcel - inner) / 2
	s := &pb.Schematic{ParcelWM: parcel, ParcelHM: parcel}
	s.Blocks = append(s.Blocks, setbackRing(parcel, setback)...)

	rows := newRowLayout(setback, inner)
	used := m.site.facilityMw * substationAcresPerMw
	rows.add(newBlock("substation", pb.BlockKind_SUBSTATION, used, "", m.phases[0].energize))
	for _, src := range m.srcs {
		if src.typ == pb.PowerType_BTM_GAS {
			rows.add(newBlock("gas_pad_"+src.id, pb.BlockKind_GAS_PAD, src.capacityMw*gasPadAcresPerMw, "", src.ready))
			used += src.capacityMw * gasPadAcresPerMw
		}
	}
	for _, ph := range m.phases {
		rows.add(
			newBlock("hall_"+ph.id, pb.BlockKind_DATA_HALL, ph.size.buildingAcres, ph.id, ph.energize),
			newBlock("cooling_"+ph.id, pb.BlockKind_COOLING_YARD, ph.size.buildingAcres*coolingYardRatio, ph.id, ph.energize),
		)
		used += ph.footprintAcres
	}
	blocks := rows.place()
	s.Blocks = append(s.Blocks, blocks...)
	s.Blocks = append(s.Blocks, rows.expansionPads()...)
	if over := rows.overflowAcres(); over > 0 {
		d.warnf(codeSchematicOverflow, "site.usable_acres",
			fmt.Sprintf("a usable rectangle that holds the %d laid-out blocks (%.2f acres spill past it)", len(blocks), over),
			fmt.Sprintf("%.1f usable acres", site.GetUsableAcres()),
			"raise site.usable_acres / site.land_acres or shrink the build; the schematic clamps the spilling blocks to the parcel",
			"the schematic's blocks do not fit the usable rectangle even when wrapped into rows (%.2f acres outside it)", over)
		clampToParcel(s)
	}
	s.FootprintUsedPct = used / site.GetUsableAcres() * 100
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

// newBlock is an unplaced block of the given acreage at its natural 2:1 shape.
func newBlock(id string, kind pb.BlockKind, acres float64, phaseID string, energize int) *pb.Block {
	h := math.Sqrt(acres * sqmPerAcre / blockAspect)
	return &pb.Block{Id: id, Kind: kind, WM: h * blockAspect, HM: h, PhaseId: phaseID, EnergizeMonth: int32(energize)}
}

// rowLayout fills the usable rectangle, one gap in from its edges, with rows of blocks in insertion
// order. A group joins the current row while narrowing the row's blocks to at most 1:1 still fits it.
type rowLayout struct {
	x0, y0, x1, y1, gap float64
	rows                [][]*pb.Block
	blocks              []*pb.Block // placed, in order
	lastRow             struct{ xEnd, y, h float64 }
	yEnd                float64 // one gap below the last row
}

func newRowLayout(setback, inner float64) *rowLayout {
	return &rowLayout{x0: setback, y0: setback, x1: setback + inner, y1: setback + inner, gap: minf(blockGapM, inner*gapFraction)}
}

func (r *rowLayout) add(group ...*pb.Block) {
	if n := len(r.rows); n > 0 && r.fit(r.rows[n-1], group) >= minAspectScale {
		r.rows[n-1] = append(r.rows[n-1], group...)
		return
	}
	r.rows = append(r.rows, group)
}

// fit is the factor the blocks' natural widths must be scaled by to span one row; ≥ 1 means room to spare.
func (r *rowLayout) fit(groups ...[]*pb.Block) float64 {
	var natural float64
	n := 0
	for _, g := range groups {
		for _, b := range g {
			natural += b.GetWM()
			n++
		}
	}
	return (r.x1 - r.x0 - float64(n+1)*r.gap) / natural
}

// place sizes and positions every row top to bottom and returns the blocks in order.
func (r *rowLayout) place() []*pb.Block {
	y := r.y0 + r.gap
	for _, row := range r.rows {
		f := maxf(minAspectScale, minf(1, r.fit(row)))
		x, h := r.x0+r.gap, 0.0
		for _, b := range row {
			b.WM, b.HM = b.GetWM()*f, b.GetHM()/f
			b.XM, b.YM = x, y
			x += b.GetWM() + r.gap
			h = maxf(h, b.GetHM())
		}
		r.blocks = append(r.blocks, row...)
		r.lastRow.xEnd, r.lastRow.y, r.lastRow.h = x, y, h
		y += h + r.gap
	}
	r.yEnd = y
	return r.blocks
}

// expansionPads are the free space below the last row ("expansion") and right of it ("expansion_e"),
// each only when it is wider than a gap and lies inside the usable rectangle.
func (r *rowLayout) expansionPads() []*pb.Block {
	var pads []*pb.Block
	if h := r.y1 - r.gap - r.yEnd; h > r.gap {
		pads = append(pads, &pb.Block{Id: "expansion", Kind: pb.BlockKind_EXPANSION_PAD, XM: r.x0 + r.gap, YM: r.yEnd, WM: r.x1 - r.x0 - 2*r.gap, HM: h})
	}
	if w := r.x1 - r.gap - r.lastRow.xEnd; w > r.gap && r.lastRow.y+r.lastRow.h <= r.y1 {
		pads = append(pads, &pb.Block{Id: "expansion_e", Kind: pb.BlockKind_EXPANSION_PAD, XM: r.lastRow.xEnd, YM: r.lastRow.y, WM: w, HM: r.lastRow.h})
	}
	return pads
}

// overflowAcres is the placed blocks' area outside the usable rectangle.
func (r *rowLayout) overflowAcres() float64 {
	var sqm float64
	for _, b := range r.blocks {
		sqm += outsideArea(b, r.x0, r.y0, r.x1, r.y1)
	}
	return sqm / sqmPerAcre
}

// outsideArea is the part of b's area that lies outside the rectangle [x0,x1]×[y0,y1].
func outsideArea(b *pb.Block, x0, y0, x1, y1 float64) float64 {
	if b.GetXM() >= x0 && b.GetYM() >= y0 && b.GetXM()+b.GetWM() <= x1 && b.GetYM()+b.GetHM() <= y1 {
		return 0
	}
	w := maxf(0, minf(b.GetXM()+b.GetWM(), x1)-maxf(b.GetXM(), x0))
	h := maxf(0, minf(b.GetYM()+b.GetHM(), y1)-maxf(b.GetYM(), y0))
	return b.GetWM()*b.GetHM() - w*h
}

// clampToParcel moves (and if necessary shrinks) every block so it lies inside the parcel; blocks may
// then overlap, which is the honest picture of a site that cannot hold its build.
func clampToParcel(s *pb.Schematic) {
	for _, b := range s.GetBlocks() {
		b.WM, b.XM = clampSpan(b.GetXM(), b.GetWM(), s.GetParcelWM())
		b.HM, b.YM = clampSpan(b.GetYM(), b.GetHM(), s.GetParcelHM())
	}
}

func clampSpan(start, size, limit float64) (float64, float64) {
	size = minf(size, limit)
	return size, minf(maxf(start, 0), limit-size)
}
