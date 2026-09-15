// Command server hosts the built SPA (web/dist) behind HTTP Basic Auth and relays the Copilot's
// Anthropic calls with a server-held API key. It is the Cloud Run entrypoint (see deploy/cloudrun.md).
package main

import (
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"net/url"
	"time"
)

// Config is everything the handler needs; main fills it from the environment.
type Config struct {
	// Dist is the built SPA (web/dist).
	Dist fs.FS
	// Upstream is the Anthropic API origin, e.g. https://api.anthropic.com.
	Upstream *url.URL
	// AnthropicKey is injected as x-api-key on every relayed request.
	AnthropicKey string
	// Username and Password gate everything except /healthz.
	Username, Password string
	// DailyRequestCap bounds relayed requests per UTC day for this process.
	DailyRequestCap int
	// Now supplies the clock (tests freeze it); nil means time.Now.
	Now func() time.Time
	// Logger receives one line per request; nil means log.Default.
	Logger *log.Logger
}

const (
	relayPrefix  = "/api/anthropic"
	authRealm    = "capplanner"
	healthPath   = "/healthz"
	relayTimeout = 10 * time.Minute
)

// newHandler wires: request log → (healthz | basic auth → (relay | static SPA)).
func newHandler(cfg Config) (http.Handler, error) {
	if cfg.Username == "" || cfg.Password == "" {
		return nil, fmt.Errorf("basic auth credentials must be non-empty")
	}
	if cfg.AnthropicKey == "" {
		return nil, fmt.Errorf("anthropic api key must be non-empty")
	}
	if cfg.DailyRequestCap <= 0 {
		return nil, fmt.Errorf("daily request cap must be positive, got %d", cfg.DailyRequestCap)
	}
	if cfg.Upstream == nil {
		return nil, fmt.Errorf("upstream url must be set")
	}
	now := cfg.Now
	if now == nil {
		now = time.Now
	}
	logger := cfg.Logger
	if logger == nil {
		logger = log.Default()
	}

	quota := newDailyCap(cfg.DailyRequestCap, now)
	relay := messagesOnly(quota.guard(newRelay(cfg.Upstream, cfg.AnthropicKey)))

	authed := http.NewServeMux()
	authed.Handle(relayPrefix+"/", http.StripPrefix(relayPrefix, relay))
	authed.Handle("/", newSPA(cfg.Dist))

	mux := http.NewServeMux()
	mux.HandleFunc("GET "+healthPath, func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		fmt.Fprintln(w, "ok")
	})
	mux.Handle("/", basicAuth(cfg.Username, cfg.Password, authed))
	return requestLog(logger, now, mux), nil
}

// basicAuth challenges every request lacking the one shared credential. Comparison is constant-time
// on both fields so timing cannot leak which one mismatched.
func basicAuth(username, password string, next http.Handler) http.Handler {
	user, pass := []byte(username), []byte(password)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, p, ok := r.BasicAuth()
		userOK := subtle.ConstantTimeCompare([]byte(u), user) == 1
		passOK := subtle.ConstantTimeCompare([]byte(p), pass) == 1
		if !ok || !(userOK && passOK) {
			w.Header().Set("WWW-Authenticate", `Basic realm="`+authRealm+`", charset="UTF-8"`)
			writeError(w, http.StatusUnauthorized, "authentication_error", "this deployment requires the shared tester password")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// writeError replies in the Anthropic error envelope so the SDK maps relay-side failures onto the
// same error classes the UI already explains (401 → AuthenticationError, 429 → RateLimitError).
func writeError(w http.ResponseWriter, status int, kind, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	body := map[string]any{"type": "error", "error": map[string]string{"type": kind, "message": message}}
	// A write error here means the client hung up; the request log still records the status.
	_ = json.NewEncoder(w).Encode(body)
}
