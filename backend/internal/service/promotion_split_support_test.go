package service

import (
	"context"
	"database/sql"
	"fmt"
	"sync/atomic"
	"testing"
	"time"

	dbent "github.com/dlxyz/SubioHub/ent"
	"github.com/dlxyz/SubioHub/ent/commissionlog"
	"github.com/dlxyz/SubioHub/ent/commissionrule"
	"github.com/dlxyz/SubioHub/ent/commissionsplitlog"
	"github.com/dlxyz/SubioHub/ent/enttest"
	"github.com/dlxyz/SubioHub/ent/promotionrelation"
	"github.com/dlxyz/SubioHub/ent/user"
	"github.com/dlxyz/SubioHub/internal/config"
	"github.com/dlxyz/SubioHub/internal/payment"
	"github.com/dlxyz/SubioHub/internal/pkg/pagination"
	"github.com/stretchr/testify/require"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	_ "modernc.org/sqlite"
)

type promotionSettingRepoStub struct {
	values map[string]string
}

type promotionUserRepo struct {
	client *dbent.Client
}

var promotionInviteCodeSeq atomic.Uint64

func (s *promotionSettingRepoStub) Get(ctx context.Context, key string) (*Setting, error) {
	return nil, ErrSettingNotFound
}

func (s *promotionSettingRepoStub) GetValue(ctx context.Context, key string) (string, error) {
	if v, ok := s.values[key]; ok {
		return v, nil
	}
	return "", ErrSettingNotFound
}

func (s *promotionSettingRepoStub) Set(ctx context.Context, key, value string) error {
	return nil
}

func (s *promotionSettingRepoStub) GetMultiple(ctx context.Context, keys []string) (map[string]string, error) {
	return map[string]string{}, nil
}

func (s *promotionSettingRepoStub) SetMultiple(ctx context.Context, settings map[string]string) error {
	return nil
}

func (s *promotionSettingRepoStub) GetAll(ctx context.Context) (map[string]string, error) {
	return s.values, nil
}

func (s *promotionSettingRepoStub) Delete(ctx context.Context, key string) error {
	return nil
}

func newPromotionTestClient(t *testing.T, name string) (*dbent.Client, *sql.DB) {
	t.Helper()

	db, err := sql.Open("sqlite", "file:"+name+"?mode=memory&cache=shared")
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	_, err = db.Exec("PRAGMA foreign_keys = ON")
	require.NoError(t, err)

	drv := entsql.OpenDB(dialect.SQLite, db)
	client := enttest.NewClient(t, enttest.WithOptions(dbent.Driver(drv)))
	t.Cleanup(func() { _ = client.Close() })

	return client, db
}

func (r *promotionUserRepo) Create(ctx context.Context, user *User) error {
	inviteCode := user.InviteCode
	if inviteCode == "" {
		var err error
		inviteCode, err = NewInviteCode()
		if err != nil {
			return err
		}
	}

	create := r.client.User.Create().
		SetEmail(user.Email).
		SetPasswordHash(user.PasswordHash).
		SetInviteCode(inviteCode).
		SetRole(user.Role).
		SetStatus(user.Status).
		SetBalance(user.Balance).
		SetConcurrency(user.Concurrency).
		SetCommissionRate(user.CommissionRate)
	if user.Username != "" {
		create = create.SetUsername(user.Username)
	}
	if user.InviterID != nil {
		create = create.SetInviterID(*user.InviterID)
	}

	entity, err := create.Save(ctx)
	if err != nil {
		return err
	}
	user.ID = entity.ID
	user.InviteCode = entity.InviteCode
	return nil
}

func (r *promotionUserRepo) GetByID(ctx context.Context, id int64) (*User, error) {
	entity, err := r.client.User.Get(ctx, id)
	if err != nil {
		if dbent.IsNotFound(err) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return &User{
		ID:             entity.ID,
		Email:          entity.Email,
		Username:       entity.Username,
		PasswordHash:   entity.PasswordHash,
		Role:           entity.Role,
		Balance:        entity.Balance,
		Concurrency:    entity.Concurrency,
		Status:         entity.Status,
		InviterID:      entity.InviterID,
		InviteCode:     entity.InviteCode,
		CommissionRate: entity.CommissionRate,
	}, nil
}

func (r *promotionUserRepo) GetByEmail(ctx context.Context, email string) (*User, error) {
	entity, err := r.client.User.Query().Where(user.EmailEQ(email)).Only(ctx)
	if err != nil {
		if dbent.IsNotFound(err) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return &User{
		ID:             entity.ID,
		Email:          entity.Email,
		Username:       entity.Username,
		PasswordHash:   entity.PasswordHash,
		Role:           entity.Role,
		Balance:        entity.Balance,
		Concurrency:    entity.Concurrency,
		Status:         entity.Status,
		InviterID:      entity.InviterID,
		InviteCode:     entity.InviteCode,
		CommissionRate: entity.CommissionRate,
	}, nil
}

func (r *promotionUserRepo) GetFirstAdmin(ctx context.Context) (*User, error) {
	panic("unexpected GetFirstAdmin call")
}

func (r *promotionUserRepo) Update(ctx context.Context, user *User) error {
	update := r.client.User.UpdateOneID(user.ID).
		SetEmail(user.Email).
		SetUsername(user.Username).
		SetPasswordHash(user.PasswordHash).
		SetRole(user.Role).
		SetStatus(user.Status).
		SetBalance(user.Balance).
		SetConcurrency(user.Concurrency).
		SetCommissionRate(user.CommissionRate)
	if user.InviterID != nil {
		update = update.SetInviterID(*user.InviterID)
	}
	_, err := update.Save(ctx)
	return err
}

func (r *promotionUserRepo) Delete(ctx context.Context, id int64) error {
	return r.client.User.DeleteOneID(id).Exec(ctx)
}

func (r *promotionUserRepo) List(ctx context.Context, params pagination.PaginationParams) ([]User, *pagination.PaginationResult, error) {
	panic("unexpected List call")
}

func (r *promotionUserRepo) ListWithFilters(ctx context.Context, params pagination.PaginationParams, filters UserListFilters) ([]User, *pagination.PaginationResult, error) {
	panic("unexpected ListWithFilters call")
}

func (r *promotionUserRepo) UpdateBalance(ctx context.Context, id int64, amount float64) error {
	panic("unexpected UpdateBalance call")
}

func (r *promotionUserRepo) DeductBalance(ctx context.Context, id int64, amount float64) error {
	panic("unexpected DeductBalance call")
}

func (r *promotionUserRepo) UpdateCommissionBalance(ctx context.Context, id int64, amount float64) error {
	client := r.client
	if tx := dbent.TxFromContext(ctx); tx != nil {
		client = tx.Client()
	}
	update := client.User.Update().Where(user.IDEQ(id)).AddCommissionBalance(amount)
	if amount > 0 {
		update = update.AddTotalCommissionEarned(amount)
	}
	affected, err := update.Save(ctx)
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrUserNotFound
	}
	return nil
}

func (r *promotionUserRepo) UpdateConcurrency(ctx context.Context, id int64, amount int) error {
	panic("unexpected UpdateConcurrency call")
}

func (r *promotionUserRepo) ExistsByEmail(ctx context.Context, email string) (bool, error) {
	return r.client.User.Query().Where(user.EmailEQ(email)).Exist(ctx)
}

func (r *promotionUserRepo) RemoveGroupFromAllowedGroups(ctx context.Context, groupID int64) (int64, error) {
	panic("unexpected RemoveGroupFromAllowedGroups call")
}

func (r *promotionUserRepo) AddGroupToAllowedGroups(ctx context.Context, userID int64, groupID int64) error {
	panic("unexpected AddGroupToAllowedGroups call")
}

func (r *promotionUserRepo) RemoveGroupFromUserAllowedGroups(ctx context.Context, userID int64, groupID int64) error {
	panic("unexpected RemoveGroupFromUserAllowedGroups call")
}

func (r *promotionUserRepo) UpdateTotpSecret(ctx context.Context, userID int64, encryptedSecret *string) error {
	panic("unexpected UpdateTotpSecret call")
}

func (r *promotionUserRepo) EnableTotp(ctx context.Context, userID int64) error {
	panic("unexpected EnableTotp call")
}

func (r *promotionUserRepo) DisableTotp(ctx context.Context, userID int64) error {
	panic("unexpected DisableTotp call")
}

func mustCreatePromotionUser(t *testing.T, ctx context.Context, client *dbent.Client, email, role string, inviterID *int64) *dbent.User {
	t.Helper()

	create := client.User.Create().
		SetEmail(email).
		SetPasswordHash("test-password-hash").
		SetInviteCode(fmt.Sprintf("INV-%d", promotionInviteCodeSeq.Add(1))).
		SetRole(role).
		SetStatus(StatusActive)
	if inviterID != nil {
		create = create.SetInviterID(*inviterID)
	}

	user, err := create.Save(ctx)
	require.NoError(t, err)
	return user
}

func TestRegisterWithVerification_WritesPromotionRelation(t *testing.T) {
	client, _ := newPromotionTestClient(t, "promotion_register_relation")
	ctx := context.Background()

	inviter := mustCreatePromotionUser(t, ctx, client, "agent-register@test.com", RoleAgent, nil)

	cfg := &config.Config{
		JWT: config.JWTConfig{
			Secret:     "test-secret",
			ExpireHour: 1,
		},
		Default: config.DefaultConfig{
			UserBalance:     3.5,
			UserConcurrency: 2,
		},
	}
	settingService := NewSettingService(&promotionSettingRepoStub{
		values: map[string]string{
			SettingKeyRegistrationEnabled: "true",
		},
	}, cfg)
	userRepo := &promotionUserRepo{client: client}

	authSvc := NewAuthService(
		client,
		userRepo,
		nil,
		nil,
		cfg,
		settingService,
		nil,
		nil,
		nil,
		nil,
		nil,
	)

	_, user, err := authSvc.RegisterWithVerification(ctx, "child-register@test.com", "password123", "", "", "", inviter.InviteCode)
	require.NoError(t, err)
	require.NotNil(t, user)
	require.NotNil(t, user.InviterID)
	require.Equal(t, inviter.ID, *user.InviterID)

	relation, err := client.PromotionRelation.Query().
		Where(promotionrelation.UserIDEQ(user.ID)).
		Only(ctx)
	require.NoError(t, err)
	require.NotNil(t, relation.AgentUserID)
	require.Equal(t, inviter.ID, *relation.AgentUserID)
	require.Nil(t, relation.DistributorUserID)
	require.NotNil(t, relation.DirectParentUserID)
	require.Equal(t, inviter.ID, *relation.DirectParentUserID)
	require.Equal(t, RoleAgent, relation.DirectParentRole)
	require.Equal(t, "agent_direct", relation.BindingSource)
	require.True(t, relation.IsLocked)
}

func TestPaymentService_MarkCompletedCreatesDiffCommissionSplitLogs(t *testing.T) {
	client, _ := newPromotionTestClient(t, "promotion_diff_split_logs")
	ctx := context.Background()

	agent := mustCreatePromotionUser(t, ctx, client, "agent-split@test.com", RoleAgent, nil)
	distributor := mustCreatePromotionUser(t, ctx, client, "distributor-split@test.com", RoleDistributor, &agent.ID)
	consumer := mustCreatePromotionUser(t, ctx, client, "consumer-split@test.com", RoleUser, &distributor.ID)

	require.NoError(t, upsertPromotionRelationForInviter(ctx, client, distributor.ID, &agent.ID, "bind distributor to agent"))
	require.NoError(t, upsertPromotionRelationForInviter(ctx, client, consumer.ID, &distributor.ID, "bind consumer to distributor"))

	rule, err := client.CommissionRule.Create().
		SetName("test global diff rule").
		SetStatus(StatusActive).
		SetCalcMode(commissionCalcModeDiff).
		SetAgentTargetRate(0.20).
		SetDistributorTargetRate(0.15).
		SetFreezeHours(168).
		SetSettlementMode(commissionSettlementModeManual).
		SetScopeType(commissionRuleScopeGlobal).
		SetPriority(10).
		Save(ctx)
	require.NoError(t, err)

	order, err := client.PaymentOrder.Create().
		SetUserID(consumer.ID).
		SetUserEmail(consumer.Email).
		SetUserName("consumer").
		SetAmount(100).
		SetPayAmount(100).
		SetFeeRate(0).
		SetRechargeCode("split-test-code").
		SetOutTradeNo("split-test-out-trade-no").
		SetPaymentType("alipay").
		SetPaymentTradeNo("split-test-trade-no").
		SetOrderType(payment.OrderTypeBalance).
		SetStatus(OrderStatusRecharging).
		SetExpiresAt(time.Now().Add(time.Hour)).
		SetClientIP("127.0.0.1").
		SetSrcHost("localhost").
		Save(ctx)
	require.NoError(t, err)

	paymentSvc := &PaymentService{
		entClient: client,
		userRepo:  &promotionUserRepo{client: client},
	}

	err = paymentSvc.markCompleted(ctx, order, "TEST_SPLIT_SUCCESS")
	require.NoError(t, err)

	updatedOrder, err := client.PaymentOrder.Get(ctx, order.ID)
	require.NoError(t, err)
	require.Equal(t, OrderStatusCompleted, updatedOrder.Status)
	require.NotNil(t, updatedOrder.CompletedAt)

	logs, err := client.CommissionSplitLog.Query().
		Where(commissionsplitlog.OrderIDEQ(order.ID)).
		Order(commissionsplitlog.ByLevel()).
		All(ctx)
	require.NoError(t, err)
	require.Len(t, logs, 2)

	require.Equal(t, distributor.ID, logs[0].BeneficiaryUserID)
	require.Equal(t, RoleDistributor, logs[0].BeneficiaryRole)
	require.Equal(t, 1, logs[0].Level)
	require.InDelta(t, 0.15, logs[0].TargetRate, 0.000001)
	require.InDelta(t, 0, logs[0].ParentRate, 0.000001)
	require.InDelta(t, 15, logs[0].CommissionAmount, 0.000001)
	require.Equal(t, rule.ID, *logs[0].RuleID)

	require.Equal(t, agent.ID, logs[1].BeneficiaryUserID)
	require.Equal(t, RoleAgent, logs[1].BeneficiaryRole)
	require.Equal(t, 2, logs[1].Level)
	require.InDelta(t, 0.20, logs[1].TargetRate, 0.000001)
	require.InDelta(t, 0.15, logs[1].ParentRate, 0.000001)
	require.InDelta(t, 5, logs[1].CommissionAmount, 0.000001)
	require.Equal(t, rule.ID, *logs[1].RuleID)

	relation, err := client.PromotionRelation.Query().
		Where(promotionrelation.UserIDEQ(consumer.ID)).
		Only(ctx)
	require.NoError(t, err)
	require.NotNil(t, relation.AgentUserID)
	require.NotNil(t, relation.DistributorUserID)
	require.Equal(t, agent.ID, *relation.AgentUserID)
	require.Equal(t, distributor.ID, *relation.DistributorUserID)

	storedRule, err := client.CommissionRule.Query().
		Where(commissionrule.IDEQ(rule.ID)).
		Only(ctx)
	require.NoError(t, err)
	require.Equal(t, commissionCalcModeDiff, storedRule.CalcMode)

	commissionLogCount, err := client.CommissionLog.Query().
		Where(
			commissionlog.OrderIDEQ(order.ID),
			commissionlog.UserIDEQ(distributor.ID),
		).
		Count(ctx)
	require.NoError(t, err)
	require.Equal(t, 1, commissionLogCount)

	pendingSplitCount, err := client.CommissionSplitLog.Query().
		Where(
			commissionsplitlog.OrderIDEQ(order.ID),
			commissionsplitlog.StatusEQ("pending"),
		).
		Count(ctx)
	require.NoError(t, err)
	require.Equal(t, 2, pendingSplitCount)
}

func TestAffiliateService_SettleCommissionSplit(t *testing.T) {
	client, _ := newPromotionTestClient(t, "promotion_settle_split_logs")
	ctx := context.Background()

	beneficiary := mustCreatePromotionUser(t, ctx, client, "agent-settle@test.com", RoleAgent, nil)
	consumer := mustCreatePromotionUser(t, ctx, client, "consumer-settle@test.com", RoleUser, nil)

	log, err := client.CommissionSplitLog.Create().
		SetConsumerUserID(consumer.ID).
		SetBeneficiaryUserID(beneficiary.ID).
		SetBeneficiaryRole(RoleAgent).
		SetLevel(1).
		SetCalcMode(commissionCalcModeDiff).
		SetBaseAmount(100).
		SetTargetRate(0.2).
		SetParentRate(0).
		SetCommissionAmount(20).
		SetStatus("pending").
		SetRemark("test pending split").
		Save(ctx)
	require.NoError(t, err)

	affiliateSvc := &AffiliateService{
		userRepo: &promotionUserRepo{client: client},
		dbClient: client,
	}

	err = affiliateSvc.SettleCommissionSplit(ctx, log.ID)
	require.NoError(t, err)

	updatedLog, err := client.CommissionSplitLog.Get(ctx, log.ID)
	require.NoError(t, err)
	require.Equal(t, "settled", updatedLog.Status)
	require.NotNil(t, updatedLog.SettledAt)

	updatedUser, err := client.User.Get(ctx, beneficiary.ID)
	require.NoError(t, err)
	require.InDelta(t, 20, updatedUser.CommissionBalance, 0.000001)
	require.InDelta(t, 20, updatedUser.TotalCommissionEarned, 0.000001)

	err = affiliateSvc.SettleCommissionSplit(ctx, log.ID)
	require.EqualError(t, err, "commission split log is not in pending status")
}
