package payment

import (
	"github.com/shopspring/decimal"
)

const (
	// smallAmountThreshold 低于该金额（USD）的充值订单需要额外收取固定手续费。
	smallAmountThreshold = 20.0
	// smallAmountSurcharge 小额订单的固定手续费（USD）。
	smallAmountSurcharge = 0.50
)

// CalculatePayAmount computes the total pay amount given a recharge amount and
// fee rate (percentage). Fee = amount * feeRate / 100, rounded UP (away from zero)
// to 2 decimal places; orders below 20 USD additionally pay a fixed 0.50 USD fee.
// The returned string is formatted to exactly 2 decimal places.
// If feeRate <= 0 or the amount is not positive, the amount is returned as-is
// (formatted to 2 decimal places).
func CalculatePayAmount(rechargeAmount float64, feeRate float64) string {
	amount := decimal.NewFromFloat(rechargeAmount)
	if feeRate <= 0 || !amount.IsPositive() {
		return amount.StringFixed(2)
	}
	rate := decimal.NewFromFloat(feeRate)
	fee := amount.Mul(rate).Div(decimal.NewFromInt(100)).RoundUp(2)
	if rechargeAmount < smallAmountThreshold {
		fee = fee.Add(decimal.NewFromFloat(smallAmountSurcharge))
	}
	return amount.Add(fee).StringFixed(2)
}
