package core

import (
	"testing"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

// COLO_LEASE exits on income: NOI over the final year of the hold capitalized at exit_cap_rate. Both
// bases are reported so the agent can compare them.
func TestColoTerminalIsNoiOverExitCap(t *testing.T) {
	p := loadFixtureNamed(t, "nova-colo")
	res := requireOK(t, Analyze(p))
	extra := res.GetSummary().GetExtra()
	m := build(p, &diags{})
	var noi float64
	for tt := m.months - 12; tt < m.months; tt++ {
		noi += m.cf.revenue[tt] - m.cf.opex[tt] - m.cf.power[tt]
	}
	want := noi / p.GetFinance().GetExitCapRate()
	if got := extra["terminal_value"]; !approxEq(got, want, 1e-9) {
		t.Fatalf("terminal_value = %g, want final-year NOI / cap = %g", got, want)
	}
	if extra["exit_value_cap_rate"] != extra["terminal_value"] || extra["exit_value_asset_basis"] <= 0 || extra["exit_value_asset_basis"] == extra["terminal_value"] {
		t.Fatalf("extra must carry both bases: %v", extra)
	}
	if findDiag(res, codeExitCapRateUnset) != nil {
		t.Fatal("cap rate is set; no fallback diagnostic expected")
	}
}

// Without a cap rate a colo plan falls back to the asset basis, visibly.
func TestColoTerminalFallsBackWithoutCapRate(t *testing.T) {
	p := loadFixtureNamed(t, "nova-colo")
	p.Finance.ExitCapRate = 0
	res := requireOK(t, Analyze(p))
	extra := res.GetSummary().GetExtra()
	if extra["terminal_value"] != extra["exit_value_asset_basis"] {
		t.Fatalf("terminal_value %g must equal the asset basis %g when exit_cap_rate is 0", extra["terminal_value"], extra["exit_value_asset_basis"])
	}
	if _, ok := extra["exit_value_cap_rate"]; ok {
		t.Fatal("exit_value_cap_rate is undefined without a cap rate")
	}
	d := findDiag(res, codeExitCapRateUnset)
	if d == nil || d.GetSeverity() != pb.Severity_INFO || d.GetProtoPath() != "finance.exit_cap_rate" {
		t.Fatalf("want INFO %s@finance.exit_cap_rate, got %v", codeExitCapRateUnset, diagCodes(res))
	}
	requireComplete(t, d)
}

// A colo plan whose final year loses money is worth nothing on income, not a negative amount.
func TestColoTerminalIsNeverNegative(t *testing.T) {
	p := loadFixtureNamed(t, "nova-colo")
	p.Revenue.Colo.RatePerKwMonth = 1
	res := requireOK(t, Analyze(p))
	if tv := res.GetSummary().GetExtra()["terminal_value"]; tv != 0 {
		t.Fatalf("terminal_value = %g, want 0 for a loss-making exit year", tv)
	}
}

// COMPUTE_SALES keeps the asset basis (hardware + shell + land) and reports the cap-rate value beside it.
func TestComputeSalesTerminalIsAssetBasis(t *testing.T) {
	for _, name := range []string{"abilene-1", "epoch-100mw"} {
		p := loadFixtureNamed(t, name)
		extra := requireOK(t, Analyze(p)).GetSummary().GetExtra()
		if extra["terminal_value"] != extra["exit_value_asset_basis"] {
			t.Errorf("%s: terminal_value %g ≠ asset basis %g", name, extra["terminal_value"], extra["exit_value_asset_basis"])
		}
		if extra["exit_value_cap_rate"] <= 0 {
			t.Errorf("%s: exit_value_cap_rate must be reported for comparison, got %g", name, extra["exit_value_cap_rate"])
		}
	}
}

// The colo breakeven stays exact with an income-based exit: at the reported breakeven occupancy
// PV(revenue) = PV(cost), the terminal moving with occupancy included.
func TestColoBreakevenIsExactWithIncomeExit(t *testing.T) {
	p := loadFixtureNamed(t, "nova-colo")
	breakeven := requireOK(t, Analyze(p)).GetSummary().GetUtilizationBreakevenPct()
	p.Revenue.Colo.VacancyPct = 100 - breakeven
	m := build(p, &diags{})
	if !approxEq(m.pv.revenue, m.pv.cost, 1e-9) {
		t.Fatalf("at breakeven occupancy %.4g%%: PV(revenue) %.6g ≠ PV(cost) %.6g", breakeven, m.pv.revenue, m.pv.cost)
	}
}
