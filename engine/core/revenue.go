package core

import (
	"math"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

// revenueSeries is monthly revenue plus the GPU-hours actually delivered (the LCOC denominator).
type revenueSeries struct {
	revenue  []float64
	gpuHours []float64
}

// buildRevenue prices each month's energized capacity. COMPUTE_SALES: GPUs × utilization × hours ×
// a price that decays continuously from t0. COLO_LEASE: $/kW-month on each phase's IT kW net of
// vacancy, escalating on the phase's lease anniversaries (its energize month is the lease start);
// delivered GPU-hours for LCOC are the leased capacity's hours.
func buildRevenue(plan *pb.SitePlan, phases []phase, months int) revenueSeries {
	r := revenueSeries{revenue: make([]float64, months), gpuHours: make([]float64, months)}
	rev := plan.GetRevenue()
	for t := 0; t < months; t++ {
		switch rev.GetMode() {
		case pb.RevenueMode_COMPUTE_SALES:
			c := rev.GetCompute()
			price := c.GetGpuHourPrice() * math.Pow(1-c.GetPriceDecayPctYr()/100, float64(t)/12)
			r.gpuHours[t] = onlineGpus(phases, t) * c.GetUtilizationPct() / 100 * hoursPerMonth
			r.revenue[t] = r.gpuHours[t] * price
		case pb.RevenueMode_COLO_LEASE:
			c := rev.GetColo()
			occupancy := 1 - c.GetVacancyPct()/100
			for _, ph := range phases {
				if ph.energize > t {
					continue
				}
				rate := c.GetRatePerKwMonth() * annualStep(c.GetAnnualEscalationPct(), t-ph.energize)
				r.gpuHours[t] += ph.size.gpus * occupancy * hoursPerMonth
				r.revenue[t] += ph.size.itMw * 1000 * occupancy * rate
			}
		}
	}
	return r
}

// annualStep is the compounding factor after `elapsed` months at pct per year, stepping once per
// whole year (an anniversary escalation, not continuous growth); 1 before the anchor month.
func annualStep(pct float64, elapsed int) float64 {
	if elapsed < 0 {
		return 1
	}
	return math.Pow(1+pct/100, float64(elapsed/12))
}

// firstEnergize is the month operations start: the earliest phase energization.
func firstEnergize(phases []phase) int {
	first := phases[0].energize
	for _, ph := range phases[1:] {
		first = minInt(first, ph.energize)
	}
	return first
}

func onlineGpus(phases []phase, t int) float64 {
	var n float64
	for _, ph := range phases {
		if ph.energize <= t {
			n += ph.size.gpus
		}
	}
	return n
}
