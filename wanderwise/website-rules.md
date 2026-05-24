# Website Rules — WanderWise Frontend

## Stack
- Plain HTML, CSS, JavaScript only. No frameworks, no bundlers, no build step.
- Three files: `index.html`, `style.css`, `script.js`.
- Site opens by double-clicking `index.html` or via the static server in `website-server/`.

## Structure
- Single page, five sections: Welcome, Destinations, About, Footer, Floating Chat.
- All section transitions use CSS `@keyframes` + transitions — no JS animation libraries.
- Mobile-first responsive: must look right down to 360px width.

## Styling
- Palette lives in `:root` CSS variables: `--sky`, `--sunset`, `--sand`, `--ocean`, `--ink`.
- Magazine feel: generous whitespace, serif headings, sans-serif body.
- Spinning compass and floating paper planes are pure CSS animations.
- Audio loop muted by default; toggle in the top-right.

## JS conventions
- Small named functions (no anonymous mega-callbacks).
- `chatHistory` array kept in memory, capped at last 12 turns, sent with every chat request.
- Streamed chat reply is appended word-by-word into the active bubble.
- DO NOT use `scroll-behavior: smooth` on the chat container — streaming will lose the bottom. Use instant scroll wrapped in `requestAnimationFrame`.

## Networking
- Backend base URL: `http://localhost:3000`.
- Every response shape: `{ success, message, data? }`.
- Streamed chat is newline-delimited JSON, one chunk per line.

## Errors
- Any network error in chat surfaces as: *"Arre yaar, kuch toh gadbad hui! Thoda ruko aur dobara try karo."*
