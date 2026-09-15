package core

import (
	"testing"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

func TestSourcesReadyRespectsInterconnection(t *testing.T) {
	p := loadFixture(t)
	p.Power.Sources[0].AvailableMonth = 20 // interconnection says 30; grid waits for it
	srcs := newSources(p.Power)
	if srcs[0].ready != 30 {
		t.Fatalf("grid ready = %d, want 30", srcs[0].ready)
	}
	if m, ok := firstMonthCovering(srcs, 240, 84); !ok || m != 30 {
		t.Fatalf("firstMonthCovering = %d,%v, want 30,true", m, ok)
	}
	if _, ok := firstMonthCovering(srcs, 300, 84); ok {
		t.Fatal("260 MW should never cover 300 MW")
	}
}

func TestScheduleSingleShot(t *testing.T) {
	cases := []struct {
		name         string
		gridMonth    int32
		wantEnergize int
	}{
		{"power is the critical path", 30, 30},
		{"construction is the critical path", 6, ConstructionLeadMonths},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p := loadFixture(t)
			p.Power.Sources[0].AvailableMonth = tc.gridMonth
			p.Power.Interconnection.GridEnergizeMonth = tc.gridMonth
			var d diags
			phases := schedule(p, newSources(p.Power), 84, &d)
			if len(phases) != 1 || phases[0].energize != tc.wantEnergize || phases[0].id != "p1" {
				t.Fatalf("phases = %+v, want one phase energizing m%d", phases, tc.wantEnergize)
			}
			if phases[0].energize != maxInt(phases[0].powerReady, phases[0].constructionReady) {
				t.Fatal("energize must be max(power_ready, construction_ready)")
			}
		})
	}
}

func TestScheduleExplicitUsesNamedSourceAndWarnsAfterHold(t *testing.T) {
	p := explicitTwoPhase(loadFixture(t))
	p.Finance.HoldPeriodMonths = 24
	var d diags
	phases := schedule(p, newSources(p.Power), 24, &d)
	if phases[0].energize != 12 || phases[0].powerReady != 12 || phases[1].energize != 30 {
		t.Fatalf("unexpected schedule %+v", phases)
	}
	if len(d) != 1 || d[0].GetCode() != codeEnergizeAfterHold || d[0].GetSeverity() != pb.Severity_WARNING {
		t.Fatalf("want one ENERGIZE_AFTER_HOLD warning, got %v", d)
	}
	if onlineItMw(phases, 11) != 0 || onlineItMw(phases, 12) != 100 {
		t.Fatal("online MW must step at energize month")
	}
}
