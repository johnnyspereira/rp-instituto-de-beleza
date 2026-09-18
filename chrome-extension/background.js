function normalizeUrl(value) {
  const trimmed = String(value || '')
    .trim()
    .replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

async function crmFetch({ crmUrl, apiKey, path, init = {} }) {
  const baseUrl = normalizeUrl(crmUrl);
  if (!baseUrl || !apiKey) {
    throw new Error('Configure a URL do CRM e a API key no icone da extensao.');
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.error ||
      `Erro HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'AJ_CRM_FETCH') return false;

  crmFetch(message)
    .then((payload) => sendResponse({ ok: true, payload }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error?.message || 'Falha ao comunicar com o CRM.',
      })
    );

  return true;
});
