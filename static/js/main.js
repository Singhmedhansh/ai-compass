const config = window.AI_COMPASS_CONFIG || {
  isAuthenticated: false,
  favoriteIds: [],
  csrfToken: '',
};

let allTools = [];
let trendingTools = [];
let selectedCompare = new Set();
let favorites = new Set((config.favoriteIds || []).map((item) => String(item)));
let studentMode = false;
let state = {
  category: 'all',
  search: '',
  price: 'all',
  studentMode,
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

async function fetchTools() {
  const response = await fetch('/api/tools');
  if (!response.ok) throw new Error('Failed to fetch tools');
  return response.json();
}

async function fetchTrendingTools() {
  const response = await fetch('/api/tools/trending');
  if (!response.ok) throw new Error('Failed to fetch trending tools');
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

function renderTools(tools) {
  const grid = document.getElementById('tools-grid');
  const empty = document.getElementById('empty-state');
  const count = document.getElementById('visible-count');
  if (!grid || !empty || !count) return;

  count.textContent = String(tools.length);

  if (!tools.length) {
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

    return `
      <article class="tool-card glass glass-hover rounded-xl p-4 flex flex-col gap-3" style="animation-delay:${index * 0.04}s">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <h3 class="text-sm font-700 text-zinc-100" style="font-weight:700">${escapeHtml(tool.name || 'Unnamed Tool')}</h3>
            <p class="text-xs text-zinc-500 mt-0.5 line-clamp-2">${escapeHtml(getToolTagline(tool))}</p>
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

        <p class="text-xs text-zinc-400 leading-relaxed line-clamp-2">${escapeHtml(getToolDescription(tool))}</p>

        <div class="mt-auto pt-2 border-t border-white/5 space-y-2">
          <div class="text-[10px] text-zinc-500 font-mono line-clamp-2">${escapeHtml(displayPrice)}</div>
          <div class="flex items-center gap-2 flex-wrap">
            <button class="text-[10px] brand-text glass rounded-lg px-2.5 py-1 transition-all border border-white/8 hover:border-white/15" onclick="openModal('${escapeHtml(key)}')">View Details</button>
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
  grid.innerHTML = topSix.map((tool) => {
    const key = getToolKey(tool);
    const text = studentMode && tool.studentPerk ? tool.studentPerk : getToolTagline(tool);
    return `
      <button class="glass rounded-lg p-3 text-left hover:bg-white/10 transition-colors" onclick="openModal('${escapeHtml(key)}')">
        <div class="text-xs text-zinc-200 font-600" style="font-weight:600">${escapeHtml(tool.name || 'Unnamed Tool')}</div>
        <div class="text-[11px] text-zinc-500 mt-1 line-clamp-2">${escapeHtml(text)}</div>
      </button>
    `;
  }).join('');
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
      el.textContent = String(allTools.length);
      return;
    }
    if (key === 'free') {
      el.textContent = String(freeCount);
      return;
    }
    el.textContent = String(byCategory[key] || 0);
  });
}

function updateCompareFloatingButton() {
  const button = document.getElementById('compare-floating-btn');
  if (!button) return;

  const count = selectedCompare.size;
  button.textContent = `Compare Tools (${count})`;
  button.classList.toggle('hidden', count < 2);
}

function applyAndRender() {
  renderTools(getFilteredTools());
  renderTrendingSection();
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
  state.category = category;
  document.querySelectorAll('.sidebar-item').forEach((el) => el.classList.remove('active'));
  const activeBtn = document.querySelector(`[data-cat="${category}"]`);
  if (activeBtn) activeBtn.classList.add('active');
  updatePageTitle(category);
  applyAndRender();
  if (window.innerWidth < 768) closeSidebar();
}

function setPriceFilter(price) {
  state.price = price;
  document.querySelectorAll('[data-pf]').forEach((el) => el.classList.remove('active'));
  const activeBtn = document.querySelector(`[data-pf="${price}"]`);
  if (activeBtn) activeBtn.classList.add('active');
  applyAndRender();
}

function searchTools(query) {
  state.search = String(query || '');
  applyAndRender();
}

function toggleStudentMode() {
  studentMode = !studentMode;
  state.studentMode = studentMode;
  document.body.classList.toggle('student-mode', studentMode);

  const toggle = document.getElementById('studentToggle');
  if (toggle) {
    toggle.classList.toggle('active', studentMode);
    toggle.setAttribute('aria-checked', String(studentMode));
  }

  const banner = document.getElementById('student-banner');
  if (banner) banner.style.display = studentMode ? 'flex' : 'none';

  applyAndRender();
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
  const ids = Array.from(selectedCompare).join(',');
  window.location.href = `/compare?tools=${encodeURIComponent(ids)}`;
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
  const modalStudent = document.getElementById('modal-student');
  const modalUniHack = document.getElementById('modal-uni-hack');
  const modalStudentPerk = document.getElementById('modal-student-perk');

  modalTitle.textContent = tool.name || 'Tool';
  modalTagline.textContent = getToolTagline(tool);
  modalDesc.textContent = getToolDescription(tool);
  modalBestFor.textContent = tool.bestFor || tool.subcategory || 'General use';
  modalPricingDetail.textContent = tool.pricingDetail || tool.standard_price || tool.price || 'Pricing unavailable';
  modalLink.href = tool.link || tool.website || '#';

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
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('mob-overlay').classList.toggle('hidden');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('mob-overlay').classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', async () => {
  const studentToggle = document.getElementById('studentToggle');
  if (studentToggle) {
    studentToggle.addEventListener('click', () => {
      toggleStudentMode();
    });
  }

  try {
    const [toolsData, trendingData] = await Promise.all([
      fetchTools(),
      fetchTrendingTools().catch(() => []),
    ]);

    allTools = Array.isArray(toolsData) ? toolsData : [];
    trendingTools = Array.isArray(trendingData) ? trendingData : [];

    updateCategoryCounts();
    applyAndRender();

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

  const modalOverlay = document.getElementById('modal-overlay');
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (event) => {
      if (event.target === modalOverlay) closeModal();
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeModal();
  });
});

window.filterCategory = filterCategory;
window.setPriceFilter = setPriceFilter;
window.searchTools = searchTools;
window.toggleStudentMode = toggleStudentMode;
window.openModal = openModal;
window.closeModal = closeModal;
window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;
window.toggleFavorite = toggleFavorite;
window.toggleCompare = toggleCompare;
window.goToComparePage = goToComparePage;
