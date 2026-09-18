export const automatedMessageDefaults = {
  confirmation:
    '✨ *Detalhes da sua marcação* ✨\nOlá, {cliente} 😊\n\n💆 *Serviço:* {servico}\n📅 *Data:* {data}\n🕘 *Horário:* {hora}\n\nPara confirmar responda *CONFIRMAR*. Para alterar responda *REAGENDAR*.\n\n{link_anamnese}\n\n*{empresa}*',
  reminder:
    'Olá, {cliente}. 😊\n\nLembramos a sua sessão de *{servico}* em {data}, às {hora}.\n\nCaso necessite de apoio, responda a esta mensagem.\n\n*{empresa}*',
  pending_confirmation:
    'Olá, {cliente}. 😊\n\nAinda aguardamos a confirmação da sua sessão de *{servico}*, em {data}, às {hora}.\n\nResponda *CONFIRMAR* ou *REAGENDAR*.\n\n*{empresa}*',
  review_request:
    'Olá, {cliente} 😊\n\nObrigado por escolher a *{empresa}*{servico}. A sua opinião é muito importante para nós.\n\nPode avaliar a sua experiência aqui:\n{link_avaliacao}\n\nObrigado!',
  benefit_expiry:
    'Olá, {cliente}.\n\n⏳ O seu {tipo_beneficio}{beneficio} termina em *{validade}*.\n{saldo}\n{codigo}\n\nSe quiser utilizar antes da validade, responda a esta mensagem e ajudamos a agendar.\n\n*{empresa}*',
  finance_alert:
    '🔔 *{titulo}*\n\n{mensagem}\n\nAbra o CRM: {link_finance}\n\n*{empresa}*',
  payment_request:
    'Olá {cliente} 👋\n\nA sua {servico} na *{empresa}* está pronta para pagamento.\n\nTotal a pagar: *{valor}*\n\nPara pagar online de forma segura, use este link:\n{link_pagamento}\n\nAssim que o pagamento for confirmado, a sua marcação fica validada.\n\nObrigado,\n*{empresa}*',
} as const;

export type AutomatedMessageKey = keyof typeof automatedMessageDefaults;
export type AutomatedMessageTemplates = Record<AutomatedMessageKey, string>;

export function mergeAutomatedMessageTemplates(
  saved: Partial<AutomatedMessageTemplates> | null | undefined
): AutomatedMessageTemplates {
  return { ...automatedMessageDefaults, ...(saved ?? {}) };
}

export function renderAutomatedMessage(
  template: string,
  values: Record<string, string | null | undefined>
) {
  return template.replace(/\{([a-z_]+)\}/gi, (match, key: string) => {
    const value = values[key.toLowerCase()];
    return value == null ? match : value;
  });
}
