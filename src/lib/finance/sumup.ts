const API_BASE = 'https://api.sumup.com';

export function getSumUpCredentials() {
  const apiKey = process.env.SUMUP_API_KEY?.trim();
  const merchantCode = process.env.SUMUP_MERCHANT_CODE?.replace(/\s+/g, '').toUpperCase();
  if (!apiKey || !merchantCode) {
    throw new Error('SUMUP_API_KEY e SUMUP_MERCHANT_CODE têm de ser configuradas no servidor.');
  }
  return { apiKey, merchantCode };
}

export async function sumUpRequest(path: string, init: RequestInit = {}) {
  const { apiKey } = getSumUpCredentials();
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init.headers ?? {}),
    },
  });
}
