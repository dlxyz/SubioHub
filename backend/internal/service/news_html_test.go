package service

import (
	"strings"
	"testing"
)

func TestSanitizeNewsHTML(t *testing.T) {
	input := `<p>Hello</p><script>alert(1)</script><img src="https://example.com/a.png" onerror="alert(2)" loading="lazy">`
	got := sanitizeNewsHTML(input)

	if strings.Contains(strings.ToLower(got), "<script") {
		t.Fatalf("expected script tag to be removed, got %q", got)
	}
	if strings.Contains(strings.ToLower(got), "onerror") {
		t.Fatalf("expected dangerous attribute to be removed, got %q", got)
	}
	if !strings.Contains(got, `<img src="https://example.com/a.png"`) {
		t.Fatalf("expected safe img tag to be preserved, got %q", got)
	}
}
