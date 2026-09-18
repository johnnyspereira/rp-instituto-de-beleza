import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { getSumUpCredentials, sumUpRequest } from '@/lib/finance/sumup';

export async function GET() {
  try {
    await requireRole('admin');
    const { apiKey, merchantCode } = getSumUpCredentials();
    const response = await sumUpRequest(
      `/v0.1/merchants/${encodeURIComponent(merchantCode)}/payment-methods`
    );
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
      param?: string;
    };
    return NextResponse.json({
      configured: Boolean(apiKey && merchantCode),
      verified: response.ok,
      error: response.ok
        ? null
        : `${payload.message || 'A SumUp rejeitou a configuração.'}${payload.param ? ` (${payload.param})` : ''}`,
      merchantCode: merchantCode ? `••••${merchantCode.slice(-4)}` : null,
      mode: apiKey?.startsWith('sumup_test_') ? 'test' : 'live',
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
