# Etapa 1 — Viabilidade técnica e decisões

Pesquisa feita em 18/11/2026 na documentação oficial da Samsung (Smart TV Developer) e no
repositório de referência. Citações entre aspas são literais da documentação.
**Nada aqui foi verificado na TV ainda** — o roteiro está em [06-roteiro-de-testes-na-tv.md](06-roteiro-de-testes-na-tv.md).

## 1. O aparelho

| Item | Constatação | Fonte |
|---|---|---|
| Plataforma da linha QLED Q70 2023 | Bloco 2023 = **Tizen 7.0** (grupos `23TV_PREMIUM4/5`, que incluem `QCQ70`, `QCQ70_NM2`, `QCQ70D_NM2`). | TV Model Groups |
| Atualização de SO | O repositório de referência relata uma TV dessa linha já em **Tizen 8** (a Samsung ofereceu upgrade de SO a modelos 2023). Conferir em *Configurações › Suporte › Sobre esta TV*. | README do repositório de referência |
| Motor web | Tizen 7.0 → **Chromium M94**; Tizen 8.0 → M108. O código mira o mínimo (M94); um teste automatizado barra recursos mais novos. | Web Engine Specifications |
| Resolução da interface | "Application: 1920x1080 (All models)"; vídeo até 3840x2160 em TVs 4K. A Glass TV é desenhada em 1920x1080 lógicos; o HDMI exibido pela janela de TV mantém a resolução do vídeo. | General Specifications, Managing Screen Resolution |

## 2. Abrir aplicativos

- APIs: `tizen.application.getAppsInfo()`, `launch()` e `launchAppControl()` (Application API).
  Privilégios `application.info` e `application.launch`, ambos de nível **public**.
- **A Samsung não documenta IDs de Netflix, YouTube, Prime Video ou Disney+.** Os únicos IDs nas
  páginas oficiais são exemplos de apps de sistema.
- O repositório de referência usa IDs fixos obtidos com `sdb shell 0 vd_applist` (comando interno,
  não documentado) e IDs numéricos da loja. **Não usamos nenhum deles.**

**Decisão:** os apps padrão são procurados **pelo nome** na lista que a própria TV devolve
(`getAppsInfo`), e o lançamento usa o ID que a TV informou. Se o app não estiver instalado, o item
fica marcado como "Não encontrado nesta TV" e nada é lançado. Se a lista não estiver disponível, o
item fica "Indisponível" e o diagnóstico (Ajustes › Sobre) mostra o motivo. Também é possível
adicionar qualquer app detectado pela lista.

## 3. Entradas HDMI — o ponto crítico

### O que a documentação diz

- TV Window API, visão geral: *"This API provides a way to embed a video source in a Tizen Web
  Application running on a device associated with the TV. It allows an available video source to be
  selected and shown on or hidden from the display in a Tizen Web Application."*
- `setSource()`: *"Changes the source of a TV window."* O exemplo oficial diz *"set HDMI as input
  source of the TV window"*. Assinatura:
  `setSource(SystemInfoVideoSourceInfo videoSource, successCallback, errorCallback?, WindowType? type)`.
- `show(successCallback, errorCallback?, rectangle?, type?, zPosition?)` — `rectangle` com 4
  elementos (x, y, largura, altura) em `px` ou `%`; `zPosition` `FRONT`/`BEHIND`.
- Privilégio `http://tizen.org/privilege/tv.window`, **nível public**. Sem aviso de descontinuação.
- As fontes disponíveis vêm de `tizen.systeminfo.getPropertyValue("VIDEOSOURCE")`
  (`connected`/`disconnected`, cada item com `type` = `HDMI`, `TV`, … e `number`).
  O privilégio exigido por `VIDEOSOURCE` não está explícito na página — será verificado na TV.

### Conclusão

1. `tizen.tvwindow.setSource` **existe e é público**, mas a documentação o descreve como troca da
   fonte **da janela de TV do aplicativo**, não da entrada global da TV.
2. **Não há API documentada para um app comum trocar a entrada da TV** como o botão Source faz.
3. O repositório de referência só consegue o HDMI "nativo" em tela cheia porque, depois do
   `setSource`, abre o visualizador interno `org.tizen.tv-viewer` — um ID **não documentado**
   (técnica atribuída a terceiros, "Arn0"). Também oferece um lançamento via API REST local
   `127.0.0.1:8001`, que não faz parte da API web pública. **Ambos foram descartados** por
   violarem as regras do projeto.

### Implementação escolhida (somente APIs documentadas)

Ao escolher "HDMI n", a Glass TV chama `getPropertyValue('VIDEOSOURCE')` → `setSource(fonte, …, 'MAIN')`
→ `show(…, ['0px','0px','100%','100%'], 'MAIN')` e retira a interface da frente: **a entrada é
exibida em tela cheia dentro da própria Glass TV**. "Voltar" oculta a janela de TV e retorna ao
menu; as teclas 1–4 trocam de entrada diretamente.

**Limitações esperadas (a confirmar na TV):**

| Ponto | Por que pode ser diferente do botão Source |
|---|---|
| Controle do dispositivo HDMI pelo controle da TV (Anynet+/CEC) | As teclas vão para a Glass TV, não para o dispositivo. Setas/OK provavelmente **não** controlarão o aparelho HDMI. |
| Áudio | A documentação não diz se o áudio da fonte é reproduzido pela janela de TV. |
| Modo Jogo / latência / VRR / HDR | Podem não ser ativados como na exibição nativa da fonte. |
| Botão Home / outros apps | Ao sair da Glass TV, não há garantia de que a TV continue na mesma entrada. |

Se a exibição falhar ou não for prática para um uso (ex.: console com Modo Jogo), a alternativa
suportada é o botão **Source** do controle — a interface informa isso quando a API não está disponível.

## 4. Controle remoto

- Setas, Enter e Back são entregues sem registro: *"are detected automatically, and do not require
  separate registration"*. Códigos: ←37 ↑38 →39 ↓40, Enter 13, Back **10009**, Exit 10182.
- Outras teclas exigem `tizen.tvinputdevice.registerKey` (privilégio `tv.inputdevice`, public).
  Registramos apenas **1–4** (atalhos de HDMI).
- Pressionar e segurar Back/Exit força o encerramento do app; não registramos esse gesto.
- A política da loja Samsung pede um diálogo de saída ao pressionar Back na primeira tela. Como a
  Glass TV é uma tela inicial de uso pessoal (não será publicada), **Back na tela inicial não faz
  nada**; há "Fechar a Glass TV" em Ajustes › Sobre.

## 5. Ciclo de vida

- *"When the user switches from your application to another application or TV channel, JavaScript
  execution is paused"*; o app recebe `visibilitychange`. A Glass TV pausa relógio, troca de
  wallpaper e protetor ao ficar oculta e, ao voltar, retorna à tela inicial com o foco no último
  app aberto e atualiza a lista de apps.

## 6. Abrir automaticamente ao ligar a TV

- Não há API documentada para um app instalado em modo desenvolvedor iniciar no boot. O próprio
  repositório de referência registra que iniciar no boot exige certificado de **parceiro**.
- **Alternativa oficial mais simples:** *Configurações › Geral › Recursos inteligentes* →
  **Executar automaticamente o último app** (*Autorun Last App*). A Samsung avisa que a função
  pode não ser suportada em alguns modelos, e há relatos de que nem todo app é compatível e de
  que, após queda de internet, a TV volta para o Samsung TV Plus. Combinar com desligar a TV
  estando na Glass TV. **Precisa ser testado com o app instalado.**
- O botão Home continuará abrindo o Smart Hub — não é possível (nem desejado) alterá-lo.

## 7. Protetor de tela e energia

Camada visual do próprio app: wallpapers em transição lenta, leve movimento e relógio que muda de
canto a cada 3 minutos. Não usa APIs de energia nem altera o protetor da TV.

## 8. Clima

Adiado de propósito: exigiria o privilégio `internet`, liberar um domínio externo em `<access>` e
enviar a localização a um serviço de terceiros. Proposta para uma etapa futura, se você quiser:
Open-Meteo (sem chave), desligado por padrão, coordenadas digitadas manualmente, consulta a cada
hora e falha silenciosa. Hoje o pacote **não tem nenhum acesso à rede**.

## 9. Repositório de referência (victaphu/glass-home-samsung-tv)

- **Licença:** MIT, "Copyright (c) 2026 Glass Home contributors".
- **Arquitetura:** app web + **serviço Node.js rodando na TV com site HTTP na porta 8090**,
  privilégio `internet`, `<access origin="*">`, API REST local `127.0.0.1:8001` (opcional) e
  `org.tizen.tv-viewer` para HDMI.
- **O que aproveitamos (somente ideias, nenhum código copiado):** localizar apps por nome via
  `getAppsInfo`; tratar `visibilitychange`; a orientação de usar *Autorun Last App*; o alerta de
  que upgrades de SO podem remover apps instalados em modo desenvolvedor.
- **O que descartamos:** servidor HTTP na TV, acesso à rede, IDs fixos de apps, visualizador
  interno, API REST local, comandos `sdb shell`.

## 10. Ferramentas de desenvolvimento

O Tizen Studio (Eclipse/Java) está sendo descontinuado; a Samsung concentra o desenvolvimento no
**Tizen SDK via extensão do VS Code**, com build nativa para Apple Silicon. O projeto usa a CLI
`tizen` e o `sdb` instalados por essa extensão. Detalhes e ressalvas em
[04-instalacao-na-tv.md](04-instalacao-na-tv.md).

## Fontes

- Tizen Development Environment Focused on VSCode — https://samsungtizenos.com/blog/tizen-development-environment-focused-on-vscode/
- Tizen Studio 6.1 Release Notes (aviso de descontinuação) — https://docs.tizen.org/application/tizen-studio/release-notes/6-1-release-notes

- TV Window API — https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/tvwindow-api.html
- SystemInfo API — https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/systeminfo-api.html
- Application API — https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/application-api.html
- TV Input Device API — https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/tvinputdevice-api.html
- Remote Control — https://developer.samsung.com/smarttv/develop/guides/user-interaction/remote-control.html
- Terminating Applications — https://developer.samsung.com/smarttv/develop/guides/fundamentals/terminating-applications.html
- Multitasking — https://developer.samsung.com/smarttv/develop/guides/fundamentals/multitasking.html
- Web Engine Specifications — https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html
- TV Model Groups — https://developer.samsung.com/smarttv/develop/specifications/tv-model-groups.html
- General Specifications — https://developer.samsung.com/smarttv/develop/specifications/general-specifications.html
- Managing Screen Resolution — https://developer.samsung.com/smarttv/develop/guides/fundamentals/managing-screen-resolution.html
- Autorun (Samsung Austrália) — https://www.samsung.com/au/support/tv-audio-video/using-autorun-smart-features
- Repositório de referência — https://github.com/victaphu/glass-home-samsung-tv
