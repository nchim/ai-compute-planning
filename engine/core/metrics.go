package core

import (
	"github.com/nchim/ai-compute-planning/engine/pb"
)

// Agility (stranding) risk by cooling class: an air-only shell is locked to ≤40 kW/rack and stranded
// within 1–2 GPU generations; liquid-ready designs keep the refresh option. High floor load buys the
// rest (research/topics/05-facility-lifecycle/agility-adaptability-L2.md).
const (
	agilityRiskAir       = 70.0
	agilityRiskLiquid    = 30.0
	agilityRiskImmersion = 15.0
	agilityHighFloorBuys = 15.0
	powerHeadroomTarget  = 0.20 // 20% firm-supply headroom over facility load scores zero power risk
)

// riskComponent is one axis of the composite risk score (0 = none, 100 = severe).
type riskComponent struct {
	name  string
	score float64
}

// presentValues are the discounted totals LCOC and breakeven are built from. variable is the part of
// cost that scales with utilization (opexSeries.variable).
type presentValues struct {
	cost, variable, gpuHours, revenue float64
}

// terminalValue is what the assets are worth at the end of the hold: GPUs at their residual-curve
// fraction, facility capex straight-line over shellLifeMonths, land at cost (STUB: no appreciation).
func terminalValue(plan *pb.SitePlan, capex capexBuild, phases []phase, months int) float64 {
	var tv float64
	for _, l := range capex.lines {
		if l.month >= months {
			continue
		}
		switch {
		case gpuLine(l):
			tv += l.amount * gpuResidualFraction(plan.GetCosts().GetGpu(), (months-l.month)/12)
		case landLine(l):
			tv += l.amount
		default:
			tv += l.amount * maxf(0, 1-float64(months-l.month)/shellLifeMonths)
		}
	}
	return tv
}

// gpuResidualFraction reads the residual curve after `years` full years in service (1.0 before the
// first anniversary, last curve value beyond it); straight-line over depreciation_years if no curve.
func gpuResidualFraction(g *pb.GpuCost, years int) float64 {
	if years <= 0 {
		return 1
	}
	if curve := g.GetResidualCurve(); len(curve) > 0 {
		if years > len(curve) {
			return curve[len(curve)-1]
		}
		return curve[years-1]
	}
	return maxf(0, 1-float64(years)/float64(g.GetDepreciationYears()))
}

// discount computes the present values behind LCOC: lifecycle cost net of terminal value, delivered
// GPU-hours and revenue, all at the monthly equivalent of finance.discount_rate.
func discount(plan *pb.SitePlan, cf cashflow, opex opexSeries, rev revenueSeries) presentValues {
	r := monthlyRate(plan.GetFinance().GetDiscountRate())
	cost := make([]float64, cf.months)
	for t := range cost {
		cost[t] = cf.capex[t] + cf.opex[t] + cf.power[t] - cf.terminal[t]
	}
	return presentValues{cost: npv(r, cost), variable: npv(r, opex.variable), gpuHours: npv(r, rev.gpuHours), revenue: npv(r, cf.revenue)}
}

// lcoc is PV(lifecycle cost) / PV(delivered GPU-hours); see doc.go for the formula and worked example.
func lcoc(pv presentValues) float64 {
	if pv.gpuHours <= 0 {
		return 0
	}
	return pv.cost / pv.gpuHours
}

// utilizationBreakeven is the utilization (occupancy for colo) at which PV(revenue) = PV(cost).
// Revenue and the variable cost (management fee, compute-sales energy) are linear in utilization and
// the rest of cost is fixed, so breakeven = assumed × (PV(cost) − PV(variable)) / (PV(revenue) − PV(variable)).
func utilizationBreakeven(plan *pb.SitePlan, pv presentValues) float64 {
	margin := pv.revenue - pv.variable
	if margin <= 0 {
		return 0
	}
	rev := plan.GetRevenue()
	assumed := rev.GetCompute().GetUtilizationPct()
	if rev.GetMode() == pb.RevenueMode_COLO_LEASE {
		assumed = 100 - rev.GetColo().GetVacancyPct()
	}
	return assumed * (pv.cost - pv.variable) / margin
}

// stabilizedNoi annualizes net operating income over the 12 months after the last phase energizes
// (or the final 12 months of the hold if that is sooner).
func stabilizedNoi(cf cashflow, phases []phase) float64 {
	start := 0
	for _, ph := range phases {
		start = maxInt(start, ph.energize)
	}
	start = maxInt(0, minInt(start, cf.months-12))
	end := minInt(start+12, cf.months)
	var noi float64
	for t := start; t < end; t++ {
		noi += cf.revenue[t] - cf.opex[t] - cf.power[t]
	}
	return noi * 12 / float64(end-start)
}

func riskComponents(m *model) []riskComponent {
	site, comp := m.plan.GetSite(), m.plan.GetCompute()
	agility := agilityRiskAir
	switch comp.GetCooling() {
	case pb.CoolingMode_LIQUID_DTC:
		agility = agilityRiskLiquid
	case pb.CoolingMode_IMMERSION:
		agility = agilityRiskImmersion
	}
	if site.GetFloorLoadPsf() >= floorLoadLiquidMinPsf {
		agility -= agilityHighFloorBuys
	}
	return []riskComponent{
		{"timing", 100 - m.capture.capturePct()},
		{"power", powerRisk(m)},
		{"utilization", utilizationRisk(m)},
		{"agility", maxf(0, agility)},
		{"water", clamp(site.GetWaterStressIndex()*100, 0, 100)},
	}
}

// powerRisk is 100 when final firm supply cannot carry the final load, and falls linearly to zero
// at powerHeadroomTarget headroom.
func powerRisk(m *model) float64 {
	load := m.site.facilityMw
	supply := firmSupplyAt(m.srcs, m.months-1)
	if load <= 0 {
		return 0
	}
	if supply < load {
		return 100
	}
	return clamp((1-(supply-load)/load/powerHeadroomTarget)*100, 0, 100)
}

// utilizationRisk is how close the assumed utilization sits to breakeven (100 = at or below it);
// for colo it is the vacancy assumption itself.
func utilizationRisk(m *model) float64 {
	rev := m.plan.GetRevenue()
	if rev.GetMode() == pb.RevenueMode_COLO_LEASE {
		return clamp(rev.GetColo().GetVacancyPct(), 0, 100)
	}
	return clamp(m.summary.GetUtilizationBreakevenPct()/rev.GetCompute().GetUtilizationPct()*100, 0, 100)
}

func compositeRisk(cs []riskComponent) float64 {
	var sum float64
	for _, c := range cs {
		sum += c.score
	}
	return sum / float64(len(cs))
}

// buildSummary fills SummaryMetrics from the ledger; risk needs the breakeven so it is filled last.
func buildSummary(m *model, d *diags) {
	f := m.plan.GetFinance()
	s := &pb.SummaryMetrics{
		TotalCapex:               m.capex.total,
		CapexPerMw:               m.capex.total / m.site.itMw,
		Npv:                      npv(monthlyRate(f.GetDiscountRate()), m.cf.net),
		TimeToEnergizeMonths:     int32(m.phases[0].energize),
		MwOnlineFinal:            onlineItMw(m.phases, m.months-1),
		DemandCapturePct:         m.capture.capturePct(),
		StrandedCapacityMwMonths: m.capture.stranded,
		ShortfallMwMonths:        m.capture.shortfall,
		LcocPerGpuHour:           lcoc(m.pv),
		UtilizationBreakevenPct:  utilizationBreakeven(m.plan, m.pv),
		Extra: map[string]float64{
			"racks": float64(m.site.racks), "gpus": m.site.gpus, "facility_mw": m.site.facilityMw,
			"terminal_value": m.terminal, "pv_lifecycle_cost": m.pv.cost, "pv_gpu_hours": m.pv.gpuHours,
			"opex_total": sum(m.cf.opex), "power_cost_total": sum(m.cf.power), "revenue_total": sum(m.cf.revenue),
		},
	}
	for _, ph := range m.phases {
		s.TimeToEnergizeMonths = minInt32(s.TimeToEnergizeMonths, int32(ph.energize))
	}
	noi := stabilizedNoi(m.cf, m.phases)
	s.YieldOnCostPct = noi / m.capex.total * 100
	s.DevSpreadBps = (s.YieldOnCostPct - f.GetExitCapRate()*100) * 100
	if irrPct, ok := irr(m.cf.net); ok {
		s.UnleveredIrrPct = irrPct
	} else {
		d.infof(codeIrrUndefined, "finance.hold_period_months", "a sign change in net cashflow", "none", "extend the hold or check revenue assumptions",
			"IRR is undefined (net cashflow never changes sign); unlevered_irr_pct is reported as 0")
	}
	m.summary = s
	m.risk = riskComponents(m)
	s.CompositeRiskScore = compositeRisk(m.risk)
}

func sum(xs []float64) float64 {
	var s float64
	for _, x := range xs {
		s += x
	}
	return s
}

func clamp(x, lo, hi float64) float64 { return minf(maxf(x, lo), hi) }

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func minInt32(a, b int32) int32 {
	if a < b {
		return a
	}
	return b
}
