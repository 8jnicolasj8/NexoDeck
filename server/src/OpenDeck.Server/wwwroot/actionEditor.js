/* Selector-driven action editor. Everything is rendered from actionSchemas.json. */
(function () {
  const cache = {
    schemas: null,
    kinds: new Map(),
    processes: null,
    scripts: null,
    audio: new Map()
  };

  let host = null;
  let kindSelect = null;
  let paramsHost = null;
  let stateHost = null;
  let current = { kind: '', params: {} };
  let invalidValues = {};
  let context = {
    getPages: () => [],
    getProfiles: () => [],
    createPage: () => null,
    getUsedProcesses: () => [],
    onAppSelected: () => {},
    onChanged: () => {}
  };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function option(value, label, disabled) {
    const node = document.createElement('option');
    node.value = value;
    node.textContent = label;
    if (disabled) node.disabled = true;
    return node;
  }

  function visible(param) {
    if (!param.showIf) return true;
    const value = current.params[param.showIf.param];
    return String(value === undefined || value === null ? '' : value)
      .toLowerCase() === String(param.showIf.equals || '').toLowerCase();
  }

  async function load() {
    const response = await fetch('/api/admin/action-schemas');
    if (!response.ok) throw new Error('No se pudo cargar el registro de acciones.');
    const doc = await response.json();
    cache.schemas = doc;
    cache.kinds.clear();
    (doc.kinds || []).forEach((def) => cache.kinds.set(def.kind, def));
    populateKindSelect();
    return doc;
  }

  function populateKindSelect() {
    if (!kindSelect || !cache.schemas) return;
    const previous = kindSelect.value;
    kindSelect.innerHTML = '';
    kindSelect.appendChild(option('', window.t('editor.chooseAction'), true));

    (cache.schemas.categories || []).forEach((category) => {
      const kinds = (cache.schemas.kinds || []).filter((def) => def.category === category.id);
      if (!kinds.length) return;
      const group = document.createElement('optgroup');
      group.label = window.t(category.labelKey);
      kinds.forEach((def) => group.appendChild(option(def.kind, window.t(def.labelKey))));
      kindSelect.appendChild(group);
    });

    const unknown = current.kind && !cache.kinds.has(current.kind);
    if (unknown) {
      const group = document.createElement('optgroup');
      group.label = 'Otros';
      group.appendChild(option(current.kind, `${current.kind} (no disponible)`));
      kindSelect.appendChild(group);
    }

    if (previous && (cache.kinds.has(previous) || previous === current.kind)) kindSelect.value = previous;
  }

  function mount(options) {
    host = options.host;
    kindSelect = options.kindSelect;
    paramsHost = options.paramsHost;
    stateHost = options.stateHost;
    context = Object.assign(context, options.context || {});

    kindSelect.addEventListener('change', () => {
      setKind(kindSelect.value);
    });

    setKind('');
  }

  function defaultsFor(def) {
    const params = {};
    (def?.params || []).forEach((param) => {
      if (param.default !== undefined && param.default !== null) params[param.name] = param.default;
    });
    return params;
  }

  function setKind(kind) {
    current = { kind, params: defaultsFor(cache.kinds.get(kind)) };
    invalidValues = {};
    if (kindSelect) kindSelect.value = kind;
    render();
    context.onChanged(kind, current.params);
  }

  function setAction(action) {
    current = {
      kind: action?.kind || '',
      params: action?.params ? JSON.parse(JSON.stringify(action.params)) : {}
    };
    invalidValues = {};
    populateKindSelect();
    if (kindSelect) kindSelect.value = current.kind;
    render();
    context.onChanged(current.kind, current.params);
  }

  function getAction() {
    const def = cache.kinds.get(current.kind);
    if (!def) return { kind: current.kind, params: JSON.parse(JSON.stringify(current.params)) };

    const params = {};
    (def.params || []).forEach((param) => {
      if (!visible(param)) return;
      let value = current.params[param.name];
      if (value === undefined || value === null) return;
      if (param.type === 'text' || param.type === 'textarea') value = String(value).trim();
      if (typeof value === 'string' && value === '') return;
      if (Array.isArray(value) && value.length === 0 && !param.required) return;
      params[param.name] = value;
    });
    if (current.params.appName) params.appName = current.params.appName;
    return { kind: current.kind, params };
  }

  function getStateBinding() {
    const def = cache.kinds.get(current.kind);
    if (!def) return null;
    if (def.slider && def.slider.stateBinding) return def.slider.stateBinding;
    if (def.stateBinding && def.stateBinding.map) {
      const value = current.params[def.stateBinding.param];
      return def.stateBinding.map[value] || null;
    }
    return null;
  }

  function supportsToggle() {
    return !!getStateBinding();
  }

  function isKnownKind() {
    return cache.kinds.has(current.kind);
  }

  function render() {
    if (!paramsHost) return;
    paramsHost.innerHTML = '';
    const def = cache.kinds.get(current.kind);

    if (!current.kind) {
      paramsHost.appendChild(el('p', 'form-hint', 'Elegí el tipo de acción para configurar sus parámetros.'));
      updateStateHost();
      return;
    }

    if (!def) {
      const warning = el('div', 'field-warning', window.t('editor.invalidValue'));
      paramsHost.appendChild(warning);
      updateStateHost();
      return;
    }

    (def.params || []).forEach((param) => {
      if (!visible(param)) return;
      paramsHost.appendChild(renderField(def, param));
    });

    if (!(def.params || []).length) {
      paramsHost.appendChild(el('p', 'form-hint', 'Esta acción no necesita parámetros.'));
    }

    updateStateHost();
    context.onChanged(current.kind, current.params);
  }

  function updateStateHost() {
    if (!stateHost) return;
    stateHost.innerHTML = '';
    const binding = getStateBinding();
    if (!binding) {
      stateHost.appendChild(el('span', 'form-hint', window.t('editor.noState')));
      return;
    }
    const label = el('label', null, window.t('editor.state'));
    label.htmlFor = 'btnStateBindingInput';
    const input = el('input', 'form-input');
    input.id = 'btnStateBindingInput';
    input.readOnly = true;
    input.value = binding;
    input.tabIndex = -1;
    stateHost.appendChild(label);
    stateHost.appendChild(input);
  }

  function renderField(def, param) {
    const wrap = el('div', 'form-group action-param');
    wrap.dataset.param = param.name;

    if (param.type !== 'checkbox') {
      const label = el('label', null, window.t(param.labelKey || param.name) + (param.required ? ' *' : ''));
      wrap.appendChild(label);
    }

    const control = buildControl(def, param);
    wrap.appendChild(control.element);
    wrap._control = control;

    if (param.helpKey) wrap.appendChild(el('p', 'form-hint', window.t(param.helpKey)));
    if (param.warnKey) wrap.appendChild(el('p', 'form-warning', window.t(param.warnKey)));
    if (param.counter) {
      const counter = el('span', 'char-counter', '');
      wrap.appendChild(counter);
      wrap._counter = counter;
      updateCounter(param, control, counter);
    }

    if (invalidValues[param.name]) {
      wrap.classList.add('invalid');
      wrap.appendChild(el('p', 'field-error', invalidValues[param.name]));
    }

    return wrap;
  }

  function setValue(name, value, rerender) {
    current.params[name] = value;
    if (rerender) render();
    else {
      updateStateHost();
      context.onChanged(current.kind, current.params);
    }
  }

  function updateCounter(param, control, counter) {
    const value = String(current.params[param.name] || '');
    const max = param.maxLength ? ` / ${param.maxLength}` : '';
    counter.textContent = `${value.length}${max}`;
    if (param.maxLength && value.length > param.maxLength) counter.classList.add('over');
    else counter.classList.remove('over');
  }

  function baseInput(param) {
    const input = el('input', 'form-input');
    if (param.maxLength) input.maxLength = param.maxLength;
    if (param.placeholderKey) input.placeholder = window.t(param.placeholderKey);
    input.value = current.params[param.name] ?? '';
    return input;
  }

  function buildControl(def, param) {
    switch (param.type) {
      case 'select':
        return buildSelect(param);
      case 'textarea':
        return buildTextarea(param);
      case 'number':
        return buildNumber(param);
      case 'checkbox':
        return buildCheckbox(param);
      case 'hotkey':
        return buildHotkey(param);
      case 'process-picker':
        return buildProcessPicker(param);
      case 'app-picker':
        return buildAppPicker(param);
      case 'audio-device-picker':
        return buildAudioDevicePicker(param);
      case 'audio-device-multi':
        return buildAudioDeviceMulti(param);
      case 'script-picker':
        return buildScriptPicker(param);
      case 'page-picker':
        return buildPagePicker(param);
      case 'profile-picker':
        return buildProfilePicker(param);
      default:
        return buildText(param);
    }
  }

  function buildText(param) {
    const input = baseInput(param);
    input.addEventListener('input', () => {
      if (input.maxLength > 0 && input.value.length > input.maxLength) input.value = input.value.slice(0, input.maxLength);
      setValue(param.name, input.value);
      if (param.counter) {
        const counter = input.closest('.form-group')?._counter;
        if (counter) updateCounter(param, input, counter);
      }
    });
    return { element: input, get: () => input.value };
  }

  function buildTextarea(param) {
    const input = el('textarea', 'form-input');
    input.rows = 4;
    if (param.maxLength) input.maxLength = param.maxLength;
    if (param.placeholderKey) input.placeholder = window.t(param.placeholderKey);
    input.value = current.params[param.name] ?? '';
    input.addEventListener('input', () => {
      setValue(param.name, input.value);
      const wrap = input.closest('.form-group');
      if (wrap && wrap._counter) updateCounter(param, input, wrap._counter);
    });
    return { element: input, get: () => input.value };
  }

  function buildNumber(param) {
    const input = el('input', 'form-input');
    input.type = 'number';
    if (param.min !== undefined) input.min = param.min;
    if (param.max !== undefined) input.max = param.max;
    if (param.step !== undefined) input.step = param.step;
    input.value = current.params[param.name] ?? '';
    input.addEventListener('input', () => setValue(param.name, input.value === '' ? '' : Number(input.value)));
    return { element: input, get: () => input.value };
  }

  function buildCheckbox(param) {
    const label = el('label', 'checkbox-field');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = current.params[param.name] === true ||
      current.params[param.name] === 'true';
    input.addEventListener('change', () => setValue(param.name, input.checked, true));
    label.appendChild(input);
    label.appendChild(el('span', null, window.t(param.labelKey || param.name)));
    return { element: label, get: () => input.checked };
  }

  function buildSelect(param) {
    const select = el('select', 'form-select');
    const allowed = param.options || [];
    const value = current.params[param.name];
    const isInvalid = value !== undefined && value !== null && value !== '' &&
      !allowed.some((opt) => String(opt.value).toLowerCase() === String(value).toLowerCase());

    if (isInvalid) {
      select.appendChild(option(String(value), `${window.t('editor.invalidValue')} (${value})`));
      select.classList.add('invalid');
    }
    if (!param.required || isInvalid) {
      select.appendChild(option('', window.t('editor.chooseAction'), param.required));
    }
    allowed.forEach((opt) => select.appendChild(option(opt.value, window.t(opt.labelKey || opt.value))));
    if (!isInvalid && value !== undefined) select.value = String(value);
    else if (!isInvalid && param.default !== undefined) select.value = String(param.default);

    select.addEventListener('change', () => {
      select.classList.remove('invalid');
      setValue(param.name, select.value, true);
    });
    return { element: select, get: () => select.value };
  }

  function buildProcessPicker(param) {
    const wrap = el('div', 'picker-inline');
    const input = baseInput(param);
    const listId = `process-list-${param.name}-${Math.random().toString(36).slice(2, 7)}`;
    input.setAttribute('list', listId);
    input.placeholder = input.placeholder || window.t('picker.processHint');
    const list = el('datalist');
    list.id = listId;
    wrap.appendChild(input);
    wrap.appendChild(list);

    const fill = () => {
      list.innerHTML = '';
      const used = context.getUsedProcesses() || [];
      const running = (cache.processes || []).map((process) => process.name);
      const names = Array.from(new Set([...used, ...running])).sort();
      names.forEach((name) => list.appendChild(option(name, name)));
    };

    fill();
    if (!cache.processes) {
      fetch('/api/admin/processes')
        .then((response) => response.ok ? response.json() : [])
        .then((data) => { cache.processes = data || []; fill(); })
        .catch(() => {});
    }

    input.addEventListener('input', () => setValue(param.name, input.value));
    wrap.appendChild(el('p', 'form-hint', window.t('picker.processHint')));
    return { element: wrap, get: () => input.value };
  }

  function buildAppPicker(param) {
    const wrap = el('div', 'picker-field');
    const valueBox = el('div', 'picker-value');
    const change = el('button', 'btn-secondary', window.t('common.choose'));
    change.type = 'button';
    const updateLabel = () => {
      const name = current.params.appName || (current.params[param.name] ? String(current.params[param.name]).split(/[\\/]/).pop() : '');
      valueBox.textContent = name || window.t('common.none');
      valueBox.classList.toggle('empty', !name);
    };
    updateLabel();
    change.addEventListener('click', () => openAppPicker((app) => {
      current.params[param.name] = app.launch;
      current.params.appName = app.name;
      updateLabel();
      updateStateHost();
      context.onAppSelected(app.launch, app.name);
      context.onChanged(current.kind, current.params);
    }));
    wrap.appendChild(valueBox);
    wrap.appendChild(change);
    return { element: wrap, get: () => current.params[param.name] || '' };
  }

  function openAppPicker(onPick) {
    const backdrop = el('div', 'modal-backdrop picker-backdrop');
    const box = el('div', 'modal-box picker-box');
    const header = el('div', 'modal-header');
    header.appendChild(el('h3', null, window.t('picker.appTitle')));
    const close = el('button', 'modal-close', '×');
    close.type = 'button';
    header.appendChild(close);
    box.appendChild(header);

    const tabs = el('div', 'picker-tabs');
    const body = el('div', 'picker-body');
    const search = el('input', 'form-input');
    search.placeholder = window.t('picker.searchApps');
    const list = el('div', 'picker-list');

    const tabDefs = [
      { id: 'installed', label: window.t('picker.installed'), source: 'installed' },
      { id: 'running', label: window.t('picker.running'), source: 'running' },
      { id: 'browse', label: window.t('picker.browse'), source: null }
    ];
    let active = 'installed';
    let items = [];

    function setTab(id) {
      active = id;
      tabs.querySelectorAll('button').forEach((button) => button.classList.toggle('active', button.dataset.tab === id));
      search.style.display = id === 'browse' ? 'none' : 'block';
      list.innerHTML = '';
      if (id === 'browse') {
        const browse = el('button', 'primary-button', window.t('common.choose') + '…');
        browse.type = 'button';
        browse.addEventListener('click', async () => {
          const response = await fetch('/api/admin/pick-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: 'launch' })
          });
          const data = await response.json().catch(() => ({}));
          if (data.success && data.path) {
            onPick({ name: data.name || data.fileName, launch: data.path });
            backdrop.remove();
          } else if (data.error) {
            alert(window.t('picker.browseError') + ' ' + data.error);
          }
        });
        const hint = el('p', 'form-hint', 'Elegí un .exe o .lnk desde el disco.');
        const browseRow = el('div', 'picker-browse');
        browseRow.appendChild(browse);
        browseRow.appendChild(hint);
        list.appendChild(browseRow);
        return;
      }

      const tab = tabDefs.find((item) => item.id === id);
      list.appendChild(el('p', 'form-hint', window.t('common.loading')));
      fetch(`/api/admin/apps?source=${tab.source}`)
        .then((response) => response.ok ? response.json() : [])
        .then((data) => {
          items = data || [];
          renderList();
        })
        .catch(() => {
          list.innerHTML = '';
          list.appendChild(el('p', 'field-error', window.t('picker.browseError')));
        });
    }

    function renderList() {
      const term = search.value.trim().toLowerCase();
      const filtered = items.filter((item) => !term || String(item.name).toLowerCase().includes(term));
      list.innerHTML = '';
      if (!filtered.length) {
        list.appendChild(el('p', 'form-hint', window.t('picker.noApps')));
        return;
      }
      filtered.slice(0, 250).forEach((item) => {
        const row = el('button', 'picker-row');
        row.type = 'button';
        const icon = el('span', 'picker-row-icon', item.source === 'store' ? '▣' : '▤');
        const text = el('span', 'picker-row-text');
        text.appendChild(el('b', null, item.name));
        text.appendChild(el('small', null, item.aumid || item.launch));
        row.appendChild(icon);
        row.appendChild(text);
        row.addEventListener('click', () => {
          onPick({ name: item.name, launch: item.launch });
          backdrop.remove();
        });
        list.appendChild(row);
      });
    }

    tabDefs.forEach((tab) => {
      const button = el('button', 'picker-tab', tab.label);
      button.type = 'button';
      button.dataset.tab = tab.id;
      button.addEventListener('click', () => setTab(tab.id));
      tabs.appendChild(button);
    });

    search.addEventListener('input', renderList);
    close.addEventListener('click', () => backdrop.remove());
    backdrop.addEventListener('click', (event) => { if (event.target === backdrop) backdrop.remove(); });

    box.appendChild(tabs);
    body.appendChild(search);
    body.appendChild(list);
    box.appendChild(body);
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
    setTab(active);
  }

  function audioDevices(flow) {
    return fetch(`/api/admin/audio-devices?flow=${encodeURIComponent(flow || 'output')}`)
      .then((response) => response.ok ? response.json() : [])
      .catch(() => []);
  }

  function buildAudioDevicePicker(param) {
    const select = el('select', 'form-select');
    const flow = current.params.flow || 'output';
    select.appendChild(option('', window.t('common.loading')));
    audioDevices(flow).then((devices) => {
      select.innerHTML = '';
      select.appendChild(option('', window.t('picker.chooseDevice'), true));
      devices.forEach((device) => {
        select.appendChild(option(device.id, `${device.name}${device.isDefault ? ' ✓' : ''}`));
      });
      const value = current.params[param.name];
      if (value && !devices.some((device) => device.id === value)) {
        select.appendChild(option(value, `${window.t('editor.invalidValue')} (${value})`));
      }
      select.value = value || '';
    });
    select.addEventListener('change', () => setValue(param.name, select.value));
    return { element: select, get: () => select.value };
  }

  function buildAudioDeviceMulti(param) {
    const wrap = el('div', 'device-checklist');
    const flow = current.params.flow || 'output';
    const selected = Array.isArray(current.params[param.name]) ? current.params[param.name] : [];
    wrap.appendChild(el('p', 'form-hint', window.t('common.loading')));
    audioDevices(flow).then((devices) => {
      wrap.innerHTML = '';
      if (!devices.length) {
        wrap.appendChild(el('p', 'form-hint', window.t('picker.audioEmpty')));
        return;
      }
      const all = el('label', 'checkbox-field');
      const allInput = el('input');
      allInput.type = 'checkbox';
      allInput.checked = selected.length === 0;
      all.appendChild(allInput);
      all.appendChild(el('span', null, 'Todos los dispositivos activos'));
      wrap.appendChild(all);

      devices.forEach((device) => {
        const label = el('label', 'checkbox-field');
        const input = el('input');
        input.type = 'checkbox';
        input.value = device.id;
        input.checked = selected.length === 0 || selected.includes(device.id);
        input.dataset.device = device.id;
        input.addEventListener('change', () => {
          const checked = Array.from(wrap.querySelectorAll('input[data-device]:checked')).map((item) => item.value);
          const allBoxes = Array.from(wrap.querySelectorAll('input[data-device]'));
          current.params[param.name] = checked.length === allBoxes.length ? [] : checked;
          allInput.checked = checked.length === allBoxes.length;
          context.onChanged(current.kind, current.params);
        });
        label.appendChild(input);
        label.appendChild(el('span', null, device.name));
        wrap.appendChild(label);
      });

      allInput.addEventListener('change', () => {
        wrap.querySelectorAll('input[data-device]').forEach((input) => { input.checked = allInput.checked; });
        current.params[param.name] = [];
        context.onChanged(current.kind, current.params);
      });
    });
    return { element: wrap, get: () => current.params[param.name] || [] };
  }

  function buildScriptPicker(param) {
    const wrap = el('div', 'picker-field');
    const select = el('select', 'form-select');
    const add = el('button', 'btn-secondary', window.t('picker.addScript'));
    add.type = 'button';
    select.appendChild(option('', window.t('common.loading')));
    wrap.appendChild(select);
    wrap.appendChild(add);

    const loadScripts = () => fetch('/api/admin/scripts')
      .then((response) => response.ok ? response.json() : [])
      .then((scripts) => {
        cache.scripts = scripts || [];
        select.innerHTML = '';
        if (!cache.scripts.length) {
          select.appendChild(option('', window.t('picker.scriptEmpty'), true));
        } else {
          select.appendChild(option('', window.t('editor.chooseAction'), true));
          cache.scripts.forEach((script) => select.appendChild(option(script.file, script.name)));
        }
        const value = current.params[param.name];
        if (value && !cache.scripts.some((script) => script.file === value)) {
          select.appendChild(option(value, `${window.t('editor.invalidValue')} (${value})`));
        }
        select.value = value || '';
      })
      .catch(() => {});

    add.addEventListener('click', async () => {
      const response = await fetch('/api/admin/pick-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'script' })
      });
      const data = await response.json().catch(() => ({}));
      if (data.success && data.fileName) {
        current.params[param.name] = data.fileName;
        await loadScripts();
        select.value = data.fileName;
        context.onChanged(current.kind, current.params);
      }
    });

    select.addEventListener('change', () => setValue(param.name, select.value));
    loadScripts();
    return { element: wrap, get: () => select.value };
  }

  function buildPagePicker(param) {
    const select = el('select', 'form-select');
    const pages = context.getPages() || [];
    select.appendChild(option('', window.t('editor.chooseAction'), true));
    pages.forEach((page) => select.appendChild(option(page.id, page.name)));
    select.appendChild(option('__new__', window.t('editor.pageNew')));
    const value = current.params[param.name];
    if (value && !pages.some((page) => page.id === value)) {
      select.appendChild(option(value, `${window.t('editor.invalidValue')} (${value})`));
    }
    select.value = value || '';
    select.addEventListener('change', () => {
      if (select.value === '__new__') {
        const name = prompt(window.t('editor.pageNewPrompt'));
        if (!name) { select.value = value || ''; return; }
        const page = context.createPage(name);
        if (page) {
          current.params[param.name] = page.id;
          render();
          context.onChanged(current.kind, current.params);
        }
        return;
      }
      setValue(param.name, select.value);
    });
    return { element: select, get: () => select.value };
  }

  function buildProfilePicker(param) {
    const select = el('select', 'form-select');
    select.appendChild(option('', window.t('common.auto')));
    (context.getProfiles() || []).forEach((profile) => {
      select.appendChild(option(profile.id, `${profile.name} (${profile.id})`));
    });
    const value = current.params[param.name];
    if (value && !(context.getProfiles() || []).some((profile) => profile.id === value)) {
      select.appendChild(option(value, `${window.t('editor.invalidValue')} (${value})`));
    }
    select.value = value || '';
    select.addEventListener('change', () => setValue(param.name, select.value));
    return { element: select, get: () => select.value };
  }

  function buildHotkey(param) {
    const wrap = el('div', 'hotkey-control');
    const presets = def_presets();
    const keys = Array.isArray(current.params[param.name]) ? current.params[param.name].slice() : [];
    const maxKeys = param.maxKeys || 4;

    const presetSelect = el('select', 'form-select');
    let matchedIndex = -1;
    presets.forEach((preset, index) => {
      if (sameKeys(preset.keys, keys)) matchedIndex = index;
    });
    const groups = new Map();
    presets.forEach((preset, index) => {
      if (!groups.has(preset.group)) groups.set(preset.group, []);
      groups.get(preset.group).push({ preset, index });
    });
    groups.forEach((entries, group) => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = window.t(`cat.${group}`) === `cat.${group}` ? group : window.t(`cat.${group}`);
      entries.forEach(({ preset, index }) => optgroup.appendChild(option(String(index), window.t(preset.labelKey))));
      presetSelect.appendChild(optgroup);
    });
    presetSelect.appendChild(option('__custom__', window.t('editor.custom')));
    presetSelect.value = matchedIndex >= 0 ? String(matchedIndex) : '__custom__';
    wrap.appendChild(presetSelect);

    const chips = el('div', 'hotkey-chips');
    wrap.appendChild(chips);

    const actions = el('div', 'hotkey-actions');
    const record = el('button', 'btn-secondary', window.t('editor.record'));
    record.type = 'button';
    const clear = el('button', 'btn-secondary', window.t('editor.clear'));
    clear.type = 'button';
    actions.appendChild(record);
    actions.appendChild(clear);
    wrap.appendChild(actions);
    wrap.appendChild(el('p', 'form-hint', window.t('editor.maxKeys', { n: maxKeys })));

    const updateChips = () => {
      chips.innerHTML = '';
      const currentKeys = current.params[param.name] || [];
      if (!currentKeys.length) {
        chips.appendChild(el('span', 'form-hint', window.t('editor.chipsEmpty')));
        return;
      }
      currentKeys.forEach((key) => chips.appendChild(el('span', 'hotkey-chip', key)));
    };

    const applyKeys = (nextKeys) => {
      current.params[param.name] = nextKeys.slice(0, maxKeys);
      updateChips();
      context.onChanged(current.kind, current.params);
    };

    updateChips();

    presetSelect.addEventListener('change', () => {
      if (presetSelect.value === '__custom__') {
        wrap.classList.add('custom');
        return;
      }
      const preset = presets[Number(presetSelect.value)];
      if (preset) {
        applyKeys(preset.keys);
        wrap.classList.remove('custom');
      }
    });

    clear.addEventListener('click', () => {
      applyKeys([]);
      presetSelect.value = '__custom__';
      wrap.classList.add('custom');
    });

    let recording = false;
    let handler = null;
    const stop = () => {
      recording = false;
      record.textContent = window.t('editor.record');
      if (handler) window.removeEventListener('keydown', handler, true);
      handler = null;
    };

    record.addEventListener('click', () => {
      if (recording) { stop(); return; }
      recording = true;
      record.textContent = window.t('editor.recording');
      handler = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.key === 'Escape') { stop(); return; }
        const key = mapKey(event);
        if (!key) return;
        const combo = [];
        if (event.ctrlKey) combo.push('ctrl');
        if (event.shiftKey) combo.push('shift');
        if (event.altKey) combo.push('alt');
        if (event.metaKey) combo.push('win');
        combo.push(key);
        applyKeys(combo);
        presetSelect.value = '__custom__';
        wrap.classList.add('custom');
        stop();
      };
      window.addEventListener('keydown', handler, true);
    });

    if (matchedIndex < 0) wrap.classList.add('custom');
    return { element: wrap, get: () => current.params[param.name] || [] };
  }

  function def_presets() {
    const def = cache.kinds.get(current.kind);
    return def?.presets || [];
  }

  function sameKeys(a, b) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
      a.every((key, index) => String(key).toLowerCase() === String(b[index]).toLowerCase());
  }

  function mapKey(event) {
    const key = String(event.key || '').toLowerCase();
    if (['control', 'shift', 'alt', 'meta', 'os'].includes(key)) return null;
    const map = {
      'escape': 'esc',
      ' ': 'space',
      'arrowup': 'up',
      'arrowdown': 'down',
      'arrowleft': 'left',
      'arrowright': 'right',
      'pageup': 'pageup',
      'pagedown': 'pagedown',
      'delete': 'delete',
      'insert': 'insert',
      'printscreen': 'prtscn',
      'capslock': 'caps',
      'numlock': 'numlock',
      'scrolllock': 'scrolllock',
      '+': 'add',
      '=': 'oemplus',
      ',': ',',
      '.': '.',
      '/': '/',
      '\\': '\\',
      ';': ';',
      '\'': '\'',
      '`': '`',
      '[': '[',
      ']': ']',
      '-': 'oemminus'
    };
    if (map[key]) return map[key];
    if (/^f\d{1,2}$/.test(key)) return key;
    if (key.length === 1) return key;
    return ['enter', 'tab', 'backspace', 'home', 'end', 'pause'].includes(key) ? key : null;
  }

  function validate() {
    const errors = {};
    const def = cache.kinds.get(current.kind);
    if (!current.kind) {
      errors.__kind = 'Elegí un tipo de acción.';
      renderErrors(errors);
      return errors;
    }
    if (!def) {
      renderErrors(errors);
      return errors;
    }

    (def.params || []).forEach((param) => {
      if (!visible(param)) return;
      const value = current.params[param.name];
      const empty = value === undefined || value === null || String(value).trim() === '' ||
        (Array.isArray(value) && value.length === 0);
      if (empty) {
        if (param.required) errors[param.name] = window.t('editor.required');
        return;
      }

      if (param.type === 'number') {
        const number = Number(value);
        if (!Number.isFinite(number)) errors[param.name] = window.t('editor.invalidNumber');
        else if ((param.min !== undefined && number < param.min) || (param.max !== undefined && number > param.max)) {
          errors[param.name] = window.t('editor.outOfRange');
        }
      }

      if (param.maxLength && String(value).length > param.maxLength) {
        errors[param.name] = window.t('editor.tooLong');
      }

      if (param.type === 'hotkey' && (!Array.isArray(value) || value.length === 0)) {
        errors[param.name] = window.t('editor.hotkeyEmpty');
      }

      if (param.pattern && ['text', 'textarea'].includes(param.type)) {
        try {
          if (!new RegExp(param.pattern).test(String(value))) errors[param.name] = window.t('editor.invalidUrl');
        } catch { }
      }

      if (param.type === 'select' && param.options && !param.options.some((opt) =>
        String(opt.value).toLowerCase() === String(value).toLowerCase())) {
        errors[param.name] = window.t('editor.invalidOption');
      }
    });

    renderErrors(errors);
    return errors;
  }

  function renderErrors(errors) {
    invalidValues = errors;
    if (!paramsHost) return;
    paramsHost.querySelectorAll('.form-group').forEach((group) => {
      group.classList.remove('invalid');
      group.querySelectorAll('.field-error').forEach((node) => node.remove());
    });
    Object.keys(errors).forEach((name) => {
      const group = paramsHost.querySelector(`.form-group[data-param="${name}"]`);
      if (!group) return;
      group.classList.add('invalid');
      group.appendChild(el('p', 'field-error', errors[name]));
    });
  }

  function suggestedIcon() {
    return cache.kinds.get(current.kind)?.icon || 'circle';
  }

  window.ActionEditor = {
    load,
    mount,
    setAction,
    setKind,
    getAction,
    getStateBinding,
    supportsToggle,
    isKnownKind,
    validate,
    render,
    suggestedIcon,
    getKind: () => current.kind
  };
})();
