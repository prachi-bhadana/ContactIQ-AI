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

/* ---------------- boot ---------------- */
document.addEventListener('DOMContentLoaded', () => {
    applyTheme(state.theme);
    initLoader();
    initSidebar();
    initTopbar();
    initRippleButtons();
    initRevealOnScroll();
    initToasts();

    animateKpis();
    loadQueue();
    loadTimeline();
    loadHealth();
    initCharts();

    updateGreetingAndDate();
    setInterval(updateGreetingAndDate, 60000);

    document.getElementById('processBtn').addEventListener('click', runProcessing);
    document.getElementById('docsBtn').addEventListener('click', () => {
        window.open(`${API_BASE}/docs`, '_blank');
    });
    document.getElementById('refreshQueue').addEventListener('click', () => {
        loadQueue(true);
        showToast('Queue refreshed', 'success', 'fa-rotate');
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

async function loadQueue(forceSkeleton = false){
    const tbody = document.getElementById('queueBody');

    if (forceSkeleton){
        tbody.innerHTML = Array.from({length: 4}).map(() => `
            <tr>
                <td colspan="7"><span class="skeleton"></span></td>
            </tr>`).join('');
    }

    const data = await safeFetch('/process-folder', demoQueue);
    renderQueue(Array.isArray(data) ? data : demoQueue);
}

function renderQueue(rows){
    const tbody = document.getElementById('queueBody');
    tbody.innerHTML = rows.map((row, i) => {
        const statusMap = {
            completed: { cls: 'completed', label: 'Completed' },
            running: { cls: 'running', label: 'Running' },
            failed: { cls: 'failed', label: 'Failed' },
            pending: { cls: 'pending', label: 'Pending' },
        };
        const s = statusMap[row.status] || statusMap.pending;
        return `
        <tr style="animation-delay:${i * 0.06}s">
            <td>${row.file}</td>
            <td><span class="badge ${s.cls}">${s.label}</span></td>
            <td>${row.time}</td>
            <td>${row.contacts}</td>
            <td>${row.ocr !== null ? row.ocr + '%' : '—'}</td>
            <td>${row.conf !== null ? row.conf + '%' : '—'}</td>
            <td>
                <button class="row-action" title="View"><i class="fa-solid fa-eye"></i></button>
            </td>
        </tr>`;
    }).join('');
}

/* ---------------- activity timeline ---------------- */
const demoActivity = [
    { type: 'success', icon: 'fa-check', title: 'Resume processed', detail: 'resume_bulk_042.docx • 2 seconds ago' },
    { type: 'info', icon: 'fa-wand-magic-sparkles', title: 'OCR completed', detail: 'visiting_card_017.jpg • 1 minute ago' },
    { type: 'warn', icon: 'fa-clone', title: 'Duplicate contact detected', detail: 'John Doe • 96% match confidence' },
    { type: 'success', icon: 'fa-file-import', title: 'Spreadsheet imported', detail: 'contacts_master.xlsx • 42 contacts added' },
    { type: 'danger', icon: 'fa-triangle-exclamation', title: 'Processing failed', detail: 'scanned_form_09.pdf • low OCR confidence' },
];

async function loadTimeline(){
    const data = await safeFetch('/logs', demoActivity);
    const list = Array.isArray(data) ? data : demoActivity;
    const timeline = document.getElementById('timeline');
    timeline.innerHTML = list.map((item, i) => `
        <div class="timeline-item" style="animation-delay:${i * 0.08}s">
            <div class="timeline-icon ${item.type}"><i class="fa-solid ${item.icon}"></i></div>
            <div class="timeline-text">
                <h4>${item.title}</h4>
                <p>${item.detail}</p>
            </div>
        </div>
    `).join('');
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

async function loadHealth(){
    const data = await safeFetch('/status', demoHealth);
    const merged = {
        statuses: data.statuses || demoHealth.statuses,
        metrics: data.metrics || demoHealth.metrics,
    };
    const grid = document.getElementById('healthGrid');

    const statusCards = merged.statuses.map(s => `
        <div class="health-card">
            <h4>${s.label}</h4>
            <span class="health-pill ${s.up ? '' : 'down'}">
                <i class="fa-solid fa-circle pulse-dot"></i> ${s.up ? 'Operational' : 'Down'}
            </span>
        </div>
    `).join('');

    const metricCards = merged.metrics.map(m => `
        <div class="health-card">
            <h4>${m.label}</h4>
            <div class="health-ring" style="--p:0" data-target="${m.percent}">
                <span>${m.percent}%</span>
            </div>
        </div>
    `).join('');

    grid.innerHTML = statusCards + metricCards;

    // animate rings after render
    requestAnimationFrame(() => {
        grid.querySelectorAll('.health-ring').forEach(ring => {
            const target = parseFloat(ring.dataset.target || '0');
            let current = 0;
            const step = () => {
                current += (target - current) * 0.12;
                ring.style.setProperty('--p', current.toFixed(1));
                if (Math.abs(target - current) > 0.5) requestAnimationFrame(step);
                else ring.style.setProperty('--p', target);
            };
            requestAnimationFrame(step);
        });
    });
}

/* ---------------- charts ---------------- */
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

function initCharts(){
    const t = chartTheme();
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.color = t.text;

    new Chart(document.getElementById('trendChart'), {
        type: 'line',
        data: {
            labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
            datasets: [{
                label: 'Files processed',
                data: [120, 190, 160, 220, 260, 180, 240],
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

    new Chart(document.getElementById('dupChart'), {
        type: 'bar',
        data: {
            labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
            datasets: [{
                label: 'Duplicates found',
                data: [8, 12, 6, 14, 9, 5, 11],
                backgroundColor: t.warn,
                borderRadius: 6,
                maxBarThickness: 26,
            }]
        },
        options: chartOptions(t)
    });

    new Chart(document.getElementById('ocrChart'), {
        type: 'doughnut',
        data: {
            labels: ['High confidence', 'Medium', 'Low'],
            datasets: [{
                data: [78, 16, 6],
                backgroundColor: [t.success, t.accent2, t.danger],
                borderWidth: 0,
            }]
        },
        options: {
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, padding: 16 } } },
            cutout: '68%',
        }
    });

    new Chart(document.getElementById('confChart'), {
        type: 'line',
        data: {
            labels: ['W1','W2','W3','W4','W5','W6'],
            datasets: [{
                label: 'AI confidence',
                data: [88, 90, 93, 91, 95, 97],
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
async function runProcessing(){
    showToast('Processing started…', 'info', 'fa-play');
    try{
        const res = await fetch(`${API_BASE}/process-folder`, { method: 'POST' });
        if (!res.ok) throw new Error('Request failed');
        showToast('Processing job queued successfully', 'success', 'fa-circle-check');
        loadQueue(true);
    }catch(err){
        console.warn('[ContactIQ] /process-folder unreachable, simulating locally —', err.message);
        showToast('Backend unreachable — showing demo results', 'warn', 'fa-triangle-exclamation');
        loadQueue(true);
    }
}