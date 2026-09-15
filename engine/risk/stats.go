package risk

import (
	"math"
	"sort"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

const histBins = 20

// summarize reduces a non-empty sample to P10/P50/P90 (linear interpolation on the sorted sample),
// mean, sample standard deviation and a histBins-bin histogram over [min, max] whose counts sum to
// len(xs). The input slice is sorted in place.
func summarize(xs []float64) *pb.Distribution {
	sort.Float64s(xs)
	mean, sd := moments(xs)
	return &pb.Distribution{
		P10: quantile(xs, 0.10), P50: quantile(xs, 0.50), P90: quantile(xs, 0.90),
		Mean: mean, Stddev: sd, Histogram: histogram(xs),
	}
}

func quantile(sorted []float64, p float64) float64 {
	pos := p * float64(len(sorted)-1)
	lo := int(math.Floor(pos))
	if lo+1 >= len(sorted) {
		return sorted[len(sorted)-1]
	}
	frac := pos - float64(lo)
	return sorted[lo] + frac*(sorted[lo+1]-sorted[lo])
}

func moments(xs []float64) (mean, sd float64) {
	n := float64(len(xs))
	for _, x := range xs {
		mean += x
	}
	mean /= n
	if len(xs) < 2 {
		return mean, 0
	}
	var ss float64
	for _, x := range xs {
		ss += (x - mean) * (x - mean)
	}
	return mean, math.Sqrt(ss / (n - 1))
}

// histogram bins a sorted sample into histBins equal-width bins; the top bin is closed so the
// maximum is counted. A constant sample gets one unit-wide bin around its value.
func histogram(sorted []float64) []*pb.HistBin {
	lo, hi := sorted[0], sorted[len(sorted)-1]
	if hi == lo {
		hi = lo + 1
	}
	width := (hi - lo) / histBins
	bins := make([]*pb.HistBin, histBins)
	for i := range bins {
		bins[i] = &pb.HistBin{Low: lo + float64(i)*width, High: lo + float64(i+1)*width}
	}
	bins[histBins-1].High = hi
	for _, x := range sorted {
		i := int((x - lo) / width)
		if i >= histBins {
			i = histBins - 1
		}
		bins[i].Count++
	}
	return bins
}
