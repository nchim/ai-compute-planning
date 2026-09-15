package core

import (
	"bytes"
	"os"
	"testing"

	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

// The grounding scenarios beyond abilene-1 (README §Fixtures): each has a golden Result and a
// reconciliation test against the independent source it was built from, so the engine is checked
// against three differently shaped businesses rather than tuned to one.
var scenarioFixtures = []string{"nova-colo", "epoch-100mw"}

func TestScenarioGoldens(t *testing.T) {
	for _, name := range scenarioFixtures {
		t.Run(name, func(t *testing.T) {
			plan := loadFixtureNamed(t, name)
			res := requireOK(t, Analyze(plan))
			opts := proto.MarshalOptions{Deterministic: true}
			a, err := opts.Marshal(res)
			if err != nil {
				t.Fatal(err)
			}
			b, err := opts.Marshal(Analyze(clonePlan(plan)))
			if err != nil {
				t.Fatal(err)
			}
			if !bytes.Equal(a, b) {
				t.Fatal("two runs on the same plan produced different bytes")
			}
			compareGolden(t, "testdata/"+name+".result.json", res)
		})
	}
}

// requireOK fails unless the Result is status OK with every conservation check passing.
func requireOK(t *testing.T, res *pb.Result) *pb.Result {
	t.Helper()
	if res.GetStatus() != pb.Status_OK {
		t.Fatalf("status = %v, diags %v", res.GetStatus(), diagCodes(res))
	}
	if !res.GetConservation().GetAllPassed() {
		t.Fatalf("conservation failed: %s", failedChecks(res.GetConservation()))
	}
	return res
}

// compareGolden checks res against the golden file with the tolerant comparer, rewriting it under -update.
func compareGolden(t *testing.T, path string, res *pb.Result) {
	t.Helper()
	got, err := protojson.MarshalOptions{Multiline: true, Indent: "  "}.Marshal(res)
	if err != nil {
		t.Fatal(err)
	}
	if *update {
		if err := os.WriteFile(path, got, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read golden (run with -update to create): %v", err)
	}
	var want pb.Result
	if err := protojson.Unmarshal(raw, &want); err != nil {
		t.Fatal(err)
	}
	requireProtoClose(t, res, &want)
}

// --- A.CRE Data Center Development Model v1.7 (research/sources, local only) -------------------
//
// The sample deal shipped in the workbook, read with openpyxl (cached values). Cells are on the
// Underwriting tab; the mapping to our proto is tabulated in README §Fixtures (nova-colo).
const (
	acreCostBeforeFinancing = 157_920_000.0  // K68  land + hard + soft costs
	acreProjectCostTotal    = 213_080_503.15 // K76  K68 + capitalized interest (K71) + operating shortfall (K73)
	acreNoiUntrended        = 18_610_600.0   // I195 stabilized NOI, year-1 rents and costs (no growth)
	acreNoiTrended          = 18_005_843.62  // J195 stabilized NOI over months 46–57 with 2% rent / 2.5% opex growth
	acreYieldOnCost         = 0.08734        // I233 = I195 / K76
	acreExitCap             = 0.0675         // K176 market cap rate at sale
	acreSaleValue           = 270_979_557.37 // K207 gross sale proceeds: NOI over months 72–83 ÷ K176 (before 2% selling costs)
)

// acreMirror is the A.CRE sample deal in our proto: the nova-colo operating assumptions (which are
// the workbook's) on the workbook's own geometry — 20 MW IT at PUE 1.5 on 5 acres, air-cooled so no
// agility premium is added, grid energized at the end of the 24-month construction period, two
// tenant waves of 13 MW (lease start month 26) and 7 MW (month 38), 72-month hold.
func acreMirror(t *testing.T) *pb.SitePlan {
	t.Helper()
	p := loadFixtureNamed(t, "nova-colo")
	p.Site.LandAcres, p.Site.UsableAcres, p.Site.FloorLoadPsf = 5, 5, 150 // K18; slab below the liquid threshold
	p.Compute.KwPerRack, p.Compute.GpusPerRack, p.Compute.Cooling = 40, 22, pb.CoolingMode_AIR
	p.Power.Sources = []*pb.PowerSource{{Id: "grid", Type: pb.PowerType_GRID, CapacityMw: 30, AvailableMonth: 24, CostPerMwh: 150, CapexPerKw: 255, LeadTimeMonths: 12}}
	p.Power.Interconnection = &pb.Interconnection{QueueStartMonth: 0, GridEnergizeMonth: 24, TransformerLeadMonths: 12}
	p.Phasing.Phases = []*pb.Phase{
		{Id: "wave1", ItLoadMw: 13, StartMonth: 0, EnergizeMonth: 25, PowerSourceId: "grid"}, // F121–F123 = 26 (1-based)
		{Id: "wave2", ItLoadMw: 7, StartMonth: 19, EnergizeMonth: 37, PowerSourceId: "grid"}, // F124–F126 = 38
	}
	p.Finance.HoldPeriodMonths = 72 // D178
	return p
}

// TestAcreReconciliation: on the workbook's inputs the engine reproduces the workbook's stabilized
// NOI, yield-on-cost and development spread once the two structural differences are restated:
//   - Cost basis: A.CRE's yield-on-cost divides by total uses (K76) including $55.2M of capitalized
//     construction interest and operating-shortfall reserve. Our 100%-equity STUB books neither, so
//     our cost basis is K68 and our yield is higher by K76/K68 − 1 = +34.9%. The test compares on
//     K68 (both are workbook cells) and checks the restated yield against the headline I233.
//   - Trending: both escalate each tenant's rent per lease year from its start and grow every opex
//     rate (utilities included, G153:G159) 2.5%/yr per year of operations. What differs is the
//     stabilized window — ours is the 12 months from the last energization (m37–48), A.CRE's J195 is
//     months 46–57 (after tenant absorption) — and A.CRE's 3-month ramp before each escalation clock
//     starts, so the trended NOI is compared within ±5%; the untrended (escalation 0, growth 0 on
//     both sides) within ±1%.
func TestAcreReconciliation(t *testing.T) {
	t.Run("untrended", func(t *testing.T) {
		p := acreMirror(t)
		p.Revenue.Colo.AnnualEscalationPct = 0
		p.Costs.Opex.OpexGrowthPctYr = 0
		res := requireOK(t, Analyze(p))
		s := res.GetSummary()
		if !approxEq(s.GetTotalCapex(), acreCostBeforeFinancing, 1e-6) {
			t.Fatalf("total capex %.0f, want K68 %.0f (every cost line maps 1:1)", s.GetTotalCapex(), acreCostBeforeFinancing)
		}
		noi := s.GetYieldOnCostPct() / 100 * s.GetTotalCapex()
		requireWithin(t, "stabilized NOI vs I195", noi, acreNoiUntrended, 0.01)
		requireWithin(t, "yield on cost vs I195/K68", s.GetYieldOnCostPct()/100, acreNoiUntrended/acreCostBeforeFinancing, 0.01)
		restated := s.GetYieldOnCostPct() / 100 * acreCostBeforeFinancing / acreProjectCostTotal
		requireWithin(t, "yield on cost restated on K76 vs I233", restated, acreYieldOnCost, 0.01)
		wantSpread := (acreYieldOnCost - acreExitCap) * 10000 // A.CRE's formula (I235) on the sale cap rate K176
		if got := (restated - acreExitCap) * 10000; absf(got-wantSpread) > 5 {
			t.Errorf("development spread restated = %.1f bps, want %.1f ± 5", got, wantSpread)
		}
		if !approxEq(s.GetDevSpreadBps(), (s.GetYieldOnCostPct()-acreExitCap*100)*100, 1e-9) {
			t.Errorf("dev_spread_bps %.1f is not (yield − exit cap) in bps", s.GetDevSpreadBps())
		}
	})
	t.Run("trended", func(t *testing.T) {
		res := requireOK(t, Analyze(acreMirror(t)))
		s := res.GetSummary()
		noi := s.GetYieldOnCostPct() / 100 * s.GetTotalCapex()
		requireWithin(t, "trended NOI vs J195 (2% rent escalation per lease, 2.5% opex growth)", noi, acreNoiTrended, 0.05)
		// Exit: A.CRE capitalizes the 12 months after the sale month; ours is the 12 months before it,
		// so the gap is one year of trending.
		requireWithin(t, "exit value vs K207 (NOI at exit ÷ cap rate)", s.GetExtra()["terminal_value"], acreSaleValue, 0.05)
	})
}

// --- Epoch AI 1 GW GB200 TCO model, rescaled to 100 MW ----------------------------------------
//
// research/topics/01-lifecycle-pro-forma/pro-forma-reconstruction.md §0–§1.2 (Epoch AI,
// "Total cost of ownership of a one-gigawatt AI data center"). Money per 100 MW *facility* power.
const (
	epochCapexTotal    = 3_788e6
	epochCapexFacility = 1_143e6 // shell + electrical + cooling
	epochCapexNetwork  = 493e6
	epochCapexLand     = 17e6
	epochCapexUtility  = 16e6 // site-side interconnection works
	epochCapexGpus     = 2_119e6
	epochOpexEnergy    = 59.4e6 // at 71% utilization (§1.2 note: ≈ $88–100/MWh implied)
	epochOpexOther     = 32.9e6 // maintenance 12.0 + property tax 14.3 + labor 4.0 + water 0.6 + utility 2.0
	epochOpexTotal     = 92.3e6
	epochUtilization   = 0.71
)

// TestEpochReconciliation: capex reproduces Epoch's stack line by line; non-energy opex reproduces
// Epoch's lines; energy is billed at the utilized IT load × PUE (opex.go), the same basis as Epoch's
// $59.4M line at 71% utilization, so the total reconciles unadjusted within ±10%.
func TestEpochReconciliation(t *testing.T) {
	res := requireOK(t, Analyze(loadFixtureNamed(t, "epoch-100mw")))
	s := res.GetSummary()
	facilityMw := s.GetExtra()["facility_mw"]

	t.Run("capex", func(t *testing.T) {
		requireWithin(t, "total capex", s.GetTotalCapex(), epochCapexTotal, 0.05)
		requireWithin(t, "capex per facility MW", s.GetTotalCapex()/facilityMw, epochCapexTotal/100, 0.05)
		line := func(c string) float64 { return capexPerMw(res, c) * s.GetMwOnlineFinal() }
		requireWithin(t, "facility (shell+electrical+cooling)", line(compShell)+line(compElec)+line(compCooling), epochCapexFacility, 0.01)
		requireWithin(t, "network", line(compNetwork), epochCapexNetwork, 0.01)
		requireWithin(t, "land", line(compLand), epochCapexLand, 0.01)
		requireWithin(t, "utility works", line(compPower), epochCapexUtility, 0.02)
		requireWithin(t, "gpus", line(compGpu), epochCapexGpus, 0.01)
		if line(compAgility) != 0 {
			t.Errorf("agility premium %.0f: Epoch's facility line already prices a liquid-cooled hall", line(compAgility))
		}
	})

	t.Run("opex", func(t *testing.T) {
		year := firstFullYearOnline(int(s.GetTimeToEnergizeMonths()))
		opex, power := annualOpex(t, res, year)
		requireWithin(t, "non-energy opex", opex, epochOpexOther, 0.10)
		requireWithin(t, "energy vs Epoch energy (both at 71% utilization)", power, epochOpexEnergy, 0.10)
		requireWithin(t, "total opex", opex+power, epochOpexTotal, 0.10)
	})
}

// firstFullYearOnline is the 1-based cashflow_annual row of the first whole year after energize.
func firstFullYearOnline(energize int) int { return (energize+11)/12 + 1 }

// annualOpex reads opex_usd and power_usd for a 1-based year from the cashflow_annual table.
func annualOpex(t *testing.T, res *pb.Result, year int) (opex, power float64) {
	t.Helper()
	for _, tb := range res.GetTables() {
		if tb.GetId() != tableCashflow {
			continue
		}
		for _, r := range tb.GetRows() {
			if int(r.GetCells()[0].GetN()) == year {
				return r.GetCells()[2].GetN(), r.GetCells()[3].GetN()
			}
		}
	}
	t.Fatalf("cashflow_annual has no year %d", year)
	return 0, 0
}

// requireWithin asserts |got − want| ≤ rel × |want| and reports the actual gap.
func requireWithin(t *testing.T, what string, got, want, rel float64) {
	t.Helper()
	gap := got/want - 1
	t.Logf("%s: got %.4g, want %.4g ± %.0f%% (gap %+.2f%%)", what, got, want, rel*100, gap*100)
	if absf(gap) > rel {
		t.Errorf("%s: gap %+.2f%% exceeds ±%.0f%%", what, gap*100, rel*100)
	}
}
