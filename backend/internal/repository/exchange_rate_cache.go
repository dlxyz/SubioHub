package repository

import (
	"context"
	"strconv"
	"time"

	"github.com/dlxyz/SubioHub/internal/service"
	"github.com/redis/go-redis/v9"
)

const (
	exchangeRateCacheKeyPrefix = "exchange:rate:"
	exchangeRateCacheTTL       = 25 * time.Hour
)

type exchangeRateCache struct {
	rdb *redis.Client
}

// NewExchangeRateCache returns the Redis-backed ExchangeRateCache used by
// ExchangeRateService (kept in repository so service does not import redis).
func NewExchangeRateCache(rdb *redis.Client) service.ExchangeRateCache {
	return &exchangeRateCache{rdb: rdb}
}

func (c *exchangeRateCache) Get(ctx context.Context, key string) (string, error) {
	return c.rdb.Get(ctx, key).Result()
}

func (c *exchangeRateCache) Set(ctx context.Context, key string, value float64) error {
	return c.rdb.Set(ctx, key, strconv.FormatFloat(value, 'f', -1, 64), exchangeRateCacheTTL).Err()
}
