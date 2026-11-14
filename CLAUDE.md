# Alt Draft

A free web tool: drop in an image, an AI model running in the browser writes a first draft of its alt text, and the person edits and approves it before copying. **The AI drafts, the person decides.**

## Who
Tarun, a product designer. Explain things in plain language; avoid unexplained engineering jargon.

## How we work
- We work in stages. **Stop for Tarun's review after each stage** — don't roll into the next one.
- Figma is on the free Starter plan with very few MCP calls per month. Batch work into as few Figma calls as possible, never retry the same call, and stop immediately if the limit is hit.

## Status
- **Stage 1 (interface): built and restyled to the final Figma design** (seen via one Figma screenshot on 2026-11-14, with Tarun's OK). Awaiting Tarun's "approved".
- **Stage 2 (real AI): mostly built early, at Tarun's request.** Working: real drafts from LFM2.5-VL-450M in a Web Worker on WebGPU, real download progress, browser caching (return visits start in about 1–2 seconds), image shrinking (768px longest side), word-by-word streaming, Rewrite draft, context field, decorative toggle.
  **Still to do in Stage 2:** run both model sizes on the 5 images in `test-images/` (folder not in the project yet) and show drafts side by side with time and download size, then Tarun chooses. The 1.6B model needs extra work first (see Tech).
- Stages 3 (polish and trust) and 4 (publish): not started. Wait for "approved" before each.
- Decided (2026-11-14): "Finished by you." keeps the system serif italic stand-in; no custom font file.
- Open question for Tarun: whether mobile should keep the plain-sans headline and hidden top-bar links shown in the Figma mobile frame.

## Files
- `index.html` — the one page; every screen is a section in it.
- `css/styles.css` — all styles; design tokens are variables at the top.
- `js/app.js` — moves between states, takes in the image, copy button.
- `js/draft-source.js` — page side of the AI: shrinks the image, talks to the worker, tidies the reply.
- `js/draft-worker.js` — the AI itself (Transformers.js + model), prompt and generation settings.
- `tools/serve.mjs` — local preview server only (`node tools/serve.mjs`, then http://localhost:8123/). Add `?first=1` to the address to replay the "Getting ready" screen.
- `Background Image.png` — Tarun's source art for the background glow; the site recreates it in CSS and does not load this file.
- Figma tools: only with Tarun's explicit OK each time (call budget is tiny).

## Tech
- Plain static site (HTML, CSS, JavaScript), no build step.
- AI: Transformers.js **4.3.2**, pinned, from jsDelivr, running on WebGPU inside a Web Worker.
- Model in use: `onnx-community/LFM2.5-VL-450M-ONNX` (the Transformers.js-ready version; about 550 MB download with fp16 embeddings + q4f16 decoder + fp16 vision encoder).
- The 1.6B model only exists as `LiquidAI/LFM2.5-VL-1.6B-ONNX`, which is NOT packaged for Transformers.js (different file names; its own instructions use onnxruntime-web directly; roughly 1.5–2.3 GB). There is no `onnx-community` 1.6B version as of 2026-11-14.
- No server, no paid keys. Images never leave the device.
- Hosting: GitHub Pages (username `tarundaboss`).

## Design
Figma file: https://www.figma.com/design/4GXCbssJBua81tvN2c5g8x/?node-id=2-2
All screens live in one section, "Alt Draft – Screens" (node `2:2`). The Figma frames use Inter, because SF Pro wasn't available to the Figma tool.

Style: clean, Apple-inspired (apple.com product page hierarchy). Lots of white space, one accent color, strong headline, quiet secondary text, nothing decorative.

Final-design changes from the original tokens (the Figma design wins):
- **Background:** a very soft glow behind everything below the top bar: lavender (about `#EEF0FF`) in the middle, peach (about `#FFE4C4`) rising from the bottom, on `#FFFDFF`.
- **Hero headline (01 Drop, desktop):** about 80/78 semibold; the second line "Finished by you." is a semibold serif italic. Other headlines ("Copied.") stay 48/52. Mobile headline is 34/40, plain sans.
- **Cards and inputs are glassy:** cards `rgba(245,245,247,0.6)` with a 1px `rgba(210,210,215,0.45)` border; text input `rgba(255,255,255,0.6)` with the same border. The drop zone stays solid white with the dashed border.
- **Mobile top bar:** wordmark only.

### Tokens
| Token | Value |
|---|---|
| Background | `#FFFFFF` |
| Secondary surface | `#F5F5F7` |
| Primary text | `#1D1D1F` |
| Secondary text | `#6E6E73` |
| Border | `#D2D2D7` |
| Accent | `#0071E3` |
| Success | `#34C759` |
| Image placeholder | `#E8E8ED` |

- **Font:** SF Pro Display / SF Pro Text, falling back to Inter.
- **Type:** headline 48/52 semibold, tight tracking (34 on mobile) · subhead 21/28 regular, secondary text · body 17/25 · labels and captions 13–14.
- **Layout:** 8-point spacing grid · centered content column ~980 wide.
- **Cards:** `#F5F5F7`, radius 20, no shadows.
- **Buttons:** pill-shaped, 17 text. Primary = solid accent, white text. Secondary = accent text on `#F5F5F7`. Disabled = 40% opacity.
- **Top bar (desktop):** "Alt Draft" wordmark left; "How it works" and "Privacy" links right in 14 secondary text; thin `#D2D2D7` bottom border.

### Screens
01 Drop · 02b Getting ready (first visit only) · 02 Writing · 03 Edit and approve · 04 Copied · 01 Drop – Mobile (390×844). Desktop frames are 1440×900.
