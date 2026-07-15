package service

import (
	"context"
	"time"

	"github.com/dlxyz/SubioHub/internal/pkg/pagination"
)

type CommissionLog struct {
	ID        int64
	UserID    int64  // 受益人
	InviteeID *int64 // 贡献人（被邀请人），划转等非邀请场景可为空
	OrderID   *int64
	Amount    float64
	Status    string // pending, settled, transferred, withdrawn
	Reason    string
	CreatedAt time.Time
	UpdatedAt time.Time
}

type CommissionLogListFilters struct {
	UserID *int64
	Status string
}

type CommissionSplitLog struct {
	ID                   int64
	OrderID              *int64
	ConsumerUserID       int64
	ConsumerUserEmail    string
	BeneficiaryUserID    int64
	BeneficiaryEmail     string
	BeneficiaryRole      string
	ChannelPartnerUserID *int64
	AgentUserID          *int64
	DistributorUserID    *int64
	Level                int
	CalcMode             string
	BaseAmount           float64
	TargetRate           float64
	ParentRate           float64
	CommissionAmount     float64
	Status               string
	RuleID               *int64
	Remark               *string
	OrderType            string
	OrderStatus          string
	SettledAt            *time.Time
	CreatedAt            time.Time
	UpdatedAt            time.Time
}

type CommissionSplitLogListFilters struct {
	BeneficiaryUserID *int64
	BeneficiaryRole   string
	Status            string
}

type CommissionRepo interface {
	Create(ctx context.Context, log *CommissionLog) error
	GetByID(ctx context.Context, id int64) (*CommissionLog, error)
	UpdateStatus(ctx context.Context, id int64, status string) error
	ListWithFilters(ctx context.Context, params pagination.PaginationParams, filters CommissionLogListFilters) ([]CommissionLog, *pagination.PaginationResult, error)
	GetPendingAmount(ctx context.Context, userID int64) (float64, error)
}
