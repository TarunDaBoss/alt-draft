// Where drafts come from: this file talks to the AI, which runs in a Web Worker
// (js/draft-worker.js) so the page stays responsive.
//
// The image is shrunk here and handed straight to the worker in memory.
// It is never uploaded anywhere.

const READY_KEY = 'alt-draft:model-ready';
const MODEL_KEY = '450m';
const MAX_IMAGE_SIDE = 768; // big photos are shrunk to this before the AI looks at them

let worker = null;
let nextId = 1;
const jobs = new Map(); // id → { resolve, reject, onProgress, onText }

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./draft-worker.js', import.meta.url), { type: 'module' });
  worker.addEventListener('message', ({ data }) => {
    const job = jobs.get(data.id);
    if (!job) return;
    if (data.type === 'progress') job.onProgress?.(data.fraction);
    else if (data.type === 'text') job.onText?.(data.text);
    else if (data.type === 'done') { jobs.delete(data.id); job.resolve(data); }
    else if (data.type === 'error') {
      jobs.delete(data.id);
      const error = new Error(data.message);
      error.code = data.code;
      job.reject(error);
    }
  });
  worker.addEventListener('error', (event) => {
    // The worker itself failed to start (for example, the library couldn't be downloaded).
    const error = new Error(event.message || 'The AI worker failed to start.');
    error.code = 'worker-failed';
    for (const job of jobs.values()) job.reject(error);
    jobs.clear();
    worker = null;
  });
  return worker;
}

function ask(message, { onProgress, onText, signal, transfer = [] } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Cancelled', 'AbortError'));
    const id = nextId++;
    jobs.set(id, { resolve, reject, onProgress, onText });
    signal?.addEventListener('abort', () => {
      if (!jobs.delete(id)) return;
      if (message.type === 'generate') worker?.postMessage({ type: 'stop' });
      reject(new DOMException('Cancelled', 'AbortError'));
    }, { once: true });
    getWorker().postMessage({ ...message, id }, transfer);
  });
}

/** Has the model already been downloaded on an earlier visit? */
export function isReady() {
  try { return localStorage.getItem(READY_KEY) === MODEL_KEY; } catch { return false; }
}

/** Forget the earlier visit, so the "Getting ready" screen shows again. */
export function forgetReady() {
  try { localStorage.removeItem(READY_KEY); } catch { /* storage unavailable */ }
}

/** Can this browser run the AI at all? */
export function isSupported() {
  return 'gpu' in navigator && typeof Worker !== 'undefined';
}

/**
 * Get the AI ready: downloads the model on the first visit (the browser keeps
 * a copy, so later visits skip the download). Calls onProgress with 0 to 1.
 */
export async function prepare({ onProgress, signal } = {}) {
  await ask({ type: 'load', key: MODEL_KEY }, { onProgress, signal });
  onProgress?.(1);
  try { localStorage.setItem(READY_KEY, MODEL_KEY); } catch { /* storage unavailable */ }
}

/** Open the chosen file as a picture we can draw. */
async function openPicture(file) {
  try {
    return await createImageBitmap(file); // fast, and respects a photo's rotation
  } catch {
    // Some formats (such as SVG) need the slower, classic route.
    const url = URL.createObjectURL(file);
    try {
      return await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(Object.assign(new Error('The image could not be opened.'), { code: 'bad-image' }));
        img.src = url;
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}

/** Check the file really is a readable image, before any waiting starts. */
export async function checkImage(file) {
  try {
    const picture = await openPicture(file);
    picture.close?.();
  } catch {
    throw Object.assign(new Error('The image could not be opened.'), { code: 'bad-image' });
  }
}

/** Shrink the image and turn it into raw pixels the AI can read. */
async function readPixels(file) {
  const picture = await openPicture(file);
  const naturalW = picture.naturalWidth || picture.width || 512;
  const naturalH = picture.naturalHeight || picture.height || 512;
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(naturalW, naturalH));
  const width = Math.max(1, Math.round(naturalW * scale));
  const height = Math.max(1, Math.round(naturalH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; // see-through areas become white, not black
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(picture, 0, 0, width, height);
  picture.close?.();
  const { data } = ctx.getImageData(0, 0, width, height);
  return { data: data.buffer, width, height };
}

/** Tidy the model's reply into plain alt text. */
export function tidy(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/^\s*([\w-]+\s+){0,2}(alt[\s-]?text|description|caption)\s*:\s*/i, '') // "Alt text:", "Image description:"…
    .replace(/^["“]([^"“”]*)["”]$/, '$1') // drop quotes only when they wrap the whole reply
    .replace(/^(an?\s+)?(image|picture|photo|photograph)\s+of\s+/i, '')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Write a draft for an image. Calls onText with the draft so far as each word
 * arrives, and returns the finished draft.
 *  - file:     the chosen image file
 *  - context:  what the person typed in "Where will this image appear?"
 *  - previous: the earlier draft, when the person asked for a rewrite
 */
export async function writeDraft({ file, context, previous, onText, signal }) {
  const image = await readPixels(file);
  const result = await ask(
    { type: 'generate', key: MODEL_KEY, image, context, previous },
    { onText: (text) => onText?.(tidy(text)), signal, transfer: [image.data] },
  );
  return tidy(result.text);
}
