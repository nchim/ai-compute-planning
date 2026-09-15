# AI-Lab Capacity Planner — top-level build. `make check` is what CI runs.
SHELL := /bin/bash
.DEFAULT_GOAL := check

# Go packages: `./engine/...` rather than `./...` because web/node_modules contains stray Go code.
GO_PKGS    := ./engine/...
STATICCHECK ?= $(shell go env GOPATH)/bin/staticcheck
WASM_OUT   := web/public/engine.wasm
WASM_EXEC  := $(shell go env GOROOT)/lib/wasm/wasm_exec.js

.PHONY: deps gen lint test check wasm web harness acceptance

## deps: install JS dependencies (run once, and after lockfile changes)
deps:
	cd web && npm ci
	cd harness && npm ci

## gen: regenerate Go (engine/pb) + TS (web/src/gen) from proto/ — output is committed
gen:
	cd proto && buf generate

## lint: buf lint, gofmt, go vet (native + js/wasm), staticcheck, tsc, eslint
lint:
	cd proto && buf lint
	@unformatted="$$(gofmt -l engine)"; if [ -n "$$unformatted" ]; then echo "gofmt needed:"; echo "$$unformatted"; exit 1; fi
	go vet $(GO_PKGS)
	GOOS=js GOARCH=wasm go vet ./engine/wasm/...
	$(STATICCHECK) $(GO_PKGS)
	cd web && npm run typecheck && npm run lint

## test: Go tests with the race detector + web unit tests
test:
	go test -race $(GO_PKGS)
	cd web && npm test

## check: lint + test (what CI runs)
check: lint test

## wasm: build the engine to web/public/engine.wasm and copy Go's JS shim next to it
wasm:
	GOOS=js GOARCH=wasm go build -o $(WASM_OUT) ./engine/wasm
	cp $(WASM_EXEC) web/public/wasm_exec.js

## web: production build of the SPA
web:
	cd web && npm run build

## harness: harness typecheck + Playwright smoke against the dev server (uses engine.wasm when built, else the fake engine)
harness:
	cd harness && npm run typecheck && npm run smoke

## acceptance: the scripted acceptance session (docs/acceptance-session.md T1–T7; the CI gate). Live mode: cd harness && npm run acceptance:live
acceptance:
	cd harness && npm run acceptance
