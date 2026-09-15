package core

import (
	"sort"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

// opexSeries holds each operating-cost line per month. power is the energy bill; the rest are opex.
type opexSeries struct {
	staffing, maintenance, insurance, mgmtFee, tax, power []float64
}

func (o opexSeries) opexAt(t int) float64 {
	return o.staffing[t] + o.maintenance[t] + o.insurance[t] + o.mgmtFee[t] + o.tax[t]
}

// buildOpex prices operations month by month. Staffing scales with energized IT MW; maintenance and
// insurance are a percentage of facility capex spent to date; property tax runs from t0 (the land is
// owned); the management fee is a share of revenue; power is dispatched cheapest-first.
func buildOpex(plan *pb.SitePlan, phases []phase, srcs []source, capex capexBuild, revenue []float64, months int) opexSeries {
	o := plan.GetCosts().GetOpex()
	s := opexSeries{
		staffing: make([]float64, months), maintenance: make([]float64, months), insurance: make([]float64, months),
		mgmtFee: make([]float64, months), tax: make([]float64, months), power: make([]float64, months),
	}
	facilitySpend := capex.monthly(months, facilityLine)
	var facilityToDate float64
	pue := plan.GetCompute().GetPue()
	for t := 0; t < months; t++ {
		facilityToDate += facilitySpend[t]
		it := onlineItMw(phases, t)
		s.staffing[t] = o.GetStaffingPerMwYr() * it / 12
		s.maintenance[t] = facilityToDate * o.GetMaintenancePctOfCapex() / 100 / 12
		s.insurance[t] = facilityToDate * o.GetInsurancePctOfCapex() / 100 / 12
		s.mgmtFee[t] = revenue[t] * o.GetMgmtFeePctOfEgr() / 100
		s.tax[t] = o.GetPropertyTaxPerYr() / 12
		s.power[t] = energyCost(srcs, it*pue, t)
	}
	return s
}

// energyCost dispatches the facility load across ready firm sources, cheapest first (ties by id).
func energyCost(srcs []source, loadMw float64, t int) float64 {
	ready := make([]source, 0, len(srcs))
	for _, s := range srcs {
		if s.firm && s.ready <= t {
			ready = append(ready, s)
		}
	}
	sort.Slice(ready, func(i, j int) bool {
		if ready[i].costPerMwh != ready[j].costPerMwh {
			return ready[i].costPerMwh < ready[j].costPerMwh
		}
		return ready[i].id < ready[j].id
	})
	var cost, remaining = 0.0, loadMw
	for _, s := range ready {
		mw := minf(remaining, s.capacityMw)
		cost += mw * hoursPerMonth * s.costPerMwh
		remaining -= mw
		if remaining <= 0 {
			break
		}
	}
	return cost
}

func minf(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

func maxf(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}
