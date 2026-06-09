package service

import (
	"context"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/dlxyz/SubioHub/ent/commissionlog"
	"github.com/dlxyz/SubioHub/internal/config"
	"github.com/dlxyz/SubioHub/internal/pkg/logger"
)

const affiliateSettlementWorkerName = "affiliate_commission_settlement_worker"

// AffiliateCommissionSettlementService 自动处理超出冻结期的待结算佣金。
type AffiliateCommissionSettlementService struct {
	affiliateSvc *AffiliateService
	settingSvc   *SettingService
	timingWheel  *TimingWheelService
	cfg          *config.Config

	running   int32
	startOnce sync.Once
	stopOnce  sync.Once

	workerCtx    context.Context
	workerCancel context.CancelFunc
}

func NewAffiliateCommissionSettlementService(affiliateSvc *AffiliateService, settingSvc *SettingService, timingWheel *TimingWheelService, cfg *config.Config) *AffiliateCommissionSettlementService {
	workerCtx, workerCancel := context.WithCancel(context.Background())
	return &AffiliateCommissionSettlementService{
		affiliateSvc: affiliateSvc,
		settingSvc:   settingSvc,
		timingWheel:  timingWheel,
		cfg:          cfg,
		workerCtx:    workerCtx,
		workerCancel: workerCancel,
	}
}

func (s *AffiliateCommissionSettlementService) Start() {
	if s == nil {
		return
	}
	if s.affiliateSvc == nil || s.timingWheel == nil {
		logger.LegacyPrintf("service.affiliate_settlement", "[AffiliateSettlement] not started (missing deps)")
		return
	}

	interval := s.workerInterval()
	s.startOnce.Do(func() {
		s.timingWheel.ScheduleRecurring(affiliateSettlementWorkerName, interval, s.runOnce)
		logger.LegacyPrintf(
			"service.affiliate_settlement",
			"[AffiliateSettlement] started (interval=%s freeze=%s batch_size=%d timeout=%s auto_enabled=%t)",
			interval,
			s.freezeWindow(),
			s.batchSize(),
			s.taskTimeout(),
			s.autoSettlementEnabled(context.Background()),
		)
	})
}

func (s *AffiliateCommissionSettlementService) Stop() {
	if s == nil {
		return
	}
	s.stopOnce.Do(func() {
		if s.workerCancel != nil {
			s.workerCancel()
		}
		if s.timingWheel != nil {
			s.timingWheel.Cancel(affiliateSettlementWorkerName)
		}
		logger.LegacyPrintf("service.affiliate_settlement", "[AffiliateSettlement] stopped")
	})
}

func (s *AffiliateCommissionSettlementService) runOnce() {
	if s == nil || s.affiliateSvc == nil {
		return
	}
	if !s.autoSettlementEnabled(context.Background()) {
		return
	}
	if !atomic.CompareAndSwapInt32(&s.running, 0, 1) {
		logger.LegacyPrintf("service.affiliate_settlement", "[AffiliateSettlement] run_once skipped: already_running=true")
		return
	}
	defer atomic.StoreInt32(&s.running, 0)

	parent := context.Background()
	if s.workerCtx != nil {
		parent = s.workerCtx
	}
	ctx, cancel := context.WithTimeout(parent, s.taskTimeout())
	defer cancel()

	cutoff := time.Now().Add(-s.freezeWindow())
	logs, err := s.affiliateSvc.dbClient.CommissionLog.Query().
		Where(
			commissionlog.StatusEQ("pending"),
			commissionlog.CreatedAtLTE(cutoff),
		).
		Order(commissionlog.ByCreatedAt()).
		Limit(s.batchSize()).
		All(ctx)
	if err != nil {
		logger.LegacyPrintf("service.affiliate_settlement", "[AffiliateSettlement] query pending logs failed: %v", err)
		return
	}
	if len(logs) == 0 {
		return
	}

	settledCount := 0
	cancelledCount := 0
	skippedCount := 0

	for _, log := range logs {
		if err := s.processOne(ctx, log.ID); err != nil {
			skippedCount++
			slog.Warn("affiliate settlement process failed", "commissionLogID", log.ID, "error", err)
			continue
		}

		updated, getErr := s.affiliateSvc.commissionRepo.GetByID(ctx, log.ID)
		if getErr != nil {
			continue
		}
		switch updated.Status {
		case "settled":
			settledCount++
		case "cancelled", "reversed":
			cancelledCount++
		default:
			skippedCount++
		}
	}

	logger.LegacyPrintf(
		"service.affiliate_settlement",
		"[AffiliateSettlement] batch finished: candidates=%d settled=%d cancelled=%d skipped=%d cutoff=%s",
		len(logs),
		settledCount,
		cancelledCount,
		skippedCount,
		cutoff.UTC().Format(time.RFC3339),
	)
}

func (s *AffiliateCommissionSettlementService) processOne(ctx context.Context, logID int64) error {
	log, err := s.affiliateSvc.commissionRepo.GetByID(ctx, logID)
	if err != nil {
		return err
	}
	if log.Status != "pending" {
		return nil
	}
	if log.OrderID == nil {
		return s.affiliateSvc.SettleCommission(ctx, logID)
	}

	order, err := s.affiliateSvc.dbClient.PaymentOrder.Get(ctx, *log.OrderID)
	if err != nil {
		// 订单不存在时不自动改写佣金，留给人工排查。
		return err
	}

	switch order.Status {
	case OrderStatusRefunded, OrderStatusPartiallyRefunded:
		return s.affiliateSvc.ClawbackCommission(ctx, logID)
	case OrderStatusRefundRequested, OrderStatusRefunding:
		return nil
	case OrderStatusCompleted:
		return s.affiliateSvc.SettleCommission(ctx, logID)
	default:
		// 对于仍未完成或状态异常的订单，不自动结算。
		return nil
	}
}

func (s *AffiliateCommissionSettlementService) workerInterval() time.Duration {
	if s != nil && s.cfg != nil && s.cfg.Affiliate.SettlementWorkerIntervalSeconds > 0 {
		return time.Duration(s.cfg.Affiliate.SettlementWorkerIntervalSeconds) * time.Second
	}
	return time.Minute
}

func (s *AffiliateCommissionSettlementService) freezeWindow() time.Duration {
	if s != nil && s.cfg != nil && s.cfg.Affiliate.SettlementFreezeHours > 0 {
		return time.Duration(s.cfg.Affiliate.SettlementFreezeHours) * time.Hour
	}
	return 7 * 24 * time.Hour
}

func (s *AffiliateCommissionSettlementService) batchSize() int {
	if s != nil && s.cfg != nil && s.cfg.Affiliate.SettlementBatchSize > 0 {
		return s.cfg.Affiliate.SettlementBatchSize
	}
	return 100
}

func (s *AffiliateCommissionSettlementService) taskTimeout() time.Duration {
	if s != nil && s.cfg != nil && s.cfg.Affiliate.SettlementTaskTimeoutSeconds > 0 {
		return time.Duration(s.cfg.Affiliate.SettlementTaskTimeoutSeconds) * time.Second
	}
	return 30 * time.Second
}

func (s *AffiliateCommissionSettlementService) autoSettlementEnabled(ctx context.Context) bool {
	if s != nil && s.settingSvc != nil {
		return s.settingSvc.IsAffiliateAutoSettlementEnabled(ctx)
	}
	return s != nil && s.cfg != nil && s.cfg.Affiliate.AutoSettlementEnabled
}
