// ========== 状态 ==========
const state = {
  questions: [],
  results: {},
  meta: null,
  currentQ: 0,
  answers: [],
  scores: { timbre: 0, tempo: 0, space: 0, melody: 0 },
  range: null
};

const THRESHOLDS = { greyZone: 1 };
const DIM_ORDER = ['timbre', 'tempo', 'space', 'melody'];

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
    document.body.innerHTML = '<div style="padding:40px;color:#f4f4f4;font-family:sans-serif">数据加载失败，请确认已通过 GitHub Pages 或本地服务器打开。</div>';
  }
}

// ========== 自定义光标 ==========
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

// ========== 首屏声波 ==========
function setupHero() {
  const wave = document.getElementById('heroWave');
  const bars = [15, 40, 70, 30, 90, 50, 80, 25, 60, 45];
  bars.forEach((h, i) => {
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.height = h + '%';
    bar.style.animationDelay = (i * 0.1) + 's';
    wave.appendChild(bar);
  });
  document.getElementById('qTotal').textContent = '/ ' + state.questions.length;
}

// ========== 事件绑定 ==========
function setupEvents() {
  document.getElementById('startBtn').addEventListener('click', startQuiz);
  document.getElementById('backBtn').addEventListener('click', prevQuestion);
  document.getElementById('retestBtn').addEventListener('click', restart);
  document.getElementById('mp3Prev').addEventListener('click', restart);
  document.getElementById('mp3Next').addEventListener('click', shareResult);
  document.getElementById('mp3Play').addEventListener('click', togglePlayVisual);
  document.getElementById('shareBtn').addEventListener('click', shareResult);
  document.getElementById('downloadBtn').addEventListener('click', downloadResult);
}

// ========== 屏幕切换 ==========
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
      </span>
    `;
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

  // 回退时先扣掉旧分
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

// ========== 结果计算 ==========
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

// ========== 渲染结果 ==========
function finishQuiz() {
  const key = getResultKey(state.scores);
  const result = state.results[key] || state.results['LLLL'];
  renderResult(key, result, state.scores);
  showScreen('result');
}

function renderResult(key, r, scores) {
  document.getElementById('resSong').textContent = r.songName || '';
  document.getElementById('resSongEn').textContent = r.songNameEn || '';
  document.getElementById('resRef').textContent = r.reference || '';
  document.getElementById('resKey').textContent = key.split('').join(' · ');
  document.getElementById('npTitle').textContent = (r.coreMelody && r.coreMelody.title) || r.songName;
  document.getElementById('npArtist').textContent = r.songName + (r.songNameEn ? ' · ' + r.songNameEn : '');

  renderMP3Bars(scores, r);
  document.getElementById('resTemp').textContent = r.temperature || '';
  document.getElementById('resCoreTitle').textContent = (r.coreMelody && r.coreMelody.title) || '';
  document.getElementById('resCoreDesc').textContent = (r.coreMelody && r.coreMelody.desc) || '';

  const bgmEl = document.getElementById('resBgm');
  bgmEl.innerHTML = '';
  (r.bgm || []).forEach(item => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="bgm-phase">${escapeHtml(item.phase)}</span>
      <span class="bgm-song">${escapeHtml(item.song)}<small>${escapeHtml(item.artist || '')}</small></span>
      <span class="bgm-desc">${escapeHtml(item.desc || '')}</span>
    `;
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
      <div class="spark-target-key">${escapeHtml(s.targetKey || '')}</div>
      <div class="spark-type">${escapeHtml(s.type || '')}</div>
      <div class="spark-desc">${escapeHtml(s.desc || '')}</div>
    `;
    sparksEl.appendChild(card);
  });

  document.getElementById('resTaleRef').textContent = (r.fairytale && r.fairytale.reference) || '';
  document.getElementById('resTaleContent').textContent = (r.fairytale && r.fairytale.content) || '';
  document.getElementById('resRx').textContent = r.prescription || '';
}

function renderMP3Bars(scores, r) {
  const container = document.getElementById('mp3Bars');
  container.innerHTML = '';
  const dims = state.meta.dimensions;

  dims.forEach(dim => {
    const val = scores[dim.key];
    const range = state.range[dim.key];
    const absMax = Math.max(Math.abs(range.min), Math.abs(range.max), 1);
    // 归一化：0 → 中点，正 → 右，负 → 左
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
        <div class="eq-fill" style="left:${fillLeft}%;width:${fillWidth}%"></div>
        <div class="eq-head" style="left:${pct}%"></div>
      </div>
      <div class="eq-score">${val > 0 ? '+' : ''}${val}</div>
      <div class="eq-poles">
        <span>${escapeHtml(dim.low)}</span>
        <span>${escapeHtml(dim.high)}</span>
      </div>
      ${isGrey ? `<div class="eq-hint">⚠ 灰色地带 · H/L 特质并存</div>` : ''}
    `;
    container.appendChild(row);
  });
}

// ========== 播放器视觉切换 ==========
function togglePlayVisual() {
  const btn = document.getElementById('mp3Play');
  const vinyl = document.getElementById('vinyl');
  if (btn.textContent.trim() === '▶') {
    btn.textContent = '❚❚';
    vinyl.style.animationPlayState = 'running';
  } else {
    btn.textContent = '▶';
    vinyl.style.animationPlayState = 'paused';
  }
}

// ========== 分享与截图 ==========
async function shareResult() {
  const key = getResultKey(state.scores);
  const r = state.results[key];
  const shareText = `我在「听心图谱」里是 ${r.songName} (${r.songNameEn}) —— ${(r.coreMelody && r.coreMelody.title) || ''}`;
  const url = location.href.split('?')[0];

  if (navigator.share) {
    try {
      await navigator.share({ title: '听心图谱 · L - VOS', text: shareText, url });
      return;
    } catch (e) { /* 用户取消 */ }
  }
  try {
    await navigator.clipboard.writeText(shareText + '\n' + url);
    toast('分享文案已复制到剪贴板');
  } catch (e) {
    toast('复制失败，请手动分享');
  }
}

async function downloadResult() {
  const target = document.getElementById('resultContent');
  document.body.classList.add('capturing');
  try {
    const canvas = await html2canvas(target, {
      backgroundColor: '#050505',
      scale: 2,
      useCORS: true,
      logging: false
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
