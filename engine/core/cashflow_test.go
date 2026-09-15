package core

import (
	"math"
	"testing"
)

func TestNpvAndIrr(t *testing.T) {
	// −100 now, +110 next month: monthly IRR is exactly 10%.
	flows := []float64{-100, 110}
	if got := npv(0.10, flows); !approxEq(got, 0, 1e-12) {
		t.Fatalf("npv at the IRR = %g, want 0", got)
	}
	got, ok := irr(flows)
	if want := (math.Pow(1.1, 12) - 1) * 100; !ok || !approxEq(got, want, 1e-9) {
		t.Fatalf("irr = %g,%v want %g,true", got, ok, want)
	}
	if _, ok := irr([]float64{-1, -1, -1}); ok {
		t.Fatal("all-negative flows have no IRR")
	}
	if got := npv(monthlyRate(0.10), []float64{0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 110}); !approxEq(got, 100, 1e-9) {
		t.Fatalf("one year at 10%% should discount 110 to 100, got %g", got)
	}
}

func TestAnnualize(t *testing.T) {
	xs := make([]float64, 27)
	for i := range xs {
		xs[i] = 1
	}
	got := annualize(xs)
	if len(got) != 3 || got[0] != 12 || got[1] != 12 || got[2] != 3 {
		t.Fatalf("annualize = %v, want [12 12 3]", got)
	}
}
