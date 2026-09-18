import type {
  AutomationStepConfig,
  AutomationStepType,
  AutomationTriggerConfig,
  AutomationTriggerType,
} from '@/types';

export type TemplateSlug =
  | 'welcome_message'
  | 'out_of_office'
  | 'lead_qualifier'
  | 'follow_up_reminder'
  | 'massage_welcome'
  | 'massage_booking'
  | 'massage_after_hours'
  | 'massage_follow_up';

export interface TemplateStepSeed {
  step_type: AutomationStepType;
  step_config: AutomationStepConfig;
  branch?: 'yes' | 'no' | null;
  /** Index (within this seed list) of the Condition parent, if nested. */
  parent_index?: number | null;
}

export interface AutomationTemplateDefinition {
  slug: TemplateSlug;
  name: string;
  description: string;
  trigger_type: AutomationTriggerType;
  trigger_config: AutomationTriggerConfig;
  steps: TemplateStepSeed[];
}

export const AUTOMATION_TEMPLATES: Record<
  TemplateSlug,
  AutomationTemplateDefinition
> = {
  welcome_message: {
    slug: 'welcome_message',
    name: 'Welcome Message',
    description: 'Auto-reply to first-time contacts with a greeting.',
    // first_inbound_message (added in PR #33) catches both brand-new
    // contacts AND manually-added/imported contacts on their first-ever
    // reply, which is what a user setting up a "welcome" automation
    // almost always wants. new_contact_created would miss the
    // manually-imported case.
    trigger_type: 'first_inbound_message',
    trigger_config: {},
    steps: [
      {
        step_type: 'send_message',
        step_config: {
          text: "Hi! 👋 Thanks for reaching out. We'll get back to you shortly.",
        },
      },
      {
        step_type: 'add_tag',
        step_config: { tag_id: '' },
      },
    ],
  },
  out_of_office: {
    slug: 'out_of_office',
    name: 'Out of Office',
    description: 'Auto-reply during off-hours so nobody is left waiting.',
    trigger_type: 'new_message_received',
    trigger_config: {},
    steps: [
      {
        step_type: 'condition',
        step_config: {
          subject: 'time_of_day',
          operand: '18:00-09:00',
        },
      },
      {
        step_type: 'send_message',
        step_config: {
          text: 'Thanks for your message! Our team is offline right now (9am–6pm) and will reply first thing tomorrow.',
        },
        parent_index: 0,
        branch: 'yes',
      },
    ],
  },
  lead_qualifier: {
    slug: 'lead_qualifier',
    name: 'Lead Qualifier',
    description: 'Ask qualification questions to filter inbound leads.',
    trigger_type: 'keyword_match',
    trigger_config: {
      keywords: ['pricing', 'quote', 'buy'],
      match_type: 'contains',
    },
    steps: [
      {
        step_type: 'send_message',
        step_config: {
          text: 'Great — happy to help with pricing! Quick question: roughly how many seats are you looking for?',
        },
      },
      {
        step_type: 'wait',
        step_config: { amount: 10, unit: 'minutes' },
      },
      {
        step_type: 'assign_conversation',
        step_config: { mode: 'round_robin' },
      },
    ],
  },
  follow_up_reminder: {
    slug: 'follow_up_reminder',
    name: 'Follow-up Reminder',
    description: 'Send a nudge if a contact has not replied within 24 hours.',
    trigger_type: 'new_message_received',
    trigger_config: {},
    steps: [
      {
        step_type: 'wait',
        step_config: { amount: 1, unit: 'days' },
      },
      {
        step_type: 'send_message',
        step_config: {
          text: 'Just circling back — did you have any other questions for us? Happy to help!',
        },
      },
    ],
  },
  massage_welcome: {
    slug: 'massage_welcome',
    name: 'Boas-vindas — Massagem',
    description: 'Receba novos contactos com uma resposta acolhedora.',
    trigger_type: 'first_inbound_message',
    trigger_config: {},
    steps: [
      {
        step_type: 'send_message',
        step_config: {
          text: 'Olá, {{ contact.name }}! 😊 Obrigado por contactar a nossa equipa. Como podemos ajudar: marcar uma massagem, saber preços ou tirar uma dúvida?',
        },
      },
    ],
  },
  massage_booking: {
    slug: 'massage_booking',
    name: 'Pedido de marcação — Massagem',
    description: 'Responde a pedidos de agendamento e encaminha a conversa.',
    trigger_type: 'keyword_match',
    trigger_config: {
      keywords: ['marcar', 'agendar', 'marcação', 'marcacao', 'disponibilidade'],
      match_type: 'contains',
    },
    steps: [
      {
        step_type: 'send_message',
        step_config: {
          text: 'Claro, {{ contact.name }}! Para encontrarmos o melhor horário, diga-nos por favor o dia, período preferido e o tipo de massagem que procura.',
        },
      },
      {
        step_type: 'assign_conversation',
        step_config: { mode: 'round_robin' },
      },
    ],
  },
  massage_after_hours: {
    slug: 'massage_after_hours',
    name: 'Fora do horário — Massagem',
    description: 'Confirma a receção da mensagem fora do horário de atendimento.',
    trigger_type: 'new_message_received',
    trigger_config: {},
    steps: [
      {
        step_type: 'condition',
        step_config: { subject: 'time_of_day', operand: '20:00-09:00' },
      },
      {
        step_type: 'send_message',
        step_config: {
          text: 'Olá, {{ contact.name }}! Recebemos a sua mensagem. Neste momento estamos fora do horário, mas responderemos assim que possível. Obrigado pela compreensão. 🌿',
        },
        parent_index: 0,
        branch: 'yes',
      },
    ],
  },
  massage_follow_up: {
    slug: 'massage_follow_up',
    name: 'Follow-up delicado — Massagem',
    description: 'Retoma uma conversa de interesse após 24 horas.',
    trigger_type: 'keyword_match',
    trigger_config: {
      keywords: ['preço', 'preco', 'valores', 'massagem'],
      match_type: 'contains',
    },
    steps: [
      { step_type: 'wait', step_config: { amount: 1, unit: 'days' } },
      {
        step_type: 'send_message',
        step_config: {
          text: 'Olá, {{ contact.name }}! Ficou alguma dúvida sobre as nossas massagens ou horários? Estamos aqui para ajudar a encontrar o momento ideal para si. ✨',
        },
      },
    ],
  },
};

export function getTemplate(slug: string): AutomationTemplateDefinition | null {
  return AUTOMATION_TEMPLATES[slug as TemplateSlug] ?? null;
}
