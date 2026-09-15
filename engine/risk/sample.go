package risk

import (
	"fmt"
	"math"
	"math/rand/v2"
	"strings"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

// newRNG is the single source of randomness: PCG seeded from run.monte_carlo.seed, so the same
// seed replays the same draws on every platform (including WASM).
func newRNG(seed int64) *rand.Rand {
	s := uint64(seed)
	return rand.New(rand.NewPCG(s, s^0x9E3779B97F4A7C15))
}

// sampler draws one value by inverse CDF from a uniform u ∈ (0,1); one draw consumes exactly one
// RNG value, so the draw sequence is a pure function of the seed.
type sampler interface {
	draw(rng *rand.Rand) float64
}

// uniform01 maps 53 random bits onto the open interval (0,1), keeping the normal quantile finite.
func uniform01(rng *rand.Rand) float64 {
	return (float64(rng.Uint64()>>11) + 0.5) / (1 << 53)
}

// normal: x = μ + σ·√2·erfinv(2u−1).
type normal struct{ mean, sd float64 }

func (n normal) draw(rng *rand.Rand) float64 {
	return n.mean + n.sd*math.Sqrt2*math.Erfinv(2*uniform01(rng)-1)
}

// triangular on [lo,hi] with mode: the CDF is quadratic on each side of the mode, so the quantile
// is a square root on each side, split at F(mode) = (mode−lo)/(hi−lo).
type triangular struct{ lo, mode, hi float64 }

func (t triangular) draw(rng *rand.Rand) float64 {
	u := uniform01(rng)
	width := t.hi - t.lo
	if u < (t.mode-t.lo)/width {
		return t.lo + math.Sqrt(u*width*(t.mode-t.lo))
	}
	return t.hi - math.Sqrt((1-u)*width*(t.hi-t.mode))
}

// uniform on [lo,hi): x = lo + u·(hi−lo).
type uniform struct{ lo, hi float64 }

func (d uniform) draw(rng *rand.Rand) float64 { return d.lo + uniform01(rng)*(d.hi-d.lo) }

// newSampler validates the distribution's parameters and returns its sampler. The error text is
// the diagnostic's message; the caller supplies the proto_path.
func newSampler(d *pb.InputDistribution) (sampler, error) {
	p := d.GetParams()
	for _, x := range p {
		if math.IsNaN(x) || math.IsInf(x, 0) {
			return nil, fmt.Errorf("params must be finite numbers")
		}
	}
	switch d.GetType() {
	case pb.DistributionType_NORMAL:
		if len(p) != 2 || p[1] <= 0 {
			return nil, fmt.Errorf("NORMAL needs params [mean, sd] with sd > 0")
		}
		return normal{p[0], p[1]}, nil
	case pb.DistributionType_TRIANGULAR:
		if len(p) != 3 || !(p[0] <= p[1] && p[1] <= p[2]) || p[0] == p[2] {
			return nil, fmt.Errorf("TRIANGULAR needs params [min, mode, max] with min ≤ mode ≤ max and min < max")
		}
		return triangular{p[0], p[1], p[2]}, nil
	case pb.DistributionType_UNIFORM:
		if len(p) != 2 || !(p[0] < p[1]) {
			return nil, fmt.Errorf("UNIFORM needs params [min, max] with min < max")
		}
		return uniform{p[0], p[1]}, nil
	}
	return nil, fmt.Errorf("type must be NORMAL, TRIANGULAR or UNIFORM")
}

// Bounded domains the core rejects values outside of. A draw is clamped to these so a normal on
// utilization_pct cannot fail validation at 100.1; every other field (prices, capex, months) is
// only sign-constrained and stays unclamped, so an out-of-domain draw surfaces as an invalid
// iteration (MC_INVALID_DRAWS) instead of silently piling up at a bound.
var boundedDomains = map[string][2]float64{
	"finance.discount_rate":    {0, 0.99},
	"finance.exit_cap_rate":    {0, 1},
	"site.water_stress_index":  {0, 1},
	"costs.gpu.residual_curve": {0, 1},
}

// clampToDomain clamps x to the target field's bounded domain, if it has one.
func clampToDomain(path string, x float64) float64 {
	lo, hi := 0.0, 100.0
	if b, ok := boundedDomains[strings.SplitN(path, "[", 2)[0]]; ok {
		lo, hi = b[0], b[1]
	} else if !strings.HasSuffix(path, "_pct") && !strings.HasSuffix(path, "_pct_yr") {
		return x
	}
	return math.Min(math.Max(x, lo), hi)
}
