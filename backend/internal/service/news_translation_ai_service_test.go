package service

import "testing"

func TestParseNewsTranslationResponse(t *testing.T) {
	body := []byte("{\n" +
		`  "choices": [` + "\n" +
		`    {` + "\n" +
		`      "message": {` + "\n" +
		"        \"content\": \"```json\\n{\\\"title\\\":\\\"Hello\\\",\\\"summary\\\":\\\"Summary\\\",\\\"content\\\":\\\"<p>World</p>\\\",\\\"seo_title\\\":\\\"SEO\\\",\\\"seo_description\\\":\\\"DESC\\\"}\\n```\"\n" +
		`      }` + "\n" +
		`    }` + "\n" +
		`  ]` + "\n" +
		"}")

	result, err := parseNewsTranslationResponse(body)
	if err != nil {
		t.Fatalf("parseNewsTranslationResponse() error = %v", err)
	}
	if result.Title != "Hello" {
		t.Fatalf("unexpected title: %q", result.Title)
	}
	if result.Content != "<p>World</p>" {
		t.Fatalf("unexpected content: %q", result.Content)
	}
	if result.SEOTitle == nil || *result.SEOTitle != "SEO" {
		t.Fatalf("unexpected seo title: %#v", result.SEOTitle)
	}
}

func TestStripNewsTranslationCodeFence(t *testing.T) {
	got := stripNewsTranslationCodeFence("```json\n{\"title\":\"x\"}\n```")
	if got != "{\"title\":\"x\"}" {
		t.Fatalf("unexpected stripped content: %q", got)
	}
}
