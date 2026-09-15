# AI-Lab Capacity Planner — top-level build. `make check` is what CI runs.
SHELL := /bin/bash
.DEFAULT_GOAL := check

# Go packages: explicit rather than `./...` because web/node_modules contains stray Go code.
GO_PKGS    := ./engine/... ./deploy/...
STATICCHECK ?= $(shell go env GOPATH)/bin/staticcheck
WASM_OUT   := web/public/engine.wasm
WASM_EXEC  := $(shell go env GOROOT)/lib/wasm/wasm_exec.js

GCP_PROJECT ?= ai-compute-planner
GCP_REGION  ?= us-central1
SERVICE     ?= capplanner

.PHONY: deps gen lint test check wasm web harness acceptance serve deploy sessions
HOURS ?= 4

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
	@unformatted="$$(gofmt -l engine deploy)"; if [ -n "$$unformatted" ]; then echo "gofmt needed:"; echo "$$unformatted"; exit 1; fi
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
	cd harness && npm run typecheck && npm test

## serve: run the deployed configuration locally (relay build + Go server) — needs ANTHROPIC_API_KEY and APP_PASSWORD
serve: wasm
	cd web && VITE_COPILOT_RELAY=/api/anthropic VITE_ENGINE=wasm npm run build
	go run ./deploy/server

## deploy: build from source on Cloud Build and roll out the Cloud Run service (see deploy/cloudrun.md).
## Cloud Build only honours a root Dockerfile, so deploy/Dockerfile is staged there for the upload.
deploy:
	cp deploy/Dockerfile Dockerfile
	trap 'rm -f Dockerfile' EXIT; \
	gcloud run deploy $(SERVICE) --source . --region $(GCP_REGION) --project $(GCP_PROJECT) \
		--allow-unauthenticated --min-instances 0 --max-instances 1 \
		--set-secrets ANTHROPIC_API_KEY=anthropic-api-key:latest,APP_PASSWORD=app-password:latest

## sessions: print shared tester sessions from the last HOURS (default 4) as transcripts (see deploy/cloudrun.md)
sessions:
	python3 deploy/sessions.py --hours $(HOURS) --project $(GCP_PROJECT) --service $(SERVICE)
