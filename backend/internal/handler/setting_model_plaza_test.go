package handler

import (
	"context"
	"testing"

	"github.com/dlxyz/SubioHub/internal/pkg/pagination"
	"github.com/dlxyz/SubioHub/internal/service"
	"github.com/stretchr/testify/require"
)

type stubChannelRepository struct {
	channels []service.Channel
}

func (s *stubChannelRepository) Create(ctx context.Context, channel *service.Channel) error {
	return nil
}

func (s *stubChannelRepository) GetByID(ctx context.Context, id int64) (*service.Channel, error) {
	return nil, service.ErrChannelNotFound
}

func (s *stubChannelRepository) Update(ctx context.Context, channel *service.Channel) error {
	return nil
}

func (s *stubChannelRepository) Delete(ctx context.Context, id int64) error {
	return nil
}

func (s *stubChannelRepository) List(ctx context.Context, params pagination.PaginationParams, status, search, providerScope string) ([]service.Channel, *pagination.PaginationResult, error) {
	return nil, nil, nil
}

func (s *stubChannelRepository) ListAll(ctx context.Context) ([]service.Channel, error) {
	return s.channels, nil
}

func (s *stubChannelRepository) ExistsByName(ctx context.Context, name string) (bool, error) {
	return false, nil
}

func (s *stubChannelRepository) ExistsByNameExcluding(ctx context.Context, name string, excludeID int64) (bool, error) {
	return false, nil
}

func (s *stubChannelRepository) GetGroupIDs(ctx context.Context, channelID int64) ([]int64, error) {
	return nil, nil
}

func (s *stubChannelRepository) SetGroupIDs(ctx context.Context, channelID int64, groupIDs []int64) error {
	return nil
}

func (s *stubChannelRepository) GetChannelIDByGroupID(ctx context.Context, groupID int64) (int64, error) {
	return 0, nil
}

func (s *stubChannelRepository) GetGroupsInOtherChannels(ctx context.Context, channelID int64, groupIDs []int64) ([]int64, error) {
	return nil, nil
}

func (s *stubChannelRepository) GetGroupPlatforms(ctx context.Context, groupIDs []int64) (map[int64]string, error) {
	return nil, nil
}

func (s *stubChannelRepository) ListModelPricing(ctx context.Context, channelID int64) ([]service.ChannelModelPricing, error) {
	return nil, nil
}

func (s *stubChannelRepository) CreateModelPricing(ctx context.Context, pricing *service.ChannelModelPricing) error {
	return nil
}

func (s *stubChannelRepository) UpdateModelPricing(ctx context.Context, pricing *service.ChannelModelPricing) error {
	return nil
}

func (s *stubChannelRepository) DeleteModelPricing(ctx context.Context, id int64) error {
	return nil
}

func (s *stubChannelRepository) ReplaceModelPricing(ctx context.Context, channelID int64, pricingList []service.ChannelModelPricing) error {
	return nil
}

func TestCollectPublicModelPlazaModels(t *testing.T) {
	t.Parallel()

	channelService := service.NewChannelService(&stubChannelRepository{
		channels: []service.Channel{
			{
				ID:           1,
				Status:       service.StatusActive,
				ProviderType: service.ProviderTypeStandard,
				ModelPricing: []service.ChannelModelPricing{
					{Models: []string{"gpt-4o", "claude-3-5-sonnet", "shared-model"}},
				},
				ModelMapping: map[string]map[string]string{
					"openai": {"gpt-4.1": "gpt-4o"},
					"custom": {"embed": "text-embedding-3-large"},
				},
			},
			{
				ID:     2,
				Status: service.StatusDisabled,
				ModelPricing: []service.ChannelModelPricing{
					{Models: []string{"should-not-appear"}},
				},
				ModelMapping: map[string]map[string]string{
					"openai": {"x": "should-not-appear"},
				},
			},
			{
				ID:           3,
				Status:       service.StatusActive,
				ProviderType: service.ProviderTypeDeepSeek,
				ModelPricing: []service.ChannelModelPricing{
					{Models: []string{"text-embedding-3-large", "voyage-rerank-2", "shared-model"}},
				},
				ModelMapping: map[string]map[string]string{
					"rerank": {"rank": "voyage-rerank-2"},
				},
			},
		},
	}, nil)

	handler := &SettingHandler{channelService: channelService}
	models := handler.collectPublicModelPlazaModels(context.Background())

	require.Equal(t, []publicModelPlazaCollectedModel{
		{ID: "gpt-4o", SourceType: "subscription", SourceScopes: []string{"subscription"}},
		{ID: "claude-3-5-sonnet", SourceType: "subscription", SourceScopes: []string{"subscription"}},
		{ID: "shared-model", SourceType: "shared", SourceScopes: []string{"subscription", "interface"}},
		{ID: "text-embedding-3-large", SourceType: "shared", SourceScopes: []string{"subscription", "interface"}},
		{ID: "voyage-rerank-2", SourceType: "interface", SourceScopes: []string{"interface"}},
	}, models)
}
