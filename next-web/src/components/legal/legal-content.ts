export type LegalKind = 'privacy' | 'terms' | 'refund' | 'contact';

export type LegalDoc = {
  title: string;
  updated: string;
  intro: string;
  sections: Array<{ heading: string; body: string[] }>;
};

// 联系方式（提交 Creem / Waffo 等支付渠道审核前，请替换为真实可收信邮箱）。
export const LEGAL_CONTACT_EMAIL = 'support@subio.com';

type LegalDict = Record<LegalKind, LegalDoc>;

const zh: LegalDict = {
  privacy: {
    title: '隐私政策',
    updated: '最近更新：2026-11-13',
    intro:
      'SubioHub（以下简称「我们」）尊重并保护您的隐私。本隐私政策说明我们如何收集、使用、共享与保护您在使用本服务时提供的个人信息。',
    sections: [
      {
        heading: '1. 我们收集的信息',
        body: [
          '账户信息：当您注册时，我们收集您的电子邮箱、用户名以及您主动填写的其他资料。',
          '支付信息：所有付款均由第三方支付服务商（Creem、Waffo 等）处理。我们不会接触或存储您的完整银行卡号或支付凭证。',
          '使用信息：我们可能记录您访问服务的时间、来源地址、日志等，用于安全与运营分析。',
        ],
      },
      {
        heading: '2. 支付处理',
        body: [
          '本服务的付款由 Creem 或 Waffo 等支付服务商作为商家记录方（Merchant of Record）处理。您在付款时提供的支付信息将直接提交给相应支付服务商，并受其隐私政策约束。',
        ],
      },
      {
        heading: '3. 信息的使用',
        body: [
          '我们使用上述信息用于：提供服务与账户管理、处理账单与充值、保障服务安全、以及向您发送必要的服务通知。',
        ],
      },
      {
        heading: '4. 信息的共享',
        body: [
          '我们仅在必要时与支付服务商（如 Creem、Waffo）等第三方共享信息，或依据法律要求、为保护我们合法权益而披露。',
        ],
      },
      {
        heading: '5. 您的权利',
        body: [
          '您有权访问、更正或删除您的个人信息。如需行使上述权利，请通过下方联系方式与我们联系。',
        ],
      },
      {
        heading: '6. 联系方式',
        body: [`如对本隐私政策有任何疑问，请联系：${LEGAL_CONTACT_EMAIL}`],
      },
    ],
  },
  terms: {
    title: '服务条款',
    updated: '最近更新：2026-11-13',
    intro:
      '本服务条款（以下简称「条款」）约束您对 SubioHub（以下简称「我们」）所提供 AI API 网关服务的使用。使用本服务即表示您同意本条款。',
    sections: [
      {
        heading: '1. 服务说明',
        body: [
          'SubioHub 提供统一的 AI 模型 API 分发与管理服务，包括 API 密钥、额度管理与在线充值等。',
          '本服务为在线数字服务，不涉及任何实体商品的生产、仓储或物流配送。',
        ],
      },
      {
        heading: '2. 账户与资格',
        body: ['您需提供真实、准确的信息注册账户，并妥善保管账户凭据。您对账户下的所有活动负责。'],
      },
      {
        heading: '3. 充值与支付',
        body: [
          '本服务的付款由 Creem 或 Waffo 等支付服务商作为商家记录方（Merchant of Record）处理。您确认并同意向相应支付服务商支付一次性充值费用及相关税费。',
          '本服务仅提供一次性充值，不销售订阅套餐，不会自动续费，也不会产生周期性扣款或续订费用。',
          '充值到账后的余额永久有效，不设有效期、不会过期清零，用于按实际用量抵扣模型调用费用。',
          '充值档位、单笔最低/最高金额与手续费以《定价》页面展示为准。',
        ],
      },
      {
        heading: '4. 可接受使用',
        body: ['您不得将本服务用于任何违法、侵权或滥用活动，不得尝试绕过额度或安全限制。'],
      },
      {
        heading: '5. 退款',
        body: ['退款政策请参见我们的《退款政策》页面。'],
      },
      {
        heading: '6. 责任限制',
        body: [
          '本服务按「现状」提供。在法律允许的最大范围内，我们不对因使用或无法使用服务而产生的间接损失承担责任。',
        ],
      },
      {
        heading: '7. 终止',
        body: ['我们可在您违反本条款时暂停或终止您的账户。'],
      },
      {
        heading: '8. 联系方式',
        body: [`如对本条款有任何疑问，请联系：${LEGAL_CONTACT_EMAIL}`],
      },
    ],
  },
  refund: {
    title: '退款政策',
    updated: '最近更新：2026-11-13',
    intro:
      '本退款政策说明 SubioHub 提供的退款条件与流程。本服务的付款由 Creem、Waffo 等支付服务商处理，退款亦通过原支付服务商执行。',
    sections: [
      {
        heading: '1. 数字服务的性质',
        body: ['本服务提供的是即时生效的数字服务（API 额度）。余额充值到账后长期有效，已消耗的额度通常不予退款。'],
      },
      {
        heading: '2. 可退款情形',
        body: [
          '因系统重复扣款导致的重复支付；',
          '因我方服务重大故障导致您完全无法使用已购买的额度，且经我们确认无法修复。',
        ],
      },
      {
        heading: '3. 不予退款情形',
        body: [
          '因您自身原因（如误购、不再需要、账户被封禁等）申请退款；',
          '已使用或已消耗的额度。',
        ],
      },
      {
        heading: '4. 退款流程',
        body: [
          `如需申请退款，请发送邮件至 ${LEGAL_CONTACT_EMAIL}，并附上订单号与退款理由。`,
          '我们将在核实后告知处理结果。符合条件的退款将退回原支付方式。',
        ],
      },
      {
        heading: '5. 处理时间',
        body: ['退款申请通常需要 5-10 个工作日完成，具体到账时间取决于您的支付方式。'],
      },
    ],
  },
  contact: {
    title: '联系我们',
    updated: '',
    intro: '如您有任何疑问、建议或需要支持，欢迎通过以下方式联系我们。',
    sections: [
      {
        heading: '联系方式',
        body: [`电子邮箱：${LEGAL_CONTACT_EMAIL}`],
      },
      {
        heading: '支持范围',
        body: ['账户与订单问题、退款申请、服务使用咨询等。'],
      },
      {
        heading: '响应时间',
        body: ['我们通常会在 1-2 个工作日内回复。'],
      },
    ],
  },
};

const en: LegalDict = {
  privacy: {
    title: 'Privacy Policy',
    updated: 'Last updated: 2026-11-13',
    intro:
      'SubioHub ("we", "us", "our") respects and protects your privacy. This Privacy Policy explains how we collect, use, share and protect your personal information when you use our services.',
    sections: [
      {
        heading: '1. Information We Collect',
        body: [
          'Account information: when you register, we collect your email address, username and other details you provide.',
          'Payment information: all payments are processed by third-party payment providers such as Creem and Waffo. We do not receive or store your full card number or payment credentials.',
          'Usage information: we may record access time, referring address, logs and similar data for security and operations.',
        ],
      },
      {
        heading: '2. Payment Processing',
        body: [
          'Payments for our services are processed by payment providers such as Creem or Waffo, which act as the Merchant of Record. Payment information you provide at checkout is submitted directly to the relevant provider and is subject to that provider\u2019s Privacy Policy.',
        ],
      },
      {
        heading: '3. How We Use Information',
        body: [
          'We use the above information to provide and manage the service, process billing and top-ups, secure the service, and send necessary service notices.',
        ],
      },
      {
        heading: '4. How We Share Information',
        body: [
          'We only share information with payment providers such as Creem and Waffo where necessary, or where required by law or to protect our legitimate interests.',
        ],
      },
      {
        heading: '5. Your Rights',
        body: [
          'You have the right to access, correct or delete your personal information. To exercise these rights, please contact us using the details below.',
        ],
      },
      {
        heading: '6. Contact',
        body: [`If you have any questions about this Privacy Policy, contact: ${LEGAL_CONTACT_EMAIL}`],
      },
    ],
  },
  terms: {
    title: 'Terms of Service',
    updated: 'Last updated: 2026-11-13',
    intro:
      'These Terms of Service ("Terms") govern your use of the AI API gateway service provided by SubioHub ("we", "us", "our"). By using the service, you agree to these Terms.',
    sections: [
      {
        heading: '1. Service Description',
        body: [
          'SubioHub provides a unified AI model API distribution and management service, including API keys, quota management and one-time top-ups.',
          'The service is an online digital service. No physical goods are produced, stored or shipped.',
        ],
      },
      {
        heading: '2. Accounts and Eligibility',
        body: ['You must provide true and accurate information to register, keep your credentials safe, and are responsible for all activity under your account.'],
      },
      {
        heading: '3. Top-ups and Payment',
        body: [
          'Payments are processed by payment providers such as Creem or Waffo, which act as the Merchant of Record. You agree to pay the one-time top-up fees and applicable taxes to the relevant provider.',
          'We only offer one-time top-ups. We do not sell subscription plans, do not auto-renew and do not create recurring charges or renewal fees.',
          'Credited balance is valid permanently, has no expiry date and is never reset. It is used to offset model usage charges.',
          'Top-up tiers, minimum and maximum amounts per order, and fees are published on the Pricing page.',
        ],
      },
      {
        heading: '4. Acceptable Use',
        body: ['You may not use the service for any unlawful, infringing or abusive activity, or attempt to bypass quota or security restrictions.'],
      },
      {
        heading: '5. Refunds',
        body: ['Please see our Refund Policy for refund terms.'],
      },
      {
        heading: '6. Limitation of Liability',
        body: [
          'The service is provided on an "as is" basis. To the maximum extent permitted by law, we are not liable for indirect losses arising from your use or inability to use the service.',
        ],
      },
      {
        heading: '7. Termination',
        body: ['We may suspend or terminate your account if you breach these Terms.'],
      },
      {
        heading: '8. Contact',
        body: [`If you have any questions about these Terms, contact: ${LEGAL_CONTACT_EMAIL}`],
      },
    ],
  },
  refund: {
    title: 'Refund Policy',
    updated: 'Last updated: 2026-11-13',
    intro:
      'This Refund Policy explains the conditions and process for refunds offered by SubioHub. Payments are processed by payment providers such as Creem or Waffo, and refunds are executed through the original payment provider.',
    sections: [
      {
        heading: '1. Nature of Digital Services',
        body: ['Our service provides instantly delivered digital services (API quota). Credited balance remains valid permanently, and quota already consumed is generally non-refundable.'],
      },
      {
        heading: '2. Eligible for Refund',
        body: [
          'Duplicate payments caused by system errors;',
          'A major service outage on our side that made purchased quota completely unusable, confirmed by us as irreparable.',
        ],
      },
      {
        heading: '3. Non-refundable',
        body: [
          'Refunds requested for personal reasons (e.g. mistaken purchase, no longer needed, account suspension);',
          'Quota already used or consumed.',
        ],
      },
      {
        heading: '4. Refund Process',
        body: [
          `To request a refund, email ${LEGAL_CONTACT_EMAIL} with your order number and reason.`,
          'We will review and notify you of the result. Eligible refunds are returned to the original payment method.',
        ],
      },
      {
        heading: '5. Processing Time',
        body: ['Refunds usually take 5-10 business days, depending on your payment method.'],
      },
    ],
  },
  contact: {
    title: 'Contact Us',
    updated: '',
    intro: 'If you have any questions, suggestions or need support, please reach out through the channels below.',
    sections: [
      {
        heading: 'Contact',
        body: [`Email: ${LEGAL_CONTACT_EMAIL}`],
      },
      {
        heading: 'Support Scope',
        body: ['Account and order issues, refund requests, and service usage questions.'],
      },
      {
        heading: 'Response Time',
        body: ['We usually reply within 1-2 business days.'],
      },
    ],
  },
};

export function getLegalDoc(kind: LegalKind, locale: string): LegalDoc {
  return locale === 'zh' ? zh[kind] : en[kind];
}
