package core

import "github.com/nchim/ai-compute-planning/engine/pb"

// demandAt interpolates the ramp linearly between points; zero before the first point, flat after the
// last. Linear is the least-surprising reading of "stepwise or interpolated" for a monthly grid.
func demandAt(points []*pb.DemandPoint, t int) float64 {
	if len(points) == 0 || t < int(points[0].GetMonth()) {
		return 0
	}
	for i := 1; i < len(points); i++ {
		a, b := points[i-1], points[i]
		if t <= int(b.GetMonth()) {
			frac := float64(t-int(a.GetMonth())) / float64(b.GetMonth()-a.GetMonth())
			return a.GetDemandMw() + frac*(b.GetDemandMw()-a.GetDemandMw())
		}
	}
	return points[len(points)-1].GetDemandMw()
}

// captureStats are the MW-month integrals behind demand-capture, shortfall and stranding.
type captureStats struct {
	demand, captured, shortfall, stranded float64
}

func computeCapture(points []*pb.DemandPoint, phases []phase, months int) captureStats {
	var c captureStats
	for t := 0; t < months; t++ {
		dem, cap := demandAt(points, t), onlineItMw(phases, t)
		c.demand += dem
		c.captured += minf(dem, cap)
		c.shortfall += maxf(dem-cap, 0)
		c.stranded += maxf(cap-dem, 0)
	}
	return c
}

// capturePct is ∫min(demand,capacity)/∫demand as a whole percent; 100 when there is no demand to miss.
func (c captureStats) capturePct() float64 {
	if c.demand <= 0 {
		return 100
	}
	return c.captured / c.demand * 100
}
