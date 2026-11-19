import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCore, plain, memoryStorage } from './helpers.mjs';

const G = loadCore();

// ---------------------------------------------------------------- keys
test('keys: setas, OK e Voltar do controle Samsung', () => {
  const map = (keyCode, opts) => plain(G.keys.fromEvent({ keyCode }, opts));
  assert.deepEqual(map(37), { action: 'left' });
  assert.deepEqual(map(38), { action: 'up' });
  assert.deepEqual(map(39), { action: 'right' });
  assert.deepEqual(map(40), { action: 'down' });
  assert.deepEqual(map(13), { action: 'ok' });
  assert.deepEqual(map(10009), { action: 'back' });
  assert.deepEqual(map(51), { action: 'digit', digit: 3 });
});

test('keys: Esc/Backspace só viram Voltar na prévia', () => {
  assert.equal(G.keys.fromEvent({ keyCode: 27 }), null);
  assert.equal(G.keys.fromEvent({ keyCode: 8 }), null);
  assert.equal(G.keys.fromEvent({ keyCode: 27 }, { preview: true }).action, 'back');
  assert.equal(G.keys.fromEvent({ keyCode: 8 }, { preview: true }).action, 'back');
});

test('keys: teclas desconhecidas são ignoradas', () => {
  assert.equal(G.keys.fromEvent({ keyCode: 999 }), null);
  assert.equal(G.keys.fromEvent({ keyCode: 0, key: 'ArrowLeft' }).action, 'left');
});

// ---------------------------------------------------------------- focus
test('focus.step: para nas bordas sem wrap e circula com wrap', () => {
  assert.equal(G.focus.step(0, -1, 5, false), 0);
  assert.equal(G.focus.step(4, 1, 5, false), 4);
  assert.equal(G.focus.step(4, 1, 5, true), 0);
  assert.equal(G.focus.step(0, -1, 5, true), 4);
  assert.equal(G.focus.step(0, 1, 0, false), -1);
});

test('focus.safeIndex: nunca aponta para fora da lista', () => {
  assert.equal(G.focus.safeIndex(9, 3), 2);
  assert.equal(G.focus.safeIndex(-2, 3), 0);
  assert.equal(G.focus.safeIndex(NaN, 3), 0);
  assert.equal(G.focus.safeIndex(1, 0), -1);
});

test('focus.grid: movimento e bordas numa grade 3 colunas com 7 itens', () => {
  const g = (i, dir) => plain(G.focus.grid(i, dir, 7, 3));
  assert.deepEqual(g(0, 'left'), { index: 0, edge: 'left' });
  assert.deepEqual(g(0, 'right'), { index: 1, edge: null });
  assert.deepEqual(g(2, 'right'), { index: 2, edge: 'right' });
  assert.deepEqual(g(1, 'up'), { index: 1, edge: 'up' });
  assert.deepEqual(g(1, 'down'), { index: 4, edge: null });
  // Linha 2 tem só o item 6: descer da coluna 2 (índice 5) vai para o último.
  assert.deepEqual(g(5, 'down'), { index: 6, edge: null });
  assert.deepEqual(g(6, 'down'), { index: 6, edge: 'down' });
  assert.deepEqual(g(6, 'right'), { index: 6, edge: 'right' });
});

test('focus.move: reordena sem mutar a original', () => {
  const list = ['a', 'b', 'c', 'd'];
  assert.deepEqual(plain(G.focus.move(list, 1, 3)), ['a', 'c', 'd', 'b']);
  assert.deepEqual(plain(G.focus.move(list, 3, 0)), ['d', 'a', 'b', 'c']);
  assert.deepEqual(list, ['a', 'b', 'c', 'd']);
});

// ---------------------------------------------------------------- time
test('time: formatação 24 h, 12 h e data em português', () => {
  const d = new Date(2026, 10, 18, 21, 7, 30);
  assert.deepEqual(plain(G.time.formatTime(d, true)), { main: '21:07', suffix: '' });
  assert.deepEqual(plain(G.time.formatTime(d, false)), { main: '9:07', suffix: 'PM' });
  assert.deepEqual(plain(G.time.formatTime(new Date(2026, 0, 1, 0, 5), false)), { main: '12:05', suffix: 'AM' });
  assert.equal(G.time.formatDate(d), 'Quarta-feira, 18 de novembro');
  assert.equal(G.time.msToNextMinute(d), 30000);
});

// ---------------------------------------------------------------- apps
const INSTALLED = [
  { id: 'fixture.netflix', name: 'Netflix', show: true, iconPath: '/fixture/icon.png' },
  { id: 'fixture.youtubekids', name: 'YouTube Kids', show: true },
  { id: 'fixture.youtube', name: 'YouTube', show: true },
  { id: 'fixture.primevideo', name: 'Amazon Prime Video', show: true },
  { id: 'fixture.system', name: 'Serviço interno', show: false },
  { id: 'fixture.self', name: 'Glass TV', show: true },
  { id: 'fixture.music', name: 'App de Música', show: true }
];

test('apps: apps padrão são encontrados pelo nome, usando o ID informado pela TV', () => {
  const r = (match) => plain(G.apps.resolveItem({ type: 'app', match }, INSTALLED));
  assert.equal(r('netflix').appId, 'fixture.netflix');
  assert.equal(r('netflix').status, 'ok');
  assert.equal(r('netflix').iconPath, '/fixture/icon.png');
  // Correspondência exata ganha de "YouTube Kids", mesmo aparecendo antes.
  assert.equal(r('youtube').appId, 'fixture.youtube');
  assert.equal(r('prime').appId, 'fixture.primevideo');
});

test('apps: app não instalado fica "missing" e sem ID inventado', () => {
  const disney = plain(G.apps.resolveItem({ type: 'app', match: 'disney' }, INSTALLED));
  assert.equal(disney.status, 'missing');
  assert.equal(disney.appId, null);
  assert.equal(disney.name, 'Disney+');
});

test('apps: lista indisponível resulta em status "unknown"', () => {
  const r = plain(G.apps.resolveItem({ type: 'app', match: 'netflix' }, null));
  assert.equal(r.status, 'unknown');
  assert.equal(r.appId, null);
  const byId = plain(G.apps.resolveItem({ type: 'app', appId: 'x.y', name: 'X' }, null));
  assert.equal(byId.status, 'unknown');
  assert.equal(byId.appId, 'x.y');
});

test('apps: YouTube Kids não é confundido com YouTube', () => {
  const onlyKids = [{ id: 'k', name: 'YouTube Kids', show: true }];
  assert.equal(G.apps.resolveItem({ type: 'app', match: 'youtube' }, onlyKids).status, 'missing');
});

test('apps: dock sempre termina com Ajustes', () => {
  const dock = plain(G.apps.resolveDock([{ type: 'inputs' }, { type: 'app', match: 'netflix' }], INSTALLED));
  assert.deepEqual(dock.map((d) => d.type), ['inputs', 'app', 'settings']);
});

test('apps: "adicionáveis" exclui ocultos, o próprio app e os já presentes', () => {
  const items = [{ type: 'inputs' }, { type: 'app', match: 'netflix' }];
  const ids = plain(G.apps.addable(items, INSTALLED, 'fixture.self')).map((a) => a.id);
  assert.ok(!ids.includes('fixture.netflix'));
  assert.ok(!ids.includes('fixture.system'));
  assert.ok(!ids.includes('fixture.self'));
  assert.ok(ids.includes('fixture.music'));
});

test('apps: monogramas', () => {
  assert.equal(G.apps.monogram('Spotify'), 'SP');
  assert.equal(G.apps.monogram('Samsung TV Plus'), 'ST');
  assert.equal(G.apps.monogram('Disney+'), 'DI');
});

// ---------------------------------------------------------------- inputs
const VIDEOSOURCE = {
  connected: [{ type: 'TV', number: 1 }, { type: 'HDMI', number: 1 }, { type: 'HDMI', number: 3 }],
  disconnected: [{ type: 'HDMI', number: 2 }, { type: 'HDMI', number: 4 }]
};

test('inputs: status das portas a partir do VIDEOSOURCE', () => {
  const s = G.inputs.normalize(VIDEOSOURCE);
  assert.equal(G.inputs.portStatus(s, 1), 'connected');
  assert.equal(G.inputs.portStatus(s, 2), 'disconnected');
  assert.equal(G.inputs.portStatus(s, 3), 'connected');
  assert.equal(G.inputs.portStatus(G.inputs.normalize(null), 1), 'unknown');
  assert.equal(G.inputs.portStatus(G.inputs.normalize({ connected: [], disconnected: [] }), 1), 'absent');
});

test('inputs: findSource devolve o objeto original (necessário para setSource)', () => {
  assert.equal(G.inputs.findSource(VIDEOSOURCE, 'HDMI', 3), VIDEOSOURCE.connected[2]);
  assert.equal(G.inputs.findSource(VIDEOSOURCE, 'HDMI', 4), VIDEOSOURCE.disconnected[1]);
  assert.equal(G.inputs.findSource(VIDEOSOURCE, 'HDMI', 5), null);
});

test('inputs: preferências de visibilidade e "ocultar desconectadas"', () => {
  const s = G.inputs.normalize(VIDEOSOURCE);
  const nums = (r) => plain(r.ports).map((p) => p.number);
  assert.deepEqual(nums(G.inputs.visiblePorts({ visible: { 1: true, 2: true, 3: true, 4: false } }, s)), [1, 2, 3]);
  assert.deepEqual(nums(G.inputs.visiblePorts({ visible: { 1: true, 2: true, 3: true, 4: true }, hideDisconnected: true }, s)), [1, 3]);
  // Sem nada conectado: mostra as visíveis (fallback) para o menu não ficar vazio.
  const none = G.inputs.normalize({ connected: [], disconnected: [] });
  const r = G.inputs.visiblePorts({ visible: { 1: true, 2: true, 3: true, 4: true }, hideDisconnected: true }, none);
  assert.equal(r.fallback, true);
  assert.deepEqual(nums(r), [1, 2, 3, 4]);
  // Detecção indisponível: o filtro de conexão é ignorado.
  assert.deepEqual(nums(G.inputs.visiblePorts({ visible: { 1: true, 2: true, 3: true, 4: true }, hideDisconnected: true }, G.inputs.normalize(null))), [1, 2, 3, 4]);
});

// ---------------------------------------------------------------- idle
function fakeTimers() {
  let seq = 0;
  const pending = new Map();
  return {
    setTimeout: (fn, ms) => { const id = ++seq; pending.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => pending.delete(id),
    fireAll: () => { const list = [...pending.values()]; pending.clear(); list.forEach((t) => t.fn()); },
    pending
  };
}

test('idle: dispara após o tempo, reinicia a cada tecla e respeita pausa', () => {
  const timers = fakeTimers();
  let fired = 0;
  const idle = G.idle.createIdleTimer({ timeoutMs: 1000, onIdle: () => fired++, timers });
  assert.equal(idle.isArmed(), true);
  idle.poke();
  assert.equal(timers.pending.size, 1, 'poke substitui o timer anterior');
  timers.fireAll();
  assert.equal(fired, 1);
  idle.pause();
  assert.equal(idle.isArmed(), false);
  idle.poke();
  assert.equal(idle.isArmed(), false, 'pausado não rearma');
  idle.resume();
  assert.equal(idle.isArmed(), true);
  idle.configure({ enabled: false });
  assert.equal(idle.isArmed(), false);
});

// ---------------------------------------------------------------- store
test('store: padrões quando não há nada salvo', () => {
  const store = G.store.createStore(memoryStorage());
  const s = store.get();
  assert.equal(s.home.showClock, true);
  assert.equal(s.dock.items[0].type, 'inputs');
  assert.deepEqual(plain(s.dock.items.slice(1).map((i) => i.match)), ['netflix', 'youtube', 'prime', 'disney']);
  // Nenhum ID de app fixo nos padrões.
  assert.ok(s.dock.items.every((i) => !i.appId));
});

test('store: salva, recarrega e notifica', () => {
  const storage = memoryStorage();
  const store = G.store.createStore(storage);
  let notified = null;
  store.subscribe((state, changed) => { notified = changed; });
  store.set('home.showDate', false);
  assert.equal(notified, 'home.showDate');
  const again = G.store.createStore(storage);
  assert.equal(again.get().home.showDate, false);
});

test('store: valores inválidos ou corrompidos voltam ao padrão', () => {
  const storage = memoryStorage({ [G.store.STORAGE_KEY]: '{isso não é json' });
  assert.equal(G.store.createStore(storage).get().appearance.motion, 'full');

  const s = G.store.sanitize({
    appearance: { motion: 'turbo', glass: 42 },
    screensaver: { delayMinutes: 7 },
    home: { showClock: 'sim' },
    inputs: { visible: { 1: false, 2: false, 3: false, 4: false } }
  });
  assert.equal(s.appearance.motion, 'full');
  assert.equal(s.appearance.glass, 'full');
  assert.equal(s.screensaver.delayMinutes, 5);
  assert.equal(s.home.showClock, true);
  assert.deepEqual(plain(s.inputs.visible), { 1: true, 2: true, 3: true, 4: true });
});

test('store: dock sempre tem "Entradas", sem duplicatas e com limite', () => {
  const items = [
    { type: 'app', match: 'netflix' },
    { type: 'app', match: 'netflix' },
    { type: 'app', match: 'inexistente' },
    { type: 'app', appId: 'a.b', name: 'Meu app' },
    { type: 'app', appId: 'a.b' },
    { type: 'settings' },
    'lixo'
  ];
  for (let i = 0; i < 20; i++) items.push({ type: 'app', appId: 'id.' + i });
  const dock = plain(G.store.sanitize({ dock: { items } }).dock.items);
  assert.equal(dock[0].type, 'inputs');
  assert.equal(dock.filter((d) => d.match === 'netflix').length, 1);
  assert.equal(dock.filter((d) => d.appId === 'a.b').length, 1);
  assert.ok(!dock.some((d) => d.type === 'settings'));
  assert.equal(dock.length, G.store.MAX_DOCK_ITEMS);
});

test('store: reset restaura os padrões', () => {
  const store = G.store.createStore(memoryStorage());
  store.set('appearance.motion', 'off');
  store.reset();
  assert.equal(store.get().appearance.motion, 'full');
});
