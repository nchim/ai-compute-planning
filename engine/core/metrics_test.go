package core

import (
	"testing"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

func TestDemandAt(t *testing.T) {
	pts := []*pb.DemandPoint{{Month: 6, DemandMw: 40}, {Month: 18, DemandMw: 100}}
	cases := []struct {
		t    int
		want float64
	}{{0, 0}, {5, 0}, {6, 40}, {12, 70}, {18, 100}, {40, 100}}
	for _, tc := range cases {
		if got := DemandAt(pts, tc.t); !approxEq(got, tc.want, 1e-12) {
			t.Errorf("DemandAt(%d) = %g, want %g", tc.t, got, tc.want)
		}
	}
}

func TestCaptureIdentity(t *testing.T) {
	pts := []*pb.DemandPoint{{Month: 0, DemandMw: 100}}
	phases := []phase{{energize: 5, size: sizing{itMw: 60}}}
	c := computeCapture(pts, phases, 10)
	// 10 months of 100 MW demand; 60 MW online for months 5..9 → captured 300, shortfall 700, stranded 0.
	if c.demand != 1000 || c.captured != 300 || c.shortfall != 700 || c.stranded != 0 || !approxEq(c.capturePct(), 30, 1e-12) {
		t.Fatalf("capture = %+v", c)
	}
	if (captureStats{}).capturePct() != 100 {
		t.Fatal("no demand means nothing was missed")
	}
}

func TestGpuResidualFraction(t *testing.T) {
	curve := &pb.GpuCost{DepreciationYears: 5, ResidualCurve: []float64{0.8, 0.65, 0.5, 0.35, 0.2}}
	straight := &pb.GpuCost{DepreciationYears: 4}
	cases := []struct {
		g     *pb.GpuCost
		years int
		want  float64
	}{{curve, 0, 1}, {curve, 1, 0.8}, {curve, 4, 0.35}, {curve, 9, 0.2}, {straight, 1, 0.75}, {straight, 6, 0}}
	for _, tc := range cases {
		if got := gpuResidualFraction(tc.g, tc.years); !approxEq(got, tc.want, 1e-12) {
			t.Errorf("residual(%v, %d) = %g, want %g", tc.g.GetResidualCurve(), tc.years, got, tc.want)
		}
	}
}

func TestLcocDropsWhenPowerArrivesEarlier(t *testing.T) {
	base := Analyze(loadFixture(t)).GetSummary()
	early := loadFixture(t)
	early.Power.Sources[0].AvailableMonth = 18
	early.Power.Interconnection.GridEnergizeMonth = 18
	got := Analyze(early).GetSummary()
	if got.GetLcocPerGpuHour() >= base.GetLcocPerGpuHour() || got.GetDemandCapturePct() <= base.GetDemandCapturePct() {
		t.Fatalf("earlier power should lower LCOC and raise capture: base %+v, early %+v", base, got)
	}
	if got.GetTimeToEnergizeMonths() != 18 {
		t.Fatalf("time_to_energize = %d, want 18", got.GetTimeToEnergizeMonths())
	}
}

func TestRiskComponentsAreBounded(t *testing.T) {
	res := Analyze(loadFixture(t))
	if s := res.GetSummary().GetCompositeRiskScore(); s < 0 || s > 100 {
		t.Fatalf("composite risk %g out of 0..100", s)
	}
	radar := res.GetCharts()[4]
	if len(radar.GetSeries()[0].GetPoints()) != 5 {
		t.Fatalf("risk radar must have five components, got %d", len(radar.GetSeries()[0].GetPoints()))
	}
}
