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
// a price that decays continuously from t0. COLO_LEASE: $/kW-month on energized IT kW net of vacancy,
// escalating once per anniversary; delivered GPU-hours for LCOC are the leased capacity's hours.
func buildRevenue(plan *pb.SitePlan, phases []phase, months int) revenueSeries {
	r := revenueSeries{revenue: make([]float64, months), gpuHours: make([]float64, months)}
	rev := plan.GetRevenue()
	for t := 0; t < months; t++ {
		gpus, it := onlineGpus(phases, t), onlineItMw(phases, t)
		switch rev.GetMode() {
		case pb.RevenueMode_COMPUTE_SALES:
			c := rev.GetCompute()
			price := c.GetGpuHourPrice() * math.Pow(1-c.GetPriceDecayPctYr()/100, float64(t)/12)
			r.gpuHours[t] = gpus * c.GetUtilizationPct() / 100 * hoursPerMonth
			r.revenue[t] = r.gpuHours[t] * price
		case pb.RevenueMode_COLO_LEASE:
			c := rev.GetColo()
			occupancy := 1 - c.GetVacancyPct()/100
			rate := c.GetRatePerKwMonth() * math.Pow(1+c.GetAnnualEscalationPct()/100, float64(t/12))
			r.gpuHours[t] = gpus * occupancy * hoursPerMonth
			r.revenue[t] = it * 1000 * occupancy * rate
		}
	}
	return r
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
