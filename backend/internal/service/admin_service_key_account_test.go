package service

import (
	"context"
	"testing"
	"time"

	"github.com/dlxyz/SubioHub/internal/config"
	"github.com/dlxyz/SubioHub/internal/pkg/pagination"
	"github.com/dlxyz/SubioHub/internal/pkg/usagestats"
)

type adminKeyAccountUserRepoStub struct {
	UserRepository
	pages   [][]User
	updates []User
}

func (s *adminKeyAccountUserRepoStub) ListWithFilters(ctx context.Context, params pagination.PaginationParams, filters UserListFilters) ([]User, *pagination.PaginationResult, error) {
	total := int64(0)
	for _, page := range s.pages {
		total += int64(len(page))
	}
	if params.Page <= 0 || params.Page > len(s.pages) {
		return []User{}, &pagination.PaginationResult{Total: total, Pages: len(s.pages), Page: params.Page, PageSize: params.PageSize}, nil
	}
	items := append([]User(nil), s.pages[params.Page-1]...)
	return items, &pagination.PaginationResult{Total: total, Pages: len(s.pages), Page: params.Page, PageSize: params.PageSize}, nil
}

func (s *adminKeyAccountUserRepoStub) Update(ctx context.Context, user *User) error {
	s.updates = append(s.updates, *user)
	return nil
}

type adminKeyAccountUsageRepoStub struct {
	UsageLogRepository
	batchStats      map[int64]*usagestats.BatchUserUsageStats
	aggregatedStats map[int64]*usagestats.UsageStats
}

func (s *adminKeyAccountUsageRepoStub) GetBatchUserUsageStats(ctx context.Context, userIDs []int64, startTime, endTime time.Time) (map[int64]*usagestats.BatchUserUsageStats, error) {
	result := make(map[int64]*usagestats.BatchUserUsageStats, len(userIDs))
	for _, userID := range userIDs {
		if stats, ok := s.batchStats[userID]; ok {
			result[userID] = stats
		} else {
			result[userID] = &usagestats.BatchUserUsageStats{UserID: userID}
		}
	}
	return result, nil
}

func (s *adminKeyAccountUsageRepoStub) GetUserStatsAggregated(ctx context.Context, userID int64, startTime, endTime time.Time) (*usagestats.UsageStats, error) {
	if stats, ok := s.aggregatedStats[userID]; ok {
		return stats, nil
	}
	return &usagestats.UsageStats{}, nil
}

type adminKeyAccountSettingRepoStub struct {
	SettingRepository
	values map[string]string
}

func (s *adminKeyAccountSettingRepoStub) GetAll(ctx context.Context) (map[string]string, error) {
	result := make(map[string]string, len(s.values))
	for key, value := range s.values {
		result[key] = value
	}
	return result, nil
}

func newKeyAccountSettingServiceForTest() *SettingService {
	repo := &adminKeyAccountSettingRepoStub{
		values: map[string]string{
			SettingKeyKeyAccountVIPRechargeThreshold:           "5000",
			SettingKeyKeyAccountEnterpriseRechargeThreshold:    "20000",
			SettingKeyKeyAccountVIPMonthlyCostThreshold:        "3000",
			SettingKeyKeyAccountEnterpriseMonthlyCostThreshold: "10000",
			SettingKeyKeyAccountVIPDefaultDiscountRate:         "0.95",
			SettingKeyKeyAccountEnterpriseDefaultDiscountRate:  "0.90",
			SettingKeyKeyAccountVIPDefaultRebateRate:           "0.05",
			SettingKeyKeyAccountEnterpriseDefaultRebateRate:    "0.08",
			SettingKeyKeyAccountAutoUpgradeEnabled:             "true",
			SettingKeyKeyAccountAutoDowngradeEnabled:           "true",
		},
	}
	return NewSettingService(repo, &config.Config{})
}

func TestSyncKeyAccountsPromotesVIPUser(t *testing.T) {
	t.Parallel()

	userRepo := &adminKeyAccountUserRepoStub{
		pages: [][]User{{
			{
				ID:                     1,
				Email:                  "vip@example.com",
				Role:                   RoleUser,
				Status:                 StatusActive,
				IsKeyAccount:           false,
				KeyAccountLevel:        "standard",
				TotalRecharged:         6000,
				PasswordHash:           "hashed",
				KeyAccountDiscountRate: 1,
				KeyAccountRebateRate:   0,
			},
		}},
	}
	usageRepo := &adminKeyAccountUsageRepoStub{
		batchStats: map[int64]*usagestats.BatchUserUsageStats{
			1: {UserID: 1, TotalActualCost: 500},
		},
	}
	svc := &adminServiceImpl{
		userRepo:       userRepo,
		usageLogRepo:   usageRepo,
		settingService: newKeyAccountSettingServiceForTest(),
	}

	result, err := svc.SyncKeyAccounts(context.Background(), KeyAccountSyncOptions{})
	if err != nil {
		t.Fatalf("SyncKeyAccounts() error = %v", err)
	}
	if result.Changed != 1 || result.PromotedToKeyAccount != 1 {
		t.Fatalf("unexpected sync result: %+v", result)
	}
	if len(userRepo.updates) != 1 {
		t.Fatalf("expected 1 updated user, got %d", len(userRepo.updates))
	}
	updated := userRepo.updates[0]
	if !updated.IsKeyAccount || updated.KeyAccountLevel != "vip" {
		t.Fatalf("expected promoted vip key account, got %+v", updated)
	}
	if !almostEqualFloat(updated.KeyAccountDiscountRate, 0.95) || !almostEqualFloat(updated.KeyAccountRebateRate, 0.05) {
		t.Fatalf("expected vip default strategy, got discount=%v rebate=%v", updated.KeyAccountDiscountRate, updated.KeyAccountRebateRate)
	}
}

func TestSyncKeyAccountsDowngradesToStandardAndResetsStrategy(t *testing.T) {
	t.Parallel()

	userRepo := &adminKeyAccountUserRepoStub{
		pages: [][]User{{
			{
				ID:                     2,
				Email:                  "old-vip@example.com",
				Role:                   RoleUser,
				Status:                 StatusActive,
				IsKeyAccount:           true,
				KeyAccountLevel:        "vip",
				TotalRecharged:         100,
				PasswordHash:           "hashed",
				KeyAccountDiscountRate: 0.95,
				KeyAccountRebateRate:   0.05,
			},
		}},
	}
	usageRepo := &adminKeyAccountUsageRepoStub{
		batchStats: map[int64]*usagestats.BatchUserUsageStats{
			2: {UserID: 2, TotalActualCost: 50},
		},
	}
	svc := &adminServiceImpl{
		userRepo:       userRepo,
		usageLogRepo:   usageRepo,
		settingService: newKeyAccountSettingServiceForTest(),
	}

	result, err := svc.SyncKeyAccounts(context.Background(), KeyAccountSyncOptions{})
	if err != nil {
		t.Fatalf("SyncKeyAccounts() error = %v", err)
	}
	if result.RemovedFromKeyAccount != 1 || result.Downgraded != 1 {
		t.Fatalf("unexpected sync result: %+v", result)
	}
	updated := userRepo.updates[0]
	if updated.IsKeyAccount || updated.KeyAccountLevel != "standard" {
		t.Fatalf("expected standard user after downgrade, got %+v", updated)
	}
	if !almostEqualFloat(updated.KeyAccountDiscountRate, 1) || !almostEqualFloat(updated.KeyAccountRebateRate, 0) {
		t.Fatalf("expected strategy reset, got discount=%v rebate=%v", updated.KeyAccountDiscountRate, updated.KeyAccountRebateRate)
	}
}

func TestGetUserUsageStatsReturnsAggregatedValues(t *testing.T) {
	t.Parallel()

	usageRepo := &adminKeyAccountUsageRepoStub{
		aggregatedStats: map[int64]*usagestats.UsageStats{
			3: {
				TotalRequests:     12,
				TotalTokens:       3456,
				TotalActualCost:   78.9,
				AverageDurationMs: 123,
			},
		},
	}
	svc := &adminServiceImpl{usageLogRepo: usageRepo}

	statsAny, err := svc.GetUserUsageStats(context.Background(), 3, "month")
	if err != nil {
		t.Fatalf("GetUserUsageStats() error = %v", err)
	}
	stats, ok := statsAny.(map[string]any)
	if !ok {
		t.Fatalf("expected map result, got %T", statsAny)
	}
	if stats["period"] != "month" || stats["total_requests"] != int64(12) || stats["total_tokens"] != int64(3456) {
		t.Fatalf("unexpected stats payload: %+v", stats)
	}
	if cost, ok := stats["total_cost"].(float64); !ok || !almostEqualFloat(cost, 78.9) {
		t.Fatalf("unexpected total_cost: %#v", stats["total_cost"])
	}
}
