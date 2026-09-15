package core

import (
	"testing"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

// COMPUTE_SALES bills energy at the utilized IT load (× PUE): halving utilization halves the bill.
func TestEnergyScalesWithUtilizationForComputeSales(t *testing.T) {
	full := loadFixture(t)
	half := loadFixture(t)
	half.Revenue.Compute.UtilizationPct = full.Revenue.Compute.UtilizationPct / 2
	powerFull := requireOK(t, Analyze(full)).GetSummary().GetExtra()["power_cost_total"]
	powerHalf := requireOK(t, Analyze(half)).GetSummary().GetExtra()["power_cost_total"]
	if !approxEq(powerHalf, powerFull/2, 1e-9) {
		t.Fatalf("power at half utilization = %g, want %g (half of %g)", powerHalf, powerFull/2, powerFull)
	}
}

// COLO_LEASE bills the leased load regardless of vacancy: the tenant's utilities are passed through
// on IT × PUE (A.CRE F153), so the engine's colo NOI reconciles with the workbook.
func TestEnergyIsLeasedLoadForColo(t *testing.T) {
	base := loadFixtureNamed(t, "nova-colo")
	vacant := loadFixtureNamed(t, "nova-colo")
	vacant.Revenue.Colo.VacancyPct = 50
	powerBase := requireOK(t, Analyze(base)).GetSummary().GetExtra()["power_cost_total"]
	powerVacant := requireOK(t, Analyze(vacant)).GetSummary().GetExtra()["power_cost_total"]
	if powerBase != powerVacant {
		t.Fatalf("colo power changed with vacancy: %g vs %g", powerBase, powerVacant)
	}
}

// At the reported breakeven utilization PV(revenue) = PV(cost): the breakeven accounts for energy
// and the management fee falling with utilization, not just revenue. Exact on abilene-1 (one power
// price); on epoch-100mw the load at breakeven crosses from the $88 grid tranche onto the $95 PPA,
// and cheapest-first dispatch makes energy piecewise-linear, so the residual is the kink (≪ 0.1%).
func TestUtilizationBreakevenIsExact(t *testing.T) {
	for name, tol := range map[string]float64{"abilene-1": 1e-9, "epoch-100mw": 1e-3} {
		t.Run(name, func(t *testing.T) {
			p := loadFixtureNamed(t, name)
			breakeven := requireOK(t, Analyze(p)).GetSummary().GetUtilizationBreakevenPct()
			p.Revenue.Compute.UtilizationPct = breakeven
			m := build(p, &diags{})
			if !approxEq(m.pv.revenue, m.pv.cost, tol) {
				t.Fatalf("at breakeven %.4g%%: PV(revenue) %.6g ≠ PV(cost) %.6g", breakeven, m.pv.revenue, m.pv.cost)
			}
		})
	}
}

func TestBreakevenModeGuards(t *testing.T) {
	if got := utilizationBreakeven(&pb.SitePlan{}, presentValues{}); got != 0 {
		t.Fatalf("no revenue → breakeven 0, got %g", got)
	}
}
