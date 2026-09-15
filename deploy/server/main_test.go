package main

import (
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestConfigFromEnv(t *testing.T) {
	distDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(distDir, "index.html"), []byte("<html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	base := map[string]string{
		"STATIC_DIR":        distDir,
		"ANTHROPIC_API_KEY": "sk-ant-x",
		"APP_PASSWORD":      "pw",
		"PORT":              "9090",
		"DAILY_REQUEST_CAP": "",
		"APP_USERNAME":      "",
	}
	cases := []struct {
		name    string
		env     map[string]string
		wantErr string
	}{
		{"defaults", nil, ""},
		{"no dist", map[string]string{"STATIC_DIR": t.TempDir()}, "no index.html"},
		{"no key", map[string]string{"ANTHROPIC_API_KEY": ""}, "ANTHROPIC_API_KEY"},
		{"no password", map[string]string{"APP_PASSWORD": ""}, "APP_PASSWORD"},
		{"bad cap", map[string]string{"DAILY_REQUEST_CAP": "lots"}, "DAILY_REQUEST_CAP"},
		{"zero cap", map[string]string{"DAILY_REQUEST_CAP": "0"}, "DAILY_REQUEST_CAP"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			for k, v := range base {
				t.Setenv(k, v)
			}
			for k, v := range tc.env {
				t.Setenv(k, v)
			}
			cfg, addr, err := configFromEnv(log.New(io.Discard, "", 0))
			if tc.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
					t.Fatalf("err = %v, want containing %q", err, tc.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if addr != ":9090" || cfg.Username != defaultUsername || cfg.DailyRequestCap != defaultDailyCap || cfg.Upstream.String() != defaultUpstream {
				t.Errorf("addr=%q user=%q cap=%d upstream=%s", addr, cfg.Username, cfg.DailyRequestCap, cfg.Upstream)
			}
		})
	}
}
