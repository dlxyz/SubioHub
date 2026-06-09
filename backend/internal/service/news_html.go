package service

import "github.com/microcosm-cc/bluemonday"

func sanitizeNewsHTML(content string) string {
	policy := bluemonday.UGCPolicy()
	policy.AllowAttrs("class").Globally()
	policy.AllowAttrs("style").Globally()
	policy.AllowAttrs("width", "height", "loading").OnElements("img")
	policy.AllowAttrs("target", "rel").OnElements("a")
	return policy.Sanitize(content)
}
