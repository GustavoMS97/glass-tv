// Carrega os scripts clássicos do app num contexto isolado (node:vm),
// exatamente como o navegador da TV faria, sem DOM.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const APP_DIR = path.resolve(here, '../../app');

export const CORE_FILES = [
  'js/core/ns.js',
  'js/core/keys.js',
  'js/core/focus.js',
  'js/core/time.js',
  'js/core/apps.js',
  'js/core/inputs.js',
  'js/core/idle.js',
  'js/core/store.js'
];

export function loadCore(extra = {}) {
  const context = { console, setTimeout, clearTimeout, ...extra };
  context.globalThis = context;
  vm.createContext(context);
  for (const file of CORE_FILES) {
    const full = path.join(APP_DIR, file);
    vm.runInContext(fs.readFileSync(full, 'utf8'), context, { filename: full });
  }
  return context.GlassTV;
}

/** Converte objetos criados dentro do contexto vm em objetos "normais". */
export const plain = (value) => JSON.parse(JSON.stringify(value));

export function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; }
  };
}
