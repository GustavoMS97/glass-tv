# Arquitetura

Aplicativo web estático (HTML + CSS + JavaScript puro), sem backend, sem dependências de runtime e
sem etapa de build. A pasta `app/` **é** o pacote Tizen.

## Estrutura

```
app/                      ← conteúdo do pacote .wgt
  config.xml              manifesto Tizen (4 privilégios públicos, sem rede)
  index.html              tela única 1920x1080
  icon.png                512x423
  css/                    base (tokens, vidro), home, overlays, settings
  js/core/                lógica pura, sem DOM — testada em Node
    ns.js  keys.js  focus.js  time.js  apps.js  inputs.js  idle.js  store.js
  js/platform/platform.js adaptador Tizen (APIs oficiais) + simulação para a prévia
  js/ui/                  telas: home, inputs-menu, hdmi-view, settings, screensaver, …
  js/main.js              roteador, teclas, ciclo de vida, aplicação de preferências
  wallpapers/             JPEGs 1920x1080 + miniaturas + manifest.js (incluídos, versionado)
    manifest.user.js      suas fotos — opcional, ignorado pelo git, carregado se existir
    user/                 suas fotos e miniaturas — ignorado pelo git
tools/                    só para o Mac (não vão para a TV)
  e2e.mjs                 testes ponta a ponta no Chrome headless
  wallpapers.mjs          gerar paisagens, otimizar fotos, gerar ícone
  wallpaper-generator/    gerador procedural (canvas)
  tizen.sh                empacotar/instalar com o Tizen CLI oficial
tests/unit/               testes Node (node:test)
tests/fixtures/           dados fictícios para os testes
.env.example              modelo da configuração local (o .env real é ignorado)
docs/                     esta documentação
```

### Por que scripts clássicos e não ES modules / TypeScript

O Tizen carrega o app do sistema de arquivos local e a prévia no Mac abre via `file://`; nesses
contextos módulos ES são bloqueados ou instáveis. Cada arquivo registra-se em `window.GlassTV`.
TypeScript exigiria uma etapa de build sem ganho real para ~2 mil linhas; a segurança de tipos foi
substituída por testes.

## Fluxos

**Pilha de telas** (`main.js`): `home` é a raiz; `inputs`, `hdmi`, `settings` e `appsim` (só prévia)
são empilhadas. Voltar desce um nível; na raiz não faz nada.

```
home ──OK em Entradas──► inputs ──OK/1–4──► hdmi
  │  └──1–4 (atalho)────────────────────────► hdmi
  ├──OK em Ajustes──► settings
  └──OK em app──► platform.launchApp(id) ──► (TV oculta a Glass TV) ──visibilitychange──► home
```

**Teclas:** um único `keydown` (fase de captura) → `keys.fromEvent` → ação (`left`, `ok`, `back`,
`digit`…) → tela do topo. Toda tecla reinicia o temporizador de inatividade; com o protetor ativo,
a tecla só o encerra e não chega à tela.

**Foco:** cada tela declara sua estrutura (lista horizontal, grade, lista vertical) e usa
`core/focus.js`, que sempre devolve um índice válido. Nos Ajustes há duas zonas (seções ↔
conteúdo); linhas informativas não recebem foco. O foco é uma classe CSS (`.is-focused`) — não
dependemos do foco nativo do DOM, que é inconsistente em TVs.

**Preferências:** `core/store.js` valida tudo contra os padrões a cada leitura/gravação
(`localStorage`). Mudanças notificam `main.js`, que aplica na hora (animações, vidro, relógio,
wallpaper, dock, protetor).

**HDMI:** `platform.showHdmi(n)` → `VIDEOSOURCE` → `tvwindow.setSource` → `tvwindow.show(100%)`; a
tela `hdmi` adiciona `tv-window-active` ao `<html>` (interface oculta, fundo transparente). Ao
fechar, `tvwindow.hide`.

## Desempenho

- Interface e imagens em 1920x1080 (resolução de apps da TV), JPEG ~350 KB, miniaturas ~20 KB.
- Troca de wallpaper com duas camadas em *crossfade* de opacidade e pré-decodificação
  (`img.decode()`), sem `<canvas>` em tempo de execução.
- Desfoque real (`backdrop-filter`) só no dock e nos fundos de menus; modo **Vidro: Leve** remove o
  desfoque. Sem suporte a `backdrop-filter`, o modo leve é aplicado automaticamente.
- Animações apenas de `transform`/`opacity`; três níveis (completas, reduzidas, desligadas).
- Nenhum `setInterval`: relógio atualiza na virada do minuto; tudo pausa com o app oculto.

## Compatibilidade

Alvo: Chromium M94 (Tizen 7.0). `tests/unit/compat.test.mjs` falha se o código usar APIs/CSS mais
novos (ex.: `:has()`, `color-mix()`, `structuredClone`, `findLast`, container queries, nesting).

## Testes

| Comando | O que cobre |
|---|---|
| `npm test` | 38 testes Node: teclas, foco, preferências, resolução de apps, entradas, inatividade, data/hora, compatibilidade M94, ausência de rede/telemetria, privilégios do `config.xml`, ausência de IDs de apps fixos, separação dos manifestos de wallpaper e varredura de privacidade dos arquivos versionáveis |
| `npm run test:e2e` | 24 cenários no Chrome headless com teclas reais do controle (inclui o código 10009 do Voltar), screenshots em `test-results/screenshots/`, e simulação de incompatibilidades: sem TV Window, sem lista de apps, app não instalado, detecção de fontes indisponível |

A prévia aceita parâmetros para simular incompatibilidades: `?hdmi=none`, `?apps=none`,
`?sources=unknown`, `?sources=1,3`, `?without=Disney%2B`, `?idle=5` (protetor em 5 s) e
`?usermanifest=none|missing|fixture` (sem fotos pessoais, arquivo ausente, fixture fictício).

**Fotos pessoais:** antes de iniciar, `main.js` injeta `wallpapers/manifest.user.js`; se o
arquivo não existir (repositório recém-clonado), o erro de carregamento é tratado e o app segue
só com as paisagens incluídas. Entradas inválidas ou com id repetido são descartadas.
