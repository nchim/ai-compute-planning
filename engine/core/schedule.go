package core

import (
	"sort"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

// ConstructionLeadMonths is the shell + fit-out duration from construction start to a hall ready to
// energize; the optimizer derives start_month = energize − lead from it. STUB: a single greenfield
// figure; real builds vary 12–24 months with size and modularity.
const ConstructionLeadMonths = 18

// shellLifeMonths is the straight-line life of facility (non-GPU) capex for terminal value and LCOC
// levelization (research: 15–30 yr shell life; 25 yr chosen).
const shellLifeMonths = 25 * 12

// source is a power source with its readiness resolved: grid sources wait for the interconnection.
type source struct {
	id         string
	typ        pb.PowerType
	capacityMw float64
	costPerMwh float64
	capexPerKw float64
	leadMonths int
	ready      int  // first month the source can carry load
	firm       bool // storage is not firm capacity (STUB: BESS dispatch not modelled)
}

// newSources resolves readiness for every source, preserving input order.
func newSources(p *pb.PowerPlan) []source {
	out := make([]source, 0, len(p.GetSources()))
	for _, s := range p.GetSources() {
		src := source{
			id: s.GetId(), typ: s.GetType(), capacityMw: s.GetCapacityMw(), costPerMwh: s.GetCostPerMwh(),
			capexPerKw: s.GetCapexPerKw(), leadMonths: int(s.GetLeadTimeMonths()), ready: int(s.GetAvailableMonth()),
			firm: s.GetType() != pb.PowerType_BESS,
		}
		if src.typ == pb.PowerType_GRID && int(p.GetInterconnection().GetGridEnergizeMonth()) > src.ready {
			src.ready = int(p.GetInterconnection().GetGridEnergizeMonth())
		}
		out = append(out, src)
	}
	return out
}

func sourceIndex(srcs []source) map[string]source {
	m := make(map[string]source, len(srcs))
	for _, s := range srcs {
		m[s.id] = s
	}
	return m
}

func sourceIDs(srcs []source) []string {
	ids := make([]string, 0, len(srcs))
	for _, s := range srcs {
		ids = append(ids, s.id)
	}
	sort.Strings(ids)
	return ids
}

// firmSupplyAt is the firm MW available at month t.
func firmSupplyAt(srcs []source, t int) float64 {
	var mw float64
	for _, s := range srcs {
		if s.firm && s.ready <= t {
			mw += s.capacityMw
		}
	}
	return mw
}

// firstMonthCovering is the earliest month in [0, months) at which firm supply ≥ mw.
func firstMonthCovering(srcs []source, mw float64, months int) (int, bool) {
	for t := 0; t < months; t++ {
		if firmSupplyAt(srcs, t) >= mw-1e-9 {
			return t, true
		}
	}
	return 0, false
}

// phase is one scheduled block of capacity.
type phase struct {
	id                string
	cooling           pb.CoolingMode
	size              sizing
	sourceID          string // "" = pooled supply
	startMonth        int
	constructionReady int
	powerReady        int
	energize          int // max(powerReady, constructionReady)
	footprintAcres    float64
	agility           bool // liquid-class or high floor load → agility premium
}

// schedule builds the phase list. SINGLE_SHOT derives one phase; EXPLICIT trusts the (validated) caller
// timeline, taking the caller's energize month as the construction-ready date.
func schedule(plan *pb.SitePlan, srcs []source, months int, d *diags) []phase {
	c := plan.GetCompute()
	highFloor := plan.GetSite().GetFloorLoadPsf() >= floorLoadLiquidMinPsf
	if plan.GetPhasing().GetMode() == pb.PhasingMode_SINGLE_SHOT {
		ph := newPhase("p1", c.GetTargetItLoadMw(), c, c.GetCooling(), highFloor)
		ph.constructionReady = ConstructionLeadMonths
		ph.powerReady, _ = firstMonthCovering(srcs, ph.size.facilityMw, months) // validated to exist
		ph.energize = maxInt(ph.powerReady, ph.constructionReady)
		warnIfAfterHold(ph, months, d)
		return []phase{ph}
	}
	byID := sourceIndex(srcs)
	var out []phase
	var cumLoad float64
	for _, in := range plan.GetPhasing().GetPhases() {
		cooling := in.GetCooling()
		if cooling == pb.CoolingMode_COOLING_UNSPECIFIED {
			cooling = c.GetCooling()
		}
		ph := newPhase(in.GetId(), in.GetItLoadMw(), c, cooling, highFloor)
		ph.sourceID = in.GetPowerSourceId()
		ph.startMonth = int(in.GetStartMonth())
		ph.constructionReady = int(in.GetEnergizeMonth())
		cumLoad += ph.size.facilityMw
		if ph.sourceID != "" {
			ph.powerReady = byID[ph.sourceID].ready
		} else {
			ph.powerReady, _ = firstMonthCovering(srcs, cumLoad, months)
		}
		ph.energize = maxInt(ph.powerReady, ph.constructionReady)
		if in.GetFootprintAcres() > 0 {
			ph.footprintAcres = in.GetFootprintAcres()
		}
		warnIfAfterHold(ph, months, d)
		out = append(out, ph)
	}
	return out
}

func newPhase(id string, itMw float64, c *pb.ComputeSpec, cooling pb.CoolingMode, highFloor bool) phase {
	s := sizePhase(itMw, c.GetKwPerRack(), c.GetGpusPerRack(), c.GetPue(), cooling)
	return phase{id: id, cooling: cooling, size: s, footprintAcres: s.footprintAcres, agility: isLiquid(cooling) || highFloor}
}

func warnIfAfterHold(ph phase, months int, d *diags) {
	if ph.energize >= months {
		d.warnf(codeEnergizeAfterHold, "finance.hold_period_months", "energize < hold", "energize m"+num(float64(ph.energize)),
			"extend the hold or bring power/construction forward", "phase %q energizes at m%d, after the %d-month hold; it earns no revenue", ph.id, ph.energize, months)
	}
}

// onlineItMw is the IT MW energized at month t.
func onlineItMw(phases []phase, t int) float64 {
	var mw float64
	for _, ph := range phases {
		if ph.energize <= t {
			mw += ph.size.itMw
		}
	}
	return mw
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
