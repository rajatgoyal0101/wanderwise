// Quick smoke test for Tara's streaming chat.
//   node test-tara.js
// Make sure the server is running on PORT (default 3000) and GEMINI_API_KEY is set.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const PORT = Number(process.env.PORT) || 3000;
const URL = `http://localhost:${PORT}/api/chat`;
const MESSAGE = 'I want an adventure trip in the mountains, kuch suggest karo!';

async function run() {
  process.stdout.write(`\n🧳  You: ${MESSAGE}\n\n🪷  Tara: `);

  let res;
  try {
    res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: MESSAGE, history: [] })
    });
  } catch (err) {
    console.error(`\n\nCould not reach ${URL} — is the server running? (npm start in server/)`);
    process.exit(1);
  }

  if (!res.ok || !res.body) {
    console.error(`\n\nServer returned ${res.status}`);
    process.exit(1);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;

      let parsed;
      try { parsed = JSON.parse(line); } catch { continue; }

      if (parsed.data && parsed.data.chunk) {
        process.stdout.write(parsed.data.chunk);
      }
      if (parsed.data && parsed.data.done) {
        process.stdout.write(`\n\n✅  Stream complete — Tara ne plan bana diya!\n\n`);
        return;
      }
    }
  }
}

run().catch((err) => {
  console.error('\nUnexpected error:', err);
  process.exit(1);
});
