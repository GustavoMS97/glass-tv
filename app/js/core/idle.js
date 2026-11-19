/*
 * Temporizador de inatividade (protetor de tela).
 * Os timers são injetáveis para permitir testes determinísticos.
 */
(function (root) {
  'use strict';

  var G = root.GlassTV;

  /**
   * @param {{timeoutMs: number, onIdle: Function, enabled?: boolean,
   *          timers?: {setTimeout: Function, clearTimeout: Function}}} options
   */
  function createIdleTimer(options) {
    var timers = options.timers || { setTimeout: root.setTimeout.bind(root), clearTimeout: root.clearTimeout.bind(root) };
    var timeoutMs = options.timeoutMs;
    var enabled = options.enabled !== false;
    var paused = false;
    var handle = null;

    function clear() {
      if (handle !== null) {
        timers.clearTimeout(handle);
        handle = null;
      }
    }

    function arm() {
      clear();
      if (!enabled || paused || !(timeoutMs > 0)) return;
      handle = timers.setTimeout(function () {
        handle = null;
        options.onIdle();
      }, timeoutMs);
    }

    arm();

    return {
      poke: arm,
      configure: function (next) {
        if (typeof next.timeoutMs === 'number') timeoutMs = next.timeoutMs;
        if (typeof next.enabled === 'boolean') enabled = next.enabled;
        arm();
      },
      pause: function () { paused = true; clear(); },
      resume: function () { paused = false; arm(); },
      isArmed: function () { return handle !== null; },
      dispose: clear
    };
  }

  G.idle = { createIdleTimer: createIdleTimer };
})(typeof window !== 'undefined' ? window : globalThis);
