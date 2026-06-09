//go:build integration

package repository

import (
	"context"
	"testing"
	"time"

	dbent "github.com/dlxyz/SubioHub/ent"
	"github.com/dlxyz/SubioHub/internal/service"
	"github.com/stretchr/testify/suite"
)

type CommissionRepoSuite struct {
	suite.Suite
	ctx      context.Context
	client   *dbent.Client
	userRepo *userRepository
	repo     *commissionRepo
}

func (s *CommissionRepoSuite) SetupTest() {
	s.ctx = context.Background()
	s.client = testEntClient(s.T())
	s.userRepo = newUserRepositoryWithSQL(s.client, integrationDB)
	s.repo = NewCommissionRepo(s.client).(*commissionRepo)

	_, _ = integrationDB.ExecContext(s.ctx, "DELETE FROM commission_logs")
	_, _ = integrationDB.ExecContext(s.ctx, "DELETE FROM users")
}

func TestCommissionRepoSuite(t *testing.T) {
	suite.Run(t, new(CommissionRepoSuite))
}

func (s *CommissionRepoSuite) mustCreateUser(u *service.User) *service.User {
	s.T().Helper()

	if u.Email == "" {
		u.Email = "commission-user-" + time.Now().Format(time.RFC3339Nano) + "@example.com"
	}
	if u.PasswordHash == "" {
		u.PasswordHash = "test-password-hash"
	}
	if u.Role == "" {
		u.Role = service.RoleUser
	}
	if u.Status == "" {
		u.Status = service.StatusActive
	}
	if u.Concurrency == 0 {
		u.Concurrency = 5
	}

	s.Require().NoError(s.userRepo.Create(s.ctx, u), "create user")
	return u
}

func (s *CommissionRepoSuite) TestCreate_AllowsNilInviteeID() {
	user := s.mustCreateUser(&service.User{Email: "beneficiary@test.com"})
	log := &service.CommissionLog{
		UserID: user.ID,
		Amount: -12.5,
		Status: "transferred",
		Reason: "Transferred commission to account balance",
	}

	err := s.repo.Create(s.ctx, log)
	s.Require().NoError(err, "Create")
	s.Require().NotZero(log.ID, "expected ID to be set")

	got, err := s.repo.GetByID(s.ctx, log.ID)
	s.Require().NoError(err, "GetByID")
	s.Require().Nil(got.InviteeID, "expected invitee_id to remain nil")
	s.Require().Equal("transferred", got.Status)
	s.Require().Equal(-12.5, got.Amount)
}
