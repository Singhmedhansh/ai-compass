function readRuntimeConfig() {
  const fallback = {
    isAuthenticated: false,
    favoriteIds: [],
    csrfToken: '',
  };

  const node = document.getElementById('ai-compass-config');
  if (!node) return fallback;

  let favoriteIds = [];
  try {
    const rawIds = String(node.dataset.favoriteIds || '[]');
    const parsed = JSON.parse(rawIds);
    favoriteIds = Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    favoriteIds = [];
  }

  return {
    isAuthenticated: String(node.dataset.isAuthenticated || '') === '1',
    favoriteIds,
    csrfToken: String(node.dataset.csrfToken || ''),
  };
}

const config = window.AI_COMPASS_CONFIG || readRuntimeConfig();

let allTools = [];
let trendingTools = [];
let selectedCompare = new Set();
let favorites = new Set([
  ...(config.favoriteIds || []).map((item) => String(item)),
  ...readLocalArray('ai_compass_saved_tools_local').map((item) => String(item)),
]);
let studentMode = false;
let state = {
  category: 'all',
  search: '',
  price: 'all',
  sort: localStorage.getItem('ai_compass_sort') || 'trending',
  studentMode,
  visibleLimit: 16,
};
let searchSuggestTimer = null;
let searchSuggestController = null;
const TOOL_PAGE_SIZE = 16;

const SORT_LABELS = {
  trending: 'Trending',
  rating: 'Highest Rated',
  popular: 'Most Popular',
  newest: 'Newest',
  free: 'Free First',
};

const CATEGORY_LABELS = {
  all: 'All Tools',
  writing: 'Writing & Docs',
  coding: 'Coding',
  image: 'Image Generation',
  video: 'Video',
  research: 'Research',
  productivity: 'Productivity',
  trending: 'Trending',
  free: 'Free',
};

const LOCAL_KEYS = {
  userPrefs: 'ai_compass_user_prefs',
  recentSearches: 'ai_compass_recent_searches',
  recentTools: 'recent_tools',
  savedTools: 'ai_compass_saved_tools_local',
  savedStacks: 'ai_compass_saved_stacks',
};

function readLocalArray(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function writeLocalArray(key, values) {
  try {
    localStorage.setItem(key, JSON.stringify(Array.isArray(values) ? values : []));
  } catch (error) {
    console.warn('localStorage write failed:', error);
  }
}

function readLocalObject(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
  }
}

function writeLocalObject(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value && typeof value === 'object' ? value : {}));
  } catch (error) {
    console.warn('localStorage write failed:', error);
  }
}

function rememberSearchQuery(query) {
  const value = String(query || '').trim().toLowerCase();
  if (!value) return;
  const recent = readLocalArray(LOCAL_KEYS.recentSearches).filter((item) => item !== value);
  recent.unshift(value);
  writeLocalArray(LOCAL_KEYS.recentSearches, recent.slice(0, 20));
}

function rememberViewedTool(toolKey) {
  const key = String(toolKey || '').trim();
  if (!key) return;
  const recent = readLocalArray(LOCAL_KEYS.recentTools).filter((item) => item !== key);
  recent.unshift(key);
  writeLocalArray(LOCAL_KEYS.recentTools, recent.slice(0, 24));
}

function rememberSavedTool(toolKey) {
  const key = String(toolKey || '').trim();
  if (!key) return;
  const saved = readLocalArray(LOCAL_KEYS.savedTools);
  if (saved.includes(key)) return;
  saved.push(key);
  writeLocalArray(LOCAL_KEYS.savedTools, saved.slice(-48));
}

function forgetSavedTool(toolKey) {
  const key = String(toolKey || '').trim();
  if (!key) return;
  const next = readLocalArray(LOCAL_KEYS.savedTools).filter((item) => item !== key);
  writeLocalArray(LOCAL_KEYS.savedTools, next);
}

function saveUserMemoryPrefs() {
  const prefs = readLocalObject(LOCAL_KEYS.userPrefs);
  prefs.preferredCategory = state.category;
  prefs.lastFilters = {
    category: state.category,
    price: state.price,
    sort: state.sort,
    search: state.search,
  };
  prefs.studentMode = !!studentMode;
  prefs.updatedAt = new Date().toISOString();
  writeLocalObject(LOCAL_KEYS.userPrefs, prefs);
}

function scoreToolForLocalMemory(tool, searchTokens, savedSet, recentSet) {
  const key = getToolKey(tool);
  const name = String(tool.name || '').toLowerCase();
  const desc = String(getToolDescription(tool) || '').toLowerCase();
  const category = normalizeCategory(tool.category);
  const tags = getToolTags(tool).join(' ').toLowerCase();

  let score = Number(tool.rating || 0) * 4;
  if (savedSet.has(key)) score += 10;
  if (recentSet.has(key)) score += 6;
  searchTokens.forEach((token) => {
    if (name.includes(token)) score += 8;
    if (category.includes(token)) score += 5;
    if (tags.includes(token)) score += 4;
    if (desc.includes(token)) score += 2;
  });
  if (tool.studentPerk || tool.student_friendly) score += 2;
  return score;
}

function renderPersonalizationCards(targetId, tools, emptyMessage) {
  const container = document.getElementById(targetId);
  if (!container) return;
  if (!tools.length) {
    container.innerHTML = `<div class="col-span-full text-xs text-zinc-500">${escapeHtml(emptyMessage)}</div>`;
    return;
  }

  container.innerHTML = tools.map((tool) => {
    const key = getToolKey(tool);
    return `
      <a href="/tool/${escapeHtml(key)}" class="glass rounded-xl p-3 hover:border-cyan-400/30 transition-colors">
        <div class="flex items-center gap-2">
          ${renderToolIcon(tool, 'w-8 h-8', 'rounded-md')}
          <div class="min-w-0">
            <div class="text-sm text-zinc-100 truncate" style="font-weight:600">${escapeHtml(tool.name || 'Tool')}</div>
            <div class="text-[11px] text-zinc-500 truncate">${escapeHtml(tool.category || 'general')}</div>
          </div>
        </div>
      </a>
    `;
  }).join('');
}

async function renderLocalMemorySections() {
  const hasSlots = document.getElementById('recommended-for-you-grid') || document.getElementById('recommended-local-grid') || document.getElementById('recently-viewed-local-grid') || document.getElementById('saved-tools-local-grid');
  if (!hasSlots) return;

  let tools = Array.isArray(allTools) && allTools.length ? allTools : [];
  if (!tools.length) {
    try {
      tools = await fetchTools();
    } catch (error) {
      tools = [];
    }
  }
  if (!tools.length) return;

  const byKey = new Map(tools.map((tool) => [getToolKey(tool), tool]));
  const recentSearches = readLocalArray(LOCAL_KEYS.recentSearches);
  const searchTokens = recentSearches.slice(0, 6).flatMap((value) => String(value).split(/\s+/).filter(Boolean));
  const savedTools = readLocalArray(LOCAL_KEYS.savedTools);
  const recentTools = readLocalArray(LOCAL_KEYS.recentTools);
  const savedSet = new Set(savedTools);
  const recentSet = new Set(recentTools);

  const recommended = tools
    .map((tool) => ({ score: scoreToolForLocalMemory(tool, searchTokens, savedSet, recentSet), tool }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((item) => item.tool);

  const recentCards = recentTools.map((key) => byKey.get(key)).filter(Boolean).slice(0, 8);
  const savedCards = savedTools.map((key) => byKey.get(key)).filter(Boolean).slice(0, 8);

  const recSection = document.getElementById('recommended-for-you') || document.getElementById('recommended-local');
  if (recSection && recommended.length) recSection.classList.remove('hidden');
  const recentSection = document.getElementById('recently-viewed-local');
  if (recentSection && recentCards.length) recentSection.classList.remove('hidden');
  const savedSection = document.getElementById('saved-tools-local');
  if (savedSection && savedCards.length) savedSection.classList.remove('hidden');

  renderPersonalizationCards('recommended-for-you-grid', recommended, 'Search and save tools to unlock recommendations.');
  renderPersonalizationCards('recommended-local-grid', recommended, 'Search and save tools to unlock recommendations.');
  renderPersonalizationCards('recently-viewed-local-grid', recentCards, 'No recent tools yet.');
  renderPersonalizationCards('saved-tools-local-grid', savedCards, 'No saved tools yet.');
}

function renderSavedStacksSection() {
  const grid = document.getElementById('saved-stacks-local-grid');
  if (!grid) return;

  const stacks = readLocalArray(LOCAL_KEYS.savedStacks).slice().reverse().slice(0, 8);
  if (!stacks.length) {
    grid.innerHTML = '<div class="col-span-full text-xs text-zinc-500">No saved stacks yet. Generate a stack and click Save this stack.</div>';
    return;
  }

  grid.innerHTML = stacks.map((stack) => {
    const tools = Array.isArray(stack.tools) ? stack.tools : [];
    const when = String(stack.savedAt || '').replace('T', ' ').slice(0, 16) || 'recently';
    return `
      <article class="glass rounded-xl p-4 flex flex-col gap-2">
        <div class="text-sm text-zinc-100" style="font-weight:600">${escapeHtml((stack.goal || 'AI').toUpperCase())} stack</div>
        <div class="text-[11px] text-zinc-500">Budget: ${escapeHtml(stack.budget || 'any')} · Platform: ${escapeHtml(stack.platform || 'any')}</div>
        <div class="text-[11px] text-zinc-500">${tools.length} tools · saved ${escapeHtml(when)}</div>
        <div class="text-[11px] text-zinc-400 line-clamp-2">${escapeHtml(tools.join(', ') || 'No tool keys saved')}</div>
      </article>
    `;
  }).join('');
}

function exportSavedData() {
  const payload = {
    exportedAt: new Date().toISOString(),
    userPrefs: readLocalObject(LOCAL_KEYS.userPrefs),
    recentSearches: readLocalArray(LOCAL_KEYS.recentSearches),
    recentTools: readLocalArray(LOCAL_KEYS.recentTools),
    savedTools: readLocalArray(LOCAL_KEYS.savedTools),
    savedStacks: readLocalArray(LOCAL_KEYS.savedStacks),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `ai-compass-saved-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function importSavedData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || '{}'));
      if (parsed.userPrefs && typeof parsed.userPrefs === 'object') writeLocalObject(LOCAL_KEYS.userPrefs, parsed.userPrefs);
      if (Array.isArray(parsed.recentSearches)) writeLocalArray(LOCAL_KEYS.recentSearches, parsed.recentSearches.slice(0, 20));
      if (Array.isArray(parsed.recentTools)) writeLocalArray(LOCAL_KEYS.recentTools, parsed.recentTools.slice(0, 24));
      if (Array.isArray(parsed.savedTools)) writeLocalArray(LOCAL_KEYS.savedTools, parsed.savedTools.slice(-48));
      if (Array.isArray(parsed.savedStacks)) writeLocalArray(LOCAL_KEYS.savedStacks, parsed.savedStacks.slice(-12));
      renderLocalMemorySections();
      renderSavedStacksSection();
      alert('Saved data imported successfully.');
    } catch (error) {
      alert('Could not import this file. Please choose a valid AI Compass export JSON.');
    }
  };
  reader.readAsText(file);
}

async function initSavedToolsPage() {
  const page = document.getElementById('saved-tools-page');
  if (!page) return;

  await renderLocalMemorySections();
  renderSavedStacksSection();

  const exportBtn = document.getElementById('export-saved-tools');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportSavedData);
  }

  const importBtn = document.getElementById('import-saved-tools');
  const importInput = document.getElementById('import-saved-tools-file');
  if (importBtn && importInput) {
    importBtn.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', () => importSavedData(importInput.files && importInput.files[0]));
  }
}

function applyTheme(themeName) {
  const theme = themeName === 'light' ? 'light' : 'dark';
  document.documentElement.classList.remove('light', 'dark');
  document.documentElement.classList.add(theme);
  if (document.body) {
    document.body.classList.remove('light-mode', 'dark-mode');
    document.body.classList.add(theme === 'light' ? 'light-mode' : 'dark-mode');
  }
  localStorage.setItem('theme', theme);
  updateThemeToggleUI(theme);
}

function updateThemeToggleUI(themeName) {
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;
  toggle.textContent = themeName === 'light' ? '☀ Light' : '🌙 Dark';
  toggle.setAttribute('aria-pressed', String(themeName === 'light'));
}

function toggleTheme() {
  const current = document.documentElement.classList.contains('light') ? 'light' : 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
}

function normalizeCategory(value) {
  return String(value || '').trim().toLowerCase();
}

function getPriceModel(tool) {
  return String(tool.price || tool.pricing_model || 'paid').toLowerCase();
}

function getToolDescription(tool) {
  return tool.description || tool.desc || '';
}

function getToolTagline(tool) {
  return tool.tagline || '';
}

function getToolTags(tool) {
  return Array.isArray(tool.tags) ? tool.tags : [];
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function regexEscape(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightQuery(text, query) {
  const raw = String(text || '');
  const tokens = String(query || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  if (!tokens.length) return escapeHtml(raw);

  let html = escapeHtml(raw);
  const unique = [...new Set(tokens)].sort((a, b) => b.length - a.length);
  unique.forEach((token) => {
    const pattern = new RegExp(`(${regexEscape(token)})`, 'ig');
    html = html.replace(pattern, '<mark>$1</mark>');
  });
  return html;
}

function priceLabel(model) {
  if (model === 'free') return 'Free';
  if (model === 'freemium') return 'Freemium';
  return 'Paid';
}

function priceBadgeClass(model) {
  if (model === 'free') return 'badge-free';
  if (model === 'freemium') return 'badge-freemium';
  return 'badge-paid';
}

function getToolKey(tool) {
  return String(tool.tool_key || tool.id || '');
}

function getToolIcon(tool) {
  return String(tool.icon_url || tool.icon || '').trim();
}

function renderToolIcon(tool, sizeClasses = 'w-8 h-8', radiusClasses = 'rounded-md') {
  const icon = getToolIcon(tool);
  const initial = escapeHtml(((tool.name || 'A').trim().charAt(0) || 'A').toUpperCase());
  const imgHiddenClass = icon ? '' : ' hidden';
  const fallbackHiddenClass = icon ? ' hidden' : '';

  return `
    <div class="${sizeClasses} ${radiusClasses} overflow-hidden border border-white/10 flex items-center justify-center bg-white/5 flex-shrink-0">
      <img src="${escapeHtml(icon)}" alt="${escapeHtml(tool.name || 'Tool')} logo" class="w-full h-full object-contain bg-white p-1 rounded-lg${imgHiddenClass}" onerror="this.classList.add('hidden'); this.nextElementSibling.classList.remove('hidden');" />
      <div class="w-full h-full flex${fallbackHiddenClass} items-center justify-center text-white text-xs font-semibold bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg">${initial}</div>
    </div>
  `;
}

async function fetchTools() {
  const params = new URLSearchParams({
    sort: state.sort,
    student_mode: state.studentMode ? 'true' : 'false',
  });
  const response = await fetch(`/api/tools?${params.toString()}`);
  if (!response.ok) throw new Error('Failed to fetch tools');
  return response.json();
}

async function fetchTrendingTools() {
  const params = new URLSearchParams({
    sort: state.sort,
    student_mode: state.studentMode ? 'true' : 'false',
  });
  const response = await fetch(`/api/tools/trending?${params.toString()}`);
  if (!response.ok) throw new Error('Failed to fetch trending tools');
  return response.json();
}

async function fetchSearchSuggestions(query, options = {}) {
  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
    signal: options.signal,
  });
  if (!response.ok) throw new Error('Failed to fetch search suggestions');
  return response.json();
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': config.csrfToken,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error('Request failed');
  }

  return response.json();
}

function getFilteredTools() {
  const query = state.search.trim().toLowerCase();

  return allTools.filter((tool) => {
    const category = normalizeCategory(tool.category);
    const model = getPriceModel(tool);
    const desc = getToolDescription(tool).toLowerCase();
    const tagline = getToolTagline(tool).toLowerCase();
    const name = String(tool.name || '').toLowerCase();
    const tags = getToolTags(tool).join(' ').toLowerCase();

    if (state.category === 'trending' && !tool.trending) return false;
    if (state.category === 'free' && model !== 'free') return false;
    if (!['all', 'trending', 'free'].includes(state.category) && category !== state.category) return false;
    if (state.price !== 'all' && model !== state.price) return false;

    if (query) {
      const matches = name.includes(query) || tagline.includes(query) || desc.includes(query) || category.includes(query) || tags.includes(query);
      if (!matches) return false;
    }

    return true;
  });
}

function renderTools(tools, totalFiltered = tools.length) {
  const grid = document.getElementById('tools-grid');
  const empty = document.getElementById('empty-state');
  const count = document.getElementById('visible-count');
  const total = document.getElementById('total-count');
  const totalPlus = document.getElementById('total-plus');
  if (!grid || !empty || !count) return;

  count.textContent = String(tools.length);
  if (total) total.textContent = String(allTools.length);
  if (totalPlus) totalPlus.textContent = `${allTools.length}+`;

  if (!totalFiltered) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  grid.innerHTML = tools.map((tool, index) => {
    const key = getToolKey(tool);
    const model = getPriceModel(tool);
    const displayPrice = studentMode && tool.studentPerk ? tool.studentPerk : (tool.pricingDetail || tool.price || 'Pricing unavailable');
    const bestFor = tool.bestFor || tool.subcategory || 'General use';
    const isFavorite = favorites.has(key);
    const isCompared = selectedCompare.has(key);
    const studentBadges = state.studentMode ? `
      <div class="flex items-center gap-1.5 flex-wrap">
        ${tool.studentPerk ? '<span class="text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 rounded-md px-2 py-0.5">🎓 Student Perk</span>' : ''}
        ${tool.uniHack ? '<span class="text-[10px] bg-sky-500/10 text-sky-300 border border-sky-500/20 rounded-md px-2 py-0.5">🏫 University Hack</span>' : ''}
      </div>
    ` : '';
    const trustBadges = `
      <div class="flex items-center gap-1.5 flex-wrap">
        ${tool.verified ? '<span class="text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 rounded-md px-2 py-0.5">✔ Verified</span>' : ''}
        ${tool.recently_updated ? '<span class="text-[10px] bg-sky-500/10 text-sky-300 border border-sky-500/20 rounded-md px-2 py-0.5">🔄 Recently Updated</span>' : ''}
        ${tool.student_friendly ? '<span class="text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded-md px-2 py-0.5">🎓 Student Friendly</span>' : ''}
        ${tool.trending_this_week ? '<span class="text-[10px] bg-rose-500/10 text-rose-300 border border-rose-500/20 rounded-md px-2 py-0.5">🔥 Trending this week</span>' : ''}
        ${tool.is_new ? '<span class="text-[10px] bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 rounded-md px-2 py-0.5">🆕 Newly added</span>' : ''}
      </div>
    `;

    return `
      <article class="tool-card glass glass-hover rounded-2xl p-4 flex flex-col gap-3 border border-white/8 hover:scale-[1.02] hover:border-blue-500 hover:shadow-lg transition-all duration-200" style="animation-delay:${index * 0.04}s">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0 flex items-start gap-2">
            ${renderToolIcon(tool, 'w-8 h-8', 'rounded-md')}
            <div>
              <h3 class="text-sm font-700 text-zinc-100" style="font-weight:700">${escapeHtml(tool.name || 'Unnamed Tool')}</h3>
              <p class="text-xs text-zinc-500 mt-0.5 line-clamp-2">${escapeHtml(getToolTagline(tool))}</p>
            </div>
          </div>
          <div class="flex items-center gap-1.5">
            ${tool.trending ? '<span class="text-[9px] font-mono bg-white/6 border border-white/10 text-zinc-400 px-1.5 py-0.5 rounded-full">Hot</span>' : ''}
            <span class="text-[9px] font-mono px-1.5 py-0.5 rounded-full ${priceBadgeClass(model)}">${priceLabel(model)}</span>
          </div>
        </div>

        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="text-[10px] font-mono brand-dim-bg brand-text px-2 py-0.5 rounded-md">${escapeHtml(tool.category || 'other')}</span>
          <span class="text-[10px] font-mono bg-white/5 text-zinc-400 px-2 py-0.5 rounded-md">${escapeHtml(bestFor)}</span>
        </div>

        <div class="text-[10px] text-zinc-500 line-clamp-1">Tags: ${escapeHtml(getToolTags(tool).slice(0, 3).join(' • ') || 'general')}</div>

        <p class="text-xs text-zinc-400 leading-relaxed line-clamp-2">${escapeHtml(getToolDescription(tool))}</p>
        ${studentBadges}
        ${trustBadges}

        <div class="mt-auto pt-2 border-t border-white/5 space-y-2">
          <div class="text-[10px] text-zinc-500 font-mono line-clamp-2">${escapeHtml(displayPrice)}</div>
          <div class="text-[10px] text-zinc-500 font-mono">${tool.last_updated_label ? `Updated ${escapeHtml(tool.last_updated_label)}` : ''}${tool.activity_today ? ` · 🔥 ${escapeHtml(String(tool.activity_today))} students viewed today` : ''}</div>
          <div class="flex items-center gap-2 flex-wrap">
            <a href="/tool/${escapeHtml(key)}" class="text-[10px] brand-text glass rounded-lg px-2.5 py-1 transition-all border border-white/8 hover:border-white/15">View Details</a>
            ${config.isAuthenticated
              ? `<button class="text-[10px] rounded-lg px-2.5 py-1 transition-all border ${isFavorite ? 'border-amber-400/30 text-amber-300 bg-amber-500/10' : 'border-white/10 text-zinc-300 bg-white/5'}" onclick="toggleFavorite('${escapeHtml(key)}')">★ Favorite</button>`
              : `<a href="/login?next=${encodeURIComponent(`/tool/${key}`)}" class="text-[10px] rounded-lg px-2.5 py-1 transition-all border border-white/10 text-zinc-300 bg-white/5">Login to save</a>`}
            <button class="text-[10px] rounded-lg px-2.5 py-1 transition-all border ${isCompared ? 'border-blue-400/30 text-blue-300 bg-blue-500/10' : 'border-white/10 text-zinc-300 bg-white/5'}" onclick="toggleCompare('${escapeHtml(key)}')">Compare</button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

function updateLoadMoreControls(totalFiltered) {
  try {
    const wrapper = document.getElementById('tools-load-more-wrap');
    const text = document.getElementById('tools-loaded-text');
    const button = document.getElementById('tools-load-more');
    if (!wrapper || !text || !button) return;

    if (!totalFiltered) {
      wrapper.classList.add('hidden');
      return;
    }

    const shown = Math.min(state.visibleLimit, totalFiltered);
    const remaining = Math.max(0, totalFiltered - shown);

    text.textContent = `Showing ${shown} of ${totalFiltered} tools`;

    if (!remaining) {
      wrapper.classList.add('hidden');
      return;
    }

    button.textContent = `Show ${Math.min(TOOL_PAGE_SIZE, remaining)} More Tools`;
    wrapper.classList.remove('hidden');
  } catch (error) {
    console.error('updateLoadMoreControls failed:', error);
  }
}

function renderCategorySpotlight(filteredTools) {
  try {
    const section = document.getElementById('category-spotlight-section');
    const title = document.getElementById('category-spotlight-title');
    const count = document.getElementById('category-spotlight-count');
    const grid = document.getElementById('category-spotlight-grid');
    if (!section || !title || !count || !grid) return;

    const hasContextFilter = state.category !== 'all' || state.price !== 'all' || state.search.trim().length > 0;
    if (!hasContextFilter) {
      section.classList.add('hidden');
      grid.innerHTML = '';
      return;
    }

    const topPicks = filteredTools.slice(0, 6);
    if (!topPicks.length) {
      section.classList.add('hidden');
      grid.innerHTML = '';
      return;
    }

    const categoryText = state.category === 'all'
      ? 'Filtered Results'
      : (CATEGORY_LABELS[state.category] || state.category.replace(/(^|\s)\w/g, (m) => m.toUpperCase()));
    title.textContent = `Top Picks: ${categoryText}`;
    count.textContent = `${topPicks.length} highlighted`;

    grid.innerHTML = topPicks.map((tool) => {
      const key = getToolKey(tool);
      return `
        <a href="/tool/${escapeHtml(key)}" class="glass rounded-xl p-3 hover:border-cyan-400/30 transition-colors">
          <div class="flex items-center gap-2">
            ${renderToolIcon(tool, 'w-8 h-8', 'rounded-lg')}
            <div class="min-w-0">
              <div class="text-sm text-zinc-100 truncate" style="font-weight:600">${escapeHtml(tool.name || 'Unnamed Tool')}</div>
              <div class="text-[11px] text-zinc-500 truncate">${escapeHtml(tool.category || 'general')}</div>
            </div>
          </div>
          <p class="text-xs text-zinc-400 mt-2 line-clamp-2">${escapeHtml(getToolTagline(tool) || getToolDescription(tool))}</p>
        </a>
      `;
    }).join('');

    section.classList.remove('hidden');
  } catch (error) {
    console.error('renderCategorySpotlight failed:', error);
  }
}

function updateTopSections(filteredTools) {
  try {
    const browseSection = document.getElementById('browse-category-section');
    const newSection = document.getElementById('new-tools-section');
    const trendingSection = document.getElementById('trending-tools-section');

    const hasContextFilter = state.category !== 'all' || state.price !== 'all' || state.search.trim().length > 0;
    if (browseSection) browseSection.classList.toggle('hidden', hasContextFilter);
    if (newSection) newSection.classList.toggle('hidden', hasContextFilter);
    if (trendingSection) trendingSection.classList.toggle('hidden', hasContextFilter);

    renderCategorySpotlight(filteredTools);
  } catch (error) {
    console.error('updateTopSections failed:', error);
  }
}

function renderSkeletonTools(count = 6) {
  const grid = document.getElementById('tools-grid');
  const empty = document.getElementById('empty-state');
  if (!grid) return;
  if (empty) empty.classList.add('hidden');

  grid.innerHTML = Array.from({ length: count }).map(() => `
    <article class="glass rounded-2xl p-4 border border-white/8 animate-pulse">
      <div class="flex items-start gap-3">
        <div class="w-8 h-8 rounded-md bg-gray-700/40"></div>
        <div class="flex-1 space-y-2">
          <div class="h-3 w-2/3 rounded-lg bg-gray-700/40"></div>
          <div class="h-2.5 w-full rounded-lg bg-gray-700/40"></div>
        </div>
      </div>
      <div class="mt-3 h-2.5 w-1/2 rounded-lg bg-gray-700/40"></div>
      <div class="mt-2 h-2.5 w-full rounded-lg bg-gray-700/40"></div>
      <div class="mt-2 h-2.5 w-5/6 rounded-lg bg-gray-700/40"></div>
      <div class="mt-4 h-8 w-full rounded-lg bg-gray-700/40"></div>
    </article>
  `).join('');
}

function renderTrendingSection() {
  const section = document.getElementById('trending-section');
  const grid = document.getElementById('trending-grid');
  if (!section || !grid) return;

  const source = trendingTools.length ? trendingTools : allTools.filter((tool) => tool.trending || tool.trending_this_week).slice(0, 12);
  const daySeed = new Date().getDate();
  const ranked = source
    .map((tool) => ({
      score: (Number(tool.rating || 0) * 10) + Number(tool.activity_today || 0) + (((_stableHash(tool.tool_key || tool.id || tool.name) + daySeed) % 9) * 0.1),
      tool,
    }))
    .sort((a, b) => b.score - a.score)
    .map((item) => item.tool);
  const topSix = ranked.slice(0, 6);
  if (!topSix.length) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  grid.innerHTML = topSix.map((tool, index) => {
    const key = getToolKey(tool);
    const text = studentMode && tool.studentPerk ? tool.studentPerk : getToolTagline(tool);
    const rank = index + 1;
    return `
      <button class="rounded-xl p-3 text-left transition-all border border-white/10 hover:border-cyan-300/30 hover:bg-white/10 bg-black/20" onclick="openModal('${escapeHtml(key)}')">
        <div class="flex items-center gap-2.5">
          <div class="w-7 h-7 rounded-lg bg-cyan-400/10 border border-cyan-300/20 text-cyan-200 text-xs font-mono flex items-center justify-center">#${rank}</div>
          ${renderToolIcon(tool, 'w-6 h-6', 'rounded-md')}
          <div class="text-xs text-zinc-100 font-600 line-clamp-1" style="font-weight:600">${escapeHtml(tool.name || 'Unnamed Tool')}</div>
        </div>
        <div class="text-[11px] text-zinc-500 mt-1 line-clamp-2">${escapeHtml(text)}</div>
      </button>
    `;
  }).join('');
}

function _stableHash(value) {
  return String(value || '').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
}

function hideSearchSuggestions() {
  const box = document.getElementById('search-suggestions');
  if (!box) return;
  box.classList.add('hidden');
  box.innerHTML = '';
}

function renderSearchSuggestions(results, query) {
  const box = document.getElementById('search-suggestions');
  if (!box) return;

  if (!Array.isArray(results) || !results.length) {
    box.innerHTML = '<div class="px-3 py-2 text-xs text-zinc-500">No matching tools found.</div>';
    box.classList.remove('hidden');
    return;
  }

  const visibleResults = results.slice(0, 6);

  box.innerHTML = visibleResults.map((tool) => {
    const slug = escapeHtml(tool.slug || '');
    const nameHtml = highlightQuery(tool.name || '', query);
    const descHtml = highlightQuery(tool.description || '', query);
    const categoryHtml = highlightQuery(tool.category || 'general', query);
    const tagText = Array.isArray(tool.tags) ? tool.tags.slice(0, 2).join(' • ') : '';
    const tagHtml = highlightQuery(tagText, query);
    return `
      <a href="/tool/${slug}" class="block rounded-lg px-2.5 py-2 hover:bg-white/6 transition-colors">
        <div class="flex items-start gap-2.5">
          ${renderToolIcon(tool, 'w-8 h-8', 'rounded-md')}
          <div class="min-w-0 flex-1">
            <div class="text-sm text-zinc-100 truncate">${nameHtml}</div>
            <div class="text-[11px] text-zinc-500 truncate">${categoryHtml}${tagText ? ' · ' + tagHtml : ''}</div>
            <div class="text-[11px] text-zinc-400 line-clamp-1 mt-0.5">${descHtml}</div>
          </div>
        </div>
      </a>
    `;
  }).join('');

  if (results.length > visibleResults.length) {
    box.innerHTML += `<div class="px-3 py-2 text-[11px] text-zinc-500 border-t border-white/8">Showing ${visibleResults.length} of ${results.length} matches. Keep typing to narrow results.</div>`;
  }

  box.classList.remove('hidden');
}

function requestSearchSuggestions(query) {
  const trimmed = String(query || '').trim();
  if (!trimmed || trimmed.length < 2) {
    hideSearchSuggestions();
    return;
  }

  if (searchSuggestTimer) clearTimeout(searchSuggestTimer);
  searchSuggestTimer = setTimeout(async () => {
    try {
      if (searchSuggestController) searchSuggestController.abort();
      searchSuggestController = new AbortController();
      const results = await fetchSearchSuggestions(trimmed, { signal: searchSuggestController.signal });
      renderSearchSuggestions(results, trimmed);
    } catch (error) {
      if (error.name !== 'AbortError') {
        hideSearchSuggestions();
      }
    }
  }, 120);
}

function updateCategoryCounts() {
  const counters = document.querySelectorAll('[data-count-for]');
  const byCategory = {};
  let freeCount = 0;

  allTools.forEach((tool) => {
    const category = normalizeCategory(tool.category);
    byCategory[category] = (byCategory[category] || 0) + 1;
    if (getPriceModel(tool) === 'free') freeCount += 1;
  });

  counters.forEach((el) => {
    const key = el.getAttribute('data-count-for');
    if (key === 'all') {
      el.textContent = `(${allTools.length})`;
      return;
    }
    if (key === 'free') {
      el.textContent = `(${freeCount})`;
      return;
    }
    el.textContent = `(${byCategory[key] || 0})`;
  });
}

function toggleSortMenu() {
  try {
    const menu = document.getElementById('sort-menu');
    if (!menu) return;
    menu.classList.toggle('hidden');
  } catch (error) {
    console.error('toggleSortMenu failed:', error);
  }
}

function closeSortMenu() {
  try {
    const menu = document.getElementById('sort-menu');
    if (menu) menu.classList.add('hidden');
  } catch (error) {
    console.error('closeSortMenu failed:', error);
  }
}

function updateSortLabel() {
  try {
    const title = SORT_LABELS[state.sort] || 'Trending';

    const label = document.getElementById('sort-label');
    if (label) label.textContent = `Sort: ${title}`;

    const select = document.getElementById('sort-select');
    if (select && select.value !== state.sort) {
      select.value = state.sort;
    }

    document.querySelectorAll('.sort-option').forEach((option) => {
      const isActive = option.getAttribute('data-sort-value') === state.sort;
      option.classList.toggle('bg-zinc-700/80', isActive);
      option.classList.toggle('text-zinc-100', isActive);
    });
  } catch (error) {
    console.error('updateSortLabel failed:', error);
  }
}

function updateCompareFloatingButton() {
  const button = document.getElementById('compare-floating-btn');
  if (!button) return;

  const count = selectedCompare.size;
  const span = button.querySelector('span');
  if (span) span.textContent = `Compare Tools (${count})`;
  if (count >= 2) {
    button.classList.remove('hidden');
    button.classList.add('flex');
  } else {
    button.classList.add('hidden');
    button.classList.remove('flex');
  }
}

function applyAndRender() {
  const filtered = getFilteredTools();
  const visible = filtered.slice(0, state.visibleLimit);
  renderTools(visible, filtered.length);
  updateLoadMoreControls(filtered.length);
  updateTopSections(filtered);
  updateCompareFloatingButton();
}

function updatePageTitle(cat) {
  const titles = {
    all: 'All AI Tools',
    writing: 'Writing & Docs',
    coding: 'Coding Tools',
    image: 'Image Generation',
    video: 'Video Tools',
    research: 'Research Tools',
    productivity: 'Productivity Tools',
    trending: 'Trending AI Tools',
    free: 'Free AI Tools',
  };
  const title = document.getElementById('page-title');
  if (title) title.textContent = titles[cat] || 'AI Tools';
}

function filterCategory(category) {
  try {
    state.category = category;
    state.visibleLimit = TOOL_PAGE_SIZE;
    saveUserMemoryPrefs();
    document.querySelectorAll('.sidebar-item, .sidebar-category').forEach((el) => el.classList.remove('active'));
    const activeBtn = document.querySelector(`[data-cat="${category}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    updatePageTitle(category);
    applyAndRender();
    if (window.innerWidth < 768) closeSidebar();
  } catch (error) {
    console.error('filterCategory failed:', error);
  }
}

function setPriceFilter(price) {
  state.price = price;
  state.visibleLimit = TOOL_PAGE_SIZE;
  saveUserMemoryPrefs();
  document.querySelectorAll('[data-pf]').forEach((el) => el.classList.remove('active'));
  const activeBtn = document.querySelector(`[data-pf="${price}"]`);
  if (activeBtn) activeBtn.classList.add('active');
  applyAndRender();
}

function searchTools(query) {
  state.search = String(query || '');
  state.visibleLimit = TOOL_PAGE_SIZE;
  rememberSearchQuery(state.search);
  saveUserMemoryPrefs();
  applyAndRender();
  requestSearchSuggestions(query);
}

function updateHeroCopy() {
  const chip = document.getElementById('hero-chip');
  const title = document.getElementById('hero-title');
  const subtitle = document.getElementById('hero-subtitle');

  if (!chip || !title || !subtitle) return;

  if (studentMode) {
    chip.textContent = 'Student-first AI discovery platform';
    title.textContent = 'Find the Best AI Tools for Students';
    subtitle.textContent = `Discover ${allTools.length || 0} AI tools for writing, coding, research, and productivity.`;
    return;
  }

  chip.textContent = 'AI discovery platform';
  title.textContent = 'Find the Best AI Tools';
  subtitle.textContent = `Discover ${allTools.length || 0} AI tools for writing, coding, research, and productivity.`;
}

function updateStudentModeUI(isEnabled) {
  // Update internal state
  studentMode = isEnabled;
  state.studentMode = isEnabled;
  
  // Save to localStorage for persistence (keep both keys for compatibility)
  localStorage.setItem('student_mode', String(isEnabled));
  localStorage.setItem('ai_compass_student_mode', String(isEnabled));
  
  // Update body class for CSS styling
  document.body.classList.toggle('student-mode', isEnabled);
  
  // Update toggle button UI
  const studentToggle = document.getElementById('student-mode-toggle') || document.getElementById('studentToggle');
  if (studentToggle) {
    studentToggle.classList.toggle('active', isEnabled);
    studentToggle.setAttribute('aria-pressed', String(isEnabled));
    studentToggle.setAttribute('aria-checked', String(isEnabled));
    studentToggle.classList.toggle('text-emerald-300', isEnabled);
    studentToggle.classList.toggle('border-emerald-500/40', isEnabled);
    studentToggle.classList.toggle('bg-emerald-500/15', isEnabled);
    studentToggle.classList.toggle('hover:bg-emerald-500/20', isEnabled);
    studentToggle.classList.toggle('bg-white/5', !isEnabled);
    studentToggle.classList.toggle('border-white/10', !isEnabled);
    studentToggle.classList.toggle('text-zinc-200', !isEnabled);
    studentToggle.classList.toggle('hover:bg-white/10', !isEnabled);

    const track = studentToggle.querySelector('.student-toggle-track');
    if (track) {
      track.classList.toggle('bg-emerald-500/35', isEnabled);
      track.classList.toggle('border-emerald-400/50', isEnabled);
      track.classList.toggle('bg-zinc-700/40', !isEnabled);
      track.classList.toggle('border-white/15', !isEnabled);
    }

    const thumb = studentToggle.querySelector('.student-toggle-thumb');
    if (thumb) {
      thumb.classList.toggle('translate-x-4', isEnabled);
      thumb.classList.toggle('translate-x-0.5', !isEnabled);
    }
  }

  const studentStatus = document.getElementById('student-mode-status');
  if (studentStatus) {
    studentStatus.classList.toggle('hidden', !isEnabled);
  }

  const wizardStudentMode = document.getElementById('wizardStudentMode');
  if (wizardStudentMode && wizardStudentMode.checked !== isEnabled) {
    wizardStudentMode.checked = isEnabled;
  }

  const wizardStudentModeInput = document.getElementById('studentModeInput');
  if (wizardStudentModeInput) {
    wizardStudentModeInput.value = isEnabled ? '1' : '';
  }

  saveUserMemoryPrefs();
}

function showStudentModeToast(message, isEnabled) {
  let toast = document.getElementById('student-mode-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'student-mode-toast';
    toast.className = 'student-toast';
    document.body.appendChild(toast);
  }

  // Create toast content with icon
  const icon = isEnabled ? '✨' : '📚';
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  
  toast.classList.remove('border-emerald-500/40', 'bg-emerald-500/15', 'text-emerald-100', 'dismiss');
  if (isEnabled) {
    toast.classList.add('border-emerald-500/40', 'bg-emerald-500/15', 'text-emerald-100');
  }

  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0) translateX(0) scale(1)';

  if (window.studentModeToastTimer) {
    clearTimeout(window.studentModeToastTimer);
  }

  window.studentModeToastTimer = setTimeout(() => {
    const currentToast = document.getElementById('student-mode-toast');
    if (!currentToast) return;
    currentToast.classList.add('dismiss');
  }, 3000);
}

function shouldReloadForStudentMode(pathname) {
  const paths = [
    '/tools',
    '/dashboard',
    '/compare',
    '/compare-tools',
    '/weekly-ai-tools',
    '/submit-tool',
  ];
  return paths.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function toggleStudentMode() {
  try {
    // Toggle the state
    const newState = !studentMode;
    
    // Update UI immediately (no page reload)
    updateStudentModeUI(newState);
    
    showStudentModeToast(
      newState
        ? 'Student mode enabled: prioritizing free tools and student perks'
        : 'Student mode disabled: showing full catalog',
      newState,
    );

    // Sync with backend (explicit setter endpoint)
    fetch('/set-student-mode', {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ enabled: newState })
    })
      .then(response => {
        if (response.ok) return response;
        // Backward compatibility fallback
        return fetch('/toggle-student-mode', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ enabled: newState })
        });
      })
      .then(() => {
        const path = window.location.pathname || '/';

        if (shouldReloadForStudentMode(path)) {
          setTimeout(() => {
            window.location.reload();
          }, 260);
          return;
        }

        const hasDynamicTools = !!document.getElementById('tools-grid') || !!document.getElementById('trending-grid');
        if (hasDynamicTools) {
          refreshData();
        } else {
          updateHeroCopy();
        }
      })
      .catch(error => {
        console.error('Failed to sync Student Mode with server:', error);

        const path = window.location.pathname || '/';
        if (shouldReloadForStudentMode(path)) {
          setTimeout(() => {
            window.location.reload();
          }, 260);
          return;
        }

        const hasDynamicTools = !!document.getElementById('tools-grid') || !!document.getElementById('trending-grid');
        if (hasDynamicTools) {
          refreshData();
        } else {
          updateHeroCopy();
        }
      });
  } catch (error) {
    console.error('toggleStudentMode error:', error);
  }
}

function setSort(sortType) {
  try {
    state.sort = sortType;
    state.visibleLimit = TOOL_PAGE_SIZE;
    localStorage.setItem('ai_compass_sort', sortType);
    saveUserMemoryPrefs();
    updateSortLabel();
    closeSortMenu();
    refreshData();
  } catch (error) {
    console.error('setSort failed:', error);
  }
}

async function refreshData() {
  try {
    renderSkeletonTools(6);

    const [toolsData, trendingData] = await Promise.all([
      fetchTools(),
      fetchTrendingTools().catch(() => []),
    ]);

    allTools = Array.isArray(toolsData) ? toolsData : [];
    trendingTools = Array.isArray(trendingData) ? trendingData : [];
    state.visibleLimit = TOOL_PAGE_SIZE;

    updateCategoryCounts();
    applyAndRender();
    updateHeroCopy();
    renderLocalMemorySections();

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  } catch (error) {
    const grid = document.getElementById('tools-grid');
    if (grid) {
      grid.innerHTML = '<div class="col-span-full glass rounded-xl p-4 text-sm text-red-300">Unable to load tools. Please try again.</div>';
    }
    console.error(error);
  }
}

async function toggleFavorite(toolKey) {
  if (!config.isAuthenticated) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login?next=${next}`;
    return;
  }

  try {
    const result = await postJson('/api/favorite', { tool_id: toolKey });
    if (result.favorited) {
      favorites.add(toolKey);
      rememberSavedTool(toolKey);
    } else {
      favorites.delete(toolKey);
      forgetSavedTool(toolKey);
    }
    applyAndRender();
  } catch (error) {
    console.error(error);
  }
}

function toggleCompare(toolKey) {
  if (selectedCompare.has(toolKey)) {
    selectedCompare.delete(toolKey);
  } else if (selectedCompare.size < 3) {
    selectedCompare.add(toolKey);
  }
  applyAndRender();
}

function goToComparePage() {
  if (selectedCompare.size < 2) return;
  const ids = Array.from(selectedCompare).slice(0, 3);
  const slug = ids.join('-vs-');
  const params = new URLSearchParams({
    sort: state.sort,
    student_mode: state.studentMode ? 'true' : 'false',
  });
  window.location.href = `/compare/${encodeURIComponent(slug)}?${params.toString()}`;
}

async function trackToolView(toolKey) {
  try {
    await postJson('/api/view', { tool_id: toolKey });
    rememberViewedTool(toolKey);
  } catch (error) {
    console.error(error);
  }
}

function openModal(toolId) {
  const tool = allTools.find((item) => getToolKey(item) === String(toolId));
  if (!tool) return;

  const modalTitle = document.getElementById('modal-title');
  const modalTagline = document.getElementById('modal-tagline');
  const modalDesc = document.getElementById('modal-desc');
  const modalFeatures = document.getElementById('modal-features');
  const modalBestFor = document.getElementById('modal-bestfor');
  const modalPricingDetail = document.getElementById('modal-pricing-detail');
  const modalLink = document.getElementById('modal-link');
  const modalPrice = document.getElementById('modal-price');
  const modalIcon = document.getElementById('modal-icon');
  const modalStudent = document.getElementById('modal-student');
  const modalUniHack = document.getElementById('modal-uni-hack');
  const modalStudentPerk = document.getElementById('modal-student-perk');

  modalTitle.textContent = tool.name || 'Tool';
  modalTagline.textContent = getToolTagline(tool);
  modalDesc.textContent = getToolDescription(tool);
  modalBestFor.textContent = tool.bestFor || tool.subcategory || 'General use';
  modalPricingDetail.textContent = tool.pricingDetail || tool.standard_price || tool.price || 'Pricing unavailable';
  modalLink.href = tool.link || tool.website || '#';
  modalIcon.innerHTML = renderToolIcon(tool, 'w-12 h-12', 'rounded-xl');

  const model = getPriceModel(tool);
  modalPrice.textContent = studentMode && tool.studentPerk ? 'Student Perk' : priceLabel(model);
  modalPrice.className = `text-[10px] font-mono px-2 py-0.5 rounded-full ${studentMode && tool.studentPerk ? 'badge-free' : priceBadgeClass(model)}`;

  const features = Array.isArray(tool.features) ? tool.features : [];
  modalFeatures.innerHTML = features.length
    ? features.map((feature) => `<li class="flex items-center gap-2 text-xs text-zinc-400"><i data-lucide="check" class="w-3 h-3 brand-text flex-shrink-0"></i>${escapeHtml(feature)}</li>`).join('')
    : '<li class="text-xs text-zinc-500">No feature list available yet.</li>';

  const hasStudentDetails = studentMode && (tool.studentPerk || tool.uniHack);
  modalStudent.style.display = hasStudentDetails ? 'block' : 'none';
  modalStudent.classList.toggle('ring-2', hasStudentDetails);
  modalStudent.classList.toggle('ring-emerald-400/30', hasStudentDetails);
  modalUniHack.textContent = tool.uniHack || 'No university hack available for this tool yet.';
  modalStudentPerk.textContent = tool.studentPerk || 'No student perk listed.';

  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  trackToolView(getToolKey(tool));

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.add('hidden');
  document.body.style.overflow = '';
}

function toggleSidebar() {
  try {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mob-overlay');
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('hidden');
  } catch (error) {
    console.error('toggleSidebar failed:', error);
  }
}

function closeSidebar() {
  try {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mob-overlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.add('hidden');
  } catch (error) {
    console.error('closeSidebar failed:', error);
  }
}

let toolsPageBound = false;

function updateQueryParam(key, value) {
  const url = new URL(window.location.href);

  if (value === null || value === undefined || value === '' || value === 'all') {
    url.searchParams.delete(key);
  } else {
    url.searchParams.set(key, value);
  }

  if (key !== 'page') {
    url.searchParams.set('page', '1');
  }

  if (key === 'q') {
    rememberSearchQuery(value);
  }

  window.location = url;
}

function debounce(fn, wait = 250) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function initFilters() {
  document.addEventListener('click', (event) => {
    const categoryButton = event.target.closest('.category-btn');
    if (categoryButton) {
      const category = categoryButton.dataset.category;
      updateQueryParam('category', category);
      return;
    }

    const clearChip = event.target.closest('[data-clear-key]');
    if (clearChip) {
      const key = clearChip.getAttribute('data-clear-key');
      if (key === 'sort') {
        updateQueryParam('sort', 'trending');
      } else {
        updateQueryParam(key, '');
      }
    }
  });
}

function initSort() {
  const sortSelect = document.getElementById('sort-select');
  if (!sortSelect) return;

  sortSelect.addEventListener('change', (event) => {
    const selected = String(event.target.value || 'trending').trim().toLowerCase();
    updateQueryParam('sort', selected);
  });
}

function initPagination() {
  const pagination = document.querySelector('nav[aria-label="Pagination"]');
  if (!pagination) return;

  pagination.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link) return;
    const url = new URL(link.href);
    if (!url.searchParams.get('page')) {
      url.searchParams.set('page', '1');
      link.href = url.toString();
    }
  });
}

function initButtonLoadingState() {
  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const submitter = event.submitter;
    if (submitter && submitter.tagName === 'BUTTON') {
      submitter.classList.add('loading');
    }
  }, true);
}

function initUI() {
  const searchInput = document.getElementById('tools-search-input');
  const searchForm = document.getElementById('tools-search-form');
  const skeleton = document.getElementById('tools-skeleton');
  const grid = document.getElementById('tools-grid');

  if (grid) {
    grid.classList.remove('tool-grid-ready');
    grid.classList.add('tool-grid-loading');
    window.requestAnimationFrame(() => {
      if (skeleton) skeleton.classList.add('hidden');
      grid.classList.remove('tool-grid-loading');
      grid.classList.add('tool-grid-ready');
    });
  } else if (skeleton) {
    skeleton.classList.add('hidden');
  }

  if (!searchInput || !searchForm) return;

  const submitSearch = debounce(() => {
    const query = String(searchInput.value || '').trim();
    updateQueryParam('q', query);
  }, 300);

  searchInput.addEventListener('input', () => {
    submitSearch();
  });

  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = String(searchInput.value || '').trim();
    updateQueryParam('q', query);
  });
}

function initToolsPage() {
  if (toolsPageBound) return;
  toolsPageBound = true;

  const params = new URLSearchParams(window.location.search);
  const prefs = readLocalObject(LOCAL_KEYS.userPrefs);
  prefs.preferredCategory = params.get('category') || prefs.preferredCategory || 'all';
  prefs.lastFilters = {
    category: params.get('category') || 'all',
    price: params.get('pricing') || 'all',
    sort: params.get('sort') || 'popular',
    search: params.get('q') || '',
  };
  prefs.studentMode = String(localStorage.getItem('student_mode') || '').toLowerCase() === 'true';
  prefs.updatedAt = new Date().toISOString();
  writeLocalObject(LOCAL_KEYS.userPrefs, prefs);

  initFilters();
  initSort();
  initPagination();
  initUI();
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    initButtonLoadingState();

    const persistedTheme = localStorage.getItem('theme') || (document.documentElement.classList.contains('light') ? 'light' : 'dark');
    applyTheme(persistedTheme);

    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', toggleTheme);
    }

    const topSearchForm = document.querySelector('header form[action="/tools"]');
    const topSearchInput = document.getElementById('search-input');
    if (topSearchForm && topSearchInput) {
      topSearchForm.addEventListener('submit', () => {
        rememberSearchQuery(topSearchInput.value || '');
      });
    }

    const profileRoot = document.querySelector('.profile-menu-root');
    const profileTrigger = document.querySelector('.profile-trigger');
    const profileMenu = document.querySelector('.profile-menu');
    if (profileRoot && profileTrigger && profileMenu) {
      profileTrigger.addEventListener('click', (event) => {
        event.preventDefault();
        const expanded = profileTrigger.getAttribute('aria-expanded') === 'true';
        profileTrigger.setAttribute('aria-expanded', String(!expanded));
        profileMenu.classList.toggle('hidden', expanded);
      });

      document.addEventListener('click', (event) => {
        if (!profileRoot.contains(event.target)) {
          profileTrigger.setAttribute('aria-expanded', 'false');
          profileMenu.classList.add('hidden');
        }
      });
    }

    // Initialize Student Mode from server state (source of truth)
    const bootToggle = document.getElementById('student-mode-toggle') || document.getElementById('studentToggle');
    const localStudentMode = String(localStorage.getItem('student_mode') || localStorage.getItem('ai_compass_student_mode') || '').toLowerCase() === 'true';
    const serverStudentMode = bootToggle
      ? String(bootToggle.getAttribute('aria-pressed') || bootToggle.getAttribute('aria-checked') || '').toLowerCase() === 'true'
      : localStudentMode;
    
    // Use server state as source of truth, sync to localStorage
    updateStudentModeUI(serverStudentMode);

    const studentToggle = document.getElementById('student-mode-toggle') || document.getElementById('studentToggle');
    if (studentToggle) {
      studentToggle.addEventListener('click', toggleStudentMode);
    }

    const toolsPage = document.getElementById('tools-page');
    if (toolsPage) {
      initToolsPage();
      renderLocalMemorySections();
      return;
    }

    const savedToolsPage = document.getElementById('saved-tools-page');
    if (savedToolsPage) {
      await initSavedToolsPage();
    }

    updateSortLabel();
    updateHeroCopy();

    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
      sortSelect.value = state.sort;
      sortSelect.addEventListener('change', (event) => {
        setSort(String(event.target.value || 'trending'));
      });
    }

    const sortTrigger = document.getElementById('sort-trigger');
    if (sortTrigger) {
      sortTrigger.addEventListener('click', toggleSortMenu);
    }

    document.querySelectorAll('.sort-option').forEach((option) => {
      option.addEventListener('click', (event) => {
        const sortValue = event.currentTarget?.getAttribute('data-sort-value');
        if (sortValue) setSort(sortValue);
      });
    });

    document.querySelectorAll('.sidebar-category').forEach((button) => {
      button.addEventListener('click', (event) => {
        const category = event.currentTarget?.getAttribute('data-cat');
        if (category) filterCategory(category);
      });
    });

    const categoryFromUrl = new URLSearchParams(window.location.search).get('category');
    if (categoryFromUrl) {
      state.category = String(categoryFromUrl).trim().toLowerCase();
      document.querySelectorAll('.sidebar-item, .sidebar-category').forEach((el) => el.classList.remove('active'));
      const activeBtn = document.querySelector(`[data-cat="${state.category}"]`);
      if (activeBtn) activeBtn.classList.add('active');
      updatePageTitle(state.category);
    }

    saveUserMemoryPrefs();

    await refreshData();
    await renderLocalMemorySections();

    const modalOverlay = document.getElementById('modal-overlay');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (event) => {
        if (event.target === modalOverlay) closeModal();
      });
    }

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeModal();
    });

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          hideSearchSuggestions();
          return;
        }
        if (event.key === 'Enter') {
          hideSearchSuggestions();
        }
      });
    }

    document.addEventListener('click', (event) => {
      const menu = document.getElementById('sort-menu');
      const trigger = document.getElementById('sort-trigger') || document.getElementById('sort-select');
      if (menu && trigger && !menu.contains(event.target) && !trigger.contains(event.target)) {
        closeSortMenu();
      }

      const suggestions = document.getElementById('search-suggestions');
      const localSearchInput = document.getElementById('search-input');
      if (suggestions && localSearchInput && !suggestions.contains(event.target) && event.target !== localSearchInput) {
        hideSearchSuggestions();
      }
    });

    if (searchInput) {
      searchInput.addEventListener('focus', () => {
        if (state.search.trim().length >= 2) requestSearchSuggestions(state.search);
      });
      searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          hideSearchSuggestions();
        }
      });
    }

    const loadMoreButton = document.getElementById('tools-load-more');
    if (loadMoreButton) {
      loadMoreButton.addEventListener('click', () => {
        state.visibleLimit += TOOL_PAGE_SIZE;
        applyAndRender();
      });
    }
  } catch (error) {
    console.error('main.js initialization failed:', error);
  }
});

window.filterCategory = filterCategory;
window.setPriceFilter = setPriceFilter;
window.searchTools = searchTools;
window.toggleStudentMode = toggleStudentMode;
window.setSort = setSort;
window.toggleSortMenu = toggleSortMenu;
window.openModal = openModal;
window.closeModal = closeModal;
window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;
window.toggleFavorite = toggleFavorite;
window.toggleCompare = toggleCompare;
window.goToComparePage = goToComparePage;
window.toggleTheme = toggleTheme;
