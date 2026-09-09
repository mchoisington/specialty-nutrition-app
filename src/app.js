// Router and top-level state. Loads data from window.__APP_DATA__ (single-file bundle) or fetch('data/*.json') over http.
import { load } from './store.js';
import { buildMatcher } from './engine/dictionary.js';
import { uiState, uiEsc, uiActivePerson, uiToast, uiEnsurePerson, uiIcon, uiBrandMark, uiAvatar, uiNavRecord, uiCanGoBack, uiGoBack, uiBackButtonHTML } from './ui/common.js';
import { renderHomeScreen, renderWelcomeScreen } from './ui/home.js';
import { renderPeopleScreen } from './ui/people.js';
import { renderPlanScreen } from './ui/plan.js';
import { renderCheckScreen } from './ui/check.js';
import { renderWeekScreen } from './ui/week.js';
import { renderGroceryScreen } from './ui/grocery.js';
import { renderLogScreen } from './ui/log.js';
import { renderLearnScreen } from './ui/learn.js';
import { renderSettingsScreen } from './ui/settings.js';
import { renderTodayScreen } from './ui/today.js';
import { renderPantryScreen } from './ui/pantry.js';
import { renderTogetherScreen } from './ui/together.js';
import { renderBreatheScreen } from './ui/breathe.js';

const APP_DATA_FILES = ['sources', 'conditions', 'dictionaries', 'foods', 'recipes', 'recipes-open', 'articles'];

function appEmptyFor(name) {
  return name === 'dictionaries' ? { tags: {}, entries: [] } : name === 'articles' ? {} : [];
}

export async function loadData() {
  const out = {};
  const problems = [];
  const global = typeof window !== 'undefined' ? window.__APP_DATA__ : null;
  if (global && typeof global === 'object') {
    for (const n of APP_DATA_FILES) out[n] = global[n] != null ? global[n] : appEmptyFor(n);
    return { data: out, problems };
  }
  if (!/^https?:$/.test(location.protocol)) {
    for (const n of APP_DATA_FILES) out[n] = appEmptyFor(n);
    problems.push('This page was opened from a file:// URL, so data files could not be fetched. Serve the folder over http, or open the single-file build in dist/.');
    return { data: out, problems };
  }
  await Promise.all(APP_DATA_FILES.map(async n => {
    try {
      const res = await fetch(`data/${n}.json`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      out[n] = await res.json();
    } catch (e) {
      out[n] = appEmptyFor(n);
      problems.push(`data/${n}.json did not load (${e.message}). Features that need it will be empty.`);
    }
  }));
  return { data: out, problems };
}

function appNormalizeData(data) {
  // conditions.json is { version, notes, modules, proposed_tags, flags } (or a bare array in older fixtures)
  uiState.conditionsMeta = { flags: {}, proposed_tags: [] };
  if (data.conditions && !Array.isArray(data.conditions)) {
    uiState.conditionsMeta.flags = data.conditions.flags || {};
    uiState.conditionsMeta.proposed_tags = data.conditions.proposed_tags || [];
    data.conditions = data.conditions.modules || [];
  }
  if (!Array.isArray(data.sources)) data.sources = [];
  if (!Array.isArray(data.foods)) data.foods = [];
  if (!Array.isArray(data.recipes)) data.recipes = [];
  if (Array.isArray(data['recipes-open'])) { const seen = new Set(data.recipes.map(r => r.id)); for (const r of data['recipes-open']) if (!seen.has(r.id)) data.recipes.push(r); }
  delete data['recipes-open'];
  if (!data.articles || typeof data.articles !== 'object' || Array.isArray(data.articles)) data.articles = {};
  if (!data.dictionaries || typeof data.dictionaries !== 'object') data.dictionaries = { tags: {}, entries: [] };
  if (!data.dictionaries.tags) data.dictionaries.tags = {};
  if (!Array.isArray(data.dictionaries.entries)) data.dictionaries.entries = [];
  return data;
}

const APP_SCREENS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'people', label: 'People', icon: 'person' },
  { id: 'plan', label: 'Plan', icon: 'list' },
  { id: 'check', label: 'Check', icon: 'check-circle' },
  { id: 'today', label: 'Today', icon: 'clock' },
  { id: 'week', label: 'Week', icon: 'calendar' },
  { id: 'grocery', label: 'Grocery', icon: 'cart' },
  { id: 'pantry', label: 'Pantry', icon: 'jar' },
  { id: 'together', label: 'Together', icon: 'people' },
  { id: 'log', label: 'Log', icon: 'note' },
  { id: 'breathe', label: 'Breathe', icon: 'breathe' },
  { id: 'learn', label: 'Learn', icon: 'book' },
  { id: 'settings', label: 'Settings', icon: 'gear' }
];
const APP_TAB_PRIMARY = ['home', 'today', 'check', 'week'];

function appParseRoute() {
  const h = (location.hash || '#/home').replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean);
  const screen = parts.shift() || 'home';
  if (screen === 'welcome') return { screen: 'welcome', parts };
  return { screen: APP_SCREENS.some(s => s.id === screen) ? screen : 'home', parts };
}

let appMoreOpen = false;
let appLastScreen = null;

function appNavLink(s, cur) {
  return `<a href="#/${s.id}" ${cur === s.id ? 'aria-current="page"' : ''}>${uiIcon(s.icon)}<span>${s.label}</span></a>`;
}

function appRenderNav() {
  const cur = uiState.route.screen;
  const side = document.getElementById('sidenav');
  const tabs = document.getElementById('tabbar');
  const top = document.getElementById('topbar');
  const person = uiActivePerson();
  const welcome = cur === 'welcome';
  const canBack = uiCanGoBack() && !welcome;
  const who = person ? `<a class="who" href="#/people" aria-label="Active person: ${uiEsc(person.name)}. Open People.">${uiAvatar(person.name)}<span class="who-name">${uiEsc(person.name)}</span></a>` : '';

  // Phone top bar: Back (when there is somewhere to go), brand, active person.
  top.innerHTML = `${canBack ? uiBackButtonHTML('back-phone') : ''}<a class="brand" href="#/home">${uiBrandMark({ label: 'Peace Meal' })}<span class="brand-name">Peace Meal</span></a><div class="spacer"></div>${who}`;

  // Desktop rail: brand at top, nav, active person at the bottom.
  side.innerHTML = `<a class="rail-brand" href="#/home">${uiBrandMark({ label: 'Peace Meal' })}<span class="brand-name">Peace Meal</span></a>
    <div class="rail-nav">${APP_SCREENS.map(s => appNavLink(s, cur)).join('')}</div>
    ${person ? `<a class="rail-person" href="#/people" aria-label="Active person: ${uiEsc(person.name)}. Open People.">${uiAvatar(person.name)}<span class="rail-person-text"><span class="eyebrow">Active person</span><span class="rail-person-name">${uiEsc(person.name)}</span></span></a>` : ''}`;

  // Phone tab bar: four primary tabs and a More sheet with the rest.
  const primary = APP_SCREENS.filter(s => APP_TAB_PRIMARY.includes(s.id));
  const more = APP_SCREENS.filter(s => !APP_TAB_PRIMARY.includes(s.id));
  const moreActive = more.some(s => s.id === cur);
  tabs.innerHTML = primary.map(s => appNavLink(s, cur)).join('') +
    `<button type="button" id="more-btn" class="${moreActive ? 'on' : ''}" aria-expanded="${appMoreOpen}" aria-controls="more-sheet" aria-haspopup="true">${uiIcon('more')}<span>More</span></button>`;
  let scrim = document.getElementById('more-scrim');
  if (!scrim) { scrim = document.createElement('button'); scrim.id = 'more-scrim'; scrim.className = 'more-scrim'; scrim.type = 'button'; scrim.setAttribute('aria-label', 'Close the More menu'); document.getElementById('app').appendChild(scrim); }
  let sheet = document.getElementById('more-sheet');
  if (!sheet) { sheet = document.createElement('div'); sheet.id = 'more-sheet'; sheet.className = 'more-sheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', 'More screens'); document.getElementById('app').appendChild(sheet); }
  sheet.hidden = !appMoreOpen;
  scrim.hidden = !appMoreOpen;
  sheet.innerHTML = `<div class="sheet-title"><span class="eyebrow">More</span><button type="button" class="btn small icon" id="more-close" aria-label="Close the More menu">${uiIcon('close')}</button></div>` + more.map(s => appNavLink(s, cur)).join('');
  const toggleMore = open => { appMoreOpen = open; appRenderNav(); if (open) { const first = sheet.querySelector('a'); if (first) first.focus(); } else { const b = document.getElementById('more-btn'); if (b) b.focus(); } };
  document.getElementById('more-btn').addEventListener('click', () => toggleMore(!appMoreOpen));
  sheet.querySelector('#more-close').addEventListener('click', () => toggleMore(false));
  scrim.onclick = () => toggleMore(false);
  sheet.onkeydown = e => { if (e.key === 'Escape') { e.preventDefault(); toggleMore(false); } };
  sheet.querySelectorAll('a').forEach(a => a.addEventListener('click', () => { appMoreOpen = false; }));
  uiState.closeMoreSheet = () => { if (!appMoreOpen) return false; toggleMore(false); return true; };
  top.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', uiGoBack));
}

export function appRender() {
  uiState.route = appParseRoute();
  uiNavRecord(location.hash || '#/home', !!uiState.navReplaceNext);
  uiState.navReplaceNext = false;
  const main = document.getElementById('main');
  const profile = uiState.profile;
  // If there are no people, the welcome screen and onboarding are the only useful places.
  if (!profile.people.length && !['people', 'learn', 'settings', 'welcome'].includes(uiState.route.screen)) {
    uiState.navReplaceNext = true;
    location.replace('#/welcome');
    return;
  }
  if (profile.people.length && uiState.route.screen === 'welcome') { uiState.navReplaceNext = true; location.replace('#/home'); return; }
  if (uiState.modalClose) uiState.modalClose({ silent: true });
  appRenderNav();
  main.innerHTML = '';
  main.classList.toggle('print-sheet', false);
  const ctx = { route: uiState.route };
  try {
    switch (uiState.route.screen) {
      case 'welcome': renderWelcomeScreen(main, ctx); break;
      case 'home': renderHomeScreen(main, ctx); break;
      case 'people': renderPeopleScreen(main, ctx); break;
      case 'plan': renderPlanScreen(main, ctx); break;
      case 'check': renderCheckScreen(main, ctx); break;
      case 'today': renderTodayScreen(main, ctx); break;
      case 'week': renderWeekScreen(main, ctx); break;
      case 'pantry': renderPantryScreen(main, ctx); break;
      case 'together': renderTogetherScreen(main, ctx); break;
      case 'breathe': renderBreatheScreen(main, ctx); break;
      case 'grocery': renderGroceryScreen(main, ctx); break;
      case 'log': renderLogScreen(main, ctx); break;
      case 'learn': renderLearnScreen(main, ctx); break;
      case 'settings': renderSettingsScreen(main, ctx); break;
      default: renderHomeScreen(main, ctx);
    }
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="notice block">${uiIcon('stop', { cls: 'notice-icon' })}<div class="notice-head">Stop</div><div class="notice-body">This screen failed to render: ${uiEsc(e.message)}</div></div>`;
  }
  // Desktop Back control sits at the top of the content column; the phone one is in the top bar.
  if (uiCanGoBack() && uiState.route.screen !== 'welcome') {
    main.insertAdjacentHTML('afterbegin', `<div class="backbar">${uiBackButtonHTML('back-desktop')}</div>`);
    main.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', uiGoBack));
  }
  if (uiState.dataProblems.length && uiState.route.screen !== 'settings') {
    const box = document.createElement('div');
    box.className = 'section';
    box.innerHTML = uiState.dataProblems.map(p => `<div class="notice warn">${uiIcon('alert', { cls: 'notice-icon' })}<div class="notice-head">Caution</div><div class="notice-body">${uiEsc(p)}</div></div>`).join('');
    main.appendChild(box);
  }
  // Cross-fade with a small rise when the screen changes (not on same-screen re-renders). Motion is gated in CSS.
  if (appLastScreen !== uiState.route.screen) {
    main.classList.remove('enter');
    void main.offsetWidth;
    main.classList.add('enter');
  }
  appLastScreen = uiState.route.screen;
  window.scrollTo(0, 0);
}

async function appBoot() {
  uiState.profile = load();
  if (!uiState.profile.activePerson && uiState.profile.people.length) uiState.profile.activePerson = uiState.profile.people[0].id;
  if (!Array.isArray(uiState.profile.log)) uiState.profile.log = [];
  uiState.profile.people.forEach(uiEnsurePerson);
  const { data, problems } = await loadData();
  uiState.data = appNormalizeData(data);
  uiState.dataProblems = problems;
  uiState.matcher = buildMatcher(uiState.data.dictionaries);
  uiState.conditionsById = new Map(uiState.data.conditions.map(m => [m.id, m]));
  uiState.sourcesById = new Map(uiState.data.sources.map(s => [s.id, s]));
  uiState.foodsById = new Map(uiState.data.foods.map(f => [f.id, f]));
  uiState.recipesById = new Map(uiState.data.recipes.map(r => [r.id, r]));
  uiState.rerender = appRender;
  window.addEventListener('hashchange', appRender);
  if (!location.hash) location.hash = '#/home';
  appRender();
  if (problems.length) uiToast('Some data files did not load.');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', appBoot);
else appBoot();
