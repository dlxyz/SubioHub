//go:build unit

package service

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNormalizeRelayBaseURL(t *testing.T) {
	cases := []struct {
		name      string
		input     string
		want      string
		wantError bool
	}{
		{name: "keep v1", input: "https://openrouter.ai/api/v1", want: "https://openrouter.ai/api/v1"},
		{name: "trim trailing slash", input: "https://openrouter.ai/api/v1/", want: "https://openrouter.ai/api/v1"},
		{name: "strip chat completions", input: "https://api.siliconflow.cn/v1/chat/completions", want: "https://api.siliconflow.cn/v1"},
		{name: "strip query", input: "https://example.com/v1?foo=bar", want: "https://example.com/v1"},
		{name: "reject http", input: "http://example.com/v1", wantError: true},
		{name: "reject empty", input: " ", wantError: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := normalizeRelayBaseURL(tc.input)
			if tc.wantError {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			require.Equal(t, tc.want, got)
		})
	}
}

func TestBuildRelayURLs(t *testing.T) {
	require.Equal(t, "https://example.com/v1/models", buildRelayModelsURL("https://example.com/v1"))
	require.Equal(t, "https://example.com/v1/models", buildRelayModelsURL("https://example.com"))
	require.Equal(t, "https://example.com/v1/chat/completions", buildRelayChatURL("https://example.com/v1"))
	require.Equal(t, "https://example.com/v1/chat/completions", buildRelayChatURL("https://example.com"))
}

func TestParseRelayModels(t *testing.T) {
	body := []byte(`{
		"data": [
			{"id":"openai/gpt-4o","name":"GPT-4o","context_length":128000,
			 "pricing":{"prompt":"0.0000025","completion":"0.00001"},
			 "architecture":{"input_modalities":["text"],"output_modalities":["text"]}},
			{"id":"anthropic/claude-3.5-sonnet","context_length":200000},
			{"id":"openai/gpt-4o"}
		]
	}`)

	models, warnings, err := parseRelayModels(body)
	require.NoError(t, err)
	require.Empty(t, warnings)
	require.Len(t, models, 2)

	require.Equal(t, "anthropic/claude-3.5-sonnet", models[0].ID)
	require.Nil(t, models[0].InputPrice)

	require.Equal(t, "openai/gpt-4o", models[1].ID)
	require.NotNil(t, models[1].InputPrice)
	require.InDelta(t, 0.0000025, *models[1].InputPrice, 1e-12)
	require.Equal(t, "upstream", models[1].PriceSource)
	require.Equal(t, []string{"text"}, models[1].InputModalities)
}

func TestParseRelayModelsSupportsModelsField(t *testing.T) {
	body := []byte(`{"models":[{"id":"b-model"},{"id":"a-model"}]}`)
	models, _, err := parseRelayModels(body)
	require.NoError(t, err)
	require.Len(t, models, 2)
	require.Equal(t, "a-model", models[0].ID)
	require.Equal(t, "b-model", models[1].ID)
}

func TestNormalizeRelayModels(t *testing.T) {
	price := 0.001
	ok, err := normalizeRelayModels([]RelayModel{{ID: " model-a ", InputPrice: &price, OutputPrice: &price}})
	require.NoError(t, err)
	require.Equal(t, "model-a", ok[0].ID)

	_, err = normalizeRelayModels(nil)
	require.Error(t, err)

	_, err = normalizeRelayModels([]RelayModel{{ID: "model-a", InputPrice: &price}})
	require.Error(t, err)

	_, err = normalizeRelayModels([]RelayModel{
		{ID: "model-a", InputPrice: &price, OutputPrice: &price},
		{ID: "model-a", InputPrice: &price, OutputPrice: &price},
	})
	require.Error(t, err)
}

func TestDiffRelayModels(t *testing.T) {
	oldModels := []RelayModel{{ID: "a"}, {ID: "b"}}
	newModels := []RelayModel{{ID: "b"}, {ID: "c"}}

	added, removed := diffRelayModels(oldModels, newModels)
	require.Len(t, added, 1)
	require.Equal(t, "c", added[0].ID)
	require.Len(t, removed, 1)
	require.Equal(t, "a", removed[0].ID)
}
