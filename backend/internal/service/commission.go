package service

import (
	"context"
	"time"

	"github.com/dlxyz/SubioHub/internal/pkg/pagination"
)

type CommissionLog struct {
	ID        int64
	UserID    int64 // 受益人
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

type CommissionRepo interface {
	Create(ctx context.Context, log *CommissionLog) error
	GetByID(ctx context.Context, id int64) (*CommissionLog, error)
	UpdateStatus(ctx context.Context, id int64, status string) error
	ListWithFilters(ctx context.Context, params pagination.PaginationParams, filters CommissionLogListFilters) ([]CommissionLog, *pagination.PaginationResult, error)
	GetPendingAmount(ctx context.Context, userID int64) (float64, error)
}
