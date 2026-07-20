   /* ============================================================
   ContactIQ AI — Dashboard Logic
   Vanilla ES6. Fetches live data from the FastAPI backend and
   caches it so switching between views / refreshing widgets
   doesn't re-hit the API more than necessary.
   ============================================================ */

const API_BASE = ''; // same-origin FastAPI backend

const state = {
    theme: localStorage.getItem('contactiq-theme') || 'dark',
    sidebarCollapsed: false,
};

// Cache of the last successful response per endpoint, so the dashboard
// preview widgets and the full pages (Processing Queue / OCR Logs) can
// share one fetch instead of issuing duplicate requests.
const cache = {
    queue: null,
    logs: null,
    duplicates: null,
    analytics: null,
    contacts: null,
};

let trendChart = null;
let analyticsTrendChart = null;
let analyticsDupChart = null;
let analyticsOcrChart = null;
let analyticsConfChart = null;

/* ============================================================
   Fetch helper
   ============================================================ */
async function apiGet(path) {
    const response = await fetch(`${API_BASE}${path}`);
    if (!response.ok) {
        throw new Error(`${path} failed: ${response.status}`);
    }
    return response.json();
}

/* ============================================================
   Loaders — one per data source. Each updates `cache` so other
   widgets can reuse the result without a fresh network call.
   ============================================================ */
async function fetchQueue(force = false) {
    if (cache.queue && !force) return cache.queue;
    cache.queue = await apiGet('/processing-queue');
    return cache.queue;
}

async function fetchLogs(force = false) {
    if (cache.logs && !force) return cache.logs;
    cache.logs = await apiGet('/logs');
    return cache.logs;
}

async function fetchDuplicates(force = false) {
    if (cache.duplicates && !force) return cache.duplicates;
    cache.duplicates = await apiGet('/duplicates');
    return cache.duplicates;
}

async function fetchAnalytics(force = false) {
    if (cache.analytics && !force) return cache.analytics;
    cache.analytics = await apiGet('/analytics');
    return cache.analytics;
}

async function fetchContacts(force = false) {
    if (cache.contacts && !force) return cache.contacts;
    cache.contacts = await apiGet('/contacts');
    return cache.contacts;
}

/* ============================================================
   Dashboard — KPI cards
   ============================================================ */
async function loadDashboardKpis() {
    try {
        const data = await apiGet('/dashboard-data');

        setText('totalFiles', data.total_files);
        setText('contacts', data.contacts);
        setText('newContacts', data.new_contacts);
        setText('duplicates', data.duplicates);
        setText('failed', data.failed);
        setText('accuracy', `${data.accuracy}%`);
        setText('ocrConfidence', `${data.ocr_confidence}%`);
        setText('aiConfidence', `${data.ai_confidence}%`);
    } catch (error) {
        console.error('Dashboard KPI load failed:', error);
    } finally {
        setText('lastSync', `Last synced: ${new Date().toLocaleTimeString()}`);
    }
}

/* ============================================================
   Dashboard — Processing Queue preview widget
   ============================================================ */
async function loadQueuePreview() {
    const tbody = document.getElementById('queuePreviewBody');
    if (!tbody) return;

    try {
        const data = await fetchQueue();
        const rows = data.slice(0, 5);

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="3" class="empty-cell">No files processed yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map(item => `
            <tr>
                <td>${escapeHtml(item.file || 'Unknown')}</td>
                <td><span class="status ${(item.status || '').toLowerCase()}">${escapeHtml(item.status || 'Unknown')}</span></td>
                <td>${escapeHtml(item.confidence ?? '—')}</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Queue preview load failed:', error);
        tbody.innerHTML = `<tr><td colspan="3" class="empty-cell">Failed to load queue.</td></tr>`;
    }
}

/* ============================================================
   Dashboard — OCR Logs preview widget
   ============================================================ */
async function loadOcrPreview() {
    const tbody = document.getElementById('ocrPreviewBody');
    if (!tbody) return;

    try {
        const logs = await fetchLogs();
        const rows = logs.slice(0, 5);

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="3" class="empty-cell">No OCR activity yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map(log => `
            <tr>
                <td>${escapeHtml(log.file || 'N/A')}</td>
                <td><span class="status ${(log.status || '').toLowerCase()}">${escapeHtml(log.status || 'N/A')}</span></td>
                <td>${escapeHtml(formatConfidence(log.ocr_confidence))}</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('OCR preview load failed:', error);
        tbody.innerHTML = `<tr><td colspan="3" class="empty-cell">Failed to load OCR logs.</td></tr>`;
    }
}

/* ============================================================
   Dashboard — Recent Activity timeline widget
   ============================================================ */
async function loadRecentActivity() {
    const list = document.getElementById('recentActivityList');
    if (!list) return;

    try {
        const logs = await fetchLogs();
        const rows = logs.slice(0, 6);

        if (!rows.length) {
            list.innerHTML = `<li class="empty-cell">No recent activity.</li>`;
            return;
        }

        const iconFor = (status) => ({
            success: 'fa-circle-check',
            duplicate: 'fa-clone',
            failed: 'fa-circle-xmark',
            skipped: 'fa-forward',
        }[status] || 'fa-circle-info');

        list.innerHTML = rows.map(log => `
            <li class="activity-item ${escapeHtml(log.status || '')}">
                <i class="fa-solid ${iconFor(log.status)}"></i>
                <span class="activity-file">${escapeHtml(log.file || 'Unknown file')}</span>
                <span class="activity-status">${escapeHtml(log.status || 'unknown')}</span>
            </li>
        `).join('');
    } catch (error) {
        console.error('Recent activity load failed:', error);
        list.innerHTML = `<li class="empty-cell">Failed to load activity.</li>`;
    }
}

/* ============================================================
   Dashboard — trend graph widget
   ============================================================ */
async function loadDashboardTrendChart() {
    const canvas = document.getElementById('trendChart');
    if (!canvas || typeof Chart === 'undefined') return;

    try {
        const data = await fetchAnalytics();

        if (trendChart) {
            trendChart.destroy();
        }

        trendChart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: ['-6d', '-5d', '-4d', '-3d', '-2d', '-1d', 'Today'],
                datasets: [{
                    label: 'Files processed',
                    data: data.files_processed,
                    borderColor: '#6d8dff',
                    backgroundColor: 'rgba(109,141,255,0.15)',
                    tension: 0.35,
                    fill: true,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } },
            },
        });
    } catch (error) {
        console.error('Dashboard trend chart failed:', error);
    }
}

/* ============================================================
   Contacts view
   ============================================================ */
function renderContactsTable(contacts) {
    const tbody = document.getElementById('contactsTableBody');
    const countLabel = document.getElementById('contactsCount');
    if (!tbody) return;

    if (countLabel) {
        countLabel.textContent = `${contacts.length} contact(s) found`;
    }

    if (!contacts.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-cell">No contacts extracted yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = contacts.map(c => `
        <tr>
            <td>${escapeHtml(c.full_name || '—')}</td>
            <td>${escapeHtml(c.email || '—')}</td>
            <td>${escapeHtml(c.phone || '—')}</td>
            <td>${escapeHtml(c.organization || '—')}</td>
            <td>${escapeHtml(c.designation || '—')}</td>
            <td>${escapeHtml([c.city, c.country].filter(Boolean).join(', ') || '—')}</td>
            <td>${escapeHtml(formatConfidence(c.confidence))}</td>
            <td><button class="btn-small" data-contact-id="${c.id}"><i class="fa-solid fa-eye"></i> View</button></td>
        </tr>
    `).join('');
}

async function loadContacts(force = false) {
    const tbody = document.getElementById('contactsTableBody');
    const countLabel = document.getElementById('contactsCount');

    try {
        const contacts = await fetchContacts(force);
        renderContactsTable(contacts);
    } catch (error) {
        console.error('Failed to load contacts:', error);
        if (countLabel) countLabel.textContent = 'Failed to load contacts';
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="empty-cell">Failed to load contacts.</td></tr>`;
    }
}

function filterContactsTable() {
    const input = document.getElementById('contactsSearchInput');
    if (!input || !cache.contacts) return;

    const term = input.value.trim().toLowerCase();
    if (!term) {
        renderContactsTable(cache.contacts);
        return;
    }

    const filtered = cache.contacts.filter(c =>
        [c.full_name, c.email, c.phone, c.organization, c.city]
            .filter(Boolean)
            .some(field => field.toLowerCase().includes(term))
    );

    renderContactsTable(filtered);
}

/* ============================================================
   Processing Queue (full page)
   ============================================================ */
async function loadProcessingQueueView(force = false) {
    const tbody = document.getElementById('processingQueueViewBody');
    if (!tbody) return;

    try {
        const data = await fetchQueue(force);

        if (!data.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="empty-cell">No processing activity found.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(item => `
            <tr>
                <td>${escapeHtml(item.file || 'Unknown')}</td>
                <td><span class="status ${(item.status || '').toLowerCase()}">${escapeHtml(item.status || 'Unknown')}</span></td>
                <td>${escapeHtml(item.time || '—')}</td>
                <td>${item.contacts ?? 0}</td>
                <td>${escapeHtml(item.ocr_accuracy ?? '—')}</td>
                <td>${escapeHtml(item.confidence ?? '—')}</td>
                <td><button class="btn-small"><i class="fa-solid fa-eye"></i> View</button></td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Failed to load Processing Queue View:', error);
        tbody.innerHTML = `<tr><td colspan="7" class="empty-cell">Failed to load processing queue.</td></tr>`;
    }
}

/* ============================================================
   OCR Logs (full page)
   ============================================================ */
async function loadOCRLogs(force = false) {
    const tableBody = document.getElementById('ocrLogsTableBody');
    const summary = document.getElementById('ocrLogsSummary');

    try {
        const logs = await fetchLogs(force);

        if (!logs.length) {
            if (summary) summary.textContent = 'No OCR logs available yet.';
            if (tableBody) {
                tableBody.innerHTML = `<tr><td colspan="4" class="empty-cell">No OCR logs found yet.</td></tr>`;
            }
            return;
        }

        if (summary) summary.textContent = `${logs.length} OCR log(s) found`;

        if (tableBody) {
            tableBody.innerHTML = logs.map(log => `
                <tr>
                    <td>${escapeHtml(log.file || 'N/A')}</td>
                    <td><span class="status ${(log.status || '').toLowerCase()}">${escapeHtml(log.status || 'N/A')}</span></td>
                    <td>${escapeHtml(formatConfidence(log.ocr_confidence))}</td>
                    <td>${escapeHtml(truncate(log.processing_result, 120))}</td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error('Failed to load OCR logs:', error);
        if (summary) summary.textContent = 'Failed to load OCR logs.';
    }
}

/* ============================================================
   Duplicate Review
   ============================================================ */
async function loadDuplicates(force = false) {
    const summary = document.getElementById('duplicateSummary');
    const container = document.getElementById('duplicateList');
    if (!container) return;

    try {
        const data = await fetchDuplicates(force);

        if (summary) {
            summary.textContent = `${data.duplicate_groups || 0} duplicate group(s) detected`;
        }

        container.innerHTML = '';

        if (!data.duplicates || !data.duplicates.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-circle-check"></i>
                    <h3>No duplicate contacts found</h3>
                    <p>Your contact database currently has no duplicate contact groups.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = data.duplicates.map(group => `
            <div class="panel duplicate-group">
                <div class="panel-head">
                    <div>
                        <h3>Group #${group.group_id}</h3>
                        <p>${escapeHtml(group.match_reason)}</p>
                    </div>
                </div>
                <div class="table-wrap">
                    <table class="queue-table">
                        <thead>
                            <tr>
                                <th>Name</th><th>Email</th><th>Phone</th><th>Organization</th><th>City</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${group.contacts.map(c => `
                                <tr>
                                    <td>${escapeHtml(c.full_name || '—')}</td>
                                    <td>${escapeHtml(c.email || '—')}</td>
                                    <td>${escapeHtml(c.phone || '—')}</td>
                                    <td>${escapeHtml(c.organization || '—')}</td>
                                    <td>${escapeHtml(c.city || '—')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Failed to load duplicates:', error);
        if (summary) summary.textContent = 'Failed to load duplicate information';
        container.innerHTML = `<div class="panel"><p>Failed to load duplicate information.</p></div>`;
    }
}

/* ============================================================
   Analytics (full page charts)
   ============================================================ */
async function loadAnalyticsView(force = false) {
    try {
        const data = await fetchAnalytics(force);
        renderAnalyticsCharts(data);
    } catch (error) {
        console.error('Failed to load analytics:', error);
    }
}

function renderAnalyticsCharts(data) {
    if (typeof Chart === 'undefined') return;

    const labels = ['-6d', '-5d', '-4d', '-3d', '-2d', '-1d', 'Today'];

    analyticsTrendChart = recreateChart(analyticsTrendChart, 'analyticsTrendChart', {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Files processed',
                data: data.files_processed,
                borderColor: '#6d8dff',
                backgroundColor: 'rgba(109,141,255,0.15)',
                tension: 0.35,
                fill: true,
            }],
        },
        options: baseChartOptions(),
    });

    analyticsDupChart = recreateChart(analyticsDupChart, 'analyticsDupChart', {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Duplicates found',
                data: data.duplicates_found,
                backgroundColor: '#ff8a65',
            }],
        },
        options: baseChartOptions(),
    });

    analyticsOcrChart = recreateChart(analyticsOcrChart, 'analyticsOcrChart', {
        type: 'doughnut',
        data: {
            labels: ['High', 'Medium', 'Low'],
            datasets: [{
                data: data.ocr_distribution,
                backgroundColor: ['#4ade80', '#facc15', '#f87171'],
            }],
        },
        options: { responsive: true, maintainAspectRatio: false },
    });

    analyticsConfChart = recreateChart(analyticsConfChart, 'analyticsConfChart', {
        type: 'line',
        data: {
            labels: ['-5', '-4', '-3', '-2', '-1', 'Now'],
            datasets: [{
                label: 'AI confidence %',
                data: data.ai_confidence,
                borderColor: '#a78bfa',
                backgroundColor: 'rgba(167,139,250,0.15)',
                tension: 0.35,
                fill: true,
            }],
        },
        options: baseChartOptions(),
    });
}

function baseChartOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } },
    };
}

// Destroys any existing Chart.js instance bound to `canvasId` before
// creating a new one — this is what prevents the "Canvas is already in
// use" / "Cannot access before initialization" errors that show up when
// a chart is re-rendered without being torn down first.
function recreateChart(existingInstance, canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    if (existingInstance) {
        existingInstance.destroy();
    }

    return new Chart(canvas.getContext('2d'), config);
}

/* ============================================================
   View switching (single source of truth — no per-menu-item
   duplicated click handlers)
   ============================================================ */
const VIEW_CONFIG = {
    dashboardMenu: { view: null, loader: loadDashboardAll },
    contactsMenu: { view: 'contactsView', loader: () => loadContacts(true) },
    processingQueueMenu: { view: 'processingQueueView', loader: () => loadProcessingQueueView(true) },
    analyticsMenu: { view: 'analyticsView', loader: () => loadAnalyticsView(true) },
    duplicateReviewMenu: { view: 'duplicateReviewView', loader: () => loadDuplicates(true) },
    ocrLogsMenu: { view: 'ocrLogsView', loader: () => loadOCRLogs(true) },
};

const STANDALONE_VIEW_IDS = [
    'contactsView',
    'processingQueueView',
    'analyticsView',
    'duplicateReviewView',
    'ocrLogsView',
];

async function switchView(menuId) {
    const config = VIEW_CONFIG[menuId];
    if (!config) return;

    const mainContent = document.getElementById('mainContent');
    const menuEl = document.getElementById(menuId);
    if (!mainContent) return;

    // Toggle sidebar active state
    document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
    if (menuEl) menuEl.classList.add('active');

    if (config.view === null) {
        // Dashboard: show default sections, hide the standalone views
        Array.from(mainContent.children).forEach(child => {
            child.style.display = STANDALONE_VIEW_IDS.includes(child.id) ? 'none' : '';
        });
    } else {
        Array.from(mainContent.children).forEach(child => {
            child.style.display = child.id === config.view ? 'block' : 'none';
        });
    }

    sidebarCloseOnMobile();

    // Give the browser a frame to lay out the now-visible canvas before
    // Chart.js measures it (fixes zero-height charts on first render).
    await new Promise(resolve => setTimeout(resolve, 30));

    if (config.loader) {
        await config.loader();
    }

    if (config.view === null) {
        resizeDashboardCharts();
    }
}

function resizeDashboardCharts() {
    [trendChart, analyticsTrendChart, analyticsDupChart, analyticsOcrChart, analyticsConfChart]
        .filter(Boolean)
        .forEach(chart => chart.resize());
}

async function loadDashboardAll() {
    await Promise.all([
        loadDashboardKpis(),
        loadQueuePreview(),
        loadOcrPreview(),
        loadRecentActivity(),
        loadDashboardTrendChart(),
    ]);
}

/* ============================================================
   Processing trigger
   ============================================================ */
async function runProcessing() {
    const btn = document.getElementById('processBtn');
    if (btn) {
        btn.disabled = true;
        btn.classList.add('is-loading');
    }

    try {
        const response = await fetch(`${API_BASE}/process-folder`, { method: 'POST' });
        if (!response.ok) throw new Error(`process-folder failed: ${response.status}`);
        const data = await response.json();

        // Invalidate caches touched by this run so the next render is fresh.
        cache.queue = null;
        cache.logs = null;
        cache.contacts = null;
        cache.analytics = null;
        cache.duplicates = null;

        await loadDashboardAll();

        showToast(
            `Processed ${data.summary.total_files} file(s) — ${data.summary.contacts_saved} contact(s) saved`,
            'success',
            'fa-circle-check'
        );
    } catch (error) {
        console.error('Processing run failed:', error);
        showToast('Processing run failed. Check server logs.', 'error', 'fa-triangle-exclamation');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('is-loading');
        }
    }
}

/* ============================================================
   Small utilities
   ============================================================ */
function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function formatConfidence(value) {
    if (value === null || value === undefined || value === '') return '—';
    return `${value}%`;
}

function truncate(text, max) {
    if (!text) return 'N/A';
    return text.length > max ? `${text.slice(0, max)}…` : text;
}

function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sidebarCloseOnMobile() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('mobile-open');
}

/* ============================================================
   Theme / topbar / sidebar / greeting
   ============================================================ */
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const icon = document.querySelector('#themeToggle i');
    if (icon) icon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    state.theme = theme;
    localStorage.setItem('contactiq-theme', theme);
}

function initTopbar() {
    document.getElementById('themeToggle')?.addEventListener('click', () => {
        applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    });

    document.getElementById('mobileToggle')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.toggle('mobile-open');
    });

    document.getElementById('notifBtn')?.addEventListener('click', () => {
        showToast('3 files finished processing in the last hour', 'info', 'fa-bell');
    });

    document.getElementById('docsBtn')?.addEventListener('click', () => {
        window.open(`${API_BASE}/docs`, '_blank');
    });

    document.getElementById('processBtn')?.addEventListener('click', runProcessing);

    document.getElementById('contactsSearchInput')?.addEventListener('input', filterContactsTable);
}

function updateGreetingAndDate() {
    const now = new Date();
    const hour = now.getHours();
    let greeting = 'Good evening';
    if (hour < 12) greeting = 'Good morning';
    else if (hour < 18) greeting = 'Good afternoon';

    setText('greeting', `${greeting}, Admin`);
    setText('dateDisplay', now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }));
}

function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const collapseBtn = document.getElementById('collapseBtn');

    collapseBtn?.addEventListener('click', () => {
        sidebar?.classList.toggle('collapsed');
        state.sidebarCollapsed = sidebar?.classList.contains('collapsed') ?? false;
    });

    // Single delegated listener for every sidebar menu item — replaces
    // the six near-identical click handlers that used to live here.
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            switchView(item.id);
        });
    });
}

/* ============================================================
   Refresh buttons (per view)
   ============================================================ */
function initRefreshButtons() {
    document.getElementById('refreshContactsBtn')?.addEventListener('click', async () => {
        await loadContacts(true);
        showToast('Contacts refreshed', 'success', 'fa-circle-check');
    });

    document.getElementById('refreshProcessingQueueBtn')?.addEventListener('click', async () => {
        await loadProcessingQueueView(true);
        showToast('Processing queue refreshed', 'success', 'fa-circle-check');
    });

    document.getElementById('refreshAnalyticsBtn')?.addEventListener('click', async () => {
        await loadAnalyticsView(true);
        showToast('Analytics refreshed successfully', 'success', 'fa-circle-check');
    });

    document.getElementById('refreshDuplicatesBtn')?.addEventListener('click', async () => {
        await loadDuplicates(true);
        showToast('Duplicate review refreshed', 'success', 'fa-circle-check');
    });

    document.getElementById('refreshOcrLogsBtn')?.addEventListener('click', async () => {
        await loadOCRLogs(true);
        showToast('OCR logs refreshed', 'success', 'fa-circle-check');
    });
}

/* ============================================================
   Loader overlay / ripple buttons / scroll reveal / toasts
   ============================================================ */
function initLoader() {
    const overlay = document.getElementById('loaderOverlay');
    if (!overlay) return;
    window.addEventListener('load', () => setTimeout(() => overlay.classList.add('hidden'), 500));
    setTimeout(() => overlay.classList.add('hidden'), 2500); // safety fallback
}

function initRippleButtons() {
    document.querySelectorAll('.btn, .btn-small, .icon-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const ripple = document.createElement('span');
            ripple.className = 'ripple-el';
            ripple.style.width = ripple.style.height = `${size}px`;
            ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
            ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
            this.appendChild(ripple);
            setTimeout(() => ripple.remove(), 650);
        });
    });
}

function initRevealOnScroll() {
    const els = document.querySelectorAll('.reveal');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12 });
    els.forEach(el => observer.observe(el));
}

function showToast(message, type = 'info', icon = 'fa-circle-info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid ${icon}"></i><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('visible'));

    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function initToasts() {
    setTimeout(() => showToast('Connected to ContactIQ pipeline', 'success', 'fa-circle-check'), 1200);
}

/* ============================================================
   Boot
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
    applyTheme(state.theme);
    initLoader();
    initSidebar();
    initTopbar();
    initRefreshButtons();
    initRippleButtons();
    initRevealOnScroll();
    initToasts();

    updateGreetingAndDate();
    setInterval(updateGreetingAndDate, 60000);

    await loadDashboardAll();
});
