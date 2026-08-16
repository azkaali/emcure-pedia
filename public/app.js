/**
 * Emcure Pedia Mobile Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {

  // --- STATE MANAGEMENT ---
  const state = {
    currentView: 'viewCatalog',
    searchQuery: '',
    statusFilter: 'all',
    dosageFilter: '',
    sortBy: 'name_asc',
    currentPage: 1,
    limit: 15,
    totalPages: 1,
    drugs: [],
    selectedDrug: null,
    syncType: 'brand',
    isSyncing: false,
    syncStatusPollTimer: null,
    bookmarks: JSON.parse(localStorage.getItem('emcure_bookmarks') || '[]'),
    notes: JSON.parse(localStorage.getItem('emcure_notes') || '{}')
  };

  // --- DOM ELEMENTS ---
  const elements = {
    // Navigation
    navButtons: document.querySelectorAll('.nav-item'),
    views: document.querySelectorAll('.app-view'),
    
    // Header
    btnQuickRefresh: document.getElementById('btnQuickRefresh'),
    liveStatusBadge: document.getElementById('liveStatusBadge'),
    syncStateText: document.getElementById('syncStateText'),

    // Catalog View
    searchInput: document.getElementById('searchInput'),
    btnClearSearch: document.getElementById('btnClearSearch'),
    filterChips: document.querySelectorAll('.chip'),
    selectDosageFilter: document.getElementById('selectDosageFilter'),
    selectSortFilter: document.getElementById('selectSortFilter'),
    resultsCount: document.getElementById('resultsCount'),
    dbSyncTime: document.getElementById('dbSyncTime'),
    drugListContainer: document.getElementById('drugListContainer'),
    paginationControls: document.getElementById('paginationControls'),
    btnPrevPage: document.getElementById('btnPrevPage'),
    btnNextPage: document.getElementById('btnNextPage'),
    pageIndicator: document.getElementById('pageIndicator'),

    // Live Sync View
    segmentBtns: document.querySelectorAll('.segment-btn'),
    syncQueryInput: document.getElementById('syncQueryInput'),
    btnStartSync: document.getElementById('btnStartSync'),
    presetChips: document.querySelectorAll('.preset-chip'),
    syncLogTerminal: document.getElementById('syncLogTerminal'),
    syncStatusBadge: document.getElementById('syncStatusBadge'),

    // Analytics View
    statTotalDrugs: document.getElementById('statTotalDrugs'),
    statActiveCount: document.getElementById('statActiveCount'),
    statProvisionalCount: document.getElementById('statProvisionalCount'),
    statCompaniesCount: document.getElementById('statCompaniesCount'),
    dosageBreakdownContainer: document.getElementById('dosageBreakdownContainer'),
    companyBreakdownContainer: document.getElementById('companyBreakdownContainer'),

    // Bookmarks View
    bookmarksListContainer: document.getElementById('bookmarksListContainer'),

    // Add Drug Form
    addDrugForm: document.getElementById('addDrugForm'),

    // Detail Modal
    drugDetailModal: document.getElementById('drugDetailModal'),
    btnCloseModal: document.getElementById('btnCloseModal'),
    detailDosageBadge: document.getElementById('detailDosageBadge'),
    detailBrandName: document.getElementById('detailBrandName'),
    detailGenericName: document.getElementById('detailGenericName'),
    detailRegNum: document.getElementById('detailRegNum'),
    detailStatus: document.getElementById('detailStatus'),
    detailLabelClaim: document.getElementById('detailLabelClaim'),
    detailDosageForm: document.getElementById('detailDosageForm'),
    detailRoute: document.getElementById('detailRoute'),
    detailCompanyName: document.getElementById('detailCompanyName'),
    detailCompanyAddress: document.getElementById('detailCompanyAddress'),
    detailSpecification: document.getElementById('detailSpecification'),
    detailPackSizes: document.getElementById('detailPackSizes'),
    detailManufacturingType: document.getElementById('detailManufacturingType'),
    detailLastUpdated: document.getElementById('detailLastUpdated'),
    detailUserNotes: document.getElementById('detailUserNotes'),
    btnSaveNotes: document.getElementById('btnSaveNotes'),
    btnToggleBookmark: document.getElementById('btnToggleBookmark'),
    btnCopyReg: document.getElementById('btnCopyReg'),
    btnDeleteDrug: document.getElementById('btnDeleteDrug'),

    // Toast
    toastContainer: document.getElementById('toastContainer')
  };

  // --- INITIALIZATION ---
  init();

  function init() {
    setupEventListeners();
    fetchCatalog();
    fetchAnalytics();
  }

  // --- EVENT LISTENERS ---
  function setupEventListeners() {
    // Tab Navigation
    elements.navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const viewId = btn.getAttribute('data-view');
        switchView(viewId);
      });
    });

    // Search Input with Debounce
    let searchDebounce = null;
    elements.searchInput.addEventListener('input', (e) => {
      const val = e.target.value;
      if (val.trim()) {
        elements.btnClearSearch.classList.remove('hidden');
      } else {
        elements.btnClearSearch.classList.add('hidden');
      }

      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        state.searchQuery = val.trim();
        state.currentPage = 1;
        fetchCatalog();
      }, 300);
    });

    elements.btnClearSearch.addEventListener('click', () => {
      elements.searchInput.value = '';
      elements.btnClearSearch.classList.add('hidden');
      state.searchQuery = '';
      state.currentPage = 1;
      fetchCatalog();
    });

    // Status Filter Chips
    elements.filterChips.forEach(chip => {
      chip.addEventListener('click', () => {
        elements.filterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.statusFilter = chip.getAttribute('data-filter-value');
        state.currentPage = 1;
        fetchCatalog();
      });
    });

    // Dosage Filter Select
    elements.selectDosageFilter.addEventListener('change', (e) => {
      state.dosageFilter = e.target.value;
      state.currentPage = 1;
      fetchCatalog();
    });

    // Sorting Select
    elements.selectSortFilter.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      state.currentPage = 1;
      fetchCatalog();
    });

    // Quick Header Refresh
    elements.btnQuickRefresh.addEventListener('click', () => {
      showToast('Refreshing drug catalog...', 'info');
      fetchCatalog();
      fetchAnalytics();
    });

    // Pagination Buttons
    elements.btnPrevPage.addEventListener('click', () => {
      if (state.currentPage > 1) {
        state.currentPage--;
        fetchCatalog();
      }
    });

    elements.btnNextPage.addEventListener('click', () => {
      if (state.currentPage < state.totalPages) {
        state.currentPage++;
        fetchCatalog();
      }
    });

    // Live Sync Type Control
    elements.segmentBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        elements.segmentBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.syncType = btn.getAttribute('data-sync-type');
      });
    });

    // Live Sync Trigger
    elements.btnStartSync.addEventListener('click', startLiveSync);

    // Preset Chips
    elements.presetChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const term = chip.getAttribute('data-preset');
        elements.syncQueryInput.value = term;
        startLiveSync();
      });
    });

    // Add Drug Form Submission
    elements.addDrugForm.addEventListener('submit', handleAddDrugSubmit);

    // Modal Close
    elements.btnCloseModal.addEventListener('click', closeModal);
    elements.drugDetailModal.addEventListener('click', (e) => {
      if (e.target === elements.drugDetailModal) closeModal();
    });

    // Modal Action Buttons
    elements.btnToggleBookmark.addEventListener('click', toggleBookmark);
    elements.btnCopyReg.addEventListener('click', copyRegNumber);
    elements.btnSaveNotes.addEventListener('click', saveDrugNote);
    elements.btnDeleteDrug.addEventListener('click', deleteCurrentDrug);
  }

  // --- NAVIGATION ---
  function switchView(viewId) {
    state.currentView = viewId;
    elements.views.forEach(v => v.classList.remove('active'));
    elements.navButtons.forEach(b => b.classList.remove('active'));

    const targetView = document.getElementById(viewId);
    const targetNav = document.querySelector(`.nav-item[data-view="${viewId}"]`);

    if (targetView) targetView.classList.add('active');
    if (targetNav) targetNav.classList.add('active');

    if (viewId === 'viewAnalytics') fetchAnalytics();
    if (viewId === 'viewBookmarks') renderBookmarksView();
  }

  // --- CATALOG FETCH & RENDER ---
  async function fetchCatalog() {
    elements.drugListContainer.innerHTML = `
      <div class="loading-spinner-wrapper">
        <div class="spinner"></div>
        <p>Loading medicine records...</p>
      </div>
    `;

    try {
      const queryParams = new URLSearchParams({
        page: state.currentPage,
        limit: state.limit,
        sort: state.sortBy
      });

      if (state.searchQuery) queryParams.append('q', state.searchQuery);
      if (state.statusFilter && state.statusFilter !== 'all') queryParams.append('status', state.statusFilter);
      if (state.dosageFilter) queryParams.append('dosage_form', state.dosageFilter);

      const response = await fetch(`/api/drugs?${queryParams.toString()}`);
      const data = await response.json();

      if (!data.success) throw new Error(data.error || 'Failed to load drugs');

      state.drugs = data.drugs;
      state.totalPages = data.totalPages;

      // Update dosage dropdown options if empty
      if (elements.selectDosageFilter.options.length <= 1 && data.facets && data.facets.dosageForms) {
        data.facets.dosageForms.sort().forEach(form => {
          const opt = document.createElement('option');
          opt.value = form;
          opt.textContent = form;
          elements.selectDosageFilter.appendChild(opt);
        });
      }

      renderCatalogList(data.drugs, data.total);
      renderPagination(data.page, data.totalPages);

      elements.dbSyncTime.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    } catch (err) {
      console.error('Catalog fetch error:', err);
      elements.drugListContainer.innerHTML = `
        <div class="view-card" style="text-align:center; padding: 30px;">
          <p style="color: var(--color-danger); font-weight: 700;">Error loading medicines</p>
          <p style="font-size: 12px; color: var(--color-text-muted); margin-top: 6px;">${err.message}</p>
        </div>
      `;
    }
  }

  function renderCatalogList(drugs, totalCount) {
    elements.resultsCount.textContent = `Showing ${drugs.length} of ${totalCount} records`;

    if (drugs.length === 0) {
      elements.drugListContainer.innerHTML = `
        <div class="view-card" style="text-align: center; padding: 40px 20px;">
          <div style="font-size: 32px; margin-bottom: 8px;">🔍</div>
          <h3 style="font-size: 15px;">No Medicines Found</h3>
          <p style="font-size: 12px; color: var(--color-text-muted); margin-top: 4px;">Try refining your search query or sync new records from DRAP.</p>
        </div>
      `;
      return;
    }

    elements.drugListContainer.innerHTML = '';
    drugs.forEach(drug => {
      const card = createDrugCardElement(drug);
      elements.drugListContainer.appendChild(card);
    });
  }

  function createDrugCardElement(drug) {
    const card = document.createElement('div');
    const isProvisional = (drug.status || '').toLowerCase().includes('provisional');
    card.className = `drug-card ${isProvisional ? 'provisional' : ''}`;

    const isBookmarked = state.bookmarks.includes(drug.reg_num);

    card.innerHTML = `
      <div class="card-top">
        <span class="card-brand">${escapeHtml(drug.brand_name || 'Unnamed Product')} ${isBookmarked ? '⭐' : ''}</span>
        <span class="card-reg">Reg: ${escapeHtml(drug.reg_num || 'N/A')}</span>
      </div>
      <div class="card-generic">${escapeHtml(drug.generic_name || 'Composition unspecified')}</div>
      <div class="card-meta">
        <span class="badge ${isProvisional ? 'badge-provisional' : 'badge-active'}">${escapeHtml(drug.status || 'Active')}</span>
        ${drug.dosage_form ? `<span class="badge badge-outline">${escapeHtml(drug.dosage_form)}</span>` : ''}
        ${drug.manufacturing_type ? `<span class="badge badge-outline">${escapeHtml(drug.manufacturing_type)}</span>` : ''}
      </div>
      ${drug.company_name ? `<div class="card-company">🏢 ${escapeHtml(drug.company_name)}</div>` : ''}
    `;

    card.addEventListener('click', () => openDrugModal(drug));
    return card;
  }

  function renderPagination(page, totalPages) {
    if (totalPages <= 1) {
      elements.paginationControls.classList.add('hidden');
      return;
    }

    elements.paginationControls.classList.remove('hidden');
    elements.pageIndicator.textContent = `Page ${page} of ${totalPages}`;
    elements.btnPrevPage.disabled = (page <= 1);
    elements.btnNextPage.disabled = (page >= totalPages);
  }

  // --- DETAIL MODAL ---
  function openDrugModal(drug) {
    state.selectedDrug = drug;

    elements.detailBrandName.textContent = drug.brand_name || 'Unnamed Drug';
    elements.detailGenericName.textContent = drug.generic_name || 'Composition unspecified';
    elements.detailRegNum.textContent = drug.reg_num || 'N/A';
    elements.detailStatus.textContent = drug.status || 'Active';
    elements.detailLabelClaim.textContent = drug.label_claim || 'N/A';
    elements.detailDosageForm.textContent = drug.dosage_form || 'N/A';
    elements.detailDosageBadge.textContent = drug.dosage_form || 'Medicine';
    elements.detailRoute.textContent = drug.route_of_admin || 'N/A';
    elements.detailCompanyName.textContent = drug.company_name || 'N/A';
    elements.detailCompanyAddress.textContent = drug.company_address || 'N/A';
    elements.detailSpecification.textContent = drug.product_specification || 'N/A';
    elements.detailPackSizes.textContent = drug.pack_sizes || 'N/A';
    elements.detailManufacturingType.textContent = drug.manufacturing_type || 'N/A';
    elements.detailLastUpdated.textContent = drug.last_updated ? new Date(drug.last_updated).toLocaleString() : 'N/A';

    // Personal Note
    const existingNote = state.notes[drug.reg_num] || '';
    elements.detailUserNotes.value = existingNote;

    // Bookmark button state
    updateBookmarkButtonUI(drug.reg_num);

    elements.drugDetailModal.classList.remove('hidden');
  }

  function closeModal() {
    elements.drugDetailModal.classList.add('hidden');
    state.selectedDrug = null;
  }

  function updateBookmarkButtonUI(regNum) {
    const isBookmarked = state.bookmarks.includes(regNum);
    elements.btnToggleBookmark.textContent = isBookmarked ? '⭐ Bookmarked' : '☆ Bookmark';
    elements.btnToggleBookmark.style.borderColor = isBookmarked ? 'var(--color-warning)' : 'var(--bg-card-border)';
  }

  function toggleBookmark() {
    if (!state.selectedDrug) return;
    const regNum = state.selectedDrug.reg_num;
    const idx = state.bookmarks.indexOf(regNum);

    if (idx === -1) {
      state.bookmarks.push(regNum);
      showToast(`Added ${state.selectedDrug.brand_name} to saved bookmarks`, 'success');
    } else {
      state.bookmarks.splice(idx, 1);
      showToast(`Removed ${state.selectedDrug.brand_name} from bookmarks`, 'info');
    }

    localStorage.setItem('emcure_bookmarks', JSON.stringify(state.bookmarks));
    updateBookmarkButtonUI(regNum);
    fetchCatalog();
  }

  function copyRegNumber() {
    if (!state.selectedDrug) return;
    navigator.clipboard.writeText(state.selectedDrug.reg_num);
    showToast(`Copied Reg # ${state.selectedDrug.reg_num} to clipboard`, 'success');
  }

  function saveDrugNote() {
    if (!state.selectedDrug) return;
    const noteText = elements.detailUserNotes.value.trim();
    const regNum = state.selectedDrug.reg_num;

    if (noteText) {
      state.notes[regNum] = noteText;
      showToast('Personal clinical note saved', 'success');
    } else {
      delete state.notes[regNum];
      showToast('Note cleared', 'info');
    }

    localStorage.setItem('emcure_notes', JSON.stringify(state.notes));
  }

  async function deleteCurrentDrug() {
    if (!state.selectedDrug) return;
    const regNum = state.selectedDrug.reg_num;
    if (!confirm(`Are you sure you want to delete "${state.selectedDrug.brand_name}" (${regNum})?`)) return;

    try {
      const response = await fetch(`/api/drugs/${encodeURIComponent(regNum)}`, {
        method: 'DELETE'
      });
      const data = await response.json();

      if (!data.success) throw new Error(data.message || 'Delete failed');

      showToast(`Deleted ${state.selectedDrug.brand_name}`, 'success');
      closeModal();
      fetchCatalog();
      fetchAnalytics();
    } catch (err) {
      showToast(`Delete failed: ${err.message}`, 'error');
    }
  }

  // --- LIVE SYNC SCRAPER ---
  async function startLiveSync() {
    const query = elements.syncQueryInput.value.trim();
    if (!query) {
      showToast('Please enter a medicine name or reg number to sync', 'error');
      return;
    }

    if (state.isSyncing) return;

    state.isSyncing = true;
    elements.btnStartSync.disabled = true;
    elements.btnStartSync.innerHTML = '<span>⏳ Syncing...</span>';
    elements.syncStatusBadge.textContent = 'Active Syncing...';
    elements.syncStatusBadge.className = 'badge badge-busy';

    appendTerminalLog(`> Starting live DRAP fetch for [${state.syncType.toUpperCase()}] "${query}"...`);

    // Start status polling
    state.syncStatusPollTimer = setInterval(pollSyncStatus, 1000);

    try {
      const response = await fetch('/api/sync/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, type: state.syncType })
      });

      const data = await response.json();

      clearInterval(state.syncStatusPollTimer);

      if (!data.success) throw new Error(data.message || data.error || 'Sync failed');

      appendTerminalLog(`> [✓] SUCCESS: ${data.message}`);
      if (data.result) {
        appendTerminalLog(`> Summary: Added ${data.result.addedCount || 0} new medicines, updated ${data.result.updatedCount || 0}.`);
      }

      showToast(`Sync Complete! Added ${data.result ? data.result.addedCount : 0} new medicines`, 'success');
      fetchCatalog();
      fetchAnalytics();
    } catch (err) {
      clearInterval(state.syncStatusPollTimer);
      appendTerminalLog(`> [!] ERROR: ${err.message}`);
      showToast(`Sync error: ${err.message}`, 'error');
    } finally {
      state.isSyncing = false;
      elements.btnStartSync.disabled = false;
      elements.btnStartSync.innerHTML = '<span>🔄 Fetch & Sync</span>';
      elements.syncStatusBadge.textContent = 'Idle';
      elements.syncStatusBadge.className = 'badge badge-idle';
    }
  }

  async function pollSyncStatus() {
    try {
      const response = await fetch('/api/sync/status');
      const data = await response.json();
      if (data.logs && data.logs.length > 0) {
        const topLog = data.logs[0];
        appendTerminalLog(`> ${topLog}`);
      }
    } catch (e) {
      // Ignore polling glitches
    }
  }

  function appendTerminalLog(msg) {
    const line = document.createElement('div');
    line.className = 'terminal-line';
    line.textContent = msg;
    elements.syncLogTerminal.appendChild(line);
    elements.syncLogTerminal.scrollTop = elements.syncLogTerminal.scrollHeight;
  }

  // --- ANALYTICS ---
  async function fetchAnalytics() {
    try {
      const response = await fetch('/api/stats');
      const data = await response.json();
      if (!data.success) return;

      const { stats } = data;
      elements.statTotalDrugs.textContent = stats.total;
      elements.statActiveCount.textContent = stats.activeCount;
      elements.statProvisionalCount.textContent = stats.provisionalCount;
      elements.statCompaniesCount.textContent = stats.uniqueCompanies;

      // Dosage Breakdown Bars
      elements.dosageBreakdownContainer.innerHTML = '';
      stats.topDosageForms.forEach(item => {
        const percent = Math.round((item.count / stats.total) * 100) || 0;
        const bar = createProgressBarElement(item.name, item.count, percent);
        elements.dosageBreakdownContainer.appendChild(bar);
      });

      // Company Breakdown Bars
      elements.companyBreakdownContainer.innerHTML = '';
      stats.topCompanies.forEach(item => {
        const percent = Math.round((item.count / stats.total) * 100) || 0;
        const bar = createProgressBarElement(item.name, item.count, percent);
        elements.companyBreakdownContainer.appendChild(bar);
      });
    } catch (e) {
      console.error('Analytics fetch error:', e);
    }
  }

  function createProgressBarElement(label, count, percent) {
    const wrap = document.createElement('div');
    wrap.className = 'progress-item';
    wrap.innerHTML = `
      <div class="progress-label-group">
        <span>${escapeHtml(label)}</span>
        <span>${count} (${percent}%)</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width: ${percent}%"></div>
      </div>
    `;
    return wrap;
  }

  // --- BOOKMARKS VIEW ---
  function renderBookmarksView() {
    if (state.bookmarks.length === 0) {
      elements.bookmarksListContainer.innerHTML = `
        <div class="view-card" style="text-align: center; padding: 40px 20px;">
          <div style="font-size: 32px; margin-bottom: 8px;">⭐</div>
          <h3 style="font-size: 15px;">No Saved Medicines</h3>
          <p style="font-size: 12px; color: var(--color-text-muted); margin-top: 4px;">Tap the ☆ Bookmark button on any drug card to save it here for quick reference.</p>
        </div>
      `;
      return;
    }

    elements.bookmarksListContainer.innerHTML = '<div class="loading-spinner-wrapper"><div class="spinner"></div><p>Loading bookmarks...</p></div>';

    fetch('/api/drugs?limit=1000')
      .then(res => res.json())
      .then(data => {
        const bookmarkedDrugs = (data.drugs || []).filter(d => state.bookmarks.includes(d.reg_num));
        elements.bookmarksListContainer.innerHTML = '';

        if (bookmarkedDrugs.length === 0) {
          elements.bookmarksListContainer.innerHTML = '<p style="color: var(--color-text-muted);">No bookmarked drugs match current stored database.</p>';
          return;
        }

        bookmarkedDrugs.forEach(drug => {
          const card = createDrugCardElement(drug);
          elements.bookmarksListContainer.appendChild(card);
        });
      });
  }

  // --- ADD DRUG FORM ---
  async function handleAddDrugSubmit(e) {
    e.preventDefault();

    const newDrug = {
      brand_name: document.getElementById('inputBrandName').value.trim(),
      reg_num: document.getElementById('inputRegNum').value.trim(),
      status: document.getElementById('inputStatus').value,
      generic_name: document.getElementById('inputGenericName').value.trim(),
      dosage_form: document.getElementById('inputDosageForm').value.trim(),
      route_of_admin: document.getElementById('inputRoute').value.trim(),
      company_name: document.getElementById('inputCompanyName').value.trim(),
      company_address: document.getElementById('inputCompanyAddress').value.trim(),
      pack_sizes: document.getElementById('inputPackSizes').value.trim(),
      label_claim: document.getElementById('inputLabelClaim').value.trim()
    };

    try {
      const response = await fetch('/api/drugs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDrug)
      });
      const data = await response.json();

      if (!data.success) throw new Error(data.message || 'Creation failed');

      showToast(`Registered "${newDrug.brand_name}" successfully!`, 'success');
      elements.addDrugForm.reset();
      switchView('viewCatalog');
      fetchCatalog();
      fetchAnalytics();
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    }
  }

  // --- HELPERS ---
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    elements.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

});
