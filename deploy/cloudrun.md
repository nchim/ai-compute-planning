# Cloud Run runbook — tester deployment

One container (`deploy/Dockerfile`) serves the SPA and relays the Copilot's Anthropic calls, gated by a
shared password. Project `ai-compute-planner`, region `us-central1`, service `capplanner`.

## What runs
`deploy/server` (Go, standard library only):
- Serves `web/dist` with SPA fallback; `engine.wasm` is `application/wasm`, hashed `assets/` are
  immutable, `index.html` is `no-cache`.
- **HTTP Basic Auth** on everything except `GET /healthz`: user `tester`, password from `APP_PASSWORD`
  (constant-time compare). Browsers prompt once per session.
- **`POST /api/anthropic/v1/messages`** is reverse-proxied to `https://api.anthropic.com/v1/messages`
  with `x-api-key` from `ANTHROPIC_API_KEY`. Only `content-type`, `accept`, `anthropic-version` and
  `anthropic-beta` are forwarded from the browser; any client `x-api-key`/`authorization`/cookie is
  dropped. Every other relay path is 404, every other method 405. SSE is flushed per chunk.
- **Daily cap**: `DAILY_REQUEST_CAP` (default 500) relayed requests per UTC day, counted in-process
  under a mutex. This is best-effort per instance (resets on restart, not shared between instances);
  it is meaningful because the service runs with `--min-instances 0 --max-instances 1`. Over the cap
  the relay answers 429 in the Anthropic error envelope, which the Copilot shows verbatim.
- Logs one line per request (method, path, status, duration); never headers or bodies.
- `PORT` from the environment; graceful drain on SIGTERM (Cloud Run gives 10 s by default).

The SPA is built with `VITE_COPILOT_RELAY=/api/anthropic VITE_ENGINE=wasm`, so the Copilot talks to
the relay on the page origin and the key panel is replaced by "Relay mode — key held server-side".

## One-time setup
```sh
gcloud config set project ai-compute-planner
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com

# Secrets (paste values on stdin; no trailing newline)
printf '%s' 'sk-ant-...'          | gcloud secrets create anthropic-api-key --data-file=-
printf '%s' "$(openssl rand -base64 18)" | gcloud secrets create app-password --data-file=-
gcloud secrets versions access latest --secret app-password   # this is what you share with testers

# Let the Cloud Run runtime service account read them (default compute SA unless you set one)
PROJECT_NUMBER=$(gcloud projects describe ai-compute-planner --format 'value(projectNumber)')
for s in anthropic-api-key app-password; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member "serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role roles/secretmanager.secretAccessor
done
```

## Deploy
```sh
make deploy
```
runs
```sh
gcloud run deploy capplanner --source . --region us-central1 --project ai-compute-planner \
  --allow-unauthenticated --min-instances 0 --max-instances 1 \
  --set-secrets ANTHROPIC_API_KEY=anthropic-api-key:latest,APP_PASSWORD=app-password:latest
```
`--source .` uploads the repo (minus `.gcloudignore`) to Cloud Build. Cloud Build only builds a
`Dockerfile` at the source root (anything else means Buildpacks), so `make deploy` stages a copy of
`deploy/Dockerfile` there for the upload and removes it afterwards; the root `Dockerfile` is
gitignored and `deploy/Dockerfile` stays the single source of truth.

`--allow-unauthenticated` is intentional: it disables Cloud Run's IAM check so testers without Google
accounts can reach the URL. Our own Basic Auth then gates every request, and the daily cap bounds the
spend if the password leaks.

Then share the service URL (printed by the deploy) and the password. Rotate the password with
`gcloud secrets versions add app-password --data-file=-` followed by `make deploy` (Cloud Run pins the
secret version at deploy time when using `:latest`).

## Operate
```sh
gcloud run services logs read capplanner --region us-central1 --limit 100
gcloud run services describe capplanner --region us-central1 --format 'value(status.url)'
gcloud run services update capplanner --region us-central1 --update-env-vars DAILY_REQUEST_CAP=200
curl -sS https://<url>/healthz          # no auth needed
curl -sS -u tester:<password> https://<url>/ | head -c 200
```

## Run the same thing locally
```sh
ANTHROPIC_API_KEY=sk-ant-... APP_PASSWORD=dev make serve   # http://localhost:8080, user tester
```
or build the image: `docker build -f deploy/Dockerfile -t capplanner .` then
`docker run -p 8080:8080 -e ANTHROPIC_API_KEY=... -e APP_PASSWORD=dev capplanner`.

## Security notes
- The Anthropic key never reaches the browser; the relay overwrites `x-api-key` and forwards only an
  allow-list of headers. The SDK's `anthropic-dangerous-direct-browser-access` header is removed
  client-side and would be dropped by the relay anyway.
- Basic Auth is a shared secret over TLS (Cloud Run terminates HTTPS). It is fine for a tester preview,
  not for per-user accountability — see issue #11 for the per-user auth follow-up.
- Transcripts stay in each tester's `localStorage`; nothing is stored server-side.
