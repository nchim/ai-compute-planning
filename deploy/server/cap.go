package main

import (
	"fmt"
	"net/http"
	"strconv"
	"sync"
	"time"
)

// dailyCap counts relayed requests per UTC day in this process. It is deliberately best-effort:
// the count resets on restart and is per instance, which is meaningful only because the Cloud Run
// service runs at most one instance (see deploy/cloudrun.md). Its job is to bound a leaked password's
// spend, not to meter usage precisely.
type dailyCap struct {
	limit int
	now   func() time.Time

	mu    sync.Mutex
	day   string // YYYY-MM-DD in UTC of the current count
	count int
}

func newDailyCap(limit int, now func() time.Time) *dailyCap {
	return &dailyCap{limit: limit, now: now}
}

// take consumes one request from today's budget and reports whether it was granted.
func (c *dailyCap) take() (remaining int, ok bool) {
	day := c.now().UTC().Format(time.DateOnly)
	c.mu.Lock()
	defer c.mu.Unlock()
	if day != c.day {
		c.day, c.count = day, 0
	}
	if c.count >= c.limit {
		return 0, false
	}
	c.count++
	return c.limit - c.count, true
}

// guard rejects with 429 once the day's budget is spent. Only requests that reach next are counted,
// so path/method rejections upstream of this middleware do not burn budget.
func (c *dailyCap) guard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		remaining, ok := c.take()
		if !ok {
			w.Header().Set("Retry-After", strconv.Itoa(secondsUntilUTCMidnight(c.now())))
			writeError(w, http.StatusTooManyRequests, "rate_limit_error",
				fmt.Sprintf("this deployment's daily cap of %d Copilot requests is spent; it resets at 00:00 UTC", c.limit))
			return
		}
		w.Header().Set("X-Daily-Requests-Remaining", strconv.Itoa(remaining))
		next.ServeHTTP(w, r)
	})
}

func secondsUntilUTCMidnight(now time.Time) int {
	t := now.UTC()
	midnight := time.Date(t.Year(), t.Month(), t.Day()+1, 0, 0, 0, 0, time.UTC)
	return int(midnight.Sub(t).Seconds()) + 1
}
