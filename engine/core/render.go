package core

import (
	"fmt"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

// Table and chart ids are the contract with the SPA; keep them stable.
const (
	tableSizing       = "sizing"
	tableCapexStack   = "capex_stack"
	tablePhases       = "phase_schedule"
	tablePower        = "power_schedule"
	tableCashflow     = "cashflow_annual"
	chartDemand       = "demand_vs_capacity"
	chartCriticalPath = "critical_path"
	chartCapexStack   = "capex_stack"
	chartCashflow     = "cashflow"
	chartRiskRadar    = "risk_radar"
)

func renderTables(m *model) []*pb.Table {
	return []*pb.Table{sizingTable(m), capexTable(m), phaseTable(m), powerTable(m), cashflowTable(m)}
}

func renderCharts(m *model) []*pb.Chart {
	return []*pb.Chart{demandChart(m), criticalPathChart(m), capexChart(m), cashflowChart(m), riskChart(m)}
}

func sizingTable(m *model) *pb.Table {
	s, c := m.site, m.plan.GetCompute()
	rows := [][]any{
		{"target_it_load_mw", c.GetTargetItLoadMw(), "MW"}, {"sized_it_load_mw", s.itMw, "MW"}, {"facility_power_mw", s.facilityMw, "MW"},
		{"pue", c.GetPue(), "ratio"}, {"racks", float64(s.racks), "count"}, {"gpus", s.gpus, "count"},
		{"kw_per_rack", c.GetKwPerRack(), "kW"}, {"cooling", c.GetCooling().String(), "mode"},
		{"cooling_capacity_kw", s.coolingKw, "kW"}, {"heat_load_kw", s.heatKw, "kW"},
		{"whitespace_sqft", s.whitespaceSqft, "sqft"}, {"gross_building_sqft", s.grossSqft, "sqft"},
		{"building_acres", s.buildingAcres, "acres"}, {"site_footprint_acres", s.footprintAcres, "acres"},
		{"usable_acres", m.plan.GetSite().GetUsableAcres(), "acres"}, {"footprint_used_pct", m.schematic.GetFootprintUsedPct(), "%"},
	}
	return table(tableSizing, "Sizing", []string{"metric", "value", "unit"}, rows)
}

func capexTable(m *model) *pb.Table {
	keys, by := m.capex.byComponent()
	var rows [][]any
	for _, k := range keys {
		rows = append(rows, []any{k, by[k], by[k] / m.site.itMw, by[k] / m.capex.total * 100})
	}
	rows = append(rows, []any{"total", m.capex.total, m.capex.total / m.site.itMw, 100.0})
	return table(tableCapexStack, "Capex stack", []string{"component", "amount_usd", "per_mw_usd", "share_pct"}, rows)
}

func phaseTable(m *model) *pb.Table {
	_, by := m.capex.byPhase()
	var rows [][]any
	for _, ph := range m.phases {
		src := ph.sourceID
		if src == "" {
			src = "pooled"
		}
		rows = append(rows, []any{ph.id, ph.size.itMw, float64(ph.size.racks), ph.size.gpus, ph.cooling.String(), src,
			float64(ph.startMonth), float64(ph.constructionReady), float64(ph.powerReady), float64(ph.energize), ph.footprintAcres, ph.agility, by[ph.id]})
	}
	return table(tablePhases, "Phase schedule", []string{"phase", "it_mw", "racks", "gpus", "cooling", "power_source", "start_month",
		"construction_ready_month", "power_ready_month", "energize_month", "footprint_acres", "agility_premium", "capex_usd"}, rows)
}

func powerTable(m *model) *pb.Table {
	pue := m.plan.GetCompute().GetPue()
	var rows [][]any
	for t := 0; t < m.months; t++ {
		supply, load := firmSupplyAt(m.srcs, t), onlineItMw(m.phases, t)*pue
		rows = append(rows, []any{float64(t), supply, load, supply - load, onlineItMw(m.phases, t), DemandAt(m.plan.GetDemand().GetPoints(), t), m.cf.power[t]})
	}
	return table(tablePower, "Power schedule", []string{"month", "firm_supply_mw", "facility_load_mw", "headroom_mw", "online_it_mw", "demand_mw", "energy_cost_usd"}, rows)
}

func cashflowTable(m *model) *pb.Table {
	rev, opex, power, capex, term, net := annualize(m.cf.revenue), annualize(m.cf.opex), annualize(m.cf.power), annualize(m.cf.capex), annualize(m.cf.terminal), annualize(m.cf.net)
	var rows [][]any
	var cum float64
	for y := range net {
		cum += net[y]
		rows = append(rows, []any{float64(y + 1), rev[y], opex[y], power[y], capex[y], term[y], net[y], cum})
	}
	return table(tableCashflow, "Annual cashflow", []string{"year", "revenue_usd", "opex_usd", "power_usd", "capex_usd", "terminal_value_usd", "net_usd", "cumulative_usd"}, rows)
}

// demandChart: demand (AREA) vs online capacity (STEP) with the shortfall and stranded gaps as AREAs.
func demandChart(m *model) *pb.Chart {
	pts := m.plan.GetDemand().GetPoints()
	demand, capacity, short, stranded := series("demand"), series("capacity"), series("shortfall"), series("stranded")
	for t := 0; t < m.months; t++ {
		dem, cap := DemandAt(pts, t), onlineItMw(m.phases, t)
		point(demand, t, dem)
		point(capacity, t, cap)
		point(short, t, maxf(dem-cap, 0))
		point(stranded, t, maxf(cap-dem, 0))
	}
	return &pb.Chart{Id: chartDemand, Type: pb.ChartType_STEP, Title: "Demand vs. online capacity", Series: []*pb.Series{demand, capacity, short, stranded},
		Meta: map[string]string{"dimension": "time", "x": "month", "y": "MW", "series.demand": "AREA", "series.capacity": "STEP", "series.shortfall": "AREA", "series.stranded": "AREA"}}
}

// criticalPathChart: one point per task, x = start month, y = end month, label = task.
func criticalPathChart(m *model) *pb.Chart {
	ic := m.plan.GetPower().GetInterconnection()
	s := series("tasks")
	bar := func(label string, start, end int) {
		s.Points = append(s.Points, &pb.Point{X: float64(start), Y: float64(end), Label: label})
	}
	for _, src := range m.srcs {
		if src.typ == pb.PowerType_GRID {
			bar("interconnection queue ("+src.id+")", int(ic.GetQueueStartMonth()), src.ready)
			bar("transformer lead ("+src.id+")", int(ic.GetQueueStartMonth()), int(ic.GetQueueStartMonth()+ic.GetTransformerLeadMonths()))
		} else {
			bar(src.typ.String()+" ("+src.id+")", maxInt(0, src.ready-src.leadMonths), src.ready)
		}
	}
	for _, ph := range m.phases {
		bar("construction "+ph.id, ph.startMonth, ph.constructionReady)
		bar("energize "+ph.id, ph.energize, ph.energize)
	}
	return &pb.Chart{Id: chartCriticalPath, Type: pb.ChartType_GANTT, Title: "Critical path", Series: []*pb.Series{s},
		Meta: map[string]string{"dimension": "time", "x": "start_month", "y": "end_month"}}
}

// capexChart: one series per component, one bar (point) per phase.
func capexChart(m *model) *pb.Chart {
	keys, _ := m.capex.byComponent()
	perPhase := map[string]map[string]float64{}
	for _, l := range m.capex.lines {
		if perPhase[l.component] == nil {
			perPhase[l.component] = map[string]float64{}
		}
		perPhase[l.component][l.phaseID] += l.amount
	}
	var out []*pb.Series
	for _, k := range keys {
		s := series(k)
		for i, ph := range m.phases {
			s.Points = append(s.Points, &pb.Point{X: float64(i), Y: perPhase[k][ph.id], Label: ph.id})
		}
		out = append(out, s)
	}
	return &pb.Chart{Id: chartCapexStack, Type: pb.ChartType_BAR, Title: "Capex stack by phase", Series: out,
		Meta: map[string]string{"dimension": "capital", "x": "phase", "y": "USD", "stacked": "true"}}
}

func cashflowChart(m *model) *pb.Chart {
	lines := []struct {
		name string
		xs   []float64
	}{{"net", m.cf.net}, {"revenue", m.cf.revenue}, {"capex", m.cf.capex}, {"opex", m.cf.opex}, {"power", m.cf.power}}
	var out []*pb.Series
	for _, l := range lines {
		s := series(l.name)
		for y, v := range annualize(l.xs) {
			point(s, y+1, v)
		}
		out = append(out, s)
	}
	return &pb.Chart{Id: chartCashflow, Type: pb.ChartType_LINE, Title: "Annual cashflow", Series: out,
		Meta: map[string]string{"dimension": "capital", "x": "year", "y": "USD"}}
}

func riskChart(m *model) *pb.Chart {
	s := series("risk")
	for i, c := range m.risk {
		s.Points = append(s.Points, &pb.Point{X: float64(i), Y: c.score, Label: c.name})
	}
	return &pb.Chart{Id: chartRiskRadar, Type: pb.ChartType_RADAR, Title: "Risk profile", Series: []*pb.Series{s},
		Meta: map[string]string{"dimension": "risk", "y": "score 0..100", "composite": fmt.Sprintf("%.1f", m.summary.GetCompositeRiskScore())}}
}

// --- helpers ------------------------------------------------------------------------------------

func series(name string) *pb.Series { return &pb.Series{Name: name} }

func point(s *pb.Series, x int, y float64) {
	s.Points = append(s.Points, &pb.Point{X: float64(x), Y: y})
}

// table builds a Table from Go values; supported cell types are string, float64 and bool.
func table(id, title string, columns []string, rows [][]any) *pb.Table {
	t := &pb.Table{Id: id, Title: title, Columns: columns}
	for _, r := range rows {
		row := &pb.Row{}
		for _, v := range r {
			row.Cells = append(row.Cells, cell(v))
		}
		t.Rows = append(t.Rows, row)
	}
	return t
}

func cell(v any) *pb.Cell {
	switch x := v.(type) {
	case string:
		return &pb.Cell{V: &pb.Cell_S{S: x}}
	case float64:
		return &pb.Cell{V: &pb.Cell_N{N: x}}
	case bool:
		return &pb.Cell{V: &pb.Cell_B{B: x}}
	}
	// Unreachable by construction: every row literal above uses the three supported types.
	return &pb.Cell{V: &pb.Cell_S{S: fmt.Sprint(v)}}
}
