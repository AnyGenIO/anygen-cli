/**
 * Diagram → PNG rendering engine
 *
 * Uses Playwright (headless Chromium) to render in-browser:
 * - Excalidraw: loads @excalidraw/excalidraw lib, JSON → PNG
 * - DrawIO: loads diagrams.net viewer, XML → SVG → screenshot
 *
 * Ported from anygen-suite-skill/scripts/diagram-to-image.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DiagramType = 'excalidraw' | 'drawio';

/** Minimal Playwright interfaces (lazy-loaded, no compile-time dependency) */
interface PwModule {
  chromium: {
    launch(opts?: { executablePath?: string; args?: string[] }): Promise<PwBrowser>;
  };
}

interface PwBrowser {
  newPage(): Promise<PwPage>;
  close(): Promise<void>;
}

interface PwPage {
  setContent(html: string, opts?: { waitUntil?: string }): Promise<void>;
  waitForFunction(expression: string, opts?: { timeout?: number }): Promise<void>;
  evaluate(expression: string): Promise<unknown>;
  $(selector: string): Promise<PwElement | null>;
}

interface PwElement {
  screenshot(opts?: { type?: string }): Promise<Buffer>;
}

export interface RenderOptions {
  type: DiagramType;
  /** Raw content: JSON string (excalidraw) or XML (drawio) */
  content: string;
  /** PNG scale factor (default 2) */
  scale?: number;
  /** Background color (default #ffffff) */
  background?: string;
  /** Export padding in px (default 20) */
  padding?: number;
}

export interface RenderResult {
  /** PNG binary data */
  data: Buffer;
}

// ---------------------------------------------------------------------------
// Lazy Playwright import
// ---------------------------------------------------------------------------

async function getPlaywright(): Promise<PwModule> {
  // ESM has no __dirname, compute manually
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(currentDir, '../..');

  const candidates = [
    'playwright',
    'playwright-core',
    ...findPnpmPackage(projectRoot, 'playwright'),
    ...findPnpmPackage(projectRoot, 'playwright-core'),
  ];

  for (const id of candidates) {
    try {
      const mod = await import(id);
      const pw = mod.default ?? mod;
      if (pw.chromium) return pw;
    } catch { /* try next */ }
  }

  throw new Error(
    'Playwright not found. Install:\n' +
    '  npm i playwright-core\n' +
    '  npx playwright install chromium',
  );
}

async function launchBrowser(pw: PwModule): Promise<PwBrowser> {
  const systemChromePaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];

  for (const execPath of systemChromePaths) {
    try {
      fs.accessSync(execPath);
      return await pw.chromium.launch({
        executablePath: execPath,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    } catch { /* try next */ }
  }

  return await pw.chromium.launch();
}

function findPnpmPackage(projectRoot: string, name: string): string[] {
  const pnpmDir = path.join(projectRoot, 'node_modules/.pnpm');
  try {
    const entries = fs.readdirSync(pnpmDir);
    return entries
      .filter((e: string) => e.startsWith(`${name}@`))
      .map((e: string) => path.join(pnpmDir, e, 'node_modules', name));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// HTML Templates
//
// All browser-side logic is written as plain JS strings in HTML templates
// to prevent tsx/esbuild from injecting Node-specific helpers (__name etc.)
// into page.evaluate() calls.
// ---------------------------------------------------------------------------

function excalidrawHtml(background: string): string {
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Nunito:ital,wght@0,400;0,600;0,700;1,400&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=Lilita+One&display=swap');
  body { margin: 0; background: ${background}; }
</style>
</head>
<body>
<script type="module">
try {
  const mod = await import('https://esm.sh/@excalidraw/excalidraw@0.18.0?bundle-deps&no-dts');

  await Promise.all([
    document.fonts.load('16px Nunito'),
    document.fonts.load('20px "Lilita One"'),
    document.fonts.ready,
  ]);

  window.__excalib = {
    exportToBlob: mod.exportToBlob,
    convert: mod.convertToExcalidrawElements,
  };

  window.__exportPng = async function(raw, bg, padding, scale) {
    var lib = window.__excalib;
    var elements = JSON.parse(raw);
    if (!Array.isArray(elements) && Array.isArray(elements && elements.elements)) {
      elements = elements.elements;
    }
    if (
      elements.length > 0
      && elements[0].version === undefined
      && elements[0].versionNonce === undefined
      && lib.convert
    ) {
      elements = lib.convert(elements);
    }
    var blob = await lib.exportToBlob({
      elements: elements,
      appState: { viewBackgroundColor: bg, exportBackground: true },
      files: {},
      exportPadding: padding,
      mimeType: 'image/png',
      quality: 1,
      getDimensions: function(w, h) {
        return { width: w * scale, height: h * scale, scale: scale };
      },
    });
    var buf = await blob.arrayBuffer();
    var bytes = new Uint8Array(buf);
    var binary = '';
    for (var i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  window.__ready = true;
} catch (e) {
  window.__error = (e && e.message) || String(e);
  window.__ready = true;
}
</script>
</body></html>`;
}

function drawioHtml(xml: string, background: string): string {
  const config = JSON.stringify({
    xml,
    highlight: '#0000ff',
    nav: false,
    resize: true,
    toolbar: '',
    border: 20,
  });
  const escapedConfig = config
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>
  body { margin: 0; background: ${background}; }
  .geDiagramContainer { overflow: visible !important; }
</style>
</head>
<body>
<div id="graph-container" class="mxgraph" data-mxgraph="${escapedConfig}"></div>
<script src="https://viewer.diagrams.net/js/viewer-static.min.js"><\/script>
<script>
  function waitForSvg() {
    var container = document.getElementById('graph-container');
    var svg = container.querySelector('svg');
    if (svg && svg.getBBox) {
      try {
        var bbox = svg.getBBox();
        if (bbox.width > 0 && bbox.height > 0) {
          window.__ready = true;
          return;
        }
      } catch(_e) {}
    }
    setTimeout(waitForSvg, 200);
  }
  setTimeout(waitForSvg, 500);

  setTimeout(function() {
    if (!window.__ready) {
      window.__error = 'DrawIO viewer rendering timed out';
      window.__ready = true;
    }
  }, 30000);
</script>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

async function waitForReady(page: PwPage, timeoutMs = 120_000): Promise<void> {
  await page.waitForFunction('window.__ready === true', { timeout: timeoutMs });
  const error = await page.evaluate('window.__error');
  if (error) {
    throw new Error(`Library loading failed: ${error}`);
  }
}

async function renderExcalidraw(
  page: PwPage,
  content: string,
  opts: { scale: number; background: string; padding: number },
): Promise<Buffer> {
  await page.setContent(excalidrawHtml(opts.background), { waitUntil: 'domcontentloaded' });
  await waitForReady(page);

  await page.evaluate(`window.__inputData = ${JSON.stringify(content)}`);

  const base64 = await page.evaluate(
    `window.__exportPng(window.__inputData, ${JSON.stringify(opts.background)}, ${opts.padding}, ${opts.scale})`,
  ) as string;
  return Buffer.from(base64, 'base64');
}

async function renderDrawio(
  page: PwPage,
  content: string,
  opts: { scale: number; background: string },
): Promise<Buffer> {
  await page.setContent(drawioHtml(content, opts.background), { waitUntil: 'domcontentloaded' });
  await waitForReady(page);

  const svgElement = await page.$('#graph-container svg');
  if (!svgElement) {
    throw new Error('DrawIO rendering failed: no SVG element found');
  }
  return await svgElement.screenshot({ type: 'png' });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render an Excalidraw / DrawIO diagram to PNG.
 */
export async function renderDiagram(opts: RenderOptions): Promise<RenderResult> {
  const pw = await getPlaywright();
  const browser = await launchBrowser(pw);
  const scale = opts.scale ?? 2;
  const background = opts.background ?? '#ffffff';
  const padding = opts.padding ?? 20;

  try {
    const page = await browser.newPage();

    let data: Buffer;
    switch (opts.type) {
      case 'excalidraw':
        data = await renderExcalidraw(page, opts.content, { scale, background, padding });
        break;
      case 'drawio':
        data = await renderDrawio(page, opts.content, { scale, background });
        break;
      default:
        throw new Error(`Unknown diagram type: ${opts.type}`);
    }

    return { data };
  } finally {
    await browser.close();
  }
}
