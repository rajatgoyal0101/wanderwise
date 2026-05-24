const path = require('path');
const express = require('express');
const cors = require('cors');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const destinations = require('./destinations');
const { streamTaraReply } = require('./tara');

const PORT = Number(process.env.PORT) || 3000;
const app = express();

app.use(cors());
app.use(express.json({ limit: '256kb' }));

function ok(message, data) {
  return { success: true, message, ...(data !== undefined ? { data } : {}) };
}

function fail(message, data) {
  return { success: false, message, ...(data !== undefined ? { data } : {}) };
}

app.get('/', (_req, res) => {
  res.json(ok('WanderWise API. Open the website at http://localhost:8080', {
    endpoints: ['GET /api/health', 'GET /api/destinations', 'POST /api/chat']
  }));
});

app.get('/api/health', (_req, res) => {
  res.json(ok('Tara is ready to explore!'));
});

app.get('/api/destinations', (_req, res) => {
  res.json(ok('Destinations fetched.', destinations));
});

app.post('/api/chat', async (req, res) => {
  const message = req.body && typeof req.body.message === 'string' ? req.body.message.trim() : '';
  const history = Array.isArray(req.body && req.body.history) ? req.body.history : [];

  if (!message) {
    res.status(400).json(fail('Message is required.'));
    return;
  }

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const writeLine = (obj) => {
    res.write(JSON.stringify(obj) + '\n');
  };

  await streamTaraReply(
    message,
    history,
    (word) => writeLine(ok('chunk', { chunk: word })),
    () => {
      writeLine(ok('Stream complete.', { done: true }));
      res.end();
    },
    (err) => {
      console.error('[chat] Tara stream error:', err.message);
      writeLine(fail('Arre yaar, kuch toh gadbad hui!', { done: true }));
      res.end();
    }
  );
});

app.use((_req, res) => {
  res.status(404).json(fail('Yeh route Tara ko nahi pata.'));
});

app.listen(PORT, () => {
  console.log(`\n🌅  WanderWise server running at http://localhost:${PORT}`);
  console.log(`     GET  /api/health`);
  console.log(`     GET  /api/destinations`);
  console.log(`     POST /api/chat`);
  if (!process.env.GEMINI_API_KEY) {
    console.warn(`\n⚠️   GEMINI_API_KEY missing — chat will error until you set it in server/.env\n`);
  }
});
