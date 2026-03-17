const config = window.AI_COMPASS_CONFIG || {
  isAuthenticated: false,
  favoriteIds: [],
  csrfToken: '',
};

let allTools = [];
let trendingTools = [];
let selectedCompare = new Set();
let favorites = new Set((config.favoriteIds || []).map((item) => String(item)));
let studentMode = localStorage.getItem('ai_compass_student_mode') === 'true';
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
  const icon = String(tool.icon || '').trim();
  return icon || '/static/icons/default.png';
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

    return `
      <article class="tool-card glass glass-hover rounded-2xl p-4 flex flex-col gap-3 border border-white/8 hover:scale-[1.02] hover:border-blue-500 hover:shadow-lg transition-all duration-200" style="animation-delay:${index * 0.04}s">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0 flex items-start gap-2">
            <img src="${escapeHtml(getToolIcon(tool))}" onerror="this.onerror=null;this.src='/static/icons/default.png';" alt="${escapeHtml(tool.name || 'Tool')} logo" class="w-8 h-8 rounded-md object-cover bg-white/10 border border-white/10 flex-shrink-0" />
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

        <div class="mt-auto pt-2 border-t border-white/5 space-y-2">
          <div class="text-[10px] text-zinc-500 font-mono line-clamp-2">${escapeHtml(displayPrice)}</div>
          <div class="flex items-center gap-2 flex-wrap">
            <a href="/tool/${escapeHtml(key)}" class="text-[10px] brand-text glass rounded-lg px-2.5 py-1 transition-all border border-white/8 hover:border-white/15">View Details</a>
            <button class="text-[10px] rounded-lg px-2.5 py-1 transition-all border ${isFavorite ? 'border-amber-400/30 text-amber-300 bg-amber-500/10' : 'border-white/10 text-zinc-300 bg-white/5'}" onclick="toggleFavorite('${escapeHtml(key)}')">★ Favorite</button>
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
            <img src="${escapeHtml(getToolIcon(tool))}" onerror="this.onerror=null;this.src='/static/icons/default.png';" alt="${escapeHtml(tool.name || 'Tool')} logo" class="w-8 h-8 rounded-lg object-cover border border-white/10" />
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

  const source = trendingTools.length ? trendingTools : allTools.filter((tool) => tool.trending).slice(0, 6);
  const topSix = source.slice(0, 6);
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
          <img src="${escapeHtml(getToolIcon(tool))}" onerror="this.onerror=null;this.src='/static/icons/default.png';" alt="${escapeHtml(tool.name || 'Tool')} logo" class="w-6 h-6 rounded-md object-cover bg-white/10 border border-white/10 flex-shrink-0" />
          <div class="text-xs text-zinc-100 font-600 line-clamp-1" style="font-weight:600">${escapeHtml(tool.name || 'Unnamed Tool')}</div>
        </div>
        <div class="text-[11px] text-zinc-500 mt-1 line-clamp-2">${escapeHtml(text)}</div>
      </button>
    `;
  }).join('');
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
    const icon = escapeHtml(tool.icon || '/static/icons/default.png');

    return `
      <a href="/tool/${slug}" class="block rounded-lg px-2.5 py-2 hover:bg-white/6 transition-colors">
        <div class="flex items-start gap-2.5">
          <img src="${icon}" onerror="this.onerror=null;this.src='/static/icons/default.png';" alt="${escapeHtml(tool.name || 'Tool')} logo" class="w-8 h-8 rounded-md border border-white/10 object-cover" />
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
  document.querySelectorAll('[data-pf]').forEach((el) => el.classList.remove('active'));
  const activeBtn = document.querySelector(`[data-pf="${price}"]`);
  if (activeBtn) activeBtn.classList.add('active');
  applyAndRender();
}

function searchTools(query) {
  state.search = String(query || '');
  state.visibleLimit = TOOL_PAGE_SIZE;
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

function toggleStudentMode() {
  try {
    studentMode = !studentMode;
    state.studentMode = studentMode;
    localStorage.setItem('ai_compass_student_mode', String(studentMode));
    document.body.classList.toggle('student-mode', studentMode);

    const toggle = document.getElementById('student-mode-toggle') || document.getElementById('studentToggle');
    if (toggle) {
      toggle.classList.toggle('active', studentMode);
      toggle.setAttribute('aria-checked', String(studentMode));
    }

    const banner = document.getElementById('student-banner');
    if (banner) banner.style.display = studentMode ? 'flex' : 'none';

    updateHeroCopy();
    refreshData();
  } catch (error) {
    console.error('toggleStudentMode failed:', error);
  }
}

function setSort(sortType) {
  try {
    state.sort = sortType;
    state.visibleLimit = TOOL_PAGE_SIZE;
    localStorage.setItem('ai_compass_sort', sortType);
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
    window.location.href = '/login';
    return;
  }

  try {
    const result = await postJson('/api/favorite', { tool_id: toolKey });
    if (result.favorited) {
      favorites.add(toolKey);
    } else {
      favorites.delete(toolKey);
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
  modalIcon.innerHTML = `<img src="${escapeHtml(getToolIcon(tool))}" onerror="this.onerror=null;this.src='/static/icons/default.png';" alt="${escapeHtml(tool.name || 'Tool')} logo" class="w-12 h-12 rounded-xl object-cover bg-white/10 border border-white/10" />`;

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

  initFilters();
  initSort();
  initPagination();
  initUI();
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const toolsPage = document.getElementById('tools-page');
    if (toolsPage) {
      initToolsPage();
      return;
    }

    document.body.classList.toggle('student-mode', state.studentMode);
    updateSortLabel();
    updateHeroCopy();

    const studentToggle = document.getElementById('student-mode-toggle') || document.getElementById('studentToggle');
    if (studentToggle) {
      studentToggle.classList.toggle('active', state.studentMode);
      studentToggle.setAttribute('aria-checked', String(state.studentMode));
      studentToggle.addEventListener('click', toggleStudentMode);
    }

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

    await refreshData();

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
