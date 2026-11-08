# Real Forte Lab — painel de diagnóstico da Real Forte Consultoria

Painel em um arquivo HTML só, publicado como Artifact no claude.ai. Quem constrói é o Lucas Smarssaro Dadalto. A Real Forte é a consultoria do pai dele. O painel serve aos consultores: empresas, setores, check-up, "o que eu vi", gargalos e oportunidades, biblioteca de soluções, RF Intelligence, RF Sinais e a cidade 3D (cada empresa é uma ilha; o mundo agora é a ilha flutuando no espaço).

- **Artifact publicado (sempre atualizar este, nunca criar outro):** https://claude.ai/artifact/6fryTDCEREKpMdKnRKihm8
- Última versão publicada: **v66** (link da ferramenta direto no cartão da biblioteca).
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
- Os vídeos dos outdoors são assets do artifact (`/_blob/<id>`): só tocam no painel publicado, não no teste local.

- **Acabamento de cinema**: se o aparelho não tiver WebGL2, o painel desenha direto (sem pós). O que é pesado no céu (via láctea, continentes e nuvens do planeta) é desenhado uma vez só no início (`assarTextura`); não pôr ruído de muitas oitavas no shader de cada quadro. Detalhe fino de shader precisa sumir com a distância (`fwidth`), senão vira chuvisco.
- `revestir` desenha pela posição no mundo: serve para caixa esticada (lote instanciado) sem textura esticar. Material de `mat()` é compartilhado: para revestir um deles sem afetar os outros, usar `revestido(m, tipo)` (faz uma cópia guardada).

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
