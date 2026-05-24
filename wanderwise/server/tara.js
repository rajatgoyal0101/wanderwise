const destinations = require('./destinations');

// ── Provider selection ─────────────────────────────────────
// Prefer Gemini when its key is present; only fall back to Groq if Gemini
// is not configured. Set GEMINI_PROVIDER=groq explicitly to force Groq.
const HAS_GROQ = !!process.env.GROQ_API_KEY;
const HAS_GEMINI = !!process.env.GEMINI_API_KEY;
const PROVIDER = process.env.LLM_PROVIDER
  || (HAS_GEMINI ? 'gemini' : (HAS_GROQ ? 'groq' : 'gemini'));

// gemini-2.5-flash is what the user's paid tier covers. It's a "thinking" model
// by default, so we set thinkingConfig.thinkingBudget=0 in the request body —
// otherwise the model burns the whole maxOutputTokens budget on hidden reasoning
// and returns empty text.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`;
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

console.log(`[tara] provider=${PROVIDER} model=${PROVIDER === 'groq' ? GROQ_MODEL : GEMINI_MODEL}`);

// ── System prompt ──────────────────────────────────────────
function buildSystemPrompt() {
  const lines = destinations.map((d) => {
    return `• ${d.name} (${d.state}, ${d.category}) — ₹${d.cost} per person, adventure ${d.adventureLevel}/5, best in ${d.bestSeason}, top things: ${d.topThingsToDo.join(' / ')}, ideal ${d.idealDays} days.`;
  }).join('\n');

  return `Tum Tara ho — WanderWise ki AI travel guide. Tum warm, friendly, well-travelled ho aur natural Hinglish me baat karti ho (Hindi words in Roman script, mixed with English). Tum ek dost ki tarah baat karti ho jisne India ghoom-ghoom ke dekha hai.

ZAROORI RULES:
1. Reply 2 se 5 sentences ke beech mein hi rakhna. Kabhi lambi nahi.
2. NO markdown, NO bullet points, NO bold text, NO headings. Bas plain text.
3. Emojis tab tak nahi use karna jab tak user ne pehle use na kiya ho.
4. Tum sirf neeche di gayi 16 WanderWise destinations recommend kar sakti ho. List ke bahar ki jagah suggest nahi karna.
5. Agar tum kisi destination ko recommend karti ho, toh reply ka end EXACTLY in words se karna: "Bilkul mast jagah hai, zaroor jaana!"
6. Agar user kuch CLEARLY non-travel pooche (coding, math, recipes, politics, philosophy), toh EXACTLY yeh reply karna: "Arre, main toh sirf travel ki baatein karti hoon!"

IMPORTANT — TRAVEL-ADJACENT FOLLOW-UPS ARE NEVER OFF-TOPIC:
- Cost, budget, paise, kitna kharcha
- Weather, season, kab jaana chahiye, mausam
- Food, khana, local cuisine
- Transport, kaise pahunchein, flight, train, bus
- Days, kitne din lagenge, itinerary length
- Packing, kya le ke jaayein
- Safety, akele ja sakte hain, female solo travel
- Stay, hotel, homestay, where to stay
- What to do, activities, sightseeing
Yeh sab questions travel ki hi baatein hain — inka jawab dena hai, kabhi off-topic mat samajhna.

BOOKING INTENT:
Agar user "book this", "plan kar do", "mujhe yahaan jaana hai", "haan chalo", "let's go" jaise phrases use kare, toh warmly reply karna aur destination confirm karna. UI khud booking card dikha degi.

CONVERSATION MEMORY:
Pichle 12 turns ki history tumhe milti hai. Agar user pooche "what about the cost?" ya "kitne din lagenge?", samajh jaana ki woh pichli mentioned jagah ke baare mein pooch raha hai.

──────────── WANDERWISE DESTINATIONS (only these 16) ────────────
${lines}
──────────────────────────────────────────────────────────────────

Ab user se baat karo, ek dost ki tarah jisne yeh sab jagahein dekhi hain.`;
}

const SYSTEM_PROMPT = buildSystemPrompt();

// Splits a streamed token into space-separated words so the UI animates word-by-word.
function splitIntoWords(text) {
  if (!text) return [];
  return text.match(/\S+\s*|\s+/g) || [];
}

function recentHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.slice(-12).filter((t) => t && t.role && t.text);
}

// ── Gemini ─────────────────────────────────────────────────
function buildGeminiBody(message, history) {
  const contents = recentHistory(history).map((turn) => ({
    role: turn.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(turn.text) }]
  }));
  contents.push({ role: 'user', parts: [{ text: String(message) }] });

  return {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    generationConfig: {
      temperature: 0.85,
      topP: 0.95,
      maxOutputTokens: 400,
      // Required for gemini-2.5-flash and flash-latest — without this they spend
      // the entire maxOutputTokens on hidden reasoning and return empty text.
      thinkingConfig: { thinkingBudget: 0 }
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
    ]
  };
}

async function streamGemini(message, history, onWord, onDone, onError) {
  let response;
  try {
    response = await fetch(`${GEMINI_ENDPOINT}&key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildGeminiBody(message, history))
    });
  } catch (err) { return onError(err); }

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '');
    return onError(new Error(`Gemini error ${response.status}: ${detail.slice(0, 200)}`));
  }

  await parseSseStream(response.body, (parsed) => {
    const text = parsed.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    if (text) splitIntoWords(text).forEach(onWord);
  }, onDone, onError);
}

// ── Groq (OpenAI-compatible) ───────────────────────────────
function buildGroqBody(message, history) {
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
  for (const turn of recentHistory(history)) {
    messages.push({
      role: turn.role === 'assistant' ? 'assistant' : 'user',
      content: String(turn.text)
    });
  }
  messages.push({ role: 'user', content: String(message) });

  return {
    model: GROQ_MODEL,
    messages,
    stream: true,
    temperature: 0.85,
    top_p: 0.95,
    max_tokens: 400
  };
}

async function streamGroq(message, history, onWord, onDone, onError) {
  let response;
  try {
    response = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify(buildGroqBody(message, history))
    });
  } catch (err) { return onError(err); }

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '');
    return onError(new Error(`Groq error ${response.status}: ${detail.slice(0, 200)}`));
  }

  await parseSseStream(response.body, (parsed) => {
    const delta = parsed.choices?.[0]?.delta?.content || '';
    if (delta) splitIntoWords(delta).forEach(onWord);
  }, onDone, onError);
}

// ── Shared SSE parser ──────────────────────────────────────
// Normalizes CRLF → LF (Gemini quirk), splits on \n\n frame boundaries,
// pulls `data:` lines, skips `[DONE]`.
async function parseSseStream(body, onPayload, onDone, onError) {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

      let frameEnd;
      while ((frameEnd = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, frameEnd);
        buffer = buffer.slice(frameEnd + 2);

        for (const line of frame.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          let parsed;
          try { parsed = JSON.parse(payload); } catch { continue; }
          onPayload(parsed);
        }
      }
    }
    onDone();
  } catch (err) {
    onError(err);
  }
}

// ── Public entry ───────────────────────────────────────────
async function streamTaraReply(message, history, onWord, onDone, onError) {
  if (PROVIDER === 'groq' && !process.env.GROQ_API_KEY) {
    return onError(new Error('GROQ_API_KEY missing in server/.env'));
  }
  if (PROVIDER === 'gemini' && !process.env.GEMINI_API_KEY) {
    return onError(new Error('GEMINI_API_KEY missing in server/.env'));
  }
  if (PROVIDER === 'groq') return streamGroq(message, history, onWord, onDone, onError);
  return streamGemini(message, history, onWord, onDone, onError);
}

module.exports = { streamTaraReply };
