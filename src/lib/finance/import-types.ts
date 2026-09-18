export type TreasuryImportKind = 'payable' | 'receivable';

export type TreasuryImportRow = {
  id: string;
  selected: boolean;
  kind: TreasuryImportKind;
  description: string;
  counterparty: string;
  category: string;
  amount: number;
  date: string;
  currency: string;
  reference: string;
  confidence: number;
  settled: boolean;
  duplicate?: boolean;
};

export const TREASURY_IMPORT_CATEGORIES = [
  'Renda e instalações',
  'Fornecedores',
  'Produtos e stock',
  'Salários e comissões',
  'Impostos e taxas',
  'Marketing',
  'Software e subscrições',
  'Energia e comunicações',
  'Manutenção',
  'Formação',
  'Seguros',
  'Transportes',
  'Outros',
] as const;
