package main

import (
	"log"
	"net/http"
	"time"
)

// requestLog writes one line per request: method, path, status, duration. Headers and bodies are
// never logged — they carry the tester password and the conversation.
func requestLog(logger *log.Logger, now func() time.Time, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		logger.Printf("%s %s %d %s", r.Method, r.URL.Path, rec.status, now().Sub(start).Round(time.Millisecond))
	})
}

// statusRecorder captures the status code. Unwrap lets http.ResponseController reach the underlying
// Flusher, which the reverse proxy relies on to stream SSE through this wrapper.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusRecorder) Unwrap() http.ResponseWriter { return s.ResponseWriter }
