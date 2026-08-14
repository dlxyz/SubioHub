package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	dbent "github.com/dlxyz/SubioHub/ent"
	"github.com/dlxyz/SubioHub/ent/exchangerate"
	"github.com/dlxyz/SubioHub/internal/config"
	"github.com/dlxyz/SubioHub/internal/payment"
	"github.com/dlxyz/SubioHub/internal/pkg/logger"
	"github.com/robfig/cron/v3"
)

const (
	exchangeRateKeyPrefix    = "exchange:rate:"
	exchangeRateHTTPTimeout  = 15 * time.Second
	maxExchangeRateRespBytes = 1 << 20

	defaultExchangeRateAPIURL   = "https://open.er-api.com/v6/latest/USD"
	defaultExchangeRateCron     = "0 6 * * *"
	defaultExchangeRateFallback = 0.14 // 1 CNY ≈ 0.14 USD 的兜底汇率
)

// CurrencyForPaymentType 根据支付方式返回原币种。
// 阶段一约定：国内渠道（支付宝/微信/易支付）为 CNY，海外渠道（Creem/Stripe/Tegro）为 USD。
func CurrencyForPaymentType(paymentType string) string {
	switch payment.GetBasePaymentType(paymentType) {
	case payment.TypeCreem, payment.TypeStripe, payment.TypeCard, payment.TypeLink, payment.TypeTegro:
		return "USD"
	default:
		return "CNY"
	}
}

// ExchangeRateCache 定义汇率缓存的读取与写入接口，由 repository 层提供 Redis 实现，
// 避免 service 直接依赖 Redis 客户端（depguard: service-no-repository）。
type ExchangeRateCache interface {
	Get(ctx context.Context, key string) (string, error)
	Set(ctx context.Context, key string, value float64) error
}

// ExchangeRateService 提供「1 单位币种 = 多少 USD」的汇率服务。
// 汇率通过定时任务从汇率 API 拉取，缓存到 Redis，并持久化到 exchange_rates 表作为降级兜底。
type ExchangeRateService struct {
	entClient   *dbent.Client
	cache       ExchangeRateCache
	settingRepo SettingRepository
	cfg         *config.Config
	httpClient  *http.Client

	mu        sync.Mutex
	cronSched *cron.Cron
}

// NewExchangeRateService creates a new ExchangeRateService.
func NewExchangeRateService(entClient *dbent.Client, cache ExchangeRateCache, settingRepo SettingRepository, cfg *config.Config) *ExchangeRateService {
	return &ExchangeRateService{
		entClient:   entClient,
		cache:       cache,
		settingRepo: settingRepo,
		cfg:         cfg,
		httpClient:  &http.Client{Timeout: exchangeRateHTTPTimeout},
	}
}

// Start 启动定时拉取任务，并异步拉取一次以尽快获得最新汇率。
func (s *ExchangeRateService) Start() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cronSched != nil {
		return
	}
	s.cronSched = cron.New()
	cronExpr := s.getCronExpr(context.Background())
	if _, err := s.cronSched.AddFunc(cronExpr, func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := s.RefreshRates(ctx); err != nil {
			logger.LegacyPrintf("service.exchange_rate", "刷新汇率失败: %v", err)
		}
	}); err != nil {
		logger.LegacyPrintf("service.exchange_rate", "注册汇率定时任务失败: %v", err)
	}
	s.cronSched.Start()

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := s.RefreshRates(ctx); err != nil {
			logger.LegacyPrintf("service.exchange_rate", "初始化拉取汇率失败: %v", err)
		}
	}()
}

// Stop 停止定时任务。
func (s *ExchangeRateService) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cronSched != nil {
		s.cronSched.Stop()
		s.cronSched = nil
	}
}

// ToUSD 返回「1 单位 currency = 多少 USD」。
// 取值优先级：Redis 缓存 → exchange_rates 表 → 配置 fallback → 报错。
func (s *ExchangeRateService) ToUSD(ctx context.Context, currency string) (float64, error) {
	cur := strings.ToUpper(strings.TrimSpace(currency))
	if cur == "" || cur == "USD" {
		return 1, nil
	}

	key := exchangeRateKey(cur)
	if s.cache != nil {
		if v, err := s.cache.Get(ctx, key); err == nil {
			if r, perr := strconv.ParseFloat(v, 64); perr == nil && r > 0 {
				return r, nil
			}
		}
	}

	if s.entClient != nil {
		rec, err := s.entClient.ExchangeRate.Query().
			Where(exchangerate.CurrencyEQ(cur)).
			Only(ctx)
		if err == nil && rec.Rate > 0 {
			if s.cache != nil {
				_ = s.cache.Set(ctx, key, rec.Rate)
			}
			return rec.Rate, nil
		}
	}

	if fb := s.getFallbackRate(ctx); fb > 0 {
		return fb, nil
	}
	return 0, fmt.Errorf("no exchange rate available for currency %s", cur)
}

// FromUSD 返回「1 USD = 多少 currency」，用于前端本地币展示。
// 语义与 ToUSD 相反：ToUSD("CNY") = 0.14，则 FromUSD("CNY") ≈ 7.14。
func (s *ExchangeRateService) FromUSD(ctx context.Context, currency string) (float64, error) {
	cur := strings.ToUpper(strings.TrimSpace(currency))
	if cur == "" || cur == "USD" {
		return 1, nil
	}
	rate, err := s.ToUSD(ctx, cur)
	if err != nil {
		return 0, err
	}
	if rate <= 0 {
		return 0, fmt.Errorf("invalid exchange rate for currency %s", cur)
	}
	return 1 / rate, nil
}

// RefreshRates 从汇率 API 拉取最新汇率并缓存/持久化。
// 阶段一只关注 CNY（国内充值渠道的原币）。
func (s *ExchangeRateService) RefreshRates(ctx context.Context) error {
	apiURL := s.getAPIURL(ctx)
	if apiURL == "" {
		return fmt.Errorf("exchange rate API URL is empty")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("fetch exchange rate: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxExchangeRateRespBytes))
	if err != nil {
		return fmt.Errorf("read response: %w", err)
	}
	var parsed erAPIResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return fmt.Errorf("decode response: %w", err)
	}
	if parsed.Result != "" && parsed.Result != "success" {
		return fmt.Errorf("api returned result %q", parsed.Result)
	}

	// base_code 通常为 USD，rates["CNY"] 表示 1 USD = X CNY，因此 1 CNY = 1/X USD。
	usdPerCNY := parsed.Rates["CNY"]
	if usdPerCNY <= 0 {
		return fmt.Errorf("api missing valid CNY rate")
	}
	rate := 1 / usdPerCNY
	if err := s.storeRate(ctx, "CNY", rate); err != nil {
		return fmt.Errorf("store rate: %w", err)
	}
	slog.Info("exchange rate refreshed", "currency", "CNY", "rate", rate)
	return nil
}

// storeRate 写 Redis 并 upsert 到 exchange_rates 表。
func (s *ExchangeRateService) storeRate(ctx context.Context, currency string, rate float64) error {
	if s.cache != nil {
		if err := s.cache.Set(ctx, exchangeRateKey(currency), rate); err != nil {
			logger.LegacyPrintf("service.exchange_rate", "写 Redis 汇率缓存失败: %v", err)
		}
	}
	if s.entClient == nil {
		return nil
	}
	return s.entClient.ExchangeRate.Create().
		SetCurrency(currency).
		SetRate(rate).
		SetFetchedAt(time.Now()).
		OnConflictColumns(exchangerate.FieldCurrency).
		UpdateNewValues().
		Exec(ctx)
}

func (s *ExchangeRateService) getCronExpr(ctx context.Context) string {
	if v, err := s.getSetting(ctx, SettingExchangeRateCron); err == nil && v != "" {
		return v
	}
	return defaultExchangeRateCron
}

func (s *ExchangeRateService) getAPIURL(ctx context.Context) string {
	if v, err := s.getSetting(ctx, SettingExchangeRateAPIURL); err == nil && v != "" {
		return v
	}
	return defaultExchangeRateAPIURL
}

func (s *ExchangeRateService) getFallbackRate(ctx context.Context) float64 {
	if v, err := s.getSetting(ctx, SettingExchangeRateFallback); err == nil && v != "" {
		if f, perr := strconv.ParseFloat(v, 64); perr == nil {
			return f
		}
	}
	return defaultExchangeRateFallback
}

func (s *ExchangeRateService) getSetting(ctx context.Context, key string) (string, error) {
	if s.settingRepo == nil {
		return "", fmt.Errorf("setting repo is nil")
	}
	return s.settingRepo.GetValue(ctx, key)
}

func exchangeRateKey(currency string) string {
	return exchangeRateKeyPrefix + currency
}

// erAPIResponse 是 open.er-api.com 的响应结构（base 为 USD）。
type erAPIResponse struct {
	Result   string             `json:"result"`
	BaseCode string             `json:"base_code"`
	Rates    map[string]float64 `json:"rates"`
}
