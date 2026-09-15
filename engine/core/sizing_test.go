package core

import (
	"testing"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

func TestSizePhase(t *testing.T) {
	cases := []struct {
		name                 string
		itMw, kw, gpus, pue  float64
		cooling              pb.CoolingMode
		racks                int
		wantIt, wantFacility float64
	}{
		{"fixture air", 200, 40, 72, 1.2, pb.CoolingMode_AIR, 5000, 200, 240},
		{"liquid rounds up to whole racks", 10, 130, 72, 1.1, pb.CoolingMode_LIQUID_DTC, 77, 10.01, 11.011},
		{"one rack", 0.05, 100, 8, 1.3, pb.CoolingMode_LIQUID_DTC, 1, 0.1, 0.13},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := sizePhase(tc.itMw, tc.kw, tc.gpus, tc.pue, tc.cooling)
			if s.racks != tc.racks || !approxEq(s.itMw, tc.wantIt, 1e-9) || !approxEq(s.facilityMw, tc.wantFacility, 1e-9) {
				t.Fatalf("got racks=%d it=%g facility=%g, want %d %g %g", s.racks, s.itMw, s.facilityMw, tc.racks, tc.wantIt, tc.wantFacility)
			}
			if s.gpus != float64(tc.racks)*tc.gpus || s.whitespaceSqft > s.grossSqft || s.buildingAcres > s.footprintAcres {
				t.Fatalf("derived sizes inconsistent: %+v", s)
			}
			if s.coolingKw < s.heatKw {
				t.Fatalf("cooling %g < heat %g for a mode that supports the density", s.coolingKw, s.heatKw)
			}
		})
	}
}

func TestCoolingThresholds(t *testing.T) {
	cases := []struct {
		kw   float64
		want pb.CoolingMode
	}{{10, pb.CoolingMode_AIR}, {40, pb.CoolingMode_AIR}, {40.1, pb.CoolingMode_LIQUID_DTC}, {130, pb.CoolingMode_LIQUID_DTC}, {131, pb.CoolingMode_IMMERSION}, {600, pb.CoolingMode_IMMERSION}}
	for _, tc := range cases {
		if got := requiredCooling(tc.kw); got != tc.want {
			t.Errorf("requiredCooling(%g) = %v, want %v", tc.kw, got, tc.want)
		}
	}
	if coolingCeilingKw(pb.CoolingMode_AIR) != 40 || coolingCeilingKw(pb.CoolingMode_LIQUID_DTC) != 130 || coolingCeilingKw(pb.CoolingMode_IMMERSION) != 250 {
		t.Error("cooling ceilings differ from the documented constants")
	}
	if requiredFloorLoadPsf(pb.CoolingMode_AIR) != 150 || requiredFloorLoadPsf(pb.CoolingMode_LIQUID_DTC) != 300 {
		t.Error("floor-load thresholds differ from the documented constants")
	}
}
