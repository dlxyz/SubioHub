package repository

import (
	"context"
	"errors"

	dbent "github.com/dlxyz/SubioHub/ent"
	"github.com/dlxyz/SubioHub/ent/commissionlog"
	"github.com/dlxyz/SubioHub/internal/pkg/pagination"
	"github.com/dlxyz/SubioHub/internal/service"
)

type commissionRepo struct {
	client *dbent.Client
}

func NewCommissionRepo(client *dbent.Client) service.CommissionRepo {
	return &commissionRepo{client: client}
}

func (r *commissionRepo) Create(ctx context.Context, log *service.CommissionLog) error {
	if log == nil {
		return nil
	}

	client := clientFromContext(ctx, r.client)
	createOp := client.CommissionLog.Create().
		SetUserID(log.UserID).
		SetNillableInviteeID(log.InviteeID).
		SetAmount(log.Amount).
		SetStatus(log.Status).
		SetReason(log.Reason)
	if log.OrderID != nil {
		createOp.SetOrderID(*log.OrderID)
	}
	created, err := createOp.Save(ctx)
	if err != nil {
		return err
	}

	log.ID = created.ID
	log.CreatedAt = created.CreatedAt
	log.UpdatedAt = created.UpdatedAt
	return nil
}

func (r *commissionRepo) GetByID(ctx context.Context, id int64) (*service.CommissionLog, error) {
	client := clientFromContext(ctx, r.client)
	m, err := client.CommissionLog.Query().Where(commissionlog.IDEQ(id)).Only(ctx)
	if err != nil {
		if dbent.IsNotFound(err) {
			return nil, errors.New("commission log not found")
		}
		return nil, err
	}

	return &service.CommissionLog{
		ID:        m.ID,
		UserID:    m.UserID,
		InviteeID: m.InviteeID,
		OrderID:   m.OrderID,
		Amount:    m.Amount,
		Status:    m.Status,
		Reason:    m.Reason,
		CreatedAt: m.CreatedAt,
		UpdatedAt: m.UpdatedAt,
	}, nil
}

func (r *commissionRepo) UpdateStatus(ctx context.Context, id int64, status string) error {
	client := clientFromContext(ctx, r.client)
	_, err := client.CommissionLog.UpdateOneID(id).SetStatus(status).Save(ctx)
	if err != nil {
		if dbent.IsNotFound(err) {
			return errors.New("commission log not found")
		}
		return err
	}
	return nil
}

func (r *commissionRepo) ListWithFilters(ctx context.Context, params pagination.PaginationParams, filters service.CommissionLogListFilters) ([]service.CommissionLog, *pagination.PaginationResult, error) {
	client := clientFromContext(ctx, r.client)
	q := client.CommissionLog.Query()

	if filters.UserID != nil {
		q = q.Where(commissionlog.UserIDEQ(*filters.UserID))
	}
	if filters.Status != "" {
		q = q.Where(commissionlog.StatusEQ(filters.Status))
	}

	total, err := q.Count(ctx)
	if err != nil {
		return nil, nil, err
	}

	q = q.Limit(params.PageSize).Offset((params.Page - 1) * params.PageSize)

	// Order by descending CreatedAt
	q = q.Order(dbent.Desc(commissionlog.FieldCreatedAt))

	entities, err := q.All(ctx)
	if err != nil {
		return nil, nil, err
	}

	var out []service.CommissionLog
	for _, m := range entities {
		out = append(out, service.CommissionLog{
			ID:        m.ID,
			UserID:    m.UserID,
			InviteeID: m.InviteeID,
			OrderID:   m.OrderID,
			Amount:    m.Amount,
			Status:    m.Status,
			Reason:    m.Reason,
			CreatedAt: m.CreatedAt,
			UpdatedAt: m.UpdatedAt,
		})
	}

	pages := 0
	if params.PageSize > 0 {
		pages = (total + params.PageSize - 1) / params.PageSize
	}
	return out, &pagination.PaginationResult{
		Total:    int64(total),
		Page:     params.Page,
		PageSize: params.PageSize,
		Pages:    pages,
	}, nil
}

func (r *commissionRepo) GetPendingAmount(ctx context.Context, userID int64) (float64, error) {
	client := clientFromContext(ctx, r.client)

	// Check if there are any records first
	count, err := client.CommissionLog.Query().
		Where(commissionlog.UserIDEQ(userID), commissionlog.StatusEQ("pending")).
		Count(ctx)
	if err != nil {
		return 0, err
	}
	if count == 0 {
		return 0, nil
	}

	var sum []struct {
		Sum float64 `ent:"sum"`
	}
	err = client.CommissionLog.Query().
		Where(commissionlog.UserIDEQ(userID), commissionlog.StatusEQ("pending")).
		Aggregate(
			dbent.Sum(commissionlog.FieldAmount),
		).
		Scan(ctx, &sum)
	if err != nil {
		return 0, err
	}
	if len(sum) == 0 {
		return 0, nil
	}
	return sum[0].Sum, nil
}
