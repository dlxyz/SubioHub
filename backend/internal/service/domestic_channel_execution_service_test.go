package service

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/dlxyz/SubioHub/internal/pkg/tlsfingerprint"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

type domesticResponsesHTTPUpstreamStub struct {
	lastReq  *http.Request
	lastBody []byte
	resp     *http.Response
	err      error
}

func (s *domesticResponsesHTTPUpstreamStub) Do(req *http.Request, proxyURL string, accountID int64, accountConcurrency int) (*http.Response, error) {
	s.lastReq = req
	if req != nil && req.Body != nil {
		body, _ := io.ReadAll(req.Body)
		s.lastBody = body
		_ = req.Body.Close()
		req.Body = io.NopCloser(bytes.NewReader(body))
	}
	if s.err != nil {
		return nil, s.err
	}
	return s.resp, nil
}

func (s *domesticResponsesHTTPUpstreamStub) DoWithTLS(req *http.Request, proxyURL string, accountID int64, accountConcurrency int, profile *tlsfingerprint.Profile) (*http.Response, error) {
	return s.Do(req, proxyURL, accountID, accountConcurrency)
}

func newDomesticResponsesTestContext() (*gin.Context, *httptest.ResponseRecorder) {
	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPost, "/openai/v1/responses", nil)
	c.Request.Header.Set("User-Agent", "domestic-responses-test/1.0")
	return c, rec
}

func newDomesticChatCompletionsTestContext() (*gin.Context, *httptest.ResponseRecorder) {
	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPost, "/openai/v1/chat/completions", nil)
	c.Request.Header.Set("User-Agent", "domestic-chat-test/1.0")
	return c, rec
}

func newDomesticEmbeddingsTestContext() (*gin.Context, *httptest.ResponseRecorder) {
	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/embeddings", nil)
	c.Request.Header.Set("User-Agent", "domestic-embeddings-test/1.0")
	return c, rec
}

func newDomesticRerankTestContext() (*gin.Context, *httptest.ResponseRecorder) {
	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/rerank", nil)
	c.Request.Header.Set("User-Agent", "domestic-rerank-test/1.0")
	return c, rec
}

func newDomesticMessagesTestContext() (*gin.Context, *httptest.ResponseRecorder) {
	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/messages", nil)
	c.Request.Header.Set("User-Agent", "domestic-messages-test/1.0")
	return c, rec
}

func newDomesticTestChannel() *Channel {
	return &Channel{
		ID:           1001,
		Name:         "domestic-test",
		ProviderType: ProviderTypeOpenAICompatDomestic,
		ProviderConfig: map[string]any{
			"base_url": "https://domestic.example.com",
			"api_key":  "sk-domestic-test",
		},
	}
}

func newMiniMaxTestChannel() *Channel {
	return &Channel{
		ID:           1002,
		Name:         "domestic-minimax-test",
		ProviderType: ProviderTypeMiniMax,
		ProviderConfig: map[string]any{
			"base_url": "https://api.minimax.io",
			"api_key":  "sk-minimax-test",
		},
	}
}

func newQwenTestChannel() *Channel {
	return &Channel{
		ID:           1003,
		Name:         "domestic-qwen-test",
		ProviderType: ProviderTypeQwen,
		ProviderConfig: map[string]any{
			"base_url": "https://dashscope.aliyuncs.com/compatible-mode",
			"api_key":  "sk-qwen-test",
		},
	}
}

func newZhipuTestChannel() *Channel {
	return &Channel{
		ID:           1004,
		Name:         "domestic-zhipu-test",
		ProviderType: ProviderTypeZhipu,
		ProviderConfig: map[string]any{
			"base_url": "https://open.bigmodel.cn/api/paas/v4",
			"api_key":  "zhipu.test-secret",
		},
	}
}

func newKimiTestChannel() *Channel {
	return &Channel{
		ID:           1005,
		Name:         "domestic-kimi-test",
		ProviderType: ProviderTypeKimi,
		ProviderConfig: map[string]any{
			"base_url": "https://api.moonshot.ai/v1",
			"api_key":  "sk-kimi-test",
		},
	}
}

func newDoubaoTestChannel() *Channel {
	return &Channel{
		ID:           1006,
		Name:         "domestic-doubao-test",
		ProviderType: ProviderTypeDoubao,
		ProviderConfig: map[string]any{
			"base_url": "https://ark.cn-beijing.volces.com/api/v3",
			"api_key":  "sk-doubao-test",
		},
	}
}

func TestForwardOpenAIResponses_StreamRoundTrip(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header: http.Header{
				"Content-Type": []string{"text/event-stream"},
				"X-Request-Id": []string{"req_domestic_stream"},
			},
			Body: io.NopCloser(strings.NewReader(strings.Join([]string{
				`data: {"id":"chatcmpl_domestic_1","object":"chat.completion.chunk","created":1700000000,"model":"deepseek-chat","choices":[{"index":0,"delta":{"content":"Hel"}}]}`,
				``,
				`data: {"id":"chatcmpl_domestic_1","object":"chat.completion.chunk","created":1700000001,"model":"deepseek-chat","choices":[{"index":0,"delta":{"content":"lo"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}`,
				``,
				`data: [DONE]`,
				``,
			}, "\n"))),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	c, rec := newDomesticResponsesTestContext()

	result, err := svc.ForwardOpenAIResponses(
		context.Background(),
		c,
		newDomesticTestChannel(),
		[]byte(`{"model":"deepseek-chat","input":"Hello","stream":true}`),
		"deepseek-chat",
	)
	require.NoError(t, err)
	require.NotNil(t, result)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Header().Get("Content-Type"), "text/event-stream")
	require.Contains(t, rec.Body.String(), "event: response.created")
	require.Contains(t, rec.Body.String(), "event: response.output_text.delta")
	require.Contains(t, rec.Body.String(), "event: response.output_text.done")
	require.Contains(t, rec.Body.String(), "event: response.completed")
	require.Contains(t, rec.Body.String(), `"delta":"Hel"`)
	require.Contains(t, rec.Body.String(), `"text":"Hello"`)

	require.Equal(t, "https://domestic.example.com/v1/chat/completions", upstream.lastReq.URL.String())
	require.Equal(t, "Bearer sk-domestic-test", upstream.lastReq.Header.Get("Authorization"))
	require.Equal(t, "text/event-stream", upstream.lastReq.Header.Get("Accept"))
	require.Equal(t, "domestic-responses-test/1.0", upstream.lastReq.Header.Get("User-Agent"))
	require.Equal(t, "deepseek-chat", gjson.GetBytes(upstream.lastBody, "model").String())
	require.True(t, gjson.GetBytes(upstream.lastBody, "stream").Bool())
	require.Equal(t, "user", gjson.GetBytes(upstream.lastBody, "messages.0.role").String())
	require.Equal(t, "Hello", gjson.GetBytes(upstream.lastBody, "messages.0.content").String())

	require.Equal(t, "req_domestic_stream", result.RequestID)
	require.Equal(t, "deepseek-chat", result.UpstreamModel)
	require.NotNil(t, result.FirstTokenMs)
	require.Equal(t, 10, result.Usage.InputTokens)
	require.Equal(t, 2, result.Usage.OutputTokens)
}

func TestForwardOpenAIResponses_StreamInvalidChunkWritesSSEError(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header: http.Header{
				"Content-Type": []string{"text/event-stream"},
			},
			Body: io.NopCloser(strings.NewReader(strings.Join([]string{
				`data: {"id":"chatcmpl_domestic_2","object":"chat.completion.chunk","created":1700000000,"model":"deepseek-chat","choices":[{"index":0,"delta":{"content":"Hi"}}]}`,
				``,
				`data: {"id":`,
				``,
			}, "\n"))),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	c, rec := newDomesticResponsesTestContext()

	result, err := svc.ForwardOpenAIResponses(
		context.Background(),
		c,
		newDomesticTestChannel(),
		[]byte(`{"model":"deepseek-chat","input":"Hello","stream":true}`),
		"deepseek-chat",
	)
	require.Nil(t, result)
	require.ErrorIs(t, err, ErrDomesticResponseWritten)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), "event: response.created")
	require.Contains(t, rec.Body.String(), "event: error")
	require.Contains(t, rec.Body.String(), `"code":"server_error"`)
	require.Contains(t, rec.Body.String(), `Failed to parse upstream stream chunk`)
}

func TestForwardOpenAIResponses_ErrorNormalization(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name        string
		statusCode  int
		body        string
		wantStatus  int
		wantCode    string
		wantMessage string
	}{
		{
			name:        "authentication",
			statusCode:  http.StatusUnauthorized,
			body:        `{"error":{"type":"authentication_error","code":"invalid_api_key","message":"bad key"}}`,
			wantStatus:  http.StatusUnauthorized,
			wantCode:    "authentication_error",
			wantMessage: "bad key",
		},
		{
			name:        "rate_limit",
			statusCode:  http.StatusTooManyRequests,
			body:        `{"error":{"type":"rate_limit_error","code":"rate_limit_exceeded","message":"slow down"}}`,
			wantStatus:  http.StatusTooManyRequests,
			wantCode:    "rate_limit_error",
			wantMessage: "slow down",
		},
		{
			name:        "server_error",
			statusCode:  http.StatusInternalServerError,
			body:        `{"error":{"type":"server_error","code":"provider_busy","message":"provider busy"}}`,
			wantStatus:  http.StatusBadGateway,
			wantCode:    "server_error",
			wantMessage: "provider busy",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			upstream := &domesticResponsesHTTPUpstreamStub{
				resp: &http.Response{
					StatusCode: tc.statusCode,
					Header: http.Header{
						"Content-Type": []string{"application/json"},
					},
					Body: io.NopCloser(strings.NewReader(tc.body)),
				},
			}

			svc := NewDomesticChannelExecutionService(nil, nil, upstream)
			c, rec := newDomesticResponsesTestContext()

			result, err := svc.ForwardOpenAIResponses(
				context.Background(),
				c,
				newDomesticTestChannel(),
				[]byte(`{"model":"deepseek-chat","input":"Hello"}`),
				"deepseek-chat",
			)
			require.Nil(t, result)
			require.ErrorIs(t, err, ErrDomesticResponseWritten)
			require.Equal(t, tc.wantStatus, rec.Code)
			require.JSONEq(t, `{"error":{"code":"`+tc.wantCode+`","message":"`+tc.wantMessage+`"}}`, rec.Body.String())
		})
	}
}

func TestNormalizeResponsesUpstreamError(t *testing.T) {
	t.Parallel()

	statusCode, code, message := normalizeResponsesUpstreamError(
		http.StatusUnauthorized,
		ProviderTypeDeepSeek,
		[]byte(`{"error":{"type":"authentication_error","code":"invalid_api_key","message":"bad key"}}`),
	)
	require.Equal(t, http.StatusUnauthorized, statusCode)
	require.Equal(t, "authentication_error", code)
	require.Equal(t, "bad key", message)

	statusCode, code, message = normalizeResponsesUpstreamError(
		http.StatusInternalServerError,
		ProviderTypeDeepSeek,
		[]byte(`{"error":{"type":"server_error","code":"provider_busy","message":"provider busy"}}`),
	)
	require.Equal(t, http.StatusBadGateway, statusCode)
	require.Equal(t, "server_error", code)
	require.Equal(t, "provider busy", message)
}

func TestNormalizeResponsesUpstreamError_ProviderSpecificBodies(t *testing.T) {
	t.Parallel()

	t.Run("zhipu msg body", func(t *testing.T) {
		statusCode, code, message := normalizeResponsesUpstreamError(
			http.StatusUnauthorized,
			ProviderTypeZhipu,
			[]byte(`{"code":"signature_error","msg":"Signature verification failed"}`),
		)
		require.Equal(t, http.StatusUnauthorized, statusCode)
		require.Equal(t, "authentication_error", code)
		require.Equal(t, "Signature verification failed", message)
	})

	t.Run("minimax base_resp body", func(t *testing.T) {
		statusCode, code, message := normalizeResponsesUpstreamError(
			http.StatusTooManyRequests,
			ProviderTypeMiniMax,
			[]byte(`{"base_resp":{"status_code":1008,"status_msg":"quota exceeded"}}`),
		)
		require.Equal(t, http.StatusTooManyRequests, statusCode)
		require.Equal(t, "rate_limit_error", code)
		require.Equal(t, "quota exceeded", message)
	})

	t.Run("qwen invalid api key body", func(t *testing.T) {
		statusCode, code, message := normalizeResponsesUpstreamError(
			http.StatusBadRequest,
			ProviderTypeQwen,
			[]byte(`{"code":"InvalidApiKey","message":"invalid api key"}`),
		)
		require.Equal(t, http.StatusUnauthorized, statusCode)
		require.Equal(t, "authentication_error", code)
		require.Equal(t, "invalid api key", message)
	})

	t.Run("kimi insufficient quota body", func(t *testing.T) {
		statusCode, code, message := normalizeResponsesUpstreamError(
			http.StatusBadRequest,
			ProviderTypeKimi,
			[]byte(`{"error":{"code":"insufficient_quota","message":"balance not enough"}}`),
		)
		require.Equal(t, http.StatusTooManyRequests, statusCode)
		require.Equal(t, "rate_limit_error", code)
		require.Equal(t, "balance not enough", message)
	})

	t.Run("doubao throttling body", func(t *testing.T) {
		statusCode, code, message := normalizeResponsesUpstreamError(
			http.StatusBadRequest,
			ProviderTypeDoubao,
			[]byte(`{"error":{"code":"Throttling.RateQuota","message":"request rate exceeded"}}`),
		)
		require.Equal(t, http.StatusTooManyRequests, statusCode)
		require.Equal(t, "rate_limit_error", code)
		require.Equal(t, "request rate exceeded", message)
	})
}

func TestMiniMaxProviderAdapter_PrepareChatCompletionsBody(t *testing.T) {
	t.Parallel()

	cfg, err := parseDomesticProviderRuntimeConfig(ProviderTypeMiniMax, map[string]any{
		"api_key": "sk-test",
	})
	require.NoError(t, err)

	adapter := newDomesticProviderAdapter(ProviderTypeMiniMax)
	body, err := adapter.PrepareChatCompletionsBody(cfg, []byte(`{
		"model":"MiniMax-M2.5",
		"messages":[{"role":"user","content":"Hello"}],
		"max_tokens":32,
		"temperature":0,
		"top_p":0,
		"n":3
	}`))
	require.NoError(t, err)
	require.Equal(t, int64(32), gjson.GetBytes(body, "max_completion_tokens").Int())
	require.False(t, gjson.GetBytes(body, "temperature").Exists())
	require.False(t, gjson.GetBytes(body, "top_p").Exists())
	require.Equal(t, int64(1), gjson.GetBytes(body, "n").Int())
}

func TestZhipuProviderAdapter_PrepareChatCompletionsBody(t *testing.T) {
	t.Parallel()

	cfg, err := parseDomesticProviderRuntimeConfig(ProviderTypeZhipu, map[string]any{
		"api_key": "zhipu.test-secret",
	})
	require.NoError(t, err)

	adapter := newDomesticProviderAdapter(ProviderTypeZhipu)
	body, err := adapter.PrepareChatCompletionsBody(cfg, []byte(`{
		"model":"glm-4.5",
		"messages":[{"role":"user","content":"Hello"}],
		"top_p":1
	}`))
	require.NoError(t, err)
	require.InDelta(t, 0.99, gjson.GetBytes(body, "top_p").Float(), 0.0001)
}

func TestQwenProviderAdapter_PrepareChatCompletionsBody(t *testing.T) {
	t.Parallel()

	cfg, err := parseDomesticProviderRuntimeConfig(ProviderTypeQwen, map[string]any{
		"api_key": "sk-qwen-test",
	})
	require.NoError(t, err)

	adapter := newDomesticProviderAdapter(ProviderTypeQwen)

	t.Run("non streaming defaults thinking off", func(t *testing.T) {
		body, err := adapter.PrepareChatCompletionsBody(cfg, []byte(`{
			"model":"qwen3.5-plus",
			"messages":[{"role":"user","content":"Hello"}]
		}`))
		require.NoError(t, err)
		require.True(t, gjson.GetBytes(body, "enable_thinking").Exists())
		require.False(t, gjson.GetBytes(body, "enable_thinking").Bool())
	})

	t.Run("streaming reasoning maps to enable_thinking", func(t *testing.T) {
		body, err := adapter.PrepareChatCompletionsBody(cfg, []byte(`{
			"model":"qwen3.5-plus",
			"messages":[{"role":"user","content":"Hello"}],
			"stream":true,
			"reasoning_effort":"high"
		}`))
		require.NoError(t, err)
		require.True(t, gjson.GetBytes(body, "enable_thinking").Bool())
		require.False(t, gjson.GetBytes(body, "reasoning_effort").Exists())
	})

	t.Run("streaming with tools downgrades to buffered", func(t *testing.T) {
		body, err := adapter.PrepareChatCompletionsBody(cfg, []byte(`{
			"model":"qwen3.5-plus",
			"messages":[{"role":"user","content":"Hello"}],
			"stream":true,
			"stream_options":{"include_usage":true},
			"tools":[{"type":"function","function":{"name":"get_weather","parameters":{"type":"object"}}}]
		}`))
		require.NoError(t, err)
		require.False(t, gjson.GetBytes(body, "stream").Bool())
		require.False(t, gjson.GetBytes(body, "stream_options").Exists())
	})
}

func TestKimiProviderAdapter_PrepareChatCompletionsBody(t *testing.T) {
	t.Parallel()

	cfg, err := parseDomesticProviderRuntimeConfig(ProviderTypeKimi, map[string]any{
		"api_key": "sk-kimi-test",
	})
	require.NoError(t, err)

	adapter := newDomesticProviderAdapter(ProviderTypeKimi)

	t.Run("reasoning_effort none disables thinking and normalizes developer role", func(t *testing.T) {
		body, err := adapter.PrepareChatCompletionsBody(cfg, []byte(`{
			"model":"kimi-k2.6",
			"messages":[
				{"role":"developer","content":"You are Kimi."},
				{"role":"user","content":"Hello"}
			],
			"reasoning_effort":"none"
		}`))
		require.NoError(t, err)
		require.Equal(t, "system", gjson.GetBytes(body, "messages.0.role").String())
		require.Equal(t, "disabled", gjson.GetBytes(body, "thinking.type").String())
		require.False(t, gjson.GetBytes(body, "reasoning_effort").Exists())
	})

	t.Run("historical reasoning enables keep all", func(t *testing.T) {
		body, err := adapter.PrepareChatCompletionsBody(cfg, []byte(`{
			"model":"kimi-k2.6",
			"messages":[
				{"role":"assistant","reasoning_content":"step 1","content":"tool plan"},
				{"role":"tool","tool_call_id":"call_1","content":"done"},
				{"role":"user","content":"continue"}
			],
			"reasoning_effort":"high"
		}`))
		require.NoError(t, err)
		require.Equal(t, "enabled", gjson.GetBytes(body, "thinking.type").String())
		require.Equal(t, "all", gjson.GetBytes(body, "thinking.keep").String())
	})
}

func TestKimiProviderAdapter_PrepareEmbeddingsBody(t *testing.T) {
	t.Parallel()

	cfg, err := parseDomesticProviderRuntimeConfig(ProviderTypeKimi, map[string]any{
		"api_key": "sk-kimi-test",
	})
	require.NoError(t, err)

	adapter := newDomesticProviderAdapter(ProviderTypeKimi)
	body, err := adapter.PrepareEmbeddingsBody(cfg, []byte(`{
		"model":"kimi-embedding",
		"input":"hello",
		"messages":[{"role":"user","content":"drop"}],
		"stream":true,
		"reasoning_effort":"high",
		"dimensions":0,
		"encoding_format":""
	}`))
	require.NoError(t, err)
	require.False(t, gjson.GetBytes(body, "messages").Exists())
	require.False(t, gjson.GetBytes(body, "stream").Exists())
	require.False(t, gjson.GetBytes(body, "reasoning_effort").Exists())
	require.False(t, gjson.GetBytes(body, "dimensions").Exists())
	require.False(t, gjson.GetBytes(body, "encoding_format").Exists())
}

func TestKimiProviderAdapter_PrepareRerankBody(t *testing.T) {
	t.Parallel()

	cfg, err := parseDomesticProviderRuntimeConfig(ProviderTypeKimi, map[string]any{
		"api_key": "sk-kimi-test",
	})
	require.NoError(t, err)

	adapter := newDomesticProviderAdapter(ProviderTypeKimi)
	body, err := adapter.PrepareRerankBody(cfg, []byte(`{
		"model":"kimi-rerank",
		"query":"ping",
		"documents":["pong"],
		"messages":[{"role":"user","content":"drop"}],
		"stream":true,
		"reasoning_effort":"high",
		"input":{"query":"bad"},
		"top_n":0
	}`))
	require.NoError(t, err)
	require.False(t, gjson.GetBytes(body, "messages").Exists())
	require.False(t, gjson.GetBytes(body, "stream").Exists())
	require.False(t, gjson.GetBytes(body, "reasoning_effort").Exists())
	require.False(t, gjson.GetBytes(body, "input").Exists())
	require.False(t, gjson.GetBytes(body, "top_n").Exists())
}

func TestZhipuProviderAdapter_PrepareEmbeddingsBody(t *testing.T) {
	t.Parallel()

	cfg, err := parseDomesticProviderRuntimeConfig(ProviderTypeZhipu, map[string]any{
		"api_key": "zhipu.test-secret",
	})
	require.NoError(t, err)

	adapter := newDomesticProviderAdapter(ProviderTypeZhipu)
	body, err := adapter.PrepareEmbeddingsBody(cfg, []byte(`{
		"model":"embedding-3",
		"input":"hello",
		"messages":[{"role":"user","content":"drop"}],
		"stream":true,
		"thinking":{"type":"enabled"},
		"dimensions":0
	}`))
	require.NoError(t, err)
	require.False(t, gjson.GetBytes(body, "messages").Exists())
	require.False(t, gjson.GetBytes(body, "stream").Exists())
	require.False(t, gjson.GetBytes(body, "thinking").Exists())
	require.False(t, gjson.GetBytes(body, "dimensions").Exists())
}

func TestZhipuProviderAdapter_PrepareRerankBody(t *testing.T) {
	t.Parallel()

	cfg, err := parseDomesticProviderRuntimeConfig(ProviderTypeZhipu, map[string]any{
		"api_key": "zhipu.test-secret",
	})
	require.NoError(t, err)

	adapter := newDomesticProviderAdapter(ProviderTypeZhipu)
	body, err := adapter.PrepareRerankBody(cfg, []byte(`{
		"model":"rerank",
		"query":"ping",
		"documents":["pong"],
		"messages":[{"role":"user","content":"drop"}],
		"stream":true,
		"thinking":{"type":"enabled"},
		"input":{"query":"bad"},
		"top_n":0
	}`))
	require.NoError(t, err)
	require.False(t, gjson.GetBytes(body, "messages").Exists())
	require.False(t, gjson.GetBytes(body, "stream").Exists())
	require.False(t, gjson.GetBytes(body, "thinking").Exists())
	require.False(t, gjson.GetBytes(body, "input").Exists())
	require.False(t, gjson.GetBytes(body, "top_n").Exists())
}

func TestDoubaoProviderAdapter_PrepareEmbeddingsBody(t *testing.T) {
	t.Parallel()

	cfg, err := parseDomesticProviderRuntimeConfig(ProviderTypeDoubao, map[string]any{
		"api_key": "sk-doubao-test",
	})
	require.NoError(t, err)

	adapter := newDomesticProviderAdapter(ProviderTypeDoubao)
	body, err := adapter.PrepareEmbeddingsBody(cfg, []byte(`{
		"model":"doubao-embedding-vision-251215",
		"input":"hello",
		"messages":[{"role":"user","content":"drop"}],
		"stream":true,
		"thinking":{"type":"enabled"},
		"dimensions":0
	}`))
	require.NoError(t, err)
	require.False(t, gjson.GetBytes(body, "messages").Exists())
	require.False(t, gjson.GetBytes(body, "stream").Exists())
	require.False(t, gjson.GetBytes(body, "thinking").Exists())
	require.False(t, gjson.GetBytes(body, "dimensions").Exists())
	require.Equal(t, "text", gjson.GetBytes(body, "input.0.type").String())
	require.Equal(t, "hello", gjson.GetBytes(body, "input.0.text").String())
}

func TestDoubaoProviderAdapter_PrepareRerankBody(t *testing.T) {
	t.Parallel()

	cfg, err := parseDomesticProviderRuntimeConfig(ProviderTypeDoubao, map[string]any{
		"api_key": "sk-doubao-test",
	})
	require.NoError(t, err)

	adapter := newDomesticProviderAdapter(ProviderTypeDoubao)
	body, err := adapter.PrepareRerankBody(cfg, []byte(`{
		"model":"Doubao-rerank",
		"query":"ping",
		"documents":["pong"],
		"messages":[{"role":"user","content":"drop"}],
		"stream":true,
		"thinking":{"type":"enabled"},
		"input":{"query":"bad"},
		"top_n":0
	}`))
	require.NoError(t, err)
	require.False(t, gjson.GetBytes(body, "messages").Exists())
	require.False(t, gjson.GetBytes(body, "stream").Exists())
	require.False(t, gjson.GetBytes(body, "thinking").Exists())
	require.False(t, gjson.GetBytes(body, "input").Exists())
	require.False(t, gjson.GetBytes(body, "top_n").Exists())
}

func TestMiniMaxProviderAdapter_PrepareEmbeddingsBody(t *testing.T) {
	t.Parallel()

	cfg, err := parseDomesticProviderRuntimeConfig(ProviderTypeMiniMax, map[string]any{
		"api_key": "sk-minimax-test",
	})
	require.NoError(t, err)

	adapter := newDomesticProviderAdapter(ProviderTypeMiniMax)
	body, err := adapter.PrepareEmbeddingsBody(cfg, []byte(`{
		"model":"MiniMax-embedding",
		"input":"hello",
		"type":"",
		"messages":[{"role":"user","content":"drop"}],
		"stream":true,
		"reasoning_effort":"high",
		"dimensions":256,
		"encoding_format":"base64"
	}`))
	require.NoError(t, err)
	require.False(t, gjson.GetBytes(body, "input").Exists())
	require.Equal(t, "hello", gjson.GetBytes(body, "texts.0").String())
	require.Equal(t, "db", gjson.GetBytes(body, "type").String())
	require.False(t, gjson.GetBytes(body, "messages").Exists())
	require.False(t, gjson.GetBytes(body, "stream").Exists())
	require.False(t, gjson.GetBytes(body, "reasoning_effort").Exists())
	require.False(t, gjson.GetBytes(body, "dimensions").Exists())
	require.False(t, gjson.GetBytes(body, "encoding_format").Exists())
}

func TestMiniMaxProviderAdapter_PrepareRerankBody(t *testing.T) {
	t.Parallel()

	cfg, err := parseDomesticProviderRuntimeConfig(ProviderTypeMiniMax, map[string]any{
		"api_key": "sk-minimax-test",
	})
	require.NoError(t, err)

	adapter := newDomesticProviderAdapter(ProviderTypeMiniMax)
	body, err := adapter.PrepareRerankBody(cfg, []byte(`{
		"model":"MiniMax-rerank",
		"query":"ping",
		"documents":["pong"],
		"messages":[{"role":"user","content":"drop"}],
		"stream":true,
		"reasoning_effort":"high",
		"input":{"query":"bad"},
		"top_n":0
	}`))
	require.NoError(t, err)
	require.False(t, gjson.GetBytes(body, "messages").Exists())
	require.False(t, gjson.GetBytes(body, "stream").Exists())
	require.False(t, gjson.GetBytes(body, "reasoning_effort").Exists())
	require.False(t, gjson.GetBytes(body, "input").Exists())
	require.False(t, gjson.GetBytes(body, "top_n").Exists())
}

func TestWriteResponsesStreamErrorEvent(t *testing.T) {
	t.Parallel()

	c, rec := newDomesticResponsesTestContext()
	rec.WriteHeader(http.StatusOK)

	err := writeResponsesStreamErrorEvent(c, nil, "server_error", "stream broke")
	require.NoError(t, err)
	require.Contains(t, rec.Body.String(), "event: error")
	require.Contains(t, rec.Body.String(), `"type":"error"`)
	require.Contains(t, rec.Body.String(), `"code":"server_error"`)
	require.Contains(t, rec.Body.String(), `"message":"stream broke"`)
}

func TestForwardOpenAIResponses_BufferedRoundTrip(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header: http.Header{
				"Content-Type": []string{"application/json"},
				"X-Request-Id": []string{"req_domestic_buffered"},
			},
			Body: io.NopCloser(strings.NewReader(`{
				"id":"chatcmpl_buffered_1",
				"object":"chat.completion",
				"created":1700000000,
				"model":"deepseek-chat",
				"choices":[{"index":0,"message":{"role":"assistant","content":"Buffered hello"},"finish_reason":"stop"}],
				"usage":{"prompt_tokens":9,"completion_tokens":3,"total_tokens":12}
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	c, rec := newDomesticResponsesTestContext()

	result, err := svc.ForwardOpenAIResponses(
		context.Background(),
		c,
		newDomesticTestChannel(),
		[]byte(`{"model":"deepseek-chat","input":"Hello","stream":false}`),
		"deepseek-chat",
	)
	require.NoError(t, err)
	require.NotNil(t, result)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), `"object":"response"`)
	require.Contains(t, rec.Body.String(), `"type":"message"`)
	require.Contains(t, rec.Body.String(), `"Buffered hello"`)
	require.Equal(t, "req_domestic_buffered", result.RequestID)
	require.Equal(t, 9, result.Usage.InputTokens)
	require.Equal(t, 3, result.Usage.OutputTokens)
}

func TestForwardOpenAIResponses_MiniMaxBusinessErrorNormalization(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header: http.Header{
				"Content-Type": []string{"application/json"},
			},
			Body: io.NopCloser(strings.NewReader(`{
				"base_resp":{"status_code":1004,"status_msg":"invalid api key"}
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	c, rec := newDomesticResponsesTestContext()

	result, err := svc.ForwardOpenAIResponses(
		context.Background(),
		c,
		newMiniMaxTestChannel(),
		[]byte(`{"model":"MiniMax-M2.5","input":"Hello"}`),
		"MiniMax-M2.5",
	)
	require.Nil(t, result)
	require.ErrorIs(t, err, ErrDomesticResponseWritten)
	require.Equal(t, http.StatusUnauthorized, rec.Code)
	require.JSONEq(t, `{"error":{"code":"authentication_error","message":"invalid api key"}}`, rec.Body.String())
	require.False(t, gjson.GetBytes(upstream.lastBody, "temperature").Exists())
}

func TestForwardOpenAIResponses_StreamMiniMaxBusinessErrorWritesSSEError(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header: http.Header{
				"Content-Type": []string{"text/event-stream"},
			},
			Body: io.NopCloser(strings.NewReader(strings.Join([]string{
				`data: {"base_resp":{"status_code":1008,"status_msg":"quota exceeded"}}`,
				``,
			}, "\n"))),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	c, rec := newDomesticResponsesTestContext()

	result, err := svc.ForwardOpenAIResponses(
		context.Background(),
		c,
		newMiniMaxTestChannel(),
		[]byte(`{"model":"MiniMax-M2.5","input":"Hello","stream":true}`),
		"MiniMax-M2.5",
	)
	require.Nil(t, result)
	require.ErrorIs(t, err, ErrDomesticResponseWritten)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), "event: error")
	require.Contains(t, rec.Body.String(), `"code":"rate_limit_error"`)
	require.Contains(t, rec.Body.String(), `"message":"quota exceeded"`)
}

func TestForwardOpenAIResponses_StreamDurationSet(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
			Body: io.NopCloser(strings.NewReader(strings.Join([]string{
				`data: {"id":"chatcmpl_domestic_3","object":"chat.completion.chunk","created":1700000000,"model":"deepseek-chat","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}`,
				``,
			}, "\n"))),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	c, _ := newDomesticResponsesTestContext()

	result, err := svc.ForwardOpenAIResponses(
		context.Background(),
		c,
		newDomesticTestChannel(),
		[]byte(`{"model":"deepseek-chat","input":"Hello","stream":true}`),
		"deepseek-chat",
	)
	require.NoError(t, err)
	require.NotNil(t, result)
	require.GreaterOrEqual(t, result.Duration, time.Duration(0))
}

func TestForwardOpenAIResponses_QwenStreamAddsDashScopeHeader(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
			Body: io.NopCloser(strings.NewReader(strings.Join([]string{
				`data: {"id":"chatcmpl_qwen_1","object":"chat.completion.chunk","created":1700000000,"model":"qwen-plus","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}`,
				``,
				`data: [DONE]`,
				``,
			}, "\n"))),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	c, _ := newDomesticResponsesTestContext()

	result, err := svc.ForwardOpenAIResponses(
		context.Background(),
		c,
		newQwenTestChannel(),
		[]byte(`{"model":"qwen-plus","input":"Hello","stream":true}`),
		"qwen-plus",
	)
	require.NoError(t, err)
	require.NotNil(t, result)
	require.Equal(t, "enable", upstream.lastReq.Header.Get("X-DashScope-SSE"))
}

func TestForwardOpenAIResponses_ZhipuTopPIsClamped(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body: io.NopCloser(strings.NewReader(`{
				"id":"chatcmpl_zhipu_1",
				"object":"chat.completion",
				"created":1700000000,
				"model":"glm-4.5",
				"choices":[{"index":0,"message":{"role":"assistant","content":"ok"},"finish_reason":"stop"}],
				"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	c, _ := newDomesticResponsesTestContext()

	result, err := svc.ForwardOpenAIResponses(
		context.Background(),
		c,
		newZhipuTestChannel(),
		[]byte(`{"model":"glm-4.5","input":"Hello","top_p":1}`),
		"glm-4.5",
	)
	require.NoError(t, err)
	require.NotNil(t, result)
	require.InDelta(t, 0.99, gjson.GetBytes(upstream.lastBody, "top_p").Float(), 0.0001)
}

func TestForwardOpenAIResponses_QwenNonStreamDefaultsEnableThinkingFalse(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body: io.NopCloser(strings.NewReader(`{
				"id":"chatcmpl_qwen_2",
				"object":"chat.completion",
				"created":1700000000,
				"model":"qwen3.5-plus",
				"choices":[{"index":0,"message":{"role":"assistant","content":"ok"},"finish_reason":"stop"}],
				"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	c, _ := newDomesticResponsesTestContext()

	result, err := svc.ForwardOpenAIResponses(
		context.Background(),
		c,
		newQwenTestChannel(),
		[]byte(`{"model":"qwen3.5-plus","input":"Hello","reasoning":{"effort":"high"}}`),
		"qwen3.5-plus",
	)
	require.NoError(t, err)
	require.NotNil(t, result)
	require.True(t, gjson.GetBytes(upstream.lastBody, "enable_thinking").Exists())
	require.False(t, gjson.GetBytes(upstream.lastBody, "enable_thinking").Bool())
	require.False(t, gjson.GetBytes(upstream.lastBody, "reasoning_effort").Exists())
}

func TestForwardOpenAIResponses_QwenStreamMapsReasoningToEnableThinking(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
			Body: io.NopCloser(strings.NewReader(strings.Join([]string{
				`data: {"id":"chatcmpl_qwen_3","object":"chat.completion.chunk","created":1700000000,"model":"qwen3.5-plus","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}`,
				``,
				`data: [DONE]`,
				``,
			}, "\n"))),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	c, _ := newDomesticResponsesTestContext()

	result, err := svc.ForwardOpenAIResponses(
		context.Background(),
		c,
		newQwenTestChannel(),
		[]byte(`{"model":"qwen3.5-plus","input":"Hello","stream":true,"reasoning":{"effort":"medium"}}`),
		"qwen3.5-plus",
	)
	require.NoError(t, err)
	require.NotNil(t, result)
	require.True(t, gjson.GetBytes(upstream.lastBody, "enable_thinking").Bool())
	require.False(t, gjson.GetBytes(upstream.lastBody, "reasoning_effort").Exists())
}

func TestForwardOpenAIResponses_QwenToolsDisableStreaming(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body: io.NopCloser(strings.NewReader(`{
				"id":"chatcmpl_qwen_4",
				"object":"chat.completion",
				"created":1700000000,
				"model":"qwen3.5-plus",
				"choices":[{"index":0,"message":{"role":"assistant","content":"buffered tool response"},"finish_reason":"stop"}],
				"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	c, rec := newDomesticResponsesTestContext()

	result, err := svc.ForwardOpenAIResponses(
		context.Background(),
		c,
		newQwenTestChannel(),
		[]byte(`{
			"model":"qwen3.5-plus",
			"input":"Hello",
			"stream":true,
			"tools":[{"type":"function","name":"get_weather","description":"Get weather","parameters":{"type":"object"}}]
		}`),
		"qwen3.5-plus",
	)
	require.NoError(t, err)
	require.NotNil(t, result)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "application/json", upstream.lastReq.Header.Get("Accept"))
	require.False(t, gjson.GetBytes(upstream.lastBody, "stream").Bool())
	require.False(t, gjson.GetBytes(upstream.lastBody, "stream_options").Exists())
	require.Contains(t, rec.Body.String(), `"buffered tool response"`)
}

func TestForwardOpenAIChatCompletions_KimiPreservesReasoningContext(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body: io.NopCloser(strings.NewReader(`{
				"id":"chatcmpl_kimi_1",
				"object":"chat.completion",
				"created":1700000000,
				"model":"kimi-k2.6",
				"choices":[{"index":0,"message":{"role":"assistant","content":"continued"},"finish_reason":"stop"}],
				"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	c, rec := newDomesticChatCompletionsTestContext()

	result, err := svc.ForwardOpenAIChatCompletions(
		context.Background(),
		c,
		newKimiTestChannel(),
		[]byte(`{
			"model":"kimi-k2.6",
			"messages":[
				{"role":"developer","content":"You are Kimi."},
				{"role":"assistant","reasoning_content":"first think","content":"tool plan","tool_calls":[{"id":"call_1","type":"function","function":{"name":"search","arguments":"{}"}}]},
				{"role":"tool","tool_call_id":"call_1","content":"result"},
				{"role":"user","content":"please continue"}
			]
		}`),
		"kimi-k2.6",
	)
	require.NoError(t, err)
	require.NotNil(t, result)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "https://api.moonshot.ai/v1/chat/completions", upstream.lastReq.URL.String())
	require.Equal(t, "system", gjson.GetBytes(upstream.lastBody, "messages.0.role").String())
	require.Equal(t, "enabled", gjson.GetBytes(upstream.lastBody, "thinking.type").String())
	require.Equal(t, "all", gjson.GetBytes(upstream.lastBody, "thinking.keep").String())
	require.Contains(t, rec.Body.String(), `"continued"`)
}

func TestForwardOpenAIEmbeddings_QwenSuccess(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header: http.Header{
				"Content-Type": []string{"application/json"},
				"X-Request-Id": []string{"req_embeddings_gateway"},
			},
			Body: io.NopCloser(strings.NewReader(`{
				"object":"list",
				"model":"text-embedding-v1",
				"data":[{"object":"embedding","index":0,"embedding":[0.1,0.2,0.3]}],
				"usage":{"prompt_tokens":4,"total_tokens":4}
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	c, rec := newDomesticEmbeddingsTestContext()

	result, err := svc.ForwardOpenAIEmbeddings(
		context.Background(),
		c,
		newQwenTestChannel(),
		[]byte(`{"model":"text-embedding-v1","input":"hello"}`),
		"text-embedding-v1",
	)
	require.NoError(t, err)
	require.NotNil(t, result)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings", upstream.lastReq.URL.String())
	require.Equal(t, "text-embedding-v1", result.UpstreamModel)
	require.Equal(t, "req_embeddings_gateway", result.RequestID)
	require.Equal(t, 4, result.Usage.InputTokens)
	require.Equal(t, 0, result.Usage.OutputTokens)
	require.False(t, gjson.GetBytes(upstream.lastBody, "messages").Exists())
	require.False(t, gjson.GetBytes(upstream.lastBody, "stream").Exists())
	require.Contains(t, rec.Body.String(), `"embedding"`)
}

func TestForwardOpenAIEmbeddings_DoubaoSanitizesChatFields(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body: io.NopCloser(strings.NewReader(`{
				"object":"list",
				"model":"doubao-embedding-vision-251215",
				"data":{"object":"embedding","embedding":[0.1,0.2,0.3]},
				"usage":{"prompt_tokens":4,"total_tokens":4}
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	c, rec := newDomesticEmbeddingsTestContext()

	result, err := svc.ForwardOpenAIEmbeddings(
		context.Background(),
		c,
		newDoubaoTestChannel(),
		[]byte(`{
			"model":"doubao-embedding-vision-251215",
			"input":"hello",
			"messages":[{"role":"user","content":"drop"}],
			"stream":true,
			"thinking":{"type":"enabled"},
			"dimensions":0
		}`),
		"doubao-embedding-vision-251215",
	)
	require.NoError(t, err)
	require.NotNil(t, result)
	require.Equal(t, "https://ark.cn-beijing.volces.com/api/v3/embeddings/multimodal", upstream.lastReq.URL.String())
	require.False(t, gjson.GetBytes(upstream.lastBody, "messages").Exists())
	require.False(t, gjson.GetBytes(upstream.lastBody, "stream").Exists())
	require.False(t, gjson.GetBytes(upstream.lastBody, "thinking").Exists())
	require.Equal(t, "text", gjson.GetBytes(upstream.lastBody, "input.0.type").String())
	require.Contains(t, rec.Body.String(), `"data":[`)
}

func TestForwardOpenAIEmbeddings_KimiSanitizesChatFields(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body: io.NopCloser(strings.NewReader(`{
				"object":"list",
				"model":"kimi-embedding",
				"data":[{"object":"embedding","index":0,"embedding":[0.1,0.2,0.3]}],
				"usage":{"prompt_tokens":4,"total_tokens":4}
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	c, _ := newDomesticEmbeddingsTestContext()

	result, err := svc.ForwardOpenAIEmbeddings(
		context.Background(),
		c,
		newKimiTestChannel(),
		[]byte(`{
			"model":"kimi-embedding",
			"input":"hello",
			"messages":[{"role":"user","content":"drop"}],
			"stream":true,
			"reasoning_effort":"high",
			"dimensions":0
		}`),
		"kimi-embedding",
	)
	require.NoError(t, err)
	require.NotNil(t, result)
	require.Equal(t, "https://api.moonshot.ai/v1/embeddings", upstream.lastReq.URL.String())
	require.False(t, gjson.GetBytes(upstream.lastBody, "messages").Exists())
	require.False(t, gjson.GetBytes(upstream.lastBody, "stream").Exists())
	require.False(t, gjson.GetBytes(upstream.lastBody, "reasoning_effort").Exists())
}

func TestForwardOpenAIEmbeddings_QwenSanitizesChatFields(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body: io.NopCloser(strings.NewReader(`{
				"object":"list",
				"model":"text-embedding-v1",
				"data":[{"object":"embedding","index":0,"embedding":[0.1,0.2,0.3]}],
				"usage":{"prompt_tokens":4,"total_tokens":4}
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	c, _ := newDomesticEmbeddingsTestContext()

	result, err := svc.ForwardOpenAIEmbeddings(
		context.Background(),
		c,
		newQwenTestChannel(),
		[]byte(`{
			"model":"text-embedding-v1",
			"input":"hello",
			"messages":[{"role":"user","content":"should be dropped"}],
			"stream":true,
			"reasoning_effort":"high",
			"dimensions":0,
			"encoding_format":""
		}`),
		"text-embedding-v1",
	)
	require.NoError(t, err)
	require.NotNil(t, result)
	require.False(t, gjson.GetBytes(upstream.lastBody, "messages").Exists())
	require.False(t, gjson.GetBytes(upstream.lastBody, "stream").Exists())
	require.False(t, gjson.GetBytes(upstream.lastBody, "reasoning_effort").Exists())
	require.False(t, gjson.GetBytes(upstream.lastBody, "dimensions").Exists())
	require.False(t, gjson.GetBytes(upstream.lastBody, "encoding_format").Exists())
}

func TestForwardOpenAIEmbeddings_MiniMaxNormalizesResponse(t *testing.T) {
	t.Parallel()

	channel := &Channel{
		ID:           1007,
		Name:         "domestic-minimax-embeddings-test",
		ProviderType: ProviderTypeMiniMax,
		ProviderConfig: map[string]any{
			"base_url": "https://api.minimaxi.com",
			"api_key":  "sk-minimax-test",
		},
	}
	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header: http.Header{
				"Content-Type": []string{"application/json"},
				"X-Request-Id": []string{"req_minimax_embeddings_gateway"},
			},
			Body: io.NopCloser(strings.NewReader(`{
				"vectors":[[0.1,0.2,0.3],[0.4,0.5,0.6]],
				"total_tokens":6,
				"base_resp":{"status_code":0,"status_msg":"success"}
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	c, rec := newDomesticEmbeddingsTestContext()

	result, err := svc.ForwardOpenAIEmbeddings(
		context.Background(),
		c,
		channel,
		[]byte(`{"model":"embo-01","input":["hello","world"]}`),
		"embo-01",
	)
	require.NoError(t, err)
	require.NotNil(t, result)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "https://api.minimaxi.com/v1/embeddings", upstream.lastReq.URL.String())
	require.False(t, gjson.GetBytes(upstream.lastBody, "input").Exists())
	require.Equal(t, "hello", gjson.GetBytes(upstream.lastBody, "texts.0").String())
	require.Equal(t, "world", gjson.GetBytes(upstream.lastBody, "texts.1").String())
	require.Equal(t, "db", gjson.GetBytes(upstream.lastBody, "type").String())
	require.JSONEq(t, `{
		"object":"list",
		"model":"embo-01",
		"data":[
			{"object":"embedding","index":0,"embedding":[0.1,0.2,0.3]},
			{"object":"embedding","index":1,"embedding":[0.4,0.5,0.6]}
		],
		"usage":{"prompt_tokens":6,"total_tokens":6}
	}`, rec.Body.String())
	require.Equal(t, "req_minimax_embeddings_gateway", result.RequestID)
	require.Equal(t, "embo-01", result.UpstreamModel)
	require.Equal(t, 6, result.Usage.InputTokens)
	require.Equal(t, 0, result.Usage.OutputTokens)
}

func TestForwardOpenAIRerank_QwenSuccess(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header: http.Header{
				"Content-Type": []string{"application/json"},
				"X-Request-Id": []string{"req_rerank_gateway"},
			},
			Body: io.NopCloser(strings.NewReader(`{
				"model":"qwen3-rerank",
				"results":[
					{"index":2,"relevance_score":0.99},
					{"index":0,"relevance_score":0.41}
				],
				"usage":{"total_tokens":6}
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	c, rec := newDomesticRerankTestContext()

	result, err := svc.ForwardOpenAIRerank(
		context.Background(),
		c,
		newQwenTestChannel(),
		[]byte(`{"model":"qwen3-rerank","query":"ping","documents":["pong","hello","ping result"],"top_n":2}`),
		"qwen3-rerank",
	)
	require.NoError(t, err)
	require.NotNil(t, result)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "https://dashscope.aliyuncs.com/compatible-api/v1/reranks", upstream.lastReq.URL.String())
	require.Equal(t, "qwen3-rerank", result.UpstreamModel)
	require.Equal(t, "req_rerank_gateway", result.RequestID)
	require.Equal(t, 6, result.Usage.InputTokens)
	require.Equal(t, 0, result.Usage.OutputTokens)
	require.False(t, gjson.GetBytes(upstream.lastBody, "input").Exists())
	require.Contains(t, rec.Body.String(), `"relevance_score"`)
}

func TestForwardOpenAIRerank_MiniMaxSanitizesChatFields(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body: io.NopCloser(strings.NewReader(`{
				"model":"MiniMax-rerank",
				"results":[{"index":0,"relevance_score":0.66}],
				"usage":{"total_tokens":3}
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	c, _ := newDomesticRerankTestContext()

	result, err := svc.ForwardOpenAIRerank(
		context.Background(),
		c,
		newMiniMaxTestChannel(),
		[]byte(`{
			"model":"MiniMax-rerank",
			"query":"ping",
			"documents":["pong"],
			"messages":[{"role":"user","content":"drop"}],
			"stream":true,
			"reasoning_effort":"high",
			"input":{"query":"bad"},
			"top_n":0
		}`),
		"MiniMax-rerank",
	)
	require.NoError(t, err)
	require.NotNil(t, result)
	require.Equal(t, "https://api.minimax.io/v1/rerank", upstream.lastReq.URL.String())
	require.False(t, gjson.GetBytes(upstream.lastBody, "messages").Exists())
	require.False(t, gjson.GetBytes(upstream.lastBody, "stream").Exists())
	require.False(t, gjson.GetBytes(upstream.lastBody, "reasoning_effort").Exists())
	require.False(t, gjson.GetBytes(upstream.lastBody, "input").Exists())
	require.False(t, gjson.GetBytes(upstream.lastBody, "top_n").Exists())
}

func TestForwardOpenAIRerank_MiniMaxRespectsConfiguredEndpointPath(t *testing.T) {
	t.Parallel()

	channel := &Channel{
		ID:           1008,
		Name:         "domestic-minimax-rerank-custom-endpoint",
		ProviderType: ProviderTypeMiniMax,
		ProviderConfig: map[string]any{
			"base_url":      "https://api.minimaxi.com",
			"api_key":       "sk-minimax-test",
			"endpoint_path": "/v1/text/rerank",
		},
	}
	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body: io.NopCloser(strings.NewReader(`{
				"model":"MiniMax-rerank",
				"results":[{"index":0,"relevance_score":0.66}],
				"usage":{"total_tokens":3}
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	c, _ := newDomesticRerankTestContext()

	result, err := svc.ForwardOpenAIRerank(
		context.Background(),
		c,
		channel,
		[]byte(`{"model":"MiniMax-rerank","query":"ping","documents":["pong"]}`),
		"MiniMax-rerank",
	)
	require.NoError(t, err)
	require.NotNil(t, result)
	require.Equal(t, "https://api.minimaxi.com/v1/text/rerank", upstream.lastReq.URL.String())
}

func TestForwardOpenAIRerank_ZhipuSanitizesChatFields(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body: io.NopCloser(strings.NewReader(`{
				"model":"rerank",
				"results":[{"index":0,"relevance_score":0.88}],
				"usage":{"total_tokens":3}
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	c, _ := newDomesticRerankTestContext()

	result, err := svc.ForwardOpenAIRerank(
		context.Background(),
		c,
		newZhipuTestChannel(),
		[]byte(`{
			"model":"rerank",
			"query":"ping",
			"documents":["pong"],
			"messages":[{"role":"user","content":"drop"}],
			"stream":true,
			"thinking":{"type":"enabled"},
			"input":{"query":"bad"},
			"top_n":0
		}`),
		"rerank",
	)
	require.NoError(t, err)
	require.NotNil(t, result)
	require.Equal(t, "https://open.bigmodel.cn/api/paas/v4/rerank", upstream.lastReq.URL.String())
	require.False(t, gjson.GetBytes(upstream.lastBody, "messages").Exists())
	require.False(t, gjson.GetBytes(upstream.lastBody, "stream").Exists())
	require.False(t, gjson.GetBytes(upstream.lastBody, "thinking").Exists())
	require.False(t, gjson.GetBytes(upstream.lastBody, "input").Exists())
	require.False(t, gjson.GetBytes(upstream.lastBody, "top_n").Exists())
}

func TestForwardOpenAIRerank_QwenSanitizesChatFields(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body: io.NopCloser(strings.NewReader(`{
				"model":"qwen3-rerank",
				"results":[{"index":0,"relevance_score":0.5}],
				"usage":{"total_tokens":3}
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	c, _ := newDomesticRerankTestContext()

	result, err := svc.ForwardOpenAIRerank(
		context.Background(),
		c,
		newQwenTestChannel(),
		[]byte(`{
			"model":"qwen3-rerank",
			"query":"ping",
			"documents":["pong"],
			"messages":[{"role":"user","content":"drop"}],
			"stream":true,
			"reasoning_effort":"high",
			"input":{"query":"bad"},
			"top_n":0,
			"max_chunk_per_doc":4,
			"overlap_tokens":32
		}`),
		"qwen3-rerank",
	)
	require.NoError(t, err)
	require.NotNil(t, result)
	require.False(t, gjson.GetBytes(upstream.lastBody, "messages").Exists())
	require.False(t, gjson.GetBytes(upstream.lastBody, "stream").Exists())
	require.False(t, gjson.GetBytes(upstream.lastBody, "reasoning_effort").Exists())
	require.False(t, gjson.GetBytes(upstream.lastBody, "input").Exists())
	require.False(t, gjson.GetBytes(upstream.lastBody, "top_n").Exists())
	require.False(t, gjson.GetBytes(upstream.lastBody, "max_chunk_per_doc").Exists())
	require.False(t, gjson.GetBytes(upstream.lastBody, "overlap_tokens").Exists())
}

func TestForwardAnthropicMessages_BufferedRoundTrip(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header: http.Header{
				"Content-Type": []string{"application/json"},
				"X-Request-Id": []string{"req_domestic_messages_buffered"},
			},
			Body: io.NopCloser(strings.NewReader(`{
				"id":"chatcmpl_msg_buffered_1",
				"object":"chat.completion",
				"created":1700000000,
				"model":"deepseek-chat",
				"choices":[{"index":0,"message":{"role":"assistant","content":"Buffered hello"},"finish_reason":"stop"}],
				"usage":{"prompt_tokens":9,"completion_tokens":3,"total_tokens":12}
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	c, rec := newDomesticMessagesTestContext()

	result, err := svc.ForwardAnthropicMessages(
		context.Background(),
		c,
		newDomesticTestChannel(),
		[]byte(`{"model":"claude-sonnet-4-20250514","max_tokens":128,"messages":[{"role":"user","content":"Hello"}],"stream":false}`),
		"claude-sonnet-4-20250514",
	)
	require.NoError(t, err)
	require.NotNil(t, result)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), `"type":"message"`)
	require.Contains(t, rec.Body.String(), `"role":"assistant"`)
	require.Contains(t, rec.Body.String(), `"Buffered hello"`)
	require.Contains(t, rec.Body.String(), `"model":"claude-sonnet-4-20250514"`)
	require.Equal(t, "req_domestic_messages_buffered", result.RequestID)
	require.Equal(t, "deepseek-chat", result.UpstreamModel)
	require.Equal(t, 9, result.Usage.InputTokens)
	require.Equal(t, 3, result.Usage.OutputTokens)

	require.Equal(t, "https://domestic.example.com/v1/chat/completions", upstream.lastReq.URL.String())
	require.Equal(t, "Bearer sk-domestic-test", upstream.lastReq.Header.Get("Authorization"))
	require.Equal(t, "application/json", upstream.lastReq.Header.Get("Accept"))
	require.Equal(t, "domestic-messages-test/1.0", upstream.lastReq.Header.Get("User-Agent"))
	require.Equal(t, "claude-sonnet-4-20250514", gjson.GetBytes(upstream.lastBody, "model").String())
	require.Equal(t, "user", gjson.GetBytes(upstream.lastBody, "messages.0.role").String())
	require.Equal(t, "Hello", gjson.GetBytes(upstream.lastBody, "messages.0.content").String())
}

func TestForwardAnthropicMessages_StreamRoundTrip(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header: http.Header{
				"Content-Type": []string{"text/event-stream"},
				"X-Request-Id": []string{"req_domestic_messages_stream"},
			},
			Body: io.NopCloser(strings.NewReader(strings.Join([]string{
				`data: {"id":"chatcmpl_msg_stream_1","object":"chat.completion.chunk","created":1700000000,"model":"deepseek-chat","choices":[{"index":0,"delta":{"content":"Hel"}}]}`,
				``,
				`data: {"id":"chatcmpl_msg_stream_1","object":"chat.completion.chunk","created":1700000001,"model":"deepseek-chat","choices":[{"index":0,"delta":{"content":"lo"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}`,
				``,
				`data: [DONE]`,
				``,
			}, "\n"))),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	c, rec := newDomesticMessagesTestContext()

	result, err := svc.ForwardAnthropicMessages(
		context.Background(),
		c,
		newDomesticTestChannel(),
		[]byte(`{"model":"claude-sonnet-4-20250514","max_tokens":128,"messages":[{"role":"user","content":"Hello"}],"stream":true}`),
		"claude-sonnet-4-20250514",
	)
	require.NoError(t, err)
	require.NotNil(t, result)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Header().Get("Content-Type"), "text/event-stream")
	require.Contains(t, rec.Body.String(), "event: message_start")
	require.Contains(t, rec.Body.String(), "event: content_block_start")
	require.Contains(t, rec.Body.String(), "event: content_block_delta")
	require.Contains(t, rec.Body.String(), "event: message_delta")
	require.Contains(t, rec.Body.String(), "event: message_stop")
	require.Contains(t, rec.Body.String(), `"text":"Hel"`)
	require.Contains(t, rec.Body.String(), `"text":"lo"`)
	require.Equal(t, "req_domestic_messages_stream", result.RequestID)
	require.Equal(t, "deepseek-chat", result.UpstreamModel)
	require.NotNil(t, result.FirstTokenMs)
	require.Equal(t, 10, result.Usage.InputTokens)
	require.Equal(t, 2, result.Usage.OutputTokens)
}

func TestForwardAnthropicMessages_ErrorNormalization(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusUnauthorized,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(`{"error":{"type":"authentication_error","code":"invalid_api_key","message":"bad key"}}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	c, rec := newDomesticMessagesTestContext()

	result, err := svc.ForwardAnthropicMessages(
		context.Background(),
		c,
		newDomesticTestChannel(),
		[]byte(`{"model":"claude-sonnet-4-20250514","max_tokens":128,"messages":[{"role":"user","content":"Hello"}]}`),
		"claude-sonnet-4-20250514",
	)
	require.Nil(t, result)
	require.ErrorIs(t, err, ErrDomesticResponseWritten)
	require.Equal(t, http.StatusUnauthorized, rec.Code)
	require.JSONEq(t, `{"type":"error","error":{"type":"authentication_error","message":"bad key"}}`, rec.Body.String())
}

func TestWriteAnthropicStreamErrorEvent(t *testing.T) {
	t.Parallel()

	c, rec := newDomesticMessagesTestContext()
	rec.WriteHeader(http.StatusOK)

	err := writeAnthropicStreamErrorEvent(c, nil, "api_error", "stream broke")
	require.NoError(t, err)
	require.Contains(t, rec.Body.String(), "event: error")
	require.Contains(t, rec.Body.String(), `"type":"error"`)
	require.Contains(t, rec.Body.String(), `"message":"stream broke"`)
}

func TestDomesticChannelExecutionService_TestConnectionSuccess(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header: http.Header{
				"Content-Type": []string{"application/json"},
				"X-Request-Id": []string{"req_test_connection"},
			},
			Body: io.NopCloser(strings.NewReader(`{"id":"chatcmpl_test","model":"deepseek-chat","choices":[{"message":{"role":"assistant","content":"pong"}}]}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	result, err := svc.TestConnection(context.Background(), ProviderTypeDeepSeek, map[string]any{
		"base_url": "https://api.deepseek.com",
		"api_key":  "sk-test",
	}, "")
	require.NoError(t, err)
	require.NotNil(t, result)
	require.True(t, result.Success)
	require.Equal(t, http.StatusOK, result.StatusCode)
	require.Equal(t, "req_test_connection", result.RequestID)
	require.Equal(t, "deepseek-chat", result.UpstreamModel)
	require.Contains(t, result.Message, "Connection test succeeded")
	require.Equal(t, "https://api.deepseek.com/v1/chat/completions", upstream.lastReq.URL.String())
	require.Equal(t, "Bearer sk-test", upstream.lastReq.Header.Get("Authorization"))
	require.Equal(t, "deepseek-chat", gjson.GetBytes(upstream.lastBody, "model").String())
}

func TestDomesticChannelExecutionService_TestConnectionMiniMaxPayloadNormalization(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(`{"id":"req_minimax","model":"MiniMax-M2.5","base_resp":{"status_code":0,"status_msg":"success"}}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	result, err := svc.TestConnection(context.Background(), ProviderTypeMiniMax, map[string]any{
		"base_url": "https://api.minimax.io",
		"api_key":  "sk-minimax-test",
	}, "MiniMax-M2.5")
	require.NoError(t, err)
	require.NotNil(t, result)
	require.True(t, result.Success)
	require.Equal(t, int64(1), gjson.GetBytes(upstream.lastBody, "max_completion_tokens").Int())
	require.False(t, gjson.GetBytes(upstream.lastBody, "temperature").Exists())
}

func TestDomesticChannelExecutionService_TestConnectionKimiUsesTemperatureOne(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(`{"id":"req_kimi","model":"kimi-k2.6","choices":[{"message":{"role":"assistant","content":"pong"}}]}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	result, err := svc.TestConnection(context.Background(), ProviderTypeKimi, map[string]any{
		"base_url": "https://api.moonshot.cn/v1",
		"api_key":  "sk-kimi-test",
	}, "kimi-k2.6")
	require.NoError(t, err)
	require.NotNil(t, result)
	require.True(t, result.Success)
	require.Equal(t, float64(1), gjson.GetBytes(upstream.lastBody, "temperature").Float())
}

func TestDomesticChannelExecutionService_TestConnectionFailure(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusUnauthorized,
			Header: http.Header{
				"Content-Type": []string{"application/json"},
			},
			Body: io.NopCloser(strings.NewReader(`{"error":{"message":"bad key"}}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	result, err := svc.TestConnection(context.Background(), ProviderTypeDeepSeek, map[string]any{
		"base_url": "https://api.deepseek.com",
		"api_key":  "sk-bad",
	}, "deepseek-chat")
	require.NoError(t, err)
	require.NotNil(t, result)
	require.False(t, result.Success)
	require.Equal(t, http.StatusUnauthorized, result.StatusCode)
	require.Equal(t, "bad key", result.Message)
	require.Contains(t, result.ResponsePreview, `"error":{"message":"bad key"}`)
}

func TestParseDomesticProviderRuntimeConfig_Defaults(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name         string
		providerType string
		wantBaseURL  string
		wantEndpoint string
		wantModel    string
	}{
		{
			name:         "deepseek",
			providerType: ProviderTypeDeepSeek,
			wantBaseURL:  "https://api.deepseek.com",
			wantEndpoint: "/v1/chat/completions",
			wantModel:    "deepseek-chat",
		},
		{
			name:         "qwen",
			providerType: ProviderTypeQwen,
			wantBaseURL:  "https://dashscope.aliyuncs.com/compatible-mode",
			wantEndpoint: "/v1/chat/completions",
			wantModel:    "qwen-plus",
		},
		{
			name:         "doubao",
			providerType: ProviderTypeDoubao,
			wantBaseURL:  "https://ark.cn-beijing.volces.com/api/v3",
			wantEndpoint: "/chat/completions",
			wantModel:    "doubao-seed-2-0-pro-260215",
		},
		{
			name:         "zhipu",
			providerType: ProviderTypeZhipu,
			wantBaseURL:  "https://open.bigmodel.cn/api/paas/v4",
			wantEndpoint: "/chat/completions",
			wantModel:    "glm-4-flash",
		},
		{
			name:         "kimi",
			providerType: ProviderTypeKimi,
			wantBaseURL:  "https://api.moonshot.cn",
			wantEndpoint: "/v1/chat/completions",
			wantModel:    "kimi-k2.6",
		},
		{
			name:         "minimax",
			providerType: ProviderTypeMiniMax,
			wantBaseURL:  "https://api.minimaxi.com",
			wantEndpoint: "/v1/text/chatcompletion_v2",
			wantModel:    "MiniMax-M2.7",
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			cfg, err := parseDomesticProviderRuntimeConfig(tc.providerType, map[string]any{
				"api_key": "sk-test",
			})
			require.NoError(t, err)
			require.Equal(t, tc.wantBaseURL, cfg.BaseURL)
			require.Equal(t, tc.wantEndpoint, cfg.EndpointPath)
			require.Equal(t, tc.wantModel, defaultDomesticTestModel(tc.providerType))
			require.Equal(t, buildDomesticChatCompletionsURL(cfg), tc.wantBaseURL+tc.wantEndpoint)
		})
	}
}

func TestBuildDomesticRequestURL_AvoidsDuplicatedVersionPrefix(t *testing.T) {
	t.Parallel()

	require.Equal(
		t,
		"https://api.moonshot.ai/v1/chat/completions",
		buildDomesticRequestURL("https://api.moonshot.ai/v1", "/v1/chat/completions"),
	)
	require.Equal(
		t,
		"https://api.moonshot.ai/v1/embeddings",
		buildDomesticRequestURL("https://api.moonshot.ai/v1", "/v1/embeddings"),
	)
	require.Equal(
		t,
		"https://dashscope.aliyuncs.com/compatible-api/v1/reranks",
		buildDomesticRequestURL("https://dashscope.aliyuncs.com/compatible-api/v1", "/reranks"),
	)
}
