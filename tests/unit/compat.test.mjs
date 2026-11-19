// Guardas de compatibilidade (Chromium M94 / Tizen 7.0) e de segurança do pacote.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { APP_DIR } from './helpers.mjs';

function walk(dir, ext) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) return d.name.startsWith('.') ? [] : walk(full, ext);
    return full.endsWith(ext) ? [full] : [];
  });
}

const JS = walk(APP_DIR, '.js');
const CSS = walk(APP_DIR, '.css');
const read = (f) => fs.readFileSync(f, 'utf8');
const rel = (f) => path.relative(APP_DIR, f);
// Comentários não contam (podem citar o que NÃO é usado).
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('todos os scripts do app são JavaScript clássico válido (sem módulos ES)', () => {
  for (const f of JS) {
    assert.doesNotThrow(() => new vm.Script(read(f), { filename: f }), rel(f));
    assert.ok(!/^\s*(import|export)\s/m.test(code(f)), `${rel(f)} usa import/export`);
  }
});

test('sem APIs JS mais novas que o Chromium M94', () => {
  const banned = [
    [/\.findLast(Index)?\(/, 'findLast (M97)'],
    [/structuredClone\(/, 'structuredClone (M98)'],
    [/\.toSorted\(|\.toReversed\(|\.toSpliced\(|\.with\(/, 'array by copy (M110)'],
    [/Object\.groupBy|Map\.groupBy/, 'groupBy (M117)']
  ];
  for (const f of JS) {
    for (const [re, label] of banned) assert.ok(!re.test(code(f)), `${rel(f)}: ${label}`);
  }
});

test('sem CSS mais novo que o Chromium M94', () => {
  const banned = [
    [/:has\(/, ':has() (M105)'],
    [/color-mix\(/, 'color-mix() (M111)'],
    [/@container/, 'container queries (M105)'],
    [/\b\d+(dvh|svh|lvh|dvw)\b/, 'unidades dvh/svh (M108)'],
    [/text-wrap\s*:/, 'text-wrap (M114)'],
    [/^\s*&/m, 'CSS nesting (M112)']
  ];
  for (const f of CSS) {
    const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [re, label] of banned) assert.ok(!re.test(css), `${rel(f)}: ${label}`);
  }
});

test('o app não faz requisições de rede nem telemetria', () => {
  const network = /\bfetch\(|XMLHttpRequest|new WebSocket|sendBeacon|EventSource|importScripts|navigator\.connection/;
  for (const f of JS) {
    if (f.endsWith('manifest.js')) continue;
    assert.ok(!network.test(code(f)), `${rel(f)} contém chamada de rede`);
  }
  const html = read(path.join(APP_DIR, 'index.html'));
  assert.ok(!/(src|href)=["']https?:/i.test(html), 'index.html não carrega recursos externos');
  for (const f of CSS) assert.ok(!/url\(["']?https?:/i.test(read(f)), `${rel(f)} carrega recurso externo`);
});

test('config.xml: só privilégios públicos esperados, sem internet e sem <access>', () => {
  const xml = read(path.join(APP_DIR, 'config.xml')).replace(/<!--[\s\S]*?-->/g, '');
  const privileges = [...xml.matchAll(/<tizen:privilege name="([^"]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(privileges, [
    'http://tizen.org/privilege/application.info',
    'http://tizen.org/privilege/application.launch',
    'http://tizen.org/privilege/tv.inputdevice',
    'http://tizen.org/privilege/tv.window'
  ]);
  assert.ok(!/<access\s/.test(xml), 'não deve declarar <access origin>');
  assert.ok(!/<tizen:service/.test(xml), 'não deve declarar serviços em segundo plano');
});

test('sem IDs de apps de terceiros fixos no código', () => {
  // IDs numéricos da loja Samsung (ex.: 3201907018807), IDs Tizen com pacote de
  // 10 caracteres alfanuméricos misturados (ex.: AbC1234xYz.App) ou org.tizen.*.
  const isSuspicious = (lit) =>
    /^\d{11,13}$/.test(lit) ||
    /^org\.tizen\./.test(lit) ||
    (/^[A-Za-z0-9]{10}\.[A-Za-z]\w*$/.test(lit) && /\d/.test(lit.slice(0, 10)) && /[A-Z]/.test(lit.slice(0, 10)));
  for (const f of JS) {
    if (f.endsWith('platform.js')) {
      // A prévia usa IDs fictícios "preview.*"; nada além disso.
      const ids = [...code(f).matchAll(/\['([^']+)',\s*'[^']+'\]/g)].map((m) => m[1]);
      assert.ok(ids.every((id) => id.startsWith('preview.')), 'IDs da prévia devem ser fictícios');
    }
    const literals = [...code(f).matchAll(/['"]([^'"\s]{6,60})['"]/g)].map((m) => m[1]);
    const found = literals.filter(isSuspicious);
    assert.deepEqual(found, [], `${rel(f)} parece conter ID de app fixo`);
  }
});

function loadManifest(file) {
  const context = {};
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(read(file), context);
  return context.GlassTV;
}

test('manifest.js (versionado) só lista paisagens incluídas, com arquivos existentes', () => {
  const list = loadManifest(path.join(APP_DIR, 'wallpapers/manifest.js')).wallpapers;
  assert.ok(list.length >= 1);
  for (const w of list) {
    assert.equal(w.origin, 'builtin', w.id);
    assert.ok(!/user/.test(w.src + w.thumb + w.id), `${w.id} aponta para fotos pessoais`);
    assert.ok(fs.existsSync(path.join(APP_DIR, w.src)), w.src);
    assert.ok(fs.existsSync(path.join(APP_DIR, w.thumb)), w.thumb);
  }
});

test('manifest.user.js é opcional, carregado dinamicamente e (se existir) consistente', () => {
  const html = read(path.join(APP_DIR, 'index.html'));
  assert.ok(!html.includes('manifest.user.js'), 'não deve ser um <script> fixo (o arquivo pode não existir)');
  const file = path.join(APP_DIR, 'wallpapers/manifest.user.js');
  if (!fs.existsSync(file)) return; // repositório limpo: sem fotos pessoais
  const list = loadManifest(file).userWallpapers;
  for (const w of list) {
    assert.ok(w.src.startsWith('wallpapers/user/'), w.src);
    assert.ok(fs.existsSync(path.join(APP_DIR, w.src)), w.src);
  }
});
