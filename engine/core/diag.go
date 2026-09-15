package core

import (
	"fmt"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

// Diagnostic codes. Stable: the agent and the harness match on them.
const (
	codeMissingRequired       = "MISSING_REQUIRED"
	codeOutOfRange            = "OUT_OF_RANGE"
	codeUnknownPowerSource    = "UNKNOWN_POWER_SOURCE"
	codeDensityExceedsCooling = "DENSITY_EXCEEDS_COOLING"
	codeFloorLoadInsufficient = "FLOOR_LOAD_INSUFFICIENT"
	codePhaseBeforePower      = "PHASE_BEFORE_POWER"
	codePowerUndersupply      = "POWER_UNDERSUPPLY"
	codeSourceOverloaded      = "SOURCE_OVERLOADED"
	codeFootprintOverParcel   = "FOOTPRINT_OVER_PARCEL"
	codeUseOptimize           = "USE_OPTIMIZE"
	codePhasesNeTarget        = "PHASES_NE_TARGET"
	codeEnergizeAfterHold     = "ENERGIZE_AFTER_HOLD"
	codeIrrUndefined          = "IRR_UNDEFINED"
	codeStorageNotFirm        = "STORAGE_NOT_FIRM"
	codeConservationFailed    = "CONSERVATION_FAILED"
)

// diags collects diagnostics in emission order; the pipeline appends, never reorders.
type diags []*pb.Diagnostic

func (d *diags) add(sev pb.Severity, code, path, msg, expected, actual, hint string) {
	*d = append(*d, &pb.Diagnostic{
		Severity: sev, Code: code, Message: msg, ProtoPath: path,
		Expected: expected, Actual: actual, Hint: hint,
	})
}

func (d *diags) errorf(code, path, expected, actual, hint, format string, args ...any) {
	d.add(pb.Severity_ERROR, code, path, fmt.Sprintf(format, args...), expected, actual, hint)
}

func (d *diags) warnf(code, path, expected, actual, hint, format string, args ...any) {
	d.add(pb.Severity_WARNING, code, path, fmt.Sprintf(format, args...), expected, actual, hint)
}

func (d *diags) infof(code, path, expected, actual, hint, format string, args ...any) {
	d.add(pb.Severity_INFO, code, path, fmt.Sprintf(format, args...), expected, actual, hint)
}

func (d diags) hasErrors() bool {
	for _, x := range d {
		if x.GetSeverity() == pb.Severity_ERROR {
			return true
		}
	}
	return false
}

// status derives the Result status from the diagnostics alone; ERROR > WARNING > OK.
func (d diags) status() pb.Status {
	if d.hasErrors() {
		return pb.Status_INVALID_INPUT
	}
	for _, x := range d {
		if x.GetSeverity() == pb.Severity_WARNING {
			return pb.Status_OK_WITH_WARNINGS
		}
	}
	return pb.Status_OK
}
