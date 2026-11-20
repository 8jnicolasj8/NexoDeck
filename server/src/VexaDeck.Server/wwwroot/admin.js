// VexaDeck Admin Panel
// 100% Local, zero cloud dependencies. New UI strings go through window.t().

function tr(key, vars) {
  return typeof window.t === 'function' ? window.t(key, vars) : key;
}

function applyI18n(root) {
  const scope = root || document;
  scope.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = tr(node.dataset.i18n);
  });
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const METRIC_OPTIONS = [
  { id: 'none', label: '(Ninguna)' },
  { id: 'cpu.load', label: 'CPU · Carga (%)' },
  { id: 'cpu.temp', label: 'CPU · Temperatura (°C)' },
  { id: 'ram.used', label: 'RAM · Usada (%)' },
  { id: 'ram.used_gb', label: 'RAM · Usada (GB)' },
  { id: 'gpu.load', label: 'GPU · Carga (%)' },
  { id: 'gpu.temp', label: 'GPU · Temperatura (°C)' },
  { id: 'net.down', label: 'Red · Descarga (KB/s)' },
  { id: 'net.up', label: 'Red · Subida (KB/s)' },
  { id: 'ping.app', label: 'LAN · Latencia (ms)' }
];

const state = {
  config: null,
  activeProfileId: 'global',
  activePageIndex: 0,
  editingCell: null, // { row, col, button }
  processes: [],
  telemetryTimer: null
};

// --- BREADCRUMBS & NAVIGATION ---
const crumb = document.querySelector('#crumb');
const pageNames = {
  inicio: 'Inicio',
  emparejar: 'Emparejar',
  perfiles: 'Perfiles y botones',
  deteccion: 'Detección de apps',
  telemetria: 'Telemetría',
  scripts: 'Scripts',
  sistema: 'Configuración'
};

function openPage(name) {
  if (!pageNames[name]) return;
  document.querySelectorAll('.page-view').forEach(p => p.classList.toggle('hidden', p.id !== `page-${name}`));
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.page === name));
  crumb.textContent = pageNames[name];
  history.replaceState(null, '', `#${name}`);

  if (name === 'inicio') {
    loadOverview();
    loadSpotify();
    startTelemetryLoop();
  } else {
    stopTelemetryLoop();
  }

  if (name === 'emparejar') {
    loadPairing();
    loadDevices();
  } else if (name === 'perfiles') {
    renderProfilesView();
  } else if (name === 'deteccion') {
    loadProcesses();
  } else if (name === 'telemetria') {
    renderTelemetryView();
  } else if (name === 'scripts') {
    loadScripts();
  } else if (name === 'sistema') {
    loadSystemView();
  }
}

// --- OVERVIEW & INICIO ---
async function loadOverview() {
  try {
    const res = await fetch('/api/admin/overview');
    if (!res.ok) return;
    const data = await res.json();
    if (data.ip) document.querySelector('#localIp').textContent = data.ip;
    if (data.ports && data.ports.length) {
      document.querySelector('#serverPorts').textContent = data.ports.join(' · ');
    }
    const devCount = data.connectedDevices ?? 0;
    document.querySelector('#deviceCount').textContent = devCount;
    document.querySelector('#deviceStatusText').textContent = devCount === 1 ? '1 celular conectado' : `${devCount} celulares conectados`;
    if (data.dataDir) {
      document.querySelector('#dataPath').textContent = data.dataDir;
    }

    if (state.config && state.config.profiles) {
      const activeProf = state.config.profiles.find(p => p.id === state.config.defaultProfileId) || state.config.profiles[0];
      if (activeProf) {
        document.querySelector('#homeActiveProfile').textContent = activeProf.name;
        document.querySelector('#homeProfileGrid').textContent = `${activeProf.grid.cols} × ${activeProf.grid.rows} · ${activeProf.name}`;
        renderHomeMiniGrid(activeProf.grid.cols, activeProf.grid.rows);
      }
    }
  } catch (err) {
    console.error('Error cargando overview:', err);
  }
}

function renderHomeMiniGrid(cols, rows) {
  const container = document.querySelector('#homeProfileVisual');
  if (!container) return;
  container.style.gridTemplateColumns = `repeat(${cols}, 10px)`;
  container.innerHTML = '';
  const total = Math.min(cols * rows, 32);
  for (let i = 0; i < total; i++) {
    const dot = document.createElement('i');
    container.appendChild(dot);
  }
}

function startTelemetryLoop() {
  stopTelemetryLoop();
  fetchLiveTelemetry();
  state.telemetryTimer = setInterval(fetchLiveTelemetry, 2500);
}

function stopTelemetryLoop() {
  if (state.telemetryTimer) {
    clearInterval(state.telemetryTimer);
    state.telemetryTimer = null;
  }
}

async function fetchLiveTelemetry() {
  try {
    const res = await fetch('/api/admin/telemetry');
    if (!res.ok) return;
    const metrics = await res.json();
    if (metrics['cpu.load'] !== undefined) {
      document.querySelector('#homeCpuLoad').textContent = `${Math.round(metrics['cpu.load'])}%`;
    }
    if (metrics['ram.used'] !== undefined) {
      const ram = Math.round(metrics['ram.used']);
      document.querySelector('#homeRamBar').style.width = `${ram}%`;
      document.querySelector('#homeRamVal').textContent = `${ram}%`;
    }
    if (metrics['net.down'] !== undefined && metrics['net.up'] !== undefined) {
      const down = Math.round(metrics['net.down']);
      const up = Math.round(metrics['net.up']);
      const maxNet = 5000;
      const pct = Math.min(100, Math.round(((down + up) / maxNet) * 100));
      document.querySelector('#homeNetBar').style.width = `${pct}%`;
      document.querySelector('#homeNetVal').textContent = `${down} KB/s`;
    }
  } catch { }
}

// --- SPOTIFY ---
async function loadSpotify() {
  const statusText = document.querySelector('#spotifyStatusText');
  if (!statusText) return;
  try {
    const res = await fetch('/api/admin/spotify');
    if (!res.ok) return;
    const data = await res.json();
    renderSpotify(data);
    if (data.clientIdConfigured && data.linked) refreshSpotifyTrack();
  } catch {
    statusText.textContent = 'No se pudo consultar el estado de Spotify.';
  }
}

function renderSpotify(data) {
  const badge = document.querySelector('#spotifyBadge');
  const statusText = document.querySelector('#spotifyStatusText');
  const account = document.querySelector('#spotifyAccount');
  const redirect = document.querySelector('#spotifyRedirect');
  const connect = document.querySelector('#btnSpotifyConnect');

  if (redirect && data.redirectUri) redirect.textContent = data.redirectUri;
  if (connect) connect.disabled = !data.clientIdConfigured;

  if (data.linked) {
    if (badge) badge.textContent = 'VINCULADO';
    if (statusText) statusText.textContent = data.displayName ? `Conectado como ${data.displayName}` : 'Cuenta vinculada.';
    if (account) account.textContent = 'PREMIUM';
  } else {
    if (badge) badge.textContent = 'SIN VINCULAR';
    if (statusText) {
      statusText.textContent = data.clientIdConfigured
        ? 'Falta autorizar tu cuenta desde el navegador.'
        : 'Pegá el Client ID de tu app de Spotify para empezar.';
    }
    if (account) account.textContent = '—';
  }
}

async function refreshSpotifyTrack() {
  const node = document.querySelector('#spotifyTrack');
  if (!node) return;
  try {
    const res = await fetch('/api/admin/spotify/now-playing');
    const data = await res.json();
    if (!data.ok) {
      node.textContent = data.error || '';
      return;
    }
    const track = data.track;
    node.textContent = track
      ? `${track.playing ? '▶' : '❚❚'} ${track.title} — ${track.artists}`
      : 'Sin reproducción activa.';
  } catch {
    node.textContent = '';
  }
}

// --- CONFIG API ---
async function loadConfig() {
  try {
    const res = await fetch('/api/admin/config');
    if (!res.ok) throw new Error('No se pudo cargar la configuración');
    state.config = await res.json();
    if (!state.config.profiles || state.config.profiles.length === 0) {
      state.config.profiles = [];
    }
    if (!state.activeProfileId || !state.config.profiles.some(p => p.id === state.activeProfileId)) {
      state.activeProfileId = state.config.defaultProfileId || (state.config.profiles[0] ? state.config.profiles[0].id : 'global');
    }
  } catch (err) {
    console.error('Error cargando config:', err);
  }
}

async function saveConfig(options) {
  const opts = options || {};
  try {
    const res = await fetch('/api/admin/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.config)
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const details = (data.errors || []).map((entry) => {
        const fields = (entry.errors || [])
          .map((item) => `${item.param || item.code}: ${item.message}`)
          .join(' · ');
        return `${entry.label || entry.buttonId}: ${fields}`;
      });
      showToast(tr('config.saveErrors') + (details.length ? ' ' + details.join(' | ') : ''), 'error', 9000);
      console.warn('Config rejected:', data);
      return false;
    }

    showToast(tr('config.saved'), 'success');
    if (Array.isArray(data.warnings) && data.warnings.length) {
      showToast(tr('config.warnings') + ': ' + data.warnings.join(' · '), 'warning', 8000);
    }
    if (opts.reload !== false) {
      await loadConfig();
      if (!document.querySelector('#page-perfiles').classList.contains('hidden')) {
        renderProfilesView();
      }
    }
    loadOverview();
    return true;
  } catch (err) {
    showToast('Error al guardar: ' + err.message, 'error');
    return false;
  }
}

function showNotification(msg) {
  showToast(msg, 'success');
}

function showToast(message, variant, duration, action) {
  let host = document.querySelector('#toastHost');
  if (!host) {
    host = el('div', 'toast-host');
    host.id = 'toastHost';
    document.body.appendChild(host);
  }
  const toast = el('div', 'toast' + (variant ? ` ${variant}` : ''));
  const text = el('span', 'toast-text', message);
  toast.appendChild(text);
  if (action && action.label) {
    const actionButton = el('button', 'toast-action', action.label);
    actionButton.type = 'button';
    actionButton.addEventListener('click', () => {
      toast.remove();
      try { action.onClick(); } catch (err) { console.error('Toast action failed:', err); }
    });
    toast.appendChild(actionButton);
  }
  host.appendChild(toast);
  const lifetime = duration || 3200;
  setTimeout(() => {
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 220);
  }, lifetime);
  return toast;
}

// --- PAIRING & DEVICES ---
let pairMode = 'android';

function updatePairCopy() {
  const title = document.querySelector('#qrTitle');
  const help = document.querySelector('#qrHelp');
  const linkBox = document.querySelector('#pairLinkBox');
  if (title) title.textContent = pairMode === 'android' ? 'App Android' : 'Un escaneo y listo';
  if (help) {
    help.textContent = pairMode === 'android'
      ? 'Escaneá este QR desde la app VexaDeck para Android. No hace falta instalar ningún certificado.'
      : 'El QR instala el certificado de tu CA local una sola vez y habilita la conexión cifrada directa con esta PC.';
  }
  if (linkBox) linkBox.classList.toggle('hidden', pairMode !== 'android');
}

async function loadPairing() {
  const btn = document.querySelector('#btnRefreshQr');
  const placeholder = document.querySelector('#qrPlaceholder');
  if (!btn || !placeholder) return;
  btn.disabled = true;
  btn.textContent = 'Generando QR…';
  try {
    const endpoint = pairMode === 'android' ? '/api/admin/pairing/android' : '/api/admin/pairing';
    const res = await fetch(endpoint);
    if (!res.ok) throw new Error('No se pudo generar el QR');
    const data = await res.json();
    placeholder.innerHTML = `<img src="${data.qrDataUrl}" alt="Código QR" style="max-height:160px; border-radius:6px;"><span>VÁLIDO POR 5 MINUTOS</span>`;
    if (pairMode === 'android') {
      const input = document.querySelector('#pairLinkInput');
      if (input) input.value = data.link || '';
    }
    btn.textContent = 'Actualizar código QR';
  } catch (err) {
    btn.textContent = 'Error al generar';
  } finally {
    btn.disabled = false;
  }
}

async function loadHostView() {
  try {
    const data = await fetch('/api/admin/host').then(res => res.ok ? res.json() : null);
    if (!data) return;
    const name = document.querySelector('#hostNameInput');
    const color = document.querySelector('#hostColorInput');
    const id = document.querySelector('#hostServerId');
    if (name) name.value = data.host.pcName || '';
    if (color) color.value = data.host.pcColor || '#00FF9C';
    if (id) id.textContent = `ID ${data.host.serverId} · v${data.version} · ${(data.ident.addresses || []).join(', ') || 'sin red'}`;
    const wol = document.querySelector('#wolEnabledInput');
    if (wol) wol.checked = !!data.host.wolEnabled;
    const usb = document.querySelector('#usbEnabledInput');
    if (usb) usb.checked = !!data.host.usbEnabled;
  } catch { }
}

async function loadWolView() {
  const target = document.querySelector('#wolMacs');
  if (!target) return;
  try {
    const data = await fetch('/api/admin/wol').then(res => res.ok ? res.json() : null);
    if (!data) return;
    target.textContent = data.macs.length
      ? data.macs.map(item => `${item.mac} · ${item.description}`).join('  |  ')
      : 'No se encontró una MAC en esta PC.';
  } catch { }
}

async function loadUsbView() {
  const status = document.querySelector('#usbStatus');
  const list = document.querySelector('#usbDevices');
  if (!status || !list) return;
  try {
    const data = await fetch('/api/admin/usb').then(res => res.ok ? res.json() : null);
    if (!data) { status.textContent = 'No se pudo leer el estado de USB.'; return; }
    const enabled = document.querySelector('#usbEnabledInput');
    if (enabled) enabled.checked = !!data.enabled;
    status.textContent = data.found
      ? `${data.path}${data.version ? ' · ' + data.version : ''}${data.apkPath ? '' : ' · APK no disponible'}`
      : (data.lastError || 'ADB no encontrado.');

    if (!data.devices || !data.devices.length) {
      list.innerHTML = '<div style="font-size:10px;color:var(--muted);">No hay celulares conectados por USB.</div>';
      return;
    }
    list.innerHTML = data.devices.map(device => `
      <div class="usb-device">
        <b>${device.model}</b>
        <span class="usb-state">${device.state}${device.hasReverse ? ' · túnel activo' : ''}</span>
        <div class="usb-actions">
          <button class="subtle-button" data-usb="approve" data-serial="${device.serial}" data-approve="${device.approved ? 'false' : 'true'}">${device.approved ? 'No permitir' : 'Permitir'}</button>
          <button class="subtle-button" data-usb="reverse" data-serial="${device.serial}">Probar</button>
          <button class="subtle-button" data-usb="install" data-serial="${device.serial}" ${data.apkPath ? '' : 'disabled'}>Instalar app</button>
          <button class="subtle-button" data-usb="pair" data-serial="${device.serial}" ${device.approved ? '' : 'disabled'}>Emparejar</button>
        </div>
      </div>`).join('');

    list.querySelectorAll('[data-usb]').forEach(button => button.addEventListener('click', async () => {
      const action = button.dataset.usb;
      button.disabled = true;
      try {
        const body = action === 'approve'
          ? { serial: button.dataset.serial, approved: button.dataset.approve === 'true' }
          : { serial: button.dataset.serial };
        const res = await fetch(`/api/admin/usb/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const payload = await res.json().catch(() => ({}));
        const ok = payload.ok !== undefined ? payload.ok : payload.Ok;
        if (ok === false) showToast(payload.message || payload.Message || 'No se pudo completar.', 'error');
        else if (action === 'install') showToast('Instalación terminada. Abrí VexaDeck en el celular.', 'success');
        else if (action === 'pair') showToast('Enviado al celular: confirmá el emparejamiento en la app.', 'success');
        await loadUsbView();
      } catch {
        showToast('El comando USB falló.', 'error');
      } finally {
        button.disabled = false;
      }
    }));
  } catch {
    status.textContent = 'Error al leer USB.';
  }
}

async function loadDevices() {
  const container = document.querySelector('#deviceListContainer');
  try {
    const res = await fetch('/api/admin/devices');
    if (!res.ok) throw new Error();
    const devices = await res.json();
    document.querySelector('#pairedCount').textContent = devices.length;
    if (!devices.length) {
      container.innerHTML = '<div style="color:var(--muted); font-size:11px; padding:10px 0;">No hay celulares vinculados actualmente. Escaneá el código QR para autorizar tu primer celular.</div>';
      return;
    }
    container.innerHTML = devices.map(d => {
      const proto = d.protocol === 2 ? 'app · v2' : 'web · v1';
      const transport = d.transport ? ` · ${d.transport === 'usb' ? 'USB' : 'WiFi'}` : '';
      return `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:var(--surface2); border:1px solid var(--border); border-radius:8px; margin-bottom:6px;">
        <div>
          <b style="font-size:12px; display:block;">${d.name || 'Celular sin nombre'}</b>
          <span style="font-size:9px; color:var(--muted);">${proto}${transport} · ID: ${d.id.substring(0, 10)}… · ${d.connected ? '<span style="color:var(--accent);">● En línea</span>' : 'Desconectado'}</span>
        </div>
        <button class="subtle-button btn-revoke" data-id="${d.id}" style="color:var(--danger); border-color:#ff3b4e33;">Revocar</button>
      </div>`;
    }).join('');

    container.querySelectorAll('.btn-revoke').forEach(b => {
      b.addEventListener('click', async () => {
        if (!confirm('¿Deseás revocar el acceso a este celular?')) return;
        const id = b.dataset.id;
        const delRes = await fetch(`/api/admin/devices/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (delRes.ok) loadDevices();
      });
    });
  } catch {
    container.innerHTML = '<div style="color:var(--danger);">Error al cargar dispositivos.</div>';
  }
}

// --- PERFILES Y BOTONES ---
function getActiveProfile() {
  return state.config?.profiles?.find(p => p.id === state.activeProfileId) || state.config?.profiles?.[0];
}

function getActivePage() {
  const prof = getActiveProfile();
  if (!prof || !prof.pages || prof.pages.length === 0) return null;
  if (state.activePageIndex >= prof.pages.length) state.activePageIndex = 0;
  return prof.pages[state.activePageIndex];
}

function renderProfilesView() {
  if (!state.config) return;
  renderProfileCards();
  renderProfileEditor();
}

function renderProfileCards() {
  const container = document.querySelector('#profileCards');
  if (!container || !state.config.profiles) return;

  container.innerHTML = state.config.profiles.map(p => {
    const isSelected = p.id === state.activeProfileId;
    const isDefault = p.id === state.config.defaultProfileId;
    const matchCount = p.match?.processes?.length || 0;
    const btnCount = (p.pages || []).reduce((acc, pg) => acc + (pg.buttons?.length || 0), 0);

    return `
      <div class="profile-card ${isSelected ? 'selected' : ''}" data-id="${p.id}" style="cursor:pointer; border-color:${isSelected ? p.accent : 'var(--border)'};">
        <div class="profile-card-top">
          <span class="profile-color" style="background:${p.accent}; box-shadow:0 0 8px ${p.accent}66;"></span>
          ${isDefault ? '<span class="default-tag">PREDETERMINADO</span>' : ''}
          ${p.id !== 'global' ? `<button class="subtle-button btn-del-prof" data-id="${p.id}" style="margin-left:auto; padding:2px 6px; font-size:9px;" title="Eliminar perfil">✕</button>` : ''}
        </div>
        <h2>${p.name}</h2>
        <p>${p.grid.cols} × ${p.grid.rows} · ${btnCount} botón(es)</p>
        <div class="profile-card-bottom">
          <span>${matchCount > 0 ? `${matchCount} app(s) vinculada(s)` : 'Manual'}</span>
          <b style="color:${isSelected ? 'var(--accent)' : 'inherit'};">${isSelected ? 'ACTIVO' : 'Seleccionar'}</b>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.profile-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-del-prof')) return;
      state.activeProfileId = card.dataset.id;
      state.activePageIndex = 0;
      renderProfilesView();
    });
  });

  container.querySelectorAll('.btn-del-prof').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (!confirm(`¿Eliminar el perfil?`)) return;
      state.config.profiles = state.config.profiles.filter(p => p.id !== id);
      if (state.activeProfileId === id) {
        state.activeProfileId = state.config.profiles[0]?.id || 'global';
      }
      renderProfilesView();
    });
  });
}

function renderProfileEditor() {
  const prof = getActiveProfile();
  if (!prof) return;

  document.querySelector('#editingProfileTitle').textContent = `Editando: ${prof.name}`;
  document.querySelector('#editingProfileSubtitle').textContent = `Grilla de ${prof.grid.cols} columnas × ${prof.grid.rows} filas`;

  document.querySelector('#profNameInput').value = prof.name;
  document.querySelector('#profAccentInput').value = prof.accent || '#00FF9C';
  document.querySelector('#profColsInput').value = prof.grid.cols;
  document.querySelector('#profRowsInput').value = prof.grid.rows;
  document.querySelector('#profMatchInput').value = (prof.match?.processes || []).join(', ');

  // Page selector pills
  const pillsContainer = document.querySelector('#pageSelectorPills');
  pillsContainer.innerHTML = (prof.pages || []).map((page, idx) => `
    <button class="subtle-button btn-page-pill ${idx === state.activePageIndex ? 'active' : ''}" data-index="${idx}" style="${idx === state.activePageIndex ? 'background:var(--accent); color:#000; font-weight:bold;' : ''}">
      ${page.name || `Pág ${idx + 1}`}
    </button>
  `).join('');

  pillsContainer.querySelectorAll('.btn-page-pill').forEach(b => {
    b.tabIndex = 0;
    b.addEventListener('click', () => {
      state.activePageIndex = parseInt(b.dataset.index, 10);
      renderProfileEditor();
    });
    b.addEventListener('keydown', (event) => {
      const keyboard = drag.keyboard;
      if (!keyboard || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      const moved = keyboard.button;
      const target = { kind: 'page', index: parseInt(b.dataset.index, 10) };
      endKeyboardDrag();
      applyDrop(moved, target);
    });
  });

  document.querySelector('#gridDimensionsLabel').textContent = `${prof.grid.cols} × ${prof.grid.rows}`;
  renderGridContainer(prof);
  renderPhonePreview(prof);
}

function gridSpan(value) {
  return Math.max(1, Number(value) || 1);
}

function buttonCovers(button, row, col) {
  const pos = button.pos || {};
  return row >= (pos.row || 0) && row < (pos.row || 0) + gridSpan(pos.rowSpan) &&
    col >= (pos.col || 0) && col < (pos.col || 0) + gridSpan(pos.colSpan);
}

function createIconBox(icon, action, size, color) {
  const box = el('div', 'cell-icon');
  if (color) box.style.color = color;
  box.appendChild(window.IconPicker.createIconNode(icon, size, action));
  return box;
}

function applyGridResize(input, dimension) {
  const prof = getActiveProfile();
  if (!prof) return;
  const current = dimension === 'cols' ? (prof.grid.cols || 4) : (prof.grid.rows || 3);
  const next = Math.max(1, Math.min(8, parseInt(input.value, 10) || current));
  const cols = dimension === 'cols' ? next : (prof.grid.cols || 4);
  const rows = dimension === 'rows' ? next : (prof.grid.rows || 3);

  const warnings = [];
  const pages = (prof.pages || []).map((page) => {
    const fixed = window.GridRules.fixOutOfRange(page.buttons || [], cols, rows);
    warnings.push(...fixed.warnings);
    return Object.assign({}, page, { buttons: fixed.buttons });
  });

  if (warnings.length) {
    const message = `${tr('grid.shrinkTitle')}\n\n${tr('grid.shrinkBody', { n: warnings.length })}`;
    if (!confirm(message)) {
      input.value = current;
      return;
    }
  }

  prof.grid = Object.assign({}, prof.grid, { cols, rows });
  prof.pages = pages;
  renderProfileEditor();
  if (warnings.length) showToast(tr('grid.shrinkMoved'), 'warning', 5000);
}

function renderGridContainer(prof) {
  const container = document.querySelector('#gridEditorContainer');
  if (!container) return;
  const page = getActivePage();
  if (!page) return;

  const cols = prof.grid.cols || 4;
  const rows = prof.grid.rows || 3;

  container.style.gridTemplateColumns = `repeat(${cols}, 86px)`;
  container.style.gridTemplateRows = `repeat(${rows}, 86px)`;
  container.innerHTML = '';

  const buttons = page.buttons || [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (buttons.some((button) => buttonCovers(button, r, c))) continue;
      const cell = el('div', 'grid-cell');
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.style.gridRow = `${r + 1} / span 1`;
      cell.style.gridColumn = `${c + 1} / span 1`;
      cell.appendChild(el('span', 'cell-empty', '＋'));
      cell.addEventListener('click', () => openButtonModal(r, c, null));
      container.appendChild(cell);
    }
  }

  buttons.forEach((btn) => {
    const pos = btn.pos || {};
    const cell = el('div', 'grid-cell occupied');
    cell.dataset.row = pos.row;
    cell.dataset.col = pos.col;
    cell.dataset.buttonId = btn.id;
    cell.tabIndex = 0;
    cell.setAttribute('role', 'button');
    cell.setAttribute('aria-label', `${btn.label || 'Botón'} (${pos.row}, ${pos.col})`);
    cell.style.gridRow = `${(pos.row || 0) + 1} / span ${gridSpan(pos.rowSpan)}`;
    cell.style.gridColumn = `${(pos.col || 0) + 1} / span ${gridSpan(pos.colSpan)}`;
    cell.appendChild(createIconBox(btn.icon, btn.action, 26, prof.accent));
    cell.appendChild(el('div', 'cell-label', btn.label || 'Botón'));
    cell.appendChild(el('div', 'cell-action-kind', btn.action?.kind || btn.type));
    cell.addEventListener('pointerdown', (event) => beginButtonPress(event, btn, cell));
    cell.addEventListener('keydown', (event) => onGridCellKeyDown(event, btn, cell));
    container.appendChild(cell);
  });
}

// --- GRID DRAG & DROP ---
// Pointer drag repositions/swaps buttons; a plain press still opens the editor.
const DRAG_THRESHOLD_PX = 6;
const TOUCH_LONG_PRESS_MS = 150;
const undoStack = [];

const drag = {
  press: null,
  ghost: null,
  target: null,
  keyboard: null
};

function pushUndo(prof) {
  undoStack.push({ profileId: prof.id, pages: JSON.parse(JSON.stringify(prof.pages || [])) });
  if (undoStack.length > 20) undoStack.shift();
}

function undoLastMove() {
  const entry = undoStack.pop();
  if (!entry) return;
  const prof = state.config?.profiles?.find((item) => item.id === entry.profileId);
  if (!prof) return;
  prof.pages = entry.pages;
  renderProfileEditor();
  saveConfig({ reload: false });
  showToast(tr('grid.undone'), 'success', 3200);
}

function findGridCell(row, col) {
  return document.querySelector(`#gridEditorContainer .grid-cell[data-row="${row}"][data-col="${col}"]`);
}

function clearDropHighlight() {
  document.querySelectorAll('#gridEditorContainer .drop-ok, #gridEditorContainer .drop-bad, #pageSelectorPills .drop-ok, #pageSelectorPills .drop-bad')
    .forEach((node) => node.classList.remove('drop-ok', 'drop-bad'));
}

function canDropOnCell(button, row, col) {
  const prof = getActiveProfile();
  const page = getActivePage();
  if (!prof || !page) return false;
  return window.GridRules.moveOrSwap(page.buttons || [], button.id, row, col, prof.grid.cols || 4, prof.grid.rows || 3).ok;
}

function setDropTarget(target, valid) {
  clearDropHighlight();
  drag.target = valid ? target : null;
  if (!target) return;
  const node = target.kind === 'page'
    ? document.querySelector(`#pageSelectorPills .btn-page-pill[data-index="${target.index}"]`)
    : findGridCell(target.row, target.col);
  if (node) node.classList.add(valid ? 'drop-ok' : 'drop-bad');
}

function detectDropTarget(x, y) {
  const button = drag.press?.button;
  const prof = getActiveProfile();
  if (!button || !prof) return { target: null, valid: false };
  const node = document.elementFromPoint(x, y);
  if (!node) return { target: null, valid: false };

  const pill = node.closest('#pageSelectorPills .btn-page-pill');
  if (pill) {
    const index = parseInt(pill.dataset.index, 10);
    const page = (prof.pages || [])[index];
    const cols = prof.grid.cols || 4;
    const rows = prof.grid.rows || 3;
    const free = page
      ? window.GridRules.findFirstFree(page.buttons || [], cols, rows, button.pos.rowSpan, button.pos.colSpan)
      : null;
    return { target: { kind: 'page', index }, valid: !!free };
  }

  const cell = node.closest('#gridEditorContainer .grid-cell');
  if (cell) {
    const row = parseInt(cell.dataset.row, 10);
    const col = parseInt(cell.dataset.col, 10);
    return { target: { kind: 'cell', row, col }, valid: canDropOnCell(button, row, col) };
  }

  return { target: null, valid: false };
}

function moveGhost(x, y) {
  const ghost = drag.ghost;
  if (!ghost) return;
  ghost.style.left = `${x - ghost.dataset.offsetX}px`;
  ghost.style.top = `${y - ghost.dataset.offsetY}px`;
}

function startDrag(x, y) {
  const press = drag.press;
  if (!press || press.started) return;
  press.started = true;

  const rect = press.cell.getBoundingClientRect();
  const ghost = press.cell.cloneNode(true);
  ghost.removeAttribute('tabindex');
  ghost.classList.add('grid-drag-ghost');
  ghost.classList.remove('drop-ok', 'drop-bad');
  ghost.dataset.offsetX = String(Math.round(x - rect.left));
  ghost.dataset.offsetY = String(Math.round(y - rect.top));
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  document.body.appendChild(ghost);

  drag.ghost = ghost;
  press.cell.classList.add('dragging-origin');
  document.body.classList.add('grid-dragging');
  moveGhost(x, y);
}

function endDragVisuals() {
  document.querySelectorAll('.grid-cell.dragging-origin').forEach((node) => node.classList.remove('dragging-origin'));
  if (drag.ghost) {
    drag.ghost.remove();
    drag.ghost = null;
  }
  document.body.classList.remove('grid-dragging');
  clearDropHighlight();
}

function detachDragListeners() {
  window.removeEventListener('pointermove', onDragPointerMove);
  window.removeEventListener('pointerup', onDragPointerUp);
  window.removeEventListener('pointercancel', onDragPointerCancel);
}

function beginButtonPress(event, button, cell) {
  if (event.button !== undefined && event.button !== 0) return;
  if (drag.press) return;

  const isTouch = event.pointerType === 'touch';
  const press = {
    button,
    cell,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    isTouch,
    started: false,
    timer: null
  };
  drag.press = press;

  // Touch starts the drag with a long press; the mouse needs 6 px of movement.
  if (isTouch) {
    press.timer = setTimeout(() => {
      if (drag.press === press && !press.started) startDrag(press.startX, press.startY);
    }, TOUCH_LONG_PRESS_MS);
  }

  window.addEventListener('pointermove', onDragPointerMove);
  window.addEventListener('pointerup', onDragPointerUp);
  window.addEventListener('pointercancel', onDragPointerCancel);
}

function onDragPointerMove(event) {
  const press = drag.press;
  if (!press || event.pointerId !== press.pointerId) return;

  if (!press.started) {
    if (press.isTouch) return; // the long-press timer owns the start
    if (Math.hypot(event.clientX - press.startX, event.clientY - press.startY) < DRAG_THRESHOLD_PX) return;
    startDrag(press.startX, press.startY);
  }

  event.preventDefault();
  moveGhost(event.clientX, event.clientY);
  const { target, valid } = detectDropTarget(event.clientX, event.clientY);
  setDropTarget(target, valid);
}

function onDragPointerUp(event) {
  const press = drag.press;
  if (!press || event.pointerId !== press.pointerId) return;

  if (press.timer) clearTimeout(press.timer);
  detachDragListeners();
  drag.press = null;

  if (!press.started) {
    openButtonModal(press.button.pos.row, press.button.pos.col, press.button);
    return;
  }

  const target = drag.target;
  endDragVisuals();
  if (target) applyDrop(press.button, target);
}

function onDragPointerCancel() {
  const press = drag.press;
  if (press?.timer) clearTimeout(press.timer);
  detachDragListeners();
  drag.press = null;
  drag.target = null;
  endDragVisuals();
}

function applyDrop(button, target) {
  const prof = getActiveProfile();
  const page = getActivePage();
  if (!prof || !page) return;
  const cols = prof.grid.cols || 4;
  const rows = prof.grid.rows || 3;

  if (target.kind === 'page') {
    const targetPage = (prof.pages || [])[target.index];
    if (!targetPage || targetPage === page) return;
    const free = window.GridRules.findFirstFree(
      targetPage.buttons || [], cols, rows, button.pos.rowSpan, button.pos.colSpan);
    if (!free) {
      showToast(tr('grid.fullPage'), 'warning', 5000);
      return;
    }
    pushUndo(prof);
    page.buttons = (page.buttons || []).filter((item) => item.id !== button.id);
    targetPage.buttons = (targetPage.buttons || []).concat([
      Object.assign({}, button, { pos: Object.assign({}, button.pos, free) })
    ]);
    state.activePageIndex = target.index;
  } else {
    if (target.row === button.pos.row && target.col === button.pos.col) return;
    const result = window.GridRules.moveOrSwap(page.buttons || [], button.id, target.row, target.col, cols, rows);
    if (!result.ok) {
      showToast(tr('grid.invalidTarget'), 'warning', 5000);
      return;
    }
    pushUndo(prof);
    page.buttons = result.buttons;
  }

  renderProfileEditor();
  saveConfig({ reload: false });
  showToast(tr('grid.moved'), 'success', 6000, { label: tr('grid.undo'), onClick: undoLastMove });
}

// Keyboard sensor: Space lifts the button, arrows move it, Enter drops it.
function startKeyboardDrag(button, cell) {
  drag.keyboard = { button, row: button.pos.row, col: button.pos.col };
  cell.classList.add('dragging-origin');
  setDropTarget({ kind: 'cell', row: button.pos.row, col: button.pos.col }, true);
  showToast(tr('grid.keyboardHint'), '', 4000);
}

function endKeyboardDrag() {
  drag.keyboard = null;
  clearDropHighlight();
  document.querySelectorAll('.grid-cell.dragging-origin').forEach((node) => node.classList.remove('dragging-origin'));
}

function onGridCellKeyDown(event, button, cell) {
  const keyboard = drag.keyboard;

  if (!keyboard) {
    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      startKeyboardDrag(button, cell);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      openButtonModal(button.pos.row, button.pos.col, button);
    }
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    endKeyboardDrag();
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    const moved = keyboard.button;
    const target = { kind: 'cell', row: keyboard.row, col: keyboard.col };
    endKeyboardDrag();
    applyDrop(moved, target);
    return;
  }

  const deltas = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  const delta = deltas[event.key];
  if (!delta) return;

  event.preventDefault();
  const prof = getActiveProfile();
  if (!prof) return;
  keyboard.row = Math.max(0, Math.min((prof.grid.rows || 3) - 1, keyboard.row + delta[0]));
  keyboard.col = Math.max(0, Math.min((prof.grid.cols || 4) - 1, keyboard.col + delta[1]));
  setDropTarget({ kind: 'cell', row: keyboard.row, col: keyboard.col },
    canDropOnCell(keyboard.button, keyboard.row, keyboard.col));
}

function renderPhonePreview(prof) {
  const chip = document.querySelector('#previewChipName');
  if (chip) chip.textContent = `● ${prof.name}`;

  const previewGrid = document.querySelector('#previewButtonGrid');
  if (!previewGrid) return;
  const page = getActivePage();
  if (!page) return;

  const cols = prof.grid.cols || 4;
  const rows = prof.grid.rows || 3;

  previewGrid.style.gridTemplateColumns = `repeat(${cols}, 46px)`;
  previewGrid.style.gridTemplateRows = `repeat(${rows}, 46px)`;
  previewGrid.innerHTML = '';

  const buttons = page.buttons || [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (buttons.some((button) => buttonCovers(button, r, c))) continue;
      const previewBtn = el('div', 'preview-grid-cell');
      previewBtn.style.gridRow = `${r + 1} / span 1`;
      previewBtn.style.gridColumn = `${c + 1} / span 1`;
      previewBtn.style.borderColor = '#252e35';
      previewGrid.appendChild(previewBtn);
    }
  }

  buttons.forEach((btn) => {
    const pos = btn.pos || {};
    const previewBtn = el('div', 'preview-grid-cell');
    previewBtn.style.gridRow = `${(pos.row || 0) + 1} / span ${gridSpan(pos.rowSpan)}`;
    previewBtn.style.gridColumn = `${(pos.col || 0) + 1} / span ${gridSpan(pos.colSpan)}`;
    previewBtn.style.borderColor = prof.accent + '66';
    const icon = createIconBox(btn.icon, btn.action, 16, prof.accent);
    icon.style.fontSize = '11px';
    previewBtn.appendChild(icon);
    previewBtn.appendChild(el('span', 'preview-grid-label', btn.label || 'Botón'));
    previewGrid.appendChild(previewBtn);
  });
}

// --- BUTTON EDITOR MODAL ---
function syncTypeControls() {
  const typeSelect = document.querySelector('#btnTypeSelect');
  const stateHost = document.querySelector('#stateBindingHost');
  const stateInput = document.querySelector('#btnStateBindingInput');
  if (!typeSelect) return;

  const supported = window.ActionEditor && window.ActionEditor.supportsToggle();
  const toggleOption = typeSelect.querySelector('option[value="toggle"]');
  if (toggleOption) {
    toggleOption.disabled = !supported;
    toggleOption.textContent = supported ? tr('editor.typeToggle') : tr('editor.typeToggleUnavailable');
  }
  if (!supported && typeSelect.value === 'toggle') typeSelect.value = 'action';

  const show = supported && typeSelect.value === 'toggle';
  stateHost.classList.toggle('hidden', !show);
  if (stateInput) stateInput.value = show ? (window.ActionEditor.getStateBinding() || '') : '';
}

function openButtonModal(row, col, btn) {
  const rawIcon = btn?.icon;
  const iconManual = !!rawIcon && (typeof rawIcon === 'string' || rawIcon.kind !== 'auto');
  state.editingCell = {
    row,
    col,
    button: btn || null,
    iconManual,
    lastKind: btn?.action?.kind || ''
  };

  document.querySelector('#modalButtonTitle').textContent = btn
    ? `${tr('editor.titleEdit')} (${row}, ${col})`
    : `${tr('editor.titleNew')} (${row}, ${col})`;
  document.querySelector('#btnRowInput').value = row;
  document.querySelector('#btnColInput').value = col;
  document.querySelector('#btnTypeSelect').value = btn?.type || 'action';

  const labelInput = document.querySelector('#btnLabelInput');
  labelInput.value = btn?.label || '';
  labelInput.placeholder = tr('editor.labelPlaceholder');

  const typeSelect = document.querySelector('#btnTypeSelect');
  const actionOption = typeSelect.querySelector('option[value="action"]');
  if (actionOption) actionOption.textContent = tr('editor.typeAction');

  window.ActionEditor.setAction(btn?.action || { kind: '', params: {} });
  if (btn?.type) typeSelect.value = btn.type;
  syncTypeControls();

  window.IconPicker.setIcon(btn?.icon || { kind: 'auto', value: 'auto' });
  document.querySelector('#btnDeleteButton').style.display = btn ? 'inline-block' : 'none';
  document.querySelector('#buttonModalError').classList.add('hidden');

  document.querySelector('#buttonModal').classList.remove('hidden');
}

function closeButtonModal() {
  document.querySelector('#buttonModal').classList.add('hidden');
  state.editingCell = null;
}

function showModalError(message) {
  const box = document.querySelector('#buttonModalError');
  if (!box) return;
  box.textContent = message;
  box.classList.toggle('hidden', !message);
}

function saveButtonModal() {
  if (!state.editingCell) return;
  const page = getActivePage();
  const prof = getActiveProfile();
  if (!page || !prof) return;

  const action = window.ActionEditor.getAction();
  if (!action.kind) {
    showModalError(tr('editor.chooseAction'));
    return;
  }
  const errors = window.ActionEditor.validate();
  if (Object.keys(errors).length > 0) {
    showModalError(tr('editor.fixErrors'));
    return;
  }

  const cols = prof.grid.cols || 4;
  const rows = prof.grid.rows || 3;
  const row = Math.max(0, Math.min(rows - 1, parseInt(document.querySelector('#btnRowInput').value, 10) || 0));
  const col = Math.max(0, Math.min(cols - 1, parseInt(document.querySelector('#btnColInput').value, 10) || 0));

  const { button } = state.editingCell;
  const label = document.querySelector('#btnLabelInput').value.trim() || 'Botón';
  const supportedToggle = window.ActionEditor.supportsToggle();
  const type = supportedToggle && document.querySelector('#btnTypeSelect').value === 'toggle' ? 'toggle' : 'action';
  const stateBinding = type === 'toggle' ? window.ActionEditor.getStateBinding() : null;
  const icon = window.IconPicker.getIcon();
  const id = button?.id || `b_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;

  const previousPos = button?.pos || {};
  const pos = {
    row,
    col,
    rowSpan: gridSpan(previousPos.rowSpan),
    colSpan: gridSpan(previousPos.colSpan)
  };
  if (!window.GridRules.fits(pos, cols, rows)) {
    showModalError(tr('editor.cellOccupied'));
    return;
  }

  const buttons = (page.buttons || []).slice();
  if (button) {
    const result = window.GridRules.moveOrSwap(buttons, button.id, row, col, cols, rows);
    if (!result.ok) {
      showModalError(tr('editor.cellOccupied'));
      return;
    }
    page.buttons = result.buttons;
  } else {
    if (buttons.some((item) => window.GridRules.overlaps(item.pos, pos))) {
      showModalError(tr('editor.cellOccupied'));
      return;
    }
    page.buttons = buttons;
  }

  const newButton = Object.assign({}, button || {}, {
    id,
    type,
    label,
    icon,
    pos,
    action,
    stateBinding
  });

  if (button) {
    page.buttons = page.buttons.map((item) => item.id === id ? newButton : item);
  } else {
    page.buttons.push(newButton);
  }

  closeButtonModal();
  renderProfileEditor();
}

function deleteButtonModal() {
  if (!state.editingCell) return;
  const page = getActivePage();
  if (!page || !page.buttons) return;

  const id = state.editingCell.button?.id;
  page.buttons = id
    ? page.buttons.filter((button) => button.id !== id)
    : page.buttons.filter((button) => !buttonCovers(button, state.editingCell.row, state.editingCell.col));

  closeButtonModal();
  renderProfileEditor();
}

// --- DETECCIÓN DE APPS ---
async function loadProcesses() {
  const container = document.querySelector('#processListContainer');
  container.innerHTML = '<div style="color:var(--muted); font-size:11px;">Cargando procesos en ejecución…</div>';
  try {
    const res = await fetch('/api/admin/processes');
    if (!res.ok) throw new Error();
    state.processes = await res.json();
    renderProcesses();
  } catch {
    container.innerHTML = '<div style="color:var(--danger); font-size:11px;">No se pudieron listar los procesos.</div>';
  }
}

function renderProcesses() {
  const container = document.querySelector('#processListContainer');
  const term = (document.querySelector('#processSearchInput').value || '').toLowerCase().trim();
  const filtered = state.processes.filter(p => p.name.toLowerCase().includes(term) || (p.title && p.title.toLowerCase().includes(term)));

  if (!filtered.length) {
    container.innerHTML = '<div style="color:var(--muted); font-size:11px; padding:12px;">No se encontraron procesos coincidentes.</div>';
    return;
  }

  container.innerHTML = filtered.map(p => {
    // Find if already linked to any profile
    let linkedProfile = null;
    if (state.config?.profiles) {
      for (const prof of state.config.profiles) {
        if (prof.match?.processes?.some(proc => proc.toLowerCase() === p.name.toLowerCase())) {
          linkedProfile = prof;
          break;
        }
      }
    }

    const iconHtml = p.icon
      ? `<img src="${p.icon}" class="process-icon" alt="" onerror="this.outerHTML='<span class=\\'process-icon\\'>⚙</span>'">`
      : `<span class="process-icon">⚙</span>`;

    const profileOptions = (state.config?.profiles || [])
      .map(prof => `<option value="${prof.id}" ${linkedProfile?.id === prof.id ? 'selected' : ''}>${prof.name}</option>`)
      .join('');

    return `
      <div class="process-item">
        <div class="process-info">
          ${iconHtml}
          <div>
            <div class="process-name">${p.name}</div>
            <div class="process-title">${p.title || 'Proceso en segundo plano'}</div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          ${linkedProfile ? `<span style="font-size:10px; color:${linkedProfile.accent}; font-weight:bold;">● ${linkedProfile.name}</span>` : ''}
          <select class="form-select select-proc-prof" data-proc="${p.name}" style="height:30px; font-size:11px; width:130px;">
            <option value="">(Sin vincular)</option>
            ${profileOptions}
          </select>
          <button class="primary-button btn-link-proc" data-proc="${p.name}" style="height:30px; padding:0 8px; font-size:10px;">Vincular</button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.btn-link-proc').forEach(btn => {
    btn.addEventListener('click', () => {
      const procName = btn.dataset.proc;
      const select = container.querySelector(`.select-proc-prof[data-proc="${procName}"]`);
      const targetProfId = select?.value;

      // Remove from all profiles first
      state.config.profiles.forEach(prof => {
        if (prof.match?.processes) {
          prof.match.processes = prof.match.processes.filter(p => p.toLowerCase() !== procName.toLowerCase());
        }
      });

      // Add to selected profile
      if (targetProfId) {
        const targetProf = state.config.profiles.find(p => p.id === targetProfId);
        if (targetProf) {
          if (!targetProf.match) targetProf.match = { processes: [] };
          if (!targetProf.match.processes.includes(procName)) {
            targetProf.match.processes.push(procName);
          }
        }
      }

      saveConfig();
      renderProcesses();
    });
  });
}

// --- TELEMETRÍA ---
function renderTelemetryView() {
  if (!state.config) return;
  const tele = state.config.telemetry;
  const slots = tele?.slots || { left: [], right: [] };

  const getSlot = (id) => {
    return (slots.left || []).find(s => s.id === id) || (slots.right || []).find(s => s.id === id) || { primary: 'none', secondary: 'none' };
  };

  const populateSelect = (selectId, currentVal) => {
    const sel = document.querySelector(`#${selectId}`);
    if (!sel) return;
    sel.innerHTML = METRIC_OPTIONS.map(opt => `<option value="${opt.id}" ${opt.id === currentVal ? 'selected' : ''}>${opt.label}</option>`).join('');
  };

  const l1 = getSlot('L1');
  const l2 = getSlot('L2');
  const r1 = getSlot('R1');
  const r2 = getSlot('R2');

  populateSelect('slot_L1_primary', l1.primary || 'cpu.load');
  populateSelect('slot_L1_secondary', l1.secondary || 'cpu.temp');

  populateSelect('slot_L2_primary', l2.primary || 'ram.used');
  populateSelect('slot_L2_secondary', l2.secondary || 'none');

  populateSelect('slot_R1_primary', r1.primary || 'ping.app');
  populateSelect('slot_R1_secondary', r1.secondary || 'none');

  populateSelect('slot_R2_primary', r2.primary || 'net.down');
  populateSelect('slot_R2_secondary', r2.secondary || 'net.up');

  const interval = state.config.server?.telemetryIntervalMs || 1000;
  const intervalSel = document.querySelector('#telemetryIntervalSelect');
  if (intervalSel) intervalSel.value = interval.toString();
}

function saveTelemetryView() {
  const getVal = (id) => document.querySelector(`#${id}`)?.value || 'none';

  const makeSlot = (id, primId, secId) => {
    const primary = getVal(primId);
    const secondary = getVal(secId);
    const widget = secondary && secondary !== 'none' ? 'dual' : 'single';
    return {
      id,
      widget,
      primary,
      secondary: secondary !== 'none' ? secondary : null
    };
  };

  const left = [makeSlot('L1', 'slot_L1_primary', 'slot_L1_secondary'), makeSlot('L2', 'slot_L2_primary', 'slot_L2_secondary')];
  const right = [makeSlot('R1', 'slot_R1_primary', 'slot_R1_secondary'), makeSlot('R2', 'slot_R2_primary', 'slot_R2_secondary')];

  state.config.telemetry = { slots: { left, right } };
  const interval = parseInt(document.querySelector('#telemetryIntervalSelect')?.value || '1000', 10);
  if (!state.config.server) state.config.server = {};
  state.config.server.telemetryIntervalMs = interval;

  saveConfig();
}

// --- SCRIPTS ---
async function loadScripts() {
  const container = document.querySelector('#scriptsListContainer');
  container.innerHTML = '<div style="color:var(--muted); font-size:11px;">Cargando scripts autorizados…</div>';
  try {
    const res = await fetch('/api/admin/scripts');
    if (!res.ok) throw new Error();
    const scripts = await res.json();
    if (!scripts.length) {
      container.innerHTML = '<div style="color:var(--muted); font-size:11px; padding:12px 0;">No se encontraron archivos .vbs en la carpeta segura de scripts. Podés hacer click en "Crear script de ejemplo".</div>';
      return;
    }
    container.innerHTML = scripts.map(s => `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:var(--surface2); border:1px solid var(--border); border-radius:8px;">
        <div>
          <b style="font-size:12px; display:block;">${s.name}</b>
          <span style="font-size:9px; color:var(--muted);">Archivo: ${s.file} · Seguro (.vbs)</span>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="primary-button btn-test-script" data-file="${s.file}" style="height:30px; font-size:10px;">Probar ejecución</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.btn-test-script').forEach(btn => {
      btn.addEventListener('click', async () => {
        const file = btn.dataset.file;
        btn.disabled = true;
        btn.textContent = 'Ejecutando…';
        try {
          const res = await fetch('/api/admin/scripts/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file })
          });
          btn.textContent = res.ok ? '✓ Correcto' : 'Error';
        } catch {
          btn.textContent = 'Error de red';
        } finally {
          setTimeout(() => {
            btn.disabled = false;
            btn.textContent = 'Probar ejecución';
          }, 1800);
        }
      });
    });
  } catch {
    container.innerHTML = '<div style="color:var(--danger); font-size:11px;">Error al listar scripts.</div>';
  }
}

// --- SISTEMA ---
function loadSystemView() {
  loadOverview();
  updatePairCopy();
  loadHostView();
  loadWolView();
  loadUsbView();
  fetch('/api/health')
    .then((res) => res.ok ? res.json() : null)
    .then((data) => {
      if (!data || !data.version) return;
      const badge = document.querySelector('#appVersion');
      const foot = document.querySelector('#appVersionFoot');
      if (badge) badge.textContent = data.version;
      if (foot) foot.textContent = data.version;
    })
    .catch(() => { });
}

// --- GLOBAL EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', async () => {
  applyI18n();
  await loadConfig();

  try {
    await window.ActionEditor.load();
  } catch (err) {
    console.error('No se pudo cargar el registro de acciones:', err);
    showToast('No se pudo cargar el registro de acciones.', 'error', 9000);
  }

  window.ActionEditor.mount({
    kindSelect: document.querySelector('#btnActionKindSelect'),
    paramsHost: document.querySelector('#actionParamsHost'),
    stateHost: document.querySelector('#stateBindingHost'),
    context: {
      getPages: () => getActiveProfile()?.pages || [],
      getProfiles: () => state.config?.profiles || [],
      createPage: (name) => {
        const prof = getActiveProfile();
        if (!prof) return null;
        if (!prof.pages) prof.pages = [];
        const page = { id: `pg_${Date.now()}`, name, buttons: [] };
        prof.pages.push(page);
        return page;
      },
      getUsedProcesses: () => {
        const used = new Set();
        (state.config?.profiles || []).forEach((prof) => {
          (prof.pages || []).forEach((page) => {
            (page.buttons || []).forEach((button) => {
              const process = button.action?.params?.process;
              if (process) used.add(process);
            });
          });
        });
        return Array.from(used);
      },
      onAppSelected: (path, name) => {
        const editing = state.editingCell;
        if (!editing) return;
        const labelInput = document.querySelector('#btnLabelInput');
        if (!labelInput.value.trim() || labelInput.value.trim() === 'Botón') {
          labelInput.value = name || '';
        }
        if (!editing.iconManual) {
          window.IconPicker.setAuto();
          window.IconPicker.refreshAction();
        }
      },
      onChanged: (kind) => {
        const editing = state.editingCell;
        if (!editing) return;
        const kindChanged = editing.lastKind !== kind;
        editing.lastKind = kind;
        if (!editing.iconManual && kindChanged) {
          window.IconPicker.setAuto();
        } else {
          window.IconPicker.refreshAction();
        }
        syncTypeControls();
      }
    }
  });

  window.IconPicker.init({
    host: document.querySelector('#btnIconHost'),
    context: {
      getAction: () => window.ActionEditor.getAction(),
      getSuggestedIcon: () => window.ActionEditor.suggestedIcon(),
      onChange: (icon) => {
        if (state.editingCell) state.editingCell.iconManual = icon.kind !== 'auto';
      },
      onExtracted: ({ name }) => {
        const labelInput = document.querySelector('#btnLabelInput');
        if (labelInput && (!labelInput.value.trim() || labelInput.value.trim() === 'Botón')) {
          labelInput.value = name || '';
        }
      },
      onAutoResolved: () => {
        const prof = getActiveProfile();
        if (!prof) return;
        if (!document.querySelector('#page-perfiles').classList.contains('hidden')) {
          renderGridContainer(prof);
          renderPhonePreview(prof);
        }
      }
    }
  });

  // Navigation clicks
  document.addEventListener('click', (e) => {
    const pageBtn = e.target.closest('[data-page]');
    if (pageBtn) {
      openPage(pageBtn.dataset.page);
    }
  });

  // Topbar quick buttons
  document.querySelector('#btnTopOpenData')?.addEventListener('click', () => {
    fetch('/api/admin/system/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: '' })
    });
  });

  document.querySelector('#btnOpenDataDir')?.addEventListener('click', () => {
    fetch('/api/admin/system/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: '' })
    });
  });

  document.querySelector('#btnQuickOpenLogs')?.addEventListener('click', () => {
    fetch('/api/admin/system/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'logs' })
    });
  });

  document.querySelector('#btnOpenScriptsFolder')?.addEventListener('click', () => {
    fetch('/api/admin/system/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'scripts' })
    });
  });

  document.querySelector('#btnAddScriptFile')?.addEventListener('click', async () => {
    const btn = document.querySelector('#btnAddScriptFile');
    btn.disabled = true;
    try {
      const res = await fetch('/api/admin/pick-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'script' })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          await loadScripts();
        }
      }
    } catch (err) {
      console.error('Error al agregar script:', err);
    } finally {
      btn.disabled = false;
    }
  });

  document.querySelector('#btnCreateSampleScript')?.addEventListener('click', async () => {
    const res = await fetch('/api/admin/scripts/sample', { method: 'POST' });
    if (res.ok) loadScripts();
  });

  document.querySelector('#copyIp')?.addEventListener('click', async () => {
    const ip = document.querySelector('#localIp')?.textContent;
    if (ip) {
      try { await navigator.clipboard.writeText(ip); } catch { }
    }
  });

  document.querySelector('#btnRefreshQr')?.addEventListener('click', loadPairing);

  // Profile management
  document.querySelector('#btnNewProfile')?.addEventListener('click', () => {
    const name = prompt('Nombre del nuevo perfil:', 'Nuevo Perfil');
    if (!name) return;
    const id = `prof_${Date.now()}`;
    const newProf = {
      id,
      name,
      accent: '#00FF9C',
      grid: { cols: 4, rows: 3 },
      pages: [{ id: `pg_${Date.now()}`, name: 'Principal', buttons: [] }],
      match: { processes: [] }
    };
    state.config.profiles.push(newProf);
    state.activeProfileId = id;
    state.activePageIndex = 0;
    renderProfilesView();
  });

  document.querySelector('#btnAddPage')?.addEventListener('click', () => {
    const prof = getActiveProfile();
    if (!prof) return;
    const name = prompt('Nombre de la página:', `Página ${(prof.pages?.length || 0) + 1}`);
    if (!name) return;
    if (!prof.pages) prof.pages = [];
    prof.pages.push({ id: `pg_${Date.now()}`, name, buttons: [] });
    state.activePageIndex = prof.pages.length - 1;
    renderProfileEditor();
  });

  document.querySelector('#btnSaveConfig')?.addEventListener('click', saveConfig);

  // Ctrl+Z undoes the last grid move.
  document.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
    const target = event.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    if (!undoStack.length) return;
    event.preventDefault();
    undoLastMove();
  });

  // Profile setting inputs live changes
  document.querySelector('#profNameInput')?.addEventListener('input', (e) => {
    const prof = getActiveProfile();
    if (prof) {
      prof.name = e.target.value;
      renderProfileCards();
      renderPhonePreview(prof);
    }
  });

  document.querySelector('#profAccentInput')?.addEventListener('input', (e) => {
    const prof = getActiveProfile();
    if (prof) {
      prof.accent = e.target.value;
      renderProfilesView();
    }
  });

  document.querySelector('#profColsInput')?.addEventListener('change', (e) => {
    applyGridResize(e.target, 'cols');
  });

  document.querySelector('#profRowsInput')?.addEventListener('change', (e) => {
    applyGridResize(e.target, 'rows');
  });

  document.querySelector('#profMatchInput')?.addEventListener('change', (e) => {
    const prof = getActiveProfile();
    if (prof) {
      const procs = e.target.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      if (!prof.match) prof.match = { processes: [] };
      prof.match.processes = procs;
      renderProfileCards();
    }
  });

  // Modal interactions
  document.querySelector('#btnCloseButtonModal')?.addEventListener('click', closeButtonModal);
  document.querySelector('#btnCancelButtonModal')?.addEventListener('click', closeButtonModal);
  document.querySelector('#btnSaveButtonModal')?.addEventListener('click', saveButtonModal);
  document.querySelector('#btnDeleteButton')?.addEventListener('click', deleteButtonModal);
  document.querySelector('#btnTypeSelect')?.addEventListener('change', syncTypeControls);
  document.querySelector('#buttonModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'buttonModal') closeButtonModal();
  });

  // Process search filter
  document.querySelector('#processSearchInput')?.addEventListener('input', renderProcesses);
  document.querySelector('#btnRefreshProcesses')?.addEventListener('click', loadProcesses);

  // Telemetry save
  document.querySelector('#btnSaveTelemetry')?.addEventListener('click', saveTelemetryView);

  // System import/export
  document.querySelectorAll('.pair-tab').forEach(tab => tab.addEventListener('click', () => {
    pairMode = tab.dataset.pairMode === 'web' ? 'web' : 'android';
    document.querySelectorAll('.pair-tab').forEach(item => item.classList.toggle('active', item === tab));
    updatePairCopy();
    loadPairing();
  }));

  document.querySelector('#btnCopyPairLink')?.addEventListener('click', async () => {
    const input = document.querySelector('#pairLinkInput');
    if (!input?.value) return;
    try {
      await navigator.clipboard.writeText(input.value);
      showToast('Enlace copiado.', 'success');
    } catch {
      input.select();
      document.execCommand('copy');
      showToast('Enlace copiado.', 'success');
    }
  });

  document.querySelector('#btnSaveHost')?.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/admin/host', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pcName: document.querySelector('#hostNameInput')?.value,
          pcColor: document.querySelector('#hostColorInput')?.value,
          wolEnabled: !!document.querySelector('#wolEnabledInput')?.checked,
          usbEnabled: !!document.querySelector('#usbEnabledInput')?.checked
        })
      });
      if (!res.ok) throw new Error();
      showToast('Identidad de la PC guardada.', 'success');
      loadHostView();
    } catch {
      showToast('No se pudo guardar.', 'error');
    }
  });

  document.querySelector('#btnRegenerateId')?.addEventListener('click', async () => {
    if (!confirm('Regenerar la identidad hace que los celulares con la app deban emparejarse de nuevo. ¿Continuar?')) return;
    try {
      await fetch('/api/admin/host/regenerate', { method: 'POST' });
      showToast('Identidad regenerada. Emparejá los celulares de nuevo.', 'success', 6000);
      loadHostView();
      loadDevices();
    } catch {
      showToast('No se pudo regenerar la identidad.', 'error');
    }
  });

  document.querySelector('#btnTestWol')?.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/admin/wol/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await res.json();
      if (data.ok) showToast(`Paquete enviado a ${data.mac} (UDP ${data.port}).`, 'success');
      else showToast(data.error || 'No se pudo enviar el paquete.', 'error');
    } catch {
      showToast('No se pudo enviar el paquete.', 'error');
    }
  });

  document.querySelector('#wolEnabledInput')?.addEventListener('change', async (event) => {
    await fetch('/api/admin/host', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wolEnabled: event.target.checked })
    }).catch(() => { });
  });

  document.querySelector('#btnDownloadAdb')?.addEventListener('click', async () => {
    const ok = confirm('Se descargará platform-tools desde dl.google.com (única conexión a internet de VexaDeck). ¿Continuar?');
    if (!ok) return;
    try {
      await fetch('/api/admin/usb/download-adb', { method: 'POST' });
      showToast('Descargando ADB… puede tardar un minuto.', 'success', 6000);
      const timer = setInterval(async () => {
        await loadUsbView();
        const status = document.querySelector('#usbStatus')?.textContent || '';
        if (status.includes('adb.exe') && !status.includes('No se encontró')) clearInterval(timer);
      }, 4000);
      setTimeout(() => clearInterval(timer), 180000);
    } catch {
      showToast('No se pudo iniciar la descarga.', 'error');
    }
  });

  document.querySelector('#usbEnabledInput')?.addEventListener('change', async (event) => {
    try {
      const res = await fetch('/api/admin/usb/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: event.target.checked })
      });
      if (!res.ok) throw new Error();
      await loadUsbView();
      showToast(event.target.checked ? 'USB habilitado.' : 'USB deshabilitado.', 'success');
    } catch {
      showToast('No se pudo cambiar el modo USB.', 'error');
    }
  });

  document.querySelector('#btnExportConfig')?.addEventListener('click', () => {
    window.location.href = '/api/admin/config/export';
  });

  const importInput = document.querySelector('#importConfigInput');
  document.querySelector('#btnImportConfig')?.addEventListener('click', () => {
    importInput?.click();
  });

  importInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      if (!imported.profiles) throw new Error('Formato inválido: debe contener perfiles');
      state.config = imported;
      await saveConfig();
      renderProfilesView();
      alert('¡Configuración importada exitosamente!');
    } catch (err) {
      alert('Error importando archivo: ' + err.message);
    }
  });

  // Spotify
  document.querySelector('#btnSpotifySaveClient')?.addEventListener('click', async () => {
    const input = document.querySelector('#spotifyClientId');
    const clientId = (input?.value || '').trim();
    try {
      const res = await fetch('/api/admin/spotify/client-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId })
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'No se pudo guardar el Client ID.', 'error');
        return;
      }
      if (input) input.value = '';
      renderSpotify(data);
      showToast('Client ID guardado.', 'success');
    } catch {
      showToast('No se pudo guardar el Client ID.', 'error');
    }
  });

  document.querySelector('#btnSpotifyConnect')?.addEventListener('click', async () => {
    const btn = document.querySelector('#btnSpotifyConnect');
    const statusText = document.querySelector('#spotifyStatusText');
    if (btn) { btn.disabled = true; btn.textContent = 'Esperando a Spotify…'; }
    if (statusText) statusText.textContent = 'Terminá la autorización en el navegador.';
    try {
      const res = await fetch('/api/admin/spotify/connect', { method: 'POST' });
      const data = await res.json();
      if (!data.ok) showToast(data.error || 'No se pudo vincular Spotify.', 'error');
      else showToast('Spotify vinculado.', 'success');
      if (data.status) renderSpotify(data.status);
      else await loadSpotify();
      refreshSpotifyTrack();
    } catch {
      showToast('No se pudo vincular Spotify.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Conectar Spotify'; }
    }
  });

  document.querySelector('#btnSpotifyDisconnect')?.addEventListener('click', async () => {
    if (!confirm('¿Desconectar la cuenta de Spotify de VexaDeck?')) return;
    try {
      const res = await fetch('/api/admin/spotify/disconnect', { method: 'POST' });
      const data = await res.json();
      if (data.status) renderSpotify(data.status);
      const track = document.querySelector('#spotifyTrack');
      if (track) track.textContent = '';
      showToast('Cuenta de Spotify desconectada.', 'success');
    } catch {
      showToast('No se pudo desconectar la cuenta.', 'error');
    }
  });

  // Initial tab
  openPage(location.hash.slice(1) || 'inicio');
});
