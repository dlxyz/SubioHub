package provider

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/dlxyz/SubioHub/internal/payment"
)

type waffoTestKeyPair struct {
	privateKey string
	publicKey  string
	rsaPrivate *rsa.PrivateKey
	rsaPublic  *rsa.PublicKey
}

func newWaffoTestKeyPair(t *testing.T) waffoTestKeyPair {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	privDER, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatalf("marshal private key: %v", err)
	}
	pubDER, err := x509.MarshalPKIXPublicKey(&key.PublicKey)
	if err != nil {
		t.Fatalf("marshal public key: %v", err)
	}
	return waffoTestKeyPair{
		privateKey: base64.StdEncoding.EncodeToString(privDER),
		publicKey:  base64.StdEncoding.EncodeToString(pubDER),
		rsaPrivate: key,
		rsaPublic:  &key.PublicKey,
	}
}

func newTestWaffo(t *testing.T, baseURL string, merchant, waffoKeys waffoTestKeyPair) *Waffo {
	t.Helper()
	provider, err := NewWaffo("1", map[string]string{
		"merchantId":       "MER_test",
		"privateKey":       merchant.privateKey,
		"webhookPublicKey": waffoKeys.publicKey,
		"productId":        "PROD_test",
		"currency":         "USD",
		"rate":             "1",
		"taxCategory":      "saas",
		"taxIncluded":      "true",
		"successUrl":       "https://example.com/payment/result",
		"language":         "zh-Hans",
		"expiresInSeconds": "3600",
	})
	if err != nil {
		t.Fatalf("NewWaffo: %v", err)
	}
	if baseURL != "" {
		provider.baseURL = baseURL
	}
	return provider
}

func TestNewWaffoValidatesRequiredConfig(t *testing.T) {
	_, err := NewWaffo("1", map[string]string{})
	if err == nil {
		t.Fatal("expected error for missing config")
	}
}

func TestWaffoCreatePaymentSignsPancakeRequest(t *testing.T) {
	merchant := newWaffoTestKeyPair(t)
	waffoKeys := newWaffoTestKeyPair(t)

	var gotBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != waffoCheckoutPath {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		if r.Header.Get("X-Merchant-Id") != "MER_test" {
			t.Errorf("unexpected merchant id %q", r.Header.Get("X-Merchant-Id"))
		}
		body, _ := io.ReadAll(r.Body)
		timestamp := r.Header.Get("X-Timestamp")
		sum := sha256.Sum256(body)
		canonical := "POST\n" + waffoCheckoutPath + "\n" + timestamp + "\n" + base64.StdEncoding.EncodeToString(sum[:])
		if !waffoVerify(canonical, waffoDecodeBase64(t, r.Header.Get("X-Signature")), merchant.rsaPublic) {
			t.Errorf("request signature verification failed")
		}
		if err := json.Unmarshal(body, &gotBody); err != nil {
			t.Errorf("decode body: %v", err)
		}

		respBody := `{"data":{"sessionId":"cs_1","checkoutUrl":"https://pancake.waffo.ai/store/demo/checkout/cs_1","expiresAt":"2026-11-08T00:00:00Z"}}`
		_, _ = w.Write([]byte(respBody))
	}))
	defer srv.Close()

	provider := newTestWaffo(t, srv.URL, merchant, waffoKeys)
	resp, err := provider.CreatePayment(context.Background(), payment.CreatePaymentRequest{
		OrderID:   "sub2_abc",
		Amount:    "7.5",
		Subject:   "Recharge 7.5",
		UserID:    "42",
		UserEmail: "user@example.com",
		ClientIP:  "1.2.3.4",
	})
	if err != nil {
		t.Fatalf("CreatePayment: %v", err)
	}
	if resp.TradeNo != "cs_1" {
		t.Fatalf("TradeNo = %q, want cs_1", resp.TradeNo)
	}
	if resp.PayURL != "https://pancake.waffo.ai/store/demo/checkout/cs_1" {
		t.Fatalf("PayURL = %q", resp.PayURL)
	}

	if gotBody["productId"] != "PROD_test" {
		t.Fatalf("productId = %v", gotBody["productId"])
	}
	if gotBody["currency"] != "USD" {
		t.Fatalf("currency = %v", gotBody["currency"])
	}
	if gotBody["orderMerchantExternalId"] != "sub2_abc" {
		t.Fatalf("orderMerchantExternalId = %v", gotBody["orderMerchantExternalId"])
	}
	if gotBody["buyerEmail"] != "user@example.com" {
		t.Fatalf("buyerEmail = %v", gotBody["buyerEmail"])
	}
	if gotBody["successUrl"] != "https://example.com/payment/result" {
		t.Fatalf("successUrl = %v", gotBody["successUrl"])
	}
	snapshot, _ := gotBody["priceSnapshot"].(map[string]any)
	if snapshot["amount"] != "7.50" {
		t.Fatalf("priceSnapshot.amount = %v", snapshot["amount"])
	}
	if snapshot["taxCategory"] != "saas" {
		t.Fatalf("priceSnapshot.taxCategory = %v", snapshot["taxCategory"])
	}
	if snapshot["taxIncluded"] != true {
		t.Fatalf("priceSnapshot.taxIncluded = %v", snapshot["taxIncluded"])
	}
	metadata, _ := gotBody["metadata"].(map[string]any)
	if metadata["order_id"] != "sub2_abc" || metadata["user_id"] != "42" {
		t.Fatalf("metadata = %v", metadata)
	}
}

func TestWaffoVerifyNotification(t *testing.T) {
	merchant := newWaffoTestKeyPair(t)
	waffoKeys := newWaffoTestKeyPair(t)
	provider := newTestWaffo(t, "", merchant, waffoKeys)

	body := `{"id":"PAY_1","eventType":"order.completed","mode":"prod","data":{"orderId":"ORD_1","orderStatus":"completed","buyerEmail":"user@example.com","currency":"USD","chargedAmount":"7.50","amount":"7.50","listPrice":{"total":"7.50"},"orderMetadata":{"order_id":"sub2_abc"},"orderMerchantExternalId":"sub2_abc","paymentId":"PAY_1","paymentStatus":"succeeded"}}`
	header := waffoTestSignatureHeader(t, body, waffoKeys.rsaPrivate)

	notification, err := provider.VerifyNotification(context.Background(), body, map[string]string{waffoSignatureHeader: header})
	if err != nil {
		t.Fatalf("VerifyNotification: %v", err)
	}
	if notification.OrderID != "sub2_abc" || notification.TradeNo != "PAY_1" {
		t.Fatalf("unexpected notification: %+v", notification)
	}
	if notification.Status != payment.ProviderStatusSuccess {
		t.Fatalf("status = %q, want success", notification.Status)
	}
	if notification.Amount != 7.5 {
		t.Fatalf("amount = %v, want 7.5", notification.Amount)
	}

	if _, err := provider.VerifyNotification(context.Background(), body, map[string]string{waffoSignatureHeader: "t=1,v1=bad"}); err == nil {
		t.Fatal("expected signature mismatch error")
	}
}

func TestWaffoVerifyNotificationRejectsExpiredTimestamp(t *testing.T) {
	merchant := newWaffoTestKeyPair(t)
	waffoKeys := newWaffoTestKeyPair(t)
	provider := newTestWaffo(t, "", merchant, waffoKeys)

	body := `{"eventType":"order.completed","data":{"orderMerchantExternalId":"sub2_abc","paymentStatus":"succeeded"}}`
	expired := strconv.FormatInt(time.Now().Add(-46*time.Minute).UnixMilli(), 10)
	sig, err := waffoSign(expired+"."+body, waffoKeys.rsaPrivate)
	if err != nil {
		t.Fatalf("sign webhook: %v", err)
	}
	header := fmt.Sprintf("t=%s,v1=%s", expired, sig)

	if _, err := provider.VerifyNotification(context.Background(), body, map[string]string{waffoSignatureHeader: header}); err == nil {
		t.Fatal("expected expired timestamp error")
	}
}

func TestWaffoVerifyNotificationIgnoresOtherEvents(t *testing.T) {
	merchant := newWaffoTestKeyPair(t)
	waffoKeys := newWaffoTestKeyPair(t)
	provider := newTestWaffo(t, "", merchant, waffoKeys)

	body := `{"eventType":"refund.succeeded","data":{}}`
	header := waffoTestSignatureHeader(t, body, waffoKeys.rsaPrivate)

	notification, err := provider.VerifyNotification(context.Background(), body, map[string]string{waffoSignatureHeader: header})
	if err != nil {
		t.Fatalf("VerifyNotification: %v", err)
	}
	if notification != nil {
		t.Fatalf("expected nil notification, got %+v", notification)
	}
}

func TestWaffoFormatAmount(t *testing.T) {
	if got := waffoFormatAmount(10, "USD"); got != "10.00" {
		t.Fatalf("USD amount = %q", got)
	}
	if got := waffoFormatAmount(10.4, "JPY"); got != "10" {
		t.Fatalf("JPY amount = %q", got)
	}
}

func waffoTestSignatureHeader(t *testing.T, body string, key *rsa.PrivateKey) string {
	t.Helper()
	timestamp := strconv.FormatInt(time.Now().UnixMilli(), 10)
	signature, err := waffoSign(timestamp+"."+body, key)
	if err != nil {
		t.Fatalf("sign webhook: %v", err)
	}
	return fmt.Sprintf("t=%s,v1=%s", timestamp, signature)
}

func waffoDecodeBase64(t *testing.T, raw string) []byte {
	t.Helper()
	decoded, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		t.Fatalf("decode base64: %v", err)
	}
	return decoded
}
