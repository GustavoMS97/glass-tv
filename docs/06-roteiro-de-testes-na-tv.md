# Roteiro de testes na TV (Etapa 4)

Nenhum item abaixo foi verificado no aparelho ainda. Este arquivo é só o **modelo**: copie-o para
a pasta ignorada `logs/` e preencha lá (`cp docs/06-roteiro-de-testes-na-tv.md logs/roteiro-tv.md`),
porque os resultados podem conter IDs de apps e outros dados do seu aparelho.
Marque ✅, ❌ ou ⚠️ e anote observações.

## Instalação e inicialização

| # | Teste | Resultado |
|---|---|---|
| 1 | O pacote instala sem erro e aparece na lista de apps | ⬜ |
| 2 | Abre em até ~2 s, sem tela branca, wallpaper e dock visíveis | ⬜ |
| 3 | Ajustes › Sobre: versão do Tizen, modelo e Chromium (M94 ou M108) | ⬜ |
| 4 | Texto nítido e proporções corretas a ~3 m | ⬜ |

## Controle remoto e foco

| # | Teste | Resultado |
|---|---|---|
| 5 | ◀ ▶ percorrem o dock; o foco nunca some | ⬜ |
| 6 | OK abre; Voltar fecha menus um nível por vez; na tela inicial não faz nada | ⬜ |
| 7 | Teclas 1–4 abrem HDMI 1–4 (Sobre: "Teclas 1–4 registradas") | ⬜ |
| 8 | Segurar Voltar encerra o app (comportamento do sistema) | ⬜ |

## Apps

| # | Teste | Resultado |
|---|---|---|
| 9 | Sobre › "Lista de aplicativos: Disponível · N apps" | ⬜ |
| 10 | Netflix, YouTube, Prime Video e Disney+ aparecem como "Encontrado nesta TV" (IDs só na cópia em `logs/`) | ⬜ |
| 11 | Cada um abre pelo dock | ⬜ |
| 12 | Ao sair do app (Voltar/Home → Glass TV) a tela inicial reaparece com foco no app usado | ⬜ |
| 13 | Ícones da TV: tiles mostram o ícone real ou, se inacessível, o nome | ⬜ |
| 14 | "Adicionar ao dock" lista apps instalados relevantes | ⬜ |

## Entradas HDMI

| # | Teste | Resultado |
|---|---|---|
| 15 | Cartões mostram "Dispositivo conectado" nas portas corretas | ⬜ |
| 16 | OK em uma entrada conectada exibe a imagem em tela cheia | ⬜ |
| 17 | Há **áudio** da entrada | ⬜ |
| 18 | Resolução/HDR/fluidez aceitáveis (anotar 4K/60, HDR) | ⬜ |
| 19 | Latência em jogo aceitável? Modo Jogo ativa? | ⬜ |
| 20 | Setas/OK controlam o dispositivo HDMI (CEC)? (esperado: não) | ⬜ |
| 21 | Voltar oculta a imagem e retorna ao menu; 1–4 trocam de entrada | ⬜ |
| 22 | Após Home, a TV fica em qual entrada? | ⬜ |
| 23 | Entrada sem dispositivo: mensagem clara, sem travar | ⬜ |

## Visual, protetor e desempenho

| # | Teste | Resultado |
|---|---|---|
| 24 | Vidro em desfoque real fluido; se não, "Vidro: Leve" resolve | ⬜ |
| 25 | Navegação responsiva com animações completas | ⬜ |
| 26 | Protetor ativa no tempo configurado e qualquer tecla retorna | ⬜ |
| 27 | Troca automática de wallpaper sem travar | ⬜ |
| 28 | Uso de memória estável após 1 h (Tizen Studio › Web Inspector) | ⬜ |

## Persistência e inicialização automática

| # | Teste | Resultado |
|---|---|---|
| 29 | Preferências mantidas após fechar e reabrir o app | ⬜ |
| 30 | Preferências mantidas após reinstalar/atualizar | ⬜ |
| 31 | *Autorun Last App* abre a Glass TV ao ligar a TV | ⬜ |
