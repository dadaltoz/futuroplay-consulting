# Real Forte Lab — painel de diagnóstico da Real Forte Consultoria

Painel em um arquivo HTML só, publicado como Artifact no claude.ai. Quem constrói é o Lucas Smarssaro Dadalto. A Real Forte é a consultoria do pai dele. O painel serve aos consultores: empresas, setores, check-up, "o que eu vi", gargalos e oportunidades, biblioteca de soluções, RF Intelligence, RF Sinais e a cidade 3D (cada empresa fica numa ilha-satélite ligada por ponte à plataforma central, que é a cidade da Real Forte, flutuando no espaço).

- **Artifact publicado (sempre atualizar este, nunca criar outro):** https://claude.ai/artifact/6fryTDCEREKpMdKnRKihm8
- Última versão publicada: **v85** (link da ferramenta direto no cartão da biblioteca).
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
| `parte-topo.html` | `<head>`, CSS inteiro (tokens de cor em `:root`, tema escuro), casca do HTML |
| `parte-meio.html` | um `<script>` pequeno do meio |
| `parte-campo.js` | `<script>` do 3D (Three.js 0.149): CAMPO, PLANO (cidade: ruas, Praça das Conexões, Terminal, Café, Avenida da Inteligência), câmera, céu/dia/noite, pessoas e rotinas, trânsito, campus por segmento (`CAMPUS_LAYOUT`), outdoors e vídeos, espaço (`montarEspaco`, `ILHA`, `hologramaDaTorre`) |
| `parte-campo.js` (fim do arquivo) | **Acabamento de cinema**: pós-processamento próprio (`CINEMA`, `renderizarCinema`, ajustes em `CINEMA_AJUSTE`: brilho, vinheta, grão, sombra de contato, névoa), céu e planeta assados uma vez (`montarCeuDeCinema`), rocha da ilha (`geometriaDeRocha`, `materialDeRocha`), nuvens (`nuvensDaIlha`), corpo novo das pessoas (`partesDoCorpo`), veículos com lataria arredondada (`fundir(..., true)`, `caixaArredondada`), revestimento de prédio por shader (`revestir`: chapa, concreto, reboco, telhado), fachada de vidro com caixilho (`texturaFachadaVidro`), máquinas no teto (`maquinasNoTeto`) |
| `parte-campo.js` (fim do arquivo) | **Orbital Consulting City**: megaestrutura no lugar da rocha (`megaestrutura`, `CASCO`, `faixaDoCasco`: casco com janelas, hangares, faixas de luz, reator em degraus, módulos, propulsores, luzes de navegação), painel `texturaDoPainelRF`, planeta de lado (`CENTRO_PLANETA`), estações secundárias de cenário (`estacaoSecundaria`), rotas de energia, naves, satélites e galáxia (`universoExtra`, `passoUniverso`), esfera holográfica da praça (`globoDaPraca`), botão **Órbita** |
| `parte-campo.js` (fim do arquivo) | **Ilhas-satélite e metrópole**: `SATELITE`, `loteSatelite` (lugar de cada empresa no anel), `ponteDoSatelite`, `marcarVazioNoNav` (o mapa de pisar cobre plataforma, ilhas e pontes), `ilhaSatelite` (casco, bairro residencial, ponte), `cidadeRealForte` / `quarteiraoFuturista` / `predioFuturista` (os quarteirões centrais) |
| `parte-campo.js` (fim do arquivo) | **Marcos e torre**: `MARCOS_DOS_LOTES` (qual quarteirão recebe qual edifício-marco; `null` = praça), `edificioMarco`, `pracaDoQuarteirao`, `torreMonumental` (lâminas, RF aceso, coroa e mastro da torre) |
| `parte-campo.js` (fim do arquivo) | **Edifícios da Real Forte e ilhas**: `edificioRF` (hub = Hub de Conexões no lote da frente, com `W.pontosHub` / `irAoHub` / `semearHub`; networking = Centro de Networking Corporativo no lote 2 (era o cubo genérico), salão aberto, 3 salas de reunião de vidro (mesa baixa, 6 lugares sentados, TV com o mesmo material `CAMPO.telaoHub.mat` do telão do Hub = mesmo slide na mesma hora), pergolado e totem, com `W.pontosNetworking` / `irAoNetworking` / `semearNetworking`; instituto, academia, pesquisa, auditorio, sinais, galeria, eventos), `alaDoTerminal` (ala nova do Terminal no quarteirão ao lado), `porticoBoasVindas` ("Bem-vindo" com a logo da empresa na chegada de cada ponte), `bairroDaIlha` (residencial alto com piscina, prédios de serviço com ícone, anel viário), placas `texturaPlacaRF` / `desenharIcone`. A sombra de contato está desligada (`CINEMA_AJUSTE.sombraContato: 0`, ver Armadilhas) |
| `parte-campo.js` (fim do arquivo) | **Gente de dia e de noite**: `irEmbora` (longe de casa, some na estação mais perto: pegou o ônibus), `gentDaNoiteNaCidade` / `tarefaPasseio` (10 pessoas neutras que só saem à noite; de dia são 12 visitantes neutros e 34 da equipe Real Forte: estações, torre, edifícios da Real Forte, café e praças), `moradoresDasIlhas` / `tarefaMorador` (cobertura do residencial com `yFixo` e o chão da ilha), pontos de foto `W.pontosFotoRF` (`M.centros.fotoMarcos`). Janelas dos residenciais: `CAMPO.matResidencial` + `CAMPO.janelasResid` (dois mapas de janela: de dia ~10% acesas, de noite ~90% em amarelo forte; troca em `passoCeuDeCinema`). Lugar com `y` (degrau da arquibancada) faz a pessoa sentar naquela altura. Quando a hora vira, quem está andando para outro lugar muda de ideia e vai embora |
| `parte-campo.js` (fim do arquivo) | **Apresentações no Hub**: `APRESENTACOES` (duração, intervalos de manhã/tarde), `passoApresentacoesHub` (a agenda segue o relógio da cidade em `sessaoDoHub`: sessões fixas, entrar e sair não reinicia; rodízio `rodizioDoHub` = Real Forte + todas as empresas o dia inteiro; colegas da próxima empresa são chamados uma sessão antes; plateia `chamarPlateia`, apresentador `tarefaApresentador`), telão `telaoDasApresentacoes` / `desenharSlide` (números reais do painel em `dadosDaApresentacao`; logo da Real Forte = `LOGO.escuro`; `logoEhClara` / `corDoCartao` escolhem cartão branco ou azul-marinho conforme o brilho da logo, também no pórtico; gráficos sem número marcados "gráfico ilustrativo"), `alturasDoHub` (degraus e palco no mapa de pisar). Hub: só o auditório (palco, telão e arquibancada) fica no vidro; em volta, área aberta com quiosques de bebidas e comidas, mesas altas, cabines de conversa, lounge e coworking. Metal do Hub é bronze fosco (`bronzeF`, não brilha); `BRONZE()` abaixo do ponto de brilho |
| `parte-campo.js` | **Relógio da Cidade**: `montarRelogio` / `passoRelogio` / `digitoLED` (painel de LED de 7 segmentos, duas faces, no centro da Praça da Estratégia; o relógio de ponteiros em frente à sede saiu) |
| `parte-campo.js` | **Trabalho nas empresas**: `pontosDeTrabalho` (pilhas de caixas `pegar` e pontos `entregar` nos segmentos de `SEGMENTOS_COM_CARGA`; ronda com tablet nos outros), `tarefaCarga`; 1 em cada 4 funcionários tem `papel = carga`; ~28 por empresa. Uns 30% saem da ilha às vezes e é minoria no Hub e na plateia |
| `parte-campo.js` | **Quem circula pela cidade**: `circulantesDaCidade` / `tarefaCircula` (90 pessoas: 1/3 uniforme Real Forte, 1/3 uniforme de empresa com `il` — some na apresentação —, 1/3 à paisana; passeiam pelas calçadas do próprio bairro com `pontoNaCalcada`, praças, fotos, estação; à noite a maioria vai embora) |
| `parte-galaxia.js` | galáxia de soluções da biblioteca |
| `parte-app.js` | o app: estado `S`/`UI`, armazenamento, rotas (`#biblioteca`, `#sv-<setor>`, `#sg-<setor>`…), telas, check-up, IA, PowerPoint, PDF, RF Sinais, biblioteca, anotações com foto/áudio/arquivo, cliques |

Atenção: `parte-app.js` e `parte-campo.js` começam com `<script>` e terminam com `</script>`. Código novo vai DENTRO do script (depois do `'use strict';`), nunca antes nem depois da tag.

## Regras do Lucas (valem para tudo)

1. **Especificação antes de código** quando for ferramenta nova: o que entra, o que sai, o que nasce em branco e quem declara, o que acontece sem dado, o que acontece no F5.
2. **Nenhuma regra de negócio inventada.** Percentual, prazo, limite, meta: vira campo vazio com rótulo de quem declara. Se faltar número, devolver a pergunta e para quem fazer.
3. Vocabulário da área, em português. Código comentado em português, nomes de variável legíveis, sem truque.
4. Sem login, sem banco externo, sem dependência nova de fora (Three.js já é a exceção).
5. Resposta direta, em português informal, sem enrolação. **Terminar toda resposta com uma linha: "O que eu fiz de diferente: …"**
6. **Privacidade de cliente:** no modo apresentação (`CAMPO.ap`) nenhuma outra empresa pode aparecer.
7. Vídeos da Lança/Elson's só aparecem em empresa cujo nome bate com `/elson/i`.
8. Ele é exigente com visual: quer acabamento profissional, nada de "maquete" ou "jogo barato". Sempre olhar as fotos antes de entregar.

## Armadilhas conhecidas

- **Comentário `//` no meio da linha** comenta o resto da linha. Quando inserir código por substituição de texto, usar `/* */` ou deixar o `//` no fim da linha. Já quebrou o código 4 vezes.
- Material de `mat()` é **compartilhado (cache)**. Antes de mudar `fog`, `depthWrite` etc., fazer `.clone()`.
- Faces aditivas sobrepostas estouram para branco (aconteceu no holograma). Preferir contorno (`EdgesGeometry`) a placa cheia.
- Peças no mesmo plano piscam: separar alturas (há `logarithmicDepthBuffer`, mas não basta para coplanar).
- O cofre de arquivos (`assets`) só aceita foto, áudio, vídeo, PDF e texto, até 20 MB. Planilha e arquivo grande vão num "envelope" .json em base64, cortado em partes de 14 MB (`guardarArquivo` / `baixarAnexo`).
- Os vídeos dos outdoors são assets do artifact (`/_blob/<id>`): só tocam no painel publicado, não no teste local. Quem decide quais tocam é `passoTelas`: os 6 mais perto que estão dentro da tela e a até 700 m (antes era 120 m e, na vista geral, todos ficavam parados).
- **Sombra de contato (AO) desligada desde a v85**: com o buffer logarítmico ela desenhava faixas horizontais no chão e pontos nas telas. Não religar sem testar o chão em câmera baixa.
- **Tela ou placa encostada em parede/moldura** pisca ou mostra diagonal escura (o `polygonOffset` não funciona com o buffer logarítmico). `afastarPlacas(CAMPO.cena)`, no fim de `montarMundo`, puxa 4 cm para a frente todo plano em pé com imagem de 0,8 m para cima. Plano deitado no chão fica onde está. Peça nova com tela: deixar pelo menos 4 cm de folga da moldura, ou já nascer com `userData.afastada = true`.

- **Acabamento de cinema**: se o aparelho não tiver WebGL2, o painel desenha direto (sem pós). O que é pesado no céu (via láctea, continentes e nuvens do planeta) é desenhado uma vez só no início (`assarTextura`); não pôr ruído de muitas oitavas no shader de cada quadro. Detalhe fino de shader precisa sumir com a distância (`fwidth`), senão vira chuvisco.
- `revestir` desenha pela posição no mundo: serve para caixa esticada (lote instanciado) sem textura esticar. Material de `mat()` é compartilhado: para revestir um deles sem afetar os outros, usar `revestido(m, tipo)` (faz uma cópia guardada).

- Empresas em ilha-satélite usam lote com `i: 9`: por isso não entram nas rotas dos veículos da empresa nem no ponto de ônibus (`il_temLote` dá falso). Para voltar a ter caminhão e ônibus indo até elas, falta ligar o grafo de ruas às pontes.

- `K.add(geo, mat, x, y, z, sx, sy, sz)`: **sempre passar as três escalas**. Sem o `sz` a peça vira NaN (some ou fica gigante na conta). Já aconteceu em 11 lugares.

## Testes (Playwright + Chromium, sem placa de vídeo é lento)

Uma vez: `cd testes && npm install && pip install playwright && playwright install chromium` (as bibliotecas da CDN são servidas localmente pelo node_modules). Depois, rodar de dentro de `testes/`, passando o HTML montado:

```
python3 teste_cidades.py ../dist/real-forte-sistema.html sim   # pessoas atravessando parede / presas
python3 teste_novos.py ../dist/real-forte-sistema.html         # privacidade no modo apresentação
python3 teste_kits.py ../dist/real-forte-sistema.html geral    # fotos dos campus por segmento
python3 teste_fotos.py ../dist/real-forte-sistema.html dia,noite   # fotos das câmeras de fotos.txt
python3 teste_saude.py / teste_arquivo.py / teste_link.py      # telas do app (anotações, arquivos, biblioteca)
```

Os dados de teste ficam em `testes/dados/` (empresa "Distribuidora Exemplo"; nas fotos ela é renomeada para "Elson's"). Os testes simulam o `window.claude` (db, assets, downloads) em memória. O teste de "prompt de transformar" em `teste_saude.py` procura um texto antigo e dá False; não é erro do painel.
