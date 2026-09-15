package core

import (
	"os"
	"testing"

	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

const fixtureDir = "../../fixtures/"

// fixtureNames lists every shared SitePlan under fixtures/ (README §Fixtures); each one has a golden
// Result under testdata/ and is loadable from the SPA's fixture dropdown.
var fixtureNames = []string{"abilene-1", "nova-colo", "epoch-100mw"}

// Every fixture must survive protojson → binary → protojson unchanged; this is the seam every other
// workstream (SPA, WASM bridge, harness) relies on.
func TestFixturesRoundTrip(t *testing.T) {
	for _, name := range fixtureNames {
		t.Run(name, func(t *testing.T) {
			raw, err := os.ReadFile(fixtureDir + name + ".json")
			if err != nil {
				t.Fatalf("read fixture: %v", err)
			}
			var plan pb.SitePlan
			if err := (protojson.UnmarshalOptions{DiscardUnknown: false}).Unmarshal(raw, &plan); err != nil {
				t.Fatalf("fixture is not a valid SitePlan: %v", err)
			}
			if plan.GetMeta().GetPlanId() != name {
				t.Fatalf("meta.plan_id = %q, want %q (the file name)", plan.GetMeta().GetPlanId(), name)
			}

			wire, err := proto.Marshal(&plan)
			if err != nil {
				t.Fatalf("marshal binary: %v", err)
			}
			var fromWire pb.SitePlan
			if err := proto.Unmarshal(wire, &fromWire); err != nil {
				t.Fatalf("unmarshal binary: %v", err)
			}
			if !proto.Equal(&plan, &fromWire) {
				t.Fatal("binary round trip changed the plan")
			}

			jsonAgain, err := protojson.Marshal(&fromWire)
			if err != nil {
				t.Fatalf("marshal protojson: %v", err)
			}
			var fromJSON pb.SitePlan
			if err := protojson.Unmarshal(jsonAgain, &fromJSON); err != nil {
				t.Fatalf("unmarshal protojson: %v", err)
			}
			if !proto.Equal(&plan, &fromJSON) {
				t.Fatal("protojson round trip changed the plan")
			}
		})
	}
}
