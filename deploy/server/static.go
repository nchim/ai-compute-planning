package main

import (
	"io"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// contentTypes pins the types the browser is strict about: WebAssembly.instantiateStreaming refuses
// anything but application/wasm, and module scripts must be a JavaScript type.
var contentTypes = map[string]string{
	".wasm": "application/wasm",
	".js":   "text/javascript; charset=utf-8",
	".mjs":  "text/javascript; charset=utf-8",
}

// newSPA serves dist with the usual single-page rules: a path that names a file is served as that
// file; a path with no extension is a client-side route and gets index.html; a path that looks like
// a file but is missing is a 404, so a forgotten engine.wasm fails loudly instead of as HTML.
func newSPA(dist fs.FS) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			writeError(w, http.StatusMethodNotAllowed, "invalid_request_error", "static files accept GET and HEAD only")
			return
		}
		name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
		info := statFile(dist, name)
		if info == nil {
			if path.Ext(name) != "" {
				http.NotFound(w, r)
				return
			}
			name = "index.html"
			if info = statFile(dist, name); info == nil {
				http.Error(w, "index.html missing from dist", http.StatusInternalServerError)
				return
			}
		}
		f, err := dist.Open(name)
		if err != nil {
			http.Error(w, "open "+name+": "+err.Error(), http.StatusInternalServerError)
			return
		}
		defer f.Close()
		content, ok := f.(io.ReadSeeker)
		if !ok {
			http.Error(w, name+" is not seekable", http.StatusInternalServerError)
			return
		}
		if ct, ok := contentTypes[path.Ext(name)]; ok {
			w.Header().Set("Content-Type", ct)
		}
		w.Header().Set("Cache-Control", cacheControl(name))
		// ServeContent rather than ServeFileFS: the latter redirects /index.html to / and re-cleans
		// the URL, both of which fight the SPA fallback decided above.
		http.ServeContent(w, r, name, info.ModTime(), content)
	})
}

// statFile returns the entry's info when name is an existing regular file, else nil.
func statFile(dist fs.FS, name string) fs.FileInfo {
	info, err := fs.Stat(dist, name)
	if err != nil || info.IsDir() {
		return nil
	}
	return info
}

// cacheControl: Vite writes content-hashed files under assets/, safe to cache forever; everything
// else (index.html, engine.wasm, wasm_exec.js) is addressed by a stable name and must revalidate.
func cacheControl(name string) string {
	if strings.HasPrefix(name, "assets/") {
		return "public, max-age=31536000, immutable"
	}
	return "no-cache"
}
