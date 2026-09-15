package main

import (
	"context"
	"net/http"
	"net/http/httputil"
	"net/url"
)

// messagesPath is the only upstream endpoint the SPA needs; everything else is refused so the relay
// cannot be used as a general Anthropic proxy.
const messagesPath = "/v1/messages"

// forwardedHeaders is the allow-list of client headers copied upstream. Everything else, including
// any client-supplied x-api-key or authorization, is dropped rather than merely overwritten.
var forwardedHeaders = []string{"Content-Type", "Content-Length", "Accept", "Anthropic-Version", "Anthropic-Beta"}

// messagesOnly refuses anything but POST {messagesPath} (the prefix already stripped by the caller)
// before the request reaches the daily cap, so probing the relay does not spend budget.
func messagesOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != messagesPath {
			writeError(w, http.StatusNotFound, "not_found_error", "the relay only exposes POST "+messagesPath)
			return
		}
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", http.MethodPost)
			writeError(w, http.StatusMethodNotAllowed, "invalid_request_error", "the relay only exposes POST "+messagesPath)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// newRelay reverse-proxies to the upstream, injecting the server-held key and streaming SSE bodies
// through unbuffered. Each upstream call is bounded by relayTimeout.
func newRelay(upstream *url.URL, apiKey string) http.Handler {
	proxy := &httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.SetURL(upstream)
			pr.Out.Host = upstream.Host
			pr.Out.Header = make(http.Header, len(forwardedHeaders)+1)
			for _, h := range forwardedHeaders {
				if v := pr.In.Header.Values(h); len(v) > 0 {
					pr.Out.Header[h] = v
				}
			}
			pr.Out.Header.Set("X-Api-Key", apiKey)
		},
		// -1 flushes each chunk as it arrives, which is what keeps text/event-stream responsive.
		FlushInterval: -1,
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			if ctxErr := r.Context().Err(); ctxErr != nil {
				// The client aborted (Stop button) or the relay timeout fired; nothing to report to it.
				return
			}
			writeError(w, http.StatusBadGateway, "api_error", "upstream request failed: "+err.Error())
		},
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), relayTimeout)
		defer cancel()
		proxy.ServeHTTP(w, r.WithContext(ctx))
	})
}
