package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	dbent "github.com/dlxyz/SubioHub/ent"
	"github.com/dlxyz/SubioHub/ent/commissionsplitlog"
	dbuser "github.com/dlxyz/SubioHub/ent/user"
	"github.com/dlxyz/SubioHub/internal/pkg/pagination"
)

type AffiliateService struct {
	commissionRepo CommissionRepo
	userRepo       UserRepository
	dbClient       *dbent.Client // For transactions
}

func NewAffiliateService(commissionRepo CommissionRepo, userRepo UserRepository, dbClient *dbent.Client) *AffiliateService {
	return &AffiliateService{
		commissionRepo: commissionRepo,
		userRepo:       userRepo,
		dbClient:       dbClient,
	}
}

// BindInviter binds an inviter to a newly registered user.
func (s *AffiliateService) BindInviter(ctx context.Context, userID, inviterID int64) error {
	if userID == inviterID {
		return errors.New("cannot bind self as inviter")
	}

	// Verify inviter exists
	inviter, err := s.userRepo.GetByID(ctx, inviterID)
	if err != nil {
		return fmt.Errorf("inviter not found: %w", err)
	}

	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return fmt.Errorf("user not found: %w", err)
	}

	// Update user to set inviter ID
	// Note: We might need a direct repo method for this to avoid overriding other fields if they changed concurrently.
	// But for now, we use the standard Update method.
	user.InviterID = &inviter.ID
	if err := s.userRepo.Update(ctx, user); err != nil {
		return err
	}
	return upsertPromotionRelationForInviter(ctx, s.dbClient, userID, &inviter.ID, "affiliate inviter binding")
}

// RecordPendingCommission creates a pending commission log for a given order amount.
func (s *AffiliateService) RecordPendingCommission(ctx context.Context, inviteeID int64, orderID int64, amount float64) error {
	// Find invitee to get their inviter
	invitee, err := s.userRepo.GetByID(ctx, inviteeID)
	if err != nil {
		return fmt.Errorf("invitee not found: %w", err)
	}

	if invitee.InviterID == nil {
		return nil // No inviter, no commission
	}

	inviterID := *invitee.InviterID
	inviter, err := s.userRepo.GetByID(ctx, inviterID)
	if err != nil {
		return fmt.Errorf("inviter not found: %w", err)
	}

	commissionAmount := amount * inviter.CommissionRate

	// Create pending commission log
	log := &CommissionLog{
		UserID:    inviterID,
		InviteeID: &inviteeID,
		OrderID:   &orderID,
		Amount:    commissionAmount,
		Status:    "pending", // Commission is frozen initially
		Reason:    fmt.Sprintf("Recharge reward from user ID %d", inviteeID),
	}

	return s.commissionRepo.Create(ctx, log)
}

// SettleCommission confirms a pending commission and adds it to the inviter's balance.
func (s *AffiliateService) SettleCommission(ctx context.Context, logID int64) error {
	// Need a transaction here
	tx, err := s.dbClient.Tx(ctx)
	if err != nil {
		return err
	}
	defer func() {
		if v := recover(); v != nil {
			_ = tx.Rollback()
			panic(v)
		}
	}()

	txCtx := dbent.NewTxContext(ctx, tx)

	log, err := s.commissionRepo.GetByID(txCtx, logID)
	if err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("get commission log: %w", err)
	}

	if log.Status != "pending" {
		_ = tx.Rollback()
		return errors.New("commission log is not in pending status")
	}

	// Update log status
	if err := s.commissionRepo.UpdateStatus(txCtx, logID, "settled"); err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("update log status: %w", err)
	}

	// Add to inviter's commission balance
	if err := s.userRepo.UpdateCommissionBalance(txCtx, log.UserID, log.Amount); err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("update commission balance: %w", err)
	}

	return tx.Commit()
}

// SettleCommissionSplit confirms a pending diff-based commission split and adds it to the beneficiary's commission balance.
func (s *AffiliateService) SettleCommissionSplit(ctx context.Context, logID int64) error {
	tx, err := s.dbClient.Tx(ctx)
	if err != nil {
		return err
	}
	defer func() {
		if v := recover(); v != nil {
			_ = tx.Rollback()
			panic(v)
		}
	}()

	txCtx := dbent.NewTxContext(ctx, tx)

	log, err := tx.CommissionSplitLog.Get(txCtx, logID)
	if err != nil {
		_ = tx.Rollback()
		if dbent.IsNotFound(err) {
			return errors.New("commission split log not found")
		}
		return fmt.Errorf("get commission split log: %w", err)
	}

	if log.Status != "pending" {
		_ = tx.Rollback()
		return errors.New("commission split log is not in pending status")
	}

	updated, err := tx.CommissionSplitLog.Update().
		Where(
			commissionsplitlog.IDEQ(logID),
			commissionsplitlog.StatusEQ("pending"),
		).
		SetStatus("settled").
		SetSettledAt(time.Now()).
		Save(txCtx)
	if err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("update commission split log status: %w", err)
	}
	if updated == 0 {
		_ = tx.Rollback()
		return errors.New("commission split log is not in pending status")
	}

	if err := s.userRepo.UpdateCommissionBalance(txCtx, log.BeneficiaryUserID, log.CommissionAmount); err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("update beneficiary commission balance: %w", err)
	}

	return tx.Commit()
}

// ClawbackCommission handles refunds by reversing the commission.
func (s *AffiliateService) ClawbackCommission(ctx context.Context, logID int64) error {
	tx, err := s.dbClient.Tx(ctx)
	if err != nil {
		return err
	}
	defer func() {
		if v := recover(); v != nil {
			_ = tx.Rollback()
			panic(v)
		}
	}()

	txCtx := dbent.NewTxContext(ctx, tx)

	log, err := s.commissionRepo.GetByID(txCtx, logID)
	if err != nil {
		_ = tx.Rollback()
		return err
	}

	switch log.Status {
	case "pending":
		// Simply cancel the pending commission
		if err := s.commissionRepo.UpdateStatus(txCtx, logID, "cancelled"); err != nil {
			_ = tx.Rollback()
			return err
		}
	case "settled":
		// Deduct from balance
		if err := s.userRepo.UpdateCommissionBalance(txCtx, log.UserID, -log.Amount); err != nil {
			_ = tx.Rollback()
			return err
		}
		// Update status to reversed
		if err := s.commissionRepo.UpdateStatus(txCtx, logID, "reversed"); err != nil {
			_ = tx.Rollback()
			return err
		}
	default:
		_ = tx.Rollback()
		return fmt.Errorf("cannot clawback commission in status: %s", log.Status)
	}

	return tx.Commit()
}

func (s *AffiliateService) ListUserCommissions(ctx context.Context, userID int64, params pagination.PaginationParams) ([]CommissionLog, *pagination.PaginationResult, error) {
	filters := CommissionLogListFilters{UserID: &userID}
	return s.commissionRepo.ListWithFilters(ctx, params, filters)
}

func (s *AffiliateService) GetPendingAmount(ctx context.Context, userID int64) (float64, error) {
	return s.commissionRepo.GetPendingAmount(ctx, userID)
}

// TransferToBalance transfers a specified amount from commission_balance to regular balance.
func (s *AffiliateService) TransferToBalance(ctx context.Context, userID int64, amount float64) error {
	if amount <= 0 {
		return errors.New("transfer amount must be positive")
	}

	tx, err := s.dbClient.Tx(ctx)
	if err != nil {
		return err
	}
	defer func() {
		if v := recover(); v != nil {
			_ = tx.Rollback()
			panic(v)
		}
	}()

	txCtx := dbent.NewTxContext(ctx, tx)

	// Check if user has enough commission balance
	user, err := s.userRepo.GetByID(txCtx, userID)
	if err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("get user: %w", err)
	}

	if user.CommissionBalance < amount {
		_ = tx.Rollback()
		return errors.New("insufficient commission balance")
	}

	// Deduct from commission balance
	// Note: UpdateCommissionBalance with negative amount will only deduct from CommissionBalance,
	// but currently it also updates TotalCommissionEarned if amount > 0.
	// Since we are passing negative amount, TotalCommissionEarned won't be touched.
	if err := s.userRepo.UpdateCommissionBalance(txCtx, userID, -amount); err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("deduct commission balance: %w", err)
	}

	// Add to regular balance
	// Use userRepo.UpdateBalance or similar. We need to check if we have a direct AddBalance repo method.
	// Currently userRepo has UpdateBalance which sets absolute balance.
	// We can use the entity client directly to atomically add balance:
	n, err := tx.User.Update().Where(dbuser.IDEQ(userID)).AddBalance(amount).Save(txCtx)
	if err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("add balance: %w", err)
	}
	if n == 0 {
		_ = tx.Rollback()
		return errors.New("user not found during balance update")
	}

	// Record a commission log for the transfer out
	log := &CommissionLog{
		UserID: userID,
		Amount: -amount,
		Status: "transferred",
		Reason: "Transferred commission to account balance",
	}
	if err := s.commissionRepo.Create(txCtx, log); err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("create transfer log: %w", err)
	}

	return tx.Commit()
}

// AdminListCommissions allows admins to list all commissions with optional filters.
func (s *AffiliateService) AdminListCommissions(ctx context.Context, params pagination.PaginationParams, filters CommissionLogListFilters) ([]CommissionLog, *pagination.PaginationResult, error) {
	return s.commissionRepo.ListWithFilters(ctx, params, filters)
}

func (s *AffiliateService) AdminListCommissionSplits(ctx context.Context, params pagination.PaginationParams, filters CommissionSplitLogListFilters) ([]CommissionSplitLog, *pagination.PaginationResult, error) {
	q := s.dbClient.CommissionSplitLog.Query().
		WithConsumerUser().
		WithBeneficiaryUser().
		WithPaymentOrder()

	if filters.BeneficiaryUserID != nil {
		q = q.Where(commissionsplitlog.BeneficiaryUserIDEQ(*filters.BeneficiaryUserID))
	}
	if filters.BeneficiaryRole != "" {
		q = q.Where(commissionsplitlog.BeneficiaryRoleEQ(filters.BeneficiaryRole))
	}
	if filters.Status != "" {
		q = q.Where(commissionsplitlog.StatusEQ(filters.Status))
	}

	total, err := q.Count(ctx)
	if err != nil {
		return nil, nil, fmt.Errorf("count commission split logs: %w", err)
	}

	entities, err := q.
		Limit(params.PageSize).
		Offset((params.Page - 1) * params.PageSize).
		Order(dbent.Desc(commissionsplitlog.FieldCreatedAt)).
		All(ctx)
	if err != nil {
		return nil, nil, fmt.Errorf("list commission split logs: %w", err)
	}

	items := make([]CommissionSplitLog, 0, len(entities))
	for _, item := range entities {
		row := CommissionSplitLog{
			ID:                   item.ID,
			OrderID:              item.OrderID,
			ConsumerUserID:       item.ConsumerUserID,
			BeneficiaryUserID:    item.BeneficiaryUserID,
			BeneficiaryRole:      item.BeneficiaryRole,
			ChannelPartnerUserID: item.ChannelPartnerUserID,
			AgentUserID:          item.AgentUserID,
			DistributorUserID:    item.DistributorUserID,
			Level:                item.Level,
			CalcMode:             item.CalcMode,
			BaseAmount:           item.BaseAmount,
			TargetRate:           item.TargetRate,
			ParentRate:           item.ParentRate,
			CommissionAmount:     item.CommissionAmount,
			Status:               item.Status,
			RuleID:               item.RuleID,
			Remark:               item.Remark,
			SettledAt:            item.SettledAt,
			CreatedAt:            item.CreatedAt,
			UpdatedAt:            item.UpdatedAt,
		}
		if item.Edges.ConsumerUser != nil {
			row.ConsumerUserEmail = item.Edges.ConsumerUser.Email
		}
		if item.Edges.BeneficiaryUser != nil {
			row.BeneficiaryEmail = item.Edges.BeneficiaryUser.Email
		}
		if item.Edges.PaymentOrder != nil {
			row.OrderType = item.Edges.PaymentOrder.OrderType
			row.OrderStatus = item.Edges.PaymentOrder.Status
		}
		items = append(items, row)
	}

	pages := 0
	if params.PageSize > 0 {
		pages = (total + params.PageSize - 1) / params.PageSize
	}
	return items, &pagination.PaginationResult{
		Total:    int64(total),
		Page:     params.Page,
		PageSize: params.PageSize,
		Pages:    pages,
	}, nil
}

// AdminUpdateUserCommissionRate updates a specific user's commission rate.
func (s *AffiliateService) AdminUpdateUserCommissionRate(ctx context.Context, userID int64, rate float64) error {
	if rate < 0 || rate > 1 {
		return errors.New("commission rate must be between 0 and 1")
	}

	n, err := s.dbClient.User.Update().
		Where(dbuser.IDEQ(userID)).
		SetCommissionRate(rate).
		Save(ctx)

	if err != nil {
		return fmt.Errorf("update commission rate: %w", err)
	}
	if n == 0 {
		return errors.New("user not found")
	}
	return nil
}
