#!/usr/bin/env node
/**
 * Builds the LaTeX report (docs/sprawozdanie/main.tex) into
 * docs/sprawozdanie/build/main.pdf inside the `texlive/texlive` Docker image,
 * so no local TeX distribution is needed.
 *
 * Usage: `npm run docs:report` (add `-- --clean` to remove the build directory first).
 */
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const IMAGE = process.env.TEXLIVE_IMAGE ?? 'texlive/texlive:latest';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reportDir = resolve(repoRoot, 'docs', 'sprawozdanie');

/**
 * Runs a command synchronously with inherited stdio and terminates the current
 * process with the command's exit code if it fails.
 *
 * @param {string} command - Executable to run (e.g. `docker`).
 * @param {string[]} args - Arguments passed to the executable.
 * @returns {void} Returns only when the command exits with code 0.
 * @throws Never throws; on spawn error or non-zero exit it prints a message and
 *   calls `process.exit` with a non-zero code.
 */
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) {
    console.error(`Failed to start "${command}": ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (process.argv.includes('--clean')) {
  rmSync(resolve(reportDir, 'build'), { recursive: true, force: true });
}

// latexmk runs pdflatex and biber as many times as needed to resolve references.
run('docker', [
  'run',
  '--rm',
  '-v',
  `${reportDir}:/data`,
  '-w',
  '/data',
  IMAGE,
  'latexmk',
  '-pdf',
  '-interaction=nonstopmode',
  '-halt-on-error',
  '-file-line-error',
  '-outdir=build',
  'main.tex',
]);

console.log(`Report built: ${resolve(reportDir, 'build', 'main.pdf')}`);
