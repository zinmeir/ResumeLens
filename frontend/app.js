/* ============================================================
   ResumeLens — frontend logic
   ============================================================ */

// ---------- THEME ----------
const themeToggle = document.getElementById('themeToggle');
const root = document.documentElement;

const savedTheme = localStorage.getItem('tm-theme');
if (savedTheme) {
  root.setAttribute('data-theme', savedTheme);
} else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
  root.setAttribute('data-theme', 'dark');
}

themeToggle.addEventListener('click', () => {
  const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  localStorage.setItem('tm-theme', next);
});

// ---------- ELEMENTS ----------
const dropzone        = document.getElementById('dropzone');
const resumeInput     = document.getElementById('resumeInput');
const dropzoneEmpty   = document.getElementById('dropzoneEmpty');
const dropzoneFilled  = document.getElementById('dropzoneFilled');
const fileNameEl      = document.getElementById('fileName');
const fileSizeEl      = document.getElementById('fileSize');
const clearFileBtn    = document.getElementById('clearFile');

const jdInput        = document.getElementById('jdInput');
const jdCharCount    = document.getElementById('jdCharCount');

const analyzeBtn     = document.getElementById('analyzeBtn');
const btnLabel       = analyzeBtn.querySelector('.btn-label');
const btnArrow       = analyzeBtn.querySelector('.btn-arrow');
const btnSpinner     = analyzeBtn.querySelector('.btn-spinner');

const results        = document.getElementById('results');
const errorBanner    = document.getElementById('errorBanner');
const errorText      = document.getElementById('errorText');

const scoreNum       = document.getElementById('scoreNum');
const scoreLabel     = document.getElementById('scoreLabel');
const gaugeFill      = document.getElementById('gaugeFill');

const missingChips   = document.getElementById('missingChips');
const matchedChips   = document.getElementById('matchedChips');
const missingCount   = document.getElementById('missingCount');
const matchedCount   = document.getElementById('matchedCount');
const suggestionsEl  = document.getElementById('suggestionsList');
const resumePreview  = document.getElementById('resumePreview');

let currentFile = null;

// ---------- FILE HANDLING ----------
function setFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    showError('Please upload a PDF file.');
    return;
  }
  currentFile = file;
  fileNameEl.textContent = file.name;
  fileSizeEl.textContent = formatBytes(file.size);
  dropzoneEmpty.hidden = true;
  dropzoneFilled.hidden = false;
  dropzone.classList.add('has-file');
  hideError();
}

function clearFile(e) {
  if (e) e.preventDefault();
  currentFile = null;
  resumeInput.value = '';
  dropzoneEmpty.hidden = false;
  dropzoneFilled.hidden = true;
  dropzone.classList.remove('has-file');
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

resumeInput.addEventListener('change', (e) => setFile(e.target.files[0]));
clearFileBtn.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  clearFile();
});

// Drag & drop
['dragenter', 'dragover'].forEach(ev =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragging');
  })
);
['dragleave', 'drop'].forEach(ev =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragging');
  })
);
dropzone.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files[0];
  if (file) setFile(file);
});

// ---------- TEXTAREA COUNTER ----------
function updateCharCount() {
  const n = jdInput.value.length;
  jdCharCount.textContent = `${n.toLocaleString()} character${n === 1 ? '' : 's'}`;
}
jdInput.addEventListener('input', updateCharCount);
updateCharCount();

// ---------- ERRORS ----------
function showError(msg) {
  errorText.textContent = msg;
  errorBanner.hidden = false;
  errorBanner.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function hideError() {
  errorBanner.hidden = true;
}

// ---------- ANALYZE ----------
analyzeBtn.addEventListener('click', async () => {
  hideError();

  if (!currentFile) {
    showError('Please upload a resume PDF first.');
    return;
  }
  if (!jdInput.value.trim()) {
    showError('Please paste the job description.');
    return;
  }

  setLoading(true);

  try {
    const formData = new FormData();
    formData.append('resume', currentFile);
    formData.append('job_description', jdInput.value);

    const res = await fetch('/api/analyze', { method: 'POST', body: formData });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Analysis failed.' }));
      throw new Error(err.detail || `Server error (${res.status})`);
    }

    const data = await res.json();
    renderResults(data);
  } catch (err) {
    showError(err.message || 'Something went wrong. Please try again.');
  } finally {
    setLoading(false);
  }
});

function setLoading(loading) {
  analyzeBtn.disabled = loading;
  btnLabel.textContent = loading ? 'Analyzing…' : 'Analyze Match';
  btnArrow.hidden = loading;
  btnSpinner.hidden = !loading;
}

// ---------- RENDERING ----------
const GAUGE_CIRC = 2 * Math.PI * 84; // r=84

function renderResults(data) {
  results.hidden = false;

  // Animate gauge + score number
  const offset = GAUGE_CIRC * (1 - data.score / 100);
  gaugeFill.style.strokeDashoffset = offset;
  gaugeFill.style.stroke = scoreColor(data.score);
  animateNumber(scoreNum, 0, data.score, 1200);

  scoreLabel.textContent = data.label;
  scoreLabel.style.color = scoreColor(data.score);

  // Chips
  renderChips(missingChips, data.missing_keywords, 'chip-missing', 'No major missing keywords detected.');
  renderChips(matchedChips, data.matched_keywords, 'chip-matched', 'No keyword overlap found.');
  missingCount.textContent = data.missing_keywords.length;
  matchedCount.textContent = data.matched_keywords.length;

  // Suggestions
  suggestionsEl.innerHTML = '';
  data.suggestions.forEach(s => {
    const li = document.createElement('li');
    li.textContent = s;
    suggestionsEl.appendChild(li);
  });

  // Preview
  resumePreview.textContent = data.resume_preview;

  // Smooth scroll to results
  setTimeout(() => {
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 80);
}

function renderChips(container, items, cls, emptyMsg) {
  container.innerHTML = '';
  if (!items.length) {
    container.innerHTML = `<span class="chips-empty">${emptyMsg}</span>`;
    return;
  }
  items.forEach(text => {
    const span = document.createElement('span');
    span.className = `chip ${cls}`;
    span.textContent = text;
    container.appendChild(span);
  });
}

function scoreColor(score) {
  if (score >= 75) return getCss('--success');
  if (score >= 55) return getCss('--accent');
  if (score >= 35) return getCss('--warn');
  return getCss('--danger');
}

function getCss(name) {
  return getComputedStyle(root).getPropertyValue(name).trim();
}

function animateNumber(el, from, to, duration) {
  const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
    const value = from + (to - from) * eased;
    el.textContent = Math.round(value);
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = Math.round(to);
  }
  requestAnimationFrame(tick);
}

// ---------- HERO STATS: count-up on scroll into view ----------
const heroStats = document.getElementById('heroStats');

if (heroStats && 'IntersectionObserver' in window) {
  const statObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      heroStats.classList.add('is-visible');
      // Kick off count-up for each .stat-num
      heroStats.querySelectorAll('.stat-num').forEach((el) => {
        const target   = parseFloat(el.dataset.target ?? '0');
        const decimals = parseInt(el.dataset.decimals ?? '0', 10);
        const prefix   = el.dataset.prefix ?? '';
        const suffix   = el.dataset.suffix ?? '';
        countUp(el, 0, target, 1600, decimals, prefix, suffix);
      });
      statObserver.unobserve(heroStats); // animate once
    });
  }, { threshold: 0.35 });

  statObserver.observe(heroStats);
} else if (heroStats) {
  // Fallback for browsers without IntersectionObserver — show final values
  heroStats.classList.add('is-visible');
  heroStats.querySelectorAll('.stat-num').forEach((el) => {
    const target   = parseFloat(el.dataset.target ?? '0');
    const decimals = parseInt(el.dataset.decimals ?? '0', 10);
    const prefix   = el.dataset.prefix ?? '';
    const suffix   = el.dataset.suffix ?? '';
    el.textContent = `${prefix}${target.toFixed(decimals)}${suffix}`;
  });
}

function countUp(el, from, to, duration, decimals, prefix, suffix) {
  const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    // easeOutQuart — feels punchy at the start, settles smoothly
    const eased = 1 - Math.pow(1 - t, 4);
    const value = from + (to - from) * eased;
    el.textContent = `${prefix}${value.toFixed(decimals)}${suffix}`;
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = `${prefix}${to.toFixed(decimals)}${suffix}`;
  }
  requestAnimationFrame(tick);
}
