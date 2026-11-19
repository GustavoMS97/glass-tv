/*
 * Regras puras de movimentação de foco (listas e grades).
 *
 * A interface não usa navegação espacial "adivinhada": cada tela declara
 * explicitamente sua estrutura (lista horizontal, lista vertical, grade), e
 * estas funções garantem que o índice de foco sempre aponte para um item
 * válido — o foco nunca desaparece nem cai em elementos não selecionáveis.
 */
(function (root) {
  'use strict';

  var G = root.GlassTV;

  /** Índice válido para uma lista de tamanho `length` (ou -1 se vazia). */
  function safeIndex(index, length) {
    if (!(length > 0)) return -1;
    if (typeof index !== 'number' || isNaN(index)) return 0;
    return G.util.clamp(Math.round(index), 0, length - 1);
  }

  /** Move numa lista 1D. Sem `wrap`, para nas bordas. */
  function step(index, delta, length, wrap) {
    if (!(length > 0)) return -1;
    var next = safeIndex(index, length) + delta;
    if (wrap) return ((next % length) + length) % length;
    return G.util.clamp(next, 0, length - 1);
  }

  /**
   * Move numa grade preenchida linha a linha.
   * Retorna { index, edge } — `edge` indica que o movimento saiu da grade
   * ('left' | 'right' | 'up' | 'down') para que o contêiner decida o que fazer.
   */
  function grid(index, direction, length, columns) {
    var cur = safeIndex(index, length);
    if (cur < 0) return { index: -1, edge: direction };
    var cols = Math.max(1, columns | 0);
    var row = Math.floor(cur / cols);
    var col = cur % cols;
    var lastRow = Math.floor((length - 1) / cols);

    switch (direction) {
      case 'left':
        return col === 0 ? { index: cur, edge: 'left' } : { index: cur - 1, edge: null };
      case 'right':
        return col === cols - 1 || cur === length - 1
          ? { index: cur, edge: 'right' }
          : { index: cur + 1, edge: null };
      case 'up':
        return row === 0 ? { index: cur, edge: 'up' } : { index: cur - cols, edge: null };
      case 'down':
        if (row === lastRow) return { index: cur, edge: 'down' };
        return { index: Math.min(cur + cols, length - 1), edge: null };
      default:
        return { index: cur, edge: null };
    }
  }

  /** Retorna uma cópia da lista com o item `from` movido para `to`. */
  function move(list, from, to) {
    var copy = list.slice();
    if (from < 0 || from >= copy.length) return copy;
    var target = G.util.clamp(to, 0, copy.length - 1);
    var item = copy.splice(from, 1)[0];
    copy.splice(target, 0, item);
    return copy;
  }

  G.focus = { safeIndex: safeIndex, step: step, grid: grid, move: move };
})(typeof window !== 'undefined' ? window : globalThis);
