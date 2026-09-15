// Package core is the pure analytical model: Analyze is a deterministic function of its input
// SitePlan with no I/O, no globals and no goroutines (see docs/engine-design.md and doc.go).
package core

import "github.com/nchim/ai-compute-planning/engine/pb"

// model is the working state of one analysis, filled in pipeline order.
type model struct {
	plan      *pb.SitePlan
	months    int
	srcs      []source
	phases    []phase
	site      sizing // whole-site totals
	capex     capexBuild
	opex      opexSeries
	rev       revenueSeries
	exit      exit
	cf        cashflow
	capture   captureStats
	pv        presentValues
	summary   *pb.SummaryMetrics
	risk      []riskComponent
	schematic *pb.Schematic
}

// Analyze evaluates a SitePlan and returns a Result. Model errors are diagnostics in the Result, never
// Go errors, so the agent can always read the correction channel. Any validation ERROR short-circuits
// with INVALID_INPUT; otherwise the full pipeline runs and conservation failures downgrade the status.
func Analyze(plan *pb.SitePlan) *pb.Result {
	d := validate(plan)
	if d.hasErrors() {
		return &pb.Result{Status: d.status(), Diagnostics: d}
	}
	m := build(plan, &d)
	report := conserve(m, &d)
	return &pb.Result{
		Status:       d.status(),
		Diagnostics:  d,
		Summary:      m.summary,
		Conservation: report,
		Tables:       renderTables(m),
		Charts:       renderCharts(m),
		Schematic:    m.schematic,
	}
}

// build runs sizing → schedule → capex → opex → revenue → cashflow → metrics → layout on a valid plan.
func build(plan *pb.SitePlan, d *diags) *model {
	m := &model{plan: plan, months: int(plan.GetFinance().GetHoldPeriodMonths())}
	m.srcs = newSources(plan.GetPower())
	noteNonFirmSources(m.srcs, d)
	m.phases = schedule(plan, m.srcs, m.months, d)
	for _, ph := range m.phases {
		m.site.add(ph.size)
	}
	m.capex = buildCapex(plan, m.phases, m.srcs, m.months)
	m.rev = buildRevenue(plan, m.phases, m.months)
	m.opex = buildOpex(plan, m.phases, m.srcs, m.capex, m.rev.revenue, m.months)
	m.exit = exitValue(m, d)
	m.cf = buildCashflow(m.capex, m.opex, m.rev, m.exit.value, m.months)
	m.capture = computeCapture(plan.GetDemand().GetPoints(), m.phases, m.months)
	m.pv = discount(m)
	buildSummary(m, d)
	m.schematic = layoutSchematic(m, d)
	return m
}

func noteNonFirmSources(srcs []source, d *diags) {
	for i, s := range srcs {
		if !s.firm {
			d.infof(codeStorageNotFirm, "power.sources["+num(float64(i))+"].type", "firm generation", s.typ.String(),
				"model storage as a separate firming study; it is ignored for supply and dispatch here",
				"STUB: power source %q is storage and is not counted as firm supply", s.id)
		}
	}
}
