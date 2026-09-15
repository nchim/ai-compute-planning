package core

import (
	"testing"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

func TestCapexFixtureComponents(t *testing.T) {
	p := loadFixture(t)
	var d diags
	srcs := newSources(p.Power)
	phases := schedule(p, srcs, 84, &d)
	b := buildCapex(p, phases, srcs, 84)
	_, by := b.byComponent()
	want := map[string]float64{
		compShell: 600e6, compElec: 800e6, compCooling: 400e6, compNetwork: 200e6,
		compPower: 400 * 260 * 1000, compLand: 400 * 50000, compGpu: 5000 * 22 * 40000,
	}
	for k, v := range want {
		if !approxEq(by[k], v, 1e-9) {
			t.Errorf("%s = %g, want %g", k, by[k], v)
		}
	}
	if _, ok := by[compAgility]; ok {
		t.Error("air-cooled 250 psf design must not carry an agility premium")
	}
	if !approxEq(b.total, 6.524e9, 1e-9) {
		t.Errorf("total = %g, want 6.524e9", b.total)
	}
	if got := b.monthly(84, gpuLine); got[30] != want[compGpu] {
		t.Errorf("GPUs must be bought at energize (m30), got %v", got[30])
	}
}

func TestCapexAgilityPremiumAndColo(t *testing.T) {
	p := loadFixture(t)
	p.Compute.Cooling = pb.CoolingMode_LIQUID_DTC
	p.Compute.KwPerRack = 130
	p.Site.FloorLoadPsf = 300
	p.Revenue = &pb.RevenueModel{Mode: pb.RevenueMode_COLO_LEASE, Colo: &pb.ColoTerms{RatePerKwMonth: 150}}
	var d diags
	srcs := newSources(p.Power)
	phases := schedule(p, srcs, 84, &d)
	_, by := buildCapex(p, phases, srcs, 84).byComponent()
	mw := phases[0].size.itMw
	if want := 0.12 * (3e6 + 4e6 + 2e6) * mw; !approxEq(by[compAgility], want, 1e-9) {
		t.Errorf("agility premium = %g, want %g", by[compAgility], want)
	}
	if _, ok := by[compGpu]; ok {
		t.Error("colo tenants buy their own GPUs; no GPU capex line expected")
	}
}
