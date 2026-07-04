package service

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"strings"
	"time"

	dbent "github.com/dlxyz/SubioHub/ent"
	"github.com/dlxyz/SubioHub/ent/commissionrule"
	"github.com/dlxyz/SubioHub/ent/commissionsplitlog"
	"github.com/dlxyz/SubioHub/ent/promotionrelation"
	"entgo.io/ent/dialect/sql"
)

const (
	commissionCalcModeDiff          = "diff"
	commissionRuleScopeGlobal       = "global"
	commissionSettlementModeManual  = "manual"
	defaultGlobalRuleName           = "全局补差默认规则"
	defaultGlobalAgentTargetRate    = 0.20
	defaultGlobalDistributorRate    = 0.15
	defaultGlobalCommissionFreezeHr = 168
)

type promotionBinding struct {
	AgentUserID        *int64
	DistributorUserID  *int64
	DirectParentUserID *int64
	DirectParentRole   string
	BindingSource      string
}

type commissionSplitPlan struct {
	BeneficiaryUserID int64
	BeneficiaryRole   string
	Level             int
	TargetRate        float64
	ParentRate        float64
	CommissionAmount  float64
}

func upsertPromotionRelationForInviter(ctx context.Context, client *dbent.Client, userID int64, inviterID *int64, notes string) error {
	if client == nil || userID <= 0 || inviterID == nil || *inviterID <= 0 {
		return nil
	}

	existing, err := client.PromotionRelation.Query().
		Where(promotionrelation.UserIDEQ(userID)).
		Only(ctx)
	if err != nil && !dbent.IsNotFound(err) {
		return fmt.Errorf("query promotion relation: %w", err)
	}
	if err == nil && existing.IsLocked {
		return nil
	}

	binding, err := resolvePromotionBinding(ctx, client, *inviterID, 0)
	if err != nil {
		return err
	}
	if binding == nil {
		return nil
	}

	if existing != nil {
		update := existing.Update().
			SetNillableAgentUserID(binding.AgentUserID).
			SetNillableDistributorUserID(binding.DistributorUserID).
			SetNillableDirectParentUserID(binding.DirectParentUserID).
			SetDirectParentRole(binding.DirectParentRole).
			SetBindingSource(binding.BindingSource).
			SetIsLocked(true)
		if strings.TrimSpace(notes) != "" {
			update = update.SetNotes(notes)
		}
		_, err = update.Save(ctx)
		if err != nil {
			return fmt.Errorf("update promotion relation: %w", err)
		}
		return nil
	}

	create := client.PromotionRelation.Create().
		SetUserID(userID).
		SetNillableAgentUserID(binding.AgentUserID).
		SetNillableDistributorUserID(binding.DistributorUserID).
		SetNillableDirectParentUserID(binding.DirectParentUserID).
		SetDirectParentRole(binding.DirectParentRole).
		SetBindingSource(binding.BindingSource).
		SetIsLocked(true)
	if strings.TrimSpace(notes) != "" {
		create = create.SetNotes(notes)
	}
	if _, err := create.Save(ctx); err != nil {
		return fmt.Errorf("create promotion relation: %w", err)
	}
	return nil
}

func resolvePromotionBinding(ctx context.Context, client *dbent.Client, inviterID int64, depth int) (*promotionBinding, error) {
	if client == nil || inviterID <= 0 || depth > 4 {
		return nil, nil
	}

	inviter, err := client.User.Get(ctx, inviterID)
	if err != nil {
		if dbent.IsNotFound(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("get inviter: %w", err)
	}

	agentUserID, distributorUserID, err := resolvePromotionAncestors(ctx, client, inviter, depth)
	if err != nil {
		return nil, err
	}

	return &promotionBinding{
		AgentUserID:        agentUserID,
		DistributorUserID:  distributorUserID,
		DirectParentUserID: &inviter.ID,
		DirectParentRole:   inviter.Role,
		BindingSource:      bindingSourceByRole(inviter.Role),
	}, nil
}

func resolvePromotionAncestors(ctx context.Context, client *dbent.Client, user *dbent.User, depth int) (*int64, *int64, error) {
	if client == nil || user == nil || depth > 4 {
		return nil, nil, nil
	}

	switch user.Role {
	case RoleAgent:
		return &user.ID, nil, nil
	case RoleDistributor:
		distributorID := user.ID
		relation, err := client.PromotionRelation.Query().
			Where(promotionrelation.UserIDEQ(user.ID)).
			Only(ctx)
		if err == nil && relation.AgentUserID != nil {
			agentID := *relation.AgentUserID
			return &agentID, &distributorID, nil
		}
		if err != nil && !dbent.IsNotFound(err) {
			return nil, nil, fmt.Errorf("query distributor relation: %w", err)
		}
		if user.InviterID != nil {
			parent, getErr := client.User.Get(ctx, *user.InviterID)
			if getErr != nil {
				if dbent.IsNotFound(getErr) {
					return nil, &distributorID, nil
				}
				return nil, nil, fmt.Errorf("get distributor parent: %w", getErr)
			}
			agentUserID, _, resolveErr := resolvePromotionAncestors(ctx, client, parent, depth+1)
			if resolveErr != nil {
				return nil, nil, resolveErr
			}
			return agentUserID, &distributorID, nil
		}
		return nil, &distributorID, nil
	default:
		relation, err := client.PromotionRelation.Query().
			Where(promotionrelation.UserIDEQ(user.ID)).
			Only(ctx)
		if err == nil {
			return relation.AgentUserID, relation.DistributorUserID, nil
		}
		if err != nil && !dbent.IsNotFound(err) {
			return nil, nil, fmt.Errorf("query user relation: %w", err)
		}
		if user.InviterID != nil {
			parent, getErr := client.User.Get(ctx, *user.InviterID)
			if getErr != nil {
				if dbent.IsNotFound(getErr) {
					return nil, nil, nil
				}
				return nil, nil, fmt.Errorf("get ancestor user: %w", getErr)
			}
			return resolvePromotionAncestors(ctx, client, parent, depth+1)
		}
		return nil, nil, nil
	}
}

func bindingSourceByRole(role string) string {
	switch role {
	case RoleAgent:
		return "agent_direct"
	case RoleDistributor:
		return "distributor_direct"
	default:
		return "manual"
	}
}

func getActiveGlobalCommissionRule(ctx context.Context, client *dbent.Client) (*dbent.CommissionRule, error) {
	if client == nil {
		return nil, nil
	}

	now := time.Now()
	rule, err := client.CommissionRule.Query().
		Where(
			commissionrule.StatusEQ(StatusActive),
			commissionrule.ScopeTypeEQ(commissionRuleScopeGlobal),
			commissionrule.Or(
				commissionrule.EffectiveAtIsNil(),
				commissionrule.EffectiveAtLTE(now),
			),
			commissionrule.Or(
				commissionrule.ExpiredAtIsNil(),
				commissionrule.ExpiredAtGT(now),
			),
		).
		Order(
			commissionrule.ByPriority(sql.OrderDesc()),
			commissionrule.ByCreatedAt(sql.OrderDesc()),
		).
		First(ctx)
	if err == nil {
		return rule, nil
	}
	if !dbent.IsNotFound(err) {
		return nil, fmt.Errorf("query global commission rule: %w", err)
	}

	return ensureDefaultGlobalCommissionRule(ctx, client)
}

func ensureDefaultGlobalCommissionRule(ctx context.Context, client *dbent.Client) (*dbent.CommissionRule, error) {
	if client == nil {
		return nil, nil
	}

	existing, err := client.CommissionRule.Query().
		Where(
			commissionrule.NameEQ(defaultGlobalRuleName),
			commissionrule.ScopeTypeEQ(commissionRuleScopeGlobal),
		).
		Order(commissionrule.ByCreatedAt(sql.OrderDesc())).
		First(ctx)
	if err == nil {
		return existing, nil
	}
	if err != nil && !dbent.IsNotFound(err) {
		return nil, fmt.Errorf("query default global commission rule: %w", err)
	}

	rule, err := client.CommissionRule.Create().
		SetName(defaultGlobalRuleName).
		SetStatus(StatusActive).
		SetCalcMode(commissionCalcModeDiff).
		SetAgentTargetRate(defaultGlobalAgentTargetRate).
		SetDistributorTargetRate(defaultGlobalDistributorRate).
		SetFreezeHours(defaultGlobalCommissionFreezeHr).
		SetSettlementMode(commissionSettlementModeManual).
		SetScopeType(commissionRuleScopeGlobal).
		SetPriority(0).
		Save(ctx)
	if err != nil {
		return nil, fmt.Errorf("create default global commission rule: %w", err)
	}
	slog.Info("created default global commission rule", "ruleID", rule.ID)
	return rule, nil
}

func buildCommissionSplitPlans(order *dbent.PaymentOrder, relation *dbent.PromotionRelation, rule *dbent.CommissionRule) []commissionSplitPlan {
	if order == nil || relation == nil || rule == nil || order.Amount <= 0 {
		return nil
	}

	calcMode := strings.TrimSpace(rule.CalcMode)
	if calcMode == "" {
		calcMode = commissionCalcModeDiff
	}

	plans := make([]commissionSplitPlan, 0, 2)
	baseAmount := order.Amount

	if relation.DistributorUserID != nil && rule.DistributorTargetRate > 0 {
		commissionAmount := roundCommissionAmount(baseAmount * rule.DistributorTargetRate)
		if commissionAmount > 0 {
			plans = append(plans, commissionSplitPlan{
				BeneficiaryUserID: *relation.DistributorUserID,
				BeneficiaryRole:   RoleDistributor,
				Level:             1,
				TargetRate:        rule.DistributorTargetRate,
				ParentRate:        0,
				CommissionAmount:  commissionAmount,
			})
		}
	}

	if relation.AgentUserID != nil && rule.AgentTargetRate > 0 {
		parentRate := 0.0
		level := 1
		commissionRate := rule.AgentTargetRate
		if relation.DistributorUserID != nil {
			level = 2
			if calcMode == commissionCalcModeDiff {
				parentRate = math.Max(rule.DistributorTargetRate, 0)
				commissionRate = math.Max(rule.AgentTargetRate-parentRate, 0)
			}
		}
		commissionAmount := roundCommissionAmount(baseAmount * commissionRate)
		if commissionAmount > 0 {
			plans = append(plans, commissionSplitPlan{
				BeneficiaryUserID: *relation.AgentUserID,
				BeneficiaryRole:   RoleAgent,
				Level:             level,
				TargetRate:        rule.AgentTargetRate,
				ParentRate:        parentRate,
				CommissionAmount:  commissionAmount,
			})
		}
	}

	return plans
}

func upsertCommissionSplitLogsForOrder(ctx context.Context, client *dbent.Client, order *dbent.PaymentOrder, relation *dbent.PromotionRelation, rule *dbent.CommissionRule) error {
	if client == nil || order == nil || relation == nil || rule == nil {
		return nil
	}

	plans := buildCommissionSplitPlans(order, relation, rule)
	if len(plans) == 0 {
		return nil
	}

	for _, plan := range plans {
		snapshot := map[string]any{
			"direct_parent_user_id": relation.DirectParentUserID,
			"direct_parent_role":    relation.DirectParentRole,
			"binding_source":        relation.BindingSource,
			"agent_user_id":         relation.AgentUserID,
			"distributor_user_id":   relation.DistributorUserID,
			"rule_id":               rule.ID,
			"rule_scope_type":       rule.ScopeType,
			"calc_mode":             rule.CalcMode,
			"agent_target_rate":     rule.AgentTargetRate,
			"distributor_target_rate": rule.DistributorTargetRate,
		}

		create := client.CommissionSplitLog.Create().
			SetOrderID(order.ID).
			SetConsumerUserID(order.UserID).
			SetBeneficiaryUserID(plan.BeneficiaryUserID).
			SetBeneficiaryRole(plan.BeneficiaryRole).
			SetNillableAgentUserID(relation.AgentUserID).
			SetNillableDistributorUserID(relation.DistributorUserID).
			SetLevel(plan.Level).
			SetCalcMode(rule.CalcMode).
			SetBaseAmount(order.Amount).
			SetTargetRate(plan.TargetRate).
			SetParentRate(plan.ParentRate).
			SetCommissionAmount(plan.CommissionAmount).
			SetStatus("pending").
			SetRuleID(rule.ID).
			SetRelationSnapshot(snapshot).
			SetRemark("generated by promotion diff split on order completion")

		if err := create.
			OnConflictColumns(
				commissionsplitlog.FieldOrderID,
				commissionsplitlog.FieldBeneficiaryUserID,
				commissionsplitlog.FieldLevel,
			).
			UpdateNewValues().
			Exec(ctx); err != nil {
			return fmt.Errorf("upsert commission split log: %w", err)
		}
	}

	return nil
}

func roundCommissionAmount(value float64) float64 {
	return math.Round(value*1e8) / 1e8
}
