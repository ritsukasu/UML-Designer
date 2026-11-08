import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { loadCore, embed } from '../bin/uml.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'bin', 'uml.mjs');
const core = loadCore();
const examples = readdirSync(join(ROOT, 'examples')).filter(f => f.endsWith('.json'));
const load = f => JSON.parse(readFileSync(join(ROOT, 'examples', f), 'utf8'));
const run = (...a) => spawnSync(process.execPath, [CLI, ...a], { encoding: 'utf8' });

test('every example is valid', () => {
  assert.ok(examples.length >= 3);
  for (const f of examples) assert.deepEqual(core.check(load(f)), [], f);
});

test('viewer script has valid syntax', () => {
  const html = readFileSync(join(ROOT, 'web', 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  new vm.Script(scripts[0][1]);
});

test('use-case validation names each problem', () => {
  const base = () => ({ type: 'usecase', actors: [{ id: 'A' }, { id: 'B' }], usecases: [{ id: 'U' }, { id: 'V' }], relations: [] });
  const codes = o => core.check(o).map(e => e.code);
  assert.deepEqual(codes(base()), []);
  const unknown = base(); unknown.relations = [{ from: 'A', to: 'Nope', type: 'associates' }];
  assert.deepEqual(codes(unknown), ['unknown-node']);
  const badLink = base(); badLink.relations = [{ from: 'U', to: 'A', type: 'associates' }];
  assert.deepEqual(codes(badLink), ['bad-link']);
  const badInc = base(); badInc.relations = [{ from: 'A', to: 'U', type: 'include' }];
  assert.deepEqual(codes(badInc), ['bad-link']);
  const badGen = base(); badGen.relations = [{ from: 'A', to: 'U', type: 'generalizes' }];
  assert.deepEqual(codes(badGen), ['bad-link']);
  const badType = base(); badType.relations = [{ from: 'A', to: 'U', type: 'uses' }];
  assert.deepEqual(codes(badType), ['bad-type']);
  const dup = base(); dup.usecases[0].id = 'A';
  assert.ok(codes(dup).includes('duplicate-id'));
  const side = base(); side.actors[0].side = 'top';
  assert.deepEqual(codes(side), ['bad-side']);
  const view = base(); view.views = [{ id: 'v', nodes: ['Z'] }];
  assert.deepEqual(codes(view), ['unknown-view-node']);
  assert.deepEqual(codes({ type: 'usecase' }), ['no-actors', 'no-usecases']);
  assert.deepEqual(codes({ type: 'sequence', classes: [] }), ['bad-diagram-type']);
});

test('class validation still works', () => {
  const o = load('library.json');
  o.relations[0].to = 'Ghost';
  assert.deepEqual(core.check(o).map(e => e.code), ['unknown-class']);
});

test('exporters produce PlantUML and Mermaid for both diagram types', () => {
  const uc = load('online-shopping.json');
  const puml = core.plantuml(uc);
  assert.match(puml, /^@startuml/);
  assert.match(puml, /actor "Web Customer" as WebCustomer/);
  assert.match(puml, /MakePurchase \.> ViewItems : <<include>>/);
  assert.match(puml, /Registered --\|> WebCustomer/);
  const mmd = core.mermaid(uc);
  assert.match(mmd, /^flowchart LR/);
  assert.match(mmd, /MakePurchase -\.->\|"«include»"\| Checkout/);
  assert.match(core.plantuml(load('library.json')), /abstract class Item/);
  assert.match(core.mermaid(load('library.json')), /^classDiagram/);
});

test('deliver writes one self-contained viewer with the diagram embedded', () => {
  const dir = mkdtempSync(join(tmpdir(), 'uml-'));
  const out = join(dir, 'shop.html');
  const r = run('deliver', join(ROOT, 'examples', 'online-shopping.json'), '--out', out);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(out));
  const html = readFileSync(out, 'utf8');
  const m = html.match(/<script id="uml-data" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(m && m[1].length > 100);
  assert.equal(JSON.parse(m[1]).type, 'usecase');
});

test('embedding escapes script-closing sequences', () => {
  const html = readFileSync(join(ROOT, 'web', 'index.html'), 'utf8');
  const d = load('online-shopping.json'); d.title = 'x</script><b>';
  const out = embed(html, d);
  assert.ok(!out.includes('x</script>'));
  const m = out.match(/<script id="uml-data" type="application\/json">([\s\S]*?)<\/script>/);
  assert.equal(JSON.parse(m[1]).title, 'x</script><b>');
});

test('validate exits non-zero and prints a code for bad input', () => {
  const dir = mkdtempSync(join(tmpdir(), 'uml-'));
  const f = join(dir, 'bad.json');
  writeFileSync(f, JSON.stringify({ type: 'usecase', actors: [{ id: 'A' }], usecases: [{ id: 'U' }], relations: [{ from: 'A', to: 'Q', type: 'associates' }] }));
  const r = run('validate', f);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown-node/);
  writeFileSync(f, '{ nope');
  const j = run('validate', f);
  assert.equal(j.status, 1);
  assert.match(j.stderr, /invalid-json/);
});

test('init writes a starter that validates', () => {
  const dir = mkdtempSync(join(tmpdir(), 'uml-'));
  const f = join(dir, 'd.json');
  assert.equal(run('init', 'usecase', f).status, 0);
  assert.equal(run('validate', f).status, 0);
  assert.equal(run('init', 'usecase', f).status, 1);
});
