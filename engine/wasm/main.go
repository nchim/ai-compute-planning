//go:build js && wasm

// Package main is the WASM entry point: it publishes globalThis.capplanner = {analyze, optimize},
// each taking and returning a Uint8Array of binary proto (SitePlan in, Result out). All logic lives
// in engine/bridge so it is tested natively; this file only converts between JS and Go byte slices.
package main

import (
	"errors"
	"syscall/js"

	"github.com/nchim/ai-compute-planning/engine/bridge"
)

func main() {
	b := bridge.Default()
	js.Global().Set("capplanner", map[string]any{
		bridge.OpAnalyze:  export(b, bridge.OpAnalyze),
		bridge.OpOptimize: export(b, bridge.OpOptimize),
	})
	// A Go WASM module must keep running for JS to call the functions registered above.
	select {}
}

func export(b bridge.Bridge, op string) js.Func {
	return js.FuncOf(func(_ js.Value, args []js.Value) any {
		in, err := bytesFromJS(args)
		if err != nil {
			return bytesToJS(bridge.Encode(bridge.Failure("MALFORMED_INPUT",
				"capplanner."+op+" expects a single Uint8Array argument", err.Error(),
				"Pass toBinary(SitePlanSchema, plan) as the only argument.")))
		}
		return bytesToJS(b.Call(op, in))
	})
}

var uint8Array = js.Global().Get("Uint8Array")

func bytesFromJS(args []js.Value) ([]byte, error) {
	if len(args) != 1 || !args[0].InstanceOf(uint8Array) {
		return nil, errors.New("argument is missing or not a Uint8Array")
	}
	out := make([]byte, args[0].Length())
	js.CopyBytesToGo(out, args[0])
	return out, nil
}

func bytesToJS(b []byte) js.Value {
	out := uint8Array.New(len(b))
	js.CopyBytesToJS(out, b)
	return out
}
