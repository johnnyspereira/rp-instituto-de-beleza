import type { FinanceInvoiceRequest } from '@/types';

type FiscalProvider = 'vendus' | 'moloni' | 'invoicexpress' | 'manual_fiscal';

export type FiscalIssueInput = {
  provider: FiscalProvider;
  invoiceRequest: FinanceInvoiceRequest;
  sale: FiscalSale;
  config: Record<string, unknown>;
};

type FiscalSale = Record<string, unknown> & {
  items?: Array<Record<string, unknown>>;
};

export type FiscalIssueResult = {
  status: 'issued' | 'queued';
  externalDocumentId: string;
  documentNumber: string;
  documentUrl?: string | null;
  payload: Record<string, unknown>;
};

export function supportedFiscalProvider(provider: string): provider is FiscalProvider {
  return ['vendus', 'moloni', 'invoicexpress', 'manual_fiscal'].includes(provider);
}

export async function issueFiscalDocument({
  provider,
  invoiceRequest,
  sale,
  config,
}: FiscalIssueInput): Promise<FiscalIssueResult> {
  const payload = buildFiscalPayload(invoiceRequest, sale);

  if (provider === 'manual_fiscal') {
    const documentNumber =
      String(config.default_series || '').trim() ||
      invoiceRequest.invoice_number ||
      `MANUAL-${String(invoiceRequest.id).slice(0, 8).toUpperCase()}`;

    return {
      status: 'issued',
      externalDocumentId: `manual:${invoiceRequest.id}`,
      documentNumber,
      documentUrl: invoiceRequest.invoice_document_url || null,
      payload: {
        ...payload,
        mode: 'manual',
      },
    };
  }

  const hasCredentials =
    Boolean(config.api_key || config.access_token || config.client_secret) &&
    Boolean(config.account || config.company_id || config.tenant_id);

  if (!hasCredentials) {
    throw new Error(
      `${provider} ainda não tem credenciais suficientes configuradas.`
    );
  }

  // Integration adapters live behind this stable interface. We intentionally
  // queue real providers until their account-specific credentials and fiscal
  // mapping are validated in production.
  return {
    status: 'queued',
    externalDocumentId: `${provider}:${invoiceRequest.id}`,
    documentNumber:
      invoiceRequest.invoice_number ||
      `${provider.toUpperCase()}-${String(invoiceRequest.id).slice(0, 8)}`,
    documentUrl: null,
    payload: {
      ...payload,
      mode: 'queued',
      provider,
    },
  };
}

function buildFiscalPayload(
  invoiceRequest: FinanceInvoiceRequest,
  sale: FiscalSale
) {
  return {
    document_type: invoiceRequest.fiscal_document_type || 'invoice',
    customer: {
      name: invoiceRequest.fiscal_name,
      tax_id: invoiceRequest.tax_id,
      email: invoiceRequest.email,
      address_line: invoiceRequest.address_line,
      postal_code: invoiceRequest.postal_code,
      city: invoiceRequest.city,
      country: invoiceRequest.country || 'Portugal',
    },
    sale: {
      id: sale.id,
      sale_number: sale.sale_number,
      currency: sale.currency,
      subtotal: Number(sale.subtotal ?? 0),
      discount_amount: Number(sale.discount_amount ?? 0),
      tax_amount: Number(sale.tax_amount ?? 0),
      total_amount: Number(sale.total_amount ?? 0),
      paid_amount: Number(sale.paid_amount ?? 0),
    },
    items: (sale.items ?? []).map((item) => ({
      name: item.name_snapshot,
      quantity: Number(item.quantity ?? 1),
      unit_price: Number(item.unit_price ?? 0),
      discount_amount: Number(item.discount_amount ?? 0),
      tax_rate: Number(item.tax_rate ?? 0),
      tax_amount: Number(item.tax_amount ?? 0),
      total: Number(item.line_total ?? 0),
    })),
  };
}
