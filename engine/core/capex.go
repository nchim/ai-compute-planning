package core

import (
	"sort"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

// Capex component ids, in the order the capex stack is rendered.
const (
	compShell   = "shell"
	compElec    = "electrical"
	compCooling = "cooling"
	compNetwork = "network"
	compAgility = "agility_premium"
	compPower   = "power_source"
	compLand    = "land"
	compGpu     = "gpu"
)

var capexOrder = []string{compShell, compElec, compCooling, compNetwork, compAgility, compPower, compLand, compGpu}

// capexLine is one spend: which component, which phase carries it, and the month it is paid.
type capexLine struct {
	component string
	phaseID   string
	month     int
	amount    float64
}

type capexBuild struct {
	lines []capexLine
	total float64
}

// buildCapex prices every phase. Facility components are paid at construction start, GPUs at energize
// (only when the operator sells compute; a colo tenant buys its own), land at t0, and each power
// source at (ready − lead time). Agility premium is its own line so the adaptability cost is visible.
func buildCapex(plan *pb.SitePlan, phases []phase, srcs []source, months int) capexBuild {
	costs := plan.GetCosts()
	var b capexBuild
	add := func(comp, phaseID string, month int, amount float64) {
		if amount > 0 {
			b.lines = append(b.lines, capexLine{comp, phaseID, month, amount})
			b.total += amount
		}
	}
	for _, ph := range phases {
		mw := ph.size.itMw
		shell, elec, cool := costs.GetShellCapexPerMw()*mw, costs.GetElectricalCapexPerMw()*mw, costs.GetCoolingCapexPerMw()*mw
		add(compShell, ph.id, ph.startMonth, shell)
		add(compElec, ph.id, ph.startMonth, elec)
		add(compCooling, ph.id, ph.startMonth, cool)
		add(compNetwork, ph.id, ph.startMonth, costs.GetNetworkCapexPerMw()*mw)
		if ph.agility {
			add(compAgility, ph.id, ph.startMonth, (shell+elec+cool)*costs.GetAgilityPremiumPct()/100)
		}
		if plan.GetRevenue().GetMode() == pb.RevenueMode_COMPUTE_SALES && ph.energize < months {
			add(compGpu, ph.id, ph.energize, ph.size.gpus*costs.GetGpu().GetUnitCost())
		}
	}
	add(compLand, phases[0].id, 0, plan.GetSite().GetLandAcres()*costs.GetLandCapexPerAcre())
	for _, s := range srcs {
		add(compPower, phaseUsingSource(phases, s).id, maxInt(0, s.ready-s.leadMonths), s.capexPerKw*s.capacityMw*1000)
	}
	return b
}

// phaseUsingSource attributes a source to the first phase energizing at or after it is ready.
func phaseUsingSource(phases []phase, s source) phase {
	for _, ph := range phases {
		if ph.energize >= s.ready {
			return ph
		}
	}
	return phases[len(phases)-1]
}

// byComponent totals per component in render order (components with no spend are omitted).
func (b capexBuild) byComponent() ([]string, map[string]float64) {
	m := map[string]float64{}
	for _, l := range b.lines {
		m[l.component] += l.amount
	}
	var keys []string
	for _, k := range capexOrder {
		if _, ok := m[k]; ok {
			keys = append(keys, k)
		}
	}
	return keys, m
}

// byPhase totals per phase id, ids sorted.
func (b capexBuild) byPhase() ([]string, map[string]float64) {
	m := map[string]float64{}
	for _, l := range b.lines {
		m[l.phaseID] += l.amount
	}
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys, m
}

// monthly spreads spend onto the month grid; amounts scheduled after the hold are dropped from the
// cashflow (they were never paid inside the hold) but still count in total capex.
func (b capexBuild) monthly(months int, keep func(capexLine) bool) []float64 {
	out := make([]float64, months)
	for _, l := range b.lines {
		if l.month < months && keep(l) {
			out[l.month] += l.amount
		}
	}
	return out
}

func anyLine(capexLine) bool        { return true }
func facilityLine(l capexLine) bool { return l.component != compGpu && l.component != compLand }
func gpuLine(l capexLine) bool      { return l.component == compGpu }
func landLine(l capexLine) bool     { return l.component == compLand }
