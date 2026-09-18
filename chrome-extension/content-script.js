(() => {
  const ROOT_ID = 'aj-crm-root';
  const PHONE_RE = /(?:\+|00)?\d[\d\s().-]{7,}\d/g;

  const state = {
    open: true,
    crmUrl: '',
    apiKey: '',
    conversation: {
      name: '',
      phone: '',
      rawPhone: '',
    },
    manualPhone: '',
    contact: null,
    status: 'Aguardando conversa no WhatsApp Web.',
    statusKind: 'neutral',
    loading: false,
    lastLookupPhone: '',
  };

  function normalizeUrl(value) {
    const trimmed = String(value || '').trim().replace(/\/+$/, '');
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  }

  function normalizePhone(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    let digits = value.replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    return digits;
  }

  function formatPhone(phone) {
    const digits = normalizePhone(phone);
    if (!digits) return '';
    if (digits.startsWith('351') && digits.length === 12) {
      return `+351 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
    }
    return digits.startsWith('351') ? `+${digits}` : digits;
  }

  function firstPhone(text) {
    const matches = String(text || '').match(PHONE_RE) || [];
    const hit = matches.find((item) => normalizePhone(item).length >= 8);
    return hit || '';
  }

  function looksLikePresence(value) {
    const text = String(value || '').trim().toLowerCase();
    return (
      !text ||
      text.includes('visto por') ||
      text.includes('last seen') ||
      text.includes('online') ||
      text.includes('digitando') ||
      text.includes('typing') ||
      text.includes('gravando') ||
      text.includes('recording') ||
      text.includes('dados do contato') ||
      text.includes('contact info')
    );
  }

  function cleanName(value) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (looksLikePresence(text)) return '';
    if (normalizePhone(text).length >= 8 && text.length < 24) return '';
    return text;
  }

  function textOf(node) {
    return (node?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function isVisible(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    if (node.closest?.(`#${ROOT_ID}`)) return false;
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none' &&
      Number(style.opacity || '1') > 0
    );
  }

  function scorePhone(rawPhone) {
    const digits = normalizePhone(rawPhone);
    if (digits.length < 8) return 0;
    let score = digits.length;
    if (digits.startsWith('351')) score += 6;
    if (digits.length >= 11 && digits.length <= 13) score += 4;
    if (digits.length > 15) score -= 8;
    return score;
  }

  function bestPhoneFromText(text) {
    const matches = String(text || '').match(PHONE_RE) || [];
    return (
      matches
        .map((raw) => ({ raw, score: scorePhone(raw) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)[0]?.raw || ''
    );
  }

  function getMainHeader() {
    return (
      document.querySelector('#main header') ||
      document.querySelector('[data-testid="conversation-panel-header"]') ||
      document.querySelector('[data-testid="conversation-info-header"]')
    );
  }

  function getContactInfoPanel() {
    const candidates = Array.from(
      document.querySelectorAll(
        'section, aside, div[role="region"], div[role="dialog"], [aria-label]'
      )
    );
    return candidates.find((node) => {
      const text = textOf(node).toLowerCase();
      return (
        text.includes('dados do contato') ||
        text.includes('contact info') ||
        text.includes('detalhes do contato')
      );
    });
  }

  function detectFromContactInfoPanel() {
    const panel = getContactInfoPanel();
    if (!panel) return null;

    const panelText = textOf(panel);
    const rawPhone = bestPhoneFromText(panelText) || firstPhone(panelText);
    const titleCandidates = Array.from(
      panel.querySelectorAll('span[title], h1, h2, h3, [dir="auto"]')
    )
      .map((node) => node.getAttribute?.('title') || textOf(node))
      .map(cleanName)
      .filter(Boolean);

    const name =
      titleCandidates.find((value) => normalizePhone(value).length < 8) ||
      titleCandidates[0] ||
      rawPhone ||
      '';

    if (!name && !rawPhone) return null;
    return {
      name,
      rawPhone,
      phone: normalizePhone(rawPhone),
    };
  }

  function detectFromVisiblePage() {
    const nodes = Array.from(
      document.querySelectorAll(
        'a[href^="tel:"], span, div, button, [title], [aria-label]'
      )
    ).filter(isVisible);

    const rawPhone =
      nodes
        .map((node) => {
          const href = node.getAttribute?.('href') || '';
          if (href.startsWith('tel:')) return href.slice(4);
          return (
            node.getAttribute?.('title') ||
            node.getAttribute?.('aria-label') ||
            textOf(node)
          );
        })
        .map(bestPhoneFromText)
        .filter(Boolean)
        .sort((a, b) => scorePhone(b) - scorePhone(a))[0] || '';

    if (!rawPhone) return null;

    const header = getMainHeader();
    const titleCandidates = header
      ? Array.from(
          header.querySelectorAll(
            'span[title], [dir="auto"][title], [role="button"] span[dir="auto"], span[dir="auto"]'
          )
        )
          .map((node) => node.getAttribute?.('title') || textOf(node))
          .map(cleanName)
          .filter(Boolean)
      : [];

    return {
      name: titleCandidates[0] || rawPhone,
      rawPhone,
      phone: normalizePhone(rawPhone),
    };
  }

  function detectConversation() {
    const panelConversation = detectFromContactInfoPanel();
    if (panelConversation?.phone) return panelConversation;

    const header = getMainHeader();
    if (!header) {
      return detectFromVisiblePage() || { name: '', phone: '', rawPhone: '' };
    }

    const titleCandidates = Array.from(
      header.querySelectorAll(
        'span[title], [dir="auto"][title], [role="button"] span[dir="auto"], span[dir="auto"]'
      )
    )
      .map((node) => node.getAttribute?.('title') || textOf(node))
      .map(cleanName)
      .filter(Boolean);

    const title = titleCandidates[0] || '';
    const rawPhone = firstPhone(`${title} ${textOf(header)} ${document.title}`);
    const phone = normalizePhone(rawPhone);
    const pageConversation = phone ? null : detectFromVisiblePage();

    return {
      name: title || panelConversation?.name || pageConversation?.name || rawPhone || '',
      rawPhone,
      phone: phone || panelConversation?.phone || pageConversation?.phone || '',
    };
  }

  async function loadSettings() {
    const data = await chrome.storage.sync.get(['crmUrl', 'apiKey']);
    state.crmUrl = normalizeUrl(data.crmUrl);
    state.apiKey = data.apiKey || '';
  }

  function requireConfig() {
    if (!state.crmUrl || !state.apiKey) {
      throw new Error('Configure a URL do CRM e a API key no icone da extensao.');
    }
  }

  async function crmFetch(path, init = {}) {
    requireConfig();
    const response = await chrome.runtime.sendMessage({
      type: 'AJ_CRM_FETCH',
      crmUrl: state.crmUrl,
      apiKey: state.apiKey,
      path,
      init,
    });
    if (!response?.ok) {
      throw new Error(response?.error || 'Falha ao comunicar com o CRM.');
    }
    return response.payload;
  }

  function readManualPhoneInput() {
    const input = document.querySelector(`#${ROOT_ID} [data-role="manual-phone"]`);
    if (input?.value) state.manualPhone = input.value;
    return normalizePhone(state.manualPhone);
  }

  function currentPhone() {
    return state.conversation.phone || readManualPhoneInput();
  }

  function setStatus(message, kind = 'neutral') {
    state.status = message;
    state.statusKind = kind;
    render();
  }

  async function findContact(options = {}) {
    const phone = currentPhone();
    if (!phone) {
      setStatus(
        'Nao consegui detectar o telefone. Abra os dados do contato ou informe manualmente.',
        'error'
      );
      return;
    }

    if (!options.silent) {
      state.loading = true;
      render();
    }

    try {
      const payload = await crmFetch(
        `/api/v1/contacts?search=${encodeURIComponent(phone)}&limit=5`
      );
      const contacts = Array.isArray(payload.data) ? payload.data : [];
      const exact =
        contacts.find((contact) => normalizePhone(contact.phone) === phone) ||
        contacts[0] ||
        null;
      state.contact = exact;
      state.lastLookupPhone = phone;
      setStatus(
        exact
          ? 'Cliente encontrado no CRM.'
          : 'Nenhum cliente encontrado para este numero.',
        exact ? 'ok' : 'neutral'
      );
    } catch (error) {
      console.error('[AJ CRM extension] find contact failed:', error);
      setStatus(error.message || 'Falha ao buscar cliente.', 'error');
    } finally {
      if (!options.silent) {
        state.loading = false;
        render();
      }
    }
  }

  async function createOrUpdateContact() {
    const phone = currentPhone();
    if (!phone) {
      setStatus('Nao ha telefone detectado para criar o cliente.', 'error');
      return;
    }

    state.loading = true;
    render();
    try {
      const payload = await crmFetch('/api/v1/contacts', {
        method: 'POST',
        body: JSON.stringify({
          phone,
          name: state.conversation.name || phone,
        }),
      });
      state.contact = payload.data || null;
      state.lastLookupPhone = phone;
      setStatus('Cliente criado/atualizado no CRM.', 'ok');
    } catch (error) {
      console.error('[AJ CRM extension] create contact failed:', error);
      setStatus(error.message || 'Falha ao criar cliente.', 'error');
    } finally {
      state.loading = false;
      render();
    }
  }

  function openCrm(path) {
    if (!state.crmUrl) {
      setStatus('Configure a URL do CRM no icone da extensao.', 'error');
      return;
    }
    window.open(`${state.crmUrl}${path}`, '_blank', 'noopener,noreferrer');
  }

  function contactPath(tab) {
    const id = state.contact?.id;
    if (!id) return '/contacts';
    return tab ? `/contacts/${id}?tab=${encodeURIComponent(tab)}` : `/contacts/${id}`;
  }

  async function copyToClipboard(value, successMessage) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(successMessage, 'ok');
    } catch {
      setStatus('Nao foi possivel copiar para a area de transferencia.', 'error');
    }
  }

  function render() {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      document.documentElement.appendChild(root);
    }

    const contact = state.contact;
    const tags = Array.isArray(contact?.tags) ? contact.tags : [];
    const phone = currentPhone();
    const configured = Boolean(state.crmUrl && state.apiKey);
    const contactInitial = (contact?.name || contact?.phone || '?')
      .slice(0, 1)
      .toUpperCase();

    root.innerHTML = `
      <button class="aj-crm-toggle" type="button" data-action="toggle">
        <span>${state.open ? 'CRM aberto' : 'Abrir CRM'}</span>
      </button>
      <aside class="aj-crm-panel ${state.open ? '' : 'aj-crm-hidden'}">
        <div class="aj-crm-head">
          <div>
            <div class="aj-crm-title">AJ CRM</div>
            <div class="aj-crm-subtitle">
              <span class="aj-crm-dot ${configured ? 'aj-crm-dot-ok' : 'aj-crm-dot-error'}"></span>
              ${configured ? 'Conectado ao CRM' : 'Configure URL e API key'}
            </div>
          </div>
          <button class="aj-crm-close" type="button" data-action="toggle">x</button>
        </div>

        <div class="aj-crm-body">
          <div class="aj-crm-section">
            <div class="aj-crm-label">Conversa atual</div>
            <div class="aj-crm-value">${escapeHtml(state.conversation.name || 'Nenhuma conversa detectada')}</div>
            <div class="aj-crm-muted" style="margin-top: 6px;">
              ${phone ? `Telefone: ${escapeHtml(formatPhone(phone))}` : 'Telefone ainda nao detectado'}
            </div>
            ${
              phone
                ? ''
                : `
                  <div class="aj-crm-manual-phone">
                    <input class="aj-crm-input" data-role="manual-phone" value="${escapeHtml(state.manualPhone)}" placeholder="+351 900 000 000" />
                    <button class="aj-crm-button" type="button" data-action="use-manual-phone">Usar telefone</button>
                  </div>
                `
            }
            <div class="aj-crm-row">
              <button class="aj-crm-button" type="button" data-action="find" ${state.loading ? 'disabled' : ''}>Buscar</button>
              <button class="aj-crm-button aj-crm-button-primary" type="button" data-action="create" ${state.loading ? 'disabled' : ''}>Criar/Atualizar</button>
            </div>
            <div class="aj-crm-row aj-crm-row-compact">
              <button class="aj-crm-button" type="button" data-action="copy-phone" ${phone ? '' : 'disabled'}>Copiar telefone</button>
              <button class="aj-crm-button" type="button" data-action="open-contacts-search" ${phone ? '' : 'disabled'}>Pesquisar no CRM</button>
            </div>
          </div>

          <div class="aj-crm-section">
            <div class="aj-crm-label">Cliente 360</div>
            ${
              contact
                ? `
                  <div class="aj-crm-client-card">
                    <div class="aj-crm-avatar">${escapeHtml(contactInitial)}</div>
                    <div class="aj-crm-client-main">
                      <div class="aj-crm-value">${escapeHtml(contact.name || contact.phone || 'Cliente')}</div>
                      <div class="aj-crm-muted">
                        Ref.: ${escapeHtml(contact.client_reference || contact.reference || 'sem referencia')}<br />
                        ${escapeHtml(formatPhone(contact.phone || ''))}
                      </div>
                    </div>
                  </div>
                  <div class="aj-crm-mini-grid">
                    <button class="aj-crm-mini" type="button" data-action="open-contact">Cliente 360</button>
                    <button class="aj-crm-mini" type="button" data-action="open-contact-edit">Editar ficha</button>
                    <button class="aj-crm-mini" type="button" data-action="open-new-appointment">Nova marcacao</button>
                    <button class="aj-crm-mini" type="button" data-action="open-contact-finance">Financeiro</button>
                  </div>
                  <div class="aj-crm-chipline">
                    ${
                      tags.length
                        ? tags
                            .map(
                              (tag) =>
                                `<span class="aj-crm-chip">${escapeHtml(tag.name || tag)}</span>`
                            )
                            .join('')
                        : '<span class="aj-crm-chip">sem etiquetas</span>'
                    }
                  </div>
                `
                : `
                  <div class="aj-crm-muted" style="margin-top: 6px;">
                    Busque ou crie o cliente para mostrar dados do CRM aqui.
                  </div>
                `
            }
          </div>

          <div class="aj-crm-section">
            <div class="aj-crm-label">Acoes rapidas</div>
            <div class="aj-crm-row">
              <button class="aj-crm-button" type="button" data-action="open-agenda">Agenda</button>
              <button class="aj-crm-button" type="button" data-action="open-finance">Financeiro</button>
            </div>
            <div class="aj-crm-row aj-crm-row-compact">
              <button class="aj-crm-button" type="button" data-action="open-inbox">Inbox</button>
              <button class="aj-crm-button" type="button" data-action="open-settings">API keys</button>
            </div>
            <div class="aj-crm-status aj-crm-status-${state.statusKind}">
              ${state.loading ? 'Processando...' : escapeHtml(state.status)}
            </div>
          </div>
        </div>
      </aside>
    `;

    root.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', handleAction);
    });
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function handleAction(event) {
    const action = event.currentTarget.getAttribute('data-action');
    if (action === 'toggle') {
      state.open = !state.open;
      render();
      return;
    }
    if (action === 'find') {
      void findContact();
      return;
    }
    if (action === 'copy-phone') {
      const phone = currentPhone();
      if (phone) void copyToClipboard(formatPhone(phone), 'Telefone copiado.');
      return;
    }
    if (action === 'open-contacts-search') {
      const phone = currentPhone();
      openCrm(phone ? `/contacts?search=${encodeURIComponent(phone)}` : '/contacts');
      return;
    }
    if (action === 'use-manual-phone') {
      const input = document.querySelector(`#${ROOT_ID} [data-role="manual-phone"]`);
      const rawPhone = input?.value || '';
      const phone = normalizePhone(rawPhone);
      if (!phone) {
        setStatus('Informe um telefone valido para usar nesta conversa.', 'error');
        return;
      }
      state.manualPhone = rawPhone;
      state.conversation = {
        ...state.conversation,
        rawPhone,
        phone,
        name: state.conversation.name || phone,
      };
      state.contact = null;
      state.lastLookupPhone = '';
      setStatus('Telefone definido manualmente para esta conversa.', 'ok');
      return;
    }
    if (action === 'create') {
      void createOrUpdateContact();
      return;
    }
    if (action === 'open-contact') {
      const id = state.contact?.id;
      openCrm(id ? `/contacts/${id}` : '/contacts');
      return;
    }
    if (action === 'open-contact-edit') {
      const id = state.contact?.id;
      openCrm(id ? `/contacts/${id}?edit=1` : '/contacts');
      return;
    }
    if (action === 'open-contact-finance') {
      openCrm(contactPath('finance'));
      return;
    }
    if (action === 'open-new-appointment') {
      const id = state.contact?.id;
      openCrm(id ? `/agenda?new=1&contact=${encodeURIComponent(id)}` : '/agenda?new=1');
      return;
    }
    if (action === 'open-inbox') {
      openCrm('/inbox');
      return;
    }
    if (action === 'open-agenda') {
      openCrm('/agenda');
      return;
    }
    if (action === 'open-finance') {
      openCrm('/finance');
      return;
    }
    if (action === 'open-settings') {
      openCrm('/settings?tab=api');
    }
  }

  function scheduleAutoLookup(next) {
    if (!next.phone || next.phone === state.lastLookupPhone) return;
    if (!state.crmUrl || !state.apiKey) return;

    state.lastLookupPhone = next.phone;
    window.setTimeout(() => {
      if (state.conversation.phone === next.phone && !state.contact) {
        void findContact({ silent: true });
      }
    }, 450);
  }

  function pollConversation() {
    let next = detectConversation();
    if (
      !next.phone &&
      state.conversation.phone &&
      next.name &&
      next.name === state.conversation.name
    ) {
      next = {
        ...next,
        rawPhone: state.conversation.rawPhone,
        phone: state.conversation.phone,
      };
    }
    if (!next.phone && state.manualPhone) {
      const phone = normalizePhone(state.manualPhone);
      if (phone) {
        next = {
          ...next,
          rawPhone: state.manualPhone,
          phone,
          name: next.name || state.conversation.name || phone,
        };
      }
    }

    const changed =
      next.name !== state.conversation.name ||
      next.phone !== state.conversation.phone;

    if (changed) {
      state.conversation = next;
      state.contact = null;
      state.lastLookupPhone = '';
      state.status = next.name
        ? 'Conversa detectada. Busque ou crie o cliente no CRM.'
        : 'Aguardando conversa no WhatsApp Web.';
      state.statusKind = 'neutral';
      render();
    }

    scheduleAutoLookup(next);
  }

  async function boot() {
    await loadSettings();
    state.conversation = detectConversation();
    render();
    scheduleAutoLookup(state.conversation);
    setInterval(pollConversation, 1200);

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      if (changes.crmUrl) state.crmUrl = normalizeUrl(changes.crmUrl.newValue);
      if (changes.apiKey) state.apiKey = changes.apiKey.newValue || '';
      setStatus('Configuracao da extensao atualizada.', 'ok');
    });
  }

  void boot();
})();
