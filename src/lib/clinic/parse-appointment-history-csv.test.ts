import { describe, expect, it } from 'vitest';

import { parseAppointmentHistoryCsv } from './parse-appointment-history-csv';

describe('parseAppointmentHistoryCsv', () => {
  const header =
    'Data da marcação;is_online;Estado;Cliente;is_new_client;Colaborador;Serviço;Desconto;Preço final;Data de pagamento;Notas da marcação';

  it('parses the exact exported appointment format', () => {
    const result = parseAppointmentHistoryCsv(
      `${header}\n29/08/2026 12:30;0;Concluído;Maria Silva;0;Joana;Massagem relaxante;5,00;35,00;29/08/2026 13:30;"Pago; sem observações"`
    );
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      sourceLine: 2,
      status: 'Concluído',
      client: 'Maria Silva',
      professional: 'Joana',
      service: 'Massagem relaxante',
      discount: 5,
      finalPrice: 35,
      notes: 'Pago; sem observações',
    });
  });

  it('ignores blank export rows and reports invalid dates', () => {
    const result = parseAppointmentHistoryCsv(
      `${header}\n;;;;;;;;;;\ndata errada;0;Concluído;Maria;0;Joana;Massagem;0;40;;`
    );
    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([
      { line: 3, reason: 'Data da marcação inválida ou vazia.' },
    ]);
  });
});
