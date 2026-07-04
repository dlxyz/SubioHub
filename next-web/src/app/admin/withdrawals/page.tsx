'use client';

import { WithdrawalManagementPanel } from '@/components/admin/withdrawal-management-panel';

export default function AdminWithdrawalsPage() {
  return (
    <WithdrawalManagementPanel
      title="提现管理"
      description="集中处理推广佣金与补差法分润的待结算记录，作为后台现金流中的手动打款与提现管理入口。"
    />
  );
}
