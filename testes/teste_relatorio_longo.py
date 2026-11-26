"""Relatório com textos longos (do tamanho do Marketing da Elson's): nenhum título, nome ou função pode sair
pela metade, e não pode sobrar página quase vazia. uso: python3 teste_relatorio_longo.py [html]  (saída em testes/saida25)"""
import json, pathlib, sys, glob, base64, subprocess, re
from playwright.sync_api import sync_playwright
BASE = pathlib.Path(__file__).parent
HTML = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else str(BASE.parent / 'dist' / 'real-forte-sistema.html'))
OUT = BASE / 'saida25'; OUT.mkdir(exist_ok=True)
for f in OUT.glob('pdf-*.png'): f.unlink()
SEM = {}
for f in glob.glob(str(BASE / 'dados' / 'vivo/*/*.json')):
    q = pathlib.Path(f); SEM[f'{q.parent.name}/{q.stem}'] = json.loads(q.read_text())
SEM['empresas/exemplo']['nome'] = "Elson's Produtos Alimentícios Ltda"
SEM['empresas/exemplo'].pop('logo', None)
TITULOS = ['Registro manual de doações e eventos na planilha compartilhada do Marketing', 'Pedidos de material de ponto de venda feitos por mensagem, sem controle de entrega',
           'Relatório de execução das lojas montado à mão toda semana', 'Artes das campanhas aprovadas por e-mail, sem versão final guardada',
           'Controle de verba de trade marketing espalhado em várias planilhas sem padrão', 'Fotos das lojas sem organização por rota e por data']
HORAS = [(40, 6), (32, 4), (28, 5), (24, 3), (22, 4), (18, 4)]
for i, (t, (a, d)) in enumerate(zip(TITULOS, HORAS)):
    SEM[f'gargalos/mk{i}'] = {'empresaId': 'exemplo', 'setorId': 'ex-mkt', 'titulo': t, 'observacao': 'anotacao crua que nao pode aparecer ' + str(i), 'proposta': f'Ferramenta {i + 1}: planilha padrão com aviso automático e resumo da semana pronto para o gestor.', 'situacao': 'Resolvido', 'horasAntes': str(a), 'horasDepois': str(d), 'criadoEm': '2026-10-10T10:00:00Z', 'atualizadoEm': '2026-11-10T10:00:00Z'}
PESSOAS = [{'nome': 'Lucas Smarssaro Dadalto', 'funcao': 'Estagiário de processos e automação', 'atividades': 'Responsável pela produção de vídeos e pela gestão do conteúdo das redes sociais da empresa, do roteiro à publicação, com acompanhamento dos resultados de cada campanha.'}, {'nome': 'Cassio Henrique de Oliveira Santos', 'funcao': 'Analista de Trade Marketing e Merchandising'}, {'nome': 'Crislayne Aparecida Ferreira', 'funcao': 'Assistente de Marketing'}]
INTRO = ("Este relatório resume o mapeamento dos processos do setor de Marketing da Elson's Produtos Alimentícios Ltda, empresa de distribuição de alimentos. "
         "O tema principal que apareceu foi o trabalho feito à mão e sem padrão, em planilhas, pedidos e registros. Foram identificados 6 gargalos, todos resolvidos, "
         "com 164 horas por mês devolvidas ao setor. O ciclo concentrou o esforço em transformar registros soltos em ferramentas simples que o próprio setor mantém.")
SEM['setores/ex-mkt'] = {'empresaId': 'exemplo', 'nome': 'Marketing', 'responsavel': '', 'passagem': {'inicio': '', 'fim': '', 'pessoas': PESSOAS,
    'leitura': {'introducao': INTRO, 'panorama': 'O setor funcionava com registros manuais espalhados.', 'ruim': 'Registros manuais\nPedidos sem controle', 'melhorar': 'Padronizar planilhas', 'melhorou': 'Relatório semanal automático', 'conclusao': 'O Marketing termina o ciclo com ferramentas simples e mantidas pelo próprio setor.'}}}
(OUT / 'painel.html').write_text(f"""<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>body{{margin:0}}[hidden]{{display:none!important}}</style></head><body>{HTML.read_text()}</body></html>""")
falso = (BASE / 'olhar.py').read_text().split('falso = """', 1)[1].split('""" %', 1)[0] % json.dumps(SEM)
falhas = []
def confere(c, t):
    print(('ok   ' if c else 'FALHA ') + t)
    if not c: falhas.append(t)
junta = lambda t: re.sub(r'\s+', ' ', t).replace('- ', '-').strip()
with sync_playwright() as p:
    nav = p.chromium.launch(); erros = []
    ctx = nav.new_context(viewport={'width': 1440, 'height': 920}); ctx.add_init_script(falso)
    for url, arq in [('jspdf@2.5.1/dist/jspdf.umd.min.js', 'jspdf/dist/jspdf.umd.min.js'), ('jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js', 'jspdf-autotable/dist/jspdf.plugin.autotable.min.js')]:
        ctx.route('https://cdn.jsdelivr.net/npm/' + url, (lambda a: (lambda r: r.fulfill(path=str(BASE / 'node_modules' / a), content_type='application/javascript')))(arq))
    ctx.route('https://fonts.googleapis.com/**', lambda r: r.abort())
    pg = ctx.new_page(); pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.goto((OUT / 'painel.html').as_uri() + '#sr-ex-mkt'); pg.wait_for_timeout(900)
    pg.click('#botao-rel-pdf'); pg.wait_for_function('window.__arquivo', timeout=20000)
    (OUT / 'relatorio.pdf').write_bytes(base64.b64decode(pg.evaluate('window.__arquivo.base64')))
    texto = junta(subprocess.run(['pdftotext', '-raw', str(OUT / 'relatorio.pdf'), '-'], capture_output=True, text=True).stdout)
    for t in TITULOS: confere(junta(t) in texto, f'título inteiro no PDF: {t[:45]}…')
    for pe in PESSOAS: confere(pe['nome'] in texto and pe['funcao'] in texto and junta(pe.get('atividades', '')) in texto, f"nome, função e atribuições inteiros: {pe['nome']}")
    confere("Elson's Produtos Alimentícios Ltda" in texto, 'nome da empresa inteiro (capa sem logo)')
    confere('anotacao crua' not in texto, 'nenhuma anotação crua no PDF')
    subprocess.run(['pdftoppm', '-png', '-r', '60', str(OUT / 'relatorio.pdf'), str(OUT / 'pdf')], check=True)
    # nenhuma página quase vazia (menos de 12% de tinta fora do cabeçalho e rodapé), tirando a última
    from PIL import Image
    paginas = sorted(OUT.glob('pdf-*.png')); vazias = []
    for k, f in enumerate(paginas[:-1]):
        im = Image.open(f).convert('L'); w, h = im.size; meio = im.crop((0, int(h * 0.08), w, int(h * 0.9)))
        # altura usada = do primeiro ao último ponto com tinta (cartão branco com borda conta como usado)
        usadas = [yy for yy in range(meio.size[1]) if any(meio.getpixel((xx, yy)) < 235 for xx in range(0, meio.size[0], 3))]
        if not usadas or (usadas[-1] - usadas[0]) / meio.size[1] < 0.2: vazias.append(f.name)
    confere(not vazias, f'nenhuma página quase vazia no meio do relatório ({len(paginas)} páginas) {vazias}')
    confere(not erros, 'sem erro de página ' + str(erros[:3]))
    nav.close()
print('\nRESULTADO:', 'tudo certo' if not falhas else f'{len(falhas)} falha(s)')
sys.exit(1 if falhas else 0)
