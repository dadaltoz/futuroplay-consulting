# Real Forte Lab — painel de diagnóstico da Real Forte Consultoria

Painel em um arquivo HTML só, publicado como Artifact no claude.ai. Quem constrói é o Lucas Smarssaro Dadalto. A Real Forte é a consultoria do pai dele. O painel serve aos consultores: empresas, setores, check-up, "o que eu vi", gargalos e oportunidades, biblioteca de soluções, RF Intelligence, RF Sinais e o **Realfort Squad** na tela Início: um escritório 3D em jeito de desenho animado (anfiteatro) com o time de agentes de IA (Atlas e mais sete robôs) e as salas da empresa escolhida. A cidade 3D com ilhas foi apagada na v98 (está no histórico do git).

- **Artifact publicado (sempre atualizar este, nunca criar outro):** https://claude.ai/artifact/6fryTDCEREKpMdKnRKihm8
- Última versão publicada: **v98** (Realfort Squad: o escritório dos agentes no lugar da cidade 3D).
- Os DADOS do painel (empresas, anotações, gargalos, arquivos, fotos, áudios) ficam guardados NO artifact (capabilities `db` e `assets`). Publicar num artifact novo = painel vazio. Sempre publicar no mesmo link, passando a URL acima.
- Capabilities em uso: `sample` (IA), `assets`, `db`, `downloads`, `user`. Na republicação, não passar `capabilities` (assim elas continuam).

## Como montar

```
python3 montar.py        # junta src/ em dist/real-forte-sistema.html e confere sintaxe e nomes duplicados
```

Precisa de `python3` e `node`. Imprime `build ok` quando está tudo certo. O arquivo publicado é `dist/real-forte-sistema.html`.

## Onde está cada coisa (src/)

| Arquivo | O que tem |
|---|---|
| `parte-topo.html` | `<head>`, CSS inteiro (tokens de cor em `:root`, tema escuro), casca do HTML. CSS do escritório: `.escritorio`, `.esc-*` |
| `parte-meio.html` | um `<script>` pequeno do meio |
| `escritorio/*.js` | **Realfort Squad** (Three.js 0.149), juntado em ordem num `<script>` pelo `montar.py` (ver abaixo) |
| `parte-galaxia.js` | galáxia de soluções da biblioteca |
| `parte-app.js` | o app: estado `S`/`UI`, armazenamento, rotas (`#biblioteca`, `#sv-<setor>`, `#sg-<setor>`…), telas, check-up, IA, PowerPoint, PDF, RF Sinais, biblioteca, anotações com foto/áudio/arquivo, cliques. Início com 3D: `telaCampo` (topo com a marca, seletor de empresa `data-escolher-empresa`, faixa do time `.esc-time`), `empresaDoEscritorio` / `escolherEmpresaDoEscritorio` (guarda só no navegador), apresentação `#ap-<empresa>` (`telaApresentacao`, Esc volta) |

### Realfort Squad (src/escritorio/)

| Arquivo | O que tem |
|---|---|
| `00-simbolo.js` | `SIMBOLO_RF`: o símbolo da Real Forte (castelo com órbita) em PNG branco transparente |
| `01-base.js` | `CAMPO` (estado), `AGENTES` (Atlas, Builder, Report, Sherlock, Fix, Scout, Data, Pixel: papel, cor, jeito, o que vai fazer), `CHAMADO` (palavras que fazem o Atlas chamar cada um), `TIPOS_SALA` (nome do setor → decoração e ícone), materiais guardados (`padrao`, `casco`, `luz`, `vidro`, `holo`), `caixaRedonda`, `anelSetor`, `arcoDeitado`, `juntarGeometrias`, `ESCALA_ROBO` |
| `02-texturas.js` | canvas: piso, madeira, mármore, ícones, selo hexagonal (`texSelo`), placas, telas de enfeite (sem número), céu com a cidade (`texCeu`), folha, sombra macia, logo da empresa, **balões de desenho** (`texBalao`: conversa, ideia, zzz, coração, música, café, estrela, atenção, dúvida, fone) |
| `03-cenario.js` | o anfiteatro, tudo em arco em volta de `MUNDO.arco` (`polar(r, a)`, `grupoPolar`): térreo com as **mini salas de vidro** dos agentes (`montarNichos`, `NICHOS`, `ORDEM_NICHOS`, emblema 3D em cima `emblemaDoAgente`, objetos de cada um `decorarCapsula`), lounge com sofás e carrinho de café (`montarLounge`), andar do meio com a **Central Atlas** (`montarCentral`: palco, mesa, telão `criarTelaoDoAtlas`, globo, tela do time), faixa "Time de IA" e floreiras (`montarEnfeites`), andar de cima e pontas do meio com as **salas da empresa** (`montarSalas` / `arranjoDasSalas` / `montarSala` / `mobiliarSala`; a tela do fundo mostra os números de verdade do setor em `texQuadroDoSetor`), rampas, escadas, janelões e céu (`montarSalao`) |
| `04-robos.js` | `CORPOS` e `montarRobo`: esqueleto comum, corpo e acessórios de cada um, rosto digital (`desenharOlhos` / `mudarRosto`), fone que aparece ao trabalhar, propulsor (eles flutuam), xícara, balão |
| `05-vida.js` | mapa de pisar (grade 20 cm + A*, `foraDoMapa`, `alturaDoChao`), lugares (`novoLugar`), rotinas livres (`proximaAtividade`: mini sala, sofá, café, visitar sala, conversar, passear, globo, acenar), **pedido ao Atlas** (`pedirAoAtlas` → `quemChamar` → `chamarAgente` → `comecarTrabalho`; respostas de verdade do painel em `respostaDoPainel`: Sherlock = maior gargalo aberto, Data = horas, nota e contagem; o resto fica "Aguardando ferramenta"), animação procedural (`animarRobo`: flutuar, esticar e encolher, pulinho, tchau) |
| `06-camera.js` | câmera (`CAM`, `visaoGeral`, `verCapsula`, `verSala`), mouse/toque, cliques (sala abre o setor, robô abre o cartão), barra **Fale com o Atlas** com microfone (`alternarMicrofone`, ditado do navegador), balão da fala do Atlas, cartão do robô |
| `07-cinema.js` | renderizador, reflexo (`ambienteDeReflexo`), luzes, pós-processamento (brilho, ACES, saturação, contraste, vinheta), `assar` (junta o que não se mexe), `atualizarSalas` (remonta as salas quando os setores mudam), laço `quadroDoEscritorio`, `montarCampo` / `pararCampo`, `comemorarNoCampo`, `retratoDo` (foto do robô para o cartão) |

Regras do escritório: os robôs **não inventam trabalho**. Rotina livre é só animação ("Disponível"). Pedido sem ferramenta ligada termina em "Aguardando ferramenta" com aviso do Atlas. A Sala de reunião só é usada quando houver colaboração de verdade. No modo apresentação só aparecem as salas da empresa apresentada (o escritório sempre mostra uma empresa por vez).

## Páginas do Google (fora do painel, coladas no script.google.com pelo Lucas)

| Pasta | O que tem |
|---|---|
| `rf-sinais/` | `Codigo.gs` + `Formulario.html` do **RF Sinais** (o formulário que os setores das empresas abrem pelo link). Anexo opcional: até 3 arquivos (foto, PDF, planilha), 8 MB cada, foto reduzida no navegador (1600 px, JPEG). Envio em 3 passos: `reservarSinal` → `subirAnexo` (pasta "RF Sinais — Anexos", nome começa pelo código) → `enviarSinal`; se um anexo falha, `desfazerAnexos` e nada é gravado. Código de envio por página (`envio`) impede sinal duplicado. Coluna `anexos` no FIM da planilha (`link (nome) \| link (nome)`). `limparAnexosSemSinal()` roda à mão. A pasta nasce sem compartilhar: quem decide é o responsável pela Real Forte |
| `feedback/` | `Codigo.gs` + `Formulario.html` do **Feedback do Lucas** (a página que as pessoas dos setores respondem). Setores, critérios e modo (anônima/identificada) vêm no link (`?s=…&c=…&m=…`), nada de regra no Google. Planilha "Feedback do Lucas", colunas `codigo` (F-…), `recebido_em`, `setor`, `notas` (`Critério: n \| …`), `o_que_funcionou`, `o_que_podia_melhorar`, `nome`, `envio` |

No painel: RF Sinais em `lerSinais` / `lerAnexosSinal` / `cartaoSinal` (clipe e lista; só links do Drive viram botão). Feedback do Lucas na rota `#feedback` (`telaFeedback`, `configFeedback` em `S.config.feedback`, tudo nasce em branco; `faltaFeedback` diz o que falta e quem declara; `lerRespostasFeedback`, `resultadosFeedback`, `montarPDFFeedback`). Coleção `feedback` só é usada se o Lucas declarar que as respostas ficam guardadas ("Só quem tem a planilha" = nada guardado, `UI.feedbackColadas`). Na resposta anônima, setor abaixo do mínimo esconde média e comentários **e sai da média geral** (senão dá para descobrir a nota dele pela conta).

**Relatório da passagem pelo setor** (aba "Relatório" de cada setor, rota `#sr-<setor>`): `abaRelatorio`, guardado em `s.passagem` (`inicio`, `fim`, `pessoas`, `leitura`); rascunho em `UI.passagem` (digitar não redesenha a tela). Período e "Equipe do setor" (nome, função e atribuições, em texto formal) nascem em branco: só o Lucas escreve (a IA não recebe as pessoas). `promptPassagem` pede introdução, panorama, o que está ruim, o que pode melhorar, o que já melhorou e conclusão, sem próximos passos, sem nomes, sem número inventado; o Lucas revisa. `montarPDFPassagem`: página 1 = capa (logo da empresa num cartão + logo da Real Forte), introdução, números e gráficos (rosca das situações, check-up, antes e depois em horas); depois leitura, equipe do setor (um cartão por pessoa: nome e função à esquerda, atribuições à direita) e, logo depois, a "Análise dos papéis" (`passagem.papeis`: posicionamento do Lucas, escrito por ele, a IA não mexe), o que foi aplicado (a ferramenta de cada item, link e horas), o que foi identificado e oportunidades (tabela com a ferramenta); o "o que eu vi" (anotação crua) NÃO vai para o PDF; última página = conclusão com assinatura e as duas logos. O PDF não leva selo de IA nem próximos passos (pedido do Lucas). Teste: `teste_relatorio.py`.

Atenção: `parte-app.js` começa com `<script>` e termina com `</script>`; código novo vai DENTRO do script. Os arquivos de `escritorio/` NÃO têm a tag: o `montar.py` embrulha todos num `<script>` só, na ordem do nome (00, 01, …).

## Regras do Lucas (valem para tudo)

1. **Especificação antes de código** quando for ferramenta nova: o que entra, o que sai, o que nasce em branco e quem declara, o que acontece sem dado, o que acontece no F5.
2. **Nenhuma regra de negócio inventada.** Percentual, prazo, limite, meta: vira campo vazio com rótulo de quem declara. Se faltar número, devolver a pergunta e para quem fazer.
3. Vocabulário da área, em português. Código comentado em português, nomes de variável legíveis, sem truque.
4. Sem login, sem banco externo, sem dependência nova de fora (Three.js já é a exceção).
5. Resposta direta, em português informal, sem enrolação. **Terminar toda resposta com uma linha: "O que eu fiz de diferente: …"**
6. **Privacidade de cliente:** no modo apresentação (`CAMPO.ap`) nenhuma outra empresa pode aparecer. O escritório só monta as salas de uma empresa por vez; o seletor some na apresentação.
8. Ele é exigente com visual: quer acabamento profissional, nada de "maquete" ou "jogo barato". Sempre olhar as fotos antes de entregar.

## Armadilhas conhecidas

- **Escritório 3D claro demais / com véu branco**: o brilho (bloom) pega tudo acima de `limiar`; chão e paredes muito iluminados passam do limiar e lavam a imagem. Mantenha as luzes baixas (`montarLuzes`) e a `exposicao` no pós; neblina (`cena.fog`) tem que começar longe da câmera (a câmera fica a ~60 m).
- **Chão que passa dos janelões tapa o céu**: o chão é um disco que acaba nos janelões; lá fora é o cilindro do céu (`texCeu`, horizonte a 0,62 do topo).
- **Comentário `//` no meio da linha** comenta o resto da linha. Quando inserir código por substituição de texto, usar `/* */` ou deixar o `//` no fim da linha. Já quebrou o código 4 vezes.
- Material de `padrao()`, `casco()`, `luz()` é **compartilhado (cache)**. Antes de mudar `fog`, `depthWrite` etc., fazer `.clone()`.
- Faces aditivas sobrepostas estouram para branco (aconteceu no holograma). Preferir contorno (`EdgesGeometry`) a placa cheia.
- Peças no mesmo plano piscam: separar alturas (há `logarithmicDepthBuffer`, mas não basta para coplanar).
- O cofre de arquivos (`assets`) só aceita foto, áudio, vídeo, PDF e texto, até 20 MB. Planilha e arquivo grande vão num "envelope" .json em base64, cortado em partes de 14 MB (`guardarArquivo` / `baixarAnexo`).



- **`\u2028` dentro de regex** (`paraScript` dos `.gs`): ao reescrever o arquivo, o escape pode virar o caractere invisível de verdade e quebrar a linha ("Invalid regular expression: missing /"). Conferir com `node --check` (copiar o .gs para um .js) antes de entregar.
- **Texto no PDF (jsPDF)**: nunca usar `linhas(...)[0]` (corta o texto sem avisar; já cortou título de gargalo no relatório). Usar `caber(texto, largura, tamanho, mínimo, maxLinhas)` em `montarPDFPassagem`, que diminui a letra e quebra em linhas, e fazer a caixa crescer com o texto.
- `peca(geo, mat, x, y, z, sx, sy, sz, pai)`: **sempre passar as três escalas**. Sem o `sz` a peça vira NaN.
- `Object.assign(mesh, { position: ... })` quebra (position é só leitura): use `sombraNoChao()` ou `.position.set()`.
- Ângulos: `anelSetor`, `arcoDeitado` e os cilindros medem a partir do +z; o anfiteatro mede a partir do -z. Converta com `aArco(a)`.

## Testes (Playwright + Chromium, sem placa de vídeo é lento)

Uma vez: `cd testes && npm install && pip install playwright` (se a versão do Playwright não achar o navegador, os testes novos usam `/opt/pw-browsers/chromium`) (as bibliotecas da CDN são servidas localmente pelo node_modules). Depois, rodar de dentro de `testes/`, passando o HTML montado:

```
python3 teste_escritorio.py ../dist/real-forte-sistema.html tudo   # escritório: fotos, robôs sem atravessar parede, cartão, pedido ao Atlas, privacidade na apresentação
python3 foto_rapida.py geral:0,1.6,1.8,63,0,1.1 pixel:capsula=pixel # fotos rápidas sem o HUD (nome:x,y,z,raio,theta,phi | nome:capsula=<id> | nome:sala=<id>)
python3 teste_novos.py ../dist/real-forte-sistema.html             # cano do setor e RF Intelligence por voz
python3 teste_saude.py / teste_arquivo.py / teste_link.py      # telas do app (anotações, arquivos, biblioteca)
python3 teste_rf_sinais.py          # formulário do RF Sinais com anexos (Codigo.gs de verdade num Google de mentira: google_falso.js)
python3 teste_sinais_anexos.py      # painel lendo e mostrando os anexos dos sinais
python3 teste_feedback.py           # página do Feedback + tela do Lucas (médias conferidas à mão, PDF)
python3 teste_relatorio.py          # relatório da passagem pelo setor (PDF conferido com pdftotext e pdftoppm)
python3 teste_relatorio_longo.py    # relatório com textos longos: nada sai pela metade, nenhuma página quase vazia
```

Os dados de teste ficam em `testes/dados/` (empresa "Distribuidora Exemplo"; nas fotos ela é renomeada para "Elson's"). Os testes simulam o `window.claude` (db, assets, downloads) em memória. O teste de "prompt de transformar" em `teste_saude.py` procura um texto antigo e dá False; não é erro do painel.
