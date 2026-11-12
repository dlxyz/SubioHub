package service

import (
	"context"
	"testing"
	"time"

	dbent "github.com/dlxyz/SubioHub/ent"
	"github.com/dlxyz/SubioHub/ent/commissionlog"
	"github.com/dlxyz/SubioHub/ent/commissionsplitlog"
	"github.com/dlxyz/SubioHub/internal/payment"
	"github.com/stretchr/testify/require"
)

func TestReverseCommissionForRefund(t *testing.T) {
	client, _ := newPromotionTestClient(t, "refund_commission_reversal")
	ctx := context.Background()

	consumer := mustCreatePromotionUser(t, ctx, client, "consumer-refund@test.com", RoleUser, nil)
	beneficiary := mustCreatePromotionUser(t, ctx, client, "beneficiary-refund@test.com", RoleAgent, nil)
	legacyBeneficiary := mustCreatePromotionUser(t, ctx, client, "legacy-refund@test.com", RoleAgent, nil)

	for _, user := range []*dbent.User{beneficiary, legacyBeneficiary} {
		_, err := client.User.UpdateOneID(user.ID).SetCommissionBalance(10).Save(ctx)
		require.NoError(t, err)
	}

	order, err := client.PaymentOrder.Create().
		SetUserID(consumer.ID).
		SetUserEmail(consumer.Email).
		SetUserName("consumer").
		SetAmount(100).
		SetPayAmount(100).
		SetFeeRate(0).
		SetRechargeCode("refund-reversal-code").
		SetOutTradeNo("refund-reversal-out-trade-no").
		SetPaymentType("alipay").
		SetPaymentTradeNo("refund-reversal-trade-no").
		SetOrderType(payment.OrderTypeBalance).
		SetStatus(OrderStatusCompleted).
		SetExpiresAt(time.Now().Add(time.Hour)).
		SetClientIP("127.0.0.1").
		SetSrcHost("localhost").
		Save(ctx)
	require.NoError(t, err)

	settledSplit, err := client.CommissionSplitLog.Create().
		SetOrderID(order.ID).
		SetConsumerUserID(consumer.ID).
		SetBeneficiaryUserID(beneficiary.ID).
		SetBeneficiaryRole(RoleAgent).
		SetLevel(1).
		SetCalcMode(commissionCalcModeDiff).
		SetBaseAmount(100).
		SetTargetRate(0.20).
		SetCommissionAmount(5).
		SetStatus("settled").
		Save(ctx)
	require.NoError(t, err)

	pendingSplit, err := client.CommissionSplitLog.Create().
		SetOrderID(order.ID).
		SetConsumerUserID(consumer.ID).
		SetBeneficiaryUserID(beneficiary.ID).
		SetBeneficiaryRole(RoleAgent).
		SetLevel(2).
		SetCalcMode(commissionCalcModeDiff).
		SetBaseAmount(100).
		SetTargetRate(0.10).
		SetCommissionAmount(3).
		SetStatus("pending").
		Save(ctx)
	require.NoError(t, err)

	legacySettled, err := client.CommissionLog.Create().
		SetUserID(legacyBeneficiary.ID).
		SetInviteeID(consumer.ID).
		SetOrderID(order.ID).
		SetAmount(2).
		SetStatus("settled").
		SetReason("legacy commission").
		Save(ctx)
	require.NoError(t, err)

	svc := &PaymentService{
		entClient: client,
		userRepo:  &promotionUserRepo{client: client},
	}
	require.NoError(t, svc.reverseCommissionForRefund(ctx, order.ID))

	settledSplit, err = client.CommissionSplitLog.Get(ctx, settledSplit.ID)
	require.NoError(t, err)
	require.Equal(t, "reversed", settledSplit.Status)

	pendingSplit, err = client.CommissionSplitLog.Get(ctx, pendingSplit.ID)
	require.NoError(t, err)
	require.Equal(t, "cancelled", pendingSplit.Status)

	legacySettled, err = client.CommissionLog.Get(ctx, legacySettled.ID)
	require.NoError(t, err)
	require.Equal(t, "reversed", legacySettled.Status)

	// 已结算部分从佣金余额扣回，pending 不扣。
	updatedBeneficiary, err := client.User.Get(ctx, beneficiary.ID)
	require.NoError(t, err)
	require.InDelta(t, 5, updatedBeneficiary.CommissionBalance, 1e-9)

	updatedLegacy, err := client.User.Get(ctx, legacyBeneficiary.ID)
	require.NoError(t, err)
	require.InDelta(t, 8, updatedLegacy.CommissionBalance, 1e-9)

	// 重复冲正应保持幂等，不再重复扣款。
	require.NoError(t, svc.reverseCommissionForRefund(ctx, order.ID))
	updatedBeneficiary, err = client.User.Get(ctx, beneficiary.ID)
	require.NoError(t, err)
	require.InDelta(t, 5, updatedBeneficiary.CommissionBalance, 1e-9)

	remaining, err := client.CommissionSplitLog.Query().
		Where(commissionsplitlog.OrderIDEQ(order.ID), commissionsplitlog.StatusEQ("pending")).
		Count(ctx)
	require.NoError(t, err)
	require.Zero(t, remaining)

	reversed, err := client.CommissionLog.Query().
		Where(commissionlog.OrderIDEQ(order.ID), commissionlog.StatusEQ("reversed")).
		Count(ctx)
	require.NoError(t, err)
	require.Equal(t, 1, reversed)
}
