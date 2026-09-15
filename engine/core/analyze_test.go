package core

import (
	"testing"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

func TestAnalyzeStubIsVisible(t *testing.T) {
	got := Analyze(&pb.SitePlan{})

	if got.GetStatus() != pb.Status_INVALID_INPUT {
		t.Fatalf("status = %v, want INVALID_INPUT", got.GetStatus())
	}
	if n := len(got.GetDiagnostics()); n != 1 {
		t.Fatalf("got %d diagnostics, want exactly 1", n)
	}
	d := got.GetDiagnostics()[0]
	if d.GetCode() != "NOT_IMPLEMENTED" || d.GetSeverity() != pb.Severity_INFO {
		t.Fatalf("diagnostic = %s/%v, want NOT_IMPLEMENTED/INFO", d.GetCode(), d.GetSeverity())
	}
}
