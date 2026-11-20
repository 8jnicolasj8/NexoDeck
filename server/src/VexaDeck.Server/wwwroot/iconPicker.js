/* Icon selector for the button editor: automatic, Lucide library or own image.
   Rendered with plain DOM; the Lucide subset lives in lucideLibrary.js. */
(function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ALIASES = {
    home: 'house',
    unlock: 'lock-open',
    'more-horizontal': 'ellipsis',
    'more-vertical': 'ellipsis-vertical',
    grid: 'layout-grid',
    'edit-3': 'pencil',
    'mic-2': 'mic',
    'check-square': 'square-check',
    'git-commit': 'git-branch'
  };

  let host = null;
  let root = null;
  let api = {
    getAction: () => ({ kind: '', params: {} }),
    getSuggestedIcon: () => 'circle',
    onChange: () => {},
    onExtracted: () => {}
  };

  let current = { kind: 'auto', value: 'auto', source: null };
  let activeTab = 'auto';
  let autoPreview = { url: null, name: '', source: '' };
  let autoToken = 0;
  let uploadInput = null;
  const autoCache = new Map();
  const autoPending = new Set();

  function t(key, vars) {
    return typeof window.t === 'function' ? window.t(key, vars) : key;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function basename(target) {
    if (!target) return '';
    const clean = String(target).replace(/[\\/]+$/, '');
    const parts = clean.split(/[\\/]/);
    return parts[parts.length - 1] || clean;
  }

  function normalize(icon) {
    if (!icon) return { kind: 'auto', value: 'auto', source: null };
    if (typeof icon === 'string') return { kind: 'lucide', value: icon, source: null };
    const kind = icon.kind || 'lucide';
    if (kind === 'auto') return { kind: 'auto', value: 'auto', source: null };
    return {
      kind,
      value: icon.value || 'circle',
      source: icon.source || null
    };
  }

  function copy(icon) {
    const normalized = normalize(icon);
    return normalized.source
      ? { kind: normalized.kind, value: normalized.value, source: normalized.source }
      : { kind: normalized.kind, value: normalized.value };
  }

  function resolveName(name) {
    const key = String(name || '').toLowerCase();
    if (window.LUCIDE_LIBRARY && window.LUCIDE_LIBRARY[key]) return key;
    if (ALIASES[key] && window.LUCIDE_LIBRARY && window.LUCIDE_LIBRARY[ALIASES[key]]) return ALIASES[key];
    return 'circle';
  }

  function svgNode(name, size, strokeWidth) {
    const resolved = resolveName(name);
    const data = (window.LUCIDE_LIBRARY && window.LUCIDE_LIBRARY[resolved]) || [];
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', strokeWidth || 2);
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('icon-svg');
    (data || []).forEach(([tag, attrs]) => {
      const child = document.createElementNS(SVG_NS, tag);
      Object.keys(attrs || {}).forEach((key) => child.setAttribute(key, attrs[key]));
      svg.appendChild(child);
    });
    return svg;
  }

  function imageNode(icon, size) {
    const img = el('img', 'icon-image');
    img.width = size;
    img.height = size;
    img.alt = '';
    img.src = icon.value;
    img.addEventListener('error', () => {
      img.replaceWith(svgNode('circle', size));
    });
    return img;
  }

  async function ensureAutoIcon(path) {
    if (!path || autoCache.has(path) || autoPending.has(path)) return;
    autoPending.add(path);
    try {
      const response = await fetch('/api/admin/icon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: path })
      });
      const data = await response.json().catch(() => ({}));
      const url = data.success && data.icon ? data.icon : '';
      autoCache.set(path, url);
      if (url && typeof api.onAutoResolved === 'function') {
        api.onAutoResolved({ path, url });
      }
    } catch {
      autoCache.set(path, '');
    } finally {
      autoPending.delete(path);
    }
  }

  /** DOM node for any icon config. Used by the grid and the phone preview. */
  function createIconNode(icon, size, action) {
    const normalized = normalize(icon);
    const pixels = size || 24;
    if (normalized.kind === 'image' || normalized.kind === 'exe') {
      if (normalized.value) return imageNode(normalized, pixels);
      return svgNode('circle', pixels);
    }
    if (normalized.kind === 'auto') {
      const path = action && action.kind === 'launch' && action.params && action.params.path;
      if (path) {
        const cached = autoCache.get(path);
        if (cached) return imageNode({ value: cached }, pixels);
        if (cached === undefined) ensureAutoIcon(path);
      } else if (autoPreview.url) {
        return imageNode({ value: autoPreview.url }, pixels);
      }
      return svgNode(api.getSuggestedIcon() || 'circle', pixels);
    }
    return svgNode(normalized.value, pixels);
  }

  function previewForCurrent(size) {
    const normalized = normalize(current);
    if (normalized.kind === 'auto') {
      return createIconNode(normalized, size, currentAction());
    }
    return createIconNode(normalized, size);
  }

  function summaryText() {
    const normalized = normalize(current);
    if (normalized.kind === 'auto') {
      return autoPreview.name
        ? t('icon.autoApp', { name: autoPreview.name })
        : t('icon.autoAction', { name: api.getSuggestedIcon() || 'circle' });
    }
    if (normalized.kind === 'lucide') return normalized.value;
    return basename(normalized.source || normalized.value);
  }

  function select(icon) {
    current = normalize(icon);
    activeTab = current.kind === 'auto' ? 'auto' : current.kind === 'lucide' ? 'library' : 'image';
    render();
    api.onChange(copy(current));
  }

  function renderSummary(container) {
    container.innerHTML = '';
    const preview = el('div', 'icon-preview');
    preview.appendChild(previewForCurrent(40));
    const copyBox = el('div', 'icon-summary-text');
    copyBox.appendChild(el('b', null, current.kind === 'auto' ? t('icon.auto') :
      current.kind === 'lucide' ? t('icon.library') : t('icon.image')));
    copyBox.appendChild(el('small', null, summaryText()));
    container.appendChild(preview);
    container.appendChild(copyBox);
  }

  function renderTabs(tabsHost) {
    const defs = [
      { id: 'auto', label: t('icon.auto') },
      { id: 'library', label: t('icon.library') },
      { id: 'image', label: t('icon.image') }
    ];
    tabsHost.innerHTML = '';
    defs.forEach((def) => {
      const button = el('button', 'picker-tab', def.label);
      button.type = 'button';
      button.dataset.tab = def.id;
      if (def.id === activeTab) button.classList.add('active');
      button.addEventListener('click', () => {
        activeTab = def.id;
        render();
      });
      tabsHost.appendChild(button);
    });
  }

  function renderAuto(body) {
    const card = el('div', 'icon-auto-card');
    const preview = el('div', 'icon-preview large');
    if (autoPreview.url) preview.appendChild(imageNode({ value: autoPreview.url }, 56));
    else preview.appendChild(svgNode(api.getSuggestedIcon() || 'circle', 56, 1.7));
    card.appendChild(preview);

    const copyBox = el('div', 'icon-auto-copy');
    copyBox.appendChild(el('b', null, autoPreview.name
      ? t('icon.autoApp', { name: autoPreview.name })
      : t('icon.autoAction', { name: api.getSuggestedIcon() || 'circle' })));
    copyBox.appendChild(el('p', 'form-hint', t('icon.autoHelp')));
    card.appendChild(copyBox);
    body.appendChild(card);

    const use = el('button', current.kind === 'auto' ? 'primary-button' : 'btn-secondary',
      current.kind === 'auto' ? t('icon.selected') : t('icon.auto'));
    use.type = 'button';
    use.disabled = current.kind === 'auto';
    use.addEventListener('click', () => select({ kind: 'auto', value: 'auto' }));
    body.appendChild(use);
  }

  function renderLibrary(body) {
    const search = el('input', 'form-input icon-search');
    search.type = 'search';
    search.placeholder = t('icon.search');
    body.appendChild(search);

    const grid = el('div', 'icon-library');
    body.appendChild(grid);
    let focusName = current.kind === 'lucide' ? current.value : '';

    const draw = () => {
      const term = search.value.trim().toLowerCase();
      grid.innerHTML = '';
      const names = Object.keys(window.LUCIDE_LIBRARY || {}).sort();
      const filtered = names.filter((name) => !term || name.includes(term));
      if (!filtered.length) {
        grid.appendChild(el('p', 'form-hint', t('picker.noApps')));
        return;
      }
      filtered.forEach((name) => {
        const button = el('button', 'icon-library-item');
        button.type = 'button';
        button.title = name;
        button.appendChild(svgNode(name, 22));
        if (current.kind === 'lucide' && current.value === name) button.classList.add('selected');
        button.addEventListener('click', () => {
          focusName = name;
          select({ kind: 'lucide', value: name });
        });
        grid.appendChild(button);
      });
    };

    search.addEventListener('input', draw);
    draw();
    if (focusName) search.placeholder = t('icon.search');
  }

  function renderImage(body) {
    const card = el('div', 'icon-image-card');
    const preview = el('div', 'icon-preview large');
    if (current.kind === 'image' || current.kind === 'exe') {
      preview.appendChild(createIconNode(current, 56));
    } else {
      preview.appendChild(el('span', 'icon-placeholder', '▣'));
    }
    card.appendChild(preview);
    const copyBox = el('div', 'icon-auto-copy');
    copyBox.appendChild(el('b', null, current.kind === 'image' || current.kind === 'exe'
      ? summaryText()
      : t('icon.image')));
    copyBox.appendChild(el('p', 'form-hint', t('icon.uploadHint')));
    card.appendChild(copyBox);
    body.appendChild(card);

    const actions = el('div', 'icon-image-actions');
    const upload = el('button', 'btn-secondary', t('icon.upload'));
    upload.type = 'button';
    upload.addEventListener('click', () => uploadInput && uploadInput.click());
    const extract = el('button', 'btn-secondary', t('icon.extract'));
    extract.type = 'button';
    extract.addEventListener('click', extractFromFile);
    actions.appendChild(upload);
    actions.appendChild(extract);
    body.appendChild(actions);
  }

  function setError(message) {
    if (!root) return;
    const box = root.querySelector('.icon-picker-error');
    if (box) {
      box.textContent = message || '';
      box.classList.toggle('hidden', !message);
    }
  }

  async function extractFromFile() {
    setError('');
    try {
      const pick = await fetch('/api/admin/pick-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'launch' })
      });
      const picked = await pick.json().catch(() => ({}));
      if (!picked.success || !picked.path) return;
      const response = await fetch('/api/admin/icon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: picked.path })
      });
      const data = await response.json().catch(() => ({}));
      if (!data.success || !data.icon) {
        setError(data.error || t('icon.extractError'));
        return;
      }
      api.onExtracted({ path: picked.path, name: picked.name || basename(picked.path) });
      select({ kind: 'exe', value: data.icon, source: picked.path });
    } catch (err) {
      setError(t('icon.extractError'));
    }
  }

  async function uploadFile(file) {
    if (!file) return;
    setError('');
    const form = new FormData();
    form.append('file', file);
    try {
      const response = await fetch('/api/admin/icon/upload', { method: 'POST', body: form });
      const data = await response.json().catch(() => ({}));
      if (!data.success || !data.icon) {
        setError(data.error || t('icon.uploadError'));
        return;
      }
      select({ kind: 'image', value: data.icon });
    } catch (err) {
      setError(t('icon.uploadError'));
    } finally {
      if (uploadInput) uploadInput.value = '';
    }
  }

  function render() {
    if (!host) return;
    host.innerHTML = '';
    root = el('div', 'icon-picker');

    const summary = el('div', 'icon-summary');
    renderSummary(summary);
    root.appendChild(summary);

    const tabs = el('div', 'picker-tabs icon-tabs');
    renderTabs(tabs);
    root.appendChild(tabs);

    const body = el('div', 'icon-tab-body');
    if (activeTab === 'auto') renderAuto(body);
    else if (activeTab === 'library') renderLibrary(body);
    else renderImage(body);
    root.appendChild(body);

    const error = el('p', 'field-error icon-picker-error hidden');
    root.appendChild(error);

    uploadInput = document.createElement('input');
    uploadInput.type = 'file';
    uploadInput.accept = '.png,.ico,.svg,image/png,image/svg+xml,image/x-icon';
    uploadInput.className = 'hidden';
    uploadInput.addEventListener('change', () => uploadFile(uploadInput.files && uploadInput.files[0]));
    root.appendChild(uploadInput);

    host.appendChild(root);
  }

  function currentAction() {
    try {
      return api.getAction() || { kind: '', params: {} };
    } catch {
      return { kind: '', params: {} };
    }
  }

  let lastAutoKey = null;

  async function refreshAction() {
    const action = currentAction();
    const path = action.kind === 'launch' && action.params ? action.params.path : null;
    const name = action.params ? action.params.appName : '';
    const key = `${action.kind}|${path || ''}|${name || ''}`;
    if (key === lastAutoKey) return;
    lastAutoKey = key;

    const token = ++autoToken;
    if (path) {
      const cached = autoCache.get(path);
      if (cached && autoPreview.url !== cached) {
        autoPreview = { url: cached, name: name || basename(path), source: path };
      }
      if (!cached) {
        try {
          const response = await fetch('/api/admin/icon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target: path })
          });
          const data = await response.json().catch(() => ({}));
          if (token !== autoToken) return;
          const url = data.success && data.icon ? data.icon : '';
          autoCache.set(path, url);
          autoPreview = { url: url || null, name: name || basename(path), source: path };
        } catch {
          if (token !== autoToken) return;
          autoCache.set(path, '');
          autoPreview = { url: null, name: name || basename(path), source: path };
        }
      }
    } else {
      autoPreview = { url: null, name: '', source: '' };
    }

    if (host && (current.kind === 'auto' || activeTab === 'auto')) render();
  }

  function init(options) {
    host = options.host;
    api = Object.assign(api, options.context || {});
    current = normalize(options.initial);
    activeTab = 'auto';
    render();
    refreshAction();
  }

  window.IconPicker = {
    init,
    setIcon(icon) {
      current = normalize(icon);
      activeTab = current.kind === 'auto' ? 'auto' : current.kind === 'lucide' ? 'library' : 'image';
      render();
      refreshAction();
    },
    setAuto() {
      select({ kind: 'auto', value: 'auto' });
    },
    getIcon: () => copy(current),
    isAuto: () => current.kind === 'auto',
    refreshAction,
    createIconNode,
    renderLucide: (name, size) => svgNode(name, size || 24)
  };
})();
