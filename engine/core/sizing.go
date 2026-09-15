package core

import (
	"math"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

// Cooling ceilings (kW/rack). Air tops out at 30–40 kW even with optimized containment; direct-to-chip
// liquid covers the GB200/GB300 NVL72 class at ~120–130 kW; immersion is the option above that.
// Source: research/topics/08-cooling-density/08-cooling-density.md (Introl, ToneCooling, IntuitionLabs).
const (
	airMaxKwPerRack       = 40.0
	liquidDtcMaxKwPerRack = 130.0
	immersionMaxKwPerRack = 250.0
)

// Floor-load thresholds (psf). Code-standard raised-floor design load is 100–150 psf; a liquid-cooled
// rack + CDU + manifolds needs slabs rated ≥15 kN/m² (~313 psf) and the research recommends building to
// 300–350 psf. Source: research/topics/05-facility-lifecycle/agility-adaptability-L2.md §2 (HuiYa 2026,
// Noxtel civil-works guide).
const (
	floorLoadAirMinPsf    = 150.0
	floorLoadLiquidMinPsf = 300.0
)

// Space and yard ratios. STUB: single-storey greenfield rules of thumb, not a layout engine.
const (
	whitespaceSqftPerRack = 40.0    // rack + hot/cold aisle share + containment
	grossToWhitespace     = 2.5     // electrical/mechanical rooms, corridors, loading
	siteToBuilding        = 3.0     // roads, laydown, yards, parking around the hall
	substationAcresPerMw  = 0.02    // switchyard + transformers, per facility MW
	gasPadAcresPerMw      = 0.05    // reciprocating engines / turbines + gas yard, per MW
	sqftPerAcre           = 43560.0 //
	sqmPerAcre            = 4046.86
	hoursPerMonth         = 730.0
)

// coolingCeilingKw is the maximum supportable rack density for a cooling mode.
func coolingCeilingKw(mode pb.CoolingMode) float64 {
	switch mode {
	case pb.CoolingMode_AIR:
		return airMaxKwPerRack
	case pb.CoolingMode_LIQUID_DTC:
		return liquidDtcMaxKwPerRack
	case pb.CoolingMode_IMMERSION:
		return immersionMaxKwPerRack
	}
	return 0
}

// requiredCooling is the least demanding cooling mode able to carry the density.
func requiredCooling(kwPerRack float64) pb.CoolingMode {
	switch {
	case kwPerRack <= airMaxKwPerRack:
		return pb.CoolingMode_AIR
	case kwPerRack <= liquidDtcMaxKwPerRack:
		return pb.CoolingMode_LIQUID_DTC
	}
	return pb.CoolingMode_IMMERSION
}

// requiredFloorLoadPsf is the slab rating a cooling mode needs.
func requiredFloorLoadPsf(mode pb.CoolingMode) float64 {
	if mode == pb.CoolingMode_AIR {
		return floorLoadAirMinPsf
	}
	return floorLoadLiquidMinPsf
}

// isLiquid reports whether the mode is a liquid-class (agility-premium-bearing) design.
func isLiquid(mode pb.CoolingMode) bool { return mode != pb.CoolingMode_AIR }

// sizing is the physical footprint of an IT load at a given density.
type sizing struct {
	itMw           float64 // sized IT load (whole racks), ≥ requested
	facilityMw     float64 // itMw × PUE
	racks          int
	gpus           float64
	heatKw         float64 // racks × kW/rack
	coolingKw      float64 // racks × ceiling of the cooling mode
	whitespaceSqft float64
	grossSqft      float64
	buildingAcres  float64
	footprintAcres float64 // building × siteToBuilding
}

// sizePhase sizes one block of IT load. Racks are whole, so the sized load can exceed the request by
// up to one rack; callers report the sized figure.
func sizePhase(itMw, kwPerRack, gpusPerRack, pue float64, cooling pb.CoolingMode) sizing {
	racks := int(math.Ceil(itMw*1000/kwPerRack - 1e-9))
	s := sizing{racks: racks, gpus: float64(racks) * gpusPerRack}
	s.itMw = float64(racks) * kwPerRack / 1000
	s.facilityMw = s.itMw * pue
	s.heatKw = float64(racks) * kwPerRack
	s.coolingKw = float64(racks) * coolingCeilingKw(cooling)
	s.whitespaceSqft = float64(racks) * whitespaceSqftPerRack
	s.grossSqft = s.whitespaceSqft * grossToWhitespace
	s.buildingAcres = s.grossSqft / sqftPerAcre
	s.footprintAcres = s.buildingAcres * siteToBuilding
	return s
}

// add accumulates another sizing into s (site totals).
func (s *sizing) add(o sizing) {
	s.itMw += o.itMw
	s.facilityMw += o.facilityMw
	s.racks += o.racks
	s.gpus += o.gpus
	s.heatKw += o.heatKw
	s.coolingKw += o.coolingKw
	s.whitespaceSqft += o.whitespaceSqft
	s.grossSqft += o.grossSqft
	s.buildingAcres += o.buildingAcres
	s.footprintAcres += o.footprintAcres
}
