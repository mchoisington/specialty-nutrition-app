// Settings: appearance (theme, large text), export, import, guests, clear, about.
import { exportJSON, importJSON, clearAll, defaultProfile } from '../store.js';
import { uiState, uiEsc, uiPersist, uiDownload, uiToast, uiNavigate, uiIsoDate, uiCopyText, uiEnsurePerson, uiPageHeader, uiSection, uiSwitch, uiSegmented, uiChip, uiIcon, uiLoadUiPrefs, uiSaveUiPrefs, uiNoticeHTML } from './common.js';

export function renderSettingsScreen(root) {
  const profile = uiState.profile;
  const d = uiState.data;
  const guests = profile.people.filter(p => p.guest);
  const prefs = uiLoadUiPrefs();
  root.innerHTML = `
    ${uiPageHeader('Settings', 'Appearance, backup, guests, and what this app is.')}
    ${uiSection('Appearance', `<div class="card">
      <div class="field"><span class="label">Theme</span>${uiSegmented('set-theme', [{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }], prefs.theme, { label: 'Theme' })}<div class="hint">System follows the device setting.</div></div>
      ${uiSwitch('set-large', 'Large text', 'Raises the base text size across the app.', prefs.largeText)}
    </div>`, { id: 'set-appearance-h' })}
    ${uiSection('Backup', `<div class="card">
      <p>Everything lives in this browser's storage on this device. Export a JSON file to back it up or move it to another device.</p>
      <div class="btn-row"><button class="btn primary" type="button" id="set-export">${uiIcon('share')}Export JSON</button><button class="btn" type="button" id="set-copy">${uiIcon('copy')}Copy JSON to clipboard</button></div>
    </div>`, { id: 'set-backup-h' })}
    ${uiSection('Import', `<div class="card">
      <p>Importing replaces everything on this device with the contents of the file. You will be asked to confirm.</p>
      <label for="set-import" class="btn">Choose a file to import</label>
      <input id="set-import" type="file" accept="application/json,.json" class="visually-hidden">
    </div>`, { id: 'set-import-h' })}
    ${uiSection('Guests', `<p class="small muted">Guests are profiles other people shared with you (Together screen). They can be picked when cooking together and removed here.</p>
      ${guests.length ? `<div class="list boxed">${guests.map(g => `<div class="list-row"><div class="list-main"><div class="list-title">${uiEsc(g.name)} ${uiChip('Guest', 'plum')}</div><div class="list-sub">${(g.allergens || []).length ? 'allergens: ' + g.allergens.length : 'no allergens'}, ${(g.modules || []).length} module${(g.modules || []).length === 1 ? '' : 's'}</div></div><div class="list-actions"><button class="btn small danger" type="button" data-remove-guest="${uiEsc(g.id)}">Remove</button></div></div>`).join('')}</div>` : '<p class="small muted">No guests. Add one on the Together screen by pasting a shared profile or choosing a file.</p>'}`, { id: 'set-guests-h' })}
    ${uiSection('Calendar export', `<p class="small">"Add to calendar (.ics)" on the Grocery and Together screens saves a standard calendar file with one all-day event per day listing that day's meals. Import it into Google Calendar (Settings, Import and export), Apple Calendar, Outlook, or a Skylight calendar. There is no direct Google Keep or Skylight list integration; use Share or Copy for the grocery list itself.</p>`, { id: 'set-cal-h' })}
    ${uiSection('Clear all data', `<p>Removes every person, log entry, and grocery tick from this device. Export first if you want a copy.</p>
      <div><button class="btn danger" type="button" id="set-clear">${uiIcon('trash')}Clear all data</button></div>`, { id: 'set-clear-h' })}
    ${uiSection('About', `<dl class="kv">
        <dt>Version</dt><dd>${uiEsc(uiState.version)}</dd>
        <dt>People</dt><dd>${profile.people.length}</dd>
        <dt>Log entries</dt><dd>${(profile.log || []).length}</dd>
        <dt>Data loaded</dt><dd>${d.sources.length} sources, ${d.conditions.length} modules, ${Object.keys(d.dictionaries.tags || {}).length} tags, ${(d.dictionaries.entries || []).length} dictionary terms, ${d.foods.length} foods, ${d.recipes.length} recipes</dd>
        <dt>Storage</dt><dd>On this device only. Nothing is sent anywhere. There is no account and no server.</dd>
        <dt>Language model</dt><dd>None. Every decision comes from readable data files.</dd>
      </dl>
      <p><strong>This app is for general wellness and education. It does not diagnose or treat any condition. Your clinician sets any therapeutic numbers.</strong></p>
      ${uiState.dataProblems.length ? uiNoticeHTML({ level: 'warn', text: uiState.dataProblems.join(' ') }) : ''}`, { id: 'set-about-h' })}
  `;
  root.querySelectorAll('[data-seg="set-theme"]').forEach(r => r.addEventListener('change', () => {
    uiSaveUiPrefs({ ...uiLoadUiPrefs(), theme: r.value });
    root.querySelectorAll('[data-seg="set-theme"]').forEach(x => x.parentElement.classList.toggle('on', x.checked));
  }));
  root.querySelector('#set-large').addEventListener('change', e => {
    uiSaveUiPrefs({ ...uiLoadUiPrefs(), largeText: e.target.checked });
    e.target.setAttribute('aria-checked', String(e.target.checked));
  });
  root.querySelectorAll('[data-remove-guest]').forEach(b => b.addEventListener('click', () => {
    const g = profile.people.find(p => p.id === b.dataset.removeGuest);
    if (!g || !window.confirm(`Remove guest ${g.name}?`)) return;
    profile.people = profile.people.filter(p => p.id !== g.id);
    if (profile.activePerson === g.id) profile.activePerson = profile.people[0] ? profile.people[0].id : null;
    uiPersist(); uiToast(`Removed ${g.name}.`); uiState.rerender();
  }));
  root.querySelector('#set-export').addEventListener('click', () => {
    const ok = uiDownload(`peace-meal-${uiIsoDate()}.json`, exportJSON(profile));
    uiToast(ok ? 'Export started.' : 'Download blocked here. Use "Copy JSON" instead.');
  });
  root.querySelector('#set-copy').addEventListener('click', async () => {
    const ok = await uiCopyText(exportJSON(profile));
    uiToast(ok ? 'JSON copied.' : 'Could not copy.');
  });
  root.querySelector('#set-import').addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const incoming = importJSON(String(reader.result));
        const n = incoming.people.length;
        if (!window.confirm(`Replace everything on this device with this file (${n} ${n === 1 ? 'person' : 'people'}, ${(incoming.log || []).length} log entries)?`)) { e.target.value = ''; return; }
        uiState.profile = incoming;
        if (!Array.isArray(uiState.profile.log)) uiState.profile.log = [];
        uiState.profile.people.forEach(uiEnsurePerson);
        if (!uiState.profile.activePerson && n) uiState.profile.activePerson = incoming.people[0].id;
        uiPersist();
        uiToast('Imported.');
        uiNavigate('#/home');
      } catch (err) {
        uiToast('Import failed: ' + err.message);
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  });
  root.querySelector('#set-clear').addEventListener('click', () => {
    if (!window.confirm('Clear all data on this device? This cannot be undone.')) return;
    clearAll();
    try { for (const k of Object.keys(localStorage)) if (k.startsWith('sn-grocery:')) localStorage.removeItem(k); } catch { /* ignore */ }
    uiState.profile = defaultProfile();
    uiPersist();
    uiToast('Cleared.');
    uiNavigate('#/welcome');
  });
}
