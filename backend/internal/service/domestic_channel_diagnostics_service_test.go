package service

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

func TestDomesticChannelExecutionService_TestResponsesSuccess(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header: http.Header{
				"Content-Type": []string{"application/json"},
				"X-Request-Id": []string{"req_responses_test"},
			},
			Body: io.NopCloser(strings.NewReader(`{
				"id":"chatcmpl_resp_test_1",
				"object":"chat.completion",
				"created":1700000000,
				"model":"deepseek-chat",
				"choices":[{"index":0,"message":{"role":"assistant","content":"pong"},"finish_reason":"stop"}],
				"usage":{"prompt_tokens":7,"completion_tokens":2,"total_tokens":9}
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	result, err := svc.TestResponses(context.Background(), "deepseek", map[string]any{
		"base_url":      "https://api.deepseek.com",
		"api_key":       "sk-domestic-test",
		"endpoint_path": "/v1/chat/completions",
		"headers":       map[string]any{},
	}, "deepseek-chat")
	require.NoError(t, err)
	require.NotNil(t, result)
	require.True(t, result.Success)
	require.Equal(t, http.StatusOK, result.StatusCode)
	require.Equal(t, "req_responses_test", result.RequestID)
	require.Equal(t, "deepseek-chat", result.UpstreamModel)
	require.Contains(t, result.Message, "Responses chain test succeeded")
	require.Contains(t, result.ResponsePreview, `"object": "response"`)
	require.Contains(t, result.ResponsePreview, `"model": "deepseek-chat"`)
	require.Equal(t, "https://api.deepseek.com/v1/chat/completions", upstream.lastReq.URL.String())
}

func TestDomesticChannelExecutionService_TestResponsesMiniMaxBusinessError(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header: http.Header{
				"Content-Type": []string{"application/json"},
			},
			Body: io.NopCloser(strings.NewReader(`{
				"base_resp":{"status_code":1008,"status_msg":"quota exceeded"}
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	result, err := svc.TestResponses(context.Background(), "minimax", map[string]any{
		"base_url": "https://api.minimax.io",
		"api_key":  "sk-minimax-test",
	}, "MiniMax-M2.5")
	require.NoError(t, err)
	require.NotNil(t, result)
	require.False(t, result.Success)
	require.Equal(t, http.StatusTooManyRequests, result.StatusCode)
	require.Equal(t, "quota exceeded", result.Message)
}

func TestDomesticChannelExecutionService_TestMessagesSuccess(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header: http.Header{
				"Content-Type": []string{"application/json"},
				"X-Request-Id": []string{"req_messages_test"},
			},
			Body: io.NopCloser(strings.NewReader(`{
				"id":"chatcmpl_msg_test_1",
				"object":"chat.completion",
				"created":1700000000,
				"model":"deepseek-chat",
				"choices":[{"index":0,"message":{"role":"assistant","content":"pong"},"finish_reason":"stop"}],
				"usage":{"prompt_tokens":7,"completion_tokens":2,"total_tokens":9}
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	result, err := svc.TestMessages(context.Background(), "deepseek", map[string]any{
		"base_url":      "https://api.deepseek.com",
		"api_key":       "sk-domestic-test",
		"endpoint_path": "/v1/chat/completions",
		"headers":       map[string]any{},
	}, "claude-sonnet-4-20250514")
	require.NoError(t, err)
	require.NotNil(t, result)
	require.True(t, result.Success)
	require.Equal(t, http.StatusOK, result.StatusCode)
	require.Equal(t, "req_messages_test", result.RequestID)
	require.Equal(t, "deepseek-chat", result.UpstreamModel)
	require.Contains(t, result.Message, "Messages chain test succeeded")
	require.Contains(t, result.ResponsePreview, `"type": "message"`)
	require.Contains(t, result.ResponsePreview, `"model": "claude-sonnet-4-20250514"`)
	require.Contains(t, result.ResponsePreview, `"text": "pong"`)
	require.Equal(t, "https://api.deepseek.com/v1/chat/completions", upstream.lastReq.URL.String())
}

func TestDomesticChannelExecutionService_TestMessagesKimiBaseURLWithVersion(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header: http.Header{
				"Content-Type": []string{"application/json"},
				"X-Request-Id": []string{"req_messages_kimi_test"},
			},
			Body: io.NopCloser(strings.NewReader(`{
				"id":"chatcmpl_msg_kimi_test_1",
				"object":"chat.completion",
				"created":1700000000,
				"model":"kimi-k2.6",
				"choices":[{"index":0,"message":{"role":"assistant","content":"pong"},"finish_reason":"stop"}],
				"usage":{"prompt_tokens":7,"completion_tokens":2,"total_tokens":9}
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	result, err := svc.TestMessages(context.Background(), "kimi", map[string]any{
		"base_url": "https://api.moonshot.ai/v1",
		"api_key":  "sk-kimi-test",
		"headers":  map[string]any{},
	}, "kimi-k2.6")
	require.NoError(t, err)
	require.NotNil(t, result)
	require.True(t, result.Success)
	require.Equal(t, "https://api.moonshot.ai/v1/chat/completions", upstream.lastReq.URL.String())
}

func TestDomesticChannelExecutionService_FetchAvailableModelsSuccess(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header: http.Header{
				"Content-Type": []string{"application/json"},
				"X-Request-Id": []string{"req_models_test"},
			},
			Body: io.NopCloser(strings.NewReader(`{
				"object":"list",
				"data":[
					{"id":"deepseek-chat","object":"model"},
					{"id":"deepseek-reasoner","object":"model"}
				]
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	result, err := svc.FetchAvailableModels(context.Background(), "deepseek", map[string]any{
		"base_url":      "https://api.deepseek.com",
		"api_key":       "sk-domestic-test",
		"endpoint_path": "/v1/chat/completions",
		"headers":       map[string]any{},
	})
	require.NoError(t, err)
	require.NotNil(t, result)
	require.True(t, result.Success)
	require.Equal(t, http.StatusOK, result.StatusCode)
	require.Equal(t, []string{"deepseek-chat", "deepseek-reasoner"}, result.Models)
	require.Equal(t, []string{"deepseek-chat", "deepseek-reasoner"}, result.CapabilityModels["chat"])
	require.Len(t, result.ModelCatalog, 2)
	require.Contains(t, result.Message, "Fetched 2 models")
	require.Contains(t, result.ResponsePreview, `"models": [`)
	require.Contains(t, result.ResponsePreview, `"capability_models":`)
	require.Equal(t, "https://api.deepseek.com/v1/models", upstream.lastReq.URL.String())
}

func TestDomesticChannelExecutionService_FetchAvailableModelsBuildsCapabilityCatalog(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header: http.Header{
				"Content-Type": []string{"application/json"},
			},
			Body: io.NopCloser(strings.NewReader(`{
				"object":"list",
				"data":[
					{"id":"doubao-seed-2-0-pro-260215","name":"doubao-seed-2-0-pro","version":"260215","domain":"LLM","task_type":"TextGeneration","status":"Active"},
					{"id":"doubao-embedding-vision-251215","name":"doubao-embedding-vision","version":"251215","domain":"Embedding","task_type":"ImageEmbedding","status":"Active"}
				]
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	result, err := svc.FetchAvailableModels(context.Background(), "doubao", map[string]any{
		"base_url": "https://ark.cn-beijing.volces.com/api/v3",
		"api_key":  "sk-doubao-test",
	})
	require.NoError(t, err)
	require.NotNil(t, result)
	require.True(t, result.Success)
	require.Equal(t, []string{"doubao-seed-2-0-pro-260215"}, result.CapabilityModels["chat"])
	require.Equal(t, []string{"doubao-embedding-vision-251215"}, result.CapabilityModels["embeddings"])
	_, ok := result.CapabilityModels["rerank"]
	require.False(t, ok)
	require.Len(t, result.ModelCatalog, 2)
	require.Equal(t, "doubao-embedding-vision-251215", result.ModelCatalog[0].ID)
	require.Equal(t, []string{"embeddings"}, result.ModelCatalog[0].Capabilities)
	require.Equal(t, "doubao-seed-2-0-pro-260215", result.ModelCatalog[1].ID)
	require.Equal(t, []string{"chat"}, result.ModelCatalog[1].Capabilities)
}

func TestDomesticChannelExecutionService_FetchAvailableModelsFallsBackToKnownModels(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header: http.Header{
				"Content-Type": []string{"application/json"},
			},
			Body: io.NopCloser(strings.NewReader(`{"object":"list","data":[]}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	result, err := svc.FetchAvailableModels(context.Background(), "kimi", map[string]any{
		"base_url":      "https://api.moonshot.ai",
		"api_key":       "sk-kimi-test",
		"endpoint_path": "/v1/chat/completions",
		"headers":       map[string]any{},
	})
	require.NoError(t, err)
	require.NotNil(t, result)
	require.True(t, result.Success)
	require.Contains(t, result.Models, "kimi-k2-thinking")
	require.Contains(t, result.Models, "kimi-k2.6")
	require.Contains(t, result.CapabilityModels["chat"], "kimi-k2-thinking")
	require.NotContains(t, result.CapabilityModels["embeddings"], "kimi-k2-thinking")
	require.Len(t, result.ModelCatalog, len(result.Models))
}

func TestDomesticChannelExecutionService_TestEmbeddingsSuccess(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header: http.Header{
				"Content-Type": []string{"application/json"},
				"X-Request-Id": []string{"req_embeddings_test"},
			},
			Body: io.NopCloser(strings.NewReader(`{
				"object":"list",
				"model":"text-embedding-v1",
				"data":[{"object":"embedding","index":0,"embedding":[0.1,0.2,0.3]}],
				"usage":{"prompt_tokens":3,"total_tokens":3}
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	result, err := svc.TestEmbeddings(context.Background(), "qwen", map[string]any{
		"base_url":      "https://dashscope.aliyuncs.com/compatible-mode",
		"api_key":       "sk-qwen-test",
		"endpoint_path": "/v1/chat/completions",
		"headers":       map[string]any{},
	}, "")
	require.NoError(t, err)
	require.NotNil(t, result)
	require.True(t, result.Success)
	require.Equal(t, "req_embeddings_test", result.RequestID)
	require.Equal(t, "text-embedding-v1", result.UpstreamModel)
	require.Contains(t, result.Message, "Embeddings test succeeded")
	require.Equal(t, "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings", upstream.lastReq.URL.String())
}

func TestDomesticChannelExecutionService_TestEmbeddingsQwenSanitizesBody(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body: io.NopCloser(strings.NewReader(`{
				"object":"list",
				"model":"text-embedding-v1",
				"data":[{"object":"embedding","index":0,"embedding":[0.1,0.2,0.3]}],
				"usage":{"prompt_tokens":3,"total_tokens":3}
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	result, err := svc.TestEmbeddings(context.Background(), "qwen", map[string]any{
		"base_url": "https://dashscope.aliyuncs.com/compatible-mode",
		"api_key":  "sk-qwen-test",
	}, "text-embedding-v1")
	require.NoError(t, err)
	require.NotNil(t, result)
	require.True(t, result.Success)
	require.False(t, strings.Contains(string(upstream.lastBody), `"messages"`))
}

func TestDomesticChannelExecutionService_TestEmbeddingsKimiSanitizesBody(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body: io.NopCloser(strings.NewReader(`{
				"object":"list",
				"model":"kimi-embedding",
				"data":[{"object":"embedding","index":0,"embedding":[0.1,0.2,0.3]}],
				"usage":{"prompt_tokens":3,"total_tokens":3}
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	result, err := svc.TestEmbeddings(context.Background(), "kimi", map[string]any{
		"base_url": "https://api.moonshot.ai/v1",
		"api_key":  "sk-kimi-test",
	}, "kimi-embedding")
	require.NoError(t, err)
	require.NotNil(t, result)
	require.True(t, result.Success)
	require.False(t, strings.Contains(string(upstream.lastBody), `"messages"`))
	require.False(t, strings.Contains(string(upstream.lastBody), `"stream"`))
}

func TestDomesticChannelExecutionService_TestEmbeddingsDoubaoSanitizesBody(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body: io.NopCloser(strings.NewReader(`{
				"object":"list",
				"model":"doubao-embedding-vision-251215",
				"data":{"object":"embedding","embedding":[0.1,0.2,0.3]},
				"usage":{"prompt_tokens":3,"total_tokens":3}
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	result, err := svc.TestEmbeddings(context.Background(), "doubao", map[string]any{
		"base_url": "https://ark.cn-beijing.volces.com/api/v3",
		"api_key":  "sk-doubao-test",
	}, "doubao-embedding-vision")
	require.NoError(t, err)
	require.NotNil(t, result)
	require.True(t, result.Success)
	require.False(t, strings.Contains(string(upstream.lastBody), `"messages"`))
	require.False(t, strings.Contains(string(upstream.lastBody), `"stream"`))
	require.Equal(t, "doubao-embedding-vision-251215", result.UpstreamModel)
	require.Equal(t, "https://ark.cn-beijing.volces.com/api/v3/embeddings/multimodal", upstream.lastReq.URL.String())
	require.Equal(t, "text", gjson.GetBytes(upstream.lastBody, "input.0.type").String())
}

func TestDomesticChannelExecutionService_TestEmbeddingsDoubaoUsesDefaultModel(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body: io.NopCloser(strings.NewReader(`{
				"object":"list",
				"model":"doubao-embedding-vision-251215",
				"data":{"object":"embedding","embedding":[0.1,0.2,0.3]},
				"usage":{"prompt_tokens":3,"total_tokens":3}
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	result, err := svc.TestEmbeddings(context.Background(), "doubao", map[string]any{
		"base_url": "https://ark.cn-beijing.volces.com/api/v3",
		"api_key":  "sk-doubao-test",
	}, "")
	require.NoError(t, err)
	require.NotNil(t, result)
	require.True(t, result.Success)
	require.Equal(t, "doubao-embedding-vision-251215", result.UpstreamModel)
}

func TestDomesticChannelExecutionService_TestEmbeddingsZhipuUsesDefaultModel(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body: io.NopCloser(strings.NewReader(`{
				"object":"list",
				"model":"embedding-3",
				"data":[{"object":"embedding","index":0,"embedding":[0.1,0.2,0.3]}],
				"usage":{"prompt_tokens":3,"total_tokens":3}
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	result, err := svc.TestEmbeddings(context.Background(), "zhipu", map[string]any{
		"base_url": "https://open.bigmodel.cn/api/paas/v4",
		"api_key":  "zhipu.test-secret",
	}, "")
	require.NoError(t, err)
	require.NotNil(t, result)
	require.True(t, result.Success)
	require.Equal(t, "embedding-3", result.UpstreamModel)
}

func TestDomesticChannelExecutionService_TestEmbeddingsKimiRequiresModelWithKnownModelsHint(t *testing.T) {
	t.Parallel()

	svc := NewDomesticChannelExecutionService(nil, nil, &domesticResponsesHTTPUpstreamStub{})
	result, err := svc.TestEmbeddings(context.Background(), "kimi", map[string]any{
		"base_url": "https://api.moonshot.ai/v1",
		"api_key":  "sk-kimi-test",
	}, "")
	require.Nil(t, result)
	require.EqualError(t, err, "test_model is required for embeddings on provider kimi; known models: kimi-k2-0905-preview, kimi-k2-thinking, kimi-k2-thinking-turbo, kimi-k2-turbo-preview, kimi-k2.5, kimi-k2.6")
}

func TestDomesticChannelExecutionService_TestEmbeddingsQwenErrorNormalization(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusBadRequest,
			Header: http.Header{
				"Content-Type": []string{"application/json"},
			},
			Body: io.NopCloser(strings.NewReader(`{
				"code":"InvalidApiKey",
				"message":"invalid api key"
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	result, err := svc.TestEmbeddings(context.Background(), "qwen", map[string]any{
		"base_url": "https://dashscope.aliyuncs.com/compatible-mode",
		"api_key":  "sk-qwen-test",
	}, "text-embedding-v1")
	require.NoError(t, err)
	require.NotNil(t, result)
	require.False(t, result.Success)
	require.Equal(t, http.StatusUnauthorized, result.StatusCode)
	require.Equal(t, "invalid api key", result.Message)
}

func TestDomesticChannelExecutionService_TestEmbeddingsMiniMaxNormalizesVectors(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header: http.Header{
				"Content-Type": []string{"application/json"},
				"X-Request-Id": []string{"req_minimax_embeddings_test"},
			},
			Body: io.NopCloser(strings.NewReader(`{
				"vectors":[[0.1,0.2,0.3],[0.4,0.5,0.6]],
				"total_tokens":5,
				"base_resp":{"status_code":0,"status_msg":"success"}
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	result, err := svc.TestEmbeddings(context.Background(), "minimax", map[string]any{
		"base_url": "https://api.minimaxi.com",
		"api_key":  "sk-minimax-test",
	}, "embo-01")
	require.NoError(t, err)
	require.NotNil(t, result)
	require.True(t, result.Success)
	require.Equal(t, "req_minimax_embeddings_test", result.RequestID)
	require.Equal(t, "embo-01", result.UpstreamModel)
	require.Contains(t, result.Message, "2 vector item(s)")
	require.False(t, strings.Contains(string(upstream.lastBody), `"input"`))
	require.Contains(t, string(upstream.lastBody), `"texts":["ping"]`)
	require.Contains(t, string(upstream.lastBody), `"type":"db"`)
	require.Contains(t, result.ResponsePreview, `"object":"list"`)
	require.Contains(t, result.ResponsePreview, `"embedding":[0.1,0.2,0.3]`)
}

func TestDomesticChannelExecutionService_TestRerankSuccess(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header: http.Header{
				"Content-Type": []string{"application/json"},
				"X-Request-Id": []string{"req_rerank_test"},
			},
			Body: io.NopCloser(strings.NewReader(`{
				"model":"qwen3-rerank",
				"results":[
					{"index":2,"relevance_score":0.98},
					{"index":0,"relevance_score":0.31}
				]
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	result, err := svc.TestRerank(context.Background(), "qwen", map[string]any{
		"base_url":      "https://dashscope.aliyuncs.com/compatible-mode",
		"api_key":       "sk-qwen-test",
		"endpoint_path": "/v1/chat/completions",
		"headers":       map[string]any{},
	}, "")
	require.NoError(t, err)
	require.NotNil(t, result)
	require.True(t, result.Success)
	require.Equal(t, "req_rerank_test", result.RequestID)
	require.Equal(t, "qwen3-rerank", result.UpstreamModel)
	require.Contains(t, result.Message, "Rerank test succeeded")
	require.Equal(t, "https://dashscope.aliyuncs.com/compatible-api/v1/reranks", upstream.lastReq.URL.String())
}

func TestDomesticChannelExecutionService_TestRerankQwenSanitizesBody(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body: io.NopCloser(strings.NewReader(`{
				"model":"qwen3-rerank",
				"results":[{"index":0,"relevance_score":0.5}]
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	result, err := svc.TestRerank(context.Background(), "qwen", map[string]any{
		"base_url": "https://dashscope.aliyuncs.com/compatible-mode",
		"api_key":  "sk-qwen-test",
	}, "qwen3-rerank")
	require.NoError(t, err)
	require.NotNil(t, result)
	require.True(t, result.Success)
	require.False(t, strings.Contains(string(upstream.lastBody), `"messages"`))
	require.False(t, strings.Contains(string(upstream.lastBody), `"input"`))
}

func TestDomesticChannelExecutionService_TestRerankMiniMaxSanitizesBody(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body: io.NopCloser(strings.NewReader(`{
				"model":"MiniMax-rerank",
				"results":[{"index":0,"relevance_score":0.5}]
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	result, err := svc.TestRerank(context.Background(), "minimax", map[string]any{
		"base_url": "https://api.minimax.io",
		"api_key":  "sk-minimax-test",
	}, "MiniMax-rerank")
	require.NoError(t, err)
	require.NotNil(t, result)
	require.True(t, result.Success)
	require.False(t, strings.Contains(string(upstream.lastBody), `"messages"`))
	require.False(t, strings.Contains(string(upstream.lastBody), `"input"`))
}

func TestDomesticChannelExecutionService_TestRerankZhipuSanitizesBody(t *testing.T) {
	t.Parallel()

	upstream := &domesticResponsesHTTPUpstreamStub{
		resp: &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body: io.NopCloser(strings.NewReader(`{
				"model":"rerank",
				"results":[{"index":0,"relevance_score":0.5}]
			}`)),
		},
	}

	svc := NewDomesticChannelExecutionService(nil, nil, upstream)
	result, err := svc.TestRerank(context.Background(), "zhipu", map[string]any{
		"base_url": "https://open.bigmodel.cn/api/paas/v4",
		"api_key":  "zhipu.test-secret",
	}, "rerank")
	require.NoError(t, err)
	require.NotNil(t, result)
	require.True(t, result.Success)
	require.False(t, strings.Contains(string(upstream.lastBody), `"messages"`))
	require.False(t, strings.Contains(string(upstream.lastBody), `"input"`))
}

func TestDomesticChannelExecutionService_TestRerankMiniMaxBusinessError(t *testing.T) {
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
	result, err := svc.TestRerank(context.Background(), "minimax", map[string]any{
		"base_url": "https://api.minimax.io",
		"api_key":  "sk-minimax-test",
	}, "MiniMax-M2.5")
	require.NoError(t, err)
	require.NotNil(t, result)
	require.False(t, result.Success)
	require.Equal(t, http.StatusUnauthorized, result.StatusCode)
	require.Equal(t, "invalid api key", result.Message)
}

func TestDomesticChannelExecutionService_TestRerankMiniMaxRequiresModelWithKnownModelsHint(t *testing.T) {
	t.Parallel()

	svc := NewDomesticChannelExecutionService(nil, nil, &domesticResponsesHTTPUpstreamStub{})
	result, err := svc.TestRerank(context.Background(), "minimax", map[string]any{
		"base_url": "https://api.minimax.io",
		"api_key":  "sk-minimax-test",
	}, "")
	require.Nil(t, result)
	require.EqualError(t, err, "test_model is required for rerank on provider minimax; no verified public MiniMax rerank model or endpoint yet")
}

func TestDomesticChannelExecutionService_TestRerankDoubaoRequiresModelWithKnownModelsHint(t *testing.T) {
	t.Parallel()

	svc := NewDomesticChannelExecutionService(nil, nil, &domesticResponsesHTTPUpstreamStub{})
	result, err := svc.TestRerank(context.Background(), "doubao", map[string]any{
		"base_url": "https://ark.cn-beijing.volces.com/api/v3",
		"api_key":  "sk-doubao-test",
	}, "")
	require.Nil(t, result)
	require.EqualError(t, err, "test_model is required for rerank on provider doubao; no verified public Doubao rerank model is visible in current Ark models list, please fill a custom model if your account has one")
}

func TestDefaultDomesticModelsPath(t *testing.T) {
	t.Parallel()

	require.Equal(t, "/v1/models", defaultDomesticModelsPath("/v1/chat/completions", "deepseek"))
	require.Equal(t, "/models", defaultDomesticModelsPath("/chat/completions", "zhipu"))
	require.Equal(t, "/models", defaultDomesticModelsPath("", "doubao"))
	require.Equal(t, "/v1/embeddings", defaultDomesticEmbeddingsPath("/v1/chat/completions", "qwen"))
	require.Equal(t, "/v1/reranks", defaultDomesticRerankPath("/v1/chat/completions", "qwen"))
	require.Equal(t, "/v1/text/embeddings", defaultDomesticEmbeddingsPath("/v1/text/embeddings", "minimax"))
	require.Equal(t, "/v1/text/rerank", defaultDomesticRerankPath("/v1/text/rerank", "minimax"))
	require.Equal(t, "https://api.moonshot.ai/v1/models", buildDomesticRequestURL("https://api.moonshot.ai/v1", defaultDomesticModelsPath("/v1/chat/completions", "kimi")))
	require.Equal(t, "https://api.moonshot.ai/v1/embeddings", buildDomesticRequestURL("https://api.moonshot.ai/v1", defaultDomesticEmbeddingsPath("/v1/chat/completions", "kimi")))
	require.Equal(t, "https://api.moonshot.ai/v1/rerank", buildDomesticRequestURL("https://api.moonshot.ai/v1", defaultDomesticRerankPath("/v1/chat/completions", "kimi")))
	require.Equal(t, "doubao-embedding-vision-251215", defaultDomesticEmbeddingsModel("doubao"))
	require.Equal(t, "embedding-3", defaultDomesticEmbeddingsModel("zhipu"))
	require.Equal(t, "", defaultDomesticRerankModel("doubao"))
	require.Equal(t, "rerank", defaultDomesticRerankModel("zhipu"))
	require.Equal(t, []string{"text-embedding-v1"}, knownDomesticCapabilityModels("qwen", "embeddings"))
	require.Equal(t, []string{"qwen3-rerank"}, knownDomesticCapabilityModels("qwen", "rerank"))
	require.Contains(t, knownDomesticCapabilityModels("doubao", "embeddings"), "doubao-embedding-vision-251215")
	require.Nil(t, knownDomesticCapabilityModels("doubao", "rerank"))
	require.Equal(t, []string{"rerank"}, knownDomesticCapabilityModels("zhipu", "rerank"))
	require.Equal(t, []string{"embo-01"}, knownDomesticCapabilityModels("minimax", "embeddings"))
	require.Nil(t, knownDomesticCapabilityModels("minimax", "rerank"))
	require.Contains(t, fallbackDomesticKnownModels("doubao"), "doubao-seed-2-0-pro-260215")
	require.Contains(t, fallbackDomesticKnownModels("doubao"), "doubao-embedding-vision-251215")
	require.Contains(t, fallbackDomesticKnownModels("zhipu"), "embedding-3")
	require.Contains(t, fallbackDomesticKnownModels("zhipu"), "embedding-2")
	require.Contains(t, fallbackDomesticKnownModels("zhipu"), "rerank")
	require.Contains(t, fallbackDomesticKnownModels("minimax"), "embo-01")
}

func TestInferDomesticModelCapabilities(t *testing.T) {
	t.Parallel()

	require.Equal(t, []string{"chat"}, inferDomesticModelCapabilities("doubao", "doubao-seed-2-0-pro-260215", "doubao-seed-2-0-pro", "LLM", "TextGeneration"))
	require.Equal(t, []string{"embeddings"}, inferDomesticModelCapabilities("doubao", "doubao-embedding-vision-251215", "doubao-embedding-vision", "Embedding", "ImageEmbedding"))
	require.Equal(t, []string{"rerank"}, inferDomesticModelCapabilities("zhipu", "rerank", "rerank", "", "Rerank"))
}
