#!/usr/bin/env node
// Testes ponta a ponta da prévia (Mac), sem dependências npm.
//
//   node --experimental-websocket tools/e2e.mjs        (ou: npm run test:e2e)
//
// Abre app/index.html no Google Chrome headless (perfil temporário), conecta
// pelo Chrome DevTools Protocol em 127.0.0.1, envia teclas do controle remoto
// (setas, OK, Voltar=10009, dígitos), verifica o estado da interface e grava
// screenshots em test-results/screenshots/. Nada disso toca na TV.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = pathToFileURL(path.join(ROOT, 'app/index.html')).href;
const SHOTS = path.join(ROOT, 'test-results/screenshots');
const CHROME = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium'].filter(Boolean).find((p) => fs.existsSync(p));

if (typeof WebSocket === 'undefined') {
  console.error('Execute com: node --experimental-websocket tools/e2e.mjs (Node 20) ou Node 22+.');
  process.exit(1);
}
if (!CHROME) {
  console.error('Google Chrome não encontrado. Defina CHROME_PATH.');
  process.exit(1);
}

// ------------------------------------------------------------ CDP mínimo
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'glasstv-e2e-'));
  const proc = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--window-size=1920,1080', '--force-device-scale-factor=1', '--hide-scrollbars', 'about:blank'
  ], { stdio: 'ignore' });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await sleep(100);
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();
  let page;
  for (let i = 0; i < 50 && !page; i++) {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    page = list.find((t) => t.type === 'page');
    if (!page) await sleep(100);
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      data.error ? reject(new Error(data.error.message)) : resolve(data.result);
    } else if (data.method) {
      listeners.forEach((fn) => fn(data.method, data.params));
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const close = () => {
    try { ws.close(); } catch { /* ignore */ }
    proc.kill('SIGTERM');
    setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 500);
  };
  return { send, on: (fn) => listeners.push(fn), close };
}

const KEYS = {
  left: { code: 37, key: 'ArrowLeft' },
  up: { code: 38, key: 'ArrowUp' },
  right: { code: 39, key: 'ArrowRight' },
  down: { code: 40, key: 'ArrowDown' },
  ok: { code: 13, key: 'Enter' },
  back: { code: 10009, key: 'XF86Back' }, // botão Voltar do controle Samsung
  esc: { code: 27, key: 'Escape' },
  1: { code: 49, key: '1' }, 2: { code: 50, key: '2' }, 3: { code: 51, key: '3' }, 4: { code: 52, key: '4' }
};

// ------------------------------------------------------------ execução
const results = [];
const errors = [];
let cdp;

async function evaluate(expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('Erro no navegador: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}
const state = () => evaluate('GlassTV.debug.state()');

async function press(name, times = 1, gap = 60) {
  const k = KEYS[name];
  for (let i = 0; i < times; i++) {
    const base = { windowsVirtualKeyCode: k.code, nativeVirtualKeyCode: k.code, key: k.key };
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await sleep(gap);
  }
}

async function open(query = '', { clear = true } = {}) {
  // Por padrão ignora fotos pessoais (manifest.user.js) para os testes serem determinísticos.
  const q = query.includes('usermanifest') ? query : (query ? query + '&' : '?') + 'usermanifest=none';
  const url = APP + q;
  let loaded = new Promise((res) => cdp.on((m) => { if (m === 'Page.loadEventFired') res(); }));
  await cdp.send('Page.navigate', { url });
  await loaded;
  if (clear) {
    await evaluate('localStorage.clear()');
    loaded = new Promise((res) => cdp.on((m) => { if (m === 'Page.loadEventFired') res(); }));
    await cdp.send('Page.reload', {});
    await loaded;
  }
  for (let i = 0; i < 100; i++) {
    if (await evaluate('!!(window.GlassTV && GlassTV.debug && GlassTV.debug.ready)')) break;
    await sleep(50);
  }
  await sleep(250);
}

async function shot(name) {
  await sleep(450);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(data, 'base64'));
}

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log('  ✓ ' + name);
  } catch (err) {
    results.push({ name, ok: false, err });
    console.log('  ✗ ' + name + '\n      ' + err.message.split('\n').join('\n      '));
  }
}

async function focusDock(key) {
  const s = await state();
  const target = s.home.items.findIndex((i) => i.key === key);
  assert.ok(target >= 0, 'item não está no dock: ' + key);
  const delta = target - s.home.index;
  if (delta) await press(delta > 0 ? 'right' : 'left', Math.abs(delta));
  assert.equal((await state()).home.focused, key);
}

async function settingsSection(id) {
  const order = ['wallpaper', 'dock', 'home', 'appearance', 'screensaver', 'inputs', 'about'];
  let s = (await state()).settings;
  if (s.zone === 'content') { await press('back'); s = (await state()).settings; }
  const delta = order.indexOf(id) - order.indexOf(s.section);
  if (delta) await press(delta > 0 ? 'down' : 'up', Math.abs(delta));
  assert.equal((await state()).settings.section, id);
}

async function focusRow(key) {
  for (let i = 0; i < 40; i++) {
    const s = (await state()).settings;
    if (s.row === key) return;
    const idx = s.rows.indexOf(key);
    assert.ok(idx >= 0, `linha ${key} não existe (${s.rows.join(', ')})`);
    await press(idx > s.rows.indexOf(s.row) ? 'down' : 'up');
  }
  throw new Error('não foi possível focar ' + key);
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  cdp = await launch();
  cdp.on((method, p) => {
    if (method === 'Runtime.exceptionThrown') errors.push('exceção: ' + (p.exceptionDetails.exception?.description || p.exceptionDetails.text));
    if (method === 'Runtime.consoleAPICalled' && p.type === 'error') errors.push('console.error: ' + p.args.map((a) => a.value ?? a.description).join(' '));
    if (method === 'Log.entryAdded' && p.entry.level === 'error') {
      // Esperado: o cenário que simula manifest.user.js ausente.
      if ((p.entry.url || '').endsWith('manifest.user.missing.js')) return;
      errors.push('log: ' + p.entry.text + (p.entry.url ? ' ' + p.entry.url : ''));
    }
  });
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

  console.log('\nFluxo principal (prévia padrão)');
  await open();

  await test('inicia na tela inicial com Entradas, 4 apps e Ajustes', async () => {
    const s = await state();
    assert.deepEqual(s.views, ['home']);
    assert.deepEqual(s.home.items.map((i) => i.key),
      ['inputs', 'match:netflix', 'match:youtube', 'match:prime', 'match:disney', 'settings']);
    assert.ok(s.home.items.filter((i) => i.key.startsWith('match:')).every((i) => i.status === 'ok' && i.appId.startsWith('preview.')));
    assert.equal(s.home.focused, 'inputs');
    assert.equal(s.home.caption, '', 'sem legenda redundante: o tile já mostra o nome');
    await shot('01-home');
  });

  await test('setas movem o foco no dock sem sair das bordas', async () => {
    await press('right', 2);
    assert.equal((await state()).home.focused, 'match:youtube');
    await press('right', 10);
    assert.equal((await state()).home.focused, 'settings');
    await press('left');
    assert.equal((await state()).home.focused, 'match:disney');
    await shot('02-home-focus-disney');
    await press('left', 10);
    assert.equal((await state()).home.focused, 'inputs');
  });

  await test('OK em Entradas abre o menu com HDMI 1–4 e status de conexão', async () => {
    await press('ok');
    const s = await state();
    assert.deepEqual(s.views, ['home', 'inputs']);
    assert.deepEqual(s.inputs.ports, [
      { number: 1, status: 'connected' }, { number: 2, status: 'connected' },
      { number: 3, status: 'disconnected' }, { number: 4, status: 'disconnected' }]);
    assert.equal(s.inputs.focused, 1);
    await press('right');
    assert.equal((await state()).inputs.focused, 2);
    await shot('03-inputs');
  });

  await test('OK exibe a entrada em tela cheia; dígito troca de entrada', async () => {
    await press('ok');
    await sleep(400);
    let s = await state();
    assert.deepEqual(s.views, ['home', 'inputs', 'hdmi']);
    assert.equal(s.hdmi.number, 2);
    assert.equal(s.hdmi.osd, true);
    await shot('04-hdmi');
    await press('3');
    await sleep(400);
    s = await state();
    assert.equal(s.hdmi.number, 3);
  });

  await test('Voltar (10009) desce um nível por vez até a tela inicial', async () => {
    await press('back');
    let s = await state();
    assert.deepEqual(s.views, ['home', 'inputs']);
    assert.equal(s.inputs.focused, 3, 'foco no último HDMI exibido');
    await press('back');
    s = await state();
    assert.deepEqual(s.views, ['home']);
    assert.equal(s.home.focused, 'inputs');
    await press('back');
    assert.deepEqual((await state()).views, ['home'], 'Voltar na raiz não fecha nada');
  });

  await test('atalho numérico 4 abre HDMI 4 direto da tela inicial; Esc volta', async () => {
    await press('4');
    await sleep(400);
    let s = await state();
    assert.deepEqual(s.views, ['home', 'hdmi']);
    assert.equal(s.hdmi.number, 4);
    await press('esc');
    s = await state();
    assert.deepEqual(s.views, ['home']);
  });

  await test('abrir um app e retornar mantém o foco no app usado', async () => {
    await focusDock('match:netflix');
    await press('ok');
    await sleep(500);
    let s = await state();
    assert.deepEqual(s.views, ['home', 'appsim']);
    assert.equal(s.appsim.app, 'preview.netflix');
    await shot('05-app-simulado');
    await press('back');
    await sleep(200);
    s = await state();
    assert.deepEqual(s.views, ['home']);
    assert.equal(s.home.focused, 'match:netflix');
  });

  await test('Ajustes › Fundo de tela: trocar o wallpaper pela grade', async () => {
    await focusDock('settings');
    await press('ok');
    let s = await state();
    assert.deepEqual(s.views, ['home', 'settings']);
    assert.equal(s.settings.zone, 'nav');
    assert.equal(s.settings.section, 'wallpaper');
    await press('right');
    s = await state();
    assert.equal(s.settings.zone, 'content');
    assert.equal(s.settings.row, 'walls');
    await press('right');
    await press('ok');
    await sleep(1600);
    s = await state();
    assert.equal(s.prefs.wallpaper.id, 'fiorde');
    assert.equal(s.wallpaper, 'fiorde');
    await shot('06-settings-wallpaper');
    await press('down');
    assert.equal((await state()).settings.sub, 4, 'desce na grade');
    await press('down');
    s = await state();
    assert.equal(s.settings.row, 'rotate', 'sai da grade para a próxima linha');
    await press('right');
    assert.equal((await state()).prefs.wallpaper.rotateMinutes, 5);
    await press('left');
    assert.equal((await state()).prefs.wallpaper.rotateMinutes, 0);
  });

  await test('Ajustes › Dock: reorganizar, adicionar e remover apps', async () => {
    await settingsSection('dock');
    await press('right');
    let s = await state();
    assert.equal(s.settings.row, 'dock-0');
    await press('down');
    await press('ok'); // Mover
    assert.equal((await state()).settings.moving, 1);
    await press('down');
    await press('ok');
    s = await state();
    assert.equal(s.settings.moving, -1);
    assert.deepEqual(s.prefs.dock.items.map((i) => i.match || i.type), ['inputs', 'youtube', 'netflix', 'prime', 'disney']);
    assert.equal(s.settings.row, 'dock-2', 'o foco acompanha o item movido');
    assert.ok(!s.settings.rows.includes('add-preview.system'), 'apps ocultos do sistema não são oferecidos');
    assert.ok(!s.settings.rows.includes('add-preview.netflix'), 'apps já no dock não são oferecidos');
    await focusRow('add-preview.globoplay');
    await press('ok');
    s = await state();
    assert.equal(s.prefs.dock.items.length, 6);
    assert.equal(s.prefs.dock.items[5].appId, 'preview.globoplay');
    assert.ok(s.home.items.some((i) => i.key === 'id:preview.globoplay' && i.status === 'ok'));
    await shot('07-settings-dock');
    await focusRow('dock-5');
    await press('right'); // botão Remover
    await press('ok');
    s = await state();
    assert.equal(s.prefs.dock.items.length, 5);
  });

  await test('Ajustes › Tela inicial e Animações aplicam na hora', async () => {
    await settingsSection('home');
    await press('right');
    await focusRow('show-date');
    await press('ok');
    let s = await state();
    assert.equal(s.prefs.home.showDate, false);
    await settingsSection('appearance');
    await press('right');
    await press('right');
    s = await state();
    assert.equal(s.html.motion, 'reduced');
    await press('left');
    assert.equal((await state()).html.motion, 'full');
    await press('down');
    await press('right');
    assert.equal((await state()).html.glass, 'lite');
    await press('left');
    assert.equal((await state()).html.glass, 'full');
  });

  await test('Ajustes › Entradas HDMI: ocultar HDMI 4 (e nunca todas)', async () => {
    await settingsSection('inputs');
    await press('right');
    await focusRow('hdmi-4');
    await press('ok');
    assert.equal((await state()).prefs.inputs.visible['4'], false);
    for (const n of [1, 2, 3]) { await focusRow('hdmi-' + n); await press('ok'); }
    const s = await state();
    assert.equal(s.prefs.inputs.visible['3'], true, 'a última entrada visível não pode ser ocultada');
    assert.ok(s.toasts.includes('Mantenha ao menos uma entrada visível.'));
    for (const n of [1, 2]) { await focusRow('hdmi-' + n); await press('ok'); }
    assert.deepEqual((await state()).prefs.inputs.visible, { 1: true, 2: true, 3: true, 4: false });
  });

  await test('Ajustes › Sobre e diagnóstico lista recursos e apps detectados', async () => {
    await settingsSection('about');
    await press('right');
    await press('ok'); // mostrar apps detectados
    const s = await state();
    assert.ok(s.settings.rows.includes('app-preview.netflix'));
    await shot('08-settings-about');
    await press('back');
    await press('back');
    assert.deepEqual((await state()).views, ['home']);
  });

  await test('preferências refletem na tela inicial e no menu Entradas', async () => {
    const hidden = await evaluate("document.querySelector('.clock__date').classList.contains('is-hidden')");
    assert.equal(hidden, true, 'data oculta');
    await focusDock('inputs');
    await press('ok');
    const s = await state();
    assert.deepEqual(s.inputs.ports.map((p) => p.number), [1, 2, 3]);
    await press('back');
  });

  await test('protetor de tela: ativa e qualquer tecla retorna sem efeito colateral', async () => {
    const before = (await state()).home.focused;
    await evaluate('GlassTV.debug.triggerIdle()');
    await sleep(1800);
    assert.equal((await state()).screensaver, true);
    await shot('09-screensaver');
    await press('right');
    const s = await state();
    assert.equal(s.screensaver, false);
    assert.equal(s.home.focused, before, 'a tecla que encerra o protetor não move o foco');
  });

  await test('preferências persistem após recarregar', async () => {
    await open('', { clear: false });
    const s = await state();
    assert.equal(s.prefs.wallpaper.id, 'fiorde');
    assert.equal(s.prefs.home.showDate, false);
    assert.equal(s.prefs.dock.items[1].match, 'youtube');
    await evaluate('GlassTV.debug.store.reset()');
    assert.equal((await state()).prefs.home.showDate, true);
  });

  console.log('\nIncompatibilidades e erros simulados');

  await test('sem TV Window: aviso claro e o menu continua aberto', async () => {
    await open('?hdmi=none');
    await press('ok');
    await press('ok');
    await sleep(400);
    const s = await state();
    assert.deepEqual(s.views, ['home', 'inputs']);
    assert.ok(s.toasts.some((t) => t.startsWith('Não é possível exibir HDMI 1')), s.toasts.join(' | '));
    assert.match(s.inputs.note, /não está disponível/);
    await shot('10-erro-hdmi');
  });

  await test('lista de apps indisponível: itens "unknown" e aviso ao abrir', async () => {
    await open('?apps=none');
    let s = await state();
    assert.equal(s.appsStatus, 'error');
    assert.ok(s.home.items.filter((i) => i.key.startsWith('match:')).every((i) => i.status === 'unknown' && !i.appId));
    await focusDock('match:netflix');
    await press('ok');
    await sleep(200);
    s = await state();
    assert.deepEqual(s.views, ['home'], 'não tenta abrir com ID inventado');
    assert.ok(s.toasts.includes('Não foi possível localizar Netflix.'));
    await focusDock('settings');
    await press('ok');
    await settingsSection('dock');
    await sleep(400);
    assert.ok((await state()).settings.rows.includes('retry-apps'));
  });

  await test('app não instalado aparece como "não encontrado" e não é lançado', async () => {
    await open('?without=' + encodeURIComponent('Disney+'));
    await focusDock('match:disney');
    let s = await state();
    assert.equal(s.home.items.find((i) => i.key === 'match:disney').status, 'missing');
    assert.equal(s.home.caption, 'Disney+ · Não encontrado nesta TV');
    await press('ok');
    await sleep(200);
    s = await state();
    assert.deepEqual(s.views, ['home']);
    assert.ok(s.toasts.includes('Disney+ não foi encontrado nesta TV.'));
    await shot('11-app-ausente');
  });

  await test('detecção de fontes indisponível: cartões sem status, todos visíveis', async () => {
    await open('?sources=unknown');
    await press('ok');
    const s = await state();
    assert.deepEqual(s.inputs.ports.map((p) => p.status), ['unknown', 'unknown', 'unknown', 'unknown']);
  });

  await test('protetor ativa sozinho após o tempo de inatividade', async () => {
    await open('?idle=1');
    await sleep(1600);
    assert.equal((await state()).screensaver, true);
    await press('ok');
    assert.equal((await state()).screensaver, false);
  });

  console.log('\nFotos pessoais (manifest.user.js)');

  await test('sem manifest.user.js: só as paisagens incluídas, app funciona normalmente', async () => {
    await open('?usermanifest=missing');
    const s = await state();
    assert.deepEqual(s.views, ['home']);
    assert.deepEqual(s.catalog, ['alvorada', 'fiorde', 'floresta', 'dunas', 'aurora', 'lago']);
    assert.equal(s.wallpaper, 'alvorada');
  });

  await test('com manifest.user.js (fixture fictício): fotos válidas entram, inválidas são ignoradas', async () => {
    await open('?usermanifest=fixture');
    let s = await state();
    assert.equal(s.catalog.length, 7);
    assert.equal(s.catalog[6], 'user-exemplo');
    assert.ok(!s.catalog.includes('user-sem-imagem'));
    assert.equal(s.catalog.filter((id) => id === 'alvorada').length, 1, 'id repetido não substitui o incluído');
    await focusDock('settings');
    await press('ok');
    await press('right');
    assert.equal(await evaluate("document.querySelectorAll('.wall').length"), 7);
    await press('down', 2);
    assert.equal((await state()).settings.sub, 6);
    await press('ok');
    s = await state();
    assert.equal(s.prefs.wallpaper.id, 'user-exemplo');
  });

  await test('foto escolhida que deixou de existir: volta para uma paisagem incluída', async () => {
    await open('?usermanifest=missing', { clear: false });
    const s = await state();
    assert.equal(s.prefs.wallpaper.id, 'user-exemplo', 'a preferência é mantida');
    assert.equal(s.wallpaper, 'alvorada', 'mas a tela usa a primeira paisagem disponível');
    await evaluate('GlassTV.debug.store.reset()');
  });

  await test('nenhum erro de JavaScript ou de carregamento durante os testes', async () => {
    assert.deepEqual(errors, []);
  });

  cdp.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} cenários passaram. Screenshots: ${path.relative(ROOT, SHOTS)}/`);
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  if (cdp) cdp.close();
  process.exitCode = 1;
});
