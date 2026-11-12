package provider

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/dlxyz/SubioHub/internal/payment"
)

// Waffo Pancake constants.
const (
	waffoBaseURL         = "https://api.waffo.ai"
	waffoCheckoutPath    = "/v1/actions/checkout/create-session"
	waffoHTTPTimeout     = 20 * time.Second
	maxWaffoResponseSize = 1 << 20 // 1MB

	waffoDefaultCurrency    = "USD"
	waffoDefaultTaxCategory = "saas"
	waffoEventOrderComplete = "order.completed"

	waffoSignatureHeader        = "x-waffo-signature"
	waffoWebhookPastTolerance   = 45 * time.Minute
	waffoWebhookFutureTolerance = time.Minute
)

// waffoZeroDecimalCurrencies lists currencies whose amount must not contain decimals.
var waffoZeroDecimalCurrencies = map[string]bool{
	"IDR": true, "JPY": true, "KRW": true, "VND": true,
}

// Waffo implements payment.Provider for Waffo Pancake (Merchant of Record).
//
// Pancake uses a hosted checkout: merchants create a checkout session with the
// API key (RSA private key) and redirect the buyer to the returned checkoutUrl.
// Payment results arrive via an RSA-SHA256 signed webhook (`order.completed`).
type Waffo struct {
	instanceID string
	httpClient *http.Client
	baseURL    string

	merchantID       string
	privateKey       *rsa.PrivateKey
	webhookPublicKey *rsa.PublicKey
	productID        string
	currency         string
	rate             float64
	taxCategory      string
	taxIncluded      bool
	successURL       string
	language         string
	expiresInSeconds int
}

// NewWaffo creates a new Waffo Pancake provider instance.
// config keys: merchantId, privateKey, webhookPublicKey, productId;
// optional: currency (default USD), rate (1 USD = X currency, default 1),
// taxCategory (default saas), taxIncluded (default true), successUrl/returnUrl,
// language, expiresInSeconds.
func NewWaffo(instanceID string, config map[string]string) (*Waffo, error) {
	merchantID := strings.TrimSpace(config["merchantId"])
	if merchantID == "" {
		return nil, fmt.Errorf("waffo config missing required key: merchantId")
	}
	productID := strings.TrimSpace(config["productId"])
	if productID == "" {
		return nil, fmt.Errorf("waffo config missing required key: productId")
	}
	privateKey, err := parseWaffoPrivateKey(config["privateKey"])
	if err != nil {
		return nil, fmt.Errorf("waffo invalid privateKey: %w", err)
	}
	webhookPublicKey, err := parseWaffoPublicKey(config["webhookPublicKey"])
	if err != nil {
		return nil, fmt.Errorf("waffo invalid webhookPublicKey: %w", err)
	}

	currency := strings.ToUpper(strings.TrimSpace(config["currency"]))
	if currency == "" {
		currency = waffoDefaultCurrency
	}
	rate := 1.0
	if v := strings.TrimSpace(config["rate"]); v != "" {
		rate, err = strconv.ParseFloat(v, 64)
		if err != nil || rate <= 0 {
			return nil, fmt.Errorf("waffo config invalid rate %q (expected 1 USD = X %s)", config["rate"], currency)
		}
	}
	taxCategory := strings.TrimSpace(config["taxCategory"])
	if taxCategory == "" {
		taxCategory = waffoDefaultTaxCategory
	}
	taxIncluded := true
	if v := strings.TrimSpace(config["taxIncluded"]); v != "" {
		parsed, parseErr := strconv.ParseBool(v)
		if parseErr != nil {
			return nil, fmt.Errorf("waffo config invalid taxIncluded %q", config["taxIncluded"])
		}
		taxIncluded = parsed
	}
	expiresInSeconds := 0
	if v := strings.TrimSpace(config["expiresInSeconds"]); v != "" {
		expiresInSeconds, err = strconv.Atoi(v)
		if err != nil || expiresInSeconds <= 0 {
			return nil, fmt.Errorf("waffo config invalid expiresInSeconds %q", config["expiresInSeconds"])
		}
	}

	return &Waffo{
		instanceID:       instanceID,
		httpClient:       &http.Client{Timeout: waffoHTTPTimeout},
		baseURL:          waffoBaseURL,
		merchantID:       merchantID,
		privateKey:       privateKey,
		webhookPublicKey: webhookPublicKey,
		productID:        productID,
		currency:         currency,
		rate:             rate,
		taxCategory:      taxCategory,
		taxIncluded:      taxIncluded,
		successURL:       waffoFirstNonEmpty(config["successUrl"], config["returnUrl"]),
		language:         strings.TrimSpace(config["language"]),
		expiresInSeconds: expiresInSeconds,
	}, nil
}

func (w *Waffo) Name() string        { return "Waffo" }
func (w *Waffo) ProviderKey() string { return payment.TypeWaffo }
func (w *Waffo) SupportedTypes() []payment.PaymentType {
	return []payment.PaymentType{payment.TypeWaffo}
}

// CreatePayment creates a Pancake checkout session and returns its hosted checkout URL.
func (w *Waffo) CreatePayment(ctx context.Context, req payment.CreatePaymentRequest) (*payment.CreatePaymentResponse, error) {
	amountUSD, err := strconv.ParseFloat(strings.TrimSpace(req.Amount), 64)
	if err != nil {
		return nil, fmt.Errorf("waffo parse amount: %w", err)
	}
	amount := waffoRoundAmount(amountUSD * w.rate)
	if amount <= 0 {
		return nil, fmt.Errorf("waffo invalid converted amount for %s", req.Amount)
	}

	metadata := map[string]string{"order_id": req.OrderID}
	if req.UserID != "" {
		metadata["user_id"] = req.UserID
	}
	successURL := waffoFirstNonEmpty(req.ReturnURL, w.successURL)
	if successURL != "" && !strings.HasPrefix(successURL, "https://") {
		return nil, fmt.Errorf("waffo successUrl must be an absolute https URL")
	}
	payload := waffoCheckoutRequest{
		ProductID: w.productID,
		Currency:  w.currency,
		PriceSnapshot: &waffoPriceSnapshot{
			Amount:      waffoFormatAmount(amount, w.currency),
			TaxIncluded: w.taxIncluded,
			TaxCategory: w.taxCategory,
		},
		BuyerEmail:              req.UserEmail,
		SuccessURL:              successURL,
		ExpiresInSeconds:        w.expiresInSeconds,
		Metadata:                metadata,
		OrderMerchantExternalID: req.OrderID,
		Language:                w.language,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("waffo marshal request: %w", err)
	}
	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	signature, err := waffoSignRequest(http.MethodPost, waffoCheckoutPath, timestamp, body, w.privateKey)
	if err != nil {
		return nil, fmt.Errorf("waffo sign request: %w", err)
	}

	var resp waffoCheckoutResponse
	if err := w.doJSON(ctx, waffoCheckoutPath, body, timestamp, signature, &resp); err != nil {
		return nil, fmt.Errorf("waffo create checkout: %w", err)
	}
	if resp.Data.CheckoutURL == "" {
		return nil, fmt.Errorf("waffo create checkout returned no checkoutUrl")
	}

	return &payment.CreatePaymentResponse{
		TradeNo: resp.Data.SessionID,
		PayURL:  resp.Data.CheckoutURL,
	}, nil
}

// QueryOrder is not exposed by the Pancake REST API; payment results are delivered
// through webhooks. Returning an error makes the caller fall back to webhook state.
func (w *Waffo) QueryOrder(_ context.Context, _ string) (*payment.QueryOrderResponse, error) {
	return nil, fmt.Errorf("waffo pancake does not expose order inquiry; rely on webhook notifications")
}

// VerifyNotification verifies the Pancake webhook signature and parses order.completed.
func (w *Waffo) VerifyNotification(_ context.Context, rawBody string, headers map[string]string) (*payment.PaymentNotification, error) {
	header := strings.TrimSpace(headers[waffoSignatureHeader])
	if header == "" {
		return nil, fmt.Errorf("waffo webhook missing X-Waffo-Signature header")
	}
	timestamp, signature, err := waffoParseSignatureHeader(header)
	if err != nil {
		return nil, err
	}
	if err := waffoValidateTimestamp(timestamp, time.Now()); err != nil {
		return nil, err
	}
	if !waffoVerifyWebhook(rawBody, timestamp, signature, w.webhookPublicKey) {
		return nil, fmt.Errorf("waffo webhook signature mismatch")
	}

	var event waffoWebhookEvent
	if err := json.Unmarshal([]byte(rawBody), &event); err != nil {
		return nil, fmt.Errorf("waffo parse webhook: %w", err)
	}
	if event.EventType != waffoEventOrderComplete {
		return nil, nil
	}

	orderID := event.Data.OrderMerchantExternalID
	if orderID == "" {
		orderID = event.Data.OrderMetadata["order_id"]
	}
	if orderID == "" {
		return nil, fmt.Errorf("waffo webhook missing orderMerchantExternalId")
	}
	status := payment.ProviderStatusFailed
	if event.Data.PaymentStatus == "succeeded" || event.Data.OrderStatus == "completed" {
		status = payment.ProviderStatusSuccess
	}

	return &payment.PaymentNotification{
		TradeNo: event.Data.PaymentID,
		OrderID: orderID,
		Amount:  w.toUSD(event.Data.ChargedAmount, event.Data.Amount, event.Data.ListPrice.Total),
		Status:  status,
		RawData: rawBody,
	}, nil
}

// Refund is not exposed by the Pancake REST API; refunds are processed from the dashboard.
func (w *Waffo) Refund(_ context.Context, _ payment.RefundRequest) (*payment.RefundResponse, error) {
	return nil, fmt.Errorf("waffo pancake does not support API refunds; process refunds from the dashboard")
}

// doJSON sends a signed Pancake request and decodes the JSON response.
func (w *Waffo) doJSON(ctx context.Context, path string, body []byte, timestamp, signature string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, w.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Merchant-Id", w.merchantID)
	req.Header.Set("X-Timestamp", timestamp)
	req.Header.Set("X-Signature", signature)

	resp, err := w.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()

	data, err := io.ReadAll(io.LimitReader(resp.Body, maxWaffoResponseSize))
	if err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("waffo api status %d: %s", resp.StatusCode, strings.TrimSpace(string(data)))
	}
	if out == nil || len(data) == 0 {
		return nil
	}
	return json.Unmarshal(data, out)
}

// toUSD converts an amount reported in the configured currency back to USD.
func (w *Waffo) toUSD(amounts ...string) float64 {
	for _, raw := range amounts {
		v := strings.TrimSpace(raw)
		if v == "" {
			continue
		}
		if parsed, err := strconv.ParseFloat(v, 64); err == nil && parsed > 0 {
			if w.rate <= 0 {
				return parsed
			}
			return waffoRoundAmount(parsed / w.rate)
		}
	}
	return 0
}

// --- Request / response types ---

type waffoCheckoutRequest struct {
	ProductID               string              `json:"productId"`
	Currency                string              `json:"currency"`
	PriceSnapshot           *waffoPriceSnapshot `json:"priceSnapshot,omitempty"`
	BuyerEmail              string              `json:"buyerEmail,omitempty"`
	SuccessURL              string              `json:"successUrl,omitempty"`
	ExpiresInSeconds        int                 `json:"expiresInSeconds,omitempty"`
	Metadata                map[string]string   `json:"metadata,omitempty"`
	OrderMerchantExternalID string              `json:"orderMerchantExternalId,omitempty"`
	Language                string              `json:"language,omitempty"`
}

type waffoPriceSnapshot struct {
	Amount      string `json:"amount"`
	TaxIncluded bool   `json:"taxIncluded"`
	TaxCategory string `json:"taxCategory"`
}

type waffoCheckoutResponse struct {
	Data struct {
		SessionID   string `json:"sessionId"`
		CheckoutURL string `json:"checkoutUrl"`
		ExpiresAt   string `json:"expiresAt"`
	} `json:"data"`
}

type waffoWebhookEvent struct {
	ID        string           `json:"id"`
	EventType string           `json:"eventType"`
	EventID   string           `json:"eventId"`
	Mode      string           `json:"mode"`
	Data      waffoWebhookData `json:"data"`
}

type waffoWebhookData struct {
	OrderID                 string            `json:"orderId"`
	OrderStatus             string            `json:"orderStatus"`
	BuyerEmail              string            `json:"buyerEmail"`
	Currency                string            `json:"currency"`
	ChargedAmount           string            `json:"chargedAmount"`
	Amount                  string            `json:"amount"`
	ListPrice               waffoListPrice    `json:"listPrice"`
	OrderMetadata           map[string]string `json:"orderMetadata"`
	OrderMerchantExternalID string            `json:"orderMerchantExternalId"`
	PaymentID               string            `json:"paymentId"`
	PaymentStatus           string            `json:"paymentStatus"`
}

type waffoListPrice struct {
	Total string `json:"total"`
}

// --- Helpers ---

// waffoSignRequest builds the Pancake canonical string and signs it with RSA-SHA256.
// canonical = METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + base64(sha256(body))
func waffoSignRequest(method, path, timestamp string, body []byte, key *rsa.PrivateKey) (string, error) {
	sum := sha256.Sum256(body)
	canonical := method + "\n" + path + "\n" + timestamp + "\n" + base64.StdEncoding.EncodeToString(sum[:])
	return waffoSign(canonical, key)
}

func waffoParseSignatureHeader(header string) (string, string, error) {
	var timestamp, signature string
	for _, part := range strings.Split(header, ",") {
		part = strings.TrimSpace(part)
		switch {
		case strings.HasPrefix(part, "t="):
			timestamp = strings.TrimSpace(strings.TrimPrefix(part, "t="))
		case strings.HasPrefix(part, "v1="):
			signature = strings.TrimSpace(strings.TrimPrefix(part, "v1="))
		}
	}
	if timestamp == "" || signature == "" {
		return "", "", fmt.Errorf("waffo webhook signature header is malformed")
	}
	return timestamp, signature, nil
}

func waffoValidateTimestamp(raw string, now time.Time) error {
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return fmt.Errorf("waffo webhook timestamp is invalid")
	}
	var ts time.Time
	if value > 1_000_000_000_000 {
		ts = time.UnixMilli(value)
	} else {
		ts = time.Unix(value, 0)
	}
	if now.Sub(ts) > waffoWebhookPastTolerance {
		return fmt.Errorf("waffo webhook timestamp is too old")
	}
	if ts.Sub(now) > waffoWebhookFutureTolerance {
		return fmt.Errorf("waffo webhook timestamp is in the future")
	}
	return nil
}

func waffoVerifyWebhook(body, timestamp, signature string, key *rsa.PublicKey) bool {
	inputs := []string{timestamp + "." + body, body}
	for _, candidate := range waffoSignatureCandidates(signature) {
		for _, input := range inputs {
			if waffoVerify(input, candidate, key) {
				return true
			}
		}
	}
	return false
}

func waffoSignatureCandidates(signature string) [][]byte {
	raw := strings.TrimSpace(signature)
	encodings := []*base64.Encoding{
		base64.StdEncoding,
		base64.RawStdEncoding,
		base64.URLEncoding,
		base64.RawURLEncoding,
	}
	candidates := make([][]byte, 0, len(encodings)+1)
	for _, encoding := range encodings {
		if decoded, err := encoding.DecodeString(raw); err == nil && len(decoded) > 0 {
			candidates = append(candidates, decoded)
		}
	}
	if decoded, err := hex.DecodeString(raw); err == nil && len(decoded) > 0 {
		candidates = append(candidates, decoded)
	}
	return candidates
}

func waffoSign(body string, key *rsa.PrivateKey) (string, error) {
	if key == nil {
		return "", fmt.Errorf("private key is nil")
	}
	hashed := sha256.Sum256([]byte(body))
	signature, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, hashed[:])
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(signature), nil
}

func waffoVerify(body string, signature []byte, key *rsa.PublicKey) bool {
	if key == nil || len(signature) == 0 {
		return false
	}
	hashed := sha256.Sum256([]byte(body))
	return rsa.VerifyPKCS1v15(key, crypto.SHA256, hashed[:], signature) == nil
}

func waffoRoundAmount(v float64) float64 {
	return math.Round(v*100) / 100
}

func waffoFormatAmount(amount float64, currency string) string {
	if waffoZeroDecimalCurrencies[strings.ToUpper(currency)] {
		return strconv.FormatFloat(math.Round(amount), 'f', 0, 64)
	}
	return strconv.FormatFloat(waffoRoundAmount(amount), 'f', 2, 64)
}

func waffoFirstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

// decodeWaffoKey accepts PEM (with optional literal \n) or raw Base64 DER.
func decodeWaffoKey(raw string) ([]byte, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, fmt.Errorf("key is empty")
	}
	raw = strings.ReplaceAll(raw, `\n`, "\n")
	if strings.Contains(raw, "-----BEGIN") {
		block, _ := pem.Decode([]byte(raw))
		if block == nil {
			return nil, fmt.Errorf("invalid PEM block")
		}
		return block.Bytes, nil
	}
	compact := strings.Join(strings.Fields(raw), "")
	return base64.StdEncoding.DecodeString(compact)
}

func parseWaffoPrivateKey(raw string) (*rsa.PrivateKey, error) {
	der, err := decodeWaffoKey(raw)
	if err != nil {
		return nil, fmt.Errorf("decode key: %w", err)
	}
	if parsed, err := x509.ParsePKCS8PrivateKey(der); err == nil {
		rsaKey, ok := parsed.(*rsa.PrivateKey)
		if !ok {
			return nil, fmt.Errorf("key is not an RSA private key")
		}
		return rsaKey, nil
	}
	if rsaKey, err := x509.ParsePKCS1PrivateKey(der); err == nil {
		return rsaKey, nil
	}
	return nil, fmt.Errorf("unsupported private key format (expect PKCS#8 / PKCS#1)")
}

func parseWaffoPublicKey(raw string) (*rsa.PublicKey, error) {
	der, err := decodeWaffoKey(raw)
	if err != nil {
		return nil, fmt.Errorf("decode key: %w", err)
	}
	if parsed, err := x509.ParsePKIXPublicKey(der); err == nil {
		rsaKey, ok := parsed.(*rsa.PublicKey)
		if !ok {
			return nil, fmt.Errorf("key is not an RSA public key")
		}
		return rsaKey, nil
	}
	if rsaKey, err := x509.ParsePKCS1PublicKey(der); err == nil {
		return rsaKey, nil
	}
	return nil, fmt.Errorf("unsupported public key format (expect X.509 / PKCS#1)")
}

// Ensure interface compliance.
var _ payment.Provider = (*Waffo)(nil)
