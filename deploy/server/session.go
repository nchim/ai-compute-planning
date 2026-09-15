package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"regexp"
	"time"
)

// Session sharing: the SPA (web/src/telemetry) posts one event per request when the tester has
// "Share session with developer" on. Each accepted event becomes one bare JSON line on stdout, which
// Cloud Run ingests as a structured `jsonPayload` (query: `jsonPayload.session_event=true`; reader:
// deploy/sessions.py). Nothing is stored by this process.

const (
	sessionPath = "/api/session"
	// maxSessionBody bounds one event; the SPA chunks command batches to stay well under it.
	maxSessionBody = 256 << 10
)

// sessionEvent is the wire format the SPA posts. Payload is kept opaque so the client can evolve
// its shapes without a server change; only its strings are inspected, for redaction.
type sessionEvent struct {
	SessionID string          `json:"session_id"`
	PlanID    string          `json:"plan_id"`
	Kind      string          `json:"kind"`
	Seq       int             `json:"seq"`
	Payload   json.RawMessage `json:"payload"`
}

// sessionLine is what gets logged; the flat top-level fields are what the reader groups and sorts on.
type sessionLine struct {
	SessionEvent bool   `json:"session_event"`
	ReceivedAt   string `json:"received_at"`
	SessionID    string `json:"session_id"`
	PlanID       string `json:"plan_id"`
	Kind         string `json:"kind"`
	Seq          int    `json:"seq"`
	Payload      any    `json:"payload"`
}

// newSessionLogger writes bare lines (no prefix, no timestamp) so each is valid JSON on its own.
func newSessionLogger(w io.Writer) *log.Logger {
	return log.New(w, "", 0)
}

// newSessionSink accepts POST {sessionPath} and logs each event through `logger`, which serializes
// concurrent writes. Rejections never log anything.
func newSessionSink(logger *log.Logger, now func() time.Time) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", http.MethodPost)
			writeError(w, http.StatusMethodNotAllowed, "invalid_request_error", "session events are POST only")
			return
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxSessionBody))
		if err != nil {
			var tooBig *http.MaxBytesError
			if errors.As(err, &tooBig) {
				writeError(w, http.StatusRequestEntityTooLarge, "invalid_request_error", "session event exceeds 256 KB")
				return
			}
			writeError(w, http.StatusBadRequest, "invalid_request_error", "could not read body: "+err.Error())
			return
		}
		ev, err := parseSessionEvent(body)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request_error", "malformed session event: "+err.Error())
			return
		}
		line, err := json.Marshal(sessionLine{
			SessionEvent: true,
			ReceivedAt:   now().UTC().Format(time.RFC3339),
			SessionID:    ev.SessionID,
			PlanID:       ev.PlanID,
			Kind:         ev.Kind,
			Seq:          ev.Seq,
			Payload:      redactKeys(ev.payload),
		})
		if err != nil {
			// Unreachable for values produced by json.Unmarshal; reported rather than ignored.
			writeError(w, http.StatusInternalServerError, "api_error", "could not encode session event: "+err.Error())
			return
		}
		logger.Print(string(line))
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusNoContent)
	})
}

// parsedEvent is a sessionEvent with its payload decoded into plain JSON values.
type parsedEvent struct {
	sessionEvent
	payload any
}

func parseSessionEvent(body []byte) (parsedEvent, error) {
	var ev sessionEvent
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&ev); err != nil {
		return parsedEvent{}, err
	}
	if ev.SessionID == "" {
		return parsedEvent{}, errors.New("session_id is required")
	}
	if ev.Kind == "" {
		return parsedEvent{}, errors.New("kind is required")
	}
	var payload any
	if len(ev.Payload) > 0 {
		if err := json.Unmarshal(ev.Payload, &payload); err != nil {
			return parsedEvent{}, err
		}
	}
	return parsedEvent{sessionEvent: ev, payload: payload}, nil
}

// apiKeyPattern matches an Anthropic key wherever it appears in a string, not only at the start,
// so a key quoted inside an error message is caught too.
var apiKeyPattern = regexp.MustCompile(`sk-ant-[A-Za-z0-9_-]*`)

// redactKeys walks decoded JSON and masks every API key in every string; the client does the same,
// this is the defence in depth.
func redactKeys(v any) any {
	switch x := v.(type) {
	case string:
		return apiKeyPattern.ReplaceAllString(x, "sk-ant-[redacted]")
	case []any:
		for i, e := range x {
			x[i] = redactKeys(e)
		}
		return x
	case map[string]any:
		for k, e := range x {
			x[k] = redactKeys(e)
		}
		return x
	default:
		return v
	}
}
