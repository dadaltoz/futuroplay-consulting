"""Teste do Relatório da passagem pelo setor (aba "Relatório" do setor): período, pessoas, leitura (IA simulada),
PDF com logo da empresa e da Real Forte, e os casos de erro. uso: python3 teste_relatorio.py [html]  (saída em testes/saida24)"""
import json, pathlib, sys, glob, base64, subprocess
from playwright.sync_api import sync_playwright
BASE = pathlib.Path(__file__).parent
HTML = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else str(BASE.parent / 'dist' / 'real-forte-sistema.html'))
OUT = BASE / 'saida24'; OUT.mkdir(exist_ok=True)
for f in OUT.glob('pdf-*.png'): f.unlink()
SEM = {}
for f in glob.glob(str(BASE / 'dados' / 'vivo/*/*.json')):
    q = pathlib.Path(f); SEM[f'{q.parent.name}/{q.stem}'] = json.loads(q.read_text())
(OUT / 'painel.html').write_text(f"""<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>body{{margin:0}}[hidden]{{display:none!important}}</style></head><body>{HTML.read_text()}</body></html>""")
falso = (BASE / 'olhar.py').read_text().split('falso = """', 1)[1].split('""" %', 1)[0] % json.dumps(SEM)
LEITURA = {'introducao': 'Entre outubro e novembro, mapeei os processos da Logística da Distribuidora Exemplo. O ponto que mais pesou foi a conferência da carga, ainda feita no papel. Foram 3 gargalos identificados: 1 já resolvido, 1 em andamento, com 24,5 horas por mês devolvidas à equipe.',
           'conclusao': 'A Logística sai deste ciclo com a conferência da carga mais rápida e registrada por pedido. Ainda pesa a falta de volume que só aparece pela reclamação do cliente, e o romaneio digitado duas vezes. O setor tem base para seguir melhorando com o que já foi montado.',
           'panorama': 'A conferência da carga ainda depende de papel e de conferência visual, o que gera retrabalho no fim do dia. A parte de rotas já mudou com a planilha nova e o tempo de montagem caiu.',
           'ruim': ['Conferência no papel, sem registro do que foi conferido.', 'Falta de volume só aparece pela reclamação do cliente.', 'Rotas montadas à mão todos os dias.'],
           'melhorar': ['Conferência com checklist no celular e foto da carga.', 'Aviso automático quando faltar volume na separação.'],
           'melhorou': ['Conferência da carga: de 33 para 8,5 horas por mês com o checklist.']}
falhas = []
def confere(c, t):
    print(('ok   ' if c else 'FALHA ') + t)
    if not c: falhas.append(t)
with sync_playwright() as p:
    nav = p.chromium.launch(); erros = []
    ctx = nav.new_context(viewport={'width': 1440, 'height': 920}); ctx.add_init_script(falso)
    for url, arq in [('jspdf@2.5.1/dist/jspdf.umd.min.js', 'jspdf/dist/jspdf.umd.min.js'), ('jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js', 'jspdf-autotable/dist/jspdf.plugin.autotable.min.js')]:
        ctx.route('https://cdn.jsdelivr.net/npm/' + url, (lambda a: (lambda r: r.fulfill(path=str(BASE / 'node_modules' / a), content_type='application/javascript')))(arq))
    ctx.route('https://fonts.googleapis.com/**', lambda r: r.abort())
    pg = ctx.new_page(); pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.on('dialog', lambda d: d.accept())
    pg.goto((OUT / 'painel.html').as_uri() + '#sr-ex-logistica'); pg.wait_for_timeout(900)
    # IA simulada (a de verdade só existe no painel publicado)
    pg.evaluate("(L) => { window.__pedidos = []; ia = Object.assign(async () => ({ text: '' }), { json: async (p) => { window.__pedidos.push(p); if (window.__iaFalha) throw new Error('falhou'); return L; } }); render(true); }", LEITURA)
    pg.wait_for_timeout(300)
    confere(pg.locator('.aba[aria-current="page"]', has_text='Relatório').count() == 1 or 'Relatório' in pg.inner_text('.abas'), 'aba "Relatório" no setor')
    falta = pg.inner_text('.rel-falta')
    confere('período' in falta and 'Pessoas e atividades' in falta and 'leitura' in falta, 'em branco: avisa o que falta (período, pessoas, leitura)')
    ind = pg.evaluate("[...document.querySelectorAll('.rel-ind .ind b')].map(x => x.textContent)")
    confere(ind == ['3', '1', '1', '0', '24,5'], f'números do setor tirados do painel: {ind}')
    pg.screenshot(path=str(OUT / '01-aba-em-branco.png'), full_page=True)
    # Período e pessoas
    pg.fill('#rel-inicio', '2026-10-01'); pg.fill('#rel-fim', '2026-11-21')
    PESSOAS = [('Lucas Smarssaro', 'Estagiário', 'Monta as planilhas de rota e confere os pedidos do dia.', 'Conferência ainda manual em parte das rotas.', 'Checklist da carga no celular, com foto.', 'Conferência no papel e foto no grupo.', 'Checklist no celular, registro por pedido.', 'Em execução'),
               ('Cassio Pereira', 'Analista de logística', 'Programa as entregas da semana, acompanha os motoristas e fecha o romaneio.', 'Romaneio digitado duas vezes (planilha e sistema).', 'Usar a mesma planilha como base do romaneio.', '', '', 'Proposta pronta'),
               ('Crislayne Souza', 'Assistente', 'Atende os clientes sobre atraso e falta de volume.', '', '', '', '', '')]
    for i, pe in enumerate(PESSOAS):
        pg.click('[data-acao="relPessoa"]'); pg.wait_for_timeout(150)
        for k, v in zip(['nome', 'funcao', 'atividades', 'melhorar', 'proposta', 'antes', 'depois'], pe[:7]):
            if v: pg.fill(f'#rel-p{i}-{k}', v)
        if pe[7]: pg.select_option(f'#rel-p{i}-sit', pe[7])
    confere(pg.locator('.rel-pessoa').count() == 3 and pg.locator('[data-acao="relGuardar"]').count() == 1, '3 pessoas na tela e o botão Guardar aparece (mudança não guardada)')
    pg.click('[data-acao="relGuardar"]'); pg.wait_for_timeout(500)
    P = pg.evaluate("setorPorId('ex-logistica').passagem")
    confere(P and P['inicio'] == '2026-10-01' and len(P['pessoas']) == 3 and P['pessoas'][1]['situacao'] == 'Proposta pronta' and pg.evaluate("!(UI.passagem && UI.passagem['ex-logistica'])"), 'Guardar: período e pessoas ficam no setor')
    # Leitura (IA)
    pg.click('[data-acao="relLeitura"]'); pg.wait_for_timeout(700)
    pedido = pg.evaluate('window.__pedidos[0] || ""')
    confere('"gargalos_identificados": 3' in pedido.replace('":3', '": 3') and '"introducao"' in pedido and '"conclusao"' in pedido, 'pedido à IA leva os números do setor e pede introdução e conclusão')
    confere('Conferência da carga no papel' in pedido and 'Não cite nomes de pessoas' in pedido and 'Cassio' not in pedido and 'próximos passos' in pedido, 'pedido à IA: usa os gargalos, não leva as pessoas e proíbe próximos passos')
    confere(pg.input_value('#rel-l-introducao').startswith('Entre outubro') and pg.input_value('#rel-l-conclusao').startswith('A Logística'), 'introdução e conclusão aparecem para revisar')
    confere(pg.input_value('#rel-l-panorama').startswith('A conferência') and pg.input_value('#rel-l-ruim').count('\n') == 2, 'leitura aparece nos campos para revisar')
    confere(pg.evaluate("setorPorId('ex-logistica').passagem.leitura.melhorou").startswith('Conferência da carga'), 'leitura fica guardada no setor')
    pg.fill('#rel-l-panorama', pg.input_value('#rel-l-panorama') + ' Revisado.')
    pg.screenshot(path=str(OUT / '02-aba-preenchida.png'), full_page=True)
    # Logo da empresa (desenhada aqui)
    pg.evaluate("""(() => { const c = document.createElement('canvas'); c.width = 400; c.height = 160; const q = c.getContext('2d'); q.fillStyle = '#c8102e'; q.beginPath(); q.arc(80, 80, 60, 0, 7); q.fill(); q.fillStyle = '#0a2a5c'; q.font = 'bold 64px Arial'; q.fillText("Elson's", 150, 102);
      const e = empresaPorId('exemplo'); return gravar('empresas', e.id, Object.assign({}, e, { logo: c.toDataURL('image/png') })); })()"""); pg.wait_for_timeout(300)
    # PDF
    pg.click('#botao-rel-pdf'); pg.wait_for_function('window.__arquivo', timeout=20000)
    arq = pg.evaluate('window.__arquivo')
    confere(arq['filename'].startswith('Relatorio de passagem - Logistica - Distribuidora Exemplo - 20') and arq['filename'].endswith('.pdf'), f"nome do arquivo: {arq['filename']}")
    confere(pg.evaluate("setorPorId('ex-logistica').passagem.leitura.panorama").endswith('Revisado.'), 'ao gerar, o texto revisado fica guardado')
    (OUT / 'relatorio.pdf').write_bytes(base64.b64decode(arq['base64']))
    subprocess.run(['pdftoppm', '-png', '-r', '80', str(OUT / 'relatorio.pdf'), str(OUT / 'pdf')], check=True)
    paginas = sorted(OUT.glob('pdf-*.png'))
    texto = subprocess.run(['pdftotext', str(OUT / 'relatorio.pdf'), '-'], capture_output=True, text=True).stdout
    confere(len(paginas) >= 2, f'PDF com {len(paginas)} páginas')
    confere('INTRODUÇÃO' in texto and 'Entre outubro e novembro' in texto and 'Conclusão' in texto and 'sai deste ciclo' in texto and 'FECHAMENTO DO CICLO' in texto, 'PDF abre com a introdução e fecha com a página de conclusão')
    confere(texto.index('INTRODUÇÃO') < texto.index('gargalos') and texto.rindex('Conclusão') > texto.index('Oportunidades'), 'introdução antes dos números; conclusão depois de tudo')
    confere(all(t in texto for t in ['RELATÓRIO DE PASSAGEM PELO SETOR', 'Logística', '01/10/2026 a 21/11/2026', 'Pessoas e atividades', 'Cassio Pereira', 'Leitura do setor', 'O que eu já apliquei', 'O que eu identifiquei', 'Oportunidades', 'Antes e depois']), 'PDF tem capa, período, pessoas, leitura, aplicado, identificado, oportunidades e antes/depois')
    import re
    confere(not re.search(r'\bIA\b|intelig[êe]ncia artificial', texto, re.I) and 'próximos passos' not in texto.lower(), 'PDF sem selo de IA e sem próximos passos')
    # Setor sem registro nenhum
    pg.evaluate("gravar('setores', 'ex-vazio', { empresaId: 'exemplo', nome: 'Marketing', responsavel: '' })"); pg.goto((OUT / 'painel.html').as_uri() + '#sr-ex-vazio'); pg.wait_for_timeout(500)
    pg.evaluate("ia = Object.assign(async () => ({ text: '' }), { json: async () => { throw new Error('não devia chamar'); } }); render(true)"); pg.wait_for_timeout(200)
    pg.click('[data-acao="relLeitura"]'); pg.wait_for_timeout(300)
    confere('Sem registros neste setor' in pg.inner_text('#principal'), 'setor sem registro: avisa e não chama a IA')
    pg.evaluate('delete window.__arquivo'); pg.click('#botao-rel-pdf'); pg.wait_for_function('window.__arquivo', timeout=20000)
    (OUT / 'vazio.pdf').write_bytes(base64.b64decode(pg.evaluate('window.__arquivo.base64')))
    tv = subprocess.run(['pdftotext', str(OUT / 'vazio.pdf'), '-'], capture_output=True, text=True).stdout
    confere('Não preenchido' in tv and 'Nenhum gargalo em aberto' in tv and 'período não preenchido' in tv, 'setor vazio: PDF sai com "não preenchido" e sem quebrar')
    # IA falhando
    pg.evaluate("gravar('diario', 'd-mkt', { empresaId: 'exemplo', setorId: 'ex-vazio', data: '2026-11-10', texto: 'Arte das campanhas sai sem revisão.' })")
    pg.evaluate("window.__iaFalha = true; ia = Object.assign(async () => ({ text: '' }), { json: async () => { throw new Error('x'); } }); render(true)"); pg.wait_for_timeout(200)
    pg.click('[data-acao="relLeitura"]'); pg.wait_for_timeout(400)
    confere('A leitura não saiu' in pg.inner_text('#principal'), 'IA falhou: avisa para tentar de novo ou gerar sem ela')
    # Data errada
    pg.fill('#rel-inicio', '2026-11-20'); pg.fill('#rel-fim', '2026-11-01')
    confere(pg.is_visible('.rel-nao-guardado'), 'mexeu na data: o aviso de mudança não guardada acende na hora')
    pg.click('[data-acao="relGuardar"]'); pg.wait_for_timeout(300)
    confere('fim do período está antes do início' in pg.inner_text('body'), 'fim antes do início: avisa e não guarda')
    # Celular
    pc = ctx.new_page(); pc.set_viewport_size({'width': 390, 'height': 844}); pc.on('pageerror', lambda e: erros.append(str(e)))
    pc.goto((OUT / 'painel.html').as_uri() + '#sr-ex-logistica'); pc.wait_for_timeout(800)
    pc.screenshot(path=str(OUT / '03-celular.png'), full_page=True)
    confere(not erros, 'sem erro de página ' + str(erros[:3]))
    nav.close()
print('\nRESULTADO:', 'tudo certo' if not falhas else f'{len(falhas)} falha(s)')
sys.exit(1 if falhas else 0)
