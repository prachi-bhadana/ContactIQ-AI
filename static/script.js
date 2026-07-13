/* ============================================================
   ContactIQ AI — Dashboard Logic
   Vanilla ES6. Fetches live data from the FastAPI backend and
   falls back to demo data if an endpoint isn't reachable, so the
   UI is always fully populated.
   ============================================================ */

const API_BASE = ''; // same-origin FastAPI backend, e.g. '' or 'http://localhost:8000'

const state = {
    theme: localStorage.getItem('contactiq-theme') || 'dark',
    sidebarCollapsed: false,
};




async function loadDashboard() {
    try {
        const response = await fetch("/dashboard-data");
        const data = await response.json();
        console.log(data)

        document.getElementById("totalFiles").textContent = data.total_files;
        document.getElementById("contacts").textContent = data.contacts;
        document.getElementById("newContacts").textContent = data.new_contacts;
        document.getElementById("duplicates").textContent = data.duplicates;
        document.getElementById("failed").textContent = data.failed;
        document.getElementById("accuracy").textContent = data.accuracy + "%";
        document.getElementById("ocrConfidence").textContent = data.ocr_confidence + "%";
        document.getElementById("aiConfidence").textContent = data.ai_confidence + "%";

        document.getElementById("lastSync").textContent =
            "Last synced: " + new Date().toLocaleTimeString();

    } catch (error) {
        console.error("Dashboard loading failed:", error);
    }
}



/* ---------------- boot ---------------- */
document.addEventListener('DOMContentLoaded', async () => {
    applyTheme(state.theme);
    initLoader();
    initSidebar();
    initTopbar();
    initRippleButtons();
    initRevealOnScroll();
    initToasts();
    //animateKpis();
    await loadDashboard();
    await loadQueue();
    await loadTimeline();
    await loadHealth();
    await initCharts();


    const contactsMenu = document.getElementById('contactsMenu');

        if (contactsMenu) {
            contactsMenu.addEventListener('click', async (e) => {
                e.preventDefault();

                // Update active sidebar item
                document.querySelectorAll('.menu-item').forEach(item => {
                    item.classList.remove('active');
                });

                contactsMenu.classList.add('active');

                // Get main content
                const mainContent = document.getElementById('mainContent');

                // Hide all dashboard sections
                Array.from(mainContent.children).forEach(child => {
                    child.style.display = 'none';
                });

                // Show only Contacts View
                const contactsView = document.getElementById('contactsView');

                if (contactsView) {
                    contactsView.style.display = 'block';
                }

                // Load contacts from backend
                await loadContacts();
            });
        }


    const dashboardMenu = document.getElementById('dashboardMenu');

        if (dashboardMenu) {
            dashboardMenu.addEventListener('click', (e) => {
                e.preventDefault();

                const mainContent = document.getElementById('mainContent');
                const contactsView = document.getElementById('contactsView');

                // Hide Contacts View
                if (contactsView) {
                    contactsView.style.display = 'none';
                }

                // Show all normal dashboard sections again
                Array.from(mainContent.children).forEach(child => {
                    if (child.id !== 'contactsView') {
                        child.style.display = '';
                    }
                });

                // Update active sidebar item
                document.querySelectorAll('.menu-item').forEach(item => {
                    item.classList.remove('active');
                });

                dashboardMenu.classList.add('active');
            });
        }

    const processingQueueMenu = document.getElementById('processingQueueMenu');

        if (processingQueueMenu) {
            processingQueueMenu.addEventListener('click', async (e) => {
                e.preventDefault();

                const mainContent = document.getElementById('mainContent');
                const processingQueueView = document.getElementById('processingQueueView');

                // Hide every dashboard/view section
                Array.from(mainContent.children).forEach(child => {
                    child.style.display = 'none';
                });

                // Show Processing Queue view
                if (processingQueueView) {
                    processingQueueView.style.display = 'block';
                }

                // Update active sidebar item
                document.querySelectorAll('.menu-item').forEach(item => {
                    item.classList.remove('active');
                });

                processingQueueMenu.classList.add('active');

                // Load real processing queue data
                await loadProcessingQueueView();
            });
        }

async function loadProcessingQueueView() {
    try {
        const response = await fetch(`${API_BASE}/processing-queue`);

        if (!response.ok) {
            throw new Error(`Processing Queue API failed: ${response.status}`);
        }

        const data = await response.json();

        console.log("Processing Queue View Data:", data);

        const tbody = document.getElementById('processingQueueViewBody');

        if (!tbody) return;

        tbody.innerHTML = '';

        if (!data || data.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center;">
                        No processing activity found.
                    </td>
                </tr>
            `;
            return;
        }

        data.forEach(item => {
            const row = document.createElement('tr');

            row.innerHTML = `
                <td>${item.file || 'Unknown'}</td>

                <td>
                    <span class="status ${item.status || ''}">
                        ${item.status || 'Unknown'}
                    </span>
                </td>

                <td>${item.time || '—'}</td>

                <td>${item.contacts ?? 0}</td>

                <td>${item.ocr_accuracy ?? '—'}</td>

                <td>${item.confidence ?? '—'}</td>

                <td>
                    <button class="btn-small">
                        <i class="fa-solid fa-eye"></i>
                        View
                    </button>
                </td>
            `;

            tbody.appendChild(row);
        });

    } catch (error) {
        console.error("Failed to load Processing Queue View:", error);
    }
}

const refreshProcessingQueueBtn =
    document.getElementById('refreshProcessingQueueBtn');

if (refreshProcessingQueueBtn) {
    refreshProcessingQueueBtn.addEventListener('click', async () => {
        await loadProcessingQueueView();
    });
}



    updateGreetingAndDate();
    setInterval(updateGreetingAndDate, 60000);

    document.getElementById('processBtn').addEventListener('click', runProcessing);
    document.getElementById('docsBtn').addEventListener('click', () => {
        window.open(`${API_BASE}/docs`, '_blank');
    });
   
    document.getElementById('notifBtn').addEventListener('click', () => {
        showToast('3 files finished processing in the last hour', 'info', 'fa-bell');
    });
});

/* ---------------- loader ---------------- */
function initLoader(){
    const overlay = document.getElementById('loaderOverlay');
    window.addEventListener('load', () => {
        setTimeout(() => overlay.classList.add('hidden'), 500);
    });
    // safety fallback in case 'load' already fired
    setTimeout(() => overlay.classList.add('hidden'), 2500);
}

/* ---------------- theme ---------------- */
function applyTheme(theme){
    document.documentElement.setAttribute('data-theme', theme);
    const icon = document.querySelector('#themeToggle i');
    if (icon){
        icon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    }
    state.theme = theme;
    localStorage.setItem('contactiq-theme', theme);
}

function initTopbar(){
    document.getElementById('themeToggle').addEventListener('click', () => {
        applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    });

    document.getElementById('mobileToggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('mobile-open');
    });
}

function updateGreetingAndDate(){
    const now = new Date();
    const hour = now.getHours();
    let greeting = 'Good evening';
    if (hour < 12) greeting = 'Good morning';
    else if (hour < 18) greeting = 'Good afternoon';

    document.getElementById('greeting').textContent = `${greeting}, Admin`;
    document.getElementById('dateDisplay').textContent = now.toLocaleDateString(undefined, {
        weekday: 'long', month: 'long', day: 'numeric'
    });

    const lastSync = document.getElementById('lastSync');
    if (lastSync) lastSync.textContent = `Last synced ${now.toLocaleTimeString(undefined, {hour:'2-digit', minute:'2-digit'})}`;
}

/* ---------------- sidebar ---------------- */
function initSidebar(){
    const sidebar = document.getElementById('sidebar');
    const btn = document.getElementById('collapseBtn');

    btn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        state.sidebarCollapsed = sidebar.classList.contains('collapsed');
    });

    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            sidebar.classList.remove('mobile-open');
        });
    });
}

/* ---------------- ripple buttons ---------------- */
function initRippleButtons(){
    document.querySelectorAll('.btn, .btn-small, .icon-btn').forEach(btn => {
        btn.addEventListener('click', function(e){
            const rect = this.getBoundingClientRect();
            const ripple = document.createElement('span');
            const size = Math.max(rect.width, rect.height);
            ripple.className = 'ripple-el';
            ripple.style.width = ripple.style.height = `${size}px`;
            ripple.style.left = `${e.clientX - rect.left - size/2}px`;
            ripple.style.top = `${e.clientY - rect.top - size/2}px`;
            this.appendChild(ripple);
            setTimeout(() => ripple.remove(), 650);
        });
    });
}

/* ---------------- scroll reveal ---------------- */
function initRevealOnScroll(){
    const els = document.querySelectorAll('.reveal');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting){
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12 });
    els.forEach(el => observer.observe(el));
}

/* ---------------- toasts ---------------- */
function initToasts(){
    setTimeout(() => showToast('Connected to ContactIQ pipeline', 'success', 'fa-circle-check'), 1200);
}

function showToast(message, type = 'info', icon = 'fa-circle-info'){
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid ${icon}"></i><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('leaving');
        setTimeout(() => toast.remove(), 350);
    }, 4200);
}

/* ---------------- helper: safe fetch with fallback ---------------- */
async function safeFetch(path, fallback){
    try{
        const res = await fetch(`${API_BASE}${path}`, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) throw new Error(`${path} responded ${res.status}`);
        return await res.json();
    }catch(err){
        console.warn(`[ContactIQ] Using demo data for ${path} —`, err.message);
        return fallback;
    }
}

/* ---------------- KPI counters ---------------- */
function animateKpis(){
    document.querySelectorAll('.kpi-card').forEach(card => {
        const target = parseFloat(card.dataset.target || '0');
        const suffix = card.dataset.suffix || '';
        const countEl = card.querySelector('.count');
        const ring = card.querySelector('.kpi-ring');
        const ringPercent = suffix === '%' ? target : Math.min(100, (target / 20));

        const duration = 1400;
        const start = performance.now();

        function tick(now){
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            countEl.textContent = Math.round(eased * target) + suffix;
            ring.style.setProperty('--p', (eased * ringPercent).toFixed(1));
            if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    });
}

/* ---------------- processing queue ---------------- */
const demoQueue = [
    { file: 'resume_bulk_042.docx', status: 'completed', time: '2.4s', contacts: 1, ocr: 98, conf: 96 },
    { file: 'visiting_card_017.jpg', status: 'running', time: '1.2s', contacts: 0, ocr: null, conf: null },
    { file: 'contacts_master.xlsx', status: 'completed', time: '0.8s', contacts: 42, ocr: 100, conf: 99 },
    { file: 'scanned_form_09.pdf', status: 'failed', time: '4.1s', contacts: 0, ocr: 41, conf: 22 },
    { file: 'email_signature.png', status: 'pending', time: '--', contacts: 0, ocr: null, conf: null },
];

/* ---------------- processing queue ---------------- */

async function loadQueue(forceSkeleton = false) {
    const tbody = document.getElementById("queueBody");

    if (!tbody) {
        console.error("queueBody element not found in HTML");
        return;
    }

    if (forceSkeleton) {
        tbody.innerHTML = Array.from({ length: 4 }).map(() => `
            <tr>
                <td colspan="7">
                    <span class="skeleton"></span>
                </td>
            </tr>
        `).join("");
    }

    try {
        const response = await fetch("/processing-queue");

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        const data = await response.json();

        console.log("Processing Queue Data:", data);

        renderQueue(data);

    } catch (error) {
        console.error("Processing queue loading failed:", error);

        tbody.innerHTML = `
            <tr>
                <td colspan="7">
                    Unable to load processing queue.
                </td>
            </tr>
        `;
    }
}


function renderQueue(rows) {
    const tbody = document.getElementById("queueBody");

    if (!Array.isArray(rows) || rows.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7">No files in processing queue.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = rows.map((row, index) => {

        const status = row.status.toLowerCase();

        let statusClass = "pending";

        if (status === "completed") {
            statusClass = "completed";
        } else if (status === "processing") {
            statusClass = "running";
        } else if (status === "failed") {
            statusClass = "failed";
        }

        return `
            <tr style="animation-delay:${index * 0.06}s">

                <td>${row.filename}</td>

                <td>
                    <span class="badge ${statusClass}">
                        ${row.status}
                    </span>
                </td>

                <td>${row.time}</td>

                <td>${row.contacts}</td>

                <td>${row.accuracy}</td>

                <td>${row.confidence}</td>

                <td>
                    <button class="row-action" title="View">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                </td>

            </tr>
        `;
    }).join("");
}

/* ---------------- activity timeline ---------------- */
const demoActivity = [
    { type: 'success', icon: 'fa-check', title: 'Resume processed', detail: 'resume_bulk_042.docx • 2 seconds ago' },
    { type: 'info', icon: 'fa-wand-magic-sparkles', title: 'OCR completed', detail: 'visiting_card_017.jpg • 1 minute ago' },
    { type: 'warn', icon: 'fa-clone', title: 'Duplicate contact detected', detail: 'John Doe • 96% match confidence' },
    { type: 'success', icon: 'fa-file-import', title: 'Spreadsheet imported', detail: 'contacts_master.xlsx • 42 contacts added' },
    { type: 'danger', icon: 'fa-triangle-exclamation', title: 'Processing failed', detail: 'scanned_form_09.pdf • low OCR confidence' },
];

async function loadTimeline() {
    const data = await safeFetch('/logs', []);

    console.log("Timeline data:", data);

    const timeline = document.getElementById('timeline');

    if (!timeline) return;

    


    timeline.innerHTML = data.map((item, i) => {

        let type = 'info';
        let icon = 'fa-file';
        let title = 'File processed';

        if (item.status === 'success') {
            type = 'success';
            icon = 'fa-check';
            title = 'Contact saved successfully';
        } 
        else if (item.status === 'duplicate') {
            type = 'warn';
            icon = 'fa-clone';
            title = 'Duplicate contact detected';
        } 
        else if (item.status === 'failed') {
            type = 'danger';
            icon = 'fa-triangle-exclamation';
            title = 'Processing failed';
        }

        return `
            <div class="timeline-item" style="animation-delay:${i * 0.08}s">
                <div class="timeline-icon ${type}">
                    <i class="fa-solid ${icon}"></i>
                </div>

                <div class="timeline-text">
                    <h4>${title}</h4>
                    <p>${item.file}</p>
                </div>
            </div>
        `;
    }).join('');
}

/* ---------------- AI health panel ---------------- */
const demoHealth = {
    statuses: [
        { label: 'OCR Engine', up: true },
        { label: 'LLM Service', up: true },
        { label: 'Database', up: true },
        { label: 'API Gateway', up: true },
    ],
    metrics: [
        { label: 'Storage', percent: 61 },
        { label: 'CPU', percent: 42 },
        { label: 'Memory', percent: 68 },
    ]
};

async function loadHealth() {
    try {
        const response = await fetch('/status');

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        const data = await response.json();

        console.log("AI Health Data:", data);

        const grid = document.getElementById('healthGrid');

        const statuses = [
            {
                label: 'ContactIQ Pipeline',
                up: data.status === 'running'
            },
            {
                label: 'Database',
                up: true
            },
            {
                label: 'API Server',
                up: true
            }
        ];

        const metrics = [
            {
                label: 'Processing Accuracy',
                percent: data.processing_accuracy
            },
            {
                label: 'Files Processed',
                value: data.total_files
            },
            {
                label: 'Contacts Extracted',
                value: data.total_contacts
            }
        ];

        const statusCards = statuses.map(s => `
            <div class="health-card">
                <h4>${s.label}</h4>

                <span class="health-pill ${s.up ? '' : 'down'}">
                    <i class="fa-solid fa-circle pulse-dot"></i>
                    ${s.up ? 'Operational' : 'Down'}
                </span>
            </div>
        `).join('');

        const metricCards = metrics.map(m => `
            <div class="health-card">
                <h4>${m.label}</h4>

                ${
                    m.percent !== undefined
                    ? `
                        <div class="health-ring"
                             style="--p:${m.percent}"
                             data-target="${m.percent}">
                            <span>${m.percent}%</span>
                        </div>
                    `
                    : `<strong class="health-value">${m.value}</strong>`
                }
            </div>
        `).join('');

        grid.innerHTML = statusCards + metricCards;

    } catch (error) {
        console.error("AI Health Panel loading failed:", error);
    }
}

/* ---------------- charts ---------------- */
let trendChartInstance = null;
let dupChartInstance = null;
let ocrChartInstance = null;
let confChartInstance = null;
function chartTheme(){
    const styles = getComputedStyle(document.documentElement);
    return {
        text: styles.getPropertyValue('--text-1').trim() || '#c6cbdc',
        grid: 'rgba(255,255,255,.06)',
        accent: styles.getPropertyValue('--accent').trim() || '#6366f1',
        accent2: styles.getPropertyValue('--accent-2').trim() || '#06b6d4',
        success: '#10b981',
        warn: '#f59e0b',
        danger: '#ef4444',
    };
}

async function initCharts(){
    const chartIds = ['trendChart', 'dupChart', 'ocrChart', 'confChart'];

    chartIds.forEach(id => {
        const canvas = document.getElementById(id);

        if (canvas) {
            const existingChart = Chart.getChart(canvas);

            if (existingChart) {
                existingChart.destroy();
            }
        }
    });
    const t = chartTheme();

    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.color = t.text;

    try {
        const response = await fetch(`${API_BASE}/analytics`);

        if (!response.ok) {
            throw new Error(`Analytics API failed: ${response.status}`);
        }

        const analyticsData = await response.json();

        console.log("Analytics Data:", analyticsData);

        if (trendChartInstance) trendChartInstance.destroy();
        if (dupChartInstance) dupChartInstance.destroy();
        if (ocrChartInstance) ocrChartInstance.destroy();
        if (confChartInstance) confChartInstance.destroy();

        trendChartInstance = new Chart(document.getElementById('trendChart'), {
            type: 'line',
            data: {
                labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
                datasets: [{
                    label: 'Files processed',
                    data: analyticsData.files_processed,
                    borderColor: t.accent2,
                    backgroundColor: `${t.accent2}22`,
                    fill: true,
                    tension: .4,
                    pointRadius: 0,
                    borderWidth: 2,
                }]
            },
            options: chartOptions(t)
        });

        dupChartInstance = new Chart(document.getElementById('dupChart'), {
            type: 'bar',
            data: {
                labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
                datasets: [{
                    label: 'Duplicates found',
                    data: analyticsData.duplicates_found,
                    backgroundColor: t.warn,
                    borderRadius: 6,
                    maxBarThickness: 26,
                }]
            },
            options: chartOptions(t)
        });

        ocrChartInstance = new Chart(document.getElementById('ocrChart'), {
            type: 'doughnut',
            data: {
                labels: ['High confidence', 'Medium', 'Low'],
                datasets: [{
                    data: analyticsData.ocr_distribution,
                    backgroundColor: [t.success, t.accent2, t.danger],
                    borderWidth: 0,
                }]
            },
            options: {
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            boxWidth: 10,
                            padding: 16
                        }
                    }
                },
                cutout: '68%',
            }
        });

        confChartInstance = new Chart(document.getElementById('confChart'), {
            type: 'line', 
            data: {
                labels: ['W1','W2','W3','W4','W5','W6'],
                datasets: [{
                    label: 'AI confidence',
                    data: analyticsData.ai_confidence,
                    borderColor: t.accent,
                    backgroundColor: `${t.accent}22`,
                    fill: true,
                    tension: .45,
                    pointRadius: 0,
                    borderWidth: 2,
                }]
            },
            options: chartOptions(t)
        });

    } catch (error) {
        console.error("Failed to load analytics:", error);
    }
}


function chartOptions(t){
    return {
        plugins: { legend: { display: false } },
        scales: {
            x: { grid: { color: t.grid }, ticks: { color: t.text } },
            y: { grid: { color: t.grid }, ticks: { color: t.text } },
        },
        maintainAspectRatio: false,
        responsive: true,
    };
}

/* ---------------- run processing action ---------------- */
async function runProcessing() {
    const processBtn = document.getElementById('processBtn');

    processBtn.disabled = true;
    processBtn.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        Processing...
    `;

    showToast(
        'Processing started…',
        'info',
        'fa-play'
    );

    // Remember when processing started
    const startTime = Date.now();

    try {
        const res = await fetch(`${API_BASE}/process-folder`, {
            method: 'POST'
        });

        if (!res.ok) {
            throw new Error(`Request failed with status ${res.status}`);
        }

        const result = await res.json();

        console.log('Processing result:', result);

        // Refresh all live dashboard sections
        await loadDashboard();
        await loadQueue();
        await loadTimeline();
        await loadHealth();
        await initCharts();

        // Keep Processing... visible for at least 1 second
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 1000 - elapsed);

        if (remaining > 0) {
            await new Promise(resolve => setTimeout(resolve, remaining));
        }

        showToast(
            'Processing completed successfully',
            'success',
            'fa-circle-check'
        );

    } catch (err) {
        console.error('[ContactIQ] Processing failed:', err);

        showToast(
            'Processing failed. Please check the backend.',
            'danger',
            'fa-triangle-exclamation'
        );

    } finally {
        processBtn.disabled = false;
        processBtn.innerHTML = `
            <i class="fa-solid fa-play"></i>
            Run Processing
        `;
    }
}



/* ================= CONTACTS VIEW ================= */

let allContacts = [];

async function loadContacts() {
    const tableBody = document.getElementById('contactsTableBody');
    const countText = document.getElementById('contactsCount');

    if (!tableBody) return;

    tableBody.innerHTML = `
        <tr>
            <td colspan="8">Loading contacts...</td>
        </tr>
    `;

    try {
        const response = await fetch(`${API_BASE}/contacts`);

        if (!response.ok) {
            throw new Error(`Contacts API failed: ${response.status}`);
        }

        allContacts = await response.json();

        console.log("Contacts Data:", allContacts);

        renderContacts(allContacts);

    } catch (error) {
        console.error("Failed to load contacts:", error);

        tableBody.innerHTML = `
            <tr>
                <td colspan="8">Failed to load contacts.</td>
            </tr>
        `;

        if (countText) {
            countText.textContent = 'Unable to load contacts';
        }
    }
}


function renderContacts(contacts) {
    const tableBody = document.getElementById('contactsTableBody');
    const countText = document.getElementById('contactsCount');

    if (!tableBody) return;

    if (countText) {
        countText.textContent = `${contacts.length} contact${contacts.length !== 1 ? 's' : ''} found`;
    }

    if (contacts.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8">No contacts found.</td>
            </tr>
        `;
        return;
    }

    tableBody.innerHTML = contacts.map(contact => {

        const location = [contact.city, contact.country]
            .filter(Boolean)
            .join(', ') || '—';

        const confidence = contact.confidence != null
            ? `${contact.confidence}%`
            : '—';

        return `
            <tr>
                <td>
                    <strong>${contact.full_name || 'Unknown'}</strong>
                </td>

                <td>${contact.email || '—'}</td>

                <td>${contact.phone || '—'}</td>

                <td>${contact.organization || '—'}</td>

                <td>${contact.designation || '—'}</td>

                <td>${location}</td>

                <td>
                    <span class="status-pill success">
                        ${confidence}
                    </span>
                </td>

                <td>
                    <button
                        class="icon-action"
                        onclick="viewContact(${contact.id})"
                        title="View contact"
                    >
                        <i class="fa-solid fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}