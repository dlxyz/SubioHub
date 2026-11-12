package repository

import (
	"context"
	"database/sql"
	"testing"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
	"github.com/dlxyz/SubioHub/internal/service"
	"github.com/stretchr/testify/require"
)

func TestDeductUsageBillingBalance_Success(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	mock.ExpectBegin()
	tx, err := db.Begin()
	require.NoError(t, err)

	mock.ExpectQuery("UPDATE users").
		WithArgs(10.0, int64(1)).
		WillReturnRows(sqlmock.NewRows([]string{"balance"}).AddRow(90.0))

	balance, err := deductUsageBillingBalance(context.Background(), tx, 1, 10)
	require.NoError(t, err)
	require.InDelta(t, 90.0, balance, 1e-9)

	mock.ExpectRollback()
	require.NoError(t, tx.Rollback())
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestDeductUsageBillingBalance_Insufficient(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	mock.ExpectBegin()
	tx, err := db.Begin()
	require.NoError(t, err)

	// 条件更新没有命中行，说明余额不足（或用户不存在）。
	mock.ExpectQuery("UPDATE users").
		WithArgs(10.0, int64(1)).
		WillReturnError(sql.ErrNoRows)

	_, err = deductUsageBillingBalance(context.Background(), tx, 1, 10)
	require.ErrorIs(t, err, service.ErrInsufficientBalance)

	mock.ExpectRollback()
	require.NoError(t, tx.Rollback())
	require.NoError(t, mock.ExpectationsWereMet())
}
