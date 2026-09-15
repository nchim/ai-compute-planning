package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"
)

const (
	defaultPort       = "8080"
	defaultStaticDir  = "web/dist"
	defaultUpstream   = "https://api.anthropic.com"
	defaultDailyCap   = 500
	defaultUsername   = "tester"
	shutdownGrace     = 15 * time.Second
	readHeaderTimeout = 10 * time.Second
	idleConnTimeout   = 120 * time.Second
)

func main() {
	logger := log.New(os.Stderr, "", log.LstdFlags|log.LUTC)
	if err := run(logger); err != nil {
		logger.Fatalf("server: %v", err)
	}
}

// run reads the environment, serves until SIGINT/SIGTERM, then drains in-flight requests.
func run(logger *log.Logger) error {
	cfg, addr, err := configFromEnv(logger)
	if err != nil {
		return err
	}
	handler, err := newHandler(cfg)
	if err != nil {
		return err
	}
	srv := &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: readHeaderTimeout,
		IdleTimeout:       idleConnTimeout,
		// No WriteTimeout: a streamed Messages reply may legitimately run for minutes; the relay
		// bounds each upstream call with its own context deadline instead.
		ErrorLog: logger,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	errc := make(chan error, 1)
	go func() { errc <- srv.ListenAndServe() }()
	logger.Printf("listening on %s (cap %d/day)", addr, cfg.DailyRequestCap)

	select {
	case err := <-errc:
		return fmt.Errorf("listen: %w", err)
	case <-ctx.Done():
	}
	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownGrace)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("shutdown: %w", err)
	}
	if err := <-errc; !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("serve: %w", err)
	}
	logger.Print("stopped")
	return nil
}

// configFromEnv fails fast on anything missing or malformed so a misconfigured deploy never comes up
// half-working (e.g. serving the SPA with a relay that can only 401).
func configFromEnv(logger *log.Logger) (Config, string, error) {
	staticDir := envOr("STATIC_DIR", defaultStaticDir)
	if _, err := os.Stat(staticDir + "/index.html"); err != nil {
		return Config{}, "", fmt.Errorf("STATIC_DIR %q has no index.html: %w (run `make web` first)", staticDir, err)
	}
	upstream, err := url.Parse(envOr("ANTHROPIC_BASE_URL", defaultUpstream))
	if err != nil {
		return Config{}, "", fmt.Errorf("ANTHROPIC_BASE_URL: %w", err)
	}
	capStr := envOr("DAILY_REQUEST_CAP", strconv.Itoa(defaultDailyCap))
	dailyCap, err := strconv.Atoi(capStr)
	if err != nil || dailyCap <= 0 {
		return Config{}, "", fmt.Errorf("DAILY_REQUEST_CAP must be a positive integer, got %q", capStr)
	}
	cfg := Config{
		Dist:            os.DirFS(staticDir),
		Upstream:        upstream,
		AnthropicKey:    os.Getenv("ANTHROPIC_API_KEY"),
		Username:        envOr("APP_USERNAME", defaultUsername),
		Password:        os.Getenv("APP_PASSWORD"),
		DailyRequestCap: dailyCap,
		Logger:          logger,
	}
	if cfg.AnthropicKey == "" {
		return Config{}, "", errors.New("ANTHROPIC_API_KEY is required")
	}
	if cfg.Password == "" {
		return Config{}, "", errors.New("APP_PASSWORD is required")
	}
	return cfg, ":" + envOr("PORT", defaultPort), nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
