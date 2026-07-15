package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	dbent "github.com/dlxyz/SubioHub/ent"
	"github.com/dlxyz/SubioHub/ent/apikey"
	dbgroup "github.com/dlxyz/SubioHub/ent/group"
	dbuser "github.com/dlxyz/SubioHub/ent/user"
	"github.com/dlxyz/SubioHub/ent/userallowedgroup"
	"github.com/dlxyz/SubioHub/ent/usersubscription"
	"github.com/dlxyz/SubioHub/internal/pkg/pagination"
	"github.com/dlxyz/SubioHub/internal/service"

	entsql "entgo.io/ent/dialect/sql"
)

type userRepository struct {
	client *dbent.Client
	sql    sqlExecutor
}

func NewUserRepository(client *dbent.Client, sqlDB *sql.DB) service.UserRepository {
	return newUserRepositoryWithSQL(client, sqlDB)
}

func newUserRepositoryWithSQL(client *dbent.Client, sqlq sqlExecutor) *userRepository {
	return &userRepository{client: client, sql: sqlq}
}

func (r *userRepository) Create(ctx context.Context, userIn *service.User) error {
	if userIn == nil {
		return nil
	}

	// Use an ent transaction so the user row and allowed-group bindings stay atomic.
	// This also avoids manually building an ent client from *sql.Tx.
	tx, err := r.client.Tx(ctx)
	if err != nil && !errors.Is(err, dbent.ErrTxStarted) {
		return err
	}

	var txClient *dbent.Client
	if err == nil {
		defer func() { _ = tx.Rollback() }()
		txClient = tx.Client()
	} else {
		// Already inside an outer transaction. Reuse the current client and let the caller finish it.
		txClient = r.client
	}

	var (
		created   *dbent.User
		createErr error
	)
	for attempt := 0; attempt < 5; attempt++ {
		inviteCode := strings.ToUpper(strings.TrimSpace(userIn.InviteCode))
		if inviteCode == "" {
			inviteCode, createErr = service.NewInviteCode()
			if createErr != nil {
				return createErr
			}
		}

		createOp := txClient.User.Create().
			SetEmail(userIn.Email).
			SetUsername(userIn.Username).
			SetNotes(userIn.Notes).
			SetPasswordHash(userIn.PasswordHash).
			SetRole(userIn.Role).
			SetBalance(userIn.Balance).
			SetConcurrency(userIn.Concurrency).
			SetStatus(userIn.Status).
			SetInviteCode(inviteCode).
			SetNillableInviterID(userIn.InviterID).
			SetNillableChannelPartnerID(userIn.ChannelPartnerID).
			SetNillableAgentOwnerID(userIn.AgentOwnerID).
			SetNillableDistributorOwnerID(userIn.DistributorOwnerID)
		created, createErr = createOp.Save(ctx)
		if createErr == nil {
			userIn.InviteCode = inviteCode
			break
		}
		if isInviteCodeConstraintError(createErr) && strings.TrimSpace(userIn.InviteCode) == "" {
			continue
		}
		return translatePersistenceError(createErr, nil, service.ErrEmailExists)
	}
	if createErr != nil {
		return translatePersistenceError(createErr, nil, service.ErrEmailExists)
	}

	if err := r.syncUserAllowedGroupsWithClient(ctx, txClient, created.ID, userIn.AllowedGroups); err != nil {
		return err
	}

	if tx != nil {
		if err := tx.Commit(); err != nil {
			return err
		}
	}

	applyUserEntityToService(userIn, created)
	return nil
}

func (r *userRepository) GetByID(ctx context.Context, id int64) (*service.User, error) {
	m, err := r.client.User.Query().Where(dbuser.IDEQ(id)).Only(ctx)
	if err != nil {
		return nil, translatePersistenceError(err, service.ErrUserNotFound, nil)
	}

	out := userEntityToService(m)
	groups, err := r.loadAllowedGroups(ctx, []int64{id})
	if err != nil {
		return nil, err
	}
	if v, ok := groups[id]; ok {
		out.AllowedGroups = v
	}
	return out, nil
}

func (r *userRepository) GetByEmail(ctx context.Context, email string) (*service.User, error) {
	m, err := r.client.User.Query().Where(dbuser.EmailEQ(email)).Only(ctx)
	if err != nil {
		return nil, translatePersistenceError(err, service.ErrUserNotFound, nil)
	}

	out := userEntityToService(m)
	groups, err := r.loadAllowedGroups(ctx, []int64{m.ID})
	if err != nil {
		return nil, err
	}
	if v, ok := groups[m.ID]; ok {
		out.AllowedGroups = v
	}
	return out, nil
}

func (r *userRepository) Update(ctx context.Context, userIn *service.User) error {
	if userIn == nil {
		return nil
	}

	// Wrap the user update and allowed-group sync in the same ent transaction.
	tx, err := r.client.Tx(ctx)
	if err != nil && !errors.Is(err, dbent.ErrTxStarted) {
		return err
	}

	var txClient *dbent.Client
	if err == nil {
		defer func() { _ = tx.Rollback() }()
		txClient = tx.Client()
	} else {
		// Already inside an outer transaction. Reuse the current client and let the caller finish it.
		txClient = r.client
	}

	updateOp := txClient.User.UpdateOneID(userIn.ID).
		SetEmail(userIn.Email).
		SetUsername(userIn.Username).
		SetNotes(userIn.Notes).
		SetPasswordHash(userIn.PasswordHash).
		SetRole(userIn.Role).
		SetBalance(userIn.Balance).
		SetConcurrency(userIn.Concurrency).
		SetStatus(userIn.Status).
		SetBalanceNotifyEnabled(userIn.BalanceNotifyEnabled).
		SetBalanceNotifyThresholdType(userIn.BalanceNotifyThresholdType).
		SetNillableBalanceNotifyThreshold(userIn.BalanceNotifyThreshold).
		SetBalanceNotifyExtraEmails(marshalExtraEmails(userIn.BalanceNotifyExtraEmails)).
		SetTotalRecharged(userIn.TotalRecharged).
		SetIsKeyAccount(userIn.IsKeyAccount).
		SetKeyAccountLevel(userIn.KeyAccountLevel).
		SetKeyAccountDiscountRate(userIn.KeyAccountDiscountRate).
		SetKeyAccountRebateRate(userIn.KeyAccountRebateRate).
		SetKeyAccountManagerNotes(userIn.KeyAccountManagerNotes)
	if userIn.InviterID != nil {
		updateOp = updateOp.SetInviterID(*userIn.InviterID)
	} else {
		updateOp = updateOp.ClearInviterID()
	}
	if userIn.ChannelPartnerID != nil {
		updateOp = updateOp.SetChannelPartnerID(*userIn.ChannelPartnerID)
	} else {
		updateOp = updateOp.ClearChannelPartnerID()
	}
	if userIn.AgentOwnerID != nil {
		updateOp = updateOp.SetAgentOwnerID(*userIn.AgentOwnerID)
	} else {
		updateOp = updateOp.ClearAgentOwnerID()
	}
	if userIn.DistributorOwnerID != nil {
		updateOp = updateOp.SetDistributorOwnerID(*userIn.DistributorOwnerID)
	} else {
		updateOp = updateOp.ClearDistributorOwnerID()
	}
	if inviteCode := strings.ToUpper(strings.TrimSpace(userIn.InviteCode)); inviteCode != "" {
		updateOp = updateOp.SetInviteCode(inviteCode)
	}
	if userIn.BalanceNotifyThreshold == nil {
		updateOp = updateOp.ClearBalanceNotifyThreshold()
	}
	updated, err := updateOp.Save(ctx)
	if err != nil {
		return translatePersistenceError(err, service.ErrUserNotFound, service.ErrEmailExists)
	}

	if err := r.syncUserAllowedGroupsWithClient(ctx, txClient, updated.ID, userIn.AllowedGroups); err != nil {
		return err
	}

	if tx != nil {
		if err := tx.Commit(); err != nil {
			return err
		}
	}

	userIn.UpdatedAt = updated.UpdatedAt
	return nil
}

func (r *userRepository) Delete(ctx context.Context, id int64) error {
	affected, err := r.client.User.Delete().Where(dbuser.IDEQ(id)).Exec(ctx)
	if err != nil {
		return translatePersistenceError(err, service.ErrUserNotFound, nil)
	}
	if affected == 0 {
		return service.ErrUserNotFound
	}
	return nil
}

func (r *userRepository) List(ctx context.Context, params pagination.PaginationParams) ([]service.User, *pagination.PaginationResult, error) {
	return r.ListWithFilters(ctx, params, service.UserListFilters{})
}

func (r *userRepository) ListWithFilters(ctx context.Context, params pagination.PaginationParams, filters service.UserListFilters) ([]service.User, *pagination.PaginationResult, error) {
	q := r.client.User.Query()

	if filters.Status != "" {
		q = q.Where(dbuser.StatusEQ(filters.Status))
	}
	if filters.Role != "" {
		q = q.Where(dbuser.RoleEQ(filters.Role))
	}
	if filters.ChannelPartnerID != nil {
		q = q.Where(dbuser.ChannelPartnerIDEQ(*filters.ChannelPartnerID))
	}
	if filters.AgentOwnerID != nil {
		q = q.Where(dbuser.AgentOwnerIDEQ(*filters.AgentOwnerID))
	}
	if filters.DistributorOwnerID != nil {
		q = q.Where(dbuser.DistributorOwnerIDEQ(*filters.DistributorOwnerID))
	}
	if filters.IsKeyAccount != nil {
		q = q.Where(dbuser.IsKeyAccountEQ(*filters.IsKeyAccount))
	}
	if filters.KeyAccountLevel != "" {
		q = q.Where(dbuser.KeyAccountLevelEQ(filters.KeyAccountLevel))
	}
	if filters.Search != "" {
		q = q.Where(
			dbuser.Or(
				dbuser.EmailContainsFold(filters.Search),
				dbuser.UsernameContainsFold(filters.Search),
				dbuser.NotesContainsFold(filters.Search),
				dbuser.HasAPIKeysWith(apikey.KeyContainsFold(filters.Search)),
			),
		)
	}

	if filters.GroupName != "" {
		q = q.Where(dbuser.HasAllowedGroupsWith(
			dbgroup.NameContainsFold(filters.GroupName),
		))
	}

	// If attribute filters are specified, we need to filter by user IDs first
	var allowedUserIDs []int64
	if len(filters.Attributes) > 0 {
		var attrErr error
		allowedUserIDs, attrErr = r.filterUsersByAttributes(ctx, filters.Attributes)
		if attrErr != nil {
			return nil, nil, attrErr
		}
		if len(allowedUserIDs) == 0 {
			// No users match the attribute filters
			return []service.User{}, paginationResultFromTotal(0, params), nil
		}
		q = q.Where(dbuser.IDIn(allowedUserIDs...))
	}

	total, err := q.Clone().Count(ctx)
	if err != nil {
		return nil, nil, err
	}

	usersQuery := q.
		Offset(params.Offset()).
		Limit(params.Limit())
	for _, order := range userListOrder(params) {
		usersQuery = usersQuery.Order(order)
	}

	users, err := usersQuery.All(ctx)
	if err != nil {
		return nil, nil, err
	}

	outUsers := make([]service.User, 0, len(users))
	if len(users) == 0 {
		return outUsers, paginationResultFromTotal(int64(total), params), nil
	}

	userIDs := make([]int64, 0, len(users))
	userMap := make(map[int64]*service.User, len(users))
	for i := range users {
		userIDs = append(userIDs, users[i].ID)
		u := userEntityToService(users[i])
		outUsers = append(outUsers, *u)
		userMap[u.ID] = &outUsers[len(outUsers)-1]
	}

	shouldLoadSubscriptions := filters.IncludeSubscriptions == nil || *filters.IncludeSubscriptions
	if shouldLoadSubscriptions {
		// Batch load active subscriptions with groups to avoid N+1.
		subs, err := r.client.UserSubscription.Query().
			Where(
				usersubscription.UserIDIn(userIDs...),
				usersubscription.StatusEQ(service.SubscriptionStatusActive),
			).
			WithGroup().
			All(ctx)
		if err != nil {
			return nil, nil, err
		}

		for i := range subs {
			if u, ok := userMap[subs[i].UserID]; ok {
				u.Subscriptions = append(u.Subscriptions, *userSubscriptionEntityToService(subs[i]))
			}
		}
	}

	allowedGroupsByUser, err := r.loadAllowedGroups(ctx, userIDs)
	if err != nil {
		return nil, nil, err
	}
	for id, u := range userMap {
		if groups, ok := allowedGroupsByUser[id]; ok {
			u.AllowedGroups = groups
		}
	}

	return outUsers, paginationResultFromTotal(int64(total), params), nil
}

func userListOrder(params pagination.PaginationParams) []func(*entsql.Selector) {
	sortBy := strings.ToLower(strings.TrimSpace(params.SortBy))
	sortOrder := params.NormalizedSortOrder(pagination.SortOrderDesc)

	var field string
	defaultField := true
	switch sortBy {
	case "email":
		field = dbuser.FieldEmail
		defaultField = false
	case "username":
		field = dbuser.FieldUsername
		defaultField = false
	case "role":
		field = dbuser.FieldRole
		defaultField = false
	case "balance":
		field = dbuser.FieldBalance
		defaultField = false
	case "concurrency":
		field = dbuser.FieldConcurrency
		defaultField = false
	case "status":
		field = dbuser.FieldStatus
		defaultField = false
	case "created_at":
		field = dbuser.FieldCreatedAt
		defaultField = false
	default:
		field = dbuser.FieldID
	}

	if sortOrder == pagination.SortOrderAsc {
		if defaultField && field == dbuser.FieldID {
			return []func(*entsql.Selector){dbent.Asc(dbuser.FieldID)}
		}
		return []func(*entsql.Selector){dbent.Asc(field), dbent.Asc(dbuser.FieldID)}
	}
	if defaultField && field == dbuser.FieldID {
		return []func(*entsql.Selector){dbent.Desc(dbuser.FieldID)}
	}
	return []func(*entsql.Selector){dbent.Desc(field), dbent.Desc(dbuser.FieldID)}
}

// filterUsersByAttributes returns user IDs that match ALL the given attribute filters
func (r *userRepository) filterUsersByAttributes(ctx context.Context, attrs map[int64]string) ([]int64, error) {
	if len(attrs) == 0 {
		return nil, nil
	}

	if r.sql == nil {
		return nil, fmt.Errorf("sql executor is not configured")
	}

	clauses := make([]string, 0, len(attrs))
	args := make([]any, 0, len(attrs)*2+1)
	argIndex := 1
	for attrID, value := range attrs {
		clauses = append(clauses, fmt.Sprintf("(attribute_id = $%d AND value ILIKE $%d)", argIndex, argIndex+1))
		args = append(args, attrID, "%"+value+"%")
		argIndex += 2
	}

	query := fmt.Sprintf(
		`SELECT user_id
		 FROM user_attribute_values
		 WHERE %s
		 GROUP BY user_id
		 HAVING COUNT(DISTINCT attribute_id) = $%d`,
		strings.Join(clauses, " OR "),
		argIndex,
	)
	args = append(args, len(attrs))

	rows, err := r.sql.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	result := make([]int64, 0)
	for rows.Next() {
		var userID int64
		if scanErr := rows.Scan(&userID); scanErr != nil {
			return nil, scanErr
		}
		result = append(result, userID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

func (r *userRepository) UpdateBalance(ctx context.Context, id int64, amount float64) error {
	client := clientFromContext(ctx, r.client)
	update := client.User.Update().Where(dbuser.IDEQ(id)).AddBalance(amount)
	// Track cumulative recharge amount for percentage-based notifications
	if amount > 0 {
		update = update.AddTotalRecharged(amount)
	}
	n, err := update.Save(ctx)
	if err != nil {
		return translatePersistenceError(err, service.ErrUserNotFound, nil)
	}
	if n == 0 {
		return service.ErrUserNotFound
	}
	return nil
}

// DeductBalance deducts user balance.
// Negative balances are allowed so the current request can complete.
// Middleware blocks follow-up requests once the user balance is <= 0.
func (r *userRepository) DeductBalance(ctx context.Context, id int64, amount float64) error {
	client := clientFromContext(ctx, r.client)
	n, err := client.User.Update().
		Where(dbuser.IDEQ(id)).
		AddBalance(-amount).
		Save(ctx)
	if err != nil {
		return err
	}
	if n == 0 {
		return service.ErrUserNotFound
	}
	return nil
}

func (r *userRepository) UpdateCommissionBalance(ctx context.Context, id int64, amount float64) error {
	client := clientFromContext(ctx, r.client)
	update := client.User.Update().Where(dbuser.IDEQ(id)).AddCommissionBalance(amount)
	if amount > 0 {
		update = update.AddTotalCommissionEarned(amount)
	}
	n, err := update.Save(ctx)
	if err != nil {
		return translatePersistenceError(err, service.ErrUserNotFound, nil)
	}
	if n == 0 {
		return service.ErrUserNotFound
	}
	return nil
}

func (r *userRepository) UpdateConcurrency(ctx context.Context, id int64, amount int) error {
	client := clientFromContext(ctx, r.client)
	n, err := client.User.Update().Where(dbuser.IDEQ(id)).AddConcurrency(amount).Save(ctx)
	if err != nil {
		return translatePersistenceError(err, service.ErrUserNotFound, nil)
	}
	if n == 0 {
		return service.ErrUserNotFound
	}
	return nil
}

func (r *userRepository) ExistsByEmail(ctx context.Context, email string) (bool, error) {
	return r.client.User.Query().Where(dbuser.EmailEQ(email)).Exist(ctx)
}

func (r *userRepository) AddGroupToAllowedGroups(ctx context.Context, userID int64, groupID int64) error {
	client := clientFromContext(ctx, r.client)
	return client.UserAllowedGroup.Create().
		SetUserID(userID).
		SetGroupID(groupID).
		OnConflictColumns(userallowedgroup.FieldUserID, userallowedgroup.FieldGroupID).
		DoNothing().
		Exec(ctx)
}

func (r *userRepository) RemoveGroupFromAllowedGroups(ctx context.Context, groupID int64) (int64, error) {
	// Only operate on the user_allowed_groups join table; the legacy users.allowed_groups column is deprecated.
	affected, err := r.client.UserAllowedGroup.Delete().
		Where(userallowedgroup.GroupIDEQ(groupID)).
		Exec(ctx)
	if err != nil {
		return 0, err
	}
	return int64(affected), nil
}

// RemoveGroupFromUserAllowedGroups removes one group binding from a specific user.
func (r *userRepository) RemoveGroupFromUserAllowedGroups(ctx context.Context, userID int64, groupID int64) error {
	client := clientFromContext(ctx, r.client)
	_, err := client.UserAllowedGroup.Delete().
		Where(userallowedgroup.UserIDEQ(userID), userallowedgroup.GroupIDEQ(groupID)).
		Exec(ctx)
	return err
}

func (r *userRepository) GetFirstAdmin(ctx context.Context) (*service.User, error) {
	m, err := r.client.User.Query().
		Where(
			dbuser.RoleEQ(service.RoleAdmin),
			dbuser.StatusEQ(service.StatusActive),
		).
		Order(dbent.Asc(dbuser.FieldID)).
		First(ctx)
	if err != nil {
		return nil, translatePersistenceError(err, service.ErrUserNotFound, nil)
	}

	out := userEntityToService(m)
	groups, err := r.loadAllowedGroups(ctx, []int64{m.ID})
	if err != nil {
		return nil, err
	}
	if v, ok := groups[m.ID]; ok {
		out.AllowedGroups = v
	}
	return out, nil
}

func (r *userRepository) loadAllowedGroups(ctx context.Context, userIDs []int64) (map[int64][]int64, error) {
	out := make(map[int64][]int64, len(userIDs))
	if len(userIDs) == 0 {
		return out, nil
	}

	rows, err := r.client.UserAllowedGroup.Query().
		Where(userallowedgroup.UserIDIn(userIDs...)).
		All(ctx)
	if err != nil {
		return nil, err
	}

	for i := range rows {
		out[rows[i].UserID] = append(out[rows[i].UserID], rows[i].GroupID)
	}

	for userID := range out {
		sort.Slice(out[userID], func(i, j int) bool { return out[userID][i] < out[userID][j] })
	}

	return out, nil
}

// syncUserAllowedGroupsWithClient syncs allowed groups inside the current ent client or transaction.
// Only the user_allowed_groups join table is maintained here.
func (r *userRepository) syncUserAllowedGroupsWithClient(ctx context.Context, client *dbent.Client, userID int64, groupIDs []int64) error {
	if client == nil {
		return nil
	}

	// Keep join table as the source of truth for reads.
	if _, err := client.UserAllowedGroup.Delete().Where(userallowedgroup.UserIDEQ(userID)).Exec(ctx); err != nil {
		return err
	}

	unique := make(map[int64]struct{}, len(groupIDs))
	for _, id := range groupIDs {
		if id <= 0 {
			continue
		}
		unique[id] = struct{}{}
	}

	if len(unique) > 0 {
		creates := make([]*dbent.UserAllowedGroupCreate, 0, len(unique))
		for groupID := range unique {
			creates = append(creates, client.UserAllowedGroup.Create().SetUserID(userID).SetGroupID(groupID))
		}
		if err := client.UserAllowedGroup.
			CreateBulk(creates...).
			OnConflictColumns(userallowedgroup.FieldUserID, userallowedgroup.FieldGroupID).
			DoNothing().
			Exec(ctx); err != nil {
			return err
		}
	}

	return nil
}

func applyUserEntityToService(dst *service.User, src *dbent.User) {
	if dst == nil || src == nil {
		return
	}
	dst.ID = src.ID
	dst.InviterID = src.InviterID
	dst.InviteCode = src.InviteCode
	dst.CommissionRate = src.CommissionRate
	dst.CommissionBalance = src.CommissionBalance
	dst.TotalCommissionEarned = src.TotalCommissionEarned
	dst.ChannelPartnerID = src.ChannelPartnerID
	dst.AgentOwnerID = src.AgentOwnerID
	dst.DistributorOwnerID = src.DistributorOwnerID
	dst.IsKeyAccount = src.IsKeyAccount
	dst.KeyAccountLevel = src.KeyAccountLevel
	dst.KeyAccountDiscountRate = src.KeyAccountDiscountRate
	dst.KeyAccountRebateRate = src.KeyAccountRebateRate
	dst.KeyAccountManagerNotes = src.KeyAccountManagerNotes
	dst.CreatedAt = src.CreatedAt
	dst.UpdatedAt = src.UpdatedAt
}

func isInviteCodeConstraintError(err error) bool {
	if err == nil {
		return false
	}
	return isUniqueConstraintViolation(err) && strings.Contains(strings.ToLower(err.Error()), "invite_code")
}

// marshalExtraEmails serializes notify email entries to JSON for storage.
func marshalExtraEmails(entries []service.NotifyEmailEntry) string {
	return service.MarshalNotifyEmails(entries)
}

// UpdateTotpSecret updates the encrypted TOTP secret for a user.
func (r *userRepository) UpdateTotpSecret(ctx context.Context, userID int64, encryptedSecret *string) error {
	client := clientFromContext(ctx, r.client)
	update := client.User.UpdateOneID(userID)
	if encryptedSecret == nil {
		update = update.ClearTotpSecretEncrypted()
	} else {
		update = update.SetTotpSecretEncrypted(*encryptedSecret)
	}
	_, err := update.Save(ctx)
	if err != nil {
		return translatePersistenceError(err, service.ErrUserNotFound, nil)
	}
	return nil
}

// EnableTotp enables TOTP for the given user.
func (r *userRepository) EnableTotp(ctx context.Context, userID int64) error {
	client := clientFromContext(ctx, r.client)
	_, err := client.User.UpdateOneID(userID).
		SetTotpEnabled(true).
		SetTotpEnabledAt(time.Now()).
		Save(ctx)
	if err != nil {
		return translatePersistenceError(err, service.ErrUserNotFound, nil)
	}
	return nil
}

// DisableTotp disables TOTP for the given user.
func (r *userRepository) DisableTotp(ctx context.Context, userID int64) error {
	client := clientFromContext(ctx, r.client)
	_, err := client.User.UpdateOneID(userID).
		SetTotpEnabled(false).
		ClearTotpEnabledAt().
		ClearTotpSecretEncrypted().
		Save(ctx)
	if err != nil {
		return translatePersistenceError(err, service.ErrUserNotFound, nil)
	}
	return nil
}
