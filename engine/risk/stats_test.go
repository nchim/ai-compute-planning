package risk

import (
	"math"
	"testing"
)

func TestSummarize(t *testing.T) {
	// 1..10: P10 = 1.9, P50 = 5.5, P90 = 9.1 by linear interpolation on sorted positions; sample
	// variance = 82.5/9.
	xs := []float64{10, 3, 7, 1, 9, 2, 8, 4, 6, 5}
	d := summarize(xs)
	want := map[string]float64{"p10": 1.9, "p50": 5.5, "p90": 9.1, "mean": 5.5, "sd": math.Sqrt(82.5 / 9)}
	got := map[string]float64{"p10": d.GetP10(), "p50": d.GetP50(), "p90": d.GetP90(), "mean": d.GetMean(), "sd": d.GetStddev()}
	for k, w := range want {
		if math.Abs(got[k]-w) > 1e-9 {
			t.Errorf("%s = %g, want %g", k, got[k], w)
		}
	}
	if len(d.GetHistogram()) != histBins {
		t.Fatalf("%d bins, want %d", len(d.GetHistogram()), histBins)
	}
	var n int32
	for i, b := range d.GetHistogram() {
		n += b.GetCount()
		if b.GetLow() >= b.GetHigh() {
			t.Errorf("bin %d has low %g ≥ high %g", i, b.GetLow(), b.GetHigh())
		}
	}
	if n != int32(len(xs)) {
		t.Fatalf("histogram counts sum to %d, want %d", n, len(xs))
	}
	if first, last := d.GetHistogram()[0], d.GetHistogram()[histBins-1]; first.GetLow() != 1 || last.GetHigh() != 10 || last.GetCount() != 1 {
		t.Fatalf("histogram range/last bin wrong: %v … %v", first, last)
	}
}

func TestSummarizeDegenerate(t *testing.T) {
	for _, xs := range [][]float64{{4}, {4, 4, 4}} {
		d := summarize(xs)
		if d.GetP10() != 4 || d.GetP90() != 4 || d.GetMean() != 4 || d.GetStddev() != 0 {
			t.Fatalf("constant sample: %v", d)
		}
		var n int32
		for _, b := range d.GetHistogram() {
			n += b.GetCount()
		}
		if n != int32(len(xs)) {
			t.Fatalf("counts sum to %d, want %d", n, len(xs))
		}
	}
}
