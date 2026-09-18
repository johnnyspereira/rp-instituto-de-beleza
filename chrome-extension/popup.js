const crmUrlInput = document.getElementById('crmUrl');
const apiKeyInput = document.getElementById('apiKey');
const statusEl = document.getElementById('status');

function normalizeUrl(value) {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

async function load() {
  const data = await chrome.storage.sync.get(['crmUrl', 'apiKey']);
  crmUrlInput.value = data.crmUrl || '';
  apiKeyInput.value = data.apiKey || '';
}

async function save() {
  const crmUrl = normalizeUrl(crmUrlInput.value);
  const apiKey = apiKeyInput.value.trim();

  await chrome.storage.sync.set({ crmUrl, apiKey });
  crmUrlInput.value = crmUrl;
  statusEl.style.display = 'block';
  setTimeout(() => {
    statusEl.style.display = 'none';
  }, 2200);
}

document.getElementById('save').addEventListener('click', () => {
  void save();
});

document.getElementById('openWhatsapp').addEventListener('click', () => {
  void chrome.tabs.create({ url: 'https://web.whatsapp.com/' });
});

void load();
