// Settings: appearance (theme, large text), export, import, guests, clear, about.
import { exportJSON, importJSON, clearAll, defaultProfile } from '../store.js';
import { uiState, uiEsc, uiPersist, uiDownload, uiToast, uiNavigate, uiIsoDate, uiCopyText, uiEnsurePerson, uiPageHeader, uiSection, uiSwitch, uiSegmented, uiChip, uiIcon, uiLoadUiPrefs, uiSaveUiPrefs, uiNoticeHTML, uiModal } from './common.js';
import { claimOwner, registerDevice, sealOwnerBackup, restoreOwnerBackup, forgetDeviceIdentity, removePerson } from '../engine/sync.js';
import { sharingState, sharingLocalHTML, sharingPendingHTML, sharingSafe, sharingPublishIfShared, sharingShortFingerprint } from './sharing.js';

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
    ${uiSection('Sharing and privacy', settingsSharingHTML(profile), { id: 'set-share-h' })}
    ${uiSection('Clear all data', `<p>Removes every person, log entry, and grocery tick from this device. Export first if you want a copy.</p>
      <div><button class="btn danger" type="button" id="set-clear">${uiIcon('trash')}Clear all data</button></div>`, { id: 'set-clear-h' })}
    ${uiSection('About', `<dl class="kv">
        <dt>Version</dt><dd>${uiEsc(uiState.version)}</dd>
        <dt>People</dt><dd>${profile.people.length}</dd>
        <dt>Log entries</dt><dd>${(profile.log || []).length}</dd>
        <dt>Data loaded</dt><dd>${d.sources.length} sources, ${d.conditions.length} modules, ${Object.keys(d.dictionaries.tags || {}).length} tags, ${(d.dictionaries.entries || []).length} dictionary terms, ${d.foods.length} foods, ${d.recipes.length} recipes</dd>
        <dt>Storage</dt><dd>On this device only. Nothing is sent anywhere. There is no account and no server.${sharingState().db ? ' A person is copied to the shared store only when you switch that on above, and only encrypted.' : ''}</dd>
        <dt>Recipes</dt><dd>Peace Meal, the NHS website (Open Government Licence v3.0), the Wikibooks Cookbook (CC BY-SA 4.0), and your own. <a href="#/learn/sources">Where the recipes come from</a>.</dd>
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
  settingsBindSharing(root, profile);
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

// ---- Sharing and privacy (shared store on claude.ai; one calm sentence everywhere else) ----
function settingsSharingHTML(profile) {
  const s = sharingState();
  if (!s.ready) return `<div class="card">${sharingPendingHTML()}</div>`;
  if (!s.db || !s.identity) return `<div class="card">${sharingLocalHTML()}</div>`;
  const mine = profile.people.filter(p => !p.guest);
  return `<div class="card">
      <div class="row">${uiChip('Shared store: on', 'pass')}${s.isOwner ? uiChip('Owner: yes', 'plum') : uiChip(`Owner: no${s.owner ? ` (${s.owner.name || 'another device'})` : ' (unclaimed)'}`, 'neutral')}</div>
      <p class="small muted">Your profiles stay on this device unless you switch one on below. A profile in the shared store is encrypted: only this device and the owner can open it, and other people see only the name. Device key ${sharingShortFingerprint(s.identity.fingerprint)}.</p>
      <div class="field"><label for="set-device-name">This device's name (what others see)</label><div class="row"><input id="set-device-name" type="text" maxlength="40" value="${uiEsc(s.identity.name || '')}" style="flex:1;min-width:160px"><button class="btn small" type="button" id="set-device-save">Save name</button></div></div>
      <h3>Owner</h3>
      <p class="small">The owner can open every profile in the shared store and see the owner dashboard. The first device to claim the role keeps it; it can move to another device only with the backed-up key.</p>
      <div class="btn-row">
        ${s.isOwner ? `<a class="btn small primary" href="#/owner">${uiIcon('key')}Owner dashboard</a>` : `<button class="btn small primary" type="button" id="set-claim" ${s.owner ? 'disabled' : ''}>${uiIcon('key')}Become the owner</button>`}
        <button class="btn small" type="button" id="set-backup" ${s.isOwner ? '' : 'disabled'}>${uiIcon('share')}Back up owner key</button>
        <label for="set-restore" class="btn small">${uiIcon('copy')}Restore owner key</label><input id="set-restore" type="file" accept="application/json,.json" class="visually-hidden">
        <button class="btn small danger" type="button" id="set-forget">${uiIcon('trash')}Forget this device's key</button>
      </div>
      ${s.owner && !s.isOwner ? `<p class="small muted">The owner role is held by "${uiEsc(s.owner.name || 'another device')}" (key ${sharingShortFingerprint(s.owner.fingerprint)}). Restore that device's backed-up key here to move the role.</p>` : ''}
      <p class="small muted">Without a backup, the owner role cannot move to another device. Forgetting this device's key means profiles it published can no longer be opened from here.</p>
      <h3>People in the shared store</h3>
      ${mine.length ? mine.map(p => uiSwitch('set-share-' + p.id, `Keep ${p.name} in the shared store`, 'Encrypted for this device and the owner. Other people see only the name.', !!p.shared_store)).join('') : '<p class="small muted">No people yet.</p>'}
    </div>`;
}

function settingsBindSharing(root, profile) {
  const s = sharingState();
  if (!s.db || !s.identity) return;
  const saveName = root.querySelector('#set-device-save');
  if (saveName) saveName.addEventListener('click', async () => {
    const name = root.querySelector('#set-device-name').value.trim() || 'This device';
    s.identity.name = name;
    try { localStorage.setItem('peace-meal:device', JSON.stringify(s.identity)); } catch { /* ignore */ }
    const ok = await sharingSafe(() => registerDevice(s.db, s.identity), false);
    uiToast(ok ? `This device is now "${name}".` : 'The name was kept locally but the shared store did not update.');
  });
  const claim = root.querySelector('#set-claim');
  if (claim) claim.addEventListener('click', async () => {
    if (!window.confirm('Become the owner of the shared store? The first device to claim it keeps it. Back up the key afterwards so the role can move devices.')) return;
    const res = await sharingSafe(() => claimOwner(s.db, s.identity, s.identity.name), { ok: false, reason: 'error' });
    if (res.ok) { s.owner = { fingerprint: s.identity.fingerprint, name: s.identity.name }; s.isOwner = true; uiToast('This device is now the owner. Back up the key next.'); uiState.rerender(); }
    else if (res.reason === 'already-claimed') { s.owner = res.owner; s.isOwner = false; uiToast(`Already claimed by "${res.owner && res.owner.name || 'another device'}".`); uiState.rerender(); }
    else uiToast('Could not claim the owner role: ' + res.reason);
  });
  const backup = root.querySelector('#set-backup');
  if (backup) backup.addEventListener('click', () => settingsBackupModal());
  root.querySelector('#set-restore').addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { settingsRestoreModal(String(reader.result)); e.target.value = ''; };
    reader.readAsText(file);
  });
  root.querySelector('#set-forget').addEventListener('click', () => {
    if (!window.confirm("Forget this device's key? Profiles this device published can no longer be opened from here, and the owner role (if held here) is lost unless it was backed up.")) return;
    forgetDeviceIdentity();
    s.identity = null; s.isOwner = false;
    uiToast('This device\'s key was forgotten. A new one is made the next time the app opens.');
    uiState.rerender();
  });
  profile.people.filter(p => !p.guest).forEach(p => {
    const sw = root.querySelector('#set-share-' + CSS.escape(p.id));
    if (!sw) return;
    sw.addEventListener('change', async () => {
      p.shared_store = sw.checked;
      sw.setAttribute('aria-checked', String(sw.checked));
      uiPersist();
      if (sw.checked) sharingPublishIfShared(p, { now: true });
      else { const ok = await sharingSafe(() => removePerson(s.db, p.id), false); uiToast(ok ? `${p.name} was removed from the shared store.` : `${p.name} is no longer kept in sync; the stored copy could not be removed right now.`); }
    });
  });
}

function settingsBackupModal() {
  const s = sharingState();
  const m = uiModal(`
    <p class="small">The owner key is sealed with a passphrase and saved as <code>peace-meal-owner-key.json</code>. Keep both somewhere safe: without them the owner role cannot move to another device.</p>
    <div class="field"><label for="bk-p1">Passphrase (at least 8 characters)</label><input id="bk-p1" type="password" autocomplete="new-password"></div>
    <div class="field"><label for="bk-p2">Type it again</label><input id="bk-p2" type="password" autocomplete="new-password"></div>
    <div class="btn-row"><button class="btn primary" type="button" id="bk-go">${uiIcon('share')}Seal and download</button></div>`, { title: 'Back up owner key' });
  if (!m) return;
  m.el.querySelector('#bk-go').addEventListener('click', async () => {
    const a = m.el.querySelector('#bk-p1').value, b = m.el.querySelector('#bk-p2').value;
    if (a.length < 8) { uiToast('Use at least 8 characters.'); return; }
    if (a !== b) { uiToast('The two passphrases differ.'); return; }
    const box = await sharingSafe(() => sealOwnerBackup(s.identity, a), null, 'The key could not be sealed on this device.');
    if (!box) return;
    const ok = uiDownload('peace-meal-owner-key.json', JSON.stringify({ peaceMealOwnerKey: 1, name: s.identity.name, created: new Date().toISOString(), ...box }, null, 2));
    uiToast(ok ? 'Backup started. Store the file and the passphrase apart.' : 'Download blocked here.');
    if (ok) m.close();
  });
}

function settingsRestoreModal(text) {
  let box = null;
  try { box = JSON.parse(text); } catch { uiToast('That file is not a Peace Meal owner key.'); return; }
  if (!box || !box.ct || !box.salt) { uiToast('That file is not a Peace Meal owner key.'); return; }
  const m = uiModal(`
    <p class="small">Restoring replaces this device's key with the owner's key from the backup. Profiles published by the old key on this device will no longer open here.</p>
    <div class="field"><label for="rs-p">Passphrase</label><input id="rs-p" type="password" autocomplete="current-password"></div>
    <div class="btn-row"><button class="btn primary" type="button" id="rs-go">${uiIcon('key')}Restore</button></div>`, { title: 'Restore owner key' });
  if (!m) return;
  m.el.querySelector('#rs-go').addEventListener('click', async () => {
    const pass = m.el.querySelector('#rs-p').value;
    if (!pass) { uiToast('Enter the passphrase.'); return; }
    let id = null;
    try { id = await restoreOwnerBackup(box, pass); } catch (e) { uiToast('Could not open the backup: wrong passphrase or not an owner key.'); return; }
    if (!id) return;
    m.close();
    uiToast('Owner key restored. Reconnecting to the shared store...');
    if (uiState.syncRefresh) await uiState.syncRefresh();
    uiState.rerender();
  });
}
