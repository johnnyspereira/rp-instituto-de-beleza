import { describe, expect, it } from 'vitest';

import {
  appointmentConfirmationEmail,
  appointmentStatusEmail,
  appointmentStatusMessage,
} from '@/lib/clinic/appointment-email';
import type { AppointmentMessageRow } from '@/lib/clinic/appointment-messages';

const appointment = {
  id: 'appointment-1',
  account_id: 'account-1',
  user_id: 'user-1',
  contact_id: 'contact-1',
  service_id: 'service-1',
  scheduled_start: '2026-08-30T09:00:00.000Z',
  scheduled_end: '2026-08-30T10:00:00.000Z',
  status: 'scheduled',
  currency: 'EUR',
  price: 45,
  contact: {
    id: 'contact-1',
    name: 'Maria <Teste>',
    phone: '+351900000000',
    email: 'maria@example.pt',
  },
  service: { name: 'Massagem terapêutica' },
  professional: { full_name: 'Ana Silva' },
} as AppointmentMessageRow;

describe('appointment email templates', () => {
  it('builds a confirmation email with safe HTML and anamnesis action', () => {
    const email = appointmentConfirmationEmail({
      appointment,
      businessName: 'RP Instituto de Beleza',
      anamnesisUrl: 'https://rp-instituto.example/anamnese/token',
    });
    expect(email.subject).toContain('Confirmação do seu agendamento');
    expect(email.html).toContain('Preencher ficha de anamnese');
    expect(email.html).toContain('Maria &lt;Teste&gt;');
    expect(email.text).toContain('Massagem terapêutica');
  });

  it('shows the configured logo, business signature and reserved benefit', () => {
    const email = appointmentConfirmationEmail({
      appointment,
      businessName: 'RP Instituto de Beleza',
      logoUrl: 'https://rp-instituto.example/logo.png',
      benefit: {
        type: 'pack',
        label: 'Pack Relaxamento 2x1',
        detail: '1 sessão reservada no pack',
      },
    });
    expect(email.html).toContain('https://rp-instituto.example/logo.png');
    expect(email.html).toContain('Pack Relaxamento 2x1');
    expect(email.html).toContain('1 sessão reservada no pack');
    expect(email.html).not.toContain('Equipa RP Instituto de Beleza');
    expect(email.text).toContain('Benefício: Pack Relaxamento 2x1');
  });

  it('builds matching WhatsApp and email content for status changes', () => {
    const whatsapp = appointmentStatusMessage({
      appointment,
      businessName: 'RP Instituto de Beleza',
      status: 'cancelled',
    });
    const email = appointmentStatusEmail({
      appointment,
      businessName: 'RP Instituto de Beleza',
      status: 'cancelled',
    });
    expect(whatsapp).toContain('Agendamento cancelado');
    expect(email.subject).toContain('Agendamento cancelado');
    expect(email.text).toContain('Massagem terapêutica');
  });
});
