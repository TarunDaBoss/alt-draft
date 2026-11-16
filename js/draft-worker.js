// The AI lives here, in a Web Worker, so the page never freezes while it thinks.
// Everything runs on this device. The only downloads are the library and the model files.

import {
  AutoProcessor,
  AutoModelForImageTextToText,
  RawImage,
  TextStreamer,
  InterruptableStoppingCriteria,
} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2';

// The models we can run. `dtype` picks which compressed version of each part to download.
const MODELS = {
  '450m': {
    id: 'onnx-community/LFM2.5-VL-450M-ONNX',
    dtype: { embed_tokens: 'fp16', decoder_model_merged: 'q4f16', vision_encoder: 'fp16' },
    // Used when the graphics card can't do half-precision maths.
    fallbackDtype: { embed_tokens: 'q4', decoder_model_merged: 'q4', vision_encoder: 'q4' },
    approxBytes: 548e6,
  },
};

const SYSTEM_PROMPT = [
  'You write alt text for images, for people who use screen readers.',
  'Reply with the alt text only: one short sentence, two at most, under 125 characters if you can. Then stop.',
  'Describe what matters most in the image, and only what is actually visible in it.',
  'If the image contains important visible text, include that text word for word.',
  'Never start with "Image of", "Picture of" or "Photo of".',
  "Do not name real people from how they look. Do not guess anyone's feelings.",
  'No preamble, no quotation marks, no lists.',
].join(' ');

let loaded = null;       // { key, processor, model }
let loadingPromise = null;
let loadingKey = null;
const stopper = new InterruptableStoppingCriteria();

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function load(key, id) {
  if (loaded?.key === key) return loaded;
  if (loadingPromise && loadingKey === key) return loadingPromise;

  const spec = MODELS[key];
  if (!spec) throw fail('unknown-model', `Unknown model "${key}"`);

  loadingKey = key;
  loadingPromise = (async () => {
    if (!('gpu' in navigator)) throw fail('no-webgpu', 'WebGPU is not available in this browser.');
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw fail('no-webgpu', 'No WebGPU graphics adapter was found.');
    const dtype = adapter.features.has('shader-f16') ? spec.dtype : spec.fallbackDtype;

    // Add up download progress across all the model's files.
    const files = new Map();
    const progress_callback = (event) => {
      if (event.status !== 'progress' || !event.file) return;
      files.set(event.file, { loaded: event.loaded || 0, total: event.total || 0 });
      let got = 0, total = 0;
      for (const f of files.values()) { got += f.loaded; total += f.total; }
      const fraction = Math.min(0.99, got / Math.max(total, spec.approxBytes));
      self.postMessage({ type: 'progress', id, fraction, bytes: got });
    };

    const processor = await AutoProcessor.from_pretrained(spec.id, { progress_callback });
    const model = await AutoModelForImageTextToText.from_pretrained(spec.id, {
      device: 'webgpu',
      dtype,
      progress_callback,
    });

    let bytes = 0;
    for (const f of files.values()) bytes += f.total;
    loaded = { key, processor, model, bytes };
    return loaded;
  })();

  try {
    return await loadingPromise;
  } finally {
    loadingPromise = null;
    loadingKey = null;
  }
}

// Ask the model one question about the picture and return its reply.
async function askModel({ processor, model }, picture, { system, question, maxTokens, sample, onText }) {
  const messages = [
    ...(system ? [{ role: 'system', content: system }] : []),
    { role: 'user', content: [{ type: 'image' }, { type: 'text', text: question }] },
  ];
  const prompt = processor.apply_chat_template(messages, { add_generation_prompt: true });
  const inputs = await processor(picture, prompt, { add_special_tokens: false });

  let text = '';
  const streamer = new TextStreamer(processor.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (piece) => { text += piece; onText?.(text); },
  });

  await model.generate({
    ...inputs,
    max_new_tokens: maxTokens,
    ...(sample ? { do_sample: true, temperature: 0.9, top_k: 40 } : { do_sample: false }),
    repetition_penalty: 1.05,
    streamer,
    stopping_criteria: stopper,
  });
  return text.trim();
}

// Is this a famous fictional character? Returns e.g. "Goku from Dragon Ball Z", or '' if not.
// Asked as two small, separate questions because the model answers those far more
// reliably than when the same thing is buried in the alt-text instructions.
async function recogniseCharacter(ai, picture) {
  const isCharacter = await askModel(ai, picture, {
    question: 'Does this image show a famous fictional character from a cartoon, anime, comic, film or video game? '
      + 'If yes, reply with only the character name and what it is from. If not, reply with only the word no.',
    maxTokens: 6,
  });
  if (/^\W*no\b/i.test(isCharacter)) return '';

  const name = await askModel(ai, picture, {
    question: 'Name this fictional character and the series it is from. Reply with only: NAME from SERIES.',
    maxTokens: 16,
  });
  const clean = name.replace(/[."\n]+$/g, '').trim();
  // Only trust a short, well-formed answer.
  return /^[^.,:;!?\n]{2,40} from [^.,:;!?\n]{2,50}$/.test(clean) ? clean : '';
}

function buildRequest(context, previous, character) {
  let text = character
    ? `Write alt text for this image in one short, plain sentence. Begin with the words: ${character}`
    : 'Write alt text for this image.';
  if (context) text += ` It will appear in: ${context}. Use that only to choose which visible details matter. Never describe things that are not in the image.`;
  if (previous) text += ` Write a different version from this earlier draft: "${previous}"`;
  return text;
}

async function generate({ id, key, image, context, previous }) {
  const ai = await load(key, id);
  stopper.reset();
  const picture = new RawImage(new Uint8ClampedArray(image.data), image.width, image.height, 4).rgb();

  const started = performance.now();
  const character = await recogniseCharacter(ai, picture);
  const text = await askModel(ai, picture, {
    system: SYSTEM_PROMPT,
    question: buildRequest(context, previous, character),
    maxTokens: 70,
    sample: Boolean(previous), // first drafts are steady and literal; rewrites may vary
    onText: (soFar) => self.postMessage({ type: 'text', id, text: soFar }),
  });

  return { text, character, ms: Math.round(performance.now() - started) };
}

self.addEventListener('message', async ({ data }) => {
  const { type, id } = data;
  try {
    if (type === 'load') {
      const { bytes } = await load(data.key, id);
      self.postMessage({ type: 'done', id, bytes });
    } else if (type === 'generate') {
      const result = await generate(data);
      self.postMessage({ type: 'done', id, ...result });
    } else if (type === 'stop') {
      stopper.interrupt();
    }
  } catch (error) {
    self.postMessage({ type: 'error', id, code: error.code || 'failed', message: String(error?.message || error) });
  }
});
