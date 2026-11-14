# Alt Draft

**Alt text, drafted for you. Finished by you.**

Drop in an image, and an AI model running in your own browser writes a first draft of its alt text. You edit it, approve it and copy it. The AI drafts; you decide.

Live site: https://tarundaboss.github.io/alt-draft/

## How it works

- The page is a plain static site (HTML, CSS, JavaScript) with no build step and no server.
- The AI is [Transformers.js](https://github.com/huggingface/transformers.js) running Liquid AI's [LFM2.5-VL-450M](https://huggingface.co/onnx-community/LFM2.5-VL-450M-ONNX) model on WebGPU, inside a Web Worker.
- The first visit downloads the model (about 550 MB). Your browser keeps a copy, so later visits start in a second or two.

## Privacy

Your image never leaves your device. There is no upload, no analytics and no tracking. The only things downloaded are the page, the Transformers.js library (from jsDelivr) and the model files (from Hugging Face).

## Known limits

- It needs a browser with WebGPU: a recent Chrome or Edge on a computer, or Safari 26 or newer.
- The model is small. Its draft is a starting point, not finished alt text: it can misname things, miss what matters, or misread text. Always check it.
- The first visit is a large download.

## Run it locally

```bash
node tools/serve.mjs
```

Then open http://localhost:8123/.

## Credits and licenses

- [Transformers.js](https://github.com/huggingface/transformers.js) by Hugging Face, Apache License 2.0.
- [LFM2.5-VL-450M](https://huggingface.co/LiquidAI/LFM2.5-VL-450M) by Liquid AI, under the [LFM Open License v1.0](https://huggingface.co/LiquidAI/LFM2.5-VL-450M/blob/main/LICENSE). ONNX version from [onnx-community](https://huggingface.co/onnx-community/LFM2.5-VL-450M-ONNX).

Designed by Tarun Baskar.
