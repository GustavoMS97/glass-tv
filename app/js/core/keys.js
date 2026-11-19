/*
 * Mapeamento de teclas do controle remoto Samsung para ações da interface.
 *
 * Fonte dos códigos: Samsung Smart TV — "Remote Control" guide, tabela
 * "Remote control key codes". As teclas ArrowLeft/Up/Right/Down, Enter e Back
 * são entregues automaticamente ao app (não precisam de registro). As demais
 * (dígitos, cores, mídia) exigem tizen.tvinputdevice.registerKey(), que
 * requer o privilégio público http://tizen.org/privilege/tv.inputdevice.
 *
 * Na prévia do Mac, Esc e Backspace simulam o botão Voltar.
 */
(function (root) {
  'use strict';

  var G = root.GlassTV;

  var TV_CODES = {
    37: 'left',
    38: 'up',
    39: 'right',
    40: 'down',
    13: 'ok',
    10009: 'back',
    10252: 'playpause',
    415: 'play',
    19: 'pause',
    457: 'info',
    403: 'red',
    404: 'green',
    405: 'yellow',
    406: 'blue'
  };

  // Teclas extras aceitas apenas na prévia (teclado do Mac).
  var PREVIEW_CODES = {
    27: 'back', // Esc
    8: 'back', // Backspace
    32: 'ok' // Espaço
  };

  var KEY_NAMES = {
    ArrowLeft: 'left',
    ArrowUp: 'up',
    ArrowRight: 'right',
    ArrowDown: 'down',
    Enter: 'ok',
    XF86Back: 'back'
  };

  /**
   * Converte um KeyboardEvent em { action, digit? } ou null (tecla ignorada).
   * @param {{keyCode?: number, which?: number, key?: string}} event
   * @param {{preview?: boolean}} [options]
   */
  function fromEvent(event, options) {
    var preview = !!(options && options.preview);
    var code = event.keyCode || event.which || 0;

    if (code >= 48 && code <= 57) return { action: 'digit', digit: code - 48 };
    if (preview && code >= 96 && code <= 105) return { action: 'digit', digit: code - 96 };

    var action = TV_CODES[code];
    if (!action && preview) action = PREVIEW_CODES[code];
    if (!action && event.key) action = KEY_NAMES[event.key];
    return action ? { action: action } : null;
  }

  G.keys = {
    fromEvent: fromEvent,
    // Nomes (tvinputdevice) das teclas opcionais que o app registra:
    // dígitos 1–4 servem de atalho direto para HDMI 1–4.
    OPTIONAL_TV_KEYS: ['1', '2', '3', '4'],
    TV_CODES: TV_CODES
  };
})(typeof window !== 'undefined' ? window : globalThis);
