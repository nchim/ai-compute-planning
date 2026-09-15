package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

const sessionURL = "/api/session"

// sessionFixture is the full handler (daily cap 2) with the session sink writing into a buffer.
func sessionFixture(t *testing.T) (*fixture, *bytes.Buffer) {
	t.Helper()
	f := newFixture(t, 2, jsonReply)
	return f, f.sessionLog
}

func TestSessionRequiresAuth(t *testing.T) {
	f, buf := sessionFixture(t)
	rec := f.do(t, http.MethodPost, sessionURL, false, nil, `{"session_id":"s1","kind":"error","payload":{}}`)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
	if buf.Len() != 0 {
		t.Errorf("unauthenticated event was logged: %s", buf.String())
	}
}

func TestSessionHappyPathLogsOneJSONLine(t *testing.T) {
	f, buf := sessionFixture(t)
	body := `{"session_id":"s1","plan_id":"abilene-1","kind":"copilot_turn","seq":7,"payload":{"user":"hi","tools":[{"name":"run_analyze"}]}}`
	rec := f.do(t, http.MethodPost, sessionURL, true, map[string]string{"Content-Type": "application/json"}, body)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}
	lines := strings.Split(strings.TrimSpace(buf.String()), "\n")
	if len(lines) != 1 {
		t.Fatalf("logged %d lines, want 1: %q", len(lines), buf.String())
	}
	var got map[string]any
	if err := json.Unmarshal([]byte(lines[0]), &got); err != nil {
		t.Fatalf("log line is not JSON: %v: %s", err, lines[0])
	}
	want := map[string]any{
		"session_event": true,
		"received_at":   "2026-09-15T23:59:30Z",
		"session_id":    "s1",
		"plan_id":       "abilene-1",
		"kind":          "copilot_turn",
		"seq":           float64(7),
	}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("%s = %#v, want %#v", k, got[k], v)
		}
	}
	payload, _ := json.Marshal(got["payload"])
	if string(payload) != `{"tools":[{"name":"run_analyze"}],"user":"hi"}` {
		t.Errorf("payload = %s", payload)
	}
}

func TestSessionRedactsAPIKeys(t *testing.T) {
	f, buf := sessionFixture(t)
	body := `{"session_id":"s1","kind":"error","payload":{"message":"sk-ant-api03-SECRET rejected","nested":{"keys":["ok","sk-ant-x"]},"safe":"contains sk-ant-y inside"}}`
	if rec := f.do(t, http.MethodPost, sessionURL, true, nil, body); rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}
	line := buf.String()
	if strings.Contains(line, "SECRET") || strings.Contains(line, "sk-ant-x") || strings.Contains(line, "sk-ant-y") {
		t.Fatalf("key leaked into the log: %s", line)
	}
	if !strings.Contains(line, `"message":"sk-ant-[redacted] rejected"`) || !strings.Contains(line, `["ok","sk-ant-[redacted]"]`) {
		t.Errorf("redaction shape: %s", line)
	}
}

func TestSessionRejectsBadInput(t *testing.T) {
	f, buf := sessionFixture(t)
	big := `{"session_id":"s1","kind":"commands","payload":"` + strings.Repeat("x", maxSessionBody) + `"}`
	cases := []struct {
		name, method, body string
		want               int
	}{
		{"malformed json", http.MethodPost, `{"session_id":`, http.StatusBadRequest},
		{"not an object", http.MethodPost, `[1,2]`, http.StatusBadRequest},
		{"missing session_id", http.MethodPost, `{"kind":"error","payload":{}}`, http.StatusBadRequest},
		{"missing kind", http.MethodPost, `{"session_id":"s1","payload":{}}`, http.StatusBadRequest},
		{"too large", http.MethodPost, big, http.StatusRequestEntityTooLarge},
		{"get", http.MethodGet, "", http.StatusMethodNotAllowed},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := f.do(t, tc.method, sessionURL, true, nil, tc.body)
			if rec.Code != tc.want {
				t.Fatalf("status = %d, want %d: %s", rec.Code, tc.want, rec.Body.String())
			}
		})
	}
	if buf.Len() != 0 {
		t.Errorf("rejected events were logged: %s", buf.String())
	}
}

func TestSessionDoesNotSpendTheDailyCap(t *testing.T) {
	f, _ := sessionFixture(t) // cap of 2
	for i := 0; i < 5; i++ {
		if rec := f.do(t, http.MethodPost, sessionURL, true, nil, `{"session_id":"s1","kind":"error","payload":{}}`); rec.Code != http.StatusNoContent {
			t.Fatalf("event %d: %d", i, rec.Code)
		}
	}
	rec := f.do(t, http.MethodPost, "/api/anthropic/v1/messages", true, nil, "{}")
	if rec.Code != http.StatusOK || rec.Header().Get("X-Daily-Requests-Remaining") != "1" {
		t.Fatalf("relay after session events: %d remaining=%q", rec.Code, rec.Header().Get("X-Daily-Requests-Remaining"))
	}
}

func TestRedactKeys(t *testing.T) {
	in := map[string]any{"a": "sk-ant-abc def", "b": []any{1.0, "x", map[string]any{"c": "sk-ant-"}}, "d": true}
	got, _ := json.Marshal(redactKeys(in))
	want := `{"a":"sk-ant-[redacted] def","b":[1,"x",{"c":"sk-ant-[redacted]"}],"d":true}`
	if string(got) != want {
		t.Errorf("got %s\nwant %s", got, want)
	}
}

// Ensure the sink's default logger writes bare JSON (no timestamp prefix, or Cloud Logging cannot parse it).
func TestSessionLoggerHasNoPrefix(t *testing.T) {
	var buf bytes.Buffer
	l := newSessionLogger(&buf)
	l.Print(`{"x":1}`)
	if buf.String() != "{\"x\":1}\n" {
		t.Errorf("line = %q", buf.String())
	}
	if l.Flags() != 0 || l.Prefix() != "" {
		t.Errorf("flags=%d prefix=%q", l.Flags(), l.Prefix())
	}
}
