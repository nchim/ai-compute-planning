package core

import (
	"testing"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

// Colo escalation is a lease-anniversary step: each phase's rent starts at the base rate in its
// energize month and compounds once per lease year from there, not from t0 by calendar year.
func TestColoEscalationAnchorsAtEachPhaseEnergize(t *testing.T) {
	plan := &pb.SitePlan{Revenue: &pb.RevenueModel{Mode: pb.RevenueMode_COLO_LEASE,
		Colo: &pb.ColoTerms{RatePerKwMonth: 100, AnnualEscalationPct: 10, VacancyPct: 0}}}
	phases := []phase{
		{energize: 0, size: sizing{itMw: 1, gpus: 10}},
		{energize: 30, size: sizing{itMw: 2, gpus: 20}},
	}
	r := buildRevenue(plan, phases, 60)
	cases := []struct {
		t    int
		want float64
	}{
		{0, 1000 * 100},                           // phase 1 year 0
		{12, 1000 * 110},                          // phase 1 year 1
		{30, 1000*121 + 2000*100},                 // phase 2 starts at the base rate in year 2 of phase 1
		{42, 1000*133.1 + 2000*110},               // phase 2's first anniversary, phase 1's third
		{59, 1000*100*1.1*1.1*1.1*1.1 + 2000*121}, // both compounding on their own clocks
	}
	for _, tc := range cases {
		if !approxEq(r.revenue[tc.t], tc.want, 1e-9) {
			t.Errorf("revenue[%d] = %g, want %g", tc.t, r.revenue[tc.t], tc.want)
		}
	}
	if r.gpuHours[30] != 30*hoursPerMonth {
		t.Errorf("gpuHours[30] = %g, want %g", r.gpuHours[30], 30*hoursPerMonth)
	}
}
