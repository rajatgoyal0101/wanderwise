/* ============================================================
   WanderWise — frontend logic
   ============================================================ */

const API_BASE = 'http://localhost:3000';
const MAX_HISTORY = 12;

// ─── State ──────────────────────────────────────────────────
let destinations = [];
let activeFilter = 'All';
const chatHistory = [];          // [{ role: 'user' | 'assistant', text }]
let lastMentionedDest = null;    // Destination object — for booking flow
let chatOpenedOnce = false;
let isStreaming = false;

// Audio state — built lazily after first user gesture (autoplay policy).
let audioCtx = null;
let ambientGain = null;
let ambientSource = null;
let isMuted = true;

// ─── Boot ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  wireWelcome();
  wireMute();
  wireFilters();
  wireChat();
  wireQuickReplies();
  watchCounter();
  loadDestinations();
});

// ─── Welcome / Start button ─────────────────────────────────
function wireWelcome() {
  const btn = document.getElementById('startBtn');
  btn.addEventListener('click', () => {
    ensureAudio();
    playWhoosh();
    launchPaperPlanes(16);
    setTimeout(() => {
      document.getElementById('destinations').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 600);
  });
}

function launchPaperPlanes(count) {
  const field = document.getElementById('planeField');
  for (let i = 0; i < count; i++) {
    const plane = document.createElement('span');
    plane.className = 'plane';
    plane.textContent = '✈';
    const startY = 20 + Math.random() * 70;
    const endY = startY + (Math.random() * 30 - 15);
    const rot = -25 + Math.random() * 20;
    const dur = 3 + Math.random() * 4;
    const delay = Math.random() * 0.8;
    const size = 18 + Math.random() * 18;
    plane.style.cssText = `
      --start-x: -10vw; --start-y: ${startY}vh;
      --end-y: ${endY}vh; --rot: ${rot}deg;
      --dur: ${dur}s;
      animation-delay: ${delay}s;
      font-size: ${size}px;
      top: 0; left: 0;
    `;
    field.appendChild(plane);
    setTimeout(() => plane.remove(), (dur + delay) * 1000 + 200);
  }
}

// ─── Audio (Web Audio API — synthesized) ────────────────────
function ensureAudio() {
  if (audioCtx) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
    setupAmbientOcean();
  } catch (err) {
    console.warn('Audio not available:', err);
  }
}

function setupAmbientOcean() {
  // Brown noise → lowpass → slow tremolo gain = waves-ish sound.
  const bufferSize = 4 * audioCtx.sampleRate;
  const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  let lastOut = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    lastOut = (lastOut + 0.02 * white) / 1.02;
    data[i] = lastOut * 3.5;
  }

  ambientSource = audioCtx.createBufferSource();
  ambientSource.buffer = noiseBuffer;
  ambientSource.loop = true;

  const lowpass = audioCtx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 480;

  ambientGain = audioCtx.createGain();
  ambientGain.gain.value = 0;       // muted by default

  // slow wave envelope
  const tremolo = audioCtx.createOscillator();
  tremolo.type = 'sine';
  tremolo.frequency.value = 0.18;
  const tremoloGain = audioCtx.createGain();
  tremoloGain.gain.value = 0.12;
  tremolo.connect(tremoloGain).connect(ambientGain.gain);

  ambientSource.connect(lowpass).connect(ambientGain).connect(audioCtx.destination);
  ambientSource.start(0);
  tremolo.start(0);
}

function playWhoosh() {
  if (!audioCtx) return;
  const dur = 0.6;
  const now = audioCtx.currentTime;
  const buffer = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * dur), audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);

  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  const lp = audioCtx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(2200, now);
  lp.frequency.exponentialRampToValueAtTime(180, now + dur);
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.35, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  src.connect(lp).connect(gain).connect(audioCtx.destination);
  src.start(now);
  src.stop(now + dur + 0.05);
}

function wireMute() {
  const btn = document.getElementById('muteBtn');
  const icon = btn.querySelector('.mute-icon');
  const label = btn.querySelector('.mute-label');
  btn.addEventListener('click', () => {
    ensureAudio();
    if (!audioCtx || !ambientGain) return;
    isMuted = !isMuted;
    const target = isMuted ? 0 : 0.18;
    const now = audioCtx.currentTime;
    ambientGain.gain.cancelScheduledValues(now);
    ambientGain.gain.setValueAtTime(ambientGain.gain.value, now);
    ambientGain.gain.linearRampToValueAtTime(target, now + 0.4);
    btn.classList.toggle('is-on', !isMuted);
    btn.setAttribute('aria-pressed', isMuted ? 'true' : 'false');
    icon.textContent = isMuted ? '🔇' : '🌊';
    label.textContent = isMuted ? 'Sound off' : 'Ocean on';
  });
}

// ─── Destinations ───────────────────────────────────────────
async function loadDestinations() {
  const status = document.getElementById('cardsStatus');
  try {
    const res = await fetch(`${API_BASE}/api/destinations`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message);
    destinations = json.data;
    status.textContent = '';
    renderCards();
  } catch (err) {
    status.textContent = 'Hmm, destinations load nahi ho paaye. Check if the server is running on port 3000.';
    console.error(err);
  }
}

const CATEGORY_EMOJI = {
  'Mountains': '🏔️',
  'Beaches': '🏖️',
  'Heritage Cities': '🛕',
  'Hidden Gems': '✨'
};

function renderCards() {
  const grid = document.getElementById('cards');
  const list = activeFilter === 'All'
    ? destinations
    : destinations.filter((d) => d.category === activeFilter);

  grid.innerHTML = '';
  updateFilterCount(list.length);
  list.forEach((d, i) => {
    const card = document.createElement('article');
    card.className = `card cat-${categoryClass(d.category)}`;
    card.style.animationDelay = `${i * 60}ms`;

    const emoji = CATEGORY_EMOJI[d.category] || '✦';
    const imgHtml = d.image
      ? `<img class="card-photo" src="${escapeHtml(d.image)}" alt="${escapeHtml(d.name)}" loading="lazy" onerror="this.style.display='none'" />`
      : '';

    card.innerHTML = `
      <div class="card-media">
        ${imgHtml}
        <div class="card-media-fallback" aria-hidden="true">${emoji}</div>
        <div class="card-media-shade"></div>
        ${d.taraTopPick ? `<span class="card-badge">★ Tara's Top Pick</span>` : ''}
        <span class="card-cat">${escapeHtml(d.category)}</span>
        <div class="card-titleblock">
          <h3 class="card-name">${escapeHtml(d.name)}</h3>
          <p class="card-state">${escapeHtml(d.state)}</p>
        </div>
      </div>
      <div class="card-body">
        <p class="card-desc">${escapeHtml(d.description)}</p>
        <div class="card-stars" aria-label="Adventure level ${d.adventureLevel} of 5">${renderStars(d.adventureLevel)}</div>
        <ul class="card-things">
          ${d.topThingsToDo.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}
        </ul>
        <div class="card-row">
          <span><strong>₹${d.cost.toLocaleString('en-IN')}</strong> / person</span>
          <span>${d.idealDays} days · ${escapeHtml(d.bestSeason.split(',')[0])}</span>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

function categoryClass(cat) {
  return cat.toLowerCase().replace(/\s+/g, '-');
}

function updateFilterCount(count) {
  const el = document.getElementById('filterCount');
  if (!el) return;
  const label = activeFilter === 'All' ? 'destinations' : activeFilter.toLowerCase();
  el.innerHTML = `Showing <strong>${count}</strong> ${label}`;
}

function renderStars(level) {
  let out = '';
  for (let i = 1; i <= 5; i++) {
    out += `<span class="${i <= level ? 'on' : 'off'}">★</span>`;
  }
  return out;
}

function wireFilters() {
  const filters = document.querySelectorAll('.filter');
  filters.forEach((f) => {
    f.addEventListener('click', () => {
      filters.forEach((other) => {
        other.classList.remove('is-active');
        other.setAttribute('aria-selected', 'false');
      });
      f.classList.add('is-active');
      f.setAttribute('aria-selected', 'true');
      activeFilter = f.dataset.filter;
      renderCards();
    });
  });
}

// ─── Counter ────────────────────────────────────────────────
function watchCounter() {
  const el = document.getElementById('counter');
  const target = Number(el.dataset.target);
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        animateCounter(el, target, 1800);
        io.disconnect();
      }
    });
  }, { threshold: 0.4 });
  io.observe(el);
}

function animateCounter(el, target, duration) {
  const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.floor(target * eased).toLocaleString('en-IN');
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ─── Chat ──────────────────────────────────────────────────
function wireChat() {
  const toggle = document.getElementById('chatToggle');
  const panel = document.getElementById('chatPanel');
  const close = document.getElementById('chatClose');
  const form = document.getElementById('chatForm');
  const input = document.getElementById('chatInput');

  toggle.addEventListener('click', () => {
    const open = panel.classList.toggle('is-open');
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open && !chatOpenedOnce) {
      chatOpenedOnce = true;
      appendBubble('tara', `Namaste! Main Tara hoon — aapki travel sakhi. Bataiye, kahan ka mood hai aaj? Pahad, samudra, virasat, ya kuch chhupa hua?`);
      chatHistory.push({ role: 'assistant', text: 'Namaste! Main Tara hoon — aapki travel sakhi. Bataiye, kahan ka mood hai aaj? Pahad, samudra, virasat, ya kuch chhupa hua?' });
    }
    if (open) setTimeout(() => input.focus(), 200);
  });

  close.addEventListener('click', () => {
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || isStreaming) return;
    input.value = '';
    sendUserMessage(text);
  });
}

function wireQuickReplies() {
  document.querySelectorAll('.quick').forEach((q) => {
    q.addEventListener('click', () => {
      if (isStreaming) return;
      // Open the panel if not already
      const panel = document.getElementById('chatPanel');
      if (!panel.classList.contains('is-open')) {
        document.getElementById('chatToggle').click();
      }
      sendUserMessage(q.textContent);
    });
  });
}

async function sendUserMessage(text) {
  appendBubble('user', text);
  chatHistory.push({ role: 'user', text });
  trimHistory();

  const bookingIntent = looksLikeBookingIntent(text);

  const indicator = appendTypingIndicator();
  const bubble = appendBubble('tara', '');
  isStreaming = true;
  toggleSendButton(false);

  let assembled = '';

  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: chatHistory.slice(0, -1) })
    });

    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buf = '';
    let firstChunk = true;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;

        let parsed;
        try { parsed = JSON.parse(line); } catch { continue; }

        if (!parsed.success && parsed.data && parsed.data.done) {
          throw new Error(parsed.message || 'stream error');
        }
        if (parsed.data && parsed.data.chunk) {
          if (firstChunk) { indicator.remove(); firstChunk = false; }
          assembled += parsed.data.chunk;
          bubble.textContent = assembled;
          scrollChatToBottom();
        }
        if (parsed.data && parsed.data.done) {
          if (firstChunk) indicator.remove();
        }
      }
    }

    if (!assembled.trim()) {
      bubble.textContent = 'Arre yaar, kuch toh gadbad hui! Thoda ruko aur dobara try karo.';
    } else {
      chatHistory.push({ role: 'assistant', text: assembled });
      trimHistory();
      const mentioned = detectMentionedDestination(assembled);
      if (mentioned) lastMentionedDest = mentioned;

      if (bookingIntent && lastMentionedDest) {
        renderTripCard(lastMentionedDest);
      }
    }
  } catch (err) {
    console.error(err);
    indicator.remove();
    bubble.textContent = 'Arre yaar, kuch toh gadbad hui! Thoda ruko aur dobara try karo.';
  } finally {
    isStreaming = false;
    toggleSendButton(true);
    scrollChatToBottom();
  }
}

function trimHistory() {
  while (chatHistory.length > MAX_HISTORY) chatHistory.shift();
}

function toggleSendButton(enabled) {
  const btn = document.getElementById('chatSend');
  btn.disabled = !enabled;
}

function appendBubble(who, text) {
  const stream = document.getElementById('chatStream');
  const div = document.createElement('div');
  div.className = `bubble ${who}`;
  div.textContent = text;
  stream.appendChild(div);
  scrollChatToBottom();
  return div;
}

function appendTypingIndicator() {
  const stream = document.getElementById('chatStream');
  const wrap = document.createElement('div');
  wrap.className = 'bubble tara';
  wrap.innerHTML = `<span class="typing"><span></span><span></span><span></span></span>`;
  stream.appendChild(wrap);
  scrollChatToBottom();
  return wrap;
}

// Auto-scroll: NOT smooth — streaming would slip below the visible area.
// Wrap in rAF so layout has settled before we measure scrollHeight.
function scrollChatToBottom() {
  const stream = document.getElementById('chatStream');
  requestAnimationFrame(() => {
    stream.scrollTop = stream.scrollHeight;
  });
}

// ─── Booking flow ───────────────────────────────────────────
function looksLikeBookingIntent(text) {
  const t = text.toLowerCase();
  return /\b(book\s+(this|it|kar)|plan\s+kar\s+do|plan\s+this|mujhe\s+yahaa?n\s+jaa?na|let'?s\s+go|haan\s+chalo|chalo\s+chalte|chalo\s+karte\s+hain|i\s+want\s+to\s+go|sign\s+me\s+up|book\s+me)\b/i.test(t);
}

function detectMentionedDestination(text) {
  const lower = text.toLowerCase();
  // Walk in reverse — pick the LAST mentioned name (most recent reference).
  let best = null, bestIdx = -1;
  for (const d of destinations) {
    const idx = lower.lastIndexOf(d.name.toLowerCase());
    if (idx > bestIdx) { bestIdx = idx; best = d; }
  }
  return best;
}

function renderTripCard(d) {
  const stream = document.getElementById('chatStream');
  const card = document.createElement('div');
  card.className = 'trip-card';
  card.innerHTML = `
    <div class="trip-card-title">${escapeHtml(d.name)}, ${escapeHtml(d.state)}</div>
    <div class="trip-card-meta">₹${d.cost.toLocaleString('en-IN')} per person · ${d.idealDays} days · adventure ${d.adventureLevel}/5</div>
    <button class="trip-card-btn" type="button">Plan This Trip ✦</button>
  `;
  stream.appendChild(card);
  scrollChatToBottom();

  const btn = card.querySelector('.trip-card-btn');
  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.textContent = '✓ Added to wishlist';
    showToast('Added to your wishlist! Mast choice!');
  });
}

// ─── Toast ─────────────────────────────────────────────────
let toastTimer = null;
function showToast(text) {
  const toast = document.getElementById('toast');
  toast.textContent = text;
  toast.classList.add('is-show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-show'), 3000);
}

// ─── Utils ─────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
