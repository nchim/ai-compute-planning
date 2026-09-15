package core

import (
	"fmt"
	"math/rand"
	"testing"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

// TestConservationProperty: every randomized VALID plan must pass all 14 checks. The seed is fixed so
// a failure is reproducible; the failing plan's parameters are printed.
func TestConservationProperty(t *testing.T) {
	rng := rand.New(rand.NewSource(20260915))
	for i := 0; i < 300; i++ {
		p := randomValidPlan(rng)
		res := Analyze(p)
		if res.GetStatus() == pb.Status_INVALID_INPUT {
			t.Fatalf("iteration %d: generator produced an invalid plan: %v", i, diagCodes(res))
		}
		if n := len(res.GetConservation().GetChecks()); n != 14 {
			t.Fatalf("iteration %d: %d checks, want 14", i, n)
		}
		if !res.GetConservation().GetAllPassed() {
			t.Fatalf("iteration %d: conservation failed: %s\nplan: %v", i, failedChecks(res.GetConservation()), p)
		}
	}
}

func TestConservationFailureDowngradesStatus(t *testing.T) {
	var d diags
	m := build(loadFixture(t), &d)
	m.capex.total *= 1.01 // corrupt the ledger the way a bug would (beyond the 1e-6 relative tolerance)
	report := conserve(m, &d)
	if report.GetAllPassed() || d.status() != pb.Status_OK_WITH_WARNINGS || findDiag(&pb.Result{Diagnostics: d}, codeConservationFailed) == nil {
		t.Fatalf("a failed check must set all_passed=false, emit CONSERVATION_FAILED and downgrade status; got %v %v", report, d)
	}
}

func randomValidPlan(rng *rand.Rand) *pb.SitePlan {
	between := func(lo, hi float64) float64 { return lo + rng.Float64()*(hi-lo) }
	kw := between(15, 250)
	cooling := requiredCooling(kw)
	if cooling == pb.CoolingMode_AIR && rng.Intn(3) == 0 {
		cooling = pb.CoolingMode_LIQUID_DTC // over-specified cooling is valid
	}
	target := between(5, 500)
	pue := between(1.05, 1.5)
	hold := 24 + rng.Intn(120)
	need := target * pue
	nSources := 1 + rng.Intn(3)
	var sources []*pb.PowerSource
	types := []pb.PowerType{pb.PowerType_GRID, pb.PowerType_BTM_GAS, pb.PowerType_SOLAR_PPA, pb.PowerType_NUCLEAR_PPA}
	for s := 0; s < nSources; s++ {
		sources = append(sources, &pb.PowerSource{
			Id: fmt.Sprintf("s%d", s), Type: types[rng.Intn(len(types))], CapacityMw: need / float64(nSources) * between(1.0, 1.5),
			AvailableMonth: int32(rng.Intn(hold / 2)), CostPerMwh: between(20, 120), CapexPerKw: between(0, 1500), LeadTimeMonths: int32(rng.Intn(36)),
		})
	}
	if rng.Intn(4) == 0 {
		sources = append(sources, &pb.PowerSource{Id: "bess", Type: pb.PowerType_BESS, CapacityMw: 50, AvailableMonth: 0})
	}
	gridMonth := int32(rng.Intn(hold / 2))
	srcs := newSources(&pb.PowerPlan{Sources: sources, Interconnection: &pb.Interconnection{GridEnergizeMonth: gridMonth}})
	allReady := 0
	for _, s := range srcs {
		allReady = maxInt(allReady, s.ready)
	}
	plan := &pb.SitePlan{
		Site:    &pb.Site{LandAcres: 5000, UsableAcres: 4000, FloorLoadPsf: 300 + between(0, 100), WaterStressIndex: rng.Float64()},
		Compute: &pb.ComputeSpec{GpusPerRack: float64(8 + rng.Intn(136)), KwPerRack: kw, TargetItLoadMw: target, Pue: pue, Cooling: cooling},
		Power:   &pb.PowerPlan{Sources: sources, Interconnection: &pb.Interconnection{GridEnergizeMonth: gridMonth, TransformerLeadMonths: int32(rng.Intn(48))}},
		Demand:  &pb.DemandRamp{Points: []*pb.DemandPoint{{Month: int32(rng.Intn(12)), DemandMw: between(0, target)}, {Month: 40, DemandMw: between(0, 2*target)}}},
		Costs: &pb.CostModel{
			ShellCapexPerMw: between(1e6, 5e6), ElectricalCapexPerMw: between(1e6, 6e6), CoolingCapexPerMw: between(0.5e6, 4e6), NetworkCapexPerMw: between(0, 2e6),
			LandCapexPerAcre: between(0, 1e5), AgilityPremiumPct: between(0, 20),
			Gpu:  &pb.GpuCost{UnitCost: between(10000, 60000), DepreciationYears: int32(3 + rng.Intn(5))},
			Opex: &pb.OpexModel{StaffingPerMwYr: between(0, 3e5), MaintenancePctOfCapex: between(0, 4), InsurancePctOfCapex: between(0, 1), MgmtFeePctOfEgr: between(0, 5), PropertyTaxPerYr: between(0, 5e7)},
		},
		Finance: &pb.FinanceParams{DiscountRate: between(0.03, 0.2), HoldPeriodMonths: int32(hold), ExitCapRate: between(0.04, 0.1)},
		Phasing: &pb.Phasing{Mode: pb.PhasingMode_SINGLE_SHOT},
		Run:     &pb.RunOptions{Mode: pb.RunMode_RUN_ANALYZE},
	}
	if rng.Intn(2) == 0 {
		plan.Revenue = &pb.RevenueModel{Mode: pb.RevenueMode_COMPUTE_SALES, Compute: &pb.ComputeTerms{GpuHourPrice: between(0.5, 5), UtilizationPct: between(30, 100), PriceDecayPctYr: between(0, 20)}}
	} else {
		plan.Revenue = &pb.RevenueModel{Mode: pb.RevenueMode_COLO_LEASE, Colo: &pb.ColoTerms{RatePerKwMonth: between(80, 250), AnnualEscalationPct: between(0, 5), VacancyPct: between(0, 30)}}
	}
	if rng.Intn(2) == 0 {
		// Explicit phases: split the target, energize after every source is ready so supply covers load.
		n := 1 + rng.Intn(3)
		var phases []*pb.Phase
		for i := 0; i < n; i++ {
			start := int32(rng.Intn(hold / 2))
			energize := maxInt(int(start), allReady) + rng.Intn(12)
			phases = append(phases, &pb.Phase{Id: fmt.Sprintf("ph%d", i), ItLoadMw: target / float64(n), StartMonth: start, EnergizeMonth: int32(energize)})
		}
		for i := 1; i < n; i++ { // keep energization ordered
			phases[i].EnergizeMonth = maxInt32(phases[i].EnergizeMonth, phases[i-1].EnergizeMonth)
		}
		plan.Phasing = &pb.Phasing{Mode: pb.PhasingMode_EXPLICIT, Phases: phases}
	}
	return plan
}

func maxInt32(a, b int32) int32 {
	if a > b {
		return a
	}
	return b
}
