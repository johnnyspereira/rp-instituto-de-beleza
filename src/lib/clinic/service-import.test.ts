import { describe, expect, it } from 'vitest';

import {
  parseServiceCsv,
  serviceImportGrossPrice,
} from '@/lib/clinic/service-import';

describe('service CSV import', () => {
  it('reads the Zappy-style semicolon CSV and converts net prices and rates', () => {
    const csv = [
      'agent_id;reference;name;description;category_id;unit_price;comission;comission_salesperson;tax_value',
      '"Versão geral";"=""946758""";"Massagem Relaxante";;Massagem;36,5854;0,7;0,3;0,23',
    ].join('\n');
    const result = parseServiceCsv(csv);

    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      reference: '946758',
      name: 'Massagem Relaxante',
      category: 'Massagem',
      taxRate: 0.23,
      commissionExecutantPercent: 70,
      commissionResponsiblePercent: 30,
    });
    expect(serviceImportGrossPrice(result.rows[0])).toBe(45);
  });

  it('also accepts the CRM exported comma CSV', () => {
    const result = parseServiceCsv(
      'Nome,Ref.,Duração,Preço,Categoria,Ativo\n"Reflexologia Podal","969154","60 min","50,00 €","Massagem","Sim"'
    );

    expect(result.rows[0]).toMatchObject({
      name: 'Reflexologia Podal',
      reference: '969154',
      durationMinutes: 60,
      active: true,
    });
    expect(serviceImportGrossPrice(result.rows[0])).toBe(50);
  });
});
