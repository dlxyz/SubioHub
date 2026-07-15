package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"strings"
	"time"

	dbent "github.com/dlxyz/SubioHub/ent"
	infraerrors "github.com/dlxyz/SubioHub/internal/pkg/errors"
	"github.com/dlxyz/SubioHub/internal/pkg/httpclient"
	"github.com/dlxyz/SubioHub/internal/pkg/logger"
	"github.com/dlxyz/SubioHub/internal/pkg/pagination"
	"github.com/dlxyz/SubioHub/internal/pkg/timezone"
	"github.com/dlxyz/SubioHub/internal/util/httputil"
)

// AdminService interface defines admin management operations
type AdminService interface {
	// User management
	ListUsers(ctx context.Context, page, pageSize int, filters UserListFilters, sortBy, sortOrder string) ([]User, int64, error)
	GetUser(ctx context.Context, id int64) (*User, error)
	CreateUser(ctx context.Context, input *CreateUserInput) (*User, error)
	UpdateUser(ctx context.Context, id int64, input *UpdateUserInput) (*User, error)
	DeleteUser(ctx context.Context, id int64) error
	UpdateUserBalance(ctx context.Context, userID int64, balance float64, operation string, notes string) (*User, error)
	GetUserAPIKeys(ctx context.Context, userID int64, page, pageSize int, sortBy, sortOrder string) ([]APIKey, int64, error)
	GetUserUsageStats(ctx context.Context, userID int64, period string) (any, error)
	// GetUserBalanceHistory returns paginated balance/concurrency change records for a user.
	// codeType is optional - pass empty string to return all types.
	// Also returns totalRecharged (sum of all positive balance top-ups).
	GetUserBalanceHistory(ctx context.Context, userID int64, page, pageSize int, codeType string) ([]RedeemCode, int64, float64, error)
	SyncKeyAccounts(ctx context.Context, options KeyAccountSyncOptions) (*KeyAccountSyncResult, error)

	// Group management
	ListGroups(ctx context.Context, page, pageSize int, platform, status, search string, isExclusive *bool, sortBy, sortOrder string) ([]Group, int64, error)
	GetAllGroups(ctx context.Context) ([]Group, error)
	GetAllGroupsByPlatform(ctx context.Context, platform string) ([]Group, error)
	GetGroup(ctx context.Context, id int64) (*Group, error)
	CreateGroup(ctx context.Context, input *CreateGroupInput) (*Group, error)
	UpdateGroup(ctx context.Context, id int64, input *UpdateGroupInput) (*Group, error)
	DeleteGroup(ctx context.Context, id int64) error
	GetGroupAPIKeys(ctx context.Context, groupID int64, page, pageSize int) ([]APIKey, int64, error)
	GetGroupRateMultipliers(ctx context.Context, groupID int64) ([]UserGroupRateEntry, error)
	ClearGroupRateMultipliers(ctx context.Context, groupID int64) error
	BatchSetGroupRateMultipliers(ctx context.Context, groupID int64, entries []GroupRateMultiplierInput) error
	UpdateGroupSortOrders(ctx context.Context, updates []GroupSortOrderUpdate) error

	// API Key management (admin)
	AdminUpdateAPIKeyGroupID(ctx context.Context, keyID int64, groupID *int64) (*AdminUpdateAPIKeyGroupIDResult, error)

	// ReplaceUserGroup replaces a user's exclusive group assignment and moves related API keys.
	ReplaceUserGroup(ctx context.Context, userID, oldGroupID, newGroupID int64) (*ReplaceUserGroupResult, error)

	// Account management
	ListAccounts(ctx context.Context, page, pageSize int, platform, accountType, status, search string, groupID int64, privacyMode string, sortBy, sortOrder string) ([]Account, int64, error)
	GetAccount(ctx context.Context, id int64) (*Account, error)
	GetAccountsByIDs(ctx context.Context, ids []int64) ([]*Account, error)
	CreateAccount(ctx context.Context, input *CreateAccountInput) (*Account, error)
	UpdateAccount(ctx context.Context, id int64, input *UpdateAccountInput) (*Account, error)
	DeleteAccount(ctx context.Context, id int64) error
	RefreshAccountCredentials(ctx context.Context, id int64) (*Account, error)
	ClearAccountError(ctx context.Context, id int64) (*Account, error)
	SetAccountError(ctx context.Context, id int64, errorMsg string) error
	// EnsureOpenAIPrivacy ensures privacy_mode is configured for OpenAI OAuth accounts.
	EnsureOpenAIPrivacy(ctx context.Context, account *Account) string
	// EnsureAntigravityPrivacy ensures privacy_mode is configured for Antigravity OAuth accounts.
	EnsureAntigravityPrivacy(ctx context.Context, account *Account) string
	// ForceOpenAIPrivacy forces OpenAI privacy settings to be applied again.
	ForceOpenAIPrivacy(ctx context.Context, account *Account) string
	// ForceAntigravityPrivacy forces Antigravity privacy settings to be applied again.
	ForceAntigravityPrivacy(ctx context.Context, account *Account) string
	SetAccountSchedulable(ctx context.Context, id int64, schedulable bool) (*Account, error)
	BulkUpdateAccounts(ctx context.Context, input *BulkUpdateAccountsInput) (*BulkUpdateAccountsResult, error)
	CheckMixedChannelRisk(ctx context.Context, currentAccountID int64, currentAccountPlatform string, groupIDs []int64) error

	// Proxy management
	ListProxies(ctx context.Context, page, pageSize int, protocol, status, search string, sortBy, sortOrder string) ([]Proxy, int64, error)
	ListProxiesWithAccountCount(ctx context.Context, page, pageSize int, protocol, status, search string, sortBy, sortOrder string) ([]ProxyWithAccountCount, int64, error)
	GetAllProxies(ctx context.Context) ([]Proxy, error)
	GetAllProxiesWithAccountCount(ctx context.Context) ([]ProxyWithAccountCount, error)
	GetProxy(ctx context.Context, id int64) (*Proxy, error)
	GetProxiesByIDs(ctx context.Context, ids []int64) ([]Proxy, error)
	CreateProxy(ctx context.Context, input *CreateProxyInput) (*Proxy, error)
	UpdateProxy(ctx context.Context, id int64, input *UpdateProxyInput) (*Proxy, error)
	DeleteProxy(ctx context.Context, id int64) error
	BatchDeleteProxies(ctx context.Context, ids []int64) (*ProxyBatchDeleteResult, error)
	GetProxyAccounts(ctx context.Context, proxyID int64) ([]ProxyAccountSummary, error)
	CheckProxyExists(ctx context.Context, host string, port int, username, password string) (bool, error)
	TestProxy(ctx context.Context, id int64) (*ProxyTestResult, error)
	CheckProxyQuality(ctx context.Context, id int64) (*ProxyQualityCheckResult, error)

	// Redeem code management
	ListRedeemCodes(ctx context.Context, page, pageSize int, codeType, status, search string, sortBy, sortOrder string) ([]RedeemCode, int64, error)
	GetRedeemCode(ctx context.Context, id int64) (*RedeemCode, error)
	GenerateRedeemCodes(ctx context.Context, input *GenerateRedeemCodesInput) ([]RedeemCode, error)
	DeleteRedeemCode(ctx context.Context, id int64) error
	BatchDeleteRedeemCodes(ctx context.Context, ids []int64) (int64, error)
	ExpireRedeemCode(ctx context.Context, id int64) (*RedeemCode, error)
	ResetAccountQuota(ctx context.Context, id int64) error
}

// CreateUserInput represents input for creating a new user via admin operations.
type CreateUserInput struct {
	Email         string
	Password      string
	Username      string
	Notes         string
	Balance       float64
	Concurrency   int
	AllowedGroups []int64
}

type UpdateUserInput struct {
	Email                  string
	Password               string
	Role                   *string
	Username               *string
	Notes                  *string
	Balance                *float64
	Concurrency            *int
	Status                 string
	AllowedGroups          *[]int64
	IsKeyAccount           *bool
	KeyAccountLevel        *string
	KeyAccountDiscountRate *float64
	KeyAccountRebateRate   *float64
	KeyAccountManagerNotes *string
	ChannelPartnerID       **int64
	AgentOwnerID           **int64
	DistributorOwnerID     **int64
	GroupRates             map[int64]*float64
}

type KeyAccountSyncOptions struct {
	DryRun   bool
	PageSize int
}

type KeyAccountSyncItem struct {
	UserID                 int64   `json:"user_id"`
	Email                  string  `json:"email"`
	BeforeIsKeyAccount     bool    `json:"before_is_key_account"`
	AfterIsKeyAccount      bool    `json:"after_is_key_account"`
	BeforeLevel            string  `json:"before_level"`
	AfterLevel             string  `json:"after_level"`
	TotalRecharged         float64 `json:"total_recharged"`
	MonthlyActualCost      float64 `json:"monthly_actual_cost"`
	Action                 string  `json:"action"`
	Reason                 string  `json:"reason"`
	AppliedDefaultStrategy bool    `json:"applied_default_strategy"`
	Error                  string  `json:"error,omitempty"`
}

type KeyAccountSyncResult struct {
	DryRun                 bool                 `json:"dry_run"`
	AutoUpgradeEnabled     bool                 `json:"auto_upgrade_enabled"`
	AutoDowngradeEnabled   bool                 `json:"auto_downgrade_enabled"`
	Scanned                int                  `json:"scanned"`
	Eligible               int                  `json:"eligible"`
	Changed                int                  `json:"changed"`
	Upgraded               int                  `json:"upgraded"`
	Downgraded             int                  `json:"downgraded"`
	PromotedToKeyAccount   int                  `json:"promoted_to_key_account"`
	RemovedFromKeyAccount  int                  `json:"removed_from_key_account"`
	AppliedDefaultStrategy int                  `json:"applied_default_strategy"`
	Failed                 int                  `json:"failed"`
	Items                  []KeyAccountSyncItem `json:"items"`
}

type CreateGroupInput struct {
	Name             string
	Description      string
	Platform         string
	RoutingProfile   string
	RateMultiplier   float64
	IsExclusive      bool
	SubscriptionType string   // standard/subscription
	DailyLimitUSD    *float64 // Daily limit in USD.
	WeeklyLimitUSD   *float64 // Weekly limit in USD.
	MonthlyLimitUSD  *float64 // Monthly limit in USD.
	// Image billing config for Antigravity groups only.
	ImagePrice1K    *float64
	ImagePrice2K    *float64
	ImagePrice4K    *float64
	ClaudeCodeOnly  bool   // Allow Claude Code clients only.
	FallbackGroupID *int64 // Fallback group ID.
	// Fallback group for invalid requests on Anthropic groups.
	FallbackGroupIDOnInvalidRequest *int64
	// Model routing config for Anthropic groups only.
	ModelRouting        map[string][]int64
	ModelRoutingEnabled bool // Whether model routing is enabled.
	MCPXMLInject        *bool
	// Supported model scopes for Antigravity groups.
	SupportedModelScopes []string
	// OpenAI Messages dispatch config for OpenAI groups only.
	AllowMessagesDispatch       bool
	DefaultMappedModel          string
	RequireOAuthOnly            bool
	RequirePrivacySet           bool
	MessagesDispatchModelConfig OpenAIMessagesDispatchModelConfig
	// 从指定分组复制账号（创建分组后在同一事务内绑定）
	CopyAccountsFromGroupIDs []int64
}

type UpdateGroupInput struct {
	Name             string
	Description      string
	Platform         string
	RoutingProfile   string
	RateMultiplier   *float64 // 使用指针以支持设置为0
	IsExclusive      *bool
	Status           string
	SubscriptionType string   // standard/subscription
	DailyLimitUSD    *float64 // Daily limit in USD.
	WeeklyLimitUSD   *float64 // Weekly limit in USD.
	MonthlyLimitUSD  *float64 // Monthly limit in USD.
	// Image billing config for Antigravity groups only.
	ImagePrice1K    *float64
	ImagePrice2K    *float64
	ImagePrice4K    *float64
	ClaudeCodeOnly  *bool  // Allow Claude Code clients only.
	FallbackGroupID *int64 // Fallback group ID.
	// Fallback group for invalid requests on Anthropic groups.
	FallbackGroupIDOnInvalidRequest *int64
	// Model routing config for Anthropic groups only.
	ModelRouting        map[string][]int64
	ModelRoutingEnabled *bool // Whether model routing is enabled.
	MCPXMLInject        *bool
	// Supported model scopes for Antigravity groups.
	SupportedModelScopes *[]string
	// OpenAI Messages dispatch config for OpenAI groups only.
	AllowMessagesDispatch       *bool
	DefaultMappedModel          *string
	RequireOAuthOnly            *bool
	RequirePrivacySet           *bool
	MessagesDispatchModelConfig *OpenAIMessagesDispatchModelConfig
	// 从指定分组复制账号（同步操作：先清空当前分组的账号绑定，再绑定源分组的账号）
	CopyAccountsFromGroupIDs []int64
}

type CreateAccountInput struct {
	Name               string
	Notes              *string
	Platform           string
	Type               string
	Credentials        map[string]any
	Extra              map[string]any
	ProxyID            *int64
	Concurrency        int
	Priority           int
	RateMultiplier     *float64
	LoadFactor         *int
	GroupIDs           []int64
	ExpiresAt          *int64
	AutoPauseOnExpired *bool
	// SkipDefaultGroupBind prevents auto-binding to platform default group when GroupIDs is empty.
	SkipDefaultGroupBind bool
	// SkipMixedChannelCheck skips the mixed channel risk check when binding groups.
	// This should only be set when the caller has explicitly confirmed the risk.
	SkipMixedChannelCheck bool
}

type UpdateAccountInput struct {
	Name                  string
	Notes                 *string
	Type                  string // Account type: oauth, setup-token, apikey
	Credentials           map[string]any
	Extra                 map[string]any
	ProxyID               *int64
	Concurrency           *int
	Priority              *int
	RateMultiplier        *float64
	LoadFactor            *int
	Status                string
	GroupIDs              *[]int64
	ExpiresAt             *int64
	AutoPauseOnExpired    *bool
	SkipMixedChannelCheck bool // 跳过混合渠道检查（用户已确认风险）
}

// BulkUpdateAccountsInput describes the payload for bulk updating accounts.
type BulkUpdateAccountsInput struct {
	AccountIDs     []int64
	Name           string
	ProxyID        *int64
	Concurrency    *int
	Priority       *int
	RateMultiplier *float64
	LoadFactor     *int
	Status         string
	Schedulable    *bool
	GroupIDs       *[]int64
	Credentials    map[string]any
	Extra          map[string]any
	// SkipMixedChannelCheck skips the mixed channel risk check when binding groups.
	// This should only be set when the caller has explicitly confirmed the risk.
	SkipMixedChannelCheck bool
}

// BulkUpdateAccountResult captures the result for a single account update.
type BulkUpdateAccountResult struct {
	AccountID int64  `json:"account_id"`
	Success   bool   `json:"success"`
	Error     string `json:"error,omitempty"`
}

// AdminUpdateAPIKeyGroupIDResult is the result of AdminUpdateAPIKeyGroupID.
type AdminUpdateAPIKeyGroupIDResult struct {
	APIKey                 *APIKey
	AutoGrantedGroupAccess bool   // true if a new exclusive group permission was auto-added
	GrantedGroupID         *int64 // the group ID that was auto-granted
	GrantedGroupName       string // the group name that was auto-granted
}

// ReplaceUserGroupResult captures the result of replacing a user's exclusive group.
type ReplaceUserGroupResult struct {
	MigratedKeys int64 // Number of migrated API keys.
}

// BulkUpdateAccountsResult is the aggregated response for bulk updates.
type BulkUpdateAccountsResult struct {
	Success    int                       `json:"success"`
	Failed     int                       `json:"failed"`
	SuccessIDs []int64                   `json:"success_ids"`
	FailedIDs  []int64                   `json:"failed_ids"`
	Results    []BulkUpdateAccountResult `json:"results"`
}

type CreateProxyInput struct {
	Name     string
	Protocol string
	Host     string
	Port     int
	Username string
	Password string
}

type UpdateProxyInput struct {
	Name     string
	Protocol string
	Host     string
	Port     int
	Username string
	Password string
	Status   string
}

type GenerateRedeemCodesInput struct {
	Count        int
	Type         string
	Value        float64
	GroupID      *int64 // 订阅类型专用：关联的分组ID
	ValidityDays int    // Subscription validity days.
}

type ProxyBatchDeleteResult struct {
	DeletedIDs []int64                   `json:"deleted_ids"`
	Skipped    []ProxyBatchDeleteSkipped `json:"skipped"`
}

type ProxyBatchDeleteSkipped struct {
	ID     int64  `json:"id"`
	Reason string `json:"reason"`
}

// ProxyTestResult represents the result of testing a proxy
type ProxyTestResult struct {
	Success     bool   `json:"success"`
	Message     string `json:"message"`
	LatencyMs   int64  `json:"latency_ms,omitempty"`
	IPAddress   string `json:"ip_address,omitempty"`
	City        string `json:"city,omitempty"`
	Region      string `json:"region,omitempty"`
	Country     string `json:"country,omitempty"`
	CountryCode string `json:"country_code,omitempty"`
}

type ProxyQualityCheckResult struct {
	ProxyID        int64                   `json:"proxy_id"`
	Score          int                     `json:"score"`
	Grade          string                  `json:"grade"`
	Summary        string                  `json:"summary"`
	ExitIP         string                  `json:"exit_ip,omitempty"`
	Country        string                  `json:"country,omitempty"`
	CountryCode    string                  `json:"country_code,omitempty"`
	BaseLatencyMs  int64                   `json:"base_latency_ms,omitempty"`
	PassedCount    int                     `json:"passed_count"`
	WarnCount      int                     `json:"warn_count"`
	FailedCount    int                     `json:"failed_count"`
	ChallengeCount int                     `json:"challenge_count"`
	CheckedAt      int64                   `json:"checked_at"`
	Items          []ProxyQualityCheckItem `json:"items"`
}

type ProxyQualityCheckItem struct {
	Target     string `json:"target"`
	Status     string `json:"status"` // pass/warn/fail/challenge
	HTTPStatus int    `json:"http_status,omitempty"`
	LatencyMs  int64  `json:"latency_ms,omitempty"`
	Message    string `json:"message,omitempty"`
	CFRay      string `json:"cf_ray,omitempty"`
}

// ProxyExitInfo represents proxy exit information from ip-api.com
type ProxyExitInfo struct {
	IP          string
	City        string
	Region      string
	Country     string
	CountryCode string
}

// ProxyExitInfoProber tests proxy connectivity and retrieves exit information
type ProxyExitInfoProber interface {
	ProbeProxy(ctx context.Context, proxyURL string) (*ProxyExitInfo, int64, error)
}

type groupExistenceBatchReader interface {
	ExistsByIDs(ctx context.Context, ids []int64) (map[int64]bool, error)
}

type proxyQualityTarget struct {
	Target          string
	URL             string
	Method          string
	AllowedStatuses map[int]struct{}
}

var proxyQualityTargets = []proxyQualityTarget{
	{
		Target: "openai",
		URL:    "https://api.openai.com/v1/models",
		Method: http.MethodGet,
		AllowedStatuses: map[int]struct{}{
			http.StatusUnauthorized: {},
		},
	},
	{
		Target: "anthropic",
		URL:    "https://api.anthropic.com/v1/messages",
		Method: http.MethodGet,
		AllowedStatuses: map[int]struct{}{
			http.StatusUnauthorized:     {},
			http.StatusMethodNotAllowed: {},
			http.StatusNotFound:         {},
			http.StatusBadRequest:       {},
		},
	},
	{
		Target: "gemini",
		URL:    "https://generativelanguage.googleapis.com/$discovery/rest?version=v1beta",
		Method: http.MethodGet,
		AllowedStatuses: map[int]struct{}{
			http.StatusOK: {},
		},
	},
}

const (
	proxyQualityRequestTimeout        = 15 * time.Second
	proxyQualityResponseHeaderTimeout = 10 * time.Second
	proxyQualityMaxBodyBytes          = int64(8 * 1024)
	proxyQualityClientUserAgent       = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
)

// adminServiceImpl implements AdminService
type adminServiceImpl struct {
	userRepo             UserRepository
	groupRepo            GroupRepository
	accountRepo          AccountRepository
	proxyRepo            ProxyRepository
	apiKeyRepo           APIKeyRepository
	redeemCodeRepo       RedeemCodeRepository
	userGroupRateRepo    UserGroupRateRepository
	usageLogRepo         UsageLogRepository
	billingCacheService  *BillingCacheService
	proxyProber          ProxyExitInfoProber
	proxyLatencyCache    ProxyLatencyCache
	authCacheInvalidator APIKeyAuthCacheInvalidator
	entClient            *dbent.Client // 用于开启数据库事务
	settingService       *SettingService
	defaultSubAssigner   DefaultSubscriptionAssigner
	userSubRepo          UserSubscriptionRepository
	privacyClientFactory PrivacyClientFactory
}

type userGroupRateBatchReader interface {
	GetByUserIDs(ctx context.Context, userIDs []int64) (map[int64]map[int64]float64, error)
}

// NewAdminService creates a new AdminService
func NewAdminService(
	userRepo UserRepository,
	groupRepo GroupRepository,
	accountRepo AccountRepository,
	proxyRepo ProxyRepository,
	apiKeyRepo APIKeyRepository,
	redeemCodeRepo RedeemCodeRepository,
	userGroupRateRepo UserGroupRateRepository,
	usageLogRepo UsageLogRepository,
	billingCacheService *BillingCacheService,
	proxyProber ProxyExitInfoProber,
	proxyLatencyCache ProxyLatencyCache,
	authCacheInvalidator APIKeyAuthCacheInvalidator,
	entClient *dbent.Client,
	settingService *SettingService,
	defaultSubAssigner DefaultSubscriptionAssigner,
	userSubRepo UserSubscriptionRepository,
	privacyClientFactory PrivacyClientFactory,
) AdminService {
	return &adminServiceImpl{
		userRepo:             userRepo,
		groupRepo:            groupRepo,
		accountRepo:          accountRepo,
		proxyRepo:            proxyRepo,
		apiKeyRepo:           apiKeyRepo,
		redeemCodeRepo:       redeemCodeRepo,
		userGroupRateRepo:    userGroupRateRepo,
		usageLogRepo:         usageLogRepo,
		billingCacheService:  billingCacheService,
		proxyProber:          proxyProber,
		proxyLatencyCache:    proxyLatencyCache,
		authCacheInvalidator: authCacheInvalidator,
		entClient:            entClient,
		settingService:       settingService,
		defaultSubAssigner:   defaultSubAssigner,
		userSubRepo:          userSubRepo,
		privacyClientFactory: privacyClientFactory,
	}
}

// User management implementations
func (s *adminServiceImpl) ListUsers(ctx context.Context, page, pageSize int, filters UserListFilters, sortBy, sortOrder string) ([]User, int64, error) {
	params := pagination.PaginationParams{Page: page, PageSize: pageSize, SortBy: sortBy, SortOrder: sortOrder}
	users, result, err := s.userRepo.ListWithFilters(ctx, params, filters)
	if err != nil {
		return nil, 0, err
	}
	// 批量加载用户专属分组倍率
	if s.userGroupRateRepo != nil && len(users) > 0 {
		if batchRepo, ok := s.userGroupRateRepo.(userGroupRateBatchReader); ok {
			userIDs := make([]int64, 0, len(users))
			for i := range users {
				userIDs = append(userIDs, users[i].ID)
			}
			ratesByUser, err := batchRepo.GetByUserIDs(ctx, userIDs)
			if err != nil {
				logger.LegacyPrintf("service.admin", "failed to load user group rates in batch: err=%v", err)
				s.loadUserGroupRatesOneByOne(ctx, users)
			} else {
				for i := range users {
					if rates, ok := ratesByUser[users[i].ID]; ok {
						users[i].GroupRates = rates
					}
				}
			}
		} else {
			s.loadUserGroupRatesOneByOne(ctx, users)
		}
	}
	return users, result.Total, nil
}

func (s *adminServiceImpl) loadUserGroupRatesOneByOne(ctx context.Context, users []User) {
	if s.userGroupRateRepo == nil {
		return
	}
	for i := range users {
		rates, err := s.userGroupRateRepo.GetByUserID(ctx, users[i].ID)
		if err != nil {
			logger.LegacyPrintf("service.admin", "failed to load user group rates: user_id=%d err=%v", users[i].ID, err)
			continue
		}
		users[i].GroupRates = rates
	}
}

func (s *adminServiceImpl) GetUser(ctx context.Context, id int64) (*User, error) {
	user, err := s.userRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	// 加载用户专属分组倍率
	if s.userGroupRateRepo != nil {
		rates, err := s.userGroupRateRepo.GetByUserID(ctx, id)
		if err != nil {
			logger.LegacyPrintf("service.admin", "failed to load user group rates: user_id=%d err=%v", id, err)
		} else {
			user.GroupRates = rates
		}
	}
	return user, nil
}

func (s *adminServiceImpl) CreateUser(ctx context.Context, input *CreateUserInput) (*User, error) {
	user := &User{
		Email:         input.Email,
		Username:      input.Username,
		Notes:         input.Notes,
		Role:          RoleUser, // Always create as regular user, never admin
		Balance:       input.Balance,
		Concurrency:   input.Concurrency,
		Status:        StatusActive,
		AllowedGroups: input.AllowedGroups,
	}
	if err := user.SetPassword(input.Password); err != nil {
		return nil, err
	}
	if err := s.userRepo.Create(ctx, user); err != nil {
		return nil, err
	}
	s.assignDefaultSubscriptions(ctx, user.ID)
	return user, nil
}

func (s *adminServiceImpl) assignDefaultSubscriptions(ctx context.Context, userID int64) {
	if s.settingService == nil || s.defaultSubAssigner == nil || userID <= 0 {
		return
	}
	items := s.settingService.GetDefaultSubscriptions(ctx)
	for _, item := range items {
		if _, _, err := s.defaultSubAssigner.AssignOrExtendSubscription(ctx, &AssignSubscriptionInput{
			UserID:       userID,
			GroupID:      item.GroupID,
			ValidityDays: item.ValidityDays,
			Notes:        "auto assigned by default user subscriptions setting",
		}); err != nil {
			logger.LegacyPrintf("service.admin", "failed to assign default subscription: user_id=%d group_id=%d err=%v", userID, item.GroupID, err)
		}
	}
}

func (s *adminServiceImpl) UpdateUser(ctx context.Context, id int64, input *UpdateUserInput) (*User, error) {
	user, err := s.userRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// Protect admin users: cannot disable admin accounts
	if user.Role == "admin" && input.Status == "disabled" {
		return nil, errors.New("cannot disable admin user")
	}

	oldConcurrency := user.Concurrency
	oldStatus := user.Status
	oldRole := user.Role

	if input.Email != "" {
		user.Email = input.Email
	}
	if input.Password != "" {
		if err := user.SetPassword(input.Password); err != nil {
			return nil, err
		}
	}
	if input.Role != nil {
		nextRole := strings.TrimSpace(*input.Role)
		switch nextRole {
		case RoleUser, RoleChannelPartner, RoleAgent, RoleDistributor:
			if user.Role == RoleAdmin {
				return nil, errors.New("cannot change admin role")
			}
			user.Role = nextRole
		default:
			return nil, errors.New("invalid role")
		}
	}

	if input.Username != nil {
		user.Username = *input.Username
	}
	if input.Notes != nil {
		user.Notes = *input.Notes
	}

	if input.Status != "" {
		user.Status = input.Status
	}

	if input.Concurrency != nil {
		user.Concurrency = *input.Concurrency
	}
	if input.IsKeyAccount != nil {
		user.IsKeyAccount = *input.IsKeyAccount
	}
	if input.KeyAccountLevel != nil {
		user.KeyAccountLevel = strings.TrimSpace(*input.KeyAccountLevel)
		if user.KeyAccountLevel == "" {
			user.KeyAccountLevel = "standard"
		}
	}
	if input.KeyAccountDiscountRate != nil {
		user.KeyAccountDiscountRate = *input.KeyAccountDiscountRate
	}
	if input.KeyAccountRebateRate != nil {
		user.KeyAccountRebateRate = *input.KeyAccountRebateRate
	}
	if input.KeyAccountManagerNotes != nil {
		user.KeyAccountManagerNotes = *input.KeyAccountManagerNotes
	}
	if input.ChannelPartnerID != nil {
		user.ChannelPartnerID = *input.ChannelPartnerID
	}
	if input.AgentOwnerID != nil {
		user.AgentOwnerID = *input.AgentOwnerID
	}
	if input.DistributorOwnerID != nil {
		user.DistributorOwnerID = *input.DistributorOwnerID
	}

	if input.AllowedGroups != nil {
		user.AllowedGroups = *input.AllowedGroups
	}

	if err := s.userRepo.Update(ctx, user); err != nil {
		return nil, err
	}

	// 同步用户专属分组倍率
	if input.GroupRates != nil && s.userGroupRateRepo != nil {
		if err := s.userGroupRateRepo.SyncUserGroupRates(ctx, user.ID, input.GroupRates); err != nil {
			logger.LegacyPrintf("service.admin", "failed to sync user group rates: user_id=%d err=%v", user.ID, err)
		}
	}

	if s.authCacheInvalidator != nil {
		if user.Concurrency != oldConcurrency || user.Status != oldStatus || user.Role != oldRole {
			s.authCacheInvalidator.InvalidateAuthCacheByUserID(ctx, user.ID)
		}
	}

	concurrencyDiff := user.Concurrency - oldConcurrency
	if concurrencyDiff != 0 {
		code, err := GenerateRedeemCode()
		if err != nil {
			logger.LegacyPrintf("service.admin", "failed to generate adjustment redeem code: %v", err)
			return user, nil
		}
		adjustmentRecord := &RedeemCode{
			Code:   code,
			Type:   AdjustmentTypeAdminConcurrency,
			Value:  float64(concurrencyDiff),
			Status: StatusUsed,
			UsedBy: &user.ID,
		}
		now := time.Now()
		adjustmentRecord.UsedAt = &now
		if err := s.redeemCodeRepo.Create(ctx, adjustmentRecord); err != nil {
			logger.LegacyPrintf("service.admin", "failed to create concurrency adjustment redeem code: %v", err)
		}
	}

	return user, nil
}

func (s *adminServiceImpl) DeleteUser(ctx context.Context, id int64) error {
	// Protect admin users: cannot delete admin accounts
	user, err := s.userRepo.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if user.Role == "admin" {
		return errors.New("cannot delete admin user")
	}
	if err := s.userRepo.Delete(ctx, id); err != nil {
		logger.LegacyPrintf("service.admin", "delete user failed: user_id=%d err=%v", id, err)
		return err
	}
	if s.authCacheInvalidator != nil {
		s.authCacheInvalidator.InvalidateAuthCacheByUserID(ctx, id)
	}
	return nil
}

func (s *adminServiceImpl) UpdateUserBalance(ctx context.Context, userID int64, balance float64, operation string, notes string) (*User, error) {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}

	oldBalance := user.Balance

	switch operation {
	case "set":
		user.Balance = balance
	case "add":
		user.Balance += balance
	case "subtract":
		user.Balance -= balance
	}

	if user.Balance < 0 {
		return nil, fmt.Errorf("balance cannot be negative, current balance: %.2f, requested operation would result in: %.2f", oldBalance, user.Balance)
	}

	if err := s.userRepo.Update(ctx, user); err != nil {
		return nil, err
	}
	balanceDiff := user.Balance - oldBalance
	if s.authCacheInvalidator != nil && balanceDiff != 0 {
		s.authCacheInvalidator.InvalidateAuthCacheByUserID(ctx, userID)
	}

	if s.billingCacheService != nil {
		go func() {
			cacheCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := s.billingCacheService.InvalidateUserBalance(cacheCtx, userID); err != nil {
				logger.LegacyPrintf("service.admin", "invalidate user balance cache failed: user_id=%d err=%v", userID, err)
			}
		}()
	}

	if balanceDiff != 0 {
		code, err := GenerateRedeemCode()
		if err != nil {
			logger.LegacyPrintf("service.admin", "failed to generate adjustment redeem code: %v", err)
			return user, nil
		}

		adjustmentRecord := &RedeemCode{
			Code:   code,
			Type:   AdjustmentTypeAdminBalance,
			Value:  balanceDiff,
			Status: StatusUsed,
			UsedBy: &user.ID,
			Notes:  notes,
		}
		now := time.Now()
		adjustmentRecord.UsedAt = &now

		if err := s.redeemCodeRepo.Create(ctx, adjustmentRecord); err != nil {
			logger.LegacyPrintf("service.admin", "failed to create balance adjustment redeem code: %v", err)
		}
	}

	return user, nil
}

func (s *adminServiceImpl) GetUserAPIKeys(ctx context.Context, userID int64, page, pageSize int, sortBy, sortOrder string) ([]APIKey, int64, error) {
	params := pagination.PaginationParams{Page: page, PageSize: pageSize, SortBy: sortBy, SortOrder: sortOrder}
	keys, result, err := s.apiKeyRepo.ListByUserID(ctx, userID, params, APIKeyListFilters{})
	if err != nil {
		return nil, 0, err
	}
	return keys, result.Total, nil
}

func (s *adminServiceImpl) GetUserUsageStats(ctx context.Context, userID int64, period string) (any, error) {
	startTime, endTime, normalizedPeriod := resolveUsagePeriodRange(period, timezone.Now())
	if s.usageLogRepo == nil {
		return map[string]any{
			"period":          normalizedPeriod,
			"total_requests":  0,
			"total_cost":      0.0,
			"total_tokens":    0,
			"avg_duration_ms": 0,
		}, nil
	}
	stats, err := s.usageLogRepo.GetUserStatsAggregated(ctx, userID, startTime, endTime)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"period":          normalizedPeriod,
		"total_requests":  stats.TotalRequests,
		"total_cost":      stats.TotalActualCost,
		"total_tokens":    stats.TotalTokens,
		"avg_duration_ms": stats.AverageDurationMs,
	}, nil
}

// GetUserBalanceHistory returns paginated balance/concurrency change records for a user.
func (s *adminServiceImpl) GetUserBalanceHistory(ctx context.Context, userID int64, page, pageSize int, codeType string) ([]RedeemCode, int64, float64, error) {
	params := pagination.PaginationParams{Page: page, PageSize: pageSize}
	codes, result, err := s.redeemCodeRepo.ListByUserPaginated(ctx, userID, params, codeType)
	if err != nil {
		return nil, 0, 0, err
	}
	// Aggregate total recharged amount (only once, regardless of type filter)
	totalRecharged, err := s.redeemCodeRepo.SumPositiveBalanceByUser(ctx, userID)
	if err != nil {
		return nil, 0, 0, err
	}
	return codes, result.Total, totalRecharged, nil
}

func (s *adminServiceImpl) SyncKeyAccounts(ctx context.Context, options KeyAccountSyncOptions) (*KeyAccountSyncResult, error) {
	if s.settingService == nil {
		return nil, errors.New("setting service not configured")
	}
	settings, err := s.settingService.GetAllSettings(ctx)
	if err != nil {
		return nil, err
	}

	pageSize := options.PageSize
	if pageSize <= 0 {
		pageSize = 200
	}

	result := &KeyAccountSyncResult{
		DryRun:               options.DryRun,
		AutoUpgradeEnabled:   settings.KeyAccountAutoUpgradeEnabled,
		AutoDowngradeEnabled: settings.KeyAccountAutoDowngradeEnabled,
		Items:                make([]KeyAccountSyncItem, 0),
	}

	page := 1
	includeSubscriptions := false
	startTime := timezone.StartOfMonth(timezone.Now())
	endTime := timezone.Now()

	for {
		users, paginationResult, err := s.userRepo.ListWithFilters(ctx, pagination.PaginationParams{
			Page:      page,
			PageSize:  pageSize,
			SortBy:    "id",
			SortOrder: "asc",
		}, UserListFilters{
			IncludeSubscriptions: &includeSubscriptions,
		})
		if err != nil {
			return nil, err
		}
		if len(users) == 0 {
			break
		}

		userIDs := make([]int64, 0, len(users))
		for _, user := range users {
			if user.Role == RoleAdmin {
				continue
			}
			userIDs = append(userIDs, user.ID)
		}

		usageByUser := map[int64]float64{}
		if s.usageLogRepo != nil && len(userIDs) > 0 {
			batchStats, batchErr := s.usageLogRepo.GetBatchUserUsageStats(ctx, userIDs, startTime, endTime)
			if batchErr != nil {
				return nil, batchErr
			}
			for userID, stats := range batchStats {
				if stats != nil {
					usageByUser[userID] = stats.TotalActualCost
				}
			}
		}

		for i := range users {
			user := &users[i]
			if user.Role == RoleAdmin {
				continue
			}
			result.Scanned++
			monthlyActualCost := usageByUser[user.ID]
			currentLevel := normalizeKeyAccountLevel(user.KeyAccountLevel)
			targetLevel := resolveTargetKeyAccountLevel(user.TotalRecharged, monthlyActualCost, settings)
			targetIsKeyAccount := targetLevel != "standard"
			reason := buildKeyAccountSyncReason(user.TotalRecharged, monthlyActualCost, settings, targetLevel)

			shouldChange, action := evaluateKeyAccountTransition(
				user.IsKeyAccount,
				currentLevel,
				targetIsKeyAccount,
				targetLevel,
				settings.KeyAccountAutoUpgradeEnabled,
				settings.KeyAccountAutoDowngradeEnabled,
			)
			if !shouldChange {
				continue
			}

			result.Eligible++
			item := KeyAccountSyncItem{
				UserID:             user.ID,
				Email:              user.Email,
				BeforeIsKeyAccount: user.IsKeyAccount,
				AfterIsKeyAccount:  targetIsKeyAccount,
				BeforeLevel:        currentLevel,
				AfterLevel:         targetLevel,
				TotalRecharged:     user.TotalRecharged,
				MonthlyActualCost:  monthlyActualCost,
				Action:             action,
				Reason:             reason,
			}

			if options.DryRun {
				result.Items = append(result.Items, item)
				result.Changed++
				applyKeyAccountSyncCounters(result, item)
				continue
			}

			updatedUser := *user
			updatedUser.IsKeyAccount = targetIsKeyAccount
			updatedUser.KeyAccountLevel = targetLevel

			applyDefaults := shouldApplyKeyAccountDefaultStrategy(*user, currentLevel, targetLevel, settings)
			item.AppliedDefaultStrategy = applyDefaults
			if targetLevel == "standard" {
				updatedUser.KeyAccountDiscountRate = 1
				updatedUser.KeyAccountRebateRate = 0
				item.AppliedDefaultStrategy = true
			} else if applyDefaults {
				discountRate, rebateRate := resolveKeyAccountDefaultStrategy(targetLevel, settings)
				updatedUser.KeyAccountDiscountRate = discountRate
				updatedUser.KeyAccountRebateRate = rebateRate
			}

			if err := s.userRepo.Update(ctx, &updatedUser); err != nil {
				item.Error = err.Error()
				result.Failed++
				result.Items = append(result.Items, item)
				continue
			}

			result.Changed++
			applyKeyAccountSyncCounters(result, item)
			result.Items = append(result.Items, item)
		}

		if paginationResult == nil || page >= paginationResult.Pages {
			break
		}
		page++
	}

	return result, nil
}

func resolveUsagePeriodRange(period string, now time.Time) (time.Time, time.Time, string) {
	normalized := strings.ToLower(strings.TrimSpace(period))
	switch normalized {
	case "day", "today":
		return timezone.Today(), now, "day"
	case "week":
		return timezone.StartOfWeek(now), now, "week"
	case "all", "total":
		return time.Time{}, now, "all"
	case "month", "":
		fallthrough
	default:
		return timezone.StartOfMonth(now), now, "month"
	}
}

func normalizeKeyAccountLevel(level string) string {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "vip":
		return "vip"
	case "enterprise":
		return "enterprise"
	default:
		return "standard"
	}
}

func resolveTargetKeyAccountLevel(totalRecharged, monthlyActualCost float64, settings *SystemSettings) string {
	if totalRecharged >= settings.KeyAccountEnterpriseRechargeThreshold ||
		monthlyActualCost >= settings.KeyAccountEnterpriseMonthlyCostThreshold {
		return "enterprise"
	}
	if totalRecharged >= settings.KeyAccountVIPRechargeThreshold ||
		monthlyActualCost >= settings.KeyAccountVIPMonthlyCostThreshold {
		return "vip"
	}
	return "standard"
}

func buildKeyAccountSyncReason(totalRecharged, monthlyActualCost float64, settings *SystemSettings, level string) string {
	reasons := make([]string, 0, 2)
	switch level {
	case "enterprise":
		if totalRecharged >= settings.KeyAccountEnterpriseRechargeThreshold {
			reasons = append(reasons, "enterprise_recharge_threshold")
		}
		if monthlyActualCost >= settings.KeyAccountEnterpriseMonthlyCostThreshold {
			reasons = append(reasons, "enterprise_monthly_cost_threshold")
		}
	case "vip":
		if totalRecharged >= settings.KeyAccountVIPRechargeThreshold {
			reasons = append(reasons, "vip_recharge_threshold")
		}
		if monthlyActualCost >= settings.KeyAccountVIPMonthlyCostThreshold {
			reasons = append(reasons, "vip_monthly_cost_threshold")
		}
	}
	if len(reasons) == 0 {
		return "below_all_thresholds"
	}
	return strings.Join(reasons, ",")
}

func evaluateKeyAccountTransition(currentIsKey bool, currentLevel string, targetIsKey bool, targetLevel string, autoUpgradeEnabled, autoDowngradeEnabled bool) (bool, string) {
	currentRank := keyAccountLevelRank(currentLevel)
	targetRank := keyAccountLevelRank(targetLevel)

	if targetRank > currentRank {
		if !autoUpgradeEnabled {
			return false, ""
		}
		if !currentIsKey && targetIsKey {
			return true, "promote"
		}
		return true, "upgrade"
	}
	if targetRank < currentRank {
		if !autoDowngradeEnabled {
			return false, ""
		}
		if currentIsKey && !targetIsKey {
			return true, "remove"
		}
		return true, "downgrade"
	}
	if currentIsKey != targetIsKey {
		if targetIsKey {
			if !autoUpgradeEnabled {
				return false, ""
			}
			return true, "promote"
		}
		if !autoDowngradeEnabled {
			return false, ""
		}
		return true, "remove"
	}
	return false, ""
}

func keyAccountLevelRank(level string) int {
	switch normalizeKeyAccountLevel(level) {
	case "vip":
		return 1
	case "enterprise":
		return 2
	default:
		return 0
	}
}

func resolveKeyAccountDefaultStrategy(level string, settings *SystemSettings) (float64, float64) {
	switch normalizeKeyAccountLevel(level) {
	case "enterprise":
		return settings.KeyAccountEnterpriseDefaultDiscountRate, settings.KeyAccountEnterpriseDefaultRebateRate
	case "vip":
		return settings.KeyAccountVIPDefaultDiscountRate, settings.KeyAccountVIPDefaultRebateRate
	default:
		return 1, 0
	}
}

func shouldApplyKeyAccountDefaultStrategy(user User, currentLevel, targetLevel string, settings *SystemSettings) bool {
	if !user.IsKeyAccount {
		return true
	}
	currentDiscount, currentRebate := resolveKeyAccountDefaultStrategy(currentLevel, settings)
	return almostEqualFloat(user.KeyAccountDiscountRate, currentDiscount) && almostEqualFloat(user.KeyAccountRebateRate, currentRebate)
}

func almostEqualFloat(a, b float64) bool {
	return math.Abs(a-b) < 0.000001
}

func applyKeyAccountSyncCounters(result *KeyAccountSyncResult, item KeyAccountSyncItem) {
	switch item.Action {
	case "promote":
		result.PromotedToKeyAccount++
		result.Upgraded++
	case "upgrade":
		result.Upgraded++
	case "downgrade":
		result.Downgraded++
	case "remove":
		result.RemovedFromKeyAccount++
		result.Downgraded++
	}
	if item.AppliedDefaultStrategy {
		result.AppliedDefaultStrategy++
	}
}

// Group management implementations
func (s *adminServiceImpl) ListGroups(ctx context.Context, page, pageSize int, platform, status, search string, isExclusive *bool, sortBy, sortOrder string) ([]Group, int64, error) {
	params := pagination.PaginationParams{Page: page, PageSize: pageSize, SortBy: sortBy, SortOrder: sortOrder}
	groups, result, err := s.groupRepo.ListWithFilters(ctx, params, platform, status, search, isExclusive)
	if err != nil {
		return nil, 0, err
	}
	return groups, result.Total, nil
}

func (s *adminServiceImpl) GetAllGroups(ctx context.Context) ([]Group, error) {
	return s.groupRepo.ListActive(ctx)
}

func (s *adminServiceImpl) GetAllGroupsByPlatform(ctx context.Context, platform string) ([]Group, error) {
	return s.groupRepo.ListActiveByPlatform(ctx, platform)
}

func (s *adminServiceImpl) GetGroup(ctx context.Context, id int64) (*Group, error) {
	return s.groupRepo.GetByID(ctx, id)
}

func (s *adminServiceImpl) CreateGroup(ctx context.Context, input *CreateGroupInput) (*Group, error) {
	platform := input.Platform
	if platform == "" {
		platform = PlatformAnthropic
	}
	routingProfile := normalizeGroupRoutingProfile(input.RoutingProfile)

	subscriptionType := input.SubscriptionType
	if subscriptionType == "" {
		subscriptionType = SubscriptionTypeStandard
	}

	// Limit fields: nil/negative means unlimited, zero means blocked, positive values are explicit limits.
	dailyLimit := normalizeLimit(input.DailyLimitUSD)
	weeklyLimit := normalizeLimit(input.WeeklyLimitUSD)
	monthlyLimit := normalizeLimit(input.MonthlyLimitUSD)

	// 图片价格：负数表示清除（使用默认价格），0 保留（表示免费）
	imagePrice1K := normalizePrice(input.ImagePrice1K)
	imagePrice2K := normalizePrice(input.ImagePrice2K)
	imagePrice4K := normalizePrice(input.ImagePrice4K)

	// 校验降级分组
	if input.FallbackGroupID != nil {
		if err := s.validateFallbackGroup(ctx, 0, *input.FallbackGroupID); err != nil {
			return nil, err
		}
	}
	fallbackOnInvalidRequest := input.FallbackGroupIDOnInvalidRequest
	if fallbackOnInvalidRequest != nil && *fallbackOnInvalidRequest <= 0 {
		fallbackOnInvalidRequest = nil
	}
	// 校验无效请求兜底分组
	if fallbackOnInvalidRequest != nil {
		if err := s.validateFallbackGroupOnInvalidRequest(ctx, 0, platform, subscriptionType, *fallbackOnInvalidRequest); err != nil {
			return nil, err
		}
	}

	// MCPXMLInject defaults to true and only turns off when explicitly set to false.
	mcpXMLInject := true
	if input.MCPXMLInject != nil {
		mcpXMLInject = *input.MCPXMLInject
	}

	// 如果指定了复制账号的源分组，先获取账�?ID 列表
	var accountIDsToCopy []int64
	if len(input.CopyAccountsFromGroupIDs) > 0 {
		// De-duplicate source group IDs.
		seen := make(map[int64]struct{})
		uniqueSourceGroupIDs := make([]int64, 0, len(input.CopyAccountsFromGroupIDs))
		for _, srcGroupID := range input.CopyAccountsFromGroupIDs {
			if _, exists := seen[srcGroupID]; !exists {
				seen[srcGroupID] = struct{}{}
				uniqueSourceGroupIDs = append(uniqueSourceGroupIDs, srcGroupID)
			}
		}

		// Validate that source groups use the same platform as the new group.
		for _, srcGroupID := range uniqueSourceGroupIDs {
			srcGroup, err := s.groupRepo.GetByIDLite(ctx, srcGroupID)
			if err != nil {
				return nil, fmt.Errorf("source group %d not found: %w", srcGroupID, err)
			}
			if srcGroup.Platform != platform {
				return nil, fmt.Errorf("source group %d platform mismatch: expected %s, got %s", srcGroupID, platform, srcGroup.Platform)
			}
		}

		// Load all accounts from the source groups.
		var err error
		accountIDsToCopy, err = s.groupRepo.GetAccountIDsByGroupIDs(ctx, uniqueSourceGroupIDs)
		if err != nil {
			return nil, fmt.Errorf("failed to get accounts from source groups: %w", err)
		}
	}

	group := &Group{
		Name:                            input.Name,
		Description:                     input.Description,
		Platform:                        platform,
		RoutingProfile:                  routingProfile,
		RateMultiplier:                  input.RateMultiplier,
		IsExclusive:                     input.IsExclusive,
		Status:                          StatusActive,
		SubscriptionType:                subscriptionType,
		DailyLimitUSD:                   dailyLimit,
		WeeklyLimitUSD:                  weeklyLimit,
		MonthlyLimitUSD:                 monthlyLimit,
		ImagePrice1K:                    imagePrice1K,
		ImagePrice2K:                    imagePrice2K,
		ImagePrice4K:                    imagePrice4K,
		ClaudeCodeOnly:                  input.ClaudeCodeOnly,
		FallbackGroupID:                 input.FallbackGroupID,
		FallbackGroupIDOnInvalidRequest: fallbackOnInvalidRequest,
		ModelRouting:                    input.ModelRouting,
		MCPXMLInject:                    mcpXMLInject,
		SupportedModelScopes:            input.SupportedModelScopes,
		AllowMessagesDispatch:           input.AllowMessagesDispatch,
		RequireOAuthOnly:                input.RequireOAuthOnly,
		RequirePrivacySet:               input.RequirePrivacySet,
		DefaultMappedModel:              input.DefaultMappedModel,
		MessagesDispatchModelConfig:     normalizeOpenAIMessagesDispatchModelConfig(input.MessagesDispatchModelConfig),
	}
	sanitizeGroupMessagesDispatchFields(group)
	if err := s.groupRepo.Create(ctx, group); err != nil {
		return nil, err
	}

	// require_oauth_only: filter out API key accounts.
	if group.RequireOAuthOnly && (group.Platform == PlatformOpenAI || group.Platform == PlatformAntigravity || group.Platform == PlatformAnthropic || group.Platform == PlatformGemini) && len(accountIDsToCopy) > 0 {
		accounts, err := s.accountRepo.GetByIDs(ctx, accountIDsToCopy)
		if err != nil {
			return nil, fmt.Errorf("failed to fetch accounts for oauth filter: %w", err)
		}
		oauthIDs := make(map[int64]struct{}, len(accounts))
		for _, acc := range accounts {
			if acc.Type != AccountTypeAPIKey {
				oauthIDs[acc.ID] = struct{}{}
			}
		}
		var filtered []int64
		for _, aid := range accountIDsToCopy {
			if _, ok := oauthIDs[aid]; ok {
				filtered = append(filtered, aid)
			}
		}
		accountIDsToCopy = filtered
	}

	// Bind copied accounts to the new group if any were collected.
	if len(accountIDsToCopy) > 0 {
		if err := s.groupRepo.BindAccountsToGroup(ctx, group.ID, accountIDsToCopy); err != nil {
			return nil, fmt.Errorf("failed to bind accounts to new group: %w", err)
		}
		group.AccountCount = int64(len(accountIDsToCopy))
	}

	return group, nil
}

// normalizeLimit 将负数转换为 nil（表示无限制），0 保留（表示限额为零）
func normalizeLimit(limit *float64) *float64 {
	if limit == nil || *limit < 0 {
		return nil
	}
	return limit
}

// normalizePrice turns negative values into nil, while zero still means free.
func normalizePrice(price *float64) *float64 {
	if price == nil || *price < 0 {
		return nil
	}
	return price
}

func normalizeGroupRoutingProfile(profile string) string {
	switch strings.ToLower(strings.TrimSpace(profile)) {
	case GroupRoutingProfileDomestic:
		return GroupRoutingProfileDomestic
	case GroupRoutingProfileMixed:
		return GroupRoutingProfileMixed
	default:
		return GroupRoutingProfileOverseas
	}
}

// validateFallbackGroup validates the configured fallback group chain.
func (s *adminServiceImpl) validateFallbackGroup(ctx context.Context, currentGroupID, fallbackGroupID int64) error {
	// 不能将自己设置为降级分组
	if currentGroupID > 0 && currentGroupID == fallbackGroupID {
		return fmt.Errorf("cannot set self as fallback group")
	}

	visited := map[int64]struct{}{}
	nextID := fallbackGroupID
	for {
		if _, seen := visited[nextID]; seen {
			return fmt.Errorf("fallback group cycle detected")
		}
		visited[nextID] = struct{}{}
		if currentGroupID > 0 && nextID == currentGroupID {
			return fmt.Errorf("fallback group cycle detected")
		}

		// Ensure the fallback group exists.
		fallbackGroup, err := s.groupRepo.GetByIDLite(ctx, nextID)
		if err != nil {
			return fmt.Errorf("fallback group not found: %w", err)
		}

		// The first fallback group cannot enable claude_code_only, otherwise it may dead-loop.
		if nextID == fallbackGroupID && fallbackGroup.ClaudeCodeOnly {
			return fmt.Errorf("fallback group cannot have claude_code_only enabled")
		}

		if fallbackGroup.FallbackGroupID == nil {
			return nil
		}
		nextID = *fallbackGroup.FallbackGroupID
	}
}

// validateFallbackGroupOnInvalidRequest validates the fallback group used for invalid requests.
func (s *adminServiceImpl) validateFallbackGroupOnInvalidRequest(ctx context.Context, currentGroupID int64, platform, subscriptionType string, fallbackGroupID int64) error {
	if platform != PlatformAnthropic && platform != PlatformAntigravity {
		return fmt.Errorf("invalid request fallback only supported for anthropic or antigravity groups")
	}
	if subscriptionType == SubscriptionTypeSubscription {
		return fmt.Errorf("subscription groups cannot set invalid request fallback")
	}
	if currentGroupID > 0 && currentGroupID == fallbackGroupID {
		return fmt.Errorf("cannot set self as invalid request fallback group")
	}

	fallbackGroup, err := s.groupRepo.GetByIDLite(ctx, fallbackGroupID)
	if err != nil {
		return fmt.Errorf("fallback group not found: %w", err)
	}
	if fallbackGroup.Platform != PlatformAnthropic {
		return fmt.Errorf("fallback group must be anthropic platform")
	}
	if fallbackGroup.SubscriptionType == SubscriptionTypeSubscription {
		return fmt.Errorf("fallback group cannot be subscription type")
	}
	if fallbackGroup.FallbackGroupIDOnInvalidRequest != nil {
		return fmt.Errorf("fallback group cannot have invalid request fallback configured")
	}
	return nil
}

func (s *adminServiceImpl) UpdateGroup(ctx context.Context, id int64, input *UpdateGroupInput) (*Group, error) {
	group, err := s.groupRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if input.Name != "" {
		group.Name = input.Name
	}
	if input.Description != "" {
		group.Description = input.Description
	}
	if input.Platform != "" {
		group.Platform = input.Platform
	}
	if input.RoutingProfile != "" {
		group.RoutingProfile = normalizeGroupRoutingProfile(input.RoutingProfile)
	}
	if input.RateMultiplier != nil {
		group.RateMultiplier = *input.RateMultiplier
	}
	if input.IsExclusive != nil {
		group.IsExclusive = *input.IsExclusive
	}
	if input.Status != "" {
		group.Status = input.Status
	}

	// 订阅相关字段
	if input.SubscriptionType != "" {
		group.SubscriptionType = input.SubscriptionType
	}
	// 限额字段：nil/负数 表示"无限�?�? 表示"不允许用�?，正数表示具体限�?	// 前端始终发送这三个字段，无需 nil 守卫
	group.DailyLimitUSD = normalizeLimit(input.DailyLimitUSD)
	group.WeeklyLimitUSD = normalizeLimit(input.WeeklyLimitUSD)
	group.MonthlyLimitUSD = normalizeLimit(input.MonthlyLimitUSD)
	// Image billing config: negative values clear the override and fall back to defaults.
	if input.ImagePrice1K != nil {
		group.ImagePrice1K = normalizePrice(input.ImagePrice1K)
	}
	if input.ImagePrice2K != nil {
		group.ImagePrice2K = normalizePrice(input.ImagePrice2K)
	}
	if input.ImagePrice4K != nil {
		group.ImagePrice4K = normalizePrice(input.ImagePrice4K)
	}

	// Claude Code client restriction.
	if input.ClaudeCodeOnly != nil {
		group.ClaudeCodeOnly = *input.ClaudeCodeOnly
	}
	if input.FallbackGroupID != nil {
		// 校验降级分组
		if *input.FallbackGroupID > 0 {
			if err := s.validateFallbackGroup(ctx, id, *input.FallbackGroupID); err != nil {
				return nil, err
			}
			group.FallbackGroupID = input.FallbackGroupID
		} else {
			// Zero or negative values clear the fallback group.
			group.FallbackGroupID = nil
		}
	}
	fallbackOnInvalidRequest := group.FallbackGroupIDOnInvalidRequest
	if input.FallbackGroupIDOnInvalidRequest != nil {
		if *input.FallbackGroupIDOnInvalidRequest > 0 {
			fallbackOnInvalidRequest = input.FallbackGroupIDOnInvalidRequest
		} else {
			fallbackOnInvalidRequest = nil
		}
	}
	if fallbackOnInvalidRequest != nil {
		if err := s.validateFallbackGroupOnInvalidRequest(ctx, id, group.Platform, group.SubscriptionType, *fallbackOnInvalidRequest); err != nil {
			return nil, err
		}
	}
	group.FallbackGroupIDOnInvalidRequest = fallbackOnInvalidRequest

	// 模型路由配置
	if input.ModelRouting != nil {
		group.ModelRouting = input.ModelRouting
	}
	if input.ModelRoutingEnabled != nil {
		group.ModelRoutingEnabled = *input.ModelRoutingEnabled
	}
	if input.MCPXMLInject != nil {
		group.MCPXMLInject = *input.MCPXMLInject
	}

	// Supported model scopes for Antigravity groups.
	if input.SupportedModelScopes != nil {
		group.SupportedModelScopes = *input.SupportedModelScopes
	}

	// OpenAI Messages 调度配置
	if input.AllowMessagesDispatch != nil {
		group.AllowMessagesDispatch = *input.AllowMessagesDispatch
	}
	if input.RequireOAuthOnly != nil {
		group.RequireOAuthOnly = *input.RequireOAuthOnly
	}
	if input.RequirePrivacySet != nil {
		group.RequirePrivacySet = *input.RequirePrivacySet
	}
	if input.DefaultMappedModel != nil {
		group.DefaultMappedModel = *input.DefaultMappedModel
	}
	if input.MessagesDispatchModelConfig != nil {
		group.MessagesDispatchModelConfig = normalizeOpenAIMessagesDispatchModelConfig(*input.MessagesDispatchModelConfig)
	}
	sanitizeGroupMessagesDispatchFields(group)

	if err := s.groupRepo.Update(ctx, group); err != nil {
		return nil, err
	}

	// If source groups are provided, replace current account bindings with the copied set.
	if len(input.CopyAccountsFromGroupIDs) > 0 {
		// De-duplicate source group IDs.
		seen := make(map[int64]struct{})
		uniqueSourceGroupIDs := make([]int64, 0, len(input.CopyAccountsFromGroupIDs))
		for _, srcGroupID := range input.CopyAccountsFromGroupIDs {
			// The source group cannot be the same as the target group itself.
			if srcGroupID == id {
				return nil, fmt.Errorf("cannot copy accounts from self")
			}
			// 去重
			if _, exists := seen[srcGroupID]; !exists {
				seen[srcGroupID] = struct{}{}
				uniqueSourceGroupIDs = append(uniqueSourceGroupIDs, srcGroupID)
			}
		}

		// Validate that source groups use the same platform as the target group.
		for _, srcGroupID := range uniqueSourceGroupIDs {
			srcGroup, err := s.groupRepo.GetByIDLite(ctx, srcGroupID)
			if err != nil {
				return nil, fmt.Errorf("source group %d not found: %w", srcGroupID, err)
			}
			if srcGroup.Platform != group.Platform {
				return nil, fmt.Errorf("source group %d platform mismatch: expected %s, got %s", srcGroupID, group.Platform, srcGroup.Platform)
			}
		}

		// Load all account IDs from the source groups.
		accountIDsToCopy, err := s.groupRepo.GetAccountIDsByGroupIDs(ctx, uniqueSourceGroupIDs)
		if err != nil {
			return nil, fmt.Errorf("failed to get accounts from source groups: %w", err)
		}

		// Clear existing account bindings before rebinding the copied set.
		if _, err := s.groupRepo.DeleteAccountGroupsByGroupID(ctx, id); err != nil {
			return nil, fmt.Errorf("failed to clear existing account bindings: %w", err)
		}

		// require_oauth_only: filter out API key accounts.
		if group.RequireOAuthOnly && (group.Platform == PlatformOpenAI || group.Platform == PlatformAntigravity || group.Platform == PlatformAnthropic || group.Platform == PlatformGemini) && len(accountIDsToCopy) > 0 {
			accounts, err := s.accountRepo.GetByIDs(ctx, accountIDsToCopy)
			if err != nil {
				return nil, fmt.Errorf("failed to fetch accounts for oauth filter: %w", err)
			}
			oauthIDs := make(map[int64]struct{}, len(accounts))
			for _, acc := range accounts {
				if acc.Type != AccountTypeAPIKey {
					oauthIDs[acc.ID] = struct{}{}
				}
			}
			var filtered []int64
			for _, aid := range accountIDsToCopy {
				if _, ok := oauthIDs[aid]; ok {
					filtered = append(filtered, aid)
				}
			}
			accountIDsToCopy = filtered
		}

		// Bind the copied accounts after filtering.
		if len(accountIDsToCopy) > 0 {
			if err := s.groupRepo.BindAccountsToGroup(ctx, id, accountIDsToCopy); err != nil {
				return nil, fmt.Errorf("failed to bind accounts to group: %w", err)
			}
		}
	}

	if s.authCacheInvalidator != nil {
		s.authCacheInvalidator.InvalidateAuthCacheByGroupID(ctx, id)
	}
	return group, nil
}

func (s *adminServiceImpl) DeleteGroup(ctx context.Context, id int64) error {
	var groupKeys []string
	if s.authCacheInvalidator != nil {
		keys, err := s.apiKeyRepo.ListKeysByGroupID(ctx, id)
		if err == nil {
			groupKeys = keys
		}
	}

	affectedUserIDs, err := s.groupRepo.DeleteCascade(ctx, id)
	if err != nil {
		return err
	}
	// 注意：user_group_rate_multipliers 表通过外键 ON DELETE CASCADE 自动清理

	// 事务成功后，异步失效受影响用户的订阅缓存
	if len(affectedUserIDs) > 0 && s.billingCacheService != nil {
		groupID := id
		go func() {
			cacheCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			for _, userID := range affectedUserIDs {
				if err := s.billingCacheService.InvalidateSubscription(cacheCtx, userID, groupID); err != nil {
					logger.LegacyPrintf("service.admin", "invalidate subscription cache failed: user_id=%d group_id=%d err=%v", userID, groupID, err)
				}
			}
		}()
	}
	if s.authCacheInvalidator != nil {
		for _, key := range groupKeys {
			s.authCacheInvalidator.InvalidateAuthCacheByKey(ctx, key)
		}
	}

	return nil
}

func (s *adminServiceImpl) GetGroupAPIKeys(ctx context.Context, groupID int64, page, pageSize int) ([]APIKey, int64, error) {
	params := pagination.PaginationParams{Page: page, PageSize: pageSize}
	keys, result, err := s.apiKeyRepo.ListByGroupID(ctx, groupID, params)
	if err != nil {
		return nil, 0, err
	}
	return keys, result.Total, nil
}

func (s *adminServiceImpl) GetGroupRateMultipliers(ctx context.Context, groupID int64) ([]UserGroupRateEntry, error) {
	if s.userGroupRateRepo == nil {
		return nil, nil
	}
	return s.userGroupRateRepo.GetByGroupID(ctx, groupID)
}

func (s *adminServiceImpl) ClearGroupRateMultipliers(ctx context.Context, groupID int64) error {
	if s.userGroupRateRepo == nil {
		return nil
	}
	return s.userGroupRateRepo.DeleteByGroupID(ctx, groupID)
}

func (s *adminServiceImpl) BatchSetGroupRateMultipliers(ctx context.Context, groupID int64, entries []GroupRateMultiplierInput) error {
	if s.userGroupRateRepo == nil {
		return nil
	}
	return s.userGroupRateRepo.SyncGroupRateMultipliers(ctx, groupID, entries)
}

func (s *adminServiceImpl) UpdateGroupSortOrders(ctx context.Context, updates []GroupSortOrderUpdate) error {
	return s.groupRepo.UpdateSortOrders(ctx, updates)
}

// AdminUpdateAPIKeyGroupID updates the group bound to an API key.
// groupID: nil keeps current binding, 0 unbinds, positive values bind to that group.
func (s *adminServiceImpl) AdminUpdateAPIKeyGroupID(ctx context.Context, keyID int64, groupID *int64) (*AdminUpdateAPIKeyGroupIDResult, error) {
	apiKey, err := s.apiKeyRepo.GetByID(ctx, keyID)
	if err != nil {
		return nil, err
	}

	if groupID == nil {
		// nil 表示不修改，直接返回
		return &AdminUpdateAPIKeyGroupIDResult{APIKey: apiKey}, nil
	}

	if *groupID < 0 {
		return nil, infraerrors.BadRequest("INVALID_GROUP_ID", "group_id must be non-negative")
	}

	result := &AdminUpdateAPIKeyGroupIDResult{}

	if *groupID == 0 {
		// 0 means unbind the group without changing user_allowed_groups.
		apiKey.GroupID = nil
		apiKey.Group = nil
	} else {
		// 验证目标分组存在且状态为 active
		group, err := s.groupRepo.GetByID(ctx, *groupID)
		if err != nil {
			return nil, err
		}
		if group.Status != StatusActive {
			return nil, infraerrors.BadRequest("GROUP_NOT_ACTIVE", "target group is not active")
		}
		// 订阅类型分组：用户须持有该分组的有效订阅才可绑定
		if group.IsSubscriptionType() {
			if s.userSubRepo == nil {
				return nil, infraerrors.InternalServer("SUBSCRIPTION_REPOSITORY_UNAVAILABLE", "subscription repository is not configured")
			}
			if _, err := s.userSubRepo.GetActiveByUserIDAndGroupID(ctx, apiKey.UserID, *groupID); err != nil {
				if errors.Is(err, ErrSubscriptionNotFound) {
					return nil, infraerrors.BadRequest("SUBSCRIPTION_REQUIRED", "user does not have an active subscription for this group")
				}
				return nil, err
			}
		}

		gid := *groupID
		apiKey.GroupID = &gid
		apiKey.Group = group

		// For exclusive standard groups, keep the group grant and API key update atomic.
		if group.IsExclusive && !group.IsSubscriptionType() {
			opCtx := ctx
			var tx *dbent.Tx
			if s.entClient == nil {
				logger.LegacyPrintf("service.admin", "Warning: entClient is nil, skipping transaction protection for exclusive group binding")
			} else {
				var txErr error
				tx, txErr = s.entClient.Tx(ctx)
				if txErr != nil {
					return nil, fmt.Errorf("begin transaction: %w", txErr)
				}
				defer func() { _ = tx.Rollback() }()
				opCtx = dbent.NewTxContext(ctx, tx)
			}

			if addErr := s.userRepo.AddGroupToAllowedGroups(opCtx, apiKey.UserID, gid); addErr != nil {
				return nil, fmt.Errorf("add group to user allowed groups: %w", addErr)
			}
			if err := s.apiKeyRepo.Update(opCtx, apiKey); err != nil {
				return nil, fmt.Errorf("update api key: %w", err)
			}
			if tx != nil {
				if err := tx.Commit(); err != nil {
					return nil, fmt.Errorf("commit transaction: %w", err)
				}
			}

			result.AutoGrantedGroupAccess = true
			result.GrantedGroupID = &gid
			result.GrantedGroupName = group.Name

			// 失效认证缓存（在事务提交后执行）
			if s.authCacheInvalidator != nil {
				s.authCacheInvalidator.InvalidateAuthCacheByKey(ctx, apiKey.Key)
			}

			result.APIKey = apiKey
			return result, nil
		}
	}

	// For non-exclusive groups or unbinds, a single update is enough.
	if err := s.apiKeyRepo.Update(ctx, apiKey); err != nil {
		return nil, fmt.Errorf("update api key: %w", err)
	}

	// 失效认证缓存
	if s.authCacheInvalidator != nil {
		s.authCacheInvalidator.InvalidateAuthCacheByKey(ctx, apiKey.Key)
	}

	result.APIKey = apiKey
	return result, nil
}

// ReplaceUserGroup swaps a user's exclusive group assignment.
func (s *adminServiceImpl) ReplaceUserGroup(ctx context.Context, userID, oldGroupID, newGroupID int64) (*ReplaceUserGroupResult, error) {
	if oldGroupID == newGroupID {
		return nil, infraerrors.BadRequest("SAME_GROUP", "old and new group must be different")
	}

	// 验证新分组存在且为活跃的专属标准分组
	newGroup, err := s.groupRepo.GetByID(ctx, newGroupID)
	if err != nil {
		return nil, err
	}
	if newGroup.Status != StatusActive {
		return nil, infraerrors.BadRequest("GROUP_NOT_ACTIVE", "target group is not active")
	}
	if !newGroup.IsExclusive {
		return nil, infraerrors.BadRequest("GROUP_NOT_EXCLUSIVE", "target group is not exclusive")
	}
	if newGroup.IsSubscriptionType() {
		return nil, infraerrors.BadRequest("GROUP_IS_SUBSCRIPTION", "subscription groups are not supported for replacement")
	}

	// Use a transaction so the replacement stays atomic.
	if s.entClient == nil {
		return nil, fmt.Errorf("entClient is nil, cannot perform group replacement")
	}
	tx, err := s.entClient.Tx(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	opCtx := dbent.NewTxContext(ctx, tx)

	// 1. Grant access to the new group.
	if err := s.userRepo.AddGroupToAllowedGroups(opCtx, userID, newGroupID); err != nil {
		return nil, fmt.Errorf("add new group to allowed groups: %w", err)
	}

	// 2. 迁移绑定旧分组的 Key 到新分组
	migrated, err := s.apiKeyRepo.UpdateGroupIDByUserAndGroup(opCtx, userID, oldGroupID, newGroupID)
	if err != nil {
		return nil, fmt.Errorf("migrate api keys: %w", err)
	}

	// 3. Remove access to the old group.
	if err := s.userRepo.RemoveGroupFromUserAllowedGroups(opCtx, userID, oldGroupID); err != nil {
		return nil, fmt.Errorf("remove old group from allowed groups: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit transaction: %w", err)
	}

	// Invalidate auth cache entries for all keys owned by the user.
	if s.authCacheInvalidator != nil {
		keys, keyErr := s.apiKeyRepo.ListKeysByUserID(ctx, userID)
		if keyErr == nil {
			for _, k := range keys {
				s.authCacheInvalidator.InvalidateAuthCacheByKey(ctx, k)
			}
		}
	}

	return &ReplaceUserGroupResult{MigratedKeys: migrated}, nil
}

// Account management implementations
func (s *adminServiceImpl) ListAccounts(ctx context.Context, page, pageSize int, platform, accountType, status, search string, groupID int64, privacyMode string, sortBy, sortOrder string) ([]Account, int64, error) {
	params := pagination.PaginationParams{Page: page, PageSize: pageSize, SortBy: sortBy, SortOrder: sortOrder}
	accounts, result, err := s.accountRepo.ListWithFilters(ctx, params, platform, accountType, status, search, groupID, privacyMode)
	if err != nil {
		return nil, 0, err
	}
	return accounts, result.Total, nil
}

func (s *adminServiceImpl) GetAccount(ctx context.Context, id int64) (*Account, error) {
	return s.accountRepo.GetByID(ctx, id)
}

func (s *adminServiceImpl) GetAccountsByIDs(ctx context.Context, ids []int64) ([]*Account, error) {
	if len(ids) == 0 {
		return []*Account{}, nil
	}

	accounts, err := s.accountRepo.GetByIDs(ctx, ids)
	if err != nil {
		return nil, fmt.Errorf("failed to get accounts by IDs: %w", err)
	}

	return accounts, nil
}

func (s *adminServiceImpl) CreateAccount(ctx context.Context, input *CreateAccountInput) (*Account, error) {
	// 绑定分组
	groupIDs := input.GroupIDs
	// If no group is specified, bind the platform default group automatically.
	if len(groupIDs) == 0 && !input.SkipDefaultGroupBind {
		defaultGroupName := input.Platform + "-default"
		groups, err := s.groupRepo.ListActiveByPlatform(ctx, input.Platform)
		if err == nil {
			for _, g := range groups {
				if g.Name == defaultGroupName {
					groupIDs = []int64{g.ID}
					break
				}
			}
		}
	}

	// 检查混合渠道风险（除非用户已确认）
	if len(groupIDs) > 0 && !input.SkipMixedChannelCheck {
		if err := s.checkMixedChannelRisk(ctx, 0, input.Platform, groupIDs); err != nil {
			return nil, err
		}
	}

	account := &Account{
		Name:        input.Name,
		Notes:       normalizeAccountNotes(input.Notes),
		Platform:    input.Platform,
		Type:        input.Type,
		Credentials: input.Credentials,
		Extra:       input.Extra,
		ProxyID:     input.ProxyID,
		Concurrency: input.Concurrency,
		Priority:    input.Priority,
		Status:      StatusActive,
		Schedulable: true,
	}
	// 预计算固定时间重置的下次重置时间
	if account.Extra != nil {
		if err := ValidateQuotaResetConfig(account.Extra); err != nil {
			return nil, err
		}
		ComputeQuotaResetAt(account.Extra)
	}
	if input.ExpiresAt != nil && *input.ExpiresAt > 0 {
		expiresAt := time.Unix(*input.ExpiresAt, 0)
		account.ExpiresAt = &expiresAt
	}
	if input.AutoPauseOnExpired != nil {
		account.AutoPauseOnExpired = *input.AutoPauseOnExpired
	} else {
		account.AutoPauseOnExpired = true
	}
	if input.RateMultiplier != nil {
		if *input.RateMultiplier < 0 {
			return nil, errors.New("rate_multiplier must be >= 0")
		}
		account.RateMultiplier = input.RateMultiplier
	}
	if input.LoadFactor != nil && *input.LoadFactor > 0 {
		if *input.LoadFactor > 10000 {
			return nil, errors.New("load_factor must be <= 10000")
		}
		account.LoadFactor = input.LoadFactor
	}
	if err := s.accountRepo.Create(ctx, account); err != nil {
		return nil, err
	}

	// 绑定分组
	if len(groupIDs) > 0 {
		if err := s.accountRepo.BindGroups(ctx, account.ID, groupIDs); err != nil {
			return nil, err
		}
	}

	// For OAuth accounts, apply privacy settings asynchronously after creation.
	// Use Ensure instead of Force here because new accounts are safe to initialize idempotently.
	if account.Type == AccountTypeOAuth {
		switch account.Platform {
		case PlatformOpenAI:
			go func() {
				defer func() {
					if r := recover(); r != nil {
						slog.Error("create_account_openai_privacy_panic", "account_id", account.ID, "recover", r)
					}
				}()
				s.EnsureOpenAIPrivacy(context.Background(), account)
			}()
		case PlatformAntigravity:
			go func() {
				defer func() {
					if r := recover(); r != nil {
						slog.Error("create_account_antigravity_privacy_panic", "account_id", account.ID, "recover", r)
					}
				}()
				s.EnsureAntigravityPrivacy(context.Background(), account)
			}()
		}
	}

	return account, nil
}

func (s *adminServiceImpl) UpdateAccount(ctx context.Context, id int64, input *UpdateAccountInput) (*Account, error) {
	account, err := s.accountRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	wasOveragesEnabled := account.IsOveragesEnabled()

	if input.Name != "" {
		account.Name = input.Name
	}
	if input.Type != "" {
		account.Type = input.Type
	}
	if input.Notes != nil {
		account.Notes = normalizeAccountNotes(input.Notes)
	}
	if len(input.Credentials) > 0 {
		account.Credentials = input.Credentials
	}
	// Extra uses a map so we can distinguish "not provided" from "explicitly cleared".
	// When quota limits are disabled, the frontend may submit extra:{} and we still need to persist it.
	if input.Extra != nil {
		// 保留配额用量字段，防止编辑账号时意外重置
		for _, key := range []string{"quota_used", "quota_daily_used", "quota_daily_start", "quota_weekly_used", "quota_weekly_start"} {
			if v, ok := account.Extra[key]; ok {
				input.Extra[key] = v
			}
		}
		account.Extra = input.Extra
		if account.Platform == PlatformAntigravity && wasOveragesEnabled && !account.IsOveragesEnabled() {
			delete(account.Extra, "antigravity_credits_overages") // Clean up legacy overages runtime state.
			// Clear the AICredits rate-limit key.
			if rawLimits, ok := account.Extra[modelRateLimitsKey].(map[string]any); ok {
				delete(rawLimits, creditsExhaustedKey)
			}
		}
		if account.Platform == PlatformAntigravity && !wasOveragesEnabled && account.IsOveragesEnabled() {
			delete(account.Extra, modelRateLimitsKey)
			delete(account.Extra, "antigravity_credits_overages") // Clean up legacy overages runtime state.
		}
		// Validate and pre-compute the next fixed reset time.
		if err := ValidateQuotaResetConfig(account.Extra); err != nil {
			return nil, err
		}
		ComputeQuotaResetAt(account.Extra)
	}
	if input.ProxyID != nil {
		// 0 means clear the proxy binding.
		if *input.ProxyID == 0 {
			account.ProxyID = nil
		} else {
			account.ProxyID = input.ProxyID
		}
		account.Proxy = nil // Clear the relation object to avoid overriding ProxyID during save.
	}
	// Only update Concurrency when the pointer is provided, so zero stays meaningful.
	if input.Concurrency != nil {
		account.Concurrency = *input.Concurrency
	}
	// Only update Priority when the pointer is provided, so zero stays meaningful.
	if input.Priority != nil {
		account.Priority = *input.Priority
	}
	if input.RateMultiplier != nil {
		if *input.RateMultiplier < 0 {
			return nil, errors.New("rate_multiplier must be >= 0")
		}
		account.RateMultiplier = input.RateMultiplier
	}
	if input.LoadFactor != nil {
		if *input.LoadFactor <= 0 {
			account.LoadFactor = nil // Zero or a negative value clears the load factor.
		} else if *input.LoadFactor > 10000 {
			return nil, errors.New("load_factor must be <= 10000")
		} else {
			account.LoadFactor = input.LoadFactor
		}
	}
	if input.Status != "" {
		account.Status = input.Status
	}
	if input.ExpiresAt != nil {
		if *input.ExpiresAt <= 0 {
			account.ExpiresAt = nil
		} else {
			expiresAt := time.Unix(*input.ExpiresAt, 0)
			account.ExpiresAt = &expiresAt
		}
	}
	if input.AutoPauseOnExpired != nil {
		account.AutoPauseOnExpired = *input.AutoPauseOnExpired
	}

	// Validate group IDs before applying any writes.
	if input.GroupIDs != nil {
		if err := s.validateGroupIDsExist(ctx, *input.GroupIDs); err != nil {
			return nil, err
		}

		// 检查混合渠道风险（除非用户已确认）
		if !input.SkipMixedChannelCheck {
			if err := s.checkMixedChannelRisk(ctx, account.ID, account.Platform, *input.GroupIDs); err != nil {
				return nil, err
			}
		}
	}

	if err := s.accountRepo.Update(ctx, account); err != nil {
		return nil, err
	}

	// 绑定分组
	if input.GroupIDs != nil {
		if err := s.accountRepo.BindGroups(ctx, account.ID, *input.GroupIDs); err != nil {
			return nil, err
		}
	}

	// Re-query so the response includes the latest relation state.
	updated, err := s.accountRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return updated, nil
}

// BulkUpdateAccounts updates multiple accounts in one request.
// It merges credentials/extra keys instead of overwriting the whole object.
func (s *adminServiceImpl) BulkUpdateAccounts(ctx context.Context, input *BulkUpdateAccountsInput) (*BulkUpdateAccountsResult, error) {
	result := &BulkUpdateAccountsResult{
		SuccessIDs: make([]int64, 0, len(input.AccountIDs)),
		FailedIDs:  make([]int64, 0, len(input.AccountIDs)),
		Results:    make([]BulkUpdateAccountResult, 0, len(input.AccountIDs)),
	}

	if len(input.AccountIDs) == 0 {
		return result, nil
	}
	if input.GroupIDs != nil {
		if err := s.validateGroupIDsExist(ctx, *input.GroupIDs); err != nil {
			return nil, err
		}
	}

	needMixedChannelCheck := input.GroupIDs != nil && !input.SkipMixedChannelCheck

	// Preload account platform info for mixed-channel validation.
	platformByID := map[int64]string{}
	if needMixedChannelCheck {
		accounts, err := s.accountRepo.GetByIDs(ctx, input.AccountIDs)
		if err != nil {
			return nil, err
		}
		for _, account := range accounts {
			if account != nil {
				platformByID[account.ID] = account.Platform
			}
		}
	}

	// Check mixed-channel risk before any writes are applied.
	if needMixedChannelCheck {
		for _, accountID := range input.AccountIDs {
			platform := platformByID[accountID]
			if platform == "" {
				continue
			}
			if err := s.checkMixedChannelRisk(ctx, accountID, platform, *input.GroupIDs); err != nil {
				return nil, err
			}
		}
	}

	if input.RateMultiplier != nil {
		if *input.RateMultiplier < 0 {
			return nil, errors.New("rate_multiplier must be >= 0")
		}
	}

	// Prepare bulk updates for columns and JSONB fields.
	repoUpdates := AccountBulkUpdate{
		Credentials: input.Credentials,
		Extra:       input.Extra,
	}
	if input.Name != "" {
		repoUpdates.Name = &input.Name
	}
	if input.ProxyID != nil {
		repoUpdates.ProxyID = input.ProxyID
	}
	if input.Concurrency != nil {
		repoUpdates.Concurrency = input.Concurrency
	}
	if input.Priority != nil {
		repoUpdates.Priority = input.Priority
	}
	if input.RateMultiplier != nil {
		repoUpdates.RateMultiplier = input.RateMultiplier
	}
	if input.LoadFactor != nil {
		if *input.LoadFactor <= 0 {
			repoUpdates.LoadFactor = nil // Zero or a negative value clears the load factor.
		} else if *input.LoadFactor > 10000 {
			return nil, errors.New("load_factor must be <= 10000")
		} else {
			repoUpdates.LoadFactor = input.LoadFactor
		}
	}
	if input.Status != "" {
		repoUpdates.Status = &input.Status
	}
	if input.Schedulable != nil {
		repoUpdates.Schedulable = input.Schedulable
	}

	// Run bulk update for column/jsonb fields first.
	if _, err := s.accountRepo.BulkUpdate(ctx, input.AccountIDs, repoUpdates); err != nil {
		return nil, err
	}

	// Handle group bindings per account (requires individual operations).
	for _, accountID := range input.AccountIDs {
		entry := BulkUpdateAccountResult{AccountID: accountID}

		if input.GroupIDs != nil {
			if err := s.accountRepo.BindGroups(ctx, accountID, *input.GroupIDs); err != nil {
				entry.Success = false
				entry.Error = err.Error()
				result.Failed++
				result.FailedIDs = append(result.FailedIDs, accountID)
				result.Results = append(result.Results, entry)
				continue
			}
		}

		entry.Success = true
		result.Success++
		result.SuccessIDs = append(result.SuccessIDs, accountID)
		result.Results = append(result.Results, entry)
	}

	return result, nil
}

func (s *adminServiceImpl) DeleteAccount(ctx context.Context, id int64) error {
	if err := s.accountRepo.Delete(ctx, id); err != nil {
		return err
	}
	return nil
}

func (s *adminServiceImpl) RefreshAccountCredentials(ctx context.Context, id int64) (*Account, error) {
	account, err := s.accountRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	// TODO: Implement refresh logic
	return account, nil
}

func (s *adminServiceImpl) ClearAccountError(ctx context.Context, id int64) (*Account, error) {
	if err := s.accountRepo.ClearError(ctx, id); err != nil {
		return nil, err
	}
	if err := s.accountRepo.ClearRateLimit(ctx, id); err != nil {
		return nil, err
	}
	if err := s.accountRepo.ClearAntigravityQuotaScopes(ctx, id); err != nil {
		return nil, err
	}
	if err := s.accountRepo.ClearModelRateLimits(ctx, id); err != nil {
		return nil, err
	}
	if err := s.accountRepo.ClearTempUnschedulable(ctx, id); err != nil {
		return nil, err
	}
	return s.accountRepo.GetByID(ctx, id)
}

func (s *adminServiceImpl) SetAccountError(ctx context.Context, id int64, errorMsg string) error {
	return s.accountRepo.SetError(ctx, id, errorMsg)
}

func (s *adminServiceImpl) SetAccountSchedulable(ctx context.Context, id int64, schedulable bool) (*Account, error) {
	if err := s.accountRepo.SetSchedulable(ctx, id, schedulable); err != nil {
		return nil, err
	}
	updated, err := s.accountRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return updated, nil
}

// Proxy management implementations
func (s *adminServiceImpl) ListProxies(ctx context.Context, page, pageSize int, protocol, status, search string, sortBy, sortOrder string) ([]Proxy, int64, error) {
	params := pagination.PaginationParams{Page: page, PageSize: pageSize, SortBy: sortBy, SortOrder: sortOrder}
	proxies, result, err := s.proxyRepo.ListWithFilters(ctx, params, protocol, status, search)
	if err != nil {
		return nil, 0, err
	}
	return proxies, result.Total, nil
}

func (s *adminServiceImpl) ListProxiesWithAccountCount(ctx context.Context, page, pageSize int, protocol, status, search string, sortBy, sortOrder string) ([]ProxyWithAccountCount, int64, error) {
	params := pagination.PaginationParams{Page: page, PageSize: pageSize, SortBy: sortBy, SortOrder: sortOrder}
	proxies, result, err := s.proxyRepo.ListWithFiltersAndAccountCount(ctx, params, protocol, status, search)
	if err != nil {
		return nil, 0, err
	}
	s.attachProxyLatency(ctx, proxies)
	return proxies, result.Total, nil
}

func (s *adminServiceImpl) GetAllProxies(ctx context.Context) ([]Proxy, error) {
	return s.proxyRepo.ListActive(ctx)
}

func (s *adminServiceImpl) GetAllProxiesWithAccountCount(ctx context.Context) ([]ProxyWithAccountCount, error) {
	proxies, err := s.proxyRepo.ListActiveWithAccountCount(ctx)
	if err != nil {
		return nil, err
	}
	s.attachProxyLatency(ctx, proxies)
	return proxies, nil
}

func (s *adminServiceImpl) GetProxy(ctx context.Context, id int64) (*Proxy, error) {
	return s.proxyRepo.GetByID(ctx, id)
}

func (s *adminServiceImpl) GetProxiesByIDs(ctx context.Context, ids []int64) ([]Proxy, error) {
	return s.proxyRepo.ListByIDs(ctx, ids)
}

func (s *adminServiceImpl) CreateProxy(ctx context.Context, input *CreateProxyInput) (*Proxy, error) {
	proxy := &Proxy{
		Name:     input.Name,
		Protocol: input.Protocol,
		Host:     input.Host,
		Port:     input.Port,
		Username: input.Username,
		Password: input.Password,
		Status:   StatusActive,
	}
	if err := s.proxyRepo.Create(ctx, proxy); err != nil {
		return nil, err
	}
	// Probe latency asynchronously so creation isn't blocked by network timeout.
	go s.probeProxyLatency(context.Background(), proxy)
	return proxy, nil
}

func (s *adminServiceImpl) UpdateProxy(ctx context.Context, id int64, input *UpdateProxyInput) (*Proxy, error) {
	proxy, err := s.proxyRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if input.Name != "" {
		proxy.Name = input.Name
	}
	if input.Protocol != "" {
		proxy.Protocol = input.Protocol
	}
	if input.Host != "" {
		proxy.Host = input.Host
	}
	if input.Port != 0 {
		proxy.Port = input.Port
	}
	if input.Username != "" {
		proxy.Username = input.Username
	}
	if input.Password != "" {
		proxy.Password = input.Password
	}
	if input.Status != "" {
		proxy.Status = input.Status
	}

	if err := s.proxyRepo.Update(ctx, proxy); err != nil {
		return nil, err
	}
	return proxy, nil
}

func (s *adminServiceImpl) DeleteProxy(ctx context.Context, id int64) error {
	count, err := s.proxyRepo.CountAccountsByProxyID(ctx, id)
	if err != nil {
		return err
	}
	if count > 0 {
		return ErrProxyInUse
	}
	return s.proxyRepo.Delete(ctx, id)
}

func (s *adminServiceImpl) BatchDeleteProxies(ctx context.Context, ids []int64) (*ProxyBatchDeleteResult, error) {
	result := &ProxyBatchDeleteResult{}
	if len(ids) == 0 {
		return result, nil
	}

	for _, id := range ids {
		count, err := s.proxyRepo.CountAccountsByProxyID(ctx, id)
		if err != nil {
			result.Skipped = append(result.Skipped, ProxyBatchDeleteSkipped{
				ID:     id,
				Reason: err.Error(),
			})
			continue
		}
		if count > 0 {
			result.Skipped = append(result.Skipped, ProxyBatchDeleteSkipped{
				ID:     id,
				Reason: ErrProxyInUse.Error(),
			})
			continue
		}
		if err := s.proxyRepo.Delete(ctx, id); err != nil {
			result.Skipped = append(result.Skipped, ProxyBatchDeleteSkipped{
				ID:     id,
				Reason: err.Error(),
			})
			continue
		}
		result.DeletedIDs = append(result.DeletedIDs, id)
	}

	return result, nil
}

func (s *adminServiceImpl) GetProxyAccounts(ctx context.Context, proxyID int64) ([]ProxyAccountSummary, error) {
	return s.proxyRepo.ListAccountSummariesByProxyID(ctx, proxyID)
}

func (s *adminServiceImpl) CheckProxyExists(ctx context.Context, host string, port int, username, password string) (bool, error) {
	return s.proxyRepo.ExistsByHostPortAuth(ctx, host, port, username, password)
}

// Redeem code management implementations
func (s *adminServiceImpl) ListRedeemCodes(ctx context.Context, page, pageSize int, codeType, status, search string, sortBy, sortOrder string) ([]RedeemCode, int64, error) {
	params := pagination.PaginationParams{Page: page, PageSize: pageSize, SortBy: sortBy, SortOrder: sortOrder}
	codes, result, err := s.redeemCodeRepo.ListWithFilters(ctx, params, codeType, status, search)
	if err != nil {
		return nil, 0, err
	}
	return codes, result.Total, nil
}

func (s *adminServiceImpl) GetRedeemCode(ctx context.Context, id int64) (*RedeemCode, error) {
	return s.redeemCodeRepo.GetByID(ctx, id)
}

func (s *adminServiceImpl) GenerateRedeemCodes(ctx context.Context, input *GenerateRedeemCodesInput) ([]RedeemCode, error) {
	// Subscription redeem codes must specify a group.
	if input.Type == RedeemTypeSubscription {
		if input.GroupID == nil {
			return nil, errors.New("group_id is required for subscription type")
		}
		// 验证分组存在且为订阅类型
		group, err := s.groupRepo.GetByID(ctx, *input.GroupID)
		if err != nil {
			return nil, fmt.Errorf("group not found: %w", err)
		}
		if !group.IsSubscriptionType() {
			return nil, errors.New("group must be subscription type")
		}
	}

	codes := make([]RedeemCode, 0, input.Count)
	for i := 0; i < input.Count; i++ {
		codeValue, err := GenerateRedeemCode()
		if err != nil {
			return nil, err
		}
		code := RedeemCode{
			Code:   codeValue,
			Type:   input.Type,
			Value:  input.Value,
			Status: StatusUnused,
		}
		// 订阅类型专用字段
		if input.Type == RedeemTypeSubscription {
			code.GroupID = input.GroupID
			code.ValidityDays = input.ValidityDays
			if code.ValidityDays <= 0 {
				code.ValidityDays = 30 // Default to 30 days.
			}
		}
		if err := s.redeemCodeRepo.Create(ctx, &code); err != nil {
			return nil, err
		}
		codes = append(codes, code)
	}
	return codes, nil
}

func (s *adminServiceImpl) DeleteRedeemCode(ctx context.Context, id int64) error {
	return s.redeemCodeRepo.Delete(ctx, id)
}

func (s *adminServiceImpl) BatchDeleteRedeemCodes(ctx context.Context, ids []int64) (int64, error) {
	var deleted int64
	for _, id := range ids {
		if err := s.redeemCodeRepo.Delete(ctx, id); err == nil {
			deleted++
		}
	}
	return deleted, nil
}

func (s *adminServiceImpl) ExpireRedeemCode(ctx context.Context, id int64) (*RedeemCode, error) {
	code, err := s.redeemCodeRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	code.Status = StatusExpired
	if err := s.redeemCodeRepo.Update(ctx, code); err != nil {
		return nil, err
	}
	return code, nil
}

func (s *adminServiceImpl) TestProxy(ctx context.Context, id int64) (*ProxyTestResult, error) {
	proxy, err := s.proxyRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	proxyURL := proxy.URL()
	exitInfo, latencyMs, err := s.proxyProber.ProbeProxy(ctx, proxyURL)
	if err != nil {
		s.saveProxyLatency(ctx, id, &ProxyLatencyInfo{
			Success:   false,
			Message:   err.Error(),
			UpdatedAt: time.Now(),
		})
		return &ProxyTestResult{
			Success: false,
			Message: err.Error(),
		}, nil
	}

	latency := latencyMs
	s.saveProxyLatency(ctx, id, &ProxyLatencyInfo{
		Success:     true,
		LatencyMs:   &latency,
		Message:     "Proxy is accessible",
		IPAddress:   exitInfo.IP,
		Country:     exitInfo.Country,
		CountryCode: exitInfo.CountryCode,
		Region:      exitInfo.Region,
		City:        exitInfo.City,
		UpdatedAt:   time.Now(),
	})
	return &ProxyTestResult{
		Success:     true,
		Message:     "Proxy is accessible",
		LatencyMs:   latencyMs,
		IPAddress:   exitInfo.IP,
		City:        exitInfo.City,
		Region:      exitInfo.Region,
		Country:     exitInfo.Country,
		CountryCode: exitInfo.CountryCode,
	}, nil
}

func (s *adminServiceImpl) CheckProxyQuality(ctx context.Context, id int64) (*ProxyQualityCheckResult, error) {
	proxy, err := s.proxyRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	result := &ProxyQualityCheckResult{
		ProxyID:   id,
		Score:     100,
		Grade:     "A",
		CheckedAt: time.Now().Unix(),
		Items:     make([]ProxyQualityCheckItem, 0, len(proxyQualityTargets)+1),
	}

	proxyURL := proxy.URL()
	if s.proxyProber == nil {
		result.Items = append(result.Items, ProxyQualityCheckItem{
			Target:  "base_connectivity",
			Status:  "fail",
			Message: "proxy prober is not configured",
		})
		result.FailedCount++
		finalizeProxyQualityResult(result)
		s.saveProxyQualitySnapshot(ctx, id, result, nil)
		return result, nil
	}

	exitInfo, latencyMs, err := s.proxyProber.ProbeProxy(ctx, proxyURL)
	if err != nil {
		result.Items = append(result.Items, ProxyQualityCheckItem{
			Target:    "base_connectivity",
			Status:    "fail",
			LatencyMs: latencyMs,
			Message:   err.Error(),
		})
		result.FailedCount++
		finalizeProxyQualityResult(result)
		s.saveProxyQualitySnapshot(ctx, id, result, nil)
		return result, nil
	}

	result.ExitIP = exitInfo.IP
	result.Country = exitInfo.Country
	result.CountryCode = exitInfo.CountryCode
	result.BaseLatencyMs = latencyMs
	result.Items = append(result.Items, ProxyQualityCheckItem{
		Target:    "base_connectivity",
		Status:    "pass",
		LatencyMs: latencyMs,
		Message:   "proxy connectivity is healthy",
	})
	result.PassedCount++

	client, err := httpclient.GetClient(httpclient.Options{
		ProxyURL:              proxyURL,
		Timeout:               proxyQualityRequestTimeout,
		ResponseHeaderTimeout: proxyQualityResponseHeaderTimeout,
	})
	if err != nil {
		result.Items = append(result.Items, ProxyQualityCheckItem{
			Target:  "http_client",
			Status:  "fail",
			Message: fmt.Sprintf("创建检测客户端失败: %v", err),
		})
		result.FailedCount++
		finalizeProxyQualityResult(result)
		s.saveProxyQualitySnapshot(ctx, id, result, exitInfo)
		return result, nil
	}

	for _, target := range proxyQualityTargets {
		item := runProxyQualityTarget(ctx, client, target)
		result.Items = append(result.Items, item)
		switch item.Status {
		case "pass":
			result.PassedCount++
		case "warn":
			result.WarnCount++
		case "challenge":
			result.ChallengeCount++
		default:
			result.FailedCount++
		}
	}

	finalizeProxyQualityResult(result)
	s.saveProxyQualitySnapshot(ctx, id, result, exitInfo)
	return result, nil
}

func runProxyQualityTarget(ctx context.Context, client *http.Client, target proxyQualityTarget) ProxyQualityCheckItem {
	item := ProxyQualityCheckItem{
		Target: target.Target,
	}

	req, err := http.NewRequestWithContext(ctx, target.Method, target.URL, nil)
	if err != nil {
		item.Status = "fail"
		item.Message = fmt.Sprintf("构建请求失败: %v", err)
		return item
	}
	req.Header.Set("Accept", "application/json,text/html,*/*")
	req.Header.Set("User-Agent", proxyQualityClientUserAgent)

	start := time.Now()
	resp, err := client.Do(req)
	if err != nil {
		item.Status = "fail"
		item.LatencyMs = time.Since(start).Milliseconds()
		item.Message = fmt.Sprintf("请求失败: %v", err)
		return item
	}
	defer func() { _ = resp.Body.Close() }()
	item.LatencyMs = time.Since(start).Milliseconds()
	item.HTTPStatus = resp.StatusCode

	body, readErr := io.ReadAll(io.LimitReader(resp.Body, proxyQualityMaxBodyBytes+1))
	if readErr != nil {
		item.Status = "fail"
		item.Message = fmt.Sprintf("读取响应失败: %v", readErr)
		return item
	}
	if int64(len(body)) > proxyQualityMaxBodyBytes {
		body = body[:proxyQualityMaxBodyBytes]
	}

	// Check for a Cloudflare challenge response.
	if httputil.IsCloudflareChallengeResponse(resp.StatusCode, resp.Header, body) {
		item.Status = "challenge"
		item.CFRay = httputil.ExtractCloudflareRayID(resp.Header, body)
		item.Message = "命中 Cloudflare challenge"
		return item
	}

	if _, ok := target.AllowedStatuses[resp.StatusCode]; ok {
		if resp.StatusCode >= http.StatusOK && resp.StatusCode < http.StatusMultipleChoices {
			item.Status = "pass"
			item.Message = fmt.Sprintf("HTTP %d", resp.StatusCode)
		} else {
			item.Status = "warn"
			item.Message = fmt.Sprintf("HTTP %d (reachable, but auth or method is restricted)", resp.StatusCode)
		}
		return item
	}

	if resp.StatusCode == http.StatusTooManyRequests {
		item.Status = "warn"
		item.Message = "target returned 429, which may indicate rate limiting"
		return item
	}

	item.Status = "fail"
	item.Message = fmt.Sprintf("非预期状态码: %d", resp.StatusCode)
	return item
}

func finalizeProxyQualityResult(result *ProxyQualityCheckResult) {
	if result == nil {
		return
	}
	score := 100 - result.WarnCount*10 - result.FailedCount*22 - result.ChallengeCount*30
	if score < 0 {
		score = 0
	}
	result.Score = score
	result.Grade = proxyQualityGrade(score)
	result.Summary = fmt.Sprintf(
		"passed %d, warned %d, failed %d, challenged %d",
		result.PassedCount,
		result.WarnCount,
		result.FailedCount,
		result.ChallengeCount,
	)
}

func proxyQualityGrade(score int) string {
	switch {
	case score >= 90:
		return "A"
	case score >= 75:
		return "B"
	case score >= 60:
		return "C"
	case score >= 40:
		return "D"
	default:
		return "F"
	}
}

func proxyQualityOverallStatus(result *ProxyQualityCheckResult) string {
	if result == nil {
		return ""
	}
	if result.ChallengeCount > 0 {
		return "challenge"
	}
	if result.FailedCount > 0 {
		return "failed"
	}
	if result.WarnCount > 0 {
		return "warn"
	}
	if result.PassedCount > 0 {
		return "healthy"
	}
	return "failed"
}

func proxyQualityFirstCFRay(result *ProxyQualityCheckResult) string {
	if result == nil {
		return ""
	}
	for _, item := range result.Items {
		if item.CFRay != "" {
			return item.CFRay
		}
	}
	return ""
}

func proxyQualityBaseConnectivityPass(result *ProxyQualityCheckResult) bool {
	if result == nil {
		return false
	}
	for _, item := range result.Items {
		if item.Target == "base_connectivity" {
			return item.Status == "pass"
		}
	}
	return false
}

func (s *adminServiceImpl) saveProxyQualitySnapshot(ctx context.Context, proxyID int64, result *ProxyQualityCheckResult, exitInfo *ProxyExitInfo) {
	if result == nil {
		return
	}
	score := result.Score
	checkedAt := result.CheckedAt
	info := &ProxyLatencyInfo{
		Success:          proxyQualityBaseConnectivityPass(result),
		Message:          result.Summary,
		QualityStatus:    proxyQualityOverallStatus(result),
		QualityScore:     &score,
		QualityGrade:     result.Grade,
		QualitySummary:   result.Summary,
		QualityCheckedAt: &checkedAt,
		QualityCFRay:     proxyQualityFirstCFRay(result),
		UpdatedAt:        time.Now(),
	}
	if result.BaseLatencyMs > 0 {
		latency := result.BaseLatencyMs
		info.LatencyMs = &latency
	}
	if exitInfo != nil {
		info.IPAddress = exitInfo.IP
		info.Country = exitInfo.Country
		info.CountryCode = exitInfo.CountryCode
		info.Region = exitInfo.Region
		info.City = exitInfo.City
	}
	s.saveProxyLatency(ctx, proxyID, info)
}

func (s *adminServiceImpl) probeProxyLatency(ctx context.Context, proxy *Proxy) {
	if s.proxyProber == nil || proxy == nil {
		return
	}
	exitInfo, latencyMs, err := s.proxyProber.ProbeProxy(ctx, proxy.URL())
	if err != nil {
		s.saveProxyLatency(ctx, proxy.ID, &ProxyLatencyInfo{
			Success:   false,
			Message:   err.Error(),
			UpdatedAt: time.Now(),
		})
		return
	}

	latency := latencyMs
	s.saveProxyLatency(ctx, proxy.ID, &ProxyLatencyInfo{
		Success:     true,
		LatencyMs:   &latency,
		Message:     "Proxy is accessible",
		IPAddress:   exitInfo.IP,
		Country:     exitInfo.Country,
		CountryCode: exitInfo.CountryCode,
		Region:      exitInfo.Region,
		City:        exitInfo.City,
		UpdatedAt:   time.Now(),
	})
}

// checkMixedChannelRisk checks whether the target groups mix Antigravity and Anthropic accounts.
func (s *adminServiceImpl) checkMixedChannelRisk(ctx context.Context, currentAccountID int64, currentAccountPlatform string, groupIDs []int64) error {
	// Determine the current account platform based on the platform field rather than account type.
	currentPlatform := getAccountPlatform(currentAccountPlatform)
	if currentPlatform == "" {
		// Only Antigravity and Anthropic accounts participate in this check.
		return nil
	}

	// Inspect other accounts already bound to each group.
	for _, groupID := range groupIDs {
		accounts, err := s.accountRepo.ListByGroup(ctx, groupID)
		if err != nil {
			return fmt.Errorf("get accounts in group %d: %w", groupID, err)
		}

		// 检查是否存在不同渠道的账号
		for _, account := range accounts {
			if currentAccountID > 0 && account.ID == currentAccountID {
				continue // 跳过当前账号
			}

			otherPlatform := getAccountPlatform(account.Platform)
			if otherPlatform == "" {
				continue // Ignore other platforms.
			}

			// Detect mixed-channel bindings inside the same group.
			if currentPlatform != otherPlatform {
				group, _ := s.groupRepo.GetByID(ctx, groupID)
				groupName := fmt.Sprintf("Group %d", groupID)
				if group != nil {
					groupName = group.Name
				}

				return &MixedChannelError{
					GroupID:         groupID,
					GroupName:       groupName,
					CurrentPlatform: currentPlatform,
					OtherPlatform:   otherPlatform,
				}
			}
		}
	}

	return nil
}

func (s *adminServiceImpl) validateGroupIDsExist(ctx context.Context, groupIDs []int64) error {
	if len(groupIDs) == 0 {
		return nil
	}
	if s.groupRepo == nil {
		return errors.New("group repository not configured")
	}

	if batchReader, ok := s.groupRepo.(groupExistenceBatchReader); ok {
		existsByID, err := batchReader.ExistsByIDs(ctx, groupIDs)
		if err != nil {
			return fmt.Errorf("check groups exists: %w", err)
		}
		for _, groupID := range groupIDs {
			if groupID <= 0 || !existsByID[groupID] {
				return fmt.Errorf("get group: %w", ErrGroupNotFound)
			}
		}
		return nil
	}

	for _, groupID := range groupIDs {
		if _, err := s.groupRepo.GetByID(ctx, groupID); err != nil {
			return fmt.Errorf("get group: %w", err)
		}
	}
	return nil
}

// CheckMixedChannelRisk checks whether target groups contain mixed channels for the current account platform.
func (s *adminServiceImpl) CheckMixedChannelRisk(ctx context.Context, currentAccountID int64, currentAccountPlatform string, groupIDs []int64) error {
	return s.checkMixedChannelRisk(ctx, currentAccountID, currentAccountPlatform, groupIDs)
}

func (s *adminServiceImpl) attachProxyLatency(ctx context.Context, proxies []ProxyWithAccountCount) {
	if s.proxyLatencyCache == nil || len(proxies) == 0 {
		return
	}

	ids := make([]int64, 0, len(proxies))
	for i := range proxies {
		ids = append(ids, proxies[i].ID)
	}

	latencies, err := s.proxyLatencyCache.GetProxyLatencies(ctx, ids)
	if err != nil {
		logger.LegacyPrintf("service.admin", "Warning: load proxy latency cache failed: %v", err)
		return
	}

	for i := range proxies {
		info := latencies[proxies[i].ID]
		if info == nil {
			continue
		}
		if info.Success {
			proxies[i].LatencyStatus = "success"
			proxies[i].LatencyMs = info.LatencyMs
		} else {
			proxies[i].LatencyStatus = "failed"
		}
		proxies[i].LatencyMessage = info.Message
		proxies[i].IPAddress = info.IPAddress
		proxies[i].Country = info.Country
		proxies[i].CountryCode = info.CountryCode
		proxies[i].Region = info.Region
		proxies[i].City = info.City
		proxies[i].QualityStatus = info.QualityStatus
		proxies[i].QualityScore = info.QualityScore
		proxies[i].QualityGrade = info.QualityGrade
		proxies[i].QualitySummary = info.QualitySummary
		proxies[i].QualityChecked = info.QualityCheckedAt
	}
}

func (s *adminServiceImpl) saveProxyLatency(ctx context.Context, proxyID int64, info *ProxyLatencyInfo) {
	if s.proxyLatencyCache == nil || info == nil {
		return
	}

	merged := *info
	if latencies, err := s.proxyLatencyCache.GetProxyLatencies(ctx, []int64{proxyID}); err == nil {
		if existing := latencies[proxyID]; existing != nil {
			if merged.QualityCheckedAt == nil &&
				merged.QualityScore == nil &&
				merged.QualityGrade == "" &&
				merged.QualityStatus == "" &&
				merged.QualitySummary == "" &&
				merged.QualityCFRay == "" {
				merged.QualityStatus = existing.QualityStatus
				merged.QualityScore = existing.QualityScore
				merged.QualityGrade = existing.QualityGrade
				merged.QualitySummary = existing.QualitySummary
				merged.QualityCheckedAt = existing.QualityCheckedAt
				merged.QualityCFRay = existing.QualityCFRay
			}
		}
	}

	if err := s.proxyLatencyCache.SetProxyLatency(ctx, proxyID, &merged); err != nil {
		logger.LegacyPrintf("service.admin", "Warning: store proxy latency cache failed: %v", err)
	}
}

// getAccountPlatform normalizes the platform name for mixed-channel checks.
func getAccountPlatform(accountPlatform string) string {
	switch strings.ToLower(strings.TrimSpace(accountPlatform)) {
	case PlatformAntigravity:
		return "Antigravity"
	case PlatformAnthropic, "claude":
		return "Anthropic"
	default:
		return ""
	}
}

// MixedChannelError 混合渠道错误
type MixedChannelError struct {
	GroupID         int64
	GroupName       string
	CurrentPlatform string
	OtherPlatform   string
}

func (e *MixedChannelError) Error() string {
	return fmt.Sprintf("mixed_channel_warning: Group '%s' contains both %s and %s accounts. Using mixed channels in the same context may cause thinking block signature validation issues, which will fallback to non-thinking mode for historical messages.",
		e.GroupName, e.CurrentPlatform, e.OtherPlatform)
}

func (s *adminServiceImpl) ResetAccountQuota(ctx context.Context, id int64) error {
	return s.accountRepo.ResetQuotaUsed(ctx, id)
}

// EnsureOpenAIPrivacy ensures privacy_mode is configured for OpenAI OAuth accounts.
func (s *adminServiceImpl) EnsureOpenAIPrivacy(ctx context.Context, account *Account) string {
	if account.Platform != PlatformOpenAI || account.Type != AccountTypeOAuth {
		return ""
	}
	if s.privacyClientFactory == nil {
		return ""
	}
	if shouldSkipOpenAIPrivacyEnsure(account.Extra) {
		return ""
	}

	token, _ := account.Credentials["access_token"].(string)
	if token == "" {
		return ""
	}

	var proxyURL string
	if account.ProxyID != nil {
		if p, err := s.proxyRepo.GetByID(ctx, *account.ProxyID); err == nil && p != nil {
			proxyURL = p.URL()
		}
	}

	mode := disableOpenAITraining(ctx, s.privacyClientFactory, token, proxyURL)
	if mode == "" {
		return ""
	}

	_ = s.accountRepo.UpdateExtra(ctx, account.ID, map[string]any{"privacy_mode": mode})
	return mode
}

// ForceOpenAIPrivacy reapplies OpenAI privacy settings even if they were already set.
func (s *adminServiceImpl) ForceOpenAIPrivacy(ctx context.Context, account *Account) string {
	if account.Platform != PlatformOpenAI || account.Type != AccountTypeOAuth {
		return ""
	}
	if s.privacyClientFactory == nil {
		return ""
	}

	token, _ := account.Credentials["access_token"].(string)
	if token == "" {
		return ""
	}

	var proxyURL string
	if account.ProxyID != nil {
		if p, err := s.proxyRepo.GetByID(ctx, *account.ProxyID); err == nil && p != nil {
			proxyURL = p.URL()
		}
	}

	mode := disableOpenAITraining(ctx, s.privacyClientFactory, token, proxyURL)
	if mode == "" {
		return ""
	}

	if err := s.accountRepo.UpdateExtra(ctx, account.ID, map[string]any{"privacy_mode": mode}); err != nil {
		logger.LegacyPrintf("service.admin", "force_update_openai_privacy_mode_failed: account_id=%d err=%v", account.ID, err)
		return mode
	}
	if account.Extra == nil {
		account.Extra = make(map[string]any)
	}
	account.Extra["privacy_mode"] = mode
	return mode
}

// EnsureAntigravityPrivacy ensures privacy_mode is configured for Antigravity OAuth accounts.
func (s *adminServiceImpl) EnsureAntigravityPrivacy(ctx context.Context, account *Account) string {
	if account.Platform != PlatformAntigravity || account.Type != AccountTypeOAuth {
		return ""
	}
	if account.Extra != nil {
		if existing, ok := account.Extra["privacy_mode"].(string); ok && existing == AntigravityPrivacySet {
			return existing
		}
	}

	token, _ := account.Credentials["access_token"].(string)
	if token == "" {
		return ""
	}

	projectID, _ := account.Credentials["project_id"].(string)

	var proxyURL string
	if account.ProxyID != nil {
		if p, err := s.proxyRepo.GetByID(ctx, *account.ProxyID); err == nil && p != nil {
			proxyURL = p.URL()
		}
	}

	mode := setAntigravityPrivacy(ctx, token, projectID, proxyURL)
	if mode == "" {
		return ""
	}

	if err := s.accountRepo.UpdateExtra(ctx, account.ID, map[string]any{"privacy_mode": mode}); err != nil {
		logger.LegacyPrintf("service.admin", "update_antigravity_privacy_mode_failed: account_id=%d err=%v", account.ID, err)
		return mode
	}
	applyAntigravityPrivacyMode(account, mode)
	return mode
}

// ForceAntigravityPrivacy reapplies Antigravity privacy settings even if they were already set.
func (s *adminServiceImpl) ForceAntigravityPrivacy(ctx context.Context, account *Account) string {
	if account.Platform != PlatformAntigravity || account.Type != AccountTypeOAuth {
		return ""
	}

	token, _ := account.Credentials["access_token"].(string)
	if token == "" {
		return ""
	}

	projectID, _ := account.Credentials["project_id"].(string)

	var proxyURL string
	if account.ProxyID != nil {
		if p, err := s.proxyRepo.GetByID(ctx, *account.ProxyID); err == nil && p != nil {
			proxyURL = p.URL()
		}
	}

	mode := setAntigravityPrivacy(ctx, token, projectID, proxyURL)
	if mode == "" {
		return ""
	}

	if err := s.accountRepo.UpdateExtra(ctx, account.ID, map[string]any{"privacy_mode": mode}); err != nil {
		logger.LegacyPrintf("service.admin", "force_update_antigravity_privacy_mode_failed: account_id=%d err=%v", account.ID, err)
		return mode
	}
	applyAntigravityPrivacyMode(account, mode)
	return mode
}
