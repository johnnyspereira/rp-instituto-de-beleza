import type {
  FinanceFundAccount,
  FinanceItemType,
  FinancePaymentMethod,
} from '@/types';

export type CartItem = {
  key: string;
  itemType: FinanceItemType;
  sourceId?: string;
  name: string;
  reference?: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxRate: number;
  metadata?: Record<string, unknown>;
};

export type PaymentDraft = {
  id: string;
  method: FinancePaymentMethod;
  amount: number;
  referenceCode: string;
  pinCode: string;
};

export type CatalogItem = {
  id: string;
  type: 'service' | 'product' | 'pack';
  name: string;
  reference?: string | null;
  price: number;
  detail: string;
  available?: boolean;
};

export type OpeningPosition = {
  id?: string;
  name: string;
  accountType: FinanceFundAccount['account_type'];
  institution: string;
  amount: number;
};
