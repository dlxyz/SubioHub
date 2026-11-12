package service

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestToUSDRequiresRateOrExplicitFallback(t *testing.T) {
	ctx := context.Background()

	// 没有缓存、没有 DB、也没有显式兜底：必须报错，而不是静默使用 0.14。
	svc := &ExchangeRateService{}
	_, err := svc.ToUSD(ctx, "CNY")
	require.Error(t, err)

	// 显式配置兜底汇率后按配置值生效。
	configured := &ExchangeRateService{
		settingRepo: &promotionSettingRepoStub{values: map[string]string{SettingExchangeRateFallback: "0.14"}},
	}
	rate, err := configured.ToUSD(ctx, "CNY")
	require.NoError(t, err)
	require.InDelta(t, 0.14, rate, 1e-9)

	// 配置为 0 视为未配置，仍然报错。
	zero := &ExchangeRateService{
		settingRepo: &promotionSettingRepoStub{values: map[string]string{SettingExchangeRateFallback: "0"}},
	}
	_, err = zero.ToUSD(ctx, "CNY")
	require.Error(t, err)

	// USD 自身恒为 1，不依赖汇率。
	usd, err := svc.ToUSD(ctx, "usd")
	require.NoError(t, err)
	require.InDelta(t, 1, usd, 1e-9)
}
