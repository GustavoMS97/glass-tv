#!/usr/bin/env node
// Ferramenta de wallpapers do Glass TV (roda no Mac; nada disso vai para a TV).
//
//   node tools/wallpapers.mjs generate [id]     gera as paisagens originais (Chrome headless + sips)
//   node tools/wallpapers.mjs add <pasta>       otimiza fotos suas (JPG/PNG/HEIC) para 1920x1080
//   node tools/wallpapers.mjs remove <id>       remove uma foto adicionada por você
//   node tools/wallpapers.mjs manifest          reconstrói os manifestos
//   node tools/wallpapers.mjs icon              gera app/icon.png (512x423)
//
// Dois manifestos:
//   app/wallpapers/manifest.js        paisagens incluídas no projeto (versionado)
//   app/wallpapers/manifest.user.js   SUAS fotos (ignorado pelo git; só existe se houver fotos)
// Suas fotos e miniaturas ficam em app/wallpapers/user/ (também ignorado).
//
// Dependências: apenas ferramentas já presentes no macOS (sips) e o Google
// Chrome instalado (somente para "generate" e "icon"). Nenhum pacote npm.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GENERATOR = path.join(ROOT, 'tools/wallpaper-generator/generator.html');

const W = 1920;
const H = 1080;
const THUMB_W = 480;
const JPEG_QUALITY = 84;

// Paisagens originais, geradas proceduralmente (sem direitos de terceiros).
export const BUILTIN = [
  { id: 'alvorada', name: 'Alvorada' },
  { id: 'fiorde', name: 'Fiorde noturno' },
  { id: 'floresta', name: 'Floresta na neblina' },
  { id: 'dunas', name: 'Dunas douradas' },
  { id: 'aurora', name: 'Aurora' },
  { id: 'lago', name: 'Lago ao entardecer' }
];

/** Caminhos usados pela ferramenta (parametrizado pela raiz para os testes). */
export function wallpaperPaths(root = ROOT) {
  const wall = path.join(root, 'app/wallpapers');
  return {
    wall,
    thumbs: path.join(wall, 'thumbs'),
    user: path.join(wall, 'user'),
    userThumbs: path.join(wall, 'user', 'thumbs'),
    builtinManifest: path.join(wall, 'manifest.js'),
    userManifest: path.join(wall, 'manifest.user.js')
  };
}

// ------------------------------------------------------------ manifestos
export function collectBuiltin(p) {
  return BUILTIN
    .filter((b) => fs.existsSync(path.join(p.wall, `${b.id}.jpg`)))
    .map((b) => ({
      id: b.id,
      name: b.name,
      src: `wallpapers/${b.id}.jpg`,
      thumb: `wallpapers/thumbs/${b.id}.jpg`,
      origin: 'builtin'
    }));
}

export function collectUser(p) {
  if (!fs.existsSync(p.user)) return [];
  return fs.readdirSync(p.user)
    .filter((f) => f.endsWith('.jpg'))
    .sort()
    .map((f) => {
      const id = path.parse(f).name;
      const pretty = id.replace(/^user-/, '').replace(/-/g, ' ');
      return {
        id,
        name: pretty.charAt(0).toUpperCase() + pretty.slice(1),
        src: `wallpapers/user/${f}`,
        thumb: fs.existsSync(path.join(p.userThumbs, f)) ? `wallpapers/user/thumbs/${f}` : `wallpapers/user/${f}`,
        origin: 'user'
      };
    });
}

export function renderManifest(variable, entries, note) {
  return `/* ${note} Gerado por tools/wallpapers.mjs — não edite à mão. */
(function (root) {
  'use strict';
  var G = root.GlassTV = root.GlassTV || {};
  G.${variable} = ${JSON.stringify(entries, null, 2).replace(/\n/g, '\n  ')};
})(typeof window !== 'undefined' ? window : globalThis);
`;
}

/**
 * Grava manifest.js (só as paisagens incluídas) e manifest.user.js (só as suas
 * fotos). Sem fotos suas, manifest.user.js é removido — o app funciona sem ele.
 */
export function writeManifests(p) {
  const builtin = collectBuiltin(p);
  const user = collectUser(p);
  fs.writeFileSync(p.builtinManifest, renderManifest('wallpapers', builtin, 'Paisagens incluídas no projeto (versionado).'));
  if (user.length) {
    fs.writeFileSync(p.userManifest, renderManifest('userWallpapers', user, 'Fotos pessoais (NÃO versionado; ver .gitignore).'));
  } else if (fs.existsSync(p.userManifest)) {
    fs.rmSync(p.userManifest);
  }
  return { builtin: builtin.length, user: user.length };
}

export function removeUser(id, p) {
  if (!id || !/^user-[a-z0-9-]+$/.test(id)) throw new Error('Só é possível remover fotos adicionadas (ids "user-…").');
  for (const f of [path.join(p.user, `${id}.jpg`), path.join(p.userThumbs, `${id}.jpg`)]) {
    if (fs.existsSync(f)) fs.rmSync(f);
  }
  return writeManifests(p);
}

export function slug(name) {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'foto';
}

// ------------------------------------------------------------ imagens (macOS)
function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'
  ].filter(Boolean);
  const found = candidates.find((c) => fs.existsSync(c));
  if (!found) throw new Error('Google Chrome não encontrado. Defina CHROME_PATH.');
  return found;
}

function sips(args) {
  return execFileSync('/usr/bin/sips', args, { encoding: 'utf8' });
}

function dimensions(file) {
  const out = sips(['-g', 'pixelWidth', '-g', 'pixelHeight', file]);
  return { w: Number(/pixelWidth: (\d+)/.exec(out)[1]), h: Number(/pixelHeight: (\d+)/.exec(out)[1]) };
}

/** Redimensiona cobrindo 1920x1080 (corte central) e grava JPEG + miniatura. */
function optimize(src, destJpg, thumbJpg) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'glasstv-'));
  const tmp = path.join(work, 'work.png');
  // Converter para PNG e depois para JPEG descarta metadados da foto original (EXIF/GPS).
  sips(['-s', 'format', 'png', src, '--out', tmp]);
  const { w, h } = dimensions(tmp);
  const scale = Math.max(W / w, H / h);
  sips(['--resampleHeightWidth', String(Math.ceil(h * scale)), String(Math.ceil(w * scale)), tmp]);
  sips(['--cropToHeightWidth', String(H), String(W), tmp]);
  sips(['-s', 'format', 'jpeg', '-s', 'formatOptions', String(JPEG_QUALITY), tmp, '--out', destJpg]);
  sips(['-s', 'format', 'jpeg', '-s', 'formatOptions', '80', '--resampleWidth', String(THUMB_W), destJpg, '--out', thumbJpg]);
  fs.rmSync(work, { recursive: true, force: true });
}

function generate(only) {
  const p = wallpaperPaths();
  const chrome = findChrome();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'glasstv-gen-'));
  const list = only ? BUILTIN.filter((b) => b.id === only) : BUILTIN;
  fs.mkdirSync(p.thumbs, { recursive: true });
  for (const { id, name } of list) {
    const png = path.join(work, `${id}.png`);
    process.stdout.write(`• ${name} (${id})… `);
    execFileSync(chrome, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
      '--no-default-browser-check', '--disable-extensions', `--user-data-dir=${path.join(work, 'profile')}`,
      '--force-device-scale-factor=1', `--window-size=${W},${H}`,
      '--virtual-time-budget=15000', `--screenshot=${png}`,
      `${pathToFileURL(GENERATOR).href}?scene=${id}&w=${W}&h=${H}`
    ], { stdio: 'ignore', timeout: 120000 });
    const dest = path.join(p.wall, `${id}.jpg`);
    optimize(png, dest, path.join(p.thumbs, `${id}.jpg`));
    console.log(`${Math.round(fs.statSync(dest).size / 1024)} KB`);
  }
  fs.rmSync(work, { recursive: true, force: true });
  report(writeManifests(p));
}

/** Ícone do app (512x423 PNG) a partir de tools/wallpaper-generator/icon.html. */
function icon() {
  const chrome = findChrome();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'glasstv-icon-'));
  const out = path.join(ROOT, 'app/icon.png');
  execFileSync(chrome, [
    '--headless=new', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', `--user-data-dir=${path.join(work, 'profile')}`, '--force-device-scale-factor=1',
    '--window-size=512,423', '--virtual-time-budget=5000', '--allow-file-access-from-files',
    `--screenshot=${out}`, pathToFileURL(path.join(ROOT, 'tools/wallpaper-generator/icon.html')).href
  ], { stdio: 'ignore', timeout: 60000 });
  fs.rmSync(work, { recursive: true, force: true });
  const { w, h } = dimensions(out);
  console.log(`app/icon.png: ${w}x${h}`);
}

function add(folder) {
  const p = wallpaperPaths();
  if (!folder || !fs.existsSync(folder)) throw new Error('Informe uma pasta existente com fotos.');
  fs.mkdirSync(p.userThumbs, { recursive: true });
  const files = fs.readdirSync(folder).filter((f) => /\.(jpe?g|png|heic|heif|tiff?)$/i.test(f));
  if (!files.length) throw new Error('Nenhuma imagem JPG/PNG/HEIC encontrada na pasta.');
  for (const file of files) {
    let id = 'user-' + slug(path.parse(file).name);
    while (fs.existsSync(path.join(p.user, `${id}.jpg`))) id += '-1';
    process.stdout.write(`• ${file} → ${id}… `);
    const dest = path.join(p.user, `${id}.jpg`);
    optimize(path.join(folder, file), dest, path.join(p.userThumbs, `${id}.jpg`));
    console.log(`${Math.round(fs.statSync(dest).size / 1024)} KB`);
  }
  report(writeManifests(p));
}

function report({ builtin, user }) {
  console.log(`manifest.js: ${builtin} paisagem(ns) incluída(s) · manifest.user.js: ${user ? user + ' foto(s) sua(s)' : 'nenhuma foto (arquivo ausente)'}`);
}

function main() {
  const [cmd, arg] = process.argv.slice(2);
  try {
    if (cmd === 'generate') generate(arg);
    else if (cmd === 'add') add(arg);
    else if (cmd === 'remove') report(removeUser(arg, wallpaperPaths()));
    else if (cmd === 'manifest') report(writeManifests(wallpaperPaths()));
    else if (cmd === 'icon') icon();
    else {
      console.log('Uso: node tools/wallpapers.mjs generate [id] | add <pasta> | remove <id> | manifest | icon');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Erro:', err.message);
    process.exitCode = 1;
  }
}

// Executa a CLI só quando chamado diretamente (os testes importam as funções).
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
