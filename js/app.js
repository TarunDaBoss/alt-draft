// Alt Draft — the page's behaviour.
// One page, five states: drop → ready (first visit only) → writing → edit → copied.
// (Plus an error state if the AI can't start.)

import { isReady, forgetReady, isSupported, checkImage, prepare, writeDraft } from './draft-source.js';

const $ = (id) => document.getElementById(id);

const el = {
  screenDrop: $('screen-drop'),
  screenWork: $('screen-work'),
  screenCopied: $('screen-copied'),
  panelReady: $('panel-ready'),
  panelWriting: $('panel-writing'),
  panelEdit: $('panel-edit'),
  panelError: $('panel-error'),
  errorTitle: $('error-title'),
  errorText: $('error-text'),
  errorRetry: $('error-retry'),
  errorBack: $('error-back'),

  dropzone: $('dropzone'),
  chooseFile: $('choose-file'),
  fileInput: $('file-input'),
  dropError: $('drop-error'),
  context: $('context'),

  previewImage: $('preview-image'),
  readyTitle: $('ready-title'),
  progress: $('progress'),
  progressFill: $('progress-fill'),
  progressValue: $('progress-value'),
  writingStatus: $('writing-status'),
  writingStatusText: $('writing-status-text'),
  writingWords: $('writing-words'),

  draftField: $('draft-field'),
  draftText: $('draft-text'),
  charCount: $('char-count'),
  decorativeNote: $('decorative-note'),
  decorative: $('decorative'),
  rewrite: $('rewrite'),
  approve: $('approve'),

  copiedHeadline: $('copied-headline'),
  copiedSubhead: $('copied-subhead'),
  finalText: $('final-text'),
  another: $('another'),
  editAgain: $('edit-again'),
};

const MAX_FILE_BYTES = 50 * 1024 * 1024; // refuse files bigger than 50 MB
const UNSUPPORTED_TEXT = 'Alt Draft needs WebGPU to run the AI on your device, and this browser doesn\u2019t have it. '
  + 'It works in a recent Chrome or Edge, Safari 26 or later, and Firefox 141 or later on Windows.';

// Says something to screen-reader users without moving them.
function announce(message) {
  const region = $('announcer');
  region.textContent = '';
  setTimeout(() => { region.textContent = message; }, 50);
}

const session = {
  file: null,        // the image the person chose (stays on this device)
  imageUrl: null,    // local preview address for that image
  run: null,         // lets us cancel a draft that's in progress
};

// Add ?first=1 to the address to see the "Getting ready" screen again.
if (new URLSearchParams(location.search).has('first')) forgetReady();

// ---------- Moving between states ----------

function show(state) {
  const inWork = ['ready', 'writing', 'edit', 'error'].includes(state);
  el.screenDrop.hidden = state !== 'drop';
  el.screenWork.hidden = !inWork;
  el.screenCopied.hidden = state !== 'copied';
  el.panelReady.hidden = state !== 'ready';
  el.panelWriting.hidden = state !== 'writing';
  el.panelEdit.hidden = state !== 'edit';
  el.panelError.hidden = state !== 'error';
  el.screenWork.classList.toggle('is-ready', state === 'ready' || state === 'error');
  document.body.dataset.state = state;
  window.scrollTo(0, 0);

  // Move keyboard and screen-reader focus to the new screen.
  const focusTarget = {
    drop: el.chooseFile,
    ready: el.readyTitle,
    writing: el.writingStatus,
    edit: el.decorative.getAttribute('aria-checked') === 'true' ? el.approve : el.draftText,
    copied: el.copiedHeadline,
    error: el.errorTitle,
  }[state];
  focusTarget?.focus({ preventScroll: true });
  if (state === 'edit') {
    resizeDraft();
    const end = el.draftText.value.length;
    el.draftText.setSelectionRange(end, end);
  }
}

// ---------- Taking in an image (drop, choose, paste) ----------

function takeFile(file) {
  if (!file) return;
  let problem = '';
  if (!file.type.startsWith('image/')) {
    problem = `\u201c${file.name}\u201d isn\u2019t an image. Try a JPEG, PNG, WebP or GIF.`;
  } else if (file.size > MAX_FILE_BYTES) {
    problem = `That image is very large (${Math.round(file.size / 1024 / 1024)} MB). Try one under 50 MB, or save a smaller copy first.`;
  }
  if (problem) {
    el.dropError.textContent = problem;
    el.dropError.hidden = false;
    return;
  }
  el.dropError.hidden = true;
  if (session.imageUrl) URL.revokeObjectURL(session.imageUrl);
  session.file = file;
  session.imageUrl = URL.createObjectURL(file);
  el.previewImage.src = session.imageUrl;
  setDecorative(false);
  startDraft();
}

el.chooseFile.addEventListener('click', () => el.fileInput.click());
el.fileInput.addEventListener('change', () => {
  takeFile(el.fileInput.files[0]);
  el.fileInput.value = '';
});

// Dropping works anywhere on the page while the drop screen is showing.
const onDropScreen = () => document.body.dataset.state === 'drop';
let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  if (!onDropScreen()) return;
  e.preventDefault();
  dragDepth++;
  el.dropzone.classList.add('is-dragover');
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) el.dropzone.classList.remove('is-dragover');
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  el.dropzone.classList.remove('is-dragover');
  if (!onDropScreen()) return;
  const files = [...(e.dataTransfer?.files || [])];
  takeFile(files.find((f) => f.type.startsWith('image/')) || files[0]);
});

window.addEventListener('paste', (e) => {
  if (!onDropScreen()) return;
  const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
  if (!file) return; // ordinary text paste, e.g. into the "where will this appear" box
  e.preventDefault();
  takeFile(file);
});

// ---------- Getting ready and writing ----------

let lastSpokenQuarter = 0;
function setProgress(fraction) {
  const percent = Math.round(fraction * 100);
  const quarter = Math.floor(percent / 25);
  if (percent === 0) lastSpokenQuarter = 0;
  else if (quarter > lastSpokenQuarter && percent < 100) {
    lastSpokenQuarter = quarter;
    announce(`Getting the AI ready: ${quarter * 25} percent.`);
  }
  el.progressFill.style.width = percent + '%';
  el.progressValue.textContent = percent + '%';
  el.progress.setAttribute('aria-valuenow', String(percent));
}

function setStatus(text) {
  el.writingStatusText.textContent = text;
}

function showError(error) {
  console.error(error);
  el.errorRetry.hidden = false;
  if (error.code === 'no-webgpu') {
    el.errorTitle.textContent = 'This browser can\u2019t run the AI';
    el.errorText.textContent = UNSUPPORTED_TEXT;
    el.errorRetry.hidden = true;
  } else if (error.code === 'bad-image') {
    el.errorTitle.textContent = 'That image couldn\u2019t be opened';
    el.errorText.textContent = 'The file may be damaged or in a format this browser can\u2019t read. Try a JPEG or PNG copy.';
    el.errorRetry.hidden = true;
  } else if (!navigator.onLine) {
    el.errorTitle.textContent = 'You\u2019re offline';
    el.errorText.textContent = 'The AI still needs to be downloaded, and that needs a connection. Reconnect and try again. Your image is still here.';
  } else if (isReady()) {
    el.errorTitle.textContent = 'The draft didn\u2019t work';
    el.errorText.textContent = 'The AI ran into a problem on this device. It may be short on memory: close a few tabs and try again. Your image is still here.';
  } else {
    el.errorTitle.textContent = 'The AI couldn\u2019t load';
    el.errorText.textContent = 'The download didn\u2019t finish. Check your connection and try again. It picks up where it left off, and your image is still here.';
  }
  show('error');
}

// rewriteOf: the earlier draft, when the person asked for a different one.
async function startDraft(rewriteOf = '') {
  session.run?.abort();
  const run = new AbortController();
  session.run = run;
  const { signal } = run;

  try {
    if (!isSupported()) throw Object.assign(new Error('WebGPU missing'), { code: 'no-webgpu' });

    if (!rewriteOf) await checkImage(session.file);

    const firstVisit = !isReady();
    el.writingWords.textContent = '';
    if (firstVisit) {
      setProgress(0);
      show('ready');
    } else {
      setStatus('Starting the AI…');
      show('writing');
    }

    await prepare({
      signal,
      onProgress: (fraction) => {
        if (firstVisit) setProgress(fraction);
        // If the browser cleared its saved copy, the download happens again: say so.
        else if (fraction > 0 && fraction < 1) setStatus(`Getting the AI ready… ${Math.round(fraction * 100)}%`);
      },
    });

    setStatus('Writing a draft…');
    if (firstVisit) show('writing');
    const draft = await writeDraft({
      file: session.file,
      context: el.context.value.trim(),
      previous: rewriteOf,
      onText: (text) => { el.writingWords.textContent = text; },
      signal,
    });

    el.draftText.value = draft;
    updateCount();
    show('edit');
    announce(draft
      ? `Draft ready: ${draft} Check it and edit it before you use it.`
      : 'The AI didn\u2019t write anything for this image. Write the alt text yourself, or try Rewrite draft.');
  } catch (error) {
    if (error.name !== 'AbortError') showError(error);
  }
}

el.errorRetry.addEventListener('click', () => startDraft());
el.errorBack.addEventListener('click', () => resetToDrop());

// ---------- Edit and approve ----------

function updateCount() {
  const n = el.draftText.value.trim().length;
  const advice = n > 125 ? 'On the long side. Trim it if you can' : 'Aim for a sentence or two';
  el.charCount.textContent = `${n} ${n === 1 ? 'character' : 'characters'} · ${advice}`;
  el.approve.disabled = !isDecorative() && n === 0;
}

function resizeDraft() {
  el.draftText.style.height = 'auto';
  el.draftText.style.height = el.draftText.scrollHeight + 'px';
}

el.draftText.addEventListener('input', () => { updateCount(); resizeDraft(); });
el.draftText.parentElement.addEventListener('click', () => el.draftText.focus());
window.addEventListener('resize', () => { if (!el.panelEdit.hidden) resizeDraft(); });

const isDecorative = () => el.decorative.getAttribute('aria-checked') === 'true';

function setDecorative(on) {
  el.decorative.setAttribute('aria-checked', String(on));
  el.draftField.hidden = on;
  el.decorativeNote.hidden = !on;
  el.rewrite.disabled = on;
  updateCount();
  if (!on && !el.panelEdit.hidden) resizeDraft();
}
el.decorative.addEventListener('click', () => setDecorative(!isDecorative()));

el.rewrite.addEventListener('click', () => startDraft(el.draftText.value.trim()));

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers, or pages not served securely: fall back to the classic way.
    const helper = document.createElement('textarea');
    helper.value = text;
    helper.setAttribute('readonly', '');
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    helper.remove();
    return ok;
  }
}

el.approve.addEventListener('click', async () => {
  const decorative = isDecorative();
  const text = decorative ? 'alt=""' : el.draftText.value.trim();
  const copied = await copyText(text);

  el.finalText.textContent = text;
  el.copiedHeadline.textContent = copied ? 'Copied.' : 'Ready to copy.';
  if (decorative) {
    el.copiedSubhead.textContent = 'Use an empty alt so screen readers skip this image.';
  } else {
    el.copiedSubhead.textContent = copied
      ? 'Paste it wherever your image goes.'
      : "Your browser blocked copying. Select the text below and copy it yourself.";
  }
  show('copied');
});

// ---------- Copied ----------

el.editAgain.addEventListener('click', () => show('edit'));

function resetToDrop() {
  session.run?.abort();
  if (session.imageUrl) URL.revokeObjectURL(session.imageUrl);
  session.file = null;
  session.imageUrl = null;
  el.previewImage.removeAttribute('src');
  el.context.value = '';
  el.draftText.value = '';
  setDecorative(false);
  show('drop');
}
el.another.addEventListener('click', resetToDrop);

// ---------- How it works / Privacy panels ----------

for (const opener of document.querySelectorAll('[data-opens]')) {
  const sheet = $(opener.dataset.opens);
  opener.addEventListener('click', () => sheet.showModal());
  // Clicking the dimmed area outside the panel closes it.
  sheet.addEventListener('click', (e) => {
    const box = sheet.getBoundingClientRect();
    const outside = e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom;
    if (e.target === sheet && outside) sheet.close();
  });
}

// ---------- Start ----------

document.body.dataset.state = 'drop';

// Say so up front if this browser can't run the AI.
if (!isSupported()) {
  $('support-note').textContent = UNSUPPORTED_TEXT;
  $('support-note').hidden = false;
}

// On return visits the model is already saved in the browser, so wake it up
// straight away. On a first visit we wait until an image is chosen.
if (isReady() && isSupported()) prepare().catch(() => { /* shown later, when a draft is asked for */ });
