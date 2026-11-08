"""Teste: mapa de saúde, diagnóstico por setor, foto e áudio na anotação."""
import json, pathlib, sys, glob
from playwright.sync_api import sync_playwright
BASE = pathlib.Path(__file__).parent
HTML = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else str(BASE.parent / 'dist' / 'real-forte-sistema.html'))
SEM = {}
for f in glob.glob(str(BASE / 'dados' / 'vivo/*/*.json')):
    p = pathlib.Path(f); SEM[f'{p.parent.name}/{p.stem}'] = json.loads(p.read_text())
OUT = BASE / 'saida19'; OUT.mkdir(exist_ok=True)
(OUT / 'pagina.html').write_text(f"""<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>body{{margin:0}}[hidden]{{display:none!important}}</style></head><body>{HTML.read_text()}</body></html>""")
falso = (BASE / 'olhar.py').read_text().split('falso = """', 1)[1].split('""" %', 1)[0] % json.dumps(SEM)
falso = falso.replace("const sample = async () => ({ text: 'ok' });", "const sample = async (p, o) => { window.__prompts = (window.__prompts || []).concat(p); const t = p.includes('foto tirada na visita') ? 'Caixas no chão do corredor, sem endereço, misturadas com produto de outro cliente.' : 'ok'; if (o && o.onText) o.onText({ text: t, delta: t }); return { text: t }; }; sample.limits = async () => ({ images: { maxCount: 4 } });")
falso = falso.replace("sample.json = async (p) =>", "sample.json = async (p) => { window.__prompts = (window.__prompts || []).concat(p); return (await (async (p) =>")
falso = falso.replace("} : [];\n  dados['config/geral']", "} : [])(p)); };\n  dados['config/geral']")
falso = falso.replace("const mapa = { db, downloads, sample,", "let n = 0; const assets = { upload: async (blob, o) => { n++; window.__uploads = (window.__uploads || []).concat((o && o.type) || blob.type); return { id: ('a' + n).padEnd(32, '0'), url: URL.createObjectURL(blob), sizeBytes: blob.size, contentType: (o && o.type) || blob.type }; }, delete: async () => ({ deleted: true }) };\n  const mapa = { db, downloads, sample, assets,")
erros = []
with sync_playwright() as p:
    nav = p.chromium.launch()
    def nova(w, h, tema):
        ctx = nav.new_context(viewport={'width': w, 'height': h}, color_scheme=tema)
        ctx.add_init_script(falso)
        for url, arq in [('jspdf@2.5.1/dist/jspdf.umd.min.js', 'jspdf/dist/jspdf.umd.min.js'), ('jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js', 'jspdf-autotable/dist/jspdf.plugin.autotable.min.js'), ('pptxgenjs@3.12.0/dist/pptxgen.bundle.js', 'pptxgenjs/dist/pptxgen.bundle.js')]:
            ctx.route('https://cdn.jsdelivr.net/npm/' + url, (lambda a: (lambda r: r.fulfill(path=str(BASE / 'node_modules' / a), content_type='application/javascript')))(arq))
        ctx.route('https://fonts.googleapis.com/**', lambda r: r.abort())
        pg = ctx.new_page()
        pg.on('console', lambda m: erros.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') and 'ERR_FAILED' not in m.text and 'ERR_FILE_NOT_FOUND' not in m.text else None)
        pg.on('pageerror', lambda e: erros.append(f'pageerror: {e}'))
        return pg
    U = (OUT / 'pagina.html').as_uri()
    shot = lambda pg, n, full=False: pg.screenshot(path=str(OUT / f'{n}.png'), full_page=full)
    pg = nova(1440, 920, 'light')
    pg.goto(U + '#sv-ex-logistica'); pg.wait_for_timeout(500)
    pg.set_input_files('#anexo-arquivo', str(BASE / 'teste-arquivo.xlsx')); pg.wait_for_timeout(500)
    pg.select_option('[data-pedido-arquivo="0"]', 'automatizar')
    pg.fill('#nova-nota', 'Planilha de rotas que o Renato monta todo dia na mão.'); pg.dispatch_event('#nova-nota', 'input')
    shot(pg, '01-compositor')
    pg.click('[data-acao="salvarNota"]'); pg.wait_for_timeout(800)
    print('anexo guardado:', pg.evaluate("JSON.stringify(notasDo('ex-logistica')[0].anexos)"), '| tipos enviados:', pg.evaluate('window.__uploads'))
    shot(pg, '02-nota')
    pg.click('[data-acao="baixarAnexo"]'); pg.wait_for_timeout(800)
    import base64
    arq = pg.evaluate('window.__arquivo')
    print('baixou:', arq and arq['filename'], '| idêntico ao original:', arq and base64.b64decode(arq['base64']) == (BASE / 'teste-arquivo.xlsx').read_bytes())
    print('para a IA:', pg.evaluate("JSON.stringify(anotacoesParaTransformar(setorPorId('ex-logistica')).slice(-2))"))
    pg.set_viewport_size({'width': 390, 'height': 844}); pg.wait_for_timeout(300); shot(pg, '03-celular')
    print('erros', erros)
