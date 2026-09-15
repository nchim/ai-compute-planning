# syntax=docker/dockerfile:1
# Cloud Run image: the Go stage builds engine.wasm + the relay server, the Node stage builds the SPA
# against the relay, and the final distroless image holds only the static server binary and web/dist.
# Build from the repo root: docker build -f deploy/Dockerfile .

FROM golang:1.25 AS go-build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY engine ./engine
COPY deploy/server ./deploy/server
RUN GOOS=js GOARCH=wasm go build -o /out/engine.wasm ./engine/wasm \
 && cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" /out/wasm_exec.js
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./deploy/server

FROM node:22 AS web-build
WORKDIR /src
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci
# The SPA bundles docs/agent-system-prompt.md, research/**/*.md and fixtures/*.json from the repo root.
COPY docs ./docs
COPY research ./research
COPY fixtures ./fixtures
COPY web ./web
COPY --from=go-build /out/engine.wasm /out/wasm_exec.js ./web/public/
ENV VITE_COPILOT_RELAY=/api/anthropic VITE_ENGINE=wasm
RUN cd web && npm run build

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=go-build /out/server /server
COPY --from=web-build /src/web/dist /srv/dist
ENV STATIC_DIR=/srv/dist PORT=8080
EXPOSE 8080
ENTRYPOINT ["/server"]
