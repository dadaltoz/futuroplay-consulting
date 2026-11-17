"""Teste do Feedback do Lucas: a página de resposta (Codigo.gs de verdade num Google de mentira)
e a tela do Lucas no painel (configuração em branco, link, colar respostas, médias, PDF).
uso: python3 teste_feedback.py [html do painel]   (fotos em testes/saida23)"""
import json, pathlib, sys, glob, subprocess
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright
BASE = pathlib.Path(__file__).parent
RAIZ = BASE.parent / 'feedback'
HTML = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else str(BASE.parent / 'dist' / 'real-forte-sistema.html'))
OUT = BASE / 'saida23'; OUT.mkdir(exist_ok=True)
CODIGO = (RAIZ / 'Codigo.gs').read_text()
SERVIDOR = '<script>' + (BASE / 'google_falso.js').read_text() + '</script><script>(function(){' + CODIGO + '\nObject.assign(window,{doGet,enviarResposta,instalar});})();</script>'
(OUT / 'servidor.html').write_text('<!doctype html><html><head><meta charset=utf-8>' + SERVIDOR + '</head><body></body></html>')
falhas = []
def confere(c, t):
    print(('ok   ' if c else 'FALHA ') + t)
    if not c: falhas.append(t)

with sync_playwright() as p:
    nav = p.chromium.launch(); erros = []
    # Monta a página como o Google faria: roda o doGet com os pedaços do link
    def pagina(params, nome):
        pg = nav.new_page(); pg.goto((OUT / 'servidor.html').as_uri())
        v = pg.evaluate('(p) => { const t = doGet({ parameter: p }).vars; return { setoresJson: t.setoresJson, criteriosJson: t.criteriosJson, modoJson: t.modoJson, faltaJson: t.faltaJson }; }', params)
        pg.close()
        html = (RAIZ / 'Formulario.html').read_text()
        for k, x in v.items(): html = html.replace(f'<?!= {k} ?>', x)
        assert '<?' not in html
        (OUT / f'{nome}.html').write_text(html.replace('</head>', SERVIDOR + '</head>'))
        pg = nav.new_page(viewport={'width': 390, 'height': 844}); pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto((OUT / f'{nome}.html').as_uri()); pg.wait_for_timeout(150)
        return pg
    G = lambda pg, e: pg.evaluate('window.__google.' + e)
    COMPLETO = {'s': 'Logística|Comercial|Financeiro', 'c': 'Pontualidade|Clareza na comunicação|Iniciativa', 'm': 'anonima'}

    # ----- Página de resposta -----
    pg = pagina({'s': 'Logística', 'm': 'anonima'}, 'incompleto')
    confere(pg.is_visible('#incompleto') and 'falta a lista de critérios' in pg.inner_text('#incompleto') and not pg.is_visible('#form'), 'link sem critérios: diz o que falta e não mostra o formulário')
    pg.screenshot(path=str(OUT / '01-link-incompleto.png'))
    pg = pagina({'s': 'A', 'c': 'B'}, 'sem-modo')
    confere('se a resposta é anônima ou identificada' in pg.inner_text('#incompleto'), 'link sem o modo: diz o que falta')

    pg = pagina(COMPLETO, 'anonima')
    confere(pg.locator('#setores .chip').count() == 3 and pg.locator('.nota').count() == 15, 'link completo: 3 setores e 5 notas para cada um dos 3 critérios')
    confere(not pg.is_visible('#campo-nome') and 'anônima' in pg.inner_text('#selo'), 'anônima: sem campo de nome e com o selo')
    pg.click('#enviar'); confere(pg.inner_text('#erro') == 'Escolha o seu setor.', 'sem setor: pede o setor')
    pg.click('#setores .chip:has-text("Logística")')
    pg.click('[aria-label="Pontualidade: nota 4"]'); pg.click('[aria-label="Iniciativa: nota 3"]')
    pg.click('#enviar'); confere(pg.inner_text('#erro') == 'Falta dar nota em: Clareza na comunicação.', 'nota faltando: diz em qual critério')
    pg.click('[aria-label="Clareza na comunicação: nota 5"]')
    pg.fill('#funcionou', 'Organizou as planilhas de rota.'); pg.fill('#melhorar', '=Podia ter avisado antes das mudanças.')
    pg.screenshot(path=str(OUT / '02-preenchido.png'), full_page=True)
    pg.dblclick('#enviar'); pg.evaluate("document.getElementById('form').requestSubmit()")
    pg.wait_for_selector('#pronto:not([hidden])', timeout=6000); pg.wait_for_timeout(400)
    confere(G(pg, 'linhas.length') == 1, f"clique duplo: 1 resposta (deu {G(pg, 'linhas.length')})")
    l = G(pg, 'linhas[0]'); cab = G(pg, 'cabecalho')
    confere(cab == ['codigo', 'recebido_em', 'setor', 'notas', 'o_que_funcionou', 'o_que_podia_melhorar', 'nome', 'envio'], 'planilha com as colunas combinadas')
    confere(l[0].startswith('F-') and len(l[0]) == 10 and l[2] == 'Logística' and l[3] == 'Pontualidade: 4 | Clareza na comunicação: 5 | Iniciativa: 3', 'linha: código F-, setor e notas por critério')
    confere(l[5].startswith("'=") and l[6] == '', 'texto que vira fórmula leva apóstrofo; anônima não guarda nome')
    env = pg.evaluate('envio')
    de_novo = pg.evaluate(f"enviarResposta({{ envio: '{env}', modo: 'anonima', setor: 'Comercial', notas: [{{ criterio: 'X', nota: 2 }}] }})")
    confere(de_novo == l[0] and G(pg, 'linhas.length') == 1, 'mesmo envio repetido no servidor: mesmo código, sem linha nova')
    pg.screenshot(path=str(OUT / '03-enviado.png'))
    r = pg.evaluate("""(() => { const out = []; const e = 'b'.repeat(24);
      for (const d of [{ envio: e, modo: 'anonima', setor: 'L', notas: [{ criterio: 'A', nota: 6 }] }, { envio: e, modo: 'identificada', setor: 'L', notas: [{ criterio: 'A', nota: 3 }] }, { envio: e, modo: '', setor: 'L', notas: [{ criterio: 'A', nota: 3 }] }])
        try { enviarResposta(d); out.push('passou'); } catch (x) { out.push(x.message); }
      return out; })()""")
    confere('de 1 a 5' in r[0] and 'nome' in r[1] and 'incompleto' in r[2] and G(pg, 'linhas.length') == 1, 'servidor recusa nota 6, identificada sem nome e link sem modo')

    pg = pagina(dict(COMPLETO, m='identificada'), 'identificada')
    confere(pg.is_visible('#campo-nome'), 'identificada: pede o nome')
    pg.click('#setores .chip:has-text("Comercial")')
    for c in ['Pontualidade', 'Clareza na comunicação', 'Iniciativa']: pg.click(f'[aria-label="{c}: nota 5"]')
    pg.click('#enviar'); confere('Escreva o seu nome' in pg.inner_text('#erro'), 'identificada sem nome: pede o nome')
    pg.fill('#nome', 'Marta'); pg.evaluate('window.__falhar = { enviarResposta: 1 }'); pg.click('#enviar'); pg.wait_for_timeout(500)
    confere('Sua resposta continua aqui' in pg.inner_text('#erro') and pg.input_value('#nome') == 'Marta' and not pg.is_disabled('#enviar'), 'falha de rede: mensagem em português, nada se perde, botão volta')
    pg.click('#enviar'); pg.wait_for_selector('#pronto:not([hidden])', timeout=6000)
    confere(G(pg, 'linhas.length') == 1 and G(pg, 'linhas[0][6]') == 'Marta', 'tentar de novo: grava 1 resposta com o nome')
    pg.screenshot(path=str(OUT / '04-identificada-enviada.png'))
    pg = pagina(COMPLETO, 'google-antigo'); pg.evaluate("window.__semFuncoes = ['enviarResposta']")
    pg.click('#setores .chip:has-text("Logística")')
    for c in ['Pontualidade', 'Clareza na comunicação', 'Iniciativa']: pg.click(f'[aria-label="{c}: nota 3"]')
    pg.click('#enviar'); pg.wait_for_timeout(300)
    confere('Avise o Lucas' in pg.inner_text('#erro') and not pg.is_disabled('#enviar'), 'Codigo.gs errado publicado: avisa em português e o botão não trava')

    # ----- Tela do Lucas no painel -----
    SEM = {}
    for f in glob.glob(str(BASE / 'dados' / 'vivo/*/*.json')):
        q = pathlib.Path(f); SEM[f'{q.parent.name}/{q.stem}'] = json.loads(q.read_text())
    (OUT / 'painel.html').write_text(f"""<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>body{{margin:0}}[hidden]{{display:none!important}}</style></head><body>{HTML.read_text()}</body></html>""")
    falso = (BASE / 'olhar.py').read_text().split('falso = """', 1)[1].split('""" %', 1)[0] % json.dumps(SEM)
    ctx = nav.new_context(viewport={'width': 1440, 'height': 920}); ctx.add_init_script(falso)
    for url, arq in [('jspdf@2.5.1/dist/jspdf.umd.min.js', 'jspdf/dist/jspdf.umd.min.js'), ('jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js', 'jspdf-autotable/dist/jspdf.plugin.autotable.min.js')]:
        ctx.route('https://cdn.jsdelivr.net/npm/' + url, (lambda a: (lambda r: r.fulfill(path=str(BASE / 'node_modules' / a), content_type='application/javascript')))(arq))
    ctx.route('https://fonts.googleapis.com/**', lambda r: r.abort())
    pg = ctx.new_page(); pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.goto((OUT / 'painel.html').as_uri() + '#feedback'); pg.wait_for_timeout(900)
    falta = pg.evaluate("[...document.querySelectorAll('.fb-falta li b')].map(x => x.textContent)")
    confere(len(falta) == 5 and pg.is_disabled('[data-acao="feedbackTrazer"]') and pg.locator('.fb-link').count() == 0, 'tudo em branco: lista 5 coisas a declarar, sem link e sem trazer respostas')
    confere(pg.evaluate("[...document.querySelectorAll('.fb-falta li span')].every(x => x.textContent.startsWith('Quem declara: Lucas'))"), 'cada item diz quem declara')
    confere(pg.evaluate("!document.querySelector('input[name=fb-modo]:checked') && !document.querySelector('input[name=fb-quem]:checked') && document.getElementById('fb-setores').value === ''"), 'configuração nasce em branco (nada marcado)')
    pg.screenshot(path=str(OUT / '10-painel-em-branco.png'), full_page=True)
    URL = 'https://script.google.com/macros/s/AKfycbTESTE123/exec'
    pg.fill('#fb-url', URL); pg.fill('#fb-setores', 'Logística\nComercial\nFinanceiro\nlogística'); pg.fill('#fb-criterios', 'Pontualidade\nClareza na comunicação\nIniciativa')
    pg.check('input[name=fb-modo][value=anonima]'); pg.check('input[name=fb-quem][value=todos]')
    confere(pg.is_visible('#fb-campo-minimo'), 'anônima: aparece o campo do mínimo de respostas')
    pg.click('#fb-guardar'); pg.wait_for_timeout(500)
    falta = pg.evaluate("[...document.querySelectorAll('.fb-falta li b')].map(x => x.textContent)")
    confere(len(falta) == 1 and 'mínimo de respostas' in falta[0], 'anônima sem mínimo: falta só o mínimo (os resultados esperam)')
    link = pg.inner_text('.fb-link code'); q = parse_qs(urlparse(link).query)
    confere(link.startswith(URL) and q['s'] == ['Logística|Comercial|Financeiro'] and q['c'] == ['Pontualidade|Clareza na comunicação|Iniciativa'] and q['m'] == ['anonima'], 'link pronto com setores (sem repetido), critérios e modo')
    pg.fill('#fb-minimo', '2'); pg.click('#fb-guardar'); pg.wait_for_timeout(500)
    confere(pg.locator('.fb-falta').count() == 0 and not pg.is_disabled('[data-acao="feedbackTrazer"]'), 'tudo declarado: some o aviso e libera trazer respostas')
    COLADO = '\n'.join(['codigo\trecebido_em\tsetor\tnotas\to_que_funcionou\to_que_podia_melhorar\tnome\tenvio',
        'F-0000000A\t2026-11-16T10:00:00\tLogística\tPontualidade: 4 | Clareza na comunicação: 5 | Iniciativa: 3\tOrganizou as rotas.\tAvisar antes.\t\tx1',
        'F-0000000B\t2026-11-16T11:00:00\tLogística\tPontualidade: 5 | Clareza na comunicação: 4 | Iniciativa: 4\t\tMais presença no galpão.\t\tx2',
        'F-0000000C\t2026-11-16T12:00:00\tComercial\tPontualidade: 2 | Clareza na comunicação: 3 | Iniciativa: 5\tBoa planilha.\t\t\tx3',
        'F-0000000D\t2026-11-16T13:00:00\tLogística\tPontualidade: 3 | Organização: 4\t\t\t\tx4',
        'linha qualquer\tque não é resposta', 'F-0000000E\t2026-11-16\tLogística\tPontualidade: 9\t\t\t\tx5'])
    pg.click('[data-acao="feedbackTrazer"]'); pg.fill('#f-feedback', COLADO); pg.wait_for_timeout(200)
    prev = pg.inner_text('#previa-feedback')
    confere('4 respostas novas' in prev and '2 linhas ignoradas' in prev, 'prévia: 4 respostas novas e 2 linhas ignoradas (sem código e nota 9)')
    pg.dblclick('#botao-salvar'); pg.wait_for_timeout(800)
    confere(pg.evaluate('S.feedback.length') == 4, 'clique duplo ao trazer: 4 respostas guardadas, sem repetir')
    cel = pg.evaluate("""(() => { const t = document.querySelector('.fb-tabela'); const cab = [...t.querySelectorAll('thead th')].map(x => x.childNodes[0].textContent.trim());
      const lin = {}; t.querySelectorAll('tbody tr').forEach(tr => { lin[tr.querySelector('th').childNodes[0].textContent.trim()] = [...tr.querySelectorAll('td')].map(x => x.textContent.trim()); }); return { cab, lin }; })()""")
    # Conta à mão: Logística = A, B, D; Comercial = C (1 resposta, mínimo 2: escondido)
    confere(cel['cab'] == ['Critério', 'Logística', 'Comercial', 'Geral'], 'colunas: setores com resposta e o geral')
    confere(cel['lin']['Pontualidade'] == ['4,0', 'poucas respostas', '4,0'], f"Pontualidade: Logística (4+5+3)/3 = 4,0; Comercial escondido e fora do geral; geral 4,0 → {cel['lin']['Pontualidade']}")
    confere(cel['lin']['Clareza na comunicação'] == ['4,5', 'poucas respostas', '4,5'], f"Clareza: Logística (5+4)/2 = 4,5; geral sem o Comercial 4,5 → {cel['lin']['Clareza na comunicação']}")
    confere(cel['lin']['Iniciativa'] == ['3,5', 'poucas respostas', '3,5'], f"Iniciativa: Logística (3+4)/2 = 3,5; geral sem o Comercial 3,5 → {cel['lin']['Iniciativa']}")
    confere('3 respostas (sem os setores escondidos)' in pg.inner_text('.fb-tabela thead'), 'o geral diz que deixou o setor escondido de fora')
    confere(cel['lin'].get('Organização') == ['4,0', 'poucas respostas', '4,0'] and pg.locator('.fb-tabela small:has-text("fora da lista atual")').count() == 1, 'critério antigo entra marcado "fora da lista atual"')
    txt = pg.inner_text('.painel:has(.fb-tabela)')
    confere('ainda sem resposta: Financeiro' in txt and 'Logística: 3' in txt, 'respostas por setor e setor ainda sem resposta')
    confere('Organizou as rotas.' in txt and 'Boa planilha.' not in txt and 'menos de 2 respostas' in txt, 'comentários por setor; o setor escondido não mostra comentário')
    # Quando o Comercial passa do mínimo, ele aparece e volta para o geral: (4+5+3+2)/4 = 3,5
    pg.evaluate("gravar('feedback', 'F-0000000F', { codigo: 'F-0000000F', setor: 'Comercial', notas: [{ criterio: 'Pontualidade', nota: 4 }], funcionou: '', melhorar: '' }).then(() => render(true))"); pg.wait_for_timeout(400)
    lin = pg.evaluate("[...document.querySelector('.fb-tabela tbody tr').querySelectorAll('td')].map(x => x.textContent.trim())")
    confere(lin == ['4,0', '3,0', '3,6'], f"Comercial com 2 respostas: média (2+4)/2 = 3,0 e geral (4+5+3+2+4)/5 = 3,6 → {lin}")
    pg.evaluate("apagarRegistro('feedback', 'F-0000000F').then(() => render(true))"); pg.wait_for_timeout(300)
    pg.screenshot(path=str(OUT / '11-resultados.png'), full_page=True)
    pg.click('[data-acao="feedbackTrazer"]'); pg.fill('#f-feedback', COLADO); pg.wait_for_timeout(200)
    confere('0 respostas novas' in pg.inner_text('#previa-feedback') and pg.is_disabled('#botao-salvar'), 'colar de novo: nada entra repetido')
    pg.keyboard.press('Escape')
    # PDF
    pdf = pg.evaluate("(() => { const c = configFeedback(); const d = montarPDFFeedback(window.jspdf.jsPDF, c, resultadosFeedback(respostasFeedback(c), c)); return d.output('datauristring'); })()")
    import base64
    (OUT / 'relatorio.pdf').write_bytes(base64.b64decode(pdf.split(',', 1)[1]))
    subprocess.run(['pdftoppm', '-png', '-r', '70', '-f', '1', '-l', '1', str(OUT / 'relatorio.pdf'), str(OUT / '12-pdf')], check=True)
    confere((OUT / 'relatorio.pdf').stat().st_size > 3000, 'relatório em PDF gerado')
    pg.click('[data-acao="feedbackPDF"]'); pg.wait_for_timeout(800)
    confere(pg.evaluate("!!(window.__arquivo && /^Feedback do Lucas - .*\\.pdf$/.test(window.__arquivo.filename))"), 'botão do PDF salva "Feedback do Lucas - data.pdf"')
    # Regra "só quem tem a planilha": nada fica guardado e avisa do que sobrou
    pg.click('input[name=fb-quem][value=planilha]'); pg.click('#fb-guardar'); pg.wait_for_timeout(500)
    confere('Há 4 respostas guardadas' in pg.inner_text('#principal') and pg.locator('.fb-tabela').count() == 0, 'mudou para "só a planilha": avisa das 4 guardadas e não mostra as antigas')
    pg.click('[data-acao="feedbackTrazer"]'); pg.fill('#f-feedback', COLADO); pg.wait_for_timeout(200); pg.click('#botao-salvar'); pg.wait_for_timeout(500)
    confere(pg.locator('.fb-tabela').count() == 1 and pg.evaluate('S.feedback.length') == 4 and pg.evaluate('UI.feedbackColadas.length') == 4, '"só a planilha": mostra o que foi colado sem guardar nada novo')
    pg.on('dialog', lambda d: d.accept())
    pg.click('[data-acao="feedbackApagarGuardadas"]'); pg.wait_for_timeout(600)
    confere(pg.evaluate('S.feedback.length') == 0, 'apagar do painel: as guardadas saem (a planilha continua)')
    # Regra "quem pode editar": quem só lê vê o recado
    pg.click('input[name=fb-quem][value=editores]'); pg.click('#fb-guardar'); pg.wait_for_timeout(500)
    pg.evaluate('S.podeEditar = false; render(true)'); pg.wait_for_timeout(300)
    confere('só para quem pode editar' in pg.inner_text('#principal') and not pg.is_visible('.fb-config'), 'quem só lê: não vê resultados nem a configuração')
    pg.evaluate('S.podeEditar = true; render(true)')
    # Celular, tema escuro
    ctx2 = nav.new_context(viewport={'width': 390, 'height': 844}, color_scheme='dark'); ctx2.add_init_script(falso); ctx2.route('https://fonts.googleapis.com/**', lambda r: r.abort()); ctx2.route('https://cdn.jsdelivr.net/**', lambda r: r.abort())
    pc = ctx2.new_page(); pc.on('pageerror', lambda e: erros.append(str(e))); pc.goto((OUT / 'painel.html').as_uri() + '#feedback'); pc.wait_for_timeout(800)
    pc.evaluate(f"gravar('config', 'geral', Object.assign({{}}, S.config, {{ feedback: {{ url: '{URL}', setores: ['Logística', 'Comercial'], criterios: ['Pontualidade', 'Clareza'], modo: 'identificada', quemVe: 'todos', minimo: '' }} }})).then(() => render(true))"); pc.wait_for_timeout(400)
    pc.evaluate("gravar('feedback', 'F-00000001', { codigo: 'F-00000001', setor: 'Logística', notas: [{ criterio: 'Pontualidade', nota: 5 }, { criterio: 'Clareza', nota: 4 }], funcionou: 'Ajudou muito.', melhorar: '', nome: 'Marta' }).then(() => render(true))"); pc.wait_for_timeout(400)
    confere('Marta' in pc.inner_text('#principal') and pc.locator('.fb-falta').count() == 0, 'identificada: o nome aparece junto do comentário (e não pede mínimo)')
    pc.screenshot(path=str(OUT / '13-celular-escuro.png'), full_page=True)
    confere(not erros, 'sem erro de página ' + str(erros[:3]))
    nav.close()
print('\nRESULTADO:', 'tudo certo' if not falhas else f'{len(falhas)} falha(s)')
sys.exit(1 if falhas else 0)
