#!/usr/bin/env node
/**
 * Renders saved terminal output (with ANSI colors) as a PNG that looks like a
 * terminal window, for the report's test screenshots.
 *
 * Usage:
 *   node scripts/terminal-screenshot.mjs <input.log> <output.png>
 *     [--title=<window title>] [--command=<command shown in the first line>]
 *     [--tail=<last N lines>] [--from=<text of the first line to keep>] [--width=<px>]
 *
 * Only colors and bold/dim are interpreted; cursor movements (progress spinners)
 * are dropped. Side effects: writes the PNG (headless Chromium).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

/**
 * Returns the value of a `--name=value` command-line option.
 *
 * @param {string} name - Option name without the dashes.
 * @returns {string | undefined} The option value, or undefined when not given.
 */
function option(name) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

const [input, output] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
if (!input || !output) {
  console.error('Usage: terminal-screenshot.mjs <input.log> <output.png> [options]');
  process.exit(1);
}

/** The ESC character that starts ANSI escape sequences. */
const ESC = String.fromCharCode(27);
/** An SGR (color/style) sequence; group 1 holds its codes. */
const SGR = new RegExp(`${ESC}\\[([0-9;]*)m`, 'g');

/** Foreground colors of the 16 basic ANSI codes (30–37, 90–97), a dark theme. */
const COLORS = {
  30: '#5c6370',
  31: '#f47067',
  32: '#8ddb8c',
  33: '#e0c56e',
  34: '#6cb6ff',
  35: '#dcbdfb',
  36: '#56d4dd',
  37: '#d1d7e0',
  90: '#8b949e',
  91: '#ff938a',
  92: '#a5e3a4',
  93: '#f0d58a',
  94: '#96d0ff',
  95: '#eedcff',
  96: '#8ae8ef',
  97: '#ffffff',
};

/**
 * Escapes text for HTML.
 *
 * @param {string} text - Plain text.
 * @returns {string} The text with `&`, `<` and `>` escaped.
 */
function escapeHtml(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/**
 * Converts one line with ANSI SGR sequences into HTML spans.
 *
 * @param {string} line - Line of terminal output (other escape sequences removed).
 * @returns {string} HTML with inline color / bold / dim styles.
 */
function lineToHtml(line) {
  let html = '';
  let style = { color: undefined, bold: false, dim: false };
  let last = 0;
  /**
   * Appends text with the current style.
   *
   * @param {string} text - Text between two escape sequences.
   */
  const push = (text) => {
    if (!text) return;
    const css = [
      style.color ? `color:${style.color}` : '',
      style.bold ? 'font-weight:700' : '',
      style.dim ? 'opacity:.6' : '',
    ]
      .filter(Boolean)
      .join(';');
    html += css ? `<span style="${css}">${escapeHtml(text)}</span>` : escapeHtml(text);
  };
  for (const match of line.matchAll(SGR)) {
    push(line.slice(last, match.index));
    last = match.index + match[0].length;
    for (const code of (match[1] || '0').split(';').map(Number)) {
      if (code === 0) style = { color: undefined, bold: false, dim: false };
      else if (code === 1) style.bold = true;
      else if (code === 2) style.dim = true;
      else if (code === 22) style = { ...style, bold: false, dim: false };
      else if (code === 39) style.color = undefined;
      else if (COLORS[code]) style.color = COLORS[code];
    }
  }
  push(line.slice(last));
  return html;
}

let lines = readFileSync(input, 'utf8')
  .replace(/\r\n/g, '\n')
  // Drop cursor movements / line clears (progress output), keep color codes.
  .replace(new RegExp(`${ESC}\\[[0-9;?]*[ABCDEFGHJKSTfhlnsu]`, 'g'), '')
  .split('\n')
  // A carriage return inside a line means it was overwritten: keep the last part.
  .map((line) => line.split('\r').at(-1) ?? '');
const from = option('from');
if (from) {
  const start = lines.findIndex((line) => line.replace(SGR, '').includes(from));
  if (start >= 0) lines = lines.slice(start);
}
const tail = Number(option('tail') ?? 0);
if (tail > 0) lines = lines.slice(-tail);
while (lines.length && !lines.at(-1).trim()) lines.pop();

const command = option('command');
const body = [
  ...(command
    ? [
        `<span style="color:#8ddb8c">PS C:\\repo\\JEE_Projekt_PR_122217&gt;</span> ${escapeHtml(command)}`,
      ]
    : []),
  ...lines.map(lineToHtml),
].join('\n');

const html = `<!doctype html><meta charset="utf-8"><style>
  body { margin: 0; background: #ffffff; }
  .window { display: inline-block; margin: 8px; border-radius: 8px; overflow: hidden;
    box-shadow: 0 2px 8px rgba(0,0,0,.35); background: #1e2228; }
  .bar { background: #2d333b; color: #adbac7; font: 13px 'Segoe UI', sans-serif;
    padding: 7px 12px; }
  .bar i { display: inline-block; width: 11px; height: 11px; border-radius: 50%;
    margin-right: 6px; vertical-align: -1px; }
  pre { margin: 0; padding: 12px 16px; color: #d1d7e0; width: ${option('width') ?? 1000}px;
    font: 13px/1.45 'Cascadia Mono', Consolas, monospace; white-space: pre-wrap; }
</style><div class="window"><div class="bar">
  <i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i>
  &nbsp;${escapeHtml(option('title') ?? 'Terminal')}</div><pre>${body}</pre></div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.setContent(html);
await page.locator('.window').screenshot({ path: resolve(output) });
await browser.close();
console.log(output);
