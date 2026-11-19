/*
 * Glass TV — namespace e utilitários.
 *
 * Todos os scripts são "clássicos" (sem ES modules): o Tizen carrega o app a
 * partir do sistema de arquivos local, e a prévia no Mac abre via file://, onde
 * módulos ES são bloqueados por CORS. Cada arquivo registra-se em
 * window.GlassTV. Os módulos em js/core/ não tocam no DOM e são testados em Node.
 *
 * Alvo mínimo de sintaxe: Chromium M94 (Tizen 7.0, TVs Samsung 2023).
 */
(function (root) {
  'use strict';

  var G = root.GlassTV = root.GlassTV || {};

  G.version = '0.1.0';

  G.util = {
    clamp: function (value, min, max) {
      return Math.min(max, Math.max(min, value));
    },

    clone: function (value) {
      return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    },

    isObject: function (value) {
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    },

    /** Hash estável (djb2) para escolher cores de monogramas, etc. */
    hash: function (text) {
      var h = 5381;
      var s = String(text);
      for (var i = 0; i < s.length; i++) {
        h = ((h << 5) + h + s.charCodeAt(i)) | 0;
      }
      return Math.abs(h);
    },

    /** Remove acentos e normaliza espaços/caixa para comparações de nomes. */
    normalizeName: function (name) {
      return String(name || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    },

    getPath: function (obj, path) {
      var parts = path.split('.');
      var cur = obj;
      for (var i = 0; i < parts.length; i++) {
        if (cur === null || cur === undefined) return undefined;
        cur = cur[parts[i]];
      }
      return cur;
    },

    setPath: function (obj, path, value) {
      var parts = path.split('.');
      var cur = obj;
      for (var i = 0; i < parts.length - 1; i++) {
        if (!G.util.isObject(cur[parts[i]])) cur[parts[i]] = {};
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = value;
      return obj;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
