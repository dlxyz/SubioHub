import { WithdrawalManagementPanel } from "@/components/admin/withdrawal-management-panel";

export default function AdminAffiliatePage() {
  return (
    <WithdrawalManagementPanel
      title="推广分润流水与结算核对"
      description="用于查看推广分润流水、核对补差法分润结果，并为指定用户配置专属返佣比例；提现结算请前往现金流菜单中的“提现管理”。"
      showRateSection
    />
  );
}
