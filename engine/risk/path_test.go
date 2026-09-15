package risk

import (
	"strings"
	"testing"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

func TestSetNumeric(t *testing.T) {
	cases := []struct {
		path string
		v    float64
		got  func(t *testing.T, p *pb.SitePlan) float64
	}{
		{"revenue.compute.gpu_hour_price", 3.5, func(t *testing.T, p *pb.SitePlan) float64 { return p.GetRevenue().GetCompute().GetGpuHourPrice() }},
		{"costs.gpu.depreciation_years", 4.4, func(t *testing.T, p *pb.SitePlan) float64 {
			return float64(p.GetCosts().GetGpu().GetDepreciationYears())
		}},
		{"costs.gpu.depreciation_years", 4.6, func(t *testing.T, p *pb.SitePlan) float64 {
			return float64(p.GetCosts().GetGpu().GetDepreciationYears())
		}},
		{"power.sources[0].available_month", 18.2, func(t *testing.T, p *pb.SitePlan) float64 {
			return float64(p.GetPower().GetSources()[0].GetAvailableMonth())
		}},
		{"costs.gpu.residual_curve[1]", 0.5, func(t *testing.T, p *pb.SitePlan) float64 { return p.GetCosts().GetGpu().GetResidualCurve()[1] }}, // indexed scalar list
		{"run.monte_carlo.seed", 7, func(t *testing.T, p *pb.SitePlan) float64 { return float64(p.GetRun().GetMonteCarlo().GetSeed()) }},
	}
	for _, c := range cases {
		t.Run(c.path, func(t *testing.T) {
			plan := loadFixture(t)
			plan.Costs.Gpu.ResidualCurve = []float64{0.8, 0.65} // the fixture has no curve (straight-line); give the indexed case one
			if err := SetNumeric(plan, c.path, c.v); err != nil {
				t.Fatal(err)
			}
			want := c.v
			if strings.Contains(c.path, "years") || strings.Contains(c.path, "month") || strings.Contains(c.path, "seed") {
				want = float64(int(c.v + 0.5)) // integer targets are rounded
			}
			if got := c.got(t, plan); got != want {
				t.Fatalf("after set: %g, want %g", got, want)
			}
			if got, err := GetNumeric(plan, c.path); err != nil || got != want {
				t.Fatalf("GetNumeric = %g, %v; want %g", got, err, want)
			}
		})
	}
}

func TestSetNumericUnsetIntermediate(t *testing.T) {
	plan := loadFixture(t)
	plan.Revenue.Colo = nil
	if err := SetNumeric(plan, "revenue.colo.vacancy_pct", 5); err != nil {
		t.Fatal(err)
	}
	if got := plan.GetRevenue().GetColo().GetVacancyPct(); got != 5 {
		t.Fatalf("vacancy_pct = %g, want 5", got)
	}
}

func TestSetNumericErrors(t *testing.T) {
	cases := []struct {
		path      string
		wantKnown string // a field name the error must list as known
	}{
		{"", "revenue"},
		{"revenue.compute.gpu_price", "gpu_hour_price"},
		{"revenue.gpu_hour_price", "compute"},
		{"nope.x", "revenue"},
		{"meta.site_name", "plan_id"},               // not numeric
		{"revenue.compute", "gpu_hour_price"},       // message, not a leaf
		{"power.sources.capacity_mw", "sources"},    // list needs an index
		{"power.sources[3].capacity_mw", "sources"}, // out of range
		{"power.sources[x].capacity_mw", "sources"}, // bad index
		{"costs.gpu.residual_curve", "unit_cost"},   // scalar list needs an index
		{"revenue.mode", "compute"},                 // enum
		{"site.location.lat.x", "lat"},              // scalar used as message
	}
	for _, c := range cases {
		t.Run(c.path, func(t *testing.T) {
			err := SetNumeric(loadFixture(t), c.path, 1)
			if err == nil {
				t.Fatal("expected an error")
			}
			pe, ok := err.(*PathError)
			if !ok {
				t.Fatalf("error is %T, want *PathError", err)
			}
			if !strings.Contains(strings.Join(pe.Known, ","), c.wantKnown) {
				t.Fatalf("known fields %v do not list %q (err: %v)", pe.Known, c.wantKnown, err)
			}
		})
	}
}
