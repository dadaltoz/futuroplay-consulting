"""Teste do formulário do RF Sinais com anexos, rodando o Codigo.gs de verdade num Google de mentira.
uso: python3 teste_rf_sinais.py   (fotos e página montada em testes/saida21)
Casos: sem anexo, com foto + PDF, arquivo grande, tipo não aceito, 4º arquivo, clique duplo,
falha no meio do envio (nada gravado) e depois "enviar sem anexo", conferência no servidor,
página antiga (sem código de envio) e limpeza de arquivo sem sinal."""
import json, pathlib, base64, io, sys
from playwright.sync_api import sync_playwright
BASE = pathlib.Path(__file__).parent
RAIZ = BASE.parent / 'rf-sinais'
OUT = BASE / 'saida21'; OUT.mkdir(exist_ok=True)

# Monta a página como o doGet faria (empresa e setores do link)
form = (RAIZ / 'Formulario.html').read_text()
valores = {
    'empresaIdJson': json.dumps('exemplo'), 'empresaNomeJson': json.dumps('Distribuidora Exemplo'),
    'setoresJson': json.dumps(['Logística', 'Comercial']), 'frequenciasJson': json.dumps(['Todo dia', 'Toda semana', 'Às vezes']),
    'impactosJson': json.dumps(['Pouco', 'Médio', 'Muito']),
    'anexosJson': json.dumps({'maximo': 3, 'bytes': 8 * 1024 * 1024, 'tipos': ['jpg', 'jpeg', 'png', 'pdf', 'xlsx', 'xls', 'csv', 'ods']}),
}
for k, v in valores.items(): form = form.replace(f'<?!= {k} ?>', v)
assert '<?' not in form, 'sobrou marcador do Google na página'
codigo = (RAIZ / 'Codigo.gs').read_text()
funcoes = ['doGet', 'reservarSinal', 'subirAnexo', 'desfazerAnexos', 'enviarSinal', 'instalar', 'limparAnexosSemSinal', 'pastaDosAnexos']
servidor = '<script>' + (BASE / 'google_falso.js').read_text() + '</script><script>(function(){' + codigo + '\nObject.assign(window,{' + ','.join(funcoes) + '});})();</script>'
(OUT / 'pagina.html').write_text(form.replace('</head>', servidor + '</head>'))

# Arquivos de teste
from PIL import Image
buf = io.BytesIO(); Image.new('RGB', (4000, 3000), (40, 120, 200)).save(buf, 'PNG'); FOTO = buf.getvalue()
PDF = b'%PDF-1.4\n%teste\n' + b'0' * 20000
GRANDE = b'%PDF-1.4\n' + b'0' * (9 * 1024 * 1024)
arq = lambda nome, tipo, dados: {'name': nome, 'mimeType': tipo, 'buffer': dados}

falhas = []
def confere(cond, texto):
    print(('ok   ' if cond else 'FALHA ') + texto)
    if not cond: falhas.append(texto)

with sync_playwright() as p:
    nav = p.chromium.launch()
    erros = []
    def nova(w=390, h=844):
        pg = nav.new_page(viewport={'width': w, 'height': h})
        pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto((OUT / 'pagina.html').as_uri()); pg.wait_for_timeout(200)
        return pg
    def preencher(pg):
        pg.click('#chips-setor .chip:has-text("Logística")'); pg.fill('#texto', 'A nota fiscal chega depois do caminhão.')
    G = lambda pg, expr: pg.evaluate('window.__google.' + expr)
    esperar_pronto = lambda pg: pg.wait_for_selector('#pronto:not([hidden])', timeout=8000)

    # 1. Sem anexo
    pg = nova(); preencher(pg); pg.click('#enviar'); esperar_pronto(pg)
    confere(G(pg, 'linhas.length') == 1, 'sem anexo: grava 1 linha')
    linha = G(pg, 'linhas[0]')
    confere(len(linha) == 11 and linha[10] == '', 'sem anexo: 11 colunas e "anexos" vazio')
    confere(G(pg, 'arquivos.length') == 0, 'sem anexo: nenhum arquivo no Drive')
    confere(G(pg, "cabecalho[10]") == 'anexos', 'planilha nova: cabeçalho termina em "anexos"')
    pg.screenshot(path=str(OUT / '01-sem-anexo-pronto.png'))

    # 2. Foto grande + PDF
    pg = nova(); preencher(pg)
    pg.set_input_files('#arquivo', [arq('IMG_0001.png', 'image/png', FOTO), arq('nota.pdf', 'application/pdf', PDF)])
    pg.wait_for_function('anexos.length === 2 && preparando === 0', timeout=8000)
    dim = pg.evaluate("new Promise(r => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight, anexos[0].nome, anexos[0].tipo, anexos[0].tamanho]); i.src = 'data:image/jpeg;base64,' + anexos.find(a => a.tipo === 'image/jpeg').base64; })")
    confere(dim[0] == 1600 and dim[1] == 1200, f'foto reduzida para 1600 x 1200 (veio {dim[0]} x {dim[1]})')
    confere(dim[2].endswith('.jpg') and dim[3] == 'image/jpeg', 'foto vira JPEG')
    confere(dim[4] < len(FOTO), f'foto ficou menor ({dim[4] // 1024} KB, original {len(FOTO) // 1024} KB)')
    pg.screenshot(path=str(OUT / '02-anexos-na-lista.png'), full_page=True)
    pg.click('#enviar'); esperar_pronto(pg)
    linha = G(pg, 'linhas[0]'); arqs = G(pg, 'arquivos.map(a => [a.nome, a.lixeira, a.pai.nome])')
    confere(len(arqs) == 2 and all(a[0].startswith(linha[0] + ' · ') and not a[1] and a[2] == 'RF Sinais — Anexos' for a in arqs), 'com anexo: 2 arquivos na pasta, nome começando pelo código do sinal')
    confere(linha[10].count('https://drive.google.com/file/d/') == 2 and '(nota.pdf)' in linha[10], 'com anexo: coluna "anexos" com os 2 links e nomes')
    corpo = G(pg, 'emails[0].body')
    confere('nota.pdf: https://drive.google.com' in corpo and '"anexos":[{' in corpo, 'com anexo: e-mail traz os links e a linha RF-SINAL com anexos')
    confere('1 · ' in arqs[0][0] and '2 · ' in arqs[1][0], 'arquivos numerados 1 e 2')
    pg.screenshot(path=str(OUT / '03-com-anexo-pronto.png'))

    # 3. Arquivo grande, tipo não aceito, 4º arquivo
    pg = nova(); preencher(pg)
    pg.set_input_files('#arquivo', [arq('grande.pdf', 'application/pdf', GRANDE)]); pg.wait_for_timeout(300)
    confere('passou de 8 MB' in pg.inner_text('#erro') and pg.evaluate('anexos.length') == 0, 'arquivo de 9 MB: avisa e não entra')
    pg.set_input_files('#arquivo', [arq('programa.exe', 'application/octet-stream', b'MZ000')]); pg.wait_for_timeout(300)
    confere('tipo de arquivo não dá' in pg.inner_text('#erro') and pg.evaluate('anexos.length') == 0, 'tipo .exe: avisa e não entra')
    pg.screenshot(path=str(OUT / '04-tipo-nao-aceito.png'), full_page=True)
    pg.set_input_files('#arquivo', [arq(f'p{i}.pdf', 'application/pdf', PDF) for i in range(4)])
    pg.wait_for_function('preparando === 0', timeout=8000); pg.wait_for_timeout(200)
    confere(pg.evaluate('anexos.length') == 3 and 'até 3 arquivos' in pg.inner_text('#erro'), '4 arquivos de uma vez: entram 3 e avisa')
    confere(pg.get_attribute('#anexar', 'aria-disabled') == 'true', 'com 3 na lista, o botão de anexar desliga')
    planilha_xlsx = pg.evaluate("anexos.splice(2, 1); desenharAnexos(); anexos.length")
    pg.set_input_files('#arquivo', [arq('rotas.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', b'PK' + b'0' * 3000)])
    pg.wait_for_function('anexos.length === 3', timeout=8000)
    confere(pg.evaluate("anexos.some(a => a.nome === 'rotas.xlsx')"), 'planilha .xlsx é aceita')

    # 4. Clique duplo e Enter repetido: um sinal só
    pg = nova(); preencher(pg)
    pg.set_input_files('#arquivo', [arq('nota.pdf', 'application/pdf', PDF)]); pg.wait_for_function('anexos.length === 1')
    pg.dblclick('#enviar'); pg.press('#nome', 'Enter'); pg.evaluate("document.getElementById('form').requestSubmit()")
    esperar_pronto(pg); pg.wait_for_timeout(500)
    confere(G(pg, 'linhas.length') == 1 and G(pg, 'arquivos.length') == 1, f"clique duplo: 1 linha e 1 arquivo (deu {G(pg, 'linhas.length')} e {G(pg, 'arquivos.length')})")
    # o mesmo envio chegando de novo ao Google (internet caiu e voltou) devolve o mesmo código
    env = pg.evaluate('envio'); cod = G(pg, 'linhas[0][0]')
    de_novo = pg.evaluate(f"enviarSinal({{ envio: '{env}', setor: 'Logística', texto: 'repetido de novo', anexos: [] }})")
    confere(de_novo == cod and G(pg, 'linhas.length') == 1, 'mesmo envio repetido no servidor: mesmo código, sem linha nova')

    # 5. Falha no meio: o 2º anexo não sobe
    pg = nova(); preencher(pg)
    pg.set_input_files('#arquivo', [arq('IMG.png', 'image/png', FOTO), arq('nota.pdf', 'application/pdf', PDF)]); pg.wait_for_function('anexos.length === 2 && preparando === 0', timeout=8000)
    pg.evaluate('window.__falhar = { subirAnexo: 2 }')
    pg.click('#enviar'); pg.wait_for_selector('#falha:not([hidden])', timeout=8000); pg.wait_for_timeout(300)
    confere(G(pg, 'linhas.length') == 0, 'falha no anexo: nenhuma linha gravada')
    confere(G(pg, 'arquivos.every(a => a.lixeira)'), 'falha no anexo: o que tinha subido foi para a lixeira')
    confere(pg.inner_text('#falha p') == 'O anexo não subiu. Tente de novo ou envie sem anexo.', 'falha no anexo: mensagem combinada')
    confere(pg.input_value('#texto') != '' and not pg.is_disabled('#enviar'), 'falha no anexo: texto continua e o botão volta')
    pg.screenshot(path=str(OUT / '05-falha-no-anexo.png'), full_page=True)
    pg.click('#tentar'); esperar_pronto(pg)
    linha = G(pg, 'linhas[0]'); vivos = G(pg, 'arquivos.filter(a => !a.lixeira).map(a => a.nome)')
    confere(G(pg, 'linhas.length') == 1 and linha[10].count('https://') == 2 and len(vivos) == 2, '"Tentar de novo": grava com os 2 anexos')
    pg = nova(); preencher(pg)
    pg.set_input_files('#arquivo', [arq('nota.pdf', 'application/pdf', PDF)]); pg.wait_for_function('anexos.length === 1')
    pg.evaluate('window.__falhar = { subirAnexo: 1 }'); pg.click('#enviar'); pg.wait_for_selector('#falha:not([hidden])', timeout=8000)
    pg.click('#sem-anexo'); esperar_pronto(pg)
    confere(G(pg, 'linhas.length') == 1 and G(pg, 'linhas[0][10]') == '', '"Enviar sem anexo": grava o sinal sem anexo')

    # 6. O servidor confere de novo (não confia na página)
    pg = nova()
    r = pg.evaluate(f"""(() => {{ const e = 'a'.repeat(24); const c = reservarSinal(e).codigo; const out = [];
      try {{ subirAnexo(e, c, 1, 'grande.pdf', 'application/pdf', '{base64.b64encode(GRANDE).decode()}'); out.push('passou'); }} catch (x) {{ out.push(x.message); }}
      try {{ subirAnexo(e, c, 1, 'virus.exe', 'x', 'TVow'); out.push('passou'); }} catch (x) {{ out.push(x.message); }}
      try {{ subirAnexo(e, 'S-OUTRO00', 1, 'a.pdf', 'application/pdf', 'JVBERg=='); out.push('passou'); }} catch (x) {{ out.push(x.message); }}
      const estranho = DriveApp.createFolder('outra').createFile(Utilities.newBlob(new Uint8Array(3), 'application/pdf', c + ' · 1 · x.pdf'));
      try {{ enviarSinal({{ envio: e, setor: 'Log', texto: 'arquivo de fora da pasta', anexos: [{{ id: estranho.getId() }}] }}); out.push('passou'); }} catch (x) {{ out.push(x.message); }}
      return out; }})()""")
    confere('8 MB' in r[0], 'servidor recusa arquivo de 9 MB')
    confere('tipo de arquivo' in r[1], 'servidor recusa tipo não aceito')
    confere('expirou' in r[2], 'servidor recusa anexo com código de outro envio')
    confere('anexo não subiu' in r[3] and G(pg, 'linhas.length') == 0, 'servidor recusa arquivo de fora da pasta e não grava')

    # 7. Página antiga (sem código de envio) continua gravando, e a planilha antiga ganha a coluna nova
    pg = nova()
    r = pg.evaluate("""(() => { window.__google.cabecalho = ['codigo','recebido_em','empresa_id','empresa','setor','o_que_trava','frequencia','quanto_atrapalha','nome','contato'];
      PropertiesService.getScriptProperties().setProperty('PLANILHA_ID', 'planilha1'); SpreadsheetApp.create().getSheets()[0].setName('Sinais');
      const c = enviarSinal({ empresaNome: 'X', setor: 'Comercial', texto: 'página antiga mandando' }); return [c, window.__google.cabecalho[10], window.__google.linhas.length]; })()""")
    confere(r[0].startswith('S-') and len(r[0]) == 10 and r[1] == 'anexos' and r[2] == 1, 'página antiga sem "envio": grava e a planilha antiga ganha a coluna "anexos"')

    # 8. Limpeza de arquivo sem sinal
    r = pg.evaluate("""(() => { const p = pastaDosAnexos(); const velho = p.createFile(Utilities.newBlob(new Uint8Array(3), 'application/pdf', 'S-ABCDEF12 · 1 · velho.pdf')); velho.criado = new Date(Date.now() - 3 * 864e5);
      const novo = p.createFile(Utilities.newBlob(new Uint8Array(3), 'application/pdf', 'S-ABCDEF13 · 1 · novo.pdf'));
      const n = limparAnexosSemSinal(); return [n, velho.lixeira, novo.lixeira]; })()""")
    confere(r == [1, True, False], 'limpeza: apaga só o arquivo sem sinal com mais de 1 dia')

    # 9. Tela de computador (aparência)
    pg = nova(1280, 900); preencher(pg)
    pg.set_input_files('#arquivo', [arq('IMG_0001.png', 'image/png', FOTO), arq('nota.pdf', 'application/pdf', PDF)]); pg.wait_for_function('anexos.length === 2 && preparando === 0', timeout=8000)
    pg.screenshot(path=str(OUT / '06-computador.png'), full_page=True)

    confere(not erros, 'sem erro de página ' + str(erros[:3]))
    nav.close()
print('\nRESULTADO:', 'tudo certo' if not falhas else f'{len(falhas)} falha(s)')
sys.exit(1 if falhas else 0)
