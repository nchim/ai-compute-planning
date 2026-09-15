//go:build js && wasm

// Package main is the WASM entry point for the engine.
//
// STUB: the real bridge (capplanner.analyze / capplanner.optimize exports, bytes in → bytes out,
// panics recovered into an INTERNAL_ERROR diagnostic) is WS5. This placeholder only proves the
// GOOS=js GOARCH=wasm build works end to end.
package main

func main() {
	// Block forever: a Go WASM module must keep running for JS to call exports registered later.
	select {}
}
