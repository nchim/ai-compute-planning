package core

import "github.com/nchim/ai-compute-planning/engine/pb"

// Tolerances: relative 1e-6 for money/MW (scaled by the quantity), exact for counts and months.
const relTolerance = 1e-6

// conserve runs the 13 model-correctness invariants from docs/engine-design.md. A failed check is a bug
// in the model, not in the input, so it is reported as a WARNING diagnostic (status OK_WITH_WARNINGS)
// with the residual, never silently dropped.
func conserve(m *model, d *diags) *pb.ConservationReport {
	report := &pb.ConservationReport{AllPassed: true}
	for _, c := range checks(m) {
		c.Passed = absf(c.Residual) <= c.Tolerance
		report.Checks = append(report.Checks, c)
		if !c.Passed {
			report.AllPassed = false
			d.warnf(codeConservationFailed, "", "residual ≤ "+num(c.Tolerance), num(c.Residual), "report this as an engine bug; do not rely on this Result's numbers",
				"conservation check %q failed (residual %g)", c.Name, c.Residual)
		}
	}
	return report
}

func checks(m *model) []*pb.ConservationCheck {
	money := relTolerance * maxf(1, m.capex.total)
	mw := relTolerance * maxf(1, m.site.facilityMw)
	return []*pb.ConservationCheck{
		{Name: "capital_components_sum", Residual: sumOf(m.capex.byComponent()) - m.capex.total, Tolerance: money},
		{Name: "capital_phases_sum", Residual: sumOf(m.capex.byPhase()) - m.capex.total, Tolerance: money},
		// STUB: 100% equity, no debt; uses = total capex.
		{Name: "capital_uses_eq_sources", Residual: equity(m) - m.capex.total, Tolerance: money},
		{Name: "land_footprint_le_parcel", Residual: maxf(0, blockAcres(m.schematic)-m.plan.GetSite().GetLandAcres()), Tolerance: relTolerance * m.plan.GetSite().GetLandAcres()},
		{Name: "whitespace_le_gross", Residual: maxf(0, m.site.whitespaceSqft-m.site.grossSqft), Tolerance: 0},
		{Name: "power_load_eq_racks", Residual: m.site.itMw - float64(m.site.racks)*m.plan.GetCompute().GetKwPerRack()/1000, Tolerance: mw},
		{Name: "facility_power_pue", Residual: m.site.facilityMw - m.site.itMw*m.plan.GetCompute().GetPue(), Tolerance: mw},
		{Name: "power_supply_ge_demand_t", Residual: worstUndersupply(m), Tolerance: mw},
		{Name: "cooling_ge_heat", Residual: maxf(0, m.site.heatKw-m.site.coolingKw), Tolerance: mw * 1000},
		{Name: "schedule_energize_consistency", Residual: energizeResidual(m), Tolerance: 0},
		{Name: "phase_precedence", Residual: precedenceResidual(m.phases), Tolerance: 0},
		{Name: "mw_online_monotonic", Residual: monotonicResidual(m), Tolerance: mw},
		{Name: "demand_capture_identity", Residual: captureResidual(m), Tolerance: relTolerance},
	}
}

func sumOf(keys []string, byKey map[string]float64) float64 {
	var s float64
	for _, k := range keys {
		s += byKey[k]
	}
	return s
}

func equity(m *model) float64 { return m.capex.total }

// blockAcres is the land committed: every block except expansion pads (which are the remainder).
func blockAcres(s *pb.Schematic) float64 {
	var sqm float64
	for _, b := range s.GetBlocks() {
		if b.GetKind() != pb.BlockKind_EXPANSION_PAD {
			sqm += b.GetWM() * b.GetHM()
		}
	}
	return sqm / sqmPerAcre
}

// worstUndersupply is the largest MW by which energized load exceeds firm supply in any month.
func worstUndersupply(m *model) float64 {
	var worst float64
	for t := 0; t < m.months; t++ {
		worst = maxf(worst, onlineItMw(m.phases, t)*m.plan.GetCompute().GetPue()-firmSupplyAt(m.srcs, t))
	}
	return worst
}

// energizeResidual is the month-count by which any phase's energize differs from
// max(power_ready, construction_ready), plus 1 if revenue precedes the first energization.
func energizeResidual(m *model) float64 {
	var r float64
	for _, ph := range m.phases {
		r += absf(float64(ph.energize - maxInt(ph.powerReady, ph.constructionReady)))
	}
	for t := 0; t < m.months && t < int(m.summary.GetTimeToEnergizeMonths()); t++ {
		if m.cf.revenue[t] != 0 {
			return r + 1
		}
	}
	return r
}

// precedenceResidual counts phases that energize before they start or before their predecessor.
func precedenceResidual(phases []phase) float64 {
	var r float64
	for i, ph := range phases {
		if ph.energize < ph.startMonth {
			r++
		}
		if i > 0 && ph.energize < phases[i-1].energize {
			r++
		}
	}
	return r
}

// monotonicResidual is any month-over-month drop in online MW plus any excess over the sized total.
func monotonicResidual(m *model) float64 {
	var r float64
	for t := 1; t < m.months; t++ {
		r += maxf(0, onlineItMw(m.phases, t-1)-onlineItMw(m.phases, t))
	}
	return r + maxf(0, onlineItMw(m.phases, m.months-1)-m.site.itMw)
}

// captureResidual recomputes capture from the raw series and checks it is a fraction in [0,1].
func captureResidual(m *model) float64 {
	c := computeCapture(m.plan.GetDemand().GetPoints(), m.phases, m.months)
	frac := m.summary.GetDemandCapturePct() / 100
	if frac < 0 || frac > 1 {
		return 1
	}
	return absf(c.capturePct()/100 - frac)
}
