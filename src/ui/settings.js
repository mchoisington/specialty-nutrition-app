// Settings: export, import, clear, about.
import { exportJSON, importJSON, clearAll, defaultProfile } from '../store.js';
import { uiState, uiEsc, uiPersist, uiDownload, uiToast, uiNavigate, uiIsoDate, uiCopyText, uiEnsurePerson } from './common.js';

export function renderSettingsScreen(root) {
  const profile = uiState.profile;
  const d = uiState.data;
  root.innerHTML = `
    <h1>Settings</h1>
    <div class="card">
      <h2 style="margin-top:0">Backup</h2>
      <p>Everything lives in this browser's storage on this device. Export a JSON file to back it up or move it to another device.</p>
      <div class="btn-row"><button class="btn primary" type="button" id="set-export">Export JSON</button><button class="btn" type="button" id="set-copy">Copy JSON to clipboard</button></div>
    </div>
    <div class="card">
      <h2 style="margin-top:0">Import</h2>
      <p>Importing replaces everything on this device with the contents of the file. You will be asked to confirm.</p>
      <label for="set-import" class="btn">Choose a file to import</label>
      <input id="set-import" type="file" accept="application/json,.json" class="visually-hidden">
    </div>
    <div class="card">
      <h2 style="margin-top:0">Clear all data</h2>
      <p>Removes every person, log entry, and grocery tick from this device. Export first if you want a copy.</p>
      <button class="btn danger" type="button" id="set-clear">Clear all data</button>
    </div>
    <div class="card">
      <h2 style="margin-top:0">About</h2>
      <dl class="kv">
        <dt>Version</dt><dd>${uiEsc(uiState.version)}</dd>
        <dt>People</dt><dd>${profile.people.length}</dd>
        <dt>Log entries</dt><dd>${(profile.log || []).length}</dd>
        <dt>Data loaded</dt><dd>${d.sources.length} sources, ${d.conditions.length} modules, ${Object.keys(d.dictionaries.tags || {}).length} tags, ${(d.dictionaries.entries || []).length} dictionary terms, ${d.foods.length} foods, ${d.recipes.length} recipes</dd>
        <dt>Storage</dt><dd>On this device only. Nothing is sent anywhere. There is no account and no server.</dd>
        <dt>Language model</dt><dd>None. Every decision comes from readable data files.</dd>
      </dl>
      <p style="margin-top:.75rem"><strong>This app is for general wellness and education. It does not diagnose or treat any condition. Your clinician sets any therapeutic numbers.</strong></p>
      ${uiState.dataProblems.length ? `<div class="notice warn"><div class="notice-head">Caution</div><div>${uiState.dataProblems.map(uiEsc).join('<br>')}</div></div>` : ''}
    </div>
  `;
  root.querySelector('#set-export').addEventListener('click', () => {
    const ok = uiDownload(`specialty-nutrition-${uiIsoDate()}.json`, exportJSON(profile));
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
    uiNavigate('#/people/new');
  });
}
