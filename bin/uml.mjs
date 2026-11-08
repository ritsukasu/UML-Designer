#!/usr/bin/env node
// uml-designer CLI: validate a diagram.json and deliver it as one offline HTML viewer.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = join(ROOT, 'web', 'index.html');

// The viewer and the CLI share one implementation of check/plantuml/mermaid:
// the block between the core markers in web/index.html.
export function loadCore(html = readFileSync(TEMPLATE, 'utf8')) {
  const a = html.indexOf('/*core*/'), b = html.indexOf('/*end-core*/');
  if (a < 0 || b < 0) throw new Error('web/index.html is missing its core markers');
  return new Function(html.slice(a + 8, b) + '\nreturn {check,plantuml,mermaid}')();
}

export function embed(html, diagram) {
  const json = JSON.stringify(diagram).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16));
  const tag = '<script id="uml-data" type="application/json">';
  const i = html.indexOf(tag);
  if (i < 0) throw new Error('web/index.html is missing the uml-data script tag');
  const j = html.indexOf('</script>', i);
  return html.slice(0, i) + tag + json + html.slice(j);
}

function readDiagram(file) {
  if (!file) fail('Missing diagram file. Usage: uml <command> diagram.json');
  if (!existsSync(file)) fail(`No such file: ${file}`);
  const text = readFileSync(file, 'utf8');
  try { return JSON.parse(text); }
  catch (e) { console.error(`  error  invalid-json\n    ${e.message}`); console.error('  ✗ 1 error'); process.exit(1); }
}

function report(core, diagram) {
  const errs = core.check(diagram);
  errs.forEach(e => console.error(`  error  ${e.code}\n    ${e.message}`));
  if (errs.length) { console.error(`  ✗ ${errs.length} error${errs.length > 1 ? 's' : ''}`); return false; }
  console.log('  ✓ valid: no diagnostics');
  return true;
}

function fail(msg) { console.error(msg); process.exit(1); }

function open(path) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [path]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', path]] : ['xdg-open', [path]];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch {}
}

const HELP = `uml-designer: interactive UML diagrams from a small JSON, as one offline HTML file.

Usage
  uml validate <diagram.json>                 check the file and name every problem
  uml deliver  <diagram.json> [--out f.html] [--open]
                                              validate, then write one self-contained viewer
  uml export   <diagram.json> --format puml|mmd
                                              print PlantUML or Mermaid source
  uml init     [class|usecase] [file]         write a starter diagram.json

Diagram types: "class" (default) and "usecase". See README.md.`;

function main(argv) {
  const [cmd, ...rest] = argv;
  const flags = {}, pos = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--open') flags.open = true;
    else if (a === '--out' || a === '--format') flags[a.slice(2)] = rest[++i];
    else pos.push(a);
  }
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') return console.log(HELP);
  const core = loadCore();

  if (cmd === 'validate') {
    process.exit(report(core, readDiagram(pos[0])) ? 0 : 1);
  } else if (cmd === 'deliver') {
    const d = readDiagram(pos[0]);
    if (!report(core, d)) process.exit(1);
    const out = resolve(flags.out || join(dirname(resolve(pos[0])), basename(pos[0], '.json') + '.html'));
    mkdirSync(dirname(out), { recursive: true });
    const html = embed(readFileSync(TEMPLATE, 'utf8'), d);
    writeFileSync(out, html);
    console.log(`  delivered ${out}\n  ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB · opens offline`);
    if (flags.open) open(out);
  } else if (cmd === 'export') {
    const d = readDiagram(pos[0]);
    const errs = core.check(d);
    if (errs.length) { report(core, d); process.exit(1); }
    const f = flags.format || 'puml';
    if (f === 'puml') console.log(core.plantuml(d));
    else if (f === 'mmd') console.log(core.mermaid(d));
    else fail('--format must be puml or mmd');
  } else if (cmd === 'init') {
    const kind = pos[0] === 'class' ? 'library' : 'online-shopping';
    const file = pos[1] || (pos[0] && pos[0] !== 'class' && pos[0] !== 'usecase' ? pos[0] : 'diagram.json');
    if (existsSync(file)) fail(`${file} already exists; not overwriting it.`);
    writeFileSync(file, readFileSync(join(ROOT, 'examples', kind + '.json'), 'utf8'));
    console.log(`  wrote ${file}`);
  } else {
    fail(`Unknown command "${cmd}". Run uml help.`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
