package risk

import (
	"math"
	"testing"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

// Each sampler's first two moments must match the closed form within tolerance over 20k draws.
func TestSamplerMoments(t *testing.T) {
	const n = 20000
	cases := []struct {
		name     string
		typ      pb.DistributionType
		params   []float64
		mean, sd float64
	}{
		{"normal", pb.DistributionType_NORMAL, []float64{80, 8}, 80, 8},
		{"triangular", pb.DistributionType_TRIANGULAR, []float64{1.5, 2.25, 3.0}, 2.25, math.Sqrt((1.5*1.5 + 2.25*2.25 + 9 - 1.5*2.25 - 1.5*3 - 2.25*3) / 18)},
		{"triangular-skew", pb.DistributionType_TRIANGULAR, []float64{0, 1, 4}, 5.0 / 3, math.Sqrt((0 + 1 + 16 - 0 - 0 - 4) / 18.0)},
		{"uniform", pb.DistributionType_UNIFORM, []float64{3, 7}, 5, 4 / math.Sqrt(12)},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			s, err := newSampler(&pb.InputDistribution{Type: c.typ, Params: c.params})
			if err != nil {
				t.Fatal(err)
			}
			rng := newRNG(42)
			var sum, sq float64
			for i := 0; i < n; i++ {
				x := s.draw(rng)
				sum += x
				sq += x * x
			}
			mean := sum / n
			sd := math.Sqrt(sq/n - mean*mean)
			if math.Abs(mean-c.mean) > 0.02*c.sd+1e-9 {
				t.Errorf("mean %g, want %g", mean, c.mean)
			}
			if math.Abs(sd-c.sd)/c.sd > 0.03 {
				t.Errorf("sd %g, want %g", sd, c.sd)
			}
		})
	}
}

func TestSamplerSupport(t *testing.T) {
	s, _ := newSampler(&pb.InputDistribution{Type: pb.DistributionType_TRIANGULAR, Params: []float64{1, 2, 3}})
	u, _ := newSampler(&pb.InputDistribution{Type: pb.DistributionType_UNIFORM, Params: []float64{3, 7}})
	rng := newRNG(1)
	for i := 0; i < 5000; i++ {
		if x := s.draw(rng); x < 1 || x > 3 {
			t.Fatalf("triangular draw %g outside [1,3]", x)
		}
		if x := u.draw(rng); x < 3 || x >= 7 {
			t.Fatalf("uniform draw %g outside [3,7)", x)
		}
	}
}

func TestSamplerDeterministic(t *testing.T) {
	s, _ := newSampler(&pb.InputDistribution{Type: pb.DistributionType_NORMAL, Params: []float64{0, 1}})
	a, b := newRNG(99), newRNG(99)
	for i := 0; i < 100; i++ {
		if x, y := s.draw(a), s.draw(b); x != y {
			t.Fatalf("draw %d differs: %g vs %g", i, x, y)
		}
	}
}

func TestNewSamplerRejectsBadParams(t *testing.T) {
	cases := []struct {
		name   string
		typ    pb.DistributionType
		params []float64
	}{
		{"unspecified", pb.DistributionType_DIST_UNSPECIFIED, []float64{1, 2}},
		{"normal-arity", pb.DistributionType_NORMAL, []float64{1}},
		{"normal-sd", pb.DistributionType_NORMAL, []float64{1, 0}},
		{"tri-arity", pb.DistributionType_TRIANGULAR, []float64{1, 2}},
		{"tri-order", pb.DistributionType_TRIANGULAR, []float64{1, 3, 2}},
		{"tri-degenerate", pb.DistributionType_TRIANGULAR, []float64{2, 2, 2}},
		{"uni-arity", pb.DistributionType_UNIFORM, []float64{1, 2, 3}},
		{"uni-order", pb.DistributionType_UNIFORM, []float64{2, 2}},
		{"nan", pb.DistributionType_UNIFORM, []float64{math.NaN(), 2}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if _, err := newSampler(&pb.InputDistribution{Type: c.typ, Params: c.params}); err == nil {
				t.Fatal("expected an error")
			}
		})
	}
}

func TestClampToDomain(t *testing.T) {
	cases := []struct {
		path    string
		in, out float64
	}{
		{"revenue.compute.utilization_pct", 112, 100},
		{"revenue.compute.utilization_pct", -3, 0},
		{"revenue.compute.utilization_pct", 80, 80},
		{"finance.discount_rate", 1.2, 0.99},
		{"site.water_stress_index", 1.5, 1},
		{"costs.gpu.residual_curve[0]", -0.1, 0},
		{"revenue.compute.gpu_hour_price", -1, -1}, // unbounded: left for core validation to reject
	}
	for _, c := range cases {
		if got := clampToDomain(c.path, c.in); got != c.out {
			t.Errorf("clamp(%s, %g) = %g, want %g", c.path, c.in, got, c.out)
		}
	}
}
