"""Teste do painel: RF Sinais lendo a coluna "anexos" (planilha e e-mail), clipe e lista no cartão,
e os links indo para o "o que eu vi" quando o sinal vira gargalo. uso: python3 teste_sinais_anexos.py [html]"""
import json, pathlib, sys, glob
from playwright.sync_api import sync_playwright
BASE = pathlib.Path(__file__).parent
HTML = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else str(BASE.parent / 'dist' / 'real-forte-sistema.html'))
SEM = {}
for f in glob.glob(str(BASE / 'dados' / 'vivo/*/*.json')):
    p = pathlib.Path(f); SEM[f'{p.parent.name}/{p.stem}'] = json.loads(p.read_text())
OUT = BASE / 'saida22'; OUT.mkdir(exist_ok=True)
(OUT / 'pagina.html').write_text(f"""<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>body{{margin:0}}[hidden]{{display:none!important}}</style></head><body>{HTML.read_text()}</body></html>""")
falso = (BASE / 'olhar.py').read_text().split('falso = """', 1)[1].split('""" %', 1)[0] % json.dumps(SEM)
L1 = 'https://drive.google.com/file/d/abc123/view'; L2 = 'https://drive.google.com/file/d/def456/view'
CAB = '\t'.join(['codigo', 'recebido_em', 'empresa_id', 'empresa', 'setor', 'o_que_trava', 'frequencia', 'quanto_atrapalha', 'nome', 'contato', 'anexos'])
PLANILHA = '\n'.join([CAB,
  '\t'.join(['S-AAAA0001', '2026-11-16T10:00:00', 'exemplo', 'Distribuidora Exemplo', 'Logística', 'Caixas no corredor sem endereço.', 'Todo dia', 'Muito', 'Ana', '', f'{L1} (corredor.jpg) | {L2} (rotas.xlsx)']),
  '\t'.join(['S-AAAA0002', '2026-11-16T11:00:00', 'exemplo', 'Distribuidora Exemplo', 'Comercial', 'Pedido chega sem CNPJ.', 'Às vezes', 'Pouco', '', '', '']),
  '\t'.join(['S-AAAA0003', '2026-11-16T12:00:00', 'exemplo', 'Distribuidora Exemplo', 'Comercial', 'Link estranho no anexo.', '', '', '', '', 'javascript:alert(1) (mau.pdf)'])])
ANTIGA = 'S-AAAA0004\t2026-11-16T13:00:00\texemplo\tDistribuidora Exemplo\tLogística\tLinha no formato antigo, sem anexos.\tTodo dia\tMédio\t\t'
EMAIL = 'Novo sinal\nRF-SINAL ' + json.dumps({'codigo': 'S-AAAA0005', 'recebido_em': '2026-11-16T14:00:00', 'empresa_id': 'exemplo', 'empresa': 'Distribuidora Exemplo', 'setor': 'Logística', 'o_que_trava': 'Veio pelo e-mail.', 'anexos': [{'nome': 'nota.pdf', 'url': L1}]}, ensure_ascii=False)
falhas = []
def confere(c, t):
    print(('ok   ' if c else 'FALHA ') + t)
    if not c: falhas.append(t)
with sync_playwright() as p:
    nav = p.chromium.launch(); erros = []
    for tema, w, h in [('light', 1440, 920), ('dark', 390, 844)]:
        ctx = nav.new_context(viewport={'width': w, 'height': h}, color_scheme=tema); ctx.add_init_script(falso)
        ctx.route('https://fonts.googleapis.com/**', lambda r: r.abort()); ctx.route('https://cdn.jsdelivr.net/**', lambda r: r.abort())
        pg = ctx.new_page(); pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto((OUT / 'pagina.html').as_uri() + '#sinais'); pg.wait_for_timeout(900)
        if tema == 'light':
            lidos = pg.evaluate('(t) => lerSinais(t)', PLANILHA)
            confere(len(lidos) == 3, 'planilha nova: lê os 3 sinais')
            confere(lidos[0]['anexos'] == [{'url': L1, 'nome': 'corredor.jpg'}, {'url': L2, 'nome': 'rotas.xlsx'}], 'planilha nova: 2 anexos com nome e link')
            confere(lidos[1]['anexos'] == [] and lidos[2]['anexos'] == [], 'sem anexo e link que não é do Drive: lista vazia')
            confere(pg.evaluate('(t) => lerSinais(t)', ANTIGA)[0]['anexos'] == [], 'linha no formato antigo (sem a coluna): continua lendo')
            confere(pg.evaluate('(t) => lerSinais(t)', EMAIL)[0]['anexos'] == [{'url': L1, 'nome': 'nota.pdf'}], 'e-mail (RF-SINAL): lê os anexos')
        # traz os sinais pela tela, como o consultor faz
        pg.click('[data-acao="sinaisBuscar"]'); pg.fill('#f-sinais', PLANILHA + '\n' + ANTIGA); pg.wait_for_timeout(200); pg.click('#botao-salvar'); pg.wait_for_timeout(700)
        n_clip = pg.locator('.sinal-clipe').count(); links = pg.evaluate("[...document.querySelectorAll('.sinal-anexos a')].map(a => [a.href, a.target, a.textContent])")
        confere(n_clip == 1 and len(links) == 2 and links[0][1] == '_blank' and 'abre no Drive' in links[0][2], f'{tema}: cartão com clipe e 2 anexos que abrem em outra aba')
        pg.locator('.sinal-card', has_text='Caixas no corredor').scroll_into_view_if_needed(); pg.wait_for_timeout(200)
        pg.locator('.sinal-card', has_text='Caixas no corredor').screenshot(path=str(OUT / f'cartao-{tema}.png'))
        if tema == 'light':
            pg.screenshot(path=str(OUT / 'sinais-tela.png'), full_page=True)
            pg.locator('.sinal-card', has_text='Caixas no corredor').locator('[data-acao="sinalVirar"]').click(); pg.wait_for_timeout(300)
            obs = pg.input_value('#f-obs')
            confere('Anexos do sinal:' in obs and f'- corredor.jpg: {L1}' in obs and f'- rotas.xlsx: {L2}' in obs, 'virar gargalo: links dos anexos no "o que eu vi"')
        ctx.close()
    confere(not erros, 'sem erro de página ' + str(erros[:3]))
    nav.close()
print('\nRESULTADO:', 'tudo certo' if not falhas else f'{len(falhas)} falha(s)')
sys.exit(1 if falhas else 0)
