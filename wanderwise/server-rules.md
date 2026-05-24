# Server Rules — WanderWise Backend

## Stack
- Node.js + Express. Keep dependencies minimal: `express`, `cors`, `dotenv`, plus the built-in `https`.
- Single entry point `server/server.js` listens on `PORT` from `.env` (default 3000).

## Configuration
- Load env with `dotenv.config({ path: path.join(__dirname, '.env') })`.
- Never depend on `process.cwd()` — server should work from any directory.
- Secrets live in `server/.env`. `.env.example` documents required keys.

## Endpoints

| Method | Path | Behavior |
|---|---|---|
| GET  | `/api/health`        | Returns `{ success: true, message: "Tara is ready to explore!" }` |
| GET  | `/api/destinations`  | Returns the 16 destinations from `destinations.js` |
| POST | `/api/chat`          | Body `{ message, history? }`. Streams Tara's reply as NDJSON. |

## Response shape
Every JSON response is `{ success: boolean, message: string, data?: any }`.

## Streaming
- Chat endpoint sets `Content-Type: application/x-ndjson` and `Transfer-Encoding: chunked`.
- One JSON object per line, newline-terminated.
- Per chunk: `{ success: true, message: "chunk", data: { chunk: "word " } }`.
- Final line: `{ success: true, message: "Stream complete.", data: { done: true } }`.
- Errors mid-stream emit one line: `{ success: false, message: "...", data: { done: true } }` and end.

## Gemini integration
- Model: `gemini-2.5-flash-lite` (avoids thinking-budget headaches, friendlier free quota).
- REST endpoint `streamGenerateContent?alt=sse`.
- Gemini SSE frames are CRLF-separated — normalize `\r\n` → `\n` before splitting on `\n\n`.

## CORS
- `cors()` enabled for all origins in dev — fine for local use.
