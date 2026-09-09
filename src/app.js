// Router and top-level state. Loads data from window.__APP_DATA__ (single-file bundle) or fetch('data/*.json') over http.
import { load } from './store.js';
import { buildMatcher } from './engine/dictionary.js';
import { uiState, uiEsc, uiActivePerson, uiToast, uiEnsurePerson } from './ui/common.js';
import { renderHomeScreen } from './ui/home.js';
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

const APP_DATA_FILES = ['sources', 'conditions', 'dictionaries', 'foods', 'recipes', 'articles'];

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
  if (!data.articles || typeof data.articles !== 'object' || Array.isArray(data.articles)) data.articles = {};
  if (!data.dictionaries || typeof data.dictionaries !== 'object') data.dictionaries = { tags: {}, entries: [] };
  if (!data.dictionaries.tags) data.dictionaries.tags = {};
  if (!Array.isArray(data.dictionaries.entries)) data.dictionaries.entries = [];
  return data;
}

const APP_SCREENS = [
  { id: 'home', label: 'Home', icon: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' },
  { id: 'people', label: 'People', icon: 'M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21a8 8 0 0 1 16 0' },
  { id: 'plan', label: 'Plan', icon: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h4' },
  { id: 'check', label: 'Check', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-4 9l3 3 5-6' },
  { id: 'today', label: 'Today', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2' },
  { id: 'week', label: 'Week', icon: 'M4 5h16v15H4zM4 10h16M8 3v4M16 3v4' },
  { id: 'grocery', label: 'Grocery', icon: 'M3 4h3l2 11h10l2-8H7M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z' },
  { id: 'pantry', label: 'Pantry', icon: 'M4 7h16v13H4zM4 7l2-4h12l2 4M9 12h6' },
  { id: 'together', label: 'Together', icon: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 21a7 7 0 0 1 14 0M14 21a6 6 0 0 1 8-5' },
  { id: 'log', label: 'Log', icon: 'M5 3h14v18H5zM8 8h8M8 12h8M8 16h5' },
  { id: 'learn', label: 'Learn', icon: 'M4 5a2 2 0 0 1 2-2h6v18H6a2 2 0 0 0-2 2zM12 3h6a2 2 0 0 1 2 2v16a2 2 0 0 0-2-2h-6' },
  { id: 'settings', label: 'Settings', icon: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8 4l2-1-1-3-2 .3-1.5-1.5.3-2-3-1-1 2h-2l-1-2-3 1 .3 2L6.6 8.3 4.6 8l-1 3 2 1v2l-2 1 1 3 2-.3 1.5 1.5-.3 2 3 1 1-2h2l1 2 3-1-.3-2 1.5-1.5 2 .3 1-3-2-1z' }
];
const APP_TAB_PRIMARY = ['home', 'today', 'check', 'week'];

function appIcon(path) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
}

function appParseRoute() {
  const h = (location.hash || '#/home').replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean);
  const screen = parts.shift() || 'home';
  return { screen: APP_SCREENS.some(s => s.id === screen) ? screen : 'home', parts };
}

let appMoreOpen = false;

function appRenderNav() {
  const cur = uiState.route.screen;
  const side = document.getElementById('sidenav');
  const tabs = document.getElementById('tabbar');
  const top = document.getElementById('topbar');
  const person = uiActivePerson();
  top.innerHTML = `<div class="brand"><svg viewBox="0 0 128 128" aria-hidden="true"><rect width="128" height="128" rx="28" fill="#2f6f8f"/><circle cx="64" cy="66" r="34" fill="none" stroke="#fff" stroke-width="8"/><path d="M46 68l12 12 24-26" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>Specialty Nutrition</div><div class="spacer"></div>${person ? `<span class="small muted">Active: <strong>${uiEsc(person.name)}</strong></span>` : ''}`;
  side.innerHTML = APP_SCREENS.map(s => `<a href="#/${s.id}" ${cur === s.id ? 'aria-current="page"' : ''}>${appIcon(s.icon)}<span>${s.label}</span></a>`).join('');
  const primary = APP_SCREENS.filter(s => APP_TAB_PRIMARY.includes(s.id));
  const more = APP_SCREENS.filter(s => !APP_TAB_PRIMARY.includes(s.id));
  const moreActive = more.some(s => s.id === cur);
  tabs.innerHTML = primary.map(s => `<a href="#/${s.id}" ${cur === s.id ? 'aria-current="page"' : ''}>${appIcon(s.icon)}<span>${s.label}</span></a>`).join('') +
    `<button type="button" id="more-btn" aria-expanded="${appMoreOpen}" aria-controls="more-sheet" ${moreActive ? 'style="color:var(--accent);font-weight:600"' : ''}>${appIcon('M5 12h.01M12 12h.01M19 12h.01')}<span>More</span></button>`;
  let sheet = document.getElementById('more-sheet');
  if (!sheet) { sheet = document.createElement('div'); sheet.id = 'more-sheet'; sheet.className = 'more-sheet'; document.getElementById('app').appendChild(sheet); }
  sheet.hidden = !appMoreOpen;
  sheet.innerHTML = more.map(s => `<a href="#/${s.id}" ${cur === s.id ? 'aria-current="page"' : ''}>${appIcon(s.icon)}<span>${s.label}</span></a>`).join('');
  document.getElementById('more-btn').addEventListener('click', () => { appMoreOpen = !appMoreOpen; appRenderNav(); });
  sheet.querySelectorAll('a').forEach(a => a.addEventListener('click', () => { appMoreOpen = false; }));
}

export function appRender() {
  uiState.route = appParseRoute();
  const main = document.getElementById('main');
  const profile = uiState.profile;
  // If there are no people, onboarding is the only useful place.
  if (!profile.people.length && !['people', 'learn', 'settings'].includes(uiState.route.screen)) {
    location.hash = '#/people/new';
    return;
  }
  appRenderNav();
  main.innerHTML = '';
  const ctx = { route: uiState.route };
  try {
    switch (uiState.route.screen) {
      case 'home': renderHomeScreen(main, ctx); break;
      case 'people': renderPeopleScreen(main, ctx); break;
      case 'plan': renderPlanScreen(main, ctx); break;
      case 'check': renderCheckScreen(main, ctx); break;
      case 'today': renderTodayScreen(main, ctx); break;
      case 'week': renderWeekScreen(main, ctx); break;
      case 'pantry': renderPantryScreen(main, ctx); break;
      case 'together': renderTogetherScreen(main, ctx); break;
      case 'grocery': renderGroceryScreen(main, ctx); break;
      case 'log': renderLogScreen(main, ctx); break;
      case 'learn': renderLearnScreen(main, ctx); break;
      case 'settings': renderSettingsScreen(main, ctx); break;
      default: renderHomeScreen(main, ctx);
    }
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="notice block"><div class="notice-head">Stop</div><div>This screen failed to render: ${uiEsc(e.message)}</div></div>`;
  }
  if (uiState.dataProblems.length && uiState.route.screen !== 'settings') {
    const box = document.createElement('div');
    box.className = 'section';
    box.innerHTML = uiState.dataProblems.map(p => `<div class="notice warn"><div class="notice-head">Caution</div><div>${uiEsc(p)}</div></div>`).join('');
    main.appendChild(box);
  }
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
