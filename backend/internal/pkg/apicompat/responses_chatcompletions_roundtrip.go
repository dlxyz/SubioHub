package apicompat

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// ResponsesToChatCompletionsRequest converts a Responses API request into a
// Chat Completions request so OpenAI-compatible upstreams can serve /responses.
func ResponsesToChatCompletionsRequest(req *ResponsesRequest) (*ChatCompletionsRequest, error) {
	messages, err := convertResponsesInputToChatMessages(req.Input, req.Instructions)
	if err != nil {
		return nil, err
	}

	out := &ChatCompletionsRequest{
		Model:       req.Model,
		Messages:    messages,
		Temperature: req.Temperature,
		TopP:        req.TopP,
		Stream:      req.Stream,
		ServiceTier: req.ServiceTier,
		ToolChoice:  req.ToolChoice,
	}
	if req.MaxOutputTokens != nil && *req.MaxOutputTokens > 0 {
		v := *req.MaxOutputTokens
		out.MaxCompletionTokens = &v
	}
	if req.Reasoning != nil && req.Reasoning.Effort != "" {
		out.ReasoningEffort = req.Reasoning.Effort
	}
	if len(req.Tools) > 0 {
		out.Tools = convertResponsesToChatTools(req.Tools)
	}
	if req.Stream {
		out.StreamOptions = &ChatStreamOptions{IncludeUsage: true}
	}
	return out, nil
}

func convertResponsesInputToChatMessages(inputRaw json.RawMessage, instructions string) ([]ChatMessage, error) {
	var messages []ChatMessage
	if strings.TrimSpace(instructions) != "" {
		content, err := json.Marshal(instructions)
		if err != nil {
			return nil, err
		}
		messages = append(messages, ChatMessage{Role: "system", Content: content})
	}

	var inputStr string
	if err := json.Unmarshal(inputRaw, &inputStr); err == nil {
		content, _ := json.Marshal(inputStr)
		messages = append(messages, ChatMessage{Role: "user", Content: content})
		return messages, nil
	}

	var items []ResponsesInputItem
	if err := json.Unmarshal(inputRaw, &items); err != nil {
		return nil, fmt.Errorf("parse responses input: %w", err)
	}

	for _, item := range items {
		switch {
		case item.Role == "system":
			content, err := convertResponsesContentToChat(item.Content, true)
			if err != nil {
				return nil, err
			}
			messages = append(messages, ChatMessage{Role: "system", Content: content})
		case item.Role == "user":
			content, err := convertResponsesContentToChat(item.Content, false)
			if err != nil {
				return nil, err
			}
			messages = append(messages, ChatMessage{Role: "user", Content: content})
		case item.Role == "assistant":
			content, reasoning, err := convertResponsesAssistantContentToChat(item.Content)
			if err != nil {
				return nil, err
			}
			messages = append(messages, ChatMessage{
				Role:             "assistant",
				Content:          content,
				ReasoningContent: reasoning,
			})
		case item.Type == "function_call":
			args := strings.TrimSpace(item.Arguments)
			if args == "" {
				args = "{}"
			}
			messages = append(messages, ChatMessage{
				Role: "assistant",
				ToolCalls: []ChatToolCall{{
					ID:   item.CallID,
					Type: "function",
					Function: ChatFunctionCall{
						Name:      item.Name,
						Arguments: args,
					},
				}},
			})
		case item.Type == "function_call_output":
			output := item.Output
			if output == "" {
				output = "(empty)"
			}
			content, _ := json.Marshal(output)
			messages = append(messages, ChatMessage{
				Role:       "tool",
				ToolCallID: item.CallID,
				Content:    content,
			})
		default:
			if len(item.Content) == 0 {
				continue
			}
			content, err := convertResponsesContentToChat(item.Content, false)
			if err != nil {
				return nil, err
			}
			messages = append(messages, ChatMessage{Role: "user", Content: content})
		}
	}

	if len(messages) == 0 {
		content, _ := json.Marshal("")
		messages = append(messages, ChatMessage{Role: "user", Content: content})
	}
	return messages, nil
}

func convertResponsesContentToChat(raw json.RawMessage, textOnly bool) (json.RawMessage, error) {
	if len(raw) == 0 {
		return json.Marshal("")
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return json.Marshal(s)
	}

	var parts []ResponsesContentPart
	if err := json.Unmarshal(raw, &parts); err != nil {
		return raw, nil
	}
	if textOnly {
		return json.Marshal(extractTextFromContent(raw))
	}

	chatParts := make([]ChatContentPart, 0, len(parts))
	for _, p := range parts {
		switch p.Type {
		case "input_text", "output_text", "text":
			if p.Text != "" {
				chatParts = append(chatParts, ChatContentPart{Type: "text", Text: p.Text})
			}
		case "input_image":
			if p.ImageURL != "" && !isEmptyBase64DataURI(p.ImageURL) {
				chatParts = append(chatParts, ChatContentPart{
					Type:     "image_url",
					ImageURL: &ChatImageURL{URL: p.ImageURL},
				})
			}
		}
	}
	if len(chatParts) == 0 {
		return json.Marshal(extractTextFromContent(raw))
	}
	return json.Marshal(chatParts)
}

func convertResponsesAssistantContentToChat(raw json.RawMessage) (json.RawMessage, string, error) {
	if len(raw) == 0 {
		content, _ := json.Marshal("")
		return content, "", nil
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		content, _ := json.Marshal(s)
		return content, "", nil
	}

	var parts []ResponsesContentPart
	if err := json.Unmarshal(raw, &parts); err != nil {
		return raw, "", nil
	}

	var textParts []string
	for _, p := range parts {
		if (p.Type == "output_text" || p.Type == "text" || p.Type == "input_text") && p.Text != "" {
			textParts = append(textParts, p.Text)
		}
	}
	content, _ := json.Marshal(strings.Join(textParts, ""))
	return content, "", nil
}

func convertResponsesToChatTools(tools []ResponsesTool) []ChatTool {
	out := make([]ChatTool, 0, len(tools))
	for _, tool := range tools {
		if tool.Type != "function" {
			continue
		}
		out = append(out, ChatTool{
			Type: "function",
			Function: &ChatFunction{
				Name:        tool.Name,
				Description: tool.Description,
				Parameters:  tool.Parameters,
				Strict:      tool.Strict,
			},
		})
	}
	return out
}

// ChatCompletionsToResponsesResponse converts a Chat Completions response into
// a Responses API response.
func ChatCompletionsToResponsesResponse(resp *ChatCompletionsResponse) *ResponsesResponse {
	if resp == nil {
		return nil
	}
	id := strings.TrimSpace(resp.ID)
	if id == "" {
		id = generateResponsesID()
	}
	out := &ResponsesResponse{
		ID:     id,
		Object: "response",
		Model:  resp.Model,
		Status: "completed",
	}

	var finishReason string
	if len(resp.Choices) > 0 {
		choice := resp.Choices[0]
		finishReason = choice.FinishReason
		out.Output = chatMessageToResponsesOutputs(choice.Message)
	}
	if len(out.Output) == 0 {
		out.Output = []ResponsesOutput{{
			Type:    "message",
			ID:      generateItemID(),
			Role:    "assistant",
			Content: []ResponsesContentPart{{Type: "output_text", Text: ""}},
			Status:  "completed",
		}}
	}
	if finishReason == "length" {
		out.Status = "incomplete"
		out.IncompleteDetails = &ResponsesIncompleteDetails{Reason: "max_output_tokens"}
	}

	if resp.Usage != nil {
		out.Usage = &ResponsesUsage{
			InputTokens:  resp.Usage.PromptTokens,
			OutputTokens: resp.Usage.CompletionTokens,
			TotalTokens:  resp.Usage.TotalTokens,
		}
		if resp.Usage.PromptTokensDetails != nil && resp.Usage.PromptTokensDetails.CachedTokens > 0 {
			out.Usage.InputTokensDetails = &ResponsesInputTokensDetails{
				CachedTokens: resp.Usage.PromptTokensDetails.CachedTokens,
			}
		}
	}
	return out
}

func chatMessageToResponsesOutputs(msg ChatMessage) []ResponsesOutput {
	var outputs []ResponsesOutput
	if strings.TrimSpace(msg.ReasoningContent) != "" {
		outputs = append(outputs, ResponsesOutput{
			Type: "reasoning",
			ID:   generateItemID(),
			Summary: []ResponsesSummary{{
				Type: "summary_text",
				Text: msg.ReasoningContent,
			}},
		})
	}

	contentText, _ := parseChatContent(msg.Content)
	if contentText != "" || len(msg.ToolCalls) == 0 {
		outputs = append(outputs, ResponsesOutput{
			Type: "message",
			ID:   generateItemID(),
			Role: "assistant",
			Content: []ResponsesContentPart{{
				Type: "output_text",
				Text: contentText,
			}},
			Status: "completed",
		})
	}

	for _, toolCall := range msg.ToolCalls {
		callID := strings.TrimSpace(toolCall.ID)
		if callID == "" {
			callID = generateItemID()
		}
		args := strings.TrimSpace(toolCall.Function.Arguments)
		if args == "" {
			args = "{}"
		}
		outputs = append(outputs, ResponsesOutput{
			Type:      "function_call",
			ID:        generateItemID(),
			CallID:    callID,
			Name:      toolCall.Function.Name,
			Arguments: args,
			Status:    "completed",
		})
	}

	return outputs
}

type ChatCompletionsToResponsesState struct {
	ResponseID     string
	Model          string
	SequenceNumber int
	CreatedSent    bool
	CompletedSent  bool

	MessageOutputIndex   int
	MessageItemID        string
	MessageStarted       bool
	MessageContentIndex  int
	MessageTextBuilder   strings.Builder
	ReasoningOutputIndex int
	ReasoningItemID      string
	ReasoningStarted     bool
	ReasoningSummaryIdx  int
	ReasoningTextBuilder strings.Builder
	ToolCalls            map[int]*chatResponsesToolCallState
	InputTokens          int
	OutputTokens         int
	CacheReadTokens      int
}

type chatResponsesToolCallState struct {
	OutputIndex int
	ItemID      string
	CallID      string
	Name        string
	Arguments   strings.Builder
	Added       bool
}

func NewChatCompletionsToResponsesState() *ChatCompletionsToResponsesState {
	return &ChatCompletionsToResponsesState{
		ToolCalls:            map[int]*chatResponsesToolCallState{},
		MessageOutputIndex:   -1,
		ReasoningOutputIndex: -1,
	}
}

func ChatChunkToResponsesEvents(chunk *ChatCompletionsChunk, state *ChatCompletionsToResponsesState) []ResponsesStreamEvent {
	if chunk == nil || state == nil {
		return nil
	}
	if state.ResponseID == "" {
		state.ResponseID = strings.TrimSpace(chunk.ID)
		if state.ResponseID == "" {
			state.ResponseID = generateResponsesID()
		}
	}
	if state.Model == "" {
		state.Model = chunk.Model
	}
	if chunk.Usage != nil {
		state.InputTokens = chunk.Usage.PromptTokens
		state.OutputTokens = chunk.Usage.CompletionTokens
		if chunk.Usage.PromptTokensDetails != nil {
			state.CacheReadTokens = chunk.Usage.PromptTokensDetails.CachedTokens
		}
	}

	var events []ResponsesStreamEvent
	if !state.CreatedSent {
		state.CreatedSent = true
		events = append(events, chatMakeResponsesCreatedEvent(state))
	}

	for _, choice := range chunk.Choices {
		if choice.Delta.ReasoningContent != nil {
			events = append(events, chatHandleReasoningDelta(state, *choice.Delta.ReasoningContent)...)
		}
		if choice.Delta.Content != nil {
			events = append(events, chatHandleTextDelta(state, *choice.Delta.Content)...)
		}
		if len(choice.Delta.ToolCalls) > 0 {
			events = append(events, chatHandleToolCallDelta(state, choice.Delta.ToolCalls)...)
		}
		if choice.FinishReason != nil && !state.CompletedSent {
			events = append(events, chatFinalizeResponsesStream(state, *choice.FinishReason)...)
		}
	}

	return events
}

func FinalizeChatResponsesStream(state *ChatCompletionsToResponsesState) []ResponsesStreamEvent {
	if state == nil || state.CompletedSent {
		return nil
	}
	return chatFinalizeResponsesStream(state, "stop")
}

func chatHandleTextDelta(state *ChatCompletionsToResponsesState, text string) []ResponsesStreamEvent {
	if text == "" {
		return nil
	}
	var events []ResponsesStreamEvent
	if !state.MessageStarted {
		state.MessageStarted = true
		state.MessageOutputIndex = chatNextOutputIndex(state)
		state.MessageItemID = generateItemID()
		events = append(events, chatMakeResponsesEvent(state, "response.output_item.added", &ResponsesStreamEvent{
			OutputIndex: state.MessageOutputIndex,
			Item: &ResponsesOutput{
				Type: "message",
				ID:   state.MessageItemID,
				Role: "assistant",
			},
		}))
	}
	_, _ = state.MessageTextBuilder.WriteString(text)
	events = append(events, chatMakeResponsesEvent(state, "response.output_text.delta", &ResponsesStreamEvent{
		OutputIndex:  state.MessageOutputIndex,
		ContentIndex: state.MessageContentIndex,
		ItemID:       state.MessageItemID,
		Delta:        text,
	}))
	return events
}

func chatHandleReasoningDelta(state *ChatCompletionsToResponsesState, text string) []ResponsesStreamEvent {
	if text == "" {
		return nil
	}
	var events []ResponsesStreamEvent
	if !state.ReasoningStarted {
		state.ReasoningStarted = true
		state.ReasoningOutputIndex = chatNextOutputIndex(state)
		state.ReasoningItemID = generateItemID()
		events = append(events, chatMakeResponsesEvent(state, "response.output_item.added", &ResponsesStreamEvent{
			OutputIndex: state.ReasoningOutputIndex,
			Item: &ResponsesOutput{
				Type: "reasoning",
				ID:   state.ReasoningItemID,
			},
		}))
	}
	_, _ = state.ReasoningTextBuilder.WriteString(text)
	events = append(events, chatMakeResponsesEvent(state, "response.reasoning_summary_text.delta", &ResponsesStreamEvent{
		OutputIndex:  state.ReasoningOutputIndex,
		ItemID:       state.ReasoningItemID,
		SummaryIndex: state.ReasoningSummaryIdx,
		Delta:        text,
	}))
	return events
}

func chatHandleToolCallDelta(state *ChatCompletionsToResponsesState, toolCalls []ChatToolCall) []ResponsesStreamEvent {
	var events []ResponsesStreamEvent
	for idx, toolCall := range toolCalls {
		key := idx
		if toolCall.Index != nil {
			key = *toolCall.Index
		}
		tc, ok := state.ToolCalls[key]
		if !ok {
			callID := strings.TrimSpace(toolCall.ID)
			if callID == "" {
				callID = generateItemID()
			}
			tc = &chatResponsesToolCallState{
				OutputIndex: chatNextOutputIndex(state),
				ItemID:      generateItemID(),
				CallID:      callID,
			}
			state.ToolCalls[key] = tc
		}
		if toolCall.Function.Name != "" {
			tc.Name = toolCall.Function.Name
		}
		if !tc.Added {
			tc.Added = true
			events = append(events, chatMakeResponsesEvent(state, "response.output_item.added", &ResponsesStreamEvent{
				OutputIndex: tc.OutputIndex,
				Item: &ResponsesOutput{
					Type:   "function_call",
					ID:     tc.ItemID,
					CallID: tc.CallID,
					Name:   tc.Name,
				},
			}))
		}
		if toolCall.Function.Arguments != "" {
			_, _ = tc.Arguments.WriteString(toolCall.Function.Arguments)
			events = append(events, chatMakeResponsesEvent(state, "response.function_call_arguments.delta", &ResponsesStreamEvent{
				OutputIndex: tc.OutputIndex,
				ItemID:      tc.ItemID,
				CallID:      tc.CallID,
				Name:        tc.Name,
				Delta:       toolCall.Function.Arguments,
			}))
		}
	}
	return events
}

func chatFinalizeResponsesStream(state *ChatCompletionsToResponsesState, finishReason string) []ResponsesStreamEvent {
	if state.CompletedSent {
		return nil
	}
	var events []ResponsesStreamEvent
	if state.ReasoningStarted {
		events = append(events,
			chatMakeResponsesEvent(state, "response.reasoning_summary_text.done", &ResponsesStreamEvent{
				OutputIndex:  state.ReasoningOutputIndex,
				ItemID:       state.ReasoningItemID,
				SummaryIndex: state.ReasoningSummaryIdx,
				Text:         state.ReasoningTextBuilder.String(),
			}),
			chatMakeResponsesEvent(state, "response.output_item.done", &ResponsesStreamEvent{
				OutputIndex: state.ReasoningOutputIndex,
				Item: &ResponsesOutput{
					Type:   "reasoning",
					ID:     state.ReasoningItemID,
					Status: "completed",
				},
			}),
		)
	}
	if state.MessageStarted {
		events = append(events,
			chatMakeResponsesEvent(state, "response.output_text.done", &ResponsesStreamEvent{
				OutputIndex:  state.MessageOutputIndex,
				ContentIndex: state.MessageContentIndex,
				ItemID:       state.MessageItemID,
				Text:         state.MessageTextBuilder.String(),
			}),
			chatMakeResponsesEvent(state, "response.output_item.done", &ResponsesStreamEvent{
				OutputIndex: state.MessageOutputIndex,
				Item: &ResponsesOutput{
					Type:   "message",
					ID:     state.MessageItemID,
					Role:   "assistant",
					Status: "completed",
				},
			}),
		)
	}
	toolIndices := make([]int, 0, len(state.ToolCalls))
	for idx := range state.ToolCalls {
		toolIndices = append(toolIndices, idx)
	}
	sort.Ints(toolIndices)
	for _, idx := range toolIndices {
		tc := state.ToolCalls[idx]
		events = append(events,
			chatMakeResponsesEvent(state, "response.function_call_arguments.done", &ResponsesStreamEvent{
				OutputIndex: tc.OutputIndex,
				ItemID:      tc.ItemID,
				CallID:      tc.CallID,
				Name:        tc.Name,
				Arguments:   tc.Arguments.String(),
			}),
			chatMakeResponsesEvent(state, "response.output_item.done", &ResponsesStreamEvent{
				OutputIndex: tc.OutputIndex,
				Item: &ResponsesOutput{
					Type:   "function_call",
					ID:     tc.ItemID,
					CallID: tc.CallID,
					Name:   tc.Name,
					Status: "completed",
				},
			}),
		)
	}

	status := "completed"
	var incomplete *ResponsesIncompleteDetails
	if finishReason == "length" {
		status = "incomplete"
		incomplete = &ResponsesIncompleteDetails{Reason: "max_output_tokens"}
	}
	state.CompletedSent = true
	events = append(events, chatMakeResponsesCompletedEvent(state, status, incomplete))
	return events
}

func chatNextOutputIndex(state *ChatCompletionsToResponsesState) int {
	maxIdx := -1
	if state.MessageOutputIndex > maxIdx {
		maxIdx = state.MessageOutputIndex
	}
	if state.ReasoningOutputIndex > maxIdx {
		maxIdx = state.ReasoningOutputIndex
	}
	for _, tc := range state.ToolCalls {
		if tc.OutputIndex > maxIdx {
			maxIdx = tc.OutputIndex
		}
	}
	return maxIdx + 1
}

func chatMakeResponsesCreatedEvent(state *ChatCompletionsToResponsesState) ResponsesStreamEvent {
	return chatMakeResponsesEvent(state, "response.created", &ResponsesStreamEvent{
		Response: &ResponsesResponse{
			ID:     state.ResponseID,
			Object: "response",
			Model:  state.Model,
			Status: "in_progress",
			Output: []ResponsesOutput{},
		},
	})
}

func chatMakeResponsesCompletedEvent(
	state *ChatCompletionsToResponsesState,
	status string,
	incomplete *ResponsesIncompleteDetails,
) ResponsesStreamEvent {
	usage := &ResponsesUsage{
		InputTokens:  state.InputTokens,
		OutputTokens: state.OutputTokens,
		TotalTokens:  state.InputTokens + state.OutputTokens,
	}
	if state.CacheReadTokens > 0 {
		usage.InputTokensDetails = &ResponsesInputTokensDetails{CachedTokens: state.CacheReadTokens}
	}
	return chatMakeResponsesEvent(state, "response.completed", &ResponsesStreamEvent{
		Response: &ResponsesResponse{
			ID:                state.ResponseID,
			Object:            "response",
			Model:             state.Model,
			Status:            status,
			Output:            []ResponsesOutput{},
			Usage:             usage,
			IncompleteDetails: incomplete,
		},
	})
}

func chatMakeResponsesEvent(state *ChatCompletionsToResponsesState, eventType string, template *ResponsesStreamEvent) ResponsesStreamEvent {
	evt := *template
	evt.Type = eventType
	evt.SequenceNumber = state.SequenceNumber
	state.SequenceNumber++
	return evt
}
