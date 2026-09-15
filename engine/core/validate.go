package core

import (
	"fmt"
	"strings"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

const maxHoldMonths = 600

// validate returns every input problem it can find. Structural problems (missing blocks, values out of
// range) are collected first; the semantic checks (density, floor load, phases vs. power, footprint)
// need those values to be sane, so they run only when the structure is clean.
func validate(plan *pb.SitePlan) diags {
	var d diags
	validateStructure(plan, &d)
	if d.hasErrors() {
		return d
	}
	validateDensity(plan.GetCompute().GetKwPerRack(), plan.GetCompute().GetCooling(), plan.GetSite().GetFloorLoadPsf(), "compute", &d)
	validatePhasing(plan, &d)
	return d
}

func validateStructure(plan *pb.SitePlan, d *diags) {
	if plan.GetRun().GetMode() == pb.RunMode_RUN_OPTIMIZE {
		d.errorf(codeUseOptimize, "run.mode", "RUN_ANALYZE", "RUN_OPTIMIZE",
			"call Optimize for RUN_OPTIMIZE, or set run.mode=RUN_ANALYZE", "Analyze does not run the optimizer")
	}
	validateSite(plan.GetSite(), d)
	validateCompute(plan.GetCompute(), d)
	validatePower(plan.GetPower(), d)
	validateDemand(plan.GetDemand(), d)
	validateCosts(plan.GetCosts(), d)
	validateRevenue(plan.GetRevenue(), d)
	validateFinance(plan.GetFinance(), d)
	validatePhasingStructure(plan.GetPhasing(), d)
}

func validateSite(s *pb.Site, d *diags) {
	if s == nil {
		missing(d, "site")
		return
	}
	positive(d, "site.land_acres", s.GetLandAcres())
	positive(d, "site.usable_acres", s.GetUsableAcres())
	positive(d, "site.floor_load_psf", s.GetFloorLoadPsf())
	if s.GetUsableAcres() > s.GetLandAcres() {
		d.errorf(codeOutOfRange, "site.usable_acres", fmt.Sprintf("≤ land_acres (%g)", s.GetLandAcres()),
			num(s.GetUsableAcres()), "usable acres cannot exceed the parcel", "usable_acres exceeds land_acres")
	}
	within(d, "site.water_stress_index", s.GetWaterStressIndex(), 0, 1)
}

func validateCompute(c *pb.ComputeSpec, d *diags) {
	if c == nil {
		missing(d, "compute")
		return
	}
	positive(d, "compute.gpus_per_rack", c.GetGpusPerRack())
	positive(d, "compute.kw_per_rack", c.GetKwPerRack())
	positive(d, "compute.target_it_load_mw", c.GetTargetItLoadMw())
	if c.GetPue() < 1 {
		d.errorf(codeOutOfRange, "compute.pue", "≥ 1.0", num(c.GetPue()), "typical AI facilities run PUE 1.1–1.4", "pue must be ≥ 1")
	}
	if c.GetCooling() == pb.CoolingMode_COOLING_UNSPECIFIED {
		missing(d, "compute.cooling")
	}
}

func validatePower(p *pb.PowerPlan, d *diags) {
	if len(p.GetSources()) == 0 {
		missing(d, "power.sources")
		return
	}
	seen := map[string]bool{}
	for i, s := range p.GetSources() {
		path := fmt.Sprintf("power.sources[%d]", i)
		if s.GetId() == "" {
			missing(d, path+".id")
		} else if seen[s.GetId()] {
			d.errorf(codeOutOfRange, path+".id", "unique id", s.GetId(), "give each power source a distinct id", "duplicate power source id %q", s.GetId())
		}
		seen[s.GetId()] = true
		if s.GetType() == pb.PowerType_POWER_UNSPECIFIED {
			missing(d, path+".type")
		}
		positive(d, path+".capacity_mw", s.GetCapacityMw())
		nonNegative(d, path+".available_month", float64(s.GetAvailableMonth()))
		nonNegative(d, path+".cost_per_mwh", s.GetCostPerMwh())
		nonNegative(d, path+".capex_per_kw", s.GetCapexPerKw())
		nonNegative(d, path+".lead_time_months", float64(s.GetLeadTimeMonths()))
	}
	ic := p.GetInterconnection()
	nonNegative(d, "power.interconnection.grid_energize_month", float64(ic.GetGridEnergizeMonth()))
	nonNegative(d, "power.interconnection.transformer_lead_months", float64(ic.GetTransformerLeadMonths()))
}

func validateDemand(dm *pb.DemandRamp, d *diags) {
	if len(dm.GetPoints()) == 0 {
		missing(d, "demand.points")
		return
	}
	prev := int32(-1)
	for i, p := range dm.GetPoints() {
		path := fmt.Sprintf("demand.points[%d]", i)
		nonNegative(d, path+".demand_mw", p.GetDemandMw())
		if p.GetMonth() <= prev {
			d.errorf(codeOutOfRange, path+".month", fmt.Sprintf("> %d", prev), num(float64(p.GetMonth())),
				"order demand points by strictly increasing month", "demand points must be strictly increasing in month")
		}
		prev = p.GetMonth()
	}
}

func validateCosts(c *pb.CostModel, d *diags) {
	if c == nil {
		missing(d, "costs")
		return
	}
	nonNegative(d, "costs.shell_capex_per_mw", c.GetShellCapexPerMw())
	nonNegative(d, "costs.electrical_capex_per_mw", c.GetElectricalCapexPerMw())
	nonNegative(d, "costs.cooling_capex_per_mw", c.GetCoolingCapexPerMw())
	nonNegative(d, "costs.network_capex_per_mw", c.GetNetworkCapexPerMw())
	nonNegative(d, "costs.land_capex_per_acre", c.GetLandCapexPerAcre())
	percent(d, "costs.agility_premium_pct", c.GetAgilityPremiumPct())
	if c.GetGpu() == nil {
		missing(d, "costs.gpu")
	} else {
		nonNegative(d, "costs.gpu.unit_cost", c.GetGpu().GetUnitCost())
		positive(d, "costs.gpu.depreciation_years", float64(c.GetGpu().GetDepreciationYears()))
		for i, r := range c.GetGpu().GetResidualCurve() {
			within(d, fmt.Sprintf("costs.gpu.residual_curve[%d]", i), r, 0, 1)
		}
	}
	o := c.GetOpex()
	nonNegative(d, "costs.opex.staffing_per_mw_yr", o.GetStaffingPerMwYr())
	percent(d, "costs.opex.maintenance_pct_of_capex", o.GetMaintenancePctOfCapex())
	percent(d, "costs.opex.insurance_pct_of_capex", o.GetInsurancePctOfCapex())
	percent(d, "costs.opex.mgmt_fee_pct_of_egr", o.GetMgmtFeePctOfEgr())
	nonNegative(d, "costs.opex.property_tax_per_yr", o.GetPropertyTaxPerYr())
}

func validateRevenue(r *pb.RevenueModel, d *diags) {
	switch r.GetMode() {
	case pb.RevenueMode_COLO_LEASE:
		if r.GetColo() == nil {
			missing(d, "revenue.colo")
			return
		}
		positive(d, "revenue.colo.rate_per_kw_month", r.GetColo().GetRatePerKwMonth())
		percent(d, "revenue.colo.annual_escalation_pct", r.GetColo().GetAnnualEscalationPct())
		percent(d, "revenue.colo.vacancy_pct", r.GetColo().GetVacancyPct())
	case pb.RevenueMode_COMPUTE_SALES:
		if r.GetCompute() == nil {
			missing(d, "revenue.compute")
			return
		}
		positive(d, "revenue.compute.gpu_hour_price", r.GetCompute().GetGpuHourPrice())
		positive(d, "revenue.compute.utilization_pct", r.GetCompute().GetUtilizationPct())
		percent(d, "revenue.compute.utilization_pct", r.GetCompute().GetUtilizationPct())
		percent(d, "revenue.compute.price_decay_pct_yr", r.GetCompute().GetPriceDecayPctYr())
	default:
		missing(d, "revenue.mode")
	}
}

func validateFinance(f *pb.FinanceParams, d *diags) {
	if f == nil {
		missing(d, "finance")
		return
	}
	within(d, "finance.discount_rate", f.GetDiscountRate(), 0, 0.99)
	within(d, "finance.hold_period_months", float64(f.GetHoldPeriodMonths()), 1, maxHoldMonths)
	within(d, "finance.exit_cap_rate", f.GetExitCapRate(), 0, 1)
}

func validatePhasingStructure(p *pb.Phasing, d *diags) {
	switch p.GetMode() {
	case pb.PhasingMode_SINGLE_SHOT:
	case pb.PhasingMode_EXPLICIT:
		if len(p.GetPhases()) == 0 {
			missing(d, "phasing.phases")
		}
		for i, ph := range p.GetPhases() {
			path := fmt.Sprintf("phasing.phases[%d]", i)
			if ph.GetId() == "" {
				missing(d, path+".id")
			}
			positive(d, path+".it_load_mw", ph.GetItLoadMw())
			nonNegative(d, path+".start_month", float64(ph.GetStartMonth()))
			nonNegative(d, path+".footprint_acres", ph.GetFootprintAcres())
			if ph.GetEnergizeMonth() < ph.GetStartMonth() {
				d.errorf(codeOutOfRange, path+".energize_month", fmt.Sprintf("≥ start_month (%d)", ph.GetStartMonth()),
					num(float64(ph.GetEnergizeMonth())), "a phase cannot energize before construction starts", "phase %q energizes before it starts", ph.GetId())
			}
		}
	case pb.PhasingMode_OPTIMIZE:
		d.errorf(codeUseOptimize, "phasing.mode", "SINGLE_SHOT or EXPLICIT", "OPTIMIZE",
			"call Optimize (run.mode=RUN_OPTIMIZE) to let the optimizer design phases, or supply explicit phases",
			"phasing.mode=OPTIMIZE is handled by Optimize, not Analyze")
	default:
		missing(d, "phasing.mode")
	}
}

// validateDensity checks that the cooling mode carries the rack density and the slab carries the
// cooling mode the density *requires* (not merely the declared one), so an air-cooled 130 kW/rack
// plan surfaces both problems at once. pathPrefix is "compute" or "phasing.phases[i]".
func validateDensity(kwPerRack float64, cooling pb.CoolingMode, floorPsf float64, pathPrefix string, d *diags) {
	if ceiling := coolingCeilingKw(cooling); kwPerRack > ceiling {
		d.errorf(codeDensityExceedsCooling, "compute.kw_per_rack",
			fmt.Sprintf("≤ %g kW/rack for %s", ceiling, cooling.String()), num(kwPerRack)+" kW/rack",
			fmt.Sprintf("set %s.cooling=%s (ceiling %g kW/rack) or lower kw_per_rack to ≤ %g", pathPrefix, requiredCooling(kwPerRack).String(), coolingCeilingKw(requiredCooling(kwPerRack)), ceiling),
			"rack density %g kW exceeds the %g kW/rack ceiling of %s cooling", kwPerRack, ceiling, cooling.String())
	}
	need := requiredFloorLoadPsf(cooling)
	if byDensity := requiredFloorLoadPsf(requiredCooling(kwPerRack)); byDensity > need {
		need = byDensity
	}
	if floorPsf < need {
		d.errorf(codeFloorLoadInsufficient, "site.floor_load_psf", fmt.Sprintf("≥ %g psf", need), num(floorPsf)+" psf",
			fmt.Sprintf("raise site.floor_load_psf to ≥ %g (liquid-class racks need ~15 kN/m²) and budget costs.agility_premium_pct", need),
			"floor load %g psf is below the %g psf a %g kW/rack design needs", floorPsf, need, kwPerRack)
	}
}

// validatePhasing checks phases against power readiness, pooled supply and the parcel.
func validatePhasing(plan *pb.SitePlan, d *diags) {
	srcs := newSources(plan.GetPower())
	c := plan.GetCompute()
	hold := int(plan.GetFinance().GetHoldPeriodMonths())
	var cumLoad, footprint float64
	if plan.GetPhasing().GetMode() == pb.PhasingMode_SINGLE_SHOT {
		need := c.GetTargetItLoadMw() * c.GetPue()
		if _, ok := firstMonthCovering(srcs, need, hold); !ok {
			d.errorf(codePowerUndersupply, "power.sources", fmt.Sprintf("≥ %.1f MW firm supply within the %d-month hold", need, hold),
				fmt.Sprintf("%.1f MW", firmSupplyAt(srcs, hold-1)), "add a power source (e.g. BTM gas) or lower target_it_load_mw",
				"firm supply never covers the %.1f MW facility load within the hold", need)
		}
		footprint = sizePhase(c.GetTargetItLoadMw(), c.GetKwPerRack(), c.GetGpusPerRack(), c.GetPue(), c.GetCooling()).footprintAcres
		validateFootprint(footprint, plan.GetSite().GetUsableAcres(), d)
		return
	}
	byID := sourceIndex(srcs)
	prevEnergize := int32(0)
	for i, ph := range plan.GetPhasing().GetPhases() {
		path := fmt.Sprintf("phasing.phases[%d]", i)
		if ph.GetCooling() != pb.CoolingMode_COOLING_UNSPECIFIED && ph.GetCooling() != c.GetCooling() {
			validateDensity(c.GetKwPerRack(), ph.GetCooling(), plan.GetSite().GetFloorLoadPsf(), path, d)
		}
		if ph.GetEnergizeMonth() < prevEnergize {
			d.errorf(codeOutOfRange, path+".energize_month", fmt.Sprintf("≥ %d (previous phase)", prevEnergize), num(float64(ph.GetEnergizeMonth())),
				"list phases in energization order", "phase %q energizes before the previous phase", ph.GetId())
		}
		prevEnergize = ph.GetEnergizeMonth()
		cumLoad += ph.GetItLoadMw() * c.GetPue()
		validatePhasePower(ph, path, srcs, byID, cumLoad, d)
		footprint += phaseFootprint(ph, c)
	}
	validateFootprint(footprint, plan.GetSite().GetUsableAcres(), d)
	if sum, target := phaseMwSum(plan), c.GetTargetItLoadMw(); !approxEq(sum, target, 1e-6) {
		d.warnf(codePhasesNeTarget, "compute.target_it_load_mw", fmt.Sprintf("Σ phases = %.1f MW", sum), fmt.Sprintf("%.1f MW", target),
			"align target_it_load_mw with the phase sizes; sizing follows the phases", "phases sum to %.1f MW, target is %.1f MW", sum, target)
	}
}

func validatePhasePower(ph *pb.Phase, path string, srcs []source, byID map[string]source, cumLoad float64, d *diags) {
	if id := ph.GetPowerSourceId(); id != "" {
		src, ok := byID[id]
		if !ok {
			d.errorf(codeUnknownPowerSource, path+".power_source_id", "one of "+strings.Join(sourceIDs(srcs), ", "), id,
				"reference an id from power.sources", "phase %q references unknown power source %q", ph.GetId(), id)
		} else if int(ph.GetEnergizeMonth()) < src.ready {
			d.errorf(codePhaseBeforePower, path+".energize_month", fmt.Sprintf("≥ m%d (%s ready)", src.ready, id), fmt.Sprintf("m%d", ph.GetEnergizeMonth()),
				fmt.Sprintf("delay phase %q to m%d or use an earlier source (e.g. BTM gas)", ph.GetId(), src.ready),
				"phase %q energizes at m%d but power source %q is ready at m%d", ph.GetId(), ph.GetEnergizeMonth(), id, src.ready)
		}
	}
	if avail := firmSupplyAt(srcs, int(ph.GetEnergizeMonth())); avail < cumLoad-1e-9 {
		d.errorf(codePowerUndersupply, path+".energize_month", fmt.Sprintf("≥ %.1f MW by m%d", cumLoad, ph.GetEnergizeMonth()), fmt.Sprintf("%.1f MW", avail),
			fmt.Sprintf("delay phase %q until supply reaches %.1f MW or add a BTM gas source", ph.GetId(), cumLoad),
			"phase %q energizes at m%d but only %.1f MW is available vs %.1f MW cumulative facility load", ph.GetId(), ph.GetEnergizeMonth(), avail, cumLoad)
	}
}

func validateFootprint(footprint, usable float64, d *diags) {
	if footprint > usable {
		d.errorf(codeFootprintOverParcel, "site.usable_acres", fmt.Sprintf("≥ %.1f acres", footprint), fmt.Sprintf("%.1f acres", usable),
			"reduce phase footprints, raise density, or acquire more land", "the build needs %.1f acres but only %.1f usable acres are available", footprint, usable)
	}
}

// phaseFootprint is the caller's footprint when given, else the sized footprint at the site density.
func phaseFootprint(ph *pb.Phase, c *pb.ComputeSpec) float64 {
	if ph.GetFootprintAcres() > 0 {
		return ph.GetFootprintAcres()
	}
	return sizePhase(ph.GetItLoadMw(), c.GetKwPerRack(), c.GetGpusPerRack(), c.GetPue(), c.GetCooling()).footprintAcres
}

func phaseMwSum(plan *pb.SitePlan) float64 {
	var sum float64
	for _, ph := range plan.GetPhasing().GetPhases() {
		sum += ph.GetItLoadMw()
	}
	return sum
}

// --- small assertion helpers -------------------------------------------------------------------

func missing(d *diags, path string) {
	d.errorf(codeMissingRequired, path, "present", "missing", "set "+path, "%s is required", path)
}

func positive(d *diags, path string, v float64) {
	if v <= 0 {
		d.errorf(codeOutOfRange, path, "> 0", num(v), "set "+path+" to a positive value", "%s must be positive", path)
	}
}

func nonNegative(d *diags, path string, v float64) {
	if v < 0 {
		d.errorf(codeOutOfRange, path, "≥ 0", num(v), "set "+path+" to zero or a positive value", "%s must not be negative", path)
	}
}

func percent(d *diags, path string, v float64) { within(d, path, v, 0, 100) }

func within(d *diags, path string, v, lo, hi float64) {
	if v < lo || v > hi {
		d.errorf(codeOutOfRange, path, fmt.Sprintf("%g..%g", lo, hi), num(v), fmt.Sprintf("set %s within %g..%g", path, lo, hi), "%s is out of range", path)
	}
}

func num(v float64) string { return fmt.Sprintf("%g", v) }

func approxEq(a, b, rel float64) bool {
	scale := 1.0
	if s := absf(a); s > scale {
		scale = s
	}
	return absf(a-b) <= rel*scale
}

func absf(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}
