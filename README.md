# Alt Draft

**Alt text, drafted for you. Finished by you.**

Drop in an image, and an AI model running in your own browser writes a first draft of its alt text. You edit it, approve it and copy it. The AI drafts; you decide.

**Live site:** https://tarundaboss.github.io/alt-draft/

## What it is

Alt text is the short description a screen reader speaks in place of an image. Writing it well takes judgement: what matters depends on why the image is on the page. Alt Draft gives you something to react to instead of a blank box. It does not write finished alt text for you.

## How it works

1. **You drop, choose or paste an image.** It opens on your device.
2. **An AI in your browser writes a first draft.** The model is Liquid AI's LFM2.5-VL-450M, run with Transformers.js on WebGPU inside a Web Worker, so the page stays responsive. Large images are shrunk (768 pixels on the longest side) before the model looks at them. The draft appears word by word.
3. **You finish it.** Edit the draft, ask for a rewrite, or mark the image as decorative (which gives you an empty `alt=""`). "Approve & Copy" puts the final text on your clipboard.

If you fill in "Where will this image appear?", the model uses it to choose which visible details matter.

The first visit downloads the model (about 550 MB). Your browser keeps a copy, so later visits start in a second or two.

## Privacy

- **Your image never leaves your device.** There is no server to send it to.
- No accounts, no analytics, no tracking, no cookies.
- The only things downloaded are this page (GitHub Pages), the Transformers.js library (jsDelivr) and the model files (Hugging Face). Those services see an ordinary request for files; they never see your image, your draft or what you type.
- Saved on your device: a copy of the model, and a small note that it is ready. Clearing the site's data in your browser removes both.

## Accessibility

Alt Draft is an accessibility tool, so it aims to be accessible itself: everything works from the keyboard, focus is always visible, controls are labelled, screen readers are told when the draft is ready, and animation is switched off when your device asks for reduced motion.

## Known limits

- **It needs WebGPU.** That means a recent Chrome or Edge, Safari 26 or later, or Firefox 141 or later on Windows. Other browsers get a plain message instead of a broken page.
- **The draft can be wrong.** The model is small. It can misname objects, misread or skip text, miss the point of the image, and sometimes run longer than the 125 characters it is asked for. Always check it.
- **It is not built for fine print.** Dense text, charts and screenshots are often described loosely.
- **It does not know your page.** The context box helps, but only you know what a reader needs from the image.
- **The first visit is a large download** (about 550 MB), and the model needs a reasonably capable graphics chip and free memory.
- Drafts are in English.

## Run it locally

There is no build step. Any static file server works; one is included:

```bash
node tools/serve.mjs
```

Then open http://localhost:8123/. Add `?first=1` to the address to see the first-visit "Getting the AI ready" screen again.

## Files

- `index.html`: the one page; each screen is a section in it.
- `css/styles.css`: all styles, with the design tokens at the top.
- `js/app.js`: moves between screens, takes in the image, handles copying.
- `js/draft-source.js`: shrinks the image, talks to the worker, tidies the reply.
- `js/draft-worker.js`: the AI itself, with the instructions it is given.

## Credits and licenses

- [Transformers.js](https://github.com/huggingface/transformers.js) by Hugging Face, Apache License 2.0. Loaded from jsDelivr, pinned to version 4.3.2.
- [LFM2.5-VL-450M](https://huggingface.co/LiquidAI/LFM2.5-VL-450M) by Liquid AI, under the [LFM Open License v1.0](https://huggingface.co/LiquidAI/LFM2.5-VL-450M/blob/main/LICENSE). The browser-ready ONNX files come from [onnx-community/LFM2.5-VL-450M-ONNX](https://huggingface.co/onnx-community/LFM2.5-VL-450M-ONNX).

Designed by Tarun Baskar.
