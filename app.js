// ========== 状态 ==========
const state = {
  questions: [],
  results: {},
  meta: null,
  currentQ: 0,
  answers: [],
  scores: { timbre: 0, tempo: 0, space: 0, melody: 0 },
  range: null,
  spectrumAnim: null,
  progressAnim: null,
  isPlaying: true
};

const THRESHOLDS = { greyZone: 1 };
const DIM_ORDER = ['timbre', 'tempo', 'space', 'melody'];

// 16 种结果专属主色（也可以在 results.json 的 color 字段里覆盖）
const RESULT_COLORS = {
  HHHH: '#c81c3f', HHHL: '#d97545', HHLH: '#6b3d7a', HHLL: '#b47aa6',
  HLHH: '#4a8e6b', HLHL: '#c9a961', HLLH: '#4fb8d9', HLLL: '#1e5a8a',
  LHHH: '#7a4b8c', LHHL: '#e8a87c', LHLH: '#7ac6b5', LHLL: '#e89a7c',
  LLHH: '#6b7a8c', LLHL: '#e0b654', LLLH: '#8a94a8', LLLL: '#d68a4c'
};

// ========== 初始化 ==========
async function init() {
  try {
    const [q, r] = await Promise.all([
      fetch('data/questions.json').then(x => x.json()),
      fetch('data/results.json').then(x => x.json())
    ]);
    state.questions = q.questions;
    state.meta = q.meta;
    state.results = r.results;
    state.range = computeTheoreticalRange(state.questions);
    setupCursor();
    setupHero();
    setupEvents();
  } catch (e) {
    console.error('数据加载失败', e);
    document.body.innerHTML = '<div style="padding:40px;color:#f4f4f4;font-family:sans-serif">数据加载失败，请通过 GitHub Pages 或本地服务器打开。</div>';
  }
}

function setupCursor() {
  const cursor = document.getElementById('cursor');
  document.addEventListener('mousemove', e => {
    cursor.style.left = e.clientX + 'px';
    cursor.style.top = e.clientY + 'px';
  });
  document.addEventListener('mouseover', e => {
    if (e.target.closest('.interactive, button, .q-option')) cursor.classList.add('hover');
    else cursor.classList.remove('hover');
  });
}

function setupHero() {
  const wave = document.getElementById('heroWave');
  [15, 40, 70, 30, 90, 50, 80, 25, 60, 45].forEach((h, i) => {
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.height = h + '%';
    bar.style.animationDelay = (i * 0.1) + 's';
    wave.appendChild(bar);
  });
  document.getElementById('qTotal').textContent = '/ ' + state.questions.length;
}

function setupEvents() {
  document.getElementById('startBtn').addEventListener('click', startQuiz);
  document.getElementById('backBtn').addEventListener('click', prevQuestion);
  document.getElementById('retestBtn').addEventListener('click', restart);
  document.getElementById('mp3Prev').addEventListener('click', restart);
  document.getElementById('mp3Next').addEventListener('click', shareResult);
  document.getElementById('mp3Play').addEventListener('click', togglePlay);
  document.getElementById('shareBtn').addEventListener('click', shareResult);
  document.getElementById('downloadBtn').addEventListener('click', downloadResult);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// ========== 答题流程 ==========
function startQuiz() {
  state.currentQ = 0;
  state.answers = [];
  state.scores = { timbre: 0, tempo: 0, space: 0, melody: 0 };
  showScreen('quiz');
  renderQuestion();
}

function renderQuestion() {
  const q = state.questions[state.currentQ];
  const idx = state.currentQ + 1;
  document.getElementById('qIndex').textContent = 'Q' + String(idx).padStart(2, '0');
  document.getElementById('qText').textContent = q.text;

  const optionsEl = document.getElementById('qOptions');
  optionsEl.innerHTML = '';
  q.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'q-option interactive';
    const letter = String.fromCharCode(65 + i);
    btn.innerHTML = `
      <span class="opt-letter">${letter}</span>
      <span class="opt-text">
        ${escapeHtml(opt.text)}
        ${opt.tag ? `<span class="opt-tag">${escapeHtml(opt.tag)}</span>` : ''}
      </span>`;
    btn.addEventListener('click', () => selectOption(i));
    optionsEl.appendChild(btn);
  });

  renderProgress();
  document.getElementById('backBtn').disabled = state.currentQ === 0;
}

function renderProgress() {
  const wrap = document.getElementById('progressWave');
  wrap.innerHTML = '';
  state.questions.forEach((_, i) => {
    const b = document.createElement('div');
    b.className = 'p-bar';
    if (i < state.currentQ) b.classList.add('done');
    if (i === state.currentQ) b.classList.add('current');
    wrap.appendChild(b);
  });
}

function selectOption(idx) {
  const q = state.questions[state.currentQ];
  const opt = q.options[idx];
  if (state.answers[state.currentQ] !== undefined) {
    const prev = q.options[state.answers[state.currentQ]];
    Object.entries(prev.scores || {}).forEach(([k, v]) => state.scores[k] -= v);
  }
  state.answers[state.currentQ] = idx;
  Object.entries(opt.scores || {}).forEach(([k, v]) => state.scores[k] += v);

  if (state.currentQ < state.questions.length - 1) {
    state.currentQ++;
    renderQuestion();
  } else {
    finishQuiz();
  }
}

function prevQuestion() {
  if (state.currentQ > 0) {
    state.currentQ--;
    renderQuestion();
  }
}

// ========== 计算 ==========
function computeTheoreticalRange(questions) {
  const range = {};
  DIM_ORDER.forEach(d => range[d] = { min: 0, max: 0 });
  questions.forEach(q => {
    DIM_ORDER.forEach(d => {
      const vals = q.options.map(o => (o.scores && o.scores[d]) || 0);
      range[d].min += Math.min(...vals, 0);
      range[d].max += Math.max(...vals, 0);
    });
  });
  return range;
}

function getResultKey(scores) {
  return DIM_ORDER.map(d => scores[d] > 0 ? 'H' : 'L').join('');
}

// ========== 结果 ==========
function finishQuiz() {
  const key = getResultKey(state.scores);
  const result = state.results[key] || state.results['LLLL'];
  const color = (result && result.color) || RESULT_COLORS[key] || '#1e5a8a';
  document.getElementById('result').style.setProperty('--result-color', color);
  renderResult(key, result, state.scores);
  showScreen('result');
  requestAnimationFrame(() => {
    setupRevealObserver();
    startSpectrum(color);
    startProgressLoop();
  });
}

function renderResult(key, r, scores) {
  document.getElementById('resSong').textContent = r.songName || '';
  document.getElementById('resSongEn').textContent = r.songNameEn || '';
  document.getElementById('resRef').textContent = r.reference || '';
  document.getElementById('resKey').textContent = key.split('').join(' · ');
  document.getElementById('npTitle').textContent = (r.coreMelody && r.coreMelody.title) || r.songName;
  document.getElementById('npArtist').textContent = r.songName + (r.songNameEn ? ' · ' + r.songNameEn : '');

  const totalAbs = DIM_ORDER.reduce((s, d) => s + Math.abs(scores[d]), 0);
  const trackSec = 120 + totalAbs * 12;
  const mm = String(Math.floor(trackSec/60)).padStart(2,'0');
  const ss = String(trackSec%60).padStart(2,'0');
  document.getElementById('mp3Time').textContent = mm + ':' + ss;

  renderMP3Bars(scores);
  document.getElementById('resTemp').textContent = r.temperature || '';
  document.getElementById('resCoreTitle').textContent = (r.coreMelody && r.coreMelody.title) || '';
  document.getElementById('resCoreDesc').textContent = (r.coreMelody && r.coreMelody.desc) || '';

  const bgmEl = document.getElementById('resBgm');
  bgmEl.innerHTML = '';
  (r.bgm || []).forEach((item, i) => {
    const len = ['03:24', '04:12', '02:58'][i] || '03:00';
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="bgm-phase">${escapeHtml(item.phase)}</span>
      <div class="bgm-track">
        <div class="bgm-song">${escapeHtml(item.song)}</div>
        <div class="bgm-artist">${escapeHtml(item.artist || '')}</div>
        <div class="bgm-desc">${escapeHtml(item.desc || '')}</div>
      </div>
      <span class="bgm-len">${len}</span>`;
    bgmEl.appendChild(li);
  });

  document.getElementById('resMirrorChar').textContent = (r.literaryMirror && r.literaryMirror.character) || '';
  document.getElementById('resMirrorDesc').textContent = (r.literaryMirror && r.literaryMirror.desc) || '';

  const sparksEl = document.getElementById('resSparks');
  sparksEl.innerHTML = '';
  (r.sparks || []).forEach(s => {
    const card = document.createElement('div');
    card.className = 'spark-card';
    card.innerHTML = `
      <div class="spark-target">${escapeHtml(s.target)}</div>
      <div class="spark-target-key">CAT.NO ▸ ${escapeHtml(s.targetKey || '')}</div>
      <div class="spark-type">${escapeHtml(s.type || '')}</div>
      <div class="spark-desc">${escapeHtml(s.desc || '')}</div>`;
    sparksEl.appendChild(card);
  });

  document.getElementById('resTaleRef').textContent = (r.fairytale && r.fairytale.reference) || '';
  document.getElementById('resTaleContent').textContent = (r.fairytale && r.fairytale.content) || '';
  document.getElementById('resRx').textContent = r.prescription || '';
}

function renderMP3Bars(scores) {
  const container = document.getElementById('mp3Bars');
  container.innerHTML = '';
  const dims = state.meta.dimensions;

  dims.forEach((dim, idx) => {
    const val = scores[dim.key];
    const range = state.range[dim.key];
    const absMax = Math.max(Math.abs(range.min), Math.abs(range.max), 1);
    const pct = 50 + (val / absMax) * 50;
    const fillLeft = val >= 0 ? 50 : pct;
    const fillWidth = Math.abs(pct - 50);
    const isGrey = Math.abs(val) <= THRESHOLDS.greyZone;

    const row = document.createElement('div');
    row.className = 'eq-row' + (isGrey ? ' grey-zone' : '');
    row.innerHTML = `
      <div class="eq-name">${escapeHtml(dim.name)}</div>
      <div class="eq-track">
        <div class="eq-center"></div>
        <div class="eq-fill"></div>
        <div class="eq-head"></div>
      </div>
      <div class="eq-score">${val > 0 ? '+' : ''}${val}</div>
      <div class="eq-poles">
        <span>${escapeHtml(dim.low)}</span>
        <span>${escapeHtml(dim.high)}</span>
      </div>
      ${isGrey ? `<div class="eq-hint">⚠ 灰色地带 · H/L 特质并存</div>` : ''}`;
    container.appendChild(row);

    // 延迟设置最终位置以触发过渡
    setTimeout(() => {
      row.querySelector('.eq-fill').style.left = fillLeft + '%';
      row.querySelector('.eq-fill').style.width = fillWidth + '%';
      row.querySelector('.eq-head').style.left = pct + '%';
    }, 200 + idx * 150);
  });
}

// ========== 频谱可视化 ==========
function startSpectrum(color) {
  if (state.spectrumAnim) cancelAnimationFrame(state.spectrumAnim);
  const canvas = document.getElementById('spectrum');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function resize() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * (window.devicePixelRatio || 1);
    canvas.height = rect.height * (window.devicePixelRatio || 1);
  }
  resize();

  const barCount = 56;
  const phases = Array.from({length: barCount}, () => Math.random() * Math.PI * 2);
  const speeds = Array.from({length: barCount}, () => 0.0015 + Math.random() * 0.0025);

  function draw(t) {
    if (!state.isPlaying) {
      state.spectrumAnim = requestAnimationFrame(draw);
      return;
    }
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const barWidth = w / barCount;

    for (let i = 0; i < barCount; i++) {
      const norm = i / barCount;
      // 中间高两端低的包络
      const envelope = Math.sin(norm * Math.PI);
      const anim = (Math.sin(t * speeds[i] + phases[i]) + 1) / 2;
      const barH = envelope * (0.3 + anim * 0.7) * h * 0.85;

      const grad = ctx.createLinearGradient(0, h, 0, h - barH);
      grad.addColorStop(0, hexToRgba(color, 0.05));
      grad.addColorStop(0.5, hexToRgba(color, 0.5));
      grad.addColorStop(1, hexToRgba(color, 0.9));
      ctx.fillStyle = grad;
      const x = i * barWidth;
      const bw = Math.max(barWidth - 2, 1);
      ctx.fillRect(x, h - barH, bw, barH);
    }
    state.spectrumAnim = requestAnimationFrame(draw);
  }
  state.spectrumAnim = requestAnimationFrame(draw);

  // 简单的 resize 监听
  if (!window._spectrumResizeBound) {
    window.addEventListener('resize', () => {
      const c = document.getElementById('spectrum');
      if (!c) return;
      const rect = c.getBoundingClientRect();
      c.width = rect.width * (window.devicePixelRatio || 1);
      c.height = rect.height * (window.devicePixelRatio || 1);
    });
    window._spectrumResizeBound = true;
  }
}
function setResultColors(hex) {
  const rgb = hex.replace('#', '');
  const r = parseInt(rgb.substring(0, 2), 16);
  const g = parseInt(rgb.substring(2, 4), 16);
  const b = parseInt(rgb.substring(4, 6), 16);
  const el = document.getElementById('result');
  el.style.setProperty('--result-color', hex);
  el.style.setProperty('--rc-08', `rgba(${r},${g},${b},0.08)`);
  el.style.setProperty('--rc-15', `rgba(${r},${g},${b},0.15)`);
  el.style.setProperty('--rc-20', `rgba(${r},${g},${b},0.2)`);
  el.style.setProperty('--rc-30', `rgba(${r},${g},${b},0.3)`);
  el.style.setProperty('--rc-40', `rgba(${r},${g},${b},0.4)`);
  el.style.setProperty('--rc-60', `rgba(${r},${g},${b},0.6)`);
  const lr = Math.round(r * 0.4 + 255 * 0.6);
  const lg = Math.round(g * 0.4 + 255 * 0.6);
  const lb = Math.round(b * 0.4 + 255 * 0.6);
  el.style.setProperty('--rc-light', `rgb(${lr},${lg},${lb})`);
}


function hexToRgba(hex, alpha) {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ========== 进度条循环 ==========
function startProgressLoop() {
  if (state.progressAnim) clearInterval(state.progressAnim);
  const fill = document.getElementById('progressFill');
  let pct = 0;
  state.progressAnim = setInterval(() => {
    if (!state.isPlaying) return;
    pct += 0.3;
    if (pct > 100) pct = 0;
    fill.style.width = pct + '%';
  }, 100);
}

function togglePlay() {
  const btn = document.getElementById('mp3Play');
  const vinyl = document.getElementById('vinyl');
  state.isPlaying = !state.isPlaying;
  btn.textContent = state.isPlaying ? '❚❚' : '▶';
  vinyl.style.animationPlayState = state.isPlaying ? 'running' : 'paused';
}

// ========== 入场动效观察器 ==========
function setupRevealObserver() {
  const targets = document.querySelectorAll('#result .reveal');
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        en.target.classList.add('in-view');
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -80px 0px' });
  targets.forEach(t => obs.observe(t));
}

// ========== 分享与截图 ==========
async function shareResult() {
  const key = getResultKey(state.scores);
  const r = state.results[key];
  const shareText = `我在「听心图谱」里是 ${r.songName}（${r.songNameEn}）—— ${(r.coreMelody && r.coreMelody.title) || ''}`;
  const url = location.href.split('?')[0];
  if (navigator.share) {
    try { await navigator.share({ title: '听心图谱 · L - VOS', text: shareText, url }); return; }
    catch (e) {}
  }
  try {
    await navigator.clipboard.writeText(shareText + '\n' + url);
    toast('分享文案已复制到剪贴板');
  } catch (e) { toast('复制失败，请手动分享'); }
}

async function downloadResult() {
  const target = document.getElementById('resultContent');
  document.body.classList.add('capturing');
  // 让所有页面立刻显示
  document.querySelectorAll('#result .reveal').forEach(el => el.classList.add('in-view'));
  await new Promise(r => setTimeout(r, 400));
  try {
    const canvas = await html2canvas(target, {
      backgroundColor: '#050505',
      scale: 2,
      useCORS: true,
      logging: false,
      windowWidth: document.documentElement.scrollWidth,
      windowHeight: document.documentElement.scrollHeight
    });
    const link = document.createElement('a');
    const key = getResultKey(state.scores);
    link.download = `听心图谱_${key}_${state.results[key].songName || ''}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (e) {
    console.error(e);
    toast('截图失败，请稍后再试');
  } finally {
    document.body.classList.remove('capturing');
  }
}

function restart() {
  if (state.spectrumAnim) cancelAnimationFrame(state.spectrumAnim);
  if (state.progressAnim) clearInterval(state.progressAnim);
  showScreen('hero');
}

// ========== 工具 ==========
function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function toast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:#f4f4f4;color:#050505;padding:14px 28px;border-radius:30px;font-size:0.85rem;letter-spacing:2px;z-index:10001';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

init();

