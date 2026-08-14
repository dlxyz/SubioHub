package provider

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/md5"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/dlxyz/SubioHub/internal/payment"
)

// Tegro constants.
const (
	tegroBaseURL         = "https://tegro.money/api"
	tegroCreateOrderPath = "/createOrder/"
	tegroHTTPTimeout     = 15 * time.Second
	maxTegroResponseSize = 1 << 20 // 1MB
	tegroDefaultCurrency = "USD"
	tegroResultSuccess   = "success"
)

// Tegro implements payment.Provider for the Tegro.money aggregation platform.
// Tegro is a Russian payment aggregator that charges in RUB/USD/EUR. Overseas
// collections are consolidated to USD, so this provider charges the configured
// currency (default USD) using the `rate` config value (1 USD = X currency units)
// and converts the reported payment amount back to USD during webhook verification.
type Tegro struct {
	instanceID string
	config     map[string]string
	httpClient *http.Client

	shopID        string
	secretKey     string
	currency      string
	rate          float64
	paymentSystem int64
}

// NewTegro creates a new Tegro provider instance.
// config keys: shopId, secretKey, paymentSystem; optional: currency (default USD), rate (1 USD = X currency, default 1).
func NewTegro(instanceID string, config map[string]string) (*Tegro, error) {
	shopID := config["shopId"]
	if shopID == "" {
		return nil, fmt.Errorf("tegro config missing required key: shopId")
	}
	secretKey := config["secretKey"]
	if secretKey == "" {
		return nil, fmt.Errorf("tegro config missing required key: secretKey")
	}
	paymentSystem, err := strconv.ParseInt(strings.TrimSpace(config["paymentSystem"]), 10, 64)
	if err != nil || paymentSystem <= 0 {
		return nil, fmt.Errorf("tegro config invalid paymentSystem %q", config["paymentSystem"])
	}
	currency := strings.ToUpper(strings.TrimSpace(config["currency"]))
	if currency == "" {
		currency = tegroDefaultCurrency
	}
	rate := 1.0
	if v := strings.TrimSpace(config["rate"]); v != "" {
		rate, err = strconv.ParseFloat(v, 64)
		if err != nil || rate <= 0 {
			return nil, fmt.Errorf("tegro config invalid rate %q (expected 1 USD = X %s)", config["rate"], currency)
		}
	}

	return &Tegro{
		instanceID:    instanceID,
		config:        config,
		httpClient:    &http.Client{Timeout: tegroHTTPTimeout},
		shopID:        shopID,
		secretKey:     secretKey,
		currency:      currency,
		rate:          rate,
		paymentSystem: paymentSystem,
	}, nil
}

func (t *Tegro) Name() string        { return "Tegro.money" }
func (t *Tegro) ProviderKey() string { return payment.TypeTegro }
func (t *Tegro) SupportedTypes() []payment.PaymentType {
	return []payment.PaymentType{payment.TypeTegro}
}

// CreatePayment creates a Tegro order and returns its hosted payment URL.
func (t *Tegro) CreatePayment(ctx context.Context, req payment.CreatePaymentRequest) (*payment.CreatePaymentResponse, error) {
	amountUSD, err := strconv.ParseFloat(req.Amount, 64)
	if err != nil {
		return nil, fmt.Errorf("tegro parse amount: %w", err)
	}
	amount := roundTegroAmount(amountUSD * t.rate)
	if amount <= 0 {
		return nil, fmt.Errorf("tegro invalid converted amount for %s", req.Amount)
	}

	payload := map[string]any{
		"shop_id":        t.shopID,
		"nonce":          time.Now().UnixNano(),
		"currency":       t.currency,
		"amount":         amount,
		"order_id":       req.OrderID,
		"payment_system": t.paymentSystem,
		"receipt": map[string]any{
			"items": []map[string]any{
				{"name": req.Subject, "count": 1, "price": amount},
			},
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("tegro marshal request: %w", err)
	}
	sign := tegroHMAC(body, t.secretKey)

	var resp struct {
		Type string `json:"type"`
		Desc string `json:"desc"`
		Data struct {
			ID  int64  `json:"id"`
			URL string `json:"url"`
		} `json:"data"`
	}
	if err := t.doJSON(ctx, http.MethodPost, tegroBaseURL+tegroCreateOrderPath, body, sign, &resp); err != nil {
		return nil, fmt.Errorf("tegro create order: %w", err)
	}
	if resp.Type != tegroResultSuccess {
		return nil, fmt.Errorf("tegro create order failed: %s", resp.Desc)
	}

	return &payment.CreatePaymentResponse{
		TradeNo: strconv.FormatInt(resp.Data.ID, 10),
		PayURL:  resp.Data.URL,
	}, nil
}

// QueryOrder is not exposed by the Tegro API; status is delivered via webhook.
func (t *Tegro) QueryOrder(_ context.Context, _ string) (*payment.QueryOrderResponse, error) {
	return nil, fmt.Errorf("tegro does not support order query; rely on webhook notifications")
}

// VerifyNotification verifies the Tegro payment notification signature and parses it.
func (t *Tegro) VerifyNotification(_ context.Context, rawBody string, _ map[string]string) (*payment.PaymentNotification, error) {
	values, err := url.ParseQuery(rawBody)
	if err != nil {
		return nil, fmt.Errorf("tegro parse notify: %w", err)
	}
	params := make(map[string]string, len(values))
	for k := range values {
		params[k] = values.Get(k)
	}
	sign := params["sign"]
	if sign == "" {
		return nil, fmt.Errorf("tegro notify missing sign")
	}
	if !tegroVerifySign(params, t.secretKey, sign) {
		return nil, fmt.Errorf("tegro notify signature mismatch")
	}

	amount := 0.0
	if v := params["amount"]; v != "" {
		amount, _ = strconv.ParseFloat(v, 64)
	}

	// Tegro reports the amount in the payment currency; convert back to USD so it
	// matches the order's PayAmount for the fulfillment amount check.
	usd := 0.0
	if amount > 0 {
		usd = roundTegroAmount(amount / t.rate)
	}

	return &payment.PaymentNotification{
		TradeNo: "",
		OrderID: params["order_id"],
		Amount:  usd,
		Status:  payment.ProviderStatusSuccess,
		RawData: rawBody,
	}, nil
}

// Refund is not supported via the Tegro API; refunds are processed from the dashboard.
func (t *Tegro) Refund(_ context.Context, _ payment.RefundRequest) (*payment.RefundResponse, error) {
	return nil, fmt.Errorf("tegro does not support API refunds; process refunds from the Tegro dashboard")
}

func (t *Tegro) doJSON(ctx context.Context, method, endpoint string, body []byte, sign string, out any) error {
	req, err := http.NewRequestWithContext(ctx, method, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+sign)
	req.Header.Set("Content-Type", "application/json")

	resp, err := t.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()

	data, err := io.ReadAll(io.LimitReader(resp.Body, maxTegroResponseSize))
	if err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("tegro api status %d: %s", resp.StatusCode, strings.TrimSpace(string(data)))
	}
	if out == nil || len(data) == 0 {
		return nil
	}
	return json.Unmarshal(data, out)
}

// tegroHMAC signs a raw request body with HMAC-SHA256 and returns the hex digest.
func tegroHMAC(body []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

// tegroVerifySign checks the MD5 signature used by Tegro payment notifications.
// Signing: sort keys (excluding "sign"), http_build_query, append secret, md5.
func tegroVerifySign(params map[string]string, secret, sign string) bool {
	return hmac.Equal([]byte(tegroSign(params, secret)), []byte(sign))
}

func tegroSign(params map[string]string, secret string) string {
	keys := make([]string, 0, len(params))
	for k := range params {
		if k == "sign" {
			continue
		}
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var buf strings.Builder
	for i, k := range keys {
		if i > 0 {
			_ = buf.WriteByte('&')
		}
		_, _ = buf.WriteString(k)
		_ = buf.WriteByte('=')
		_, _ = buf.WriteString(url.QueryEscape(params[k]))
	}
	_, _ = buf.WriteString(secret)

	hash := md5.Sum([]byte(buf.String()))
	return hex.EncodeToString(hash[:])
}

func roundTegroAmount(v float64) float64 {
	return math.Round(v*100) / 100
}

// Ensure interface compliance.
var _ payment.Provider = (*Tegro)(nil)
