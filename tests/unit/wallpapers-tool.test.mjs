// Separação dos manifestos de wallpaper: incluídos (versionado) × fotos pessoais (ignorado).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { wallpaperPaths, writeManifests, removeUser, slug } from '../../tools/wallpapers.mjs';

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'glasstv-wall-test-'));
  const p = wallpaperPaths(root);
  fs.mkdirSync(p.thumbs, { recursive: true });
  fs.mkdirSync(p.userThumbs, { recursive: true });
  // Arquivos fictícios (o conteúdo não importa para os manifestos).
  for (const id of ['alvorada', 'dunas']) {
    fs.writeFileSync(path.join(p.wall, `${id}.jpg`), 'x');
    fs.writeFileSync(path.join(p.thumbs, `${id}.jpg`), 'x');
  }
  fs.writeFileSync(path.join(p.user, 'user-praia-ficticia.jpg'), 'x');
  fs.writeFileSync(path.join(p.userThumbs, 'user-praia-ficticia.jpg'), 'x');
  fs.writeFileSync(path.join(p.user, 'user-montanha-ficticia.jpg'), 'x');
  return { root, p };
}

function evaluate(file) {
  const ctx = {};
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx);
  return JSON.parse(JSON.stringify(ctx.GlassTV));
}

test('manifest.js recebe só as paisagens incluídas; fotos pessoais vão para manifest.user.js', () => {
  const { root, p } = sandbox();
  try {
    assert.deepEqual(writeManifests(p), { builtin: 2, user: 2 });

    const builtinText = fs.readFileSync(p.builtinManifest, 'utf8');
    assert.ok(!builtinText.includes('user'), 'nenhuma referência a fotos pessoais no manifesto versionado');
    const builtin = evaluate(p.builtinManifest);
    assert.deepEqual(builtin.wallpapers.map((w) => w.id), ['alvorada', 'dunas']);
    assert.equal(builtin.userWallpapers, undefined);

    const user = evaluate(p.userManifest);
    assert.equal(user.wallpapers, undefined, 'manifest.user.js não redefine as paisagens incluídas');
    assert.deepEqual(user.userWallpapers.map((w) => w.id), ['user-montanha-ficticia', 'user-praia-ficticia']);
    const praia = user.userWallpapers.find((w) => w.id === 'user-praia-ficticia');
    assert.equal(praia.src, 'wallpapers/user/user-praia-ficticia.jpg');
    assert.equal(praia.thumb, 'wallpapers/user/thumbs/user-praia-ficticia.jpg');
    const montanha = user.userWallpapers.find((w) => w.id === 'user-montanha-ficticia');
    assert.equal(montanha.thumb, montanha.src, 'sem miniatura, usa a própria imagem');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('remover a última foto pessoal apaga manifest.user.js', () => {
  const { root, p } = sandbox();
  try {
    writeManifests(p);
    removeUser('user-praia-ficticia', p);
    assert.ok(!fs.existsSync(path.join(p.user, 'user-praia-ficticia.jpg')));
    assert.ok(!fs.existsSync(path.join(p.userThumbs, 'user-praia-ficticia.jpg')));
    assert.ok(fs.existsSync(p.userManifest));
    assert.deepEqual(removeUser('user-montanha-ficticia', p), { builtin: 2, user: 0 });
    assert.ok(!fs.existsSync(p.userManifest), 'sem fotos, o arquivo deixa de existir');
    assert.ok(fs.existsSync(p.builtinManifest));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('remove só aceita ids de fotos pessoais (nada fora da pasta user/)', () => {
  const { root, p } = sandbox();
  try {
    assert.throws(() => removeUser('alvorada', p));
    assert.throws(() => removeUser('user-../../manifest', p));
    assert.throws(() => removeUser('', p));
    assert.ok(fs.existsSync(path.join(p.wall, 'alvorada.jpg')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('slug gera ids seguros a partir do nome do arquivo', () => {
  assert.equal(slug('Pôr do Sol na Praia (2).HEIC'.replace(/\.heic$/i, '')), 'por-do-sol-na-praia-2');
  assert.equal(slug('***'), 'foto');
});
