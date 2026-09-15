package core

import (
	"testing"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

func TestRenderTablesAndCharts(t *testing.T) {
	res := Analyze(loadFixture(t))
	wantTables := []string{tableSizing, tableCapexStack, tablePhases, tablePower, tableCashflow}
	for i, id := range wantTables {
		tb := res.GetTables()[i]
		if tb.GetId() != id || len(tb.GetRows()) == 0 || len(tb.GetColumns()) == 0 {
			t.Errorf("table %d = %q with %d rows, want %q", i, tb.GetId(), len(tb.GetRows()), id)
		}
		for _, r := range tb.GetRows() {
			if len(r.GetCells()) != len(tb.GetColumns()) {
				t.Errorf("table %q: row width %d != %d columns", id, len(r.GetCells()), len(tb.GetColumns()))
			}
		}
	}
	wantCharts := []struct {
		id  string
		typ pb.ChartType
		dim string
	}{
		{chartDemand, pb.ChartType_STEP, "time"}, {chartCriticalPath, pb.ChartType_GANTT, "time"}, {chartCapexStack, pb.ChartType_BAR, "capital"},
		{chartCashflow, pb.ChartType_LINE, "capital"}, {chartRiskRadar, pb.ChartType_RADAR, "risk"},
	}
	for i, w := range wantCharts {
		c := res.GetCharts()[i]
		if c.GetId() != w.id || c.GetType() != w.typ || c.GetMeta()["dimension"] != w.dim || len(c.GetSeries()) == 0 {
			t.Errorf("chart %d = %q/%v/%q, want %q/%v/%q", i, c.GetId(), c.GetType(), c.GetMeta()["dimension"], w.id, w.typ, w.dim)
		}
	}
	demand := res.GetCharts()[0]
	if demand.GetMeta()["series.capacity"] != "STEP" || demand.GetMeta()["series.shortfall"] != "AREA" || len(demand.GetSeries()) != 4 {
		t.Errorf("demand chart must tag STEP capacity and AREA shortfall/stranded series: %v", demand.GetMeta())
	}
	if len(res.GetTables()[3].GetRows()) != 84 {
		t.Errorf("power schedule must cover every month of the hold")
	}
}

func TestSchematicLayout(t *testing.T) {
	res := Analyze(explicitTwoPhase(loadFixture(t)))
	s := res.GetSchematic()
	if s.GetFootprintUsedPct() <= 0 || s.GetFootprintUsedPct() > 100 {
		t.Fatalf("footprint_used_pct = %g", s.GetFootprintUsedPct())
	}
	kinds := map[pb.BlockKind]int{}
	prevEnergize := int32(-1)
	for _, b := range s.GetBlocks() {
		kinds[b.GetKind()]++
		if b.GetXM() < 0 || b.GetYM() < 0 || b.GetXM()+b.GetWM() > s.GetParcelWM()+1e-6 || b.GetYM()+b.GetHM() > s.GetParcelHM()+1e-6 {
			t.Errorf("block %q leaves the parcel", b.GetId())
		}
		if b.GetKind() == pb.BlockKind_DATA_HALL {
			if b.GetEnergizeMonth() <= prevEnergize {
				t.Errorf("halls must energize in strictly increasing order, %q at m%d after m%d", b.GetId(), b.GetEnergizeMonth(), prevEnergize)
			}
			prevEnergize = b.GetEnergizeMonth()
		}
	}
	for _, k := range []pb.BlockKind{pb.BlockKind_DATA_HALL, pb.BlockKind_COOLING_YARD, pb.BlockKind_SUBSTATION, pb.BlockKind_GAS_PAD, pb.BlockKind_EXPANSION_PAD, pb.BlockKind_SETBACK} {
		if kinds[k] == 0 {
			t.Errorf("missing block kind %v", k)
		}
	}
	if kinds[pb.BlockKind_DATA_HALL] != 2 {
		t.Errorf("want one hall per phase, got %d", kinds[pb.BlockKind_DATA_HALL])
	}
	if gridOnly := Analyze(loadFixture(t)).GetSchematic(); countKind(gridOnly, pb.BlockKind_GAS_PAD) != 0 {
		t.Error("no gas pad without a BTM gas source")
	}
}

func countKind(s *pb.Schematic, k pb.BlockKind) int {
	n := 0
	for _, b := range s.GetBlocks() {
		if b.GetKind() == k {
			n++
		}
	}
	return n
}
