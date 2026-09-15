package core

import (
	"testing"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

func TestValidateDiagnosticsPerCode(t *testing.T) {
	base := loadFixture(t)
	cases := []struct {
		name   string
		mutate func(p *pb.SitePlan)
		code   string
		path   string
	}{
		{"missing site", func(p *pb.SitePlan) { p.Site = nil }, codeMissingRequired, "site"},
		{"missing cooling", func(p *pb.SitePlan) { p.Compute.Cooling = pb.CoolingMode_COOLING_UNSPECIFIED }, codeMissingRequired, "compute.cooling"},
		{"missing sources", func(p *pb.SitePlan) { p.Power.Sources = nil }, codeMissingRequired, "power.sources"},
		{"missing demand", func(p *pb.SitePlan) { p.Demand.Points = nil }, codeMissingRequired, "demand.points"},
		{"missing revenue mode", func(p *pb.SitePlan) { p.Revenue.Mode = pb.RevenueMode_REVENUE_UNSPECIFIED }, codeMissingRequired, "revenue.mode"},
		{"pue below 1", func(p *pb.SitePlan) { p.Compute.Pue = 0.9 }, codeOutOfRange, "compute.pue"},
		{"usable over land", func(p *pb.SitePlan) { p.Site.UsableAcres = 500 }, codeOutOfRange, "site.usable_acres"},
		{"utilization over 100", func(p *pb.SitePlan) { p.Revenue.Compute.UtilizationPct = 120 }, codeOutOfRange, "revenue.compute.utilization_pct"},
		{"hold zero", func(p *pb.SitePlan) { p.Finance.HoldPeriodMonths = 0 }, codeOutOfRange, "finance.hold_period_months"},
		{"demand not increasing", func(p *pb.SitePlan) { p.Demand.Points[1].Month = 6 }, codeOutOfRange, "demand.points[1].month"},
		{"density exceeds cooling", func(p *pb.SitePlan) { p.Compute.KwPerRack = 130 }, codeDensityExceedsCooling, "compute.kw_per_rack"},
		{"floor load for liquid", func(p *pb.SitePlan) { p.Compute.KwPerRack = 100; p.Compute.Cooling = pb.CoolingMode_LIQUID_DTC }, codeFloorLoadInsufficient, "site.floor_load_psf"},
		{"floor load for air", func(p *pb.SitePlan) { p.Site.FloorLoadPsf = 100 }, codeFloorLoadInsufficient, "site.floor_load_psf"},
		{"undersupply single shot", func(p *pb.SitePlan) { p.Power.Sources[0].CapacityMw = 100 }, codePowerUndersupply, "power.sources"},
		{"footprint over parcel", func(p *pb.SitePlan) { p.Site.LandAcres = 20; p.Site.UsableAcres = 10 }, codeFootprintOverParcel, "site.usable_acres"},
		{"phasing optimize", func(p *pb.SitePlan) { p.Phasing.Mode = pb.PhasingMode_OPTIMIZE }, codeUseOptimize, "phasing.mode"},
		{"run optimize", func(p *pb.SitePlan) { p.Run.Mode = pb.RunMode_RUN_OPTIMIZE }, codeUseOptimize, "run.mode"},
		{"phasing unspecified", func(p *pb.SitePlan) { p.Phasing.Mode = pb.PhasingMode_PHASING_UNSPECIFIED }, codeMissingRequired, "phasing.mode"},
		{"explicit without phases", func(p *pb.SitePlan) { p.Phasing.Mode = pb.PhasingMode_EXPLICIT }, codeMissingRequired, "phasing.phases"},
		{"unknown power source", func(p *pb.SitePlan) {
			*p = *explicitTwoPhase(p)
			p.Phasing.Phases[0].PowerSourceId = "nope"
		}, codeUnknownPowerSource, "phasing.phases[0].power_source_id"},
		{"phase before power", func(p *pb.SitePlan) {
			*p = *explicitTwoPhase(p)
			p.Phasing.Phases[1].EnergizeMonth = 20 // grid is ready at m30
		}, codePhaseBeforePower, "phasing.phases[1].energize_month"},
		{"phase undersupply pooled", func(p *pb.SitePlan) {
			*p = *explicitTwoPhase(p)
			p.Phasing.Phases[1].PowerSourceId = "" // pooled: gas 130 MW < 240 MW cumulative at m30? grid adds 260 → fine; move earlier
			p.Phasing.Phases[1].EnergizeMonth = 20
		}, codePowerUndersupply, "phasing.phases[1].energize_month"},
		{"phase energize before start", func(p *pb.SitePlan) {
			*p = *explicitTwoPhase(p)
			p.Phasing.Phases[1].StartMonth = 40
		}, codeOutOfRange, "phasing.phases[1].energize_month"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p := clonePlan(base)
			tc.mutate(p)
			res := Analyze(p)
			if res.GetStatus() != pb.Status_INVALID_INPUT {
				t.Fatalf("status = %v, want INVALID_INPUT; diags %v", res.GetStatus(), diagCodes(res))
			}
			d := findDiag(res, tc.code)
			if d == nil {
				t.Fatalf("missing %s; got %v", tc.code, diagCodes(res))
			}
			if d.GetProtoPath() != tc.path {
				t.Errorf("proto_path = %q, want %q", d.GetProtoPath(), tc.path)
			}
			for _, d := range res.GetDiagnostics() {
				requireComplete(t, d)
			}
			if res.GetSummary() != nil || res.GetTables() != nil {
				t.Error("INVALID_INPUT must not carry model output")
			}
		})
	}
}

func TestValidateCollectsAllErrors(t *testing.T) {
	p := loadFixture(t)
	p.Site.LandAcres, p.Site.UsableAcres = 0, 0
	p.Compute.Pue = 0
	p.Finance.HoldPeriodMonths = 0
	res := Analyze(p)
	if n := len(res.GetDiagnostics()); n < 4 {
		t.Fatalf("expected every structural error collected, got %d: %v", n, diagCodes(res))
	}
}

func TestValidateWarnsWhenPhasesDisagreeWithTarget(t *testing.T) {
	p := explicitTwoPhase(loadFixture(t))
	p.Compute.TargetItLoadMw = 150
	res := Analyze(p)
	if res.GetStatus() != pb.Status_OK_WITH_WARNINGS || findDiag(res, codePhasesNeTarget) == nil {
		t.Fatalf("want OK_WITH_WARNINGS + PHASES_NE_TARGET, got %v %v", res.GetStatus(), diagCodes(res))
	}
}
