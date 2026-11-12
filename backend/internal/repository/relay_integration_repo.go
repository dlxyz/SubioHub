package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/dlxyz/SubioHub/internal/service"
)

type relayIntegrationRepository struct {
	db *sql.DB
}

// NewRelayIntegrationRepository 创建第三方接入数据访问实例。
func NewRelayIntegrationRepository(db *sql.DB) service.RelayIntegrationRepository {
	return &relayIntegrationRepository{db: db}
}

func (r *relayIntegrationRepository) Create(ctx context.Context, integration *service.RelayIntegration) error {
	catalog, err := marshalRelayModelCatalog(integration.ModelCatalog)
	if err != nil {
		return err
	}
	err = r.db.QueryRowContext(ctx, `
		INSERT INTO relay_integrations (
			name, provider_key, base_url, group_id, channel_id, primary_account_id,
			status, model_catalog, last_synced_at, last_sync_status, last_sync_error, created_by
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		RETURNING id, created_at, updated_at`,
		integration.Name,
		integration.ProviderKey,
		integration.BaseURL,
		integration.GroupID,
		integration.ChannelID,
		integration.PrimaryAccountID,
		integration.Status,
		catalog,
		integration.LastSyncedAt,
		integration.LastSyncStatus,
		integration.LastSyncError,
		integration.CreatedBy,
	).Scan(&integration.ID, &integration.CreatedAt, &integration.UpdatedAt)
	if err != nil {
		if isUniqueViolation(err) {
			return fmt.Errorf("relay integration name already exists: %w", err)
		}
		return fmt.Errorf("insert relay integration: %w", err)
	}
	return nil
}

func (r *relayIntegrationRepository) GetByID(ctx context.Context, id int64) (*service.RelayIntegration, error) {
	integration := &service.RelayIntegration{}
	var catalog []byte
	var lastSyncedAt sql.NullTime
	var primaryAccountID, createdBy sql.NullInt64
	err := r.db.QueryRowContext(ctx, `
		SELECT id, name, provider_key, base_url, group_id, channel_id, primary_account_id,
		       status, model_catalog, last_synced_at, last_sync_status, last_sync_error,
		       created_by, created_at, updated_at
		FROM relay_integrations
		WHERE id = $1 AND deleted_at IS NULL`, id,
	).Scan(
		&integration.ID,
		&integration.Name,
		&integration.ProviderKey,
		&integration.BaseURL,
		&integration.GroupID,
		&integration.ChannelID,
		&primaryAccountID,
		&integration.Status,
		&catalog,
		&lastSyncedAt,
		&integration.LastSyncStatus,
		&integration.LastSyncError,
		&createdBy,
		&integration.CreatedAt,
		&integration.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("relay integration not found")
	}
	if err != nil {
		return nil, fmt.Errorf("get relay integration: %w", err)
	}
	if lastSyncedAt.Valid {
		integration.LastSyncedAt = &lastSyncedAt.Time
	}
	if primaryAccountID.Valid {
		integration.PrimaryAccountID = &primaryAccountID.Int64
	}
	if createdBy.Valid {
		integration.CreatedBy = &createdBy.Int64
	}
	integration.ModelCatalog = unmarshalRelayModelCatalog(catalog)
	return integration, nil
}

func (r *relayIntegrationRepository) List(ctx context.Context) ([]*service.RelayIntegration, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, name, provider_key, base_url, group_id, channel_id, primary_account_id,
		       status, model_catalog, last_synced_at, last_sync_status, last_sync_error,
		       created_by, created_at, updated_at
		FROM relay_integrations
		WHERE deleted_at IS NULL
		ORDER BY id DESC`)
	if err != nil {
		return nil, fmt.Errorf("list relay integrations: %w", err)
	}
	defer func() { _ = rows.Close() }()

	integrations := make([]*service.RelayIntegration, 0)
	for rows.Next() {
		integration := &service.RelayIntegration{}
		var catalog []byte
		var lastSyncedAt sql.NullTime
		var primaryAccountID, createdBy sql.NullInt64
		if err := rows.Scan(
			&integration.ID,
			&integration.Name,
			&integration.ProviderKey,
			&integration.BaseURL,
			&integration.GroupID,
			&integration.ChannelID,
			&primaryAccountID,
			&integration.Status,
			&catalog,
			&lastSyncedAt,
			&integration.LastSyncStatus,
			&integration.LastSyncError,
			&createdBy,
			&integration.CreatedAt,
			&integration.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan relay integration: %w", err)
		}
		if lastSyncedAt.Valid {
			integration.LastSyncedAt = &lastSyncedAt.Time
		}
		if primaryAccountID.Valid {
			integration.PrimaryAccountID = &primaryAccountID.Int64
		}
		if createdBy.Valid {
			integration.CreatedBy = &createdBy.Int64
		}
		integration.ModelCatalog = unmarshalRelayModelCatalog(catalog)
		integrations = append(integrations, integration)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate relay integrations: %w", err)
	}
	return integrations, nil
}

func (r *relayIntegrationRepository) Update(ctx context.Context, integration *service.RelayIntegration) error {
	catalog, err := marshalRelayModelCatalog(integration.ModelCatalog)
	if err != nil {
		return err
	}
	result, err := r.db.ExecContext(ctx, `
		UPDATE relay_integrations
		SET name = $1, provider_key = $2, base_url = $3, group_id = $4, channel_id = $5,
		    primary_account_id = $6, status = $7, model_catalog = $8, last_synced_at = $9,
		    last_sync_status = $10, last_sync_error = $11, updated_at = NOW()
		WHERE id = $12 AND deleted_at IS NULL`,
		integration.Name,
		integration.ProviderKey,
		integration.BaseURL,
		integration.GroupID,
		integration.ChannelID,
		integration.PrimaryAccountID,
		integration.Status,
		catalog,
		integration.LastSyncedAt,
		integration.LastSyncStatus,
		integration.LastSyncError,
		integration.ID,
	)
	if err != nil {
		return fmt.Errorf("update relay integration: %w", err)
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		return fmt.Errorf("relay integration not found")
	}
	return nil
}

func (r *relayIntegrationRepository) SoftDelete(ctx context.Context, id int64) error {
	result, err := r.db.ExecContext(ctx, `
		UPDATE relay_integrations
		SET deleted_at = NOW(), status = $1, updated_at = NOW()
		WHERE id = $2 AND deleted_at IS NULL`, service.RelayStatusDisabled, id)
	if err != nil {
		return fmt.Errorf("delete relay integration: %w", err)
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		return fmt.Errorf("relay integration not found")
	}
	return nil
}

func marshalRelayModelCatalog(models []service.RelayModel) ([]byte, error) {
	if models == nil {
		models = []service.RelayModel{}
	}
	payload, err := json.Marshal(models)
	if err != nil {
		return nil, fmt.Errorf("marshal relay model catalog: %w", err)
	}
	return payload, nil
}

func unmarshalRelayModelCatalog(payload []byte) []service.RelayModel {
	if len(payload) == 0 {
		return []service.RelayModel{}
	}
	var models []service.RelayModel
	if err := json.Unmarshal(payload, &models); err != nil {
		return []service.RelayModel{}
	}
	if models == nil {
		return []service.RelayModel{}
	}
	return models
}
