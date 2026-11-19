/* Utilitários de DOM e ícones (SVG próprios, traço uniforme, viewBox 48). */
(function (root) {
  'use strict';

  var G = root.GlassTV;
  var doc = root.document;
  G.ui = G.ui || {};

  var S = 'fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"';

  var ICONS = {
    // Monitor com seta de entrada
    inputs: '<svg viewBox="0 0 48 48" ' + S + '><rect x="5" y="8" width="38" height="26" rx="4.5"/><path d="M24 34v6M16 40h16"/><path d="M15 21h13M23 16l5 5-5 5"/></svg>',
    // Monitor (cartões HDMI)
    monitor: '<svg viewBox="0 0 48 48" ' + S + '><rect x="5" y="8" width="38" height="26" rx="4.5"/><path d="M24 34v6M16 40h16"/><path d="M17 17.5h14v3.6l-2.6 3.4h-8.8L17 21.1z" stroke-width="2.2"/></svg>',
    // Controles deslizantes (Ajustes)
    sliders: '<svg viewBox="0 0 48 48" ' + S + '><path d="M8 14h32M8 24h32M8 34h32"/><circle cx="18" cy="14" r="4.2" fill="currentColor" stroke="none"/><circle cx="31" cy="24" r="4.2" fill="currentColor" stroke="none"/><circle cx="14" cy="34" r="4.2" fill="currentColor" stroke="none"/></svg>',
    image: '<svg viewBox="0 0 48 48" ' + S + '><rect x="6" y="9" width="36" height="30" rx="5"/><circle cx="17" cy="19" r="3.2"/><path d="M8 35l10-9 8 7 5-4 9 7"/></svg>',
    dock: '<svg viewBox="0 0 48 48" ' + S + '><rect x="5" y="27" width="38" height="13" rx="5"/><path d="M13 33.5h4M22 33.5h4M31 33.5h4" stroke-width="3.4"/><path d="M14 19h20" opacity=".55"/></svg>',
    clock: '<svg viewBox="0 0 48 48" ' + S + '><circle cx="24" cy="24" r="17"/><path d="M24 14v10l7 4"/></svg>',
    sparkle: '<svg viewBox="0 0 48 48" ' + S + '><path d="M24 7l3.4 13.6L41 24l-13.6 3.4L24 41l-3.4-13.6L7 24l13.6-3.4z"/></svg>',
    moon: '<svg viewBox="0 0 48 48" ' + S + '><path d="M34 31.5A15 15 0 0 1 19.5 9a15.5 15.5 0 1 0 19.5 19.5 15 15 0 0 1-5 3z"/></svg>',
    info: '<svg viewBox="0 0 48 48" ' + S + '><circle cx="24" cy="24" r="17"/><path d="M24 22v11"/><circle cx="24" cy="15.5" r="1.6" fill="currentColor"/></svg>',
    check: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 25l9 9 17-19"/></svg>'
  };

  /**
   * Cria um elemento. h('div', { className: 'a', text: 'b', style: {..}, attrs: {..} }, [filhos])
   */
  function h(tag, props, children) {
    var el = doc.createElement(tag);
    if (props) {
      if (props.className) el.className = props.className;
      if (props.text !== undefined) el.textContent = props.text;
      if (props.html !== undefined) el.innerHTML = props.html;
      if (props.style) Object.keys(props.style).forEach(function (k) { el.style.setProperty(k, props.style[k]); });
      if (props.attrs) Object.keys(props.attrs).forEach(function (k) { el.setAttribute(k, props.attrs[k]); });
    }
    (children || []).forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      el.appendChild(typeof child === 'string' ? doc.createTextNode(child) : child);
    });
    return el;
  }

  function icon(name, className) {
    return h('span', { className: 'icon' + (className ? ' ' + className : ''), html: ICONS[name] || '' });
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  /** Pré-carrega e decodifica uma imagem antes de exibi-la (evita "piscadas"). */
  function preload(src) {
    return new Promise(function (resolve) {
      var img = new root.Image();
      img.onload = function () {
        if (img.decode) img.decode().then(function () { resolve(true); }, function () { resolve(true); });
        else resolve(true);
      };
      img.onerror = function () { resolve(false); };
      img.src = src;
    });
  }

  function cssUrl(src) {
    return 'url("' + String(src).replace(/["\\]/g, '\\$&') + '")';
  }

  G.dom = { h: h, icon: icon, clear: clear, preload: preload, cssUrl: cssUrl, ICONS: ICONS };
})(window);
