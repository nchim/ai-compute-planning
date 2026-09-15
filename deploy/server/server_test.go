package main

import (
	"bufio"
	"bytes"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

const (
	testUser = "tester"
	testPass = "open-sesame"
	testKey  = "sk-ant-server-held"
)

var dist = fstest.MapFS{
	"index.html":            {Data: []byte("<!doctype html><title>spa</title>")},
	"engine.wasm":           {Data: []byte{0x00, 0x61, 0x73, 0x6d}},
	"wasm_exec.js":          {Data: []byte("globalThis.Go = class {}")},
	"assets/index-ab12.js":  {Data: []byte("console.log('hashed')")},
	"assets/index-ab12.css": {Data: []byte("body{}")},
}

// upstreamCall is what the fake Anthropic saw for one request.
type upstreamCall struct {
	method, path, query string
	header              http.Header
	body                string
}

type fixture struct {
	handler  http.Handler
	calls    chan upstreamCall
	upstream *httptest.Server
	clock    *time.Time
	// sessionLog receives the session sink's JSON lines (stdout in production).
	sessionLog *bytes.Buffer
}

// newFixture builds the full handler over an httptest upstream that records each call and answers
// with `reply`. The clock is frozen so the daily cap is deterministic.
func newFixture(t *testing.T, limit int, reply http.HandlerFunc) *fixture {
	t.Helper()
	calls := make(chan upstreamCall, 16)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Errorf("upstream read body: %v", err)
		}
		calls <- upstreamCall{r.Method, r.URL.Path, r.URL.RawQuery, r.Header.Clone(), string(body)}
		reply(w, r)
	}))
	t.Cleanup(upstream.Close)
	u, err := url.Parse(upstream.URL)
	if err != nil {
		t.Fatal(err)
	}
	clock := time.Date(2026, 9, 15, 23, 59, 30, 0, time.UTC)
	sessionLog := &bytes.Buffer{}
	h, err := newHandler(Config{
		Dist:            dist,
		Upstream:        u,
		AnthropicKey:    testKey,
		Username:        testUser,
		Password:        testPass,
		DailyRequestCap: limit,
		Now:             func() time.Time { return clock },
		Logger:          log.New(io.Discard, "", 0),
		SessionLogger:   newSessionLogger(sessionLog),
	})
	if err != nil {
		t.Fatal(err)
	}
	return &fixture{handler: h, calls: calls, upstream: upstream, clock: &clock, sessionLog: sessionLog}
}

func jsonReply(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = io.WriteString(w, `{"id":"msg_1","type":"message"}`)
}

func (f *fixture) do(t *testing.T, method, target string, authed bool, hdr map[string]string, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	if authed {
		req.SetBasicAuth(testUser, testPass)
	}
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	f.handler.ServeHTTP(rec, req)
	return rec
}

func (f *fixture) lastCall(t *testing.T) upstreamCall {
	t.Helper()
	select {
	case c := <-f.calls:
		return c
	case <-time.After(2 * time.Second):
		t.Fatal("upstream was not called")
		return upstreamCall{}
	}
}

func TestNewHandlerRejectsIncompleteConfig(t *testing.T) {
	u, _ := url.Parse("https://api.anthropic.com")
	good := Config{Dist: dist, Upstream: u, AnthropicKey: "k", Username: "u", Password: "p", DailyRequestCap: 1}
	cases := map[string]func(*Config){
		"no password": func(c *Config) { c.Password = "" },
		"no username": func(c *Config) { c.Username = "" },
		"no api key":  func(c *Config) { c.AnthropicKey = "" },
		"zero cap":    func(c *Config) { c.DailyRequestCap = 0 },
		"no upstream": func(c *Config) { c.Upstream = nil },
	}
	if _, err := newHandler(good); err != nil {
		t.Fatalf("valid config rejected: %v", err)
	}
	for name, mutate := range cases {
		cfg := good
		mutate(&cfg)
		if _, err := newHandler(cfg); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
}

func TestBasicAuth(t *testing.T) {
	f := newFixture(t, 10, jsonReply)
	cases := []struct {
		name       string
		user, pass string
		set        bool
		want       int
	}{
		{"no credentials", "", "", false, http.StatusUnauthorized},
		{"wrong password", testUser, "nope", true, http.StatusUnauthorized},
		{"wrong user", "admin", testPass, true, http.StatusUnauthorized},
		{"right", testUser, testPass, true, http.StatusOK},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			if tc.set {
				req.SetBasicAuth(tc.user, tc.pass)
			}
			rec := httptest.NewRecorder()
			f.handler.ServeHTTP(rec, req)
			if rec.Code != tc.want {
				t.Fatalf("status = %d, want %d", rec.Code, tc.want)
			}
			if tc.want == http.StatusUnauthorized {
				if got := rec.Header().Get("WWW-Authenticate"); !strings.HasPrefix(got, `Basic realm="capplanner"`) {
					t.Errorf("WWW-Authenticate = %q", got)
				}
				if !strings.Contains(rec.Body.String(), `"authentication_error"`) {
					t.Errorf("body = %s", rec.Body.String())
				}
			}
		})
	}
	// The relay is behind the same gate.
	if rec := f.do(t, http.MethodPost, "/api/anthropic/v1/messages", false, nil, "{}"); rec.Code != http.StatusUnauthorized {
		t.Errorf("relay without auth: %d", rec.Code)
	}
}

func TestHealthzIsOpen(t *testing.T) {
	f := newFixture(t, 10, jsonReply)
	rec := f.do(t, http.MethodGet, "/healthz", false, nil, "")
	if rec.Code != http.StatusOK || strings.TrimSpace(rec.Body.String()) != "ok" {
		t.Fatalf("healthz: %d %q", rec.Code, rec.Body.String())
	}
}

func TestStaticAndSPAFallback(t *testing.T) {
	f := newFixture(t, 10, jsonReply)
	cases := []struct {
		path        string
		status      int
		contentType string
		cache       string
		body        string
	}{
		{"/", 200, "text/html; charset=utf-8", "no-cache", "<title>spa</title>"},
		{"/index.html", 200, "text/html; charset=utf-8", "no-cache", "<title>spa</title>"},
		{"/site/abilene-1", 200, "text/html; charset=utf-8", "no-cache", "<title>spa</title>"},
		{"/engine.wasm", 200, "application/wasm", "no-cache", "\x00asm"},
		{"/wasm_exec.js", 200, "text/javascript; charset=utf-8", "no-cache", "globalThis.Go"},
		{"/assets/index-ab12.js", 200, "text/javascript; charset=utf-8", "public, max-age=31536000, immutable", "hashed"},
		{"/assets/index-ab12.css", 200, "text/css; charset=utf-8", "public, max-age=31536000, immutable", "body{}"},
		{"/missing.wasm", 404, "", "", ""},
		{"/../index.html", 301, "", "", ""}, // ServeMux redirects to the cleaned path; nothing escapes dist
		{"/assets/../engine.wasm", 301, "", "", ""},
	}
	for _, tc := range cases {
		t.Run(tc.path, func(t *testing.T) {
			rec := f.do(t, http.MethodGet, tc.path, true, nil, "")
			if rec.Code != tc.status {
				t.Fatalf("status = %d, want %d", rec.Code, tc.status)
			}
			if tc.status != 200 {
				return
			}
			if got := rec.Header().Get("Content-Type"); got != tc.contentType {
				t.Errorf("Content-Type = %q, want %q", got, tc.contentType)
			}
			if got := rec.Header().Get("Cache-Control"); got != tc.cache {
				t.Errorf("Cache-Control = %q, want %q", got, tc.cache)
			}
			if !strings.Contains(rec.Body.String(), tc.body) {
				t.Errorf("body = %q", rec.Body.String())
			}
		})
	}
	if rec := f.do(t, http.MethodPost, "/", true, nil, ""); rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("POST / = %d", rec.Code)
	}
}

func TestRelayInjectsKeyAndStripsClientSecrets(t *testing.T) {
	f := newFixture(t, 10, jsonReply)
	hdr := map[string]string{
		"Content-Type":      "application/json",
		"Anthropic-Version": "2023-06-01",
		"Anthropic-Beta":    "tools-2024-04-04",
		"X-Api-Key":         "sk-ant-from-browser",
		"Cookie":            "session=abc",
		"anthropic-dangerous-direct-browser-access": "true",
	}
	rec := f.do(t, http.MethodPost, "/api/anthropic/v1/messages?beta=true", true, hdr, `{"model":"claude-sonnet-5"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}
	call := f.lastCall(t)
	if call.method != http.MethodPost || call.path != "/v1/messages" || call.query != "beta=true" {
		t.Errorf("upstream saw %s %s?%s", call.method, call.path, call.query)
	}
	if call.body != `{"model":"claude-sonnet-5"}` {
		t.Errorf("body = %q", call.body)
	}
	want := map[string]string{"X-Api-Key": testKey, "Content-Type": "application/json", "Anthropic-Version": "2023-06-01", "Anthropic-Beta": "tools-2024-04-04"}
	for k, v := range want {
		if got := call.header.Get(k); got != v {
			t.Errorf("%s = %q, want %q", k, got, v)
		}
	}
	// Authorization carries the tester's Basic credentials; it must not reach Anthropic either.
	for _, k := range []string{"Authorization", "Cookie", "Anthropic-Dangerous-Direct-Browser-Access"} {
		if _, present := call.header[k]; present {
			t.Errorf("%s leaked upstream", k)
		}
	}
	if rec.Header().Get("X-Daily-Requests-Remaining") != "9" {
		t.Errorf("remaining = %q", rec.Header().Get("X-Daily-Requests-Remaining"))
	}
}

func TestRelayPathAllowList(t *testing.T) {
	f := newFixture(t, 10, jsonReply)
	cases := []struct {
		method, path string
		want         int
	}{
		{http.MethodPost, "/api/anthropic/v1/models", http.StatusNotFound},
		{http.MethodPost, "/api/anthropic/v1/messages/batches", http.StatusNotFound},
		{http.MethodPost, "/api/anthropic/", http.StatusNotFound},
		{http.MethodGet, "/api/anthropic/v1/messages", http.StatusMethodNotAllowed},
		{http.MethodDelete, "/api/anthropic/v1/messages", http.StatusMethodNotAllowed},
	}
	for _, tc := range cases {
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			rec := f.do(t, tc.method, tc.path, true, nil, "")
			if rec.Code != tc.want {
				t.Fatalf("status = %d, want %d", rec.Code, tc.want)
			}
		})
	}
	select {
	case c := <-f.calls:
		t.Fatalf("upstream reached: %+v", c)
	default:
	}
}

func TestRelayStreamsSSE(t *testing.T) {
	// The upstream emits two events with a flush and a pause between them; a buffering relay would
	// deliver both at once, so the first must arrive before the second is written.
	release := make(chan struct{})
	f := newFixture(t, 10, func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "event: message_start\ndata: {}\n\n")
		http.NewResponseController(w).Flush()
		<-release
		_, _ = io.WriteString(w, "event: message_stop\ndata: {}\n\n")
	})
	srv := httptest.NewServer(f.handler)
	defer srv.Close()

	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/anthropic/v1/messages", strings.NewReader("{}"))
	req.SetBasicAuth(testUser, testPass)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if ct := resp.Header.Get("Content-Type"); ct != "text/event-stream" {
		t.Fatalf("Content-Type = %q", ct)
	}
	r := bufio.NewReader(resp.Body)
	first, err := r.ReadString('\n')
	if err != nil || first != "event: message_start\n" {
		t.Fatalf("first line = %q, %v", first, err)
	}
	close(release)
	rest, err := io.ReadAll(r)
	if err != nil || !strings.Contains(string(rest), "event: message_stop") {
		t.Fatalf("rest = %q, %v", rest, err)
	}
}

func TestRelayUpstreamDown(t *testing.T) {
	f := newFixture(t, 10, jsonReply)
	f.upstream.Close()
	rec := f.do(t, http.MethodPost, "/api/anthropic/v1/messages", true, nil, "{}")
	if rec.Code != http.StatusBadGateway || !strings.Contains(rec.Body.String(), "upstream request failed") {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}
}

func TestDailyCap(t *testing.T) {
	f := newFixture(t, 2, jsonReply)
	post := func() *httptest.ResponseRecorder {
		return f.do(t, http.MethodPost, "/api/anthropic/v1/messages", true, nil, "{}")
	}
	for i := 0; i < 2; i++ {
		if rec := post(); rec.Code != http.StatusOK {
			t.Fatalf("request %d: %d", i+1, rec.Code)
		}
	}
	rec := post()
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"rate_limit_error"`) || !strings.Contains(rec.Body.String(), "daily cap of 2") {
		t.Errorf("body = %s", rec.Body.String())
	}
	if rec.Header().Get("Retry-After") != "31" {
		t.Errorf("Retry-After = %q, want 31 (30s to midnight, rounded up)", rec.Header().Get("Retry-After"))
	}
	// Rejected paths never count, and static/healthz are outside the cap entirely.
	if rec := f.do(t, http.MethodGet, "/api/anthropic/v1/messages", true, nil, ""); rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("GET relay = %d", rec.Code)
	}
	if rec := f.do(t, http.MethodGet, "/", true, nil, ""); rec.Code != http.StatusOK {
		t.Errorf("static under cap = %d", rec.Code)
	}
	// A new UTC day resets the count.
	*f.clock = f.clock.Add(time.Minute)
	if rec := post(); rec.Code != http.StatusOK {
		t.Errorf("after midnight: %d body = %s", rec.Code, rec.Body.String())
	}
}

func TestDailyCapIsSafeUnderConcurrency(t *testing.T) {
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	c := newDailyCap(50, func() time.Time { return now })
	granted := make(chan bool, 200)
	for i := 0; i < 200; i++ {
		go func() {
			_, ok := c.take()
			granted <- ok
		}()
	}
	n := 0
	for i := 0; i < 200; i++ {
		if <-granted {
			n++
		}
	}
	if n != 50 {
		t.Fatalf("granted %d, want 50", n)
	}
}
