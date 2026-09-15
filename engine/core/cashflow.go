package core

import "math"

// cashflow is the monthly unlevered ledger. terminal is booked in the final month only.
type cashflow struct {
	months   int
	capex    []float64
	opex     []float64
	power    []float64
	revenue  []float64
	terminal []float64
	net      []float64
}

func buildCashflow(capex capexBuild, opex opexSeries, rev revenueSeries, terminal float64, months int) cashflow {
	cf := cashflow{months: months, capex: capex.monthly(months, anyLine), revenue: rev.revenue, power: opex.power,
		opex: make([]float64, months), terminal: make([]float64, months), net: make([]float64, months)}
	cf.terminal[months-1] = terminal
	for t := 0; t < months; t++ {
		cf.opex[t] = opex.opexAt(t)
		cf.net[t] = cf.revenue[t] + cf.terminal[t] - cf.capex[t] - cf.opex[t] - cf.power[t]
	}
	return cf
}

// annualize sums consecutive 12-month blocks; a trailing partial year is its own row.
func annualize(xs []float64) []float64 {
	out := make([]float64, (len(xs)+11)/12)
	for t, x := range xs {
		out[t/12] += x
	}
	return out
}

// monthlyRate converts an annual discount rate to its monthly equivalent.
func monthlyRate(annual float64) float64 { return math.Pow(1+annual, 1.0/12) - 1 }

// npv discounts monthly flows at a monthly rate, t0 undiscounted.
func npv(rate float64, flows []float64) float64 {
	var pv, df = 0.0, 1.0
	for _, f := range flows {
		pv += f * df
		df /= 1 + rate
	}
	return pv
}

// irr finds the monthly rate at which npv = 0 by bisection on [irrLow, irrHigh] and returns it
// annualized as a percent. Bisection is chosen over Newton because it cannot diverge and is trivially
// deterministic; 100 halvings of the bracket give ~1e-30 precision on the monthly rate. ok is false
// when NPV has the same sign at both ends of the bracket (no conventional IRR exists).
func irr(flows []float64) (annualPct float64, ok bool) {
	const irrLow, irrHigh, iters = -0.5, 1.0, 100
	lo, hi := irrLow, irrHigh
	fLo, fHi := npv(lo, flows), npv(hi, flows)
	if fLo == 0 {
		return annualPctOf(lo), true
	}
	if (fLo < 0) == (fHi < 0) {
		return 0, false
	}
	for i := 0; i < iters; i++ {
		mid := (lo + hi) / 2
		if fMid := npv(mid, flows); (fMid < 0) == (fLo < 0) {
			lo, fLo = mid, fMid
		} else {
			hi = mid
		}
	}
	return annualPctOf((lo + hi) / 2), true
}

func annualPctOf(monthly float64) float64 { return (math.Pow(1+monthly, 12) - 1) * 100 }
