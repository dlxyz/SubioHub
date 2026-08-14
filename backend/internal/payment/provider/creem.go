package provider

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/dlxyz/SubioHub/internal/payment"
)

// Creem constants.
const (
	creemProdBase        = "https://api.creem.io/v1"
	creemTestBase        = "https://test-api.creem.io/v1"
	creemHTTPTimeout     = 15 * time.Second
	maxCreemResponseSize = 1 << 20 // 1MB
	creemEventCompleted  = "checkout.completed"
	creemStatusCompleted = "completed"
	creemStatusPaid      = "paid"
)

// Creem implements payment.Provider for Creem fixed-denomination balance recharges.
// Creem uses a product-based model (MoR): each recharge amount maps to a Creem product.
type Creem struct {
	instanceID string
	config     map[string]string
	httpClient *http.Client
	baseURL    string
	// products maps a normalized amount key (e.g. "10", "10.5") to a Creem product ID.
	products map[string]string
}

// NewCreem creates a new Creem provider instance.
// config keys: apiKey, webhookSecret, productAmounts ("amount=product_id" comma/newline separated),
// optional: successUrl, testMode.
func NewCreem(instanceID string, config map[string]string) (*Creem, error) {
	if config["apiKey"] == "" {
		return nil, fmt.Errorf("creem config missing required key: apiKey")
	}
	if config["webhookSecret"] == "" {
		return nil, fmt.Errorf("creem config missing required key: webhookSecret")
	}
	products, err := parseCreemProductAmounts(config["productAmounts"])
	if err != nil {
		return nil, err
	}
	if len(products) == 0 {
		return nil, fmt.Errorf("creem config missing required key: productAmounts")
	}

	baseURL := creemProdBase
	if isCreemTestMode(config) {
		baseURL = creemTestBase
	}

	return &Creem{
		instanceID: instanceID,
		config:     config,
		httpClient: &http.Client{Timeout: creemHTTPTimeout},
		baseURL:    baseURL,
		products:   products,
	}, nil
}

func (c *Creem) Name() string        { return "Creem" }
func (c *Creem) ProviderKey() string { return payment.TypeCreem }
func (c *Creem) SupportedTypes() []payment.PaymentType {
	return []payment.PaymentType{payment.TypeCreem}
}

// CreatePayment creates a Creem checkout session for the fixed-denomination product
// mapped from the order amount. Returns the checkout URL as the payment URL.
func (c *Creem) CreatePayment(ctx context.Context, req payment.CreatePaymentRequest) (*payment.CreatePaymentResponse, error) {
	productID, ok := c.products[normalizeCreemAmount(req.Amount)]
	if !ok {
		return nil, fmt.Errorf("creem: no product configured for amount %s", req.Amount)
	}

	payload := map[string]any{
		"product_id": productID,
		"request_id": req.OrderID,
		"metadata":   map[string]string{"order_id": req.OrderID},
	}
	if successURL := c.resolveSuccessURL(req); successURL != "" {
		payload["success_url"] = successURL
	}

	var resp struct {
		ID          string `json:"id"`
		CheckoutURL string `json:"checkout_url"`
	}
	if err := c.doJSON(ctx, http.MethodPost, c.baseURL+"/checkouts", payload, &resp); err != nil {
		return nil, fmt.Errorf("creem create checkout: %w", err)
	}

	return &payment.CreatePaymentResponse{
		TradeNo: resp.ID,
		PayURL:  resp.CheckoutURL,
	}, nil
}

// QueryOrder retrieves a checkout by its Creem checkout ID.
func (c *Creem) QueryOrder(ctx context.Context, tradeNo string) (*payment.QueryOrderResponse, error) {
	var resp struct {
		ID     string `json:"id"`
		Status string `json:"status"`
		Order  struct {
			Amount int64 `json:"amount"`
		} `json:"order"`
	}
	if err := c.doJSON(ctx, http.MethodGet, c.baseURL+"/checkouts/"+tradeNo, nil, &resp); err != nil {
		return nil, fmt.Errorf("creem query order: %w", err)
	}

	status := payment.ProviderStatusPending
	if resp.Status == creemStatusCompleted || resp.Status == creemStatusPaid {
		status = payment.ProviderStatusPaid
	}

	return &payment.QueryOrderResponse{
		TradeNo: resp.ID,
		Status:  status,
		Amount:  float64(resp.Order.Amount) / 100,
	}, nil
}

// VerifyNotification verifies the Creem webhook signature and parses checkout.completed.
func (c *Creem) VerifyNotification(_ context.Context, rawBody string, headers map[string]string) (*payment.PaymentNotification, error) {
	webhookSecret := c.config["webhookSecret"]
	signature := headers["creem-signature"]
	if signature == "" {
		return nil, fmt.Errorf("creem notification missing creem-signature header")
	}

	mac := hmac.New(sha256.New, []byte(webhookSecret))
	_, _ = mac.Write([]byte(rawBody))
	expected := hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(signature)) {
		return nil, fmt.Errorf("creem notification signature mismatch")
	}

	var event struct {
		EventType string `json:"eventType"`
		Object    struct {
			ID        string `json:"id"`
			RequestID string `json:"request_id"`
			Status    string `json:"status"`
			Order     struct {
				Amount   int64  `json:"amount"`
				Currency string `json:"currency"`
			} `json:"order"`
			Metadata map[string]string `json:"metadata"`
		} `json:"object"`
	}
	if err := json.Unmarshal([]byte(rawBody), &event); err != nil {
		return nil, fmt.Errorf("creem parse notification: %w", err)
	}

	if event.EventType != creemEventCompleted {
		return nil, nil
	}

	orderID := event.Object.Metadata["order_id"]
	if orderID == "" {
		orderID = event.Object.RequestID
	}

	status := payment.ProviderStatusFailed
	if event.Object.Status == creemStatusCompleted {
		status = payment.ProviderStatusSuccess
	}

	return &payment.PaymentNotification{
		TradeNo: event.Object.ID,
		OrderID: orderID,
		Amount:  float64(event.Object.Order.Amount) / 100,
		Status:  status,
		RawData: rawBody,
	}, nil
}

// Refund is not supported via the Creem API; refunds are processed from the dashboard.
func (c *Creem) Refund(_ context.Context, _ payment.RefundRequest) (*payment.RefundResponse, error) {
	return nil, fmt.Errorf("creem does not support API refunds; process refunds from the Creem dashboard")
}

func (c *Creem) resolveSuccessURL(req payment.CreatePaymentRequest) string {
	if req.ReturnURL != "" {
		return req.ReturnURL
	}
	return c.config["successUrl"]
}

// doJSON performs a JSON request against the Creem API and decodes the response.
func (c *Creem) doJSON(ctx context.Context, method, url string, payload any, out any) error {
	var body io.Reader
	if payload != nil {
		data, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		body = bytes.NewReader(data)
	}

	req, err := http.NewRequestWithContext(ctx, method, url, body)
	if err != nil {
		return err
	}
	req.Header.Set("x-api-key", c.config["apiKey"])
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()

	data, err := io.ReadAll(io.LimitReader(resp.Body, maxCreemResponseSize))
	if err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("creem api status %d: %s", resp.StatusCode, strings.TrimSpace(string(data)))
	}
	if out == nil || len(data) == 0 {
		return nil
	}
	return json.Unmarshal(data, out)
}

// isCreemTestMode detects test mode via explicit config flag or the API key prefix.
func isCreemTestMode(config map[string]string) bool {
	if v := config["testMode"]; v == "true" || v == "1" {
		return true
	}
	return strings.HasPrefix(config["apiKey"], "creem_test_")
}

// parseCreemProductAmounts parses "amount=product_id" entries separated by commas or newlines.
func parseCreemProductAmounts(raw string) (map[string]string, error) {
	products := make(map[string]string)
	for _, entry := range strings.FieldsFunc(raw, func(r rune) bool {
		return r == ',' || r == '\n'
	}) {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		parts := strings.SplitN(entry, "=", 2)
		if len(parts) != 2 {
			return nil, fmt.Errorf("creem productAmounts invalid entry %q (expected amount=product_id)", entry)
		}
		amount := strings.TrimSpace(parts[0])
		productID := strings.TrimSpace(parts[1])
		if amount == "" || productID == "" {
			return nil, fmt.Errorf("creem productAmounts invalid entry %q (expected amount=product_id)", entry)
		}
		products[normalizeCreemAmount(amount)] = productID
	}
	return products, nil
}

// normalizeCreemAmount canonicalizes an amount string so "10", "10.0", "10.00" all match.
func normalizeCreemAmount(s string) string {
	s = strings.TrimSpace(s)
	if strings.Contains(s, ".") {
		s = strings.TrimRight(s, "0")
		s = strings.TrimRight(s, ".")
	}
	return s
}

// Ensure interface compliance.
var _ payment.Provider = (*Creem)(nil)
