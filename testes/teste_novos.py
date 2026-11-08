"""Teste: modo apresentação, cano do setor, comemoração no campo e RF Intelligence por voz."""
import base64, json, pathlib, sys, glob
from playwright.sync_api import sync_playwright
BASE = pathlib.Path(__file__).parent; HTML = pathlib.Path(sys.argv[1])
SEM = {}
for f in glob.glob(str(BASE / 'dados' / 'vivo/*/*.json')):
    p = pathlib.Path(f); SEM[f'{p.parent.name}/{p.stem}'] = json.loads(p.read_text())
R = lambda d: {k: {'r': v} for k, v in d.items()}
SEM['setores/ex-logistica']['diagnostico'] = {'respostas': R({'logistica1': 'nao', 'logistica2': 'parte', 'logistica3': 'sim', 'logistica4': 'parte', 'logistica5': 'sim'})}
SEM['setores/ex-comercial']['diagnostico'] = {'respostas': R({'comercial1': 'sim', 'comercial2': 'parte', 'comercial3': 'sim'})}
SEM['setores/ex-financeiro']['diagnostico'] = {'respostas': R({f'financeiro{i}': 'sim' for i in range(1, 11)})}
SEM['empresas/exemplo']['logo'] = 'data:image/png;base64,' + base64.b64encode((BASE / 'dados' / 'logo/escura-recorte.png').read_bytes()).decode()
SEM['empresas/outra'] = {'nome': 'Outro Cliente Secreto', 'segmento': 'Indústria', 'cidade': 'Serra/ES'}
OUT = BASE / 'saida12'; OUT.mkdir(exist_ok=True)
(OUT / 'pagina.html').write_text("<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><style>body{margin:0}[hidden]{display:none!important}</style></head><body>" + HTML.read_text() + "</body></html>")
falso = (BASE / 'olhar.py').read_text().split('falso = """', 1)[1].split('""" %', 1)[0] % json.dumps(SEM)
falso = falso.replace("const sample = async () => ({ text: 'ok' });", "const sample = async (p, o) => { const t = '## A conferência no papel é a causa mais provável.\\n### Por onde começar\\n- Fato: a carga é conferida numa folha impressa.\\n- Provável: falta endereço no estoque.'; await new Promise(r => setTimeout(r, 1200)); if (o && o.onText) o.onText({ text: t, delta: t }); return { text: t }; }; sample.limits = async () => ({});")
voz = """
const ReconFalso = class { start() { setTimeout(() => { this.onresult && this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'por que a carga sai errada' }], { isFinal: false })] }); }, 300);
  setTimeout(() => { this.onresult && this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'por que a carga sai errada?' }], { isFinal: true })] }); setTimeout(() => this.onend && this.onend(), 200); }, 1200); } abort() {} };
Object.defineProperty(window, 'SpeechRecognition', { value: ReconFalso, configurable: true, writable: true }); Object.defineProperty(window, 'webkitSpeechRecognition', { value: ReconFalso, configurable: true, writable: true });
const falaFalsa = { speaking: false, speak(u) { window.__falado = u.text; setTimeout(() => u.onstart && u.onstart(), 50); let n = 0; const b = setInterval(() => { u.onboundary && u.onboundary({}); if (++n > 8) clearInterval(b); }, 200); setTimeout(() => u.onend && u.onend(), 2500); }, cancel() {}, getVoices() { return []; } };
Object.defineProperty(window, 'speechSynthesis', { value: falaFalsa, configurable: true });
"""
erros = []
with sync_playwright() as p:
    nav = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = nav.new_context(viewport={'width': 1440, 'height': 900})
    ctx.add_init_script(falso); ctx.add_init_script(voz)
    ctx.route('https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js', lambda r: r.fulfill(path=str(BASE / 'node_modules/three/build/three.min.js'), content_type='application/javascript'))
    ctx.route('https://cdn.jsdelivr.net/npm/jspdf**', lambda r: r.abort()); ctx.route('https://cdn.jsdelivr.net/npm/pptx**', lambda r: r.abort()); ctx.route('https://fonts.googleapis.com/**', lambda r: r.abort())
    pg = ctx.new_page()
    pg.on('console', lambda m: erros.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') and 'ERR_' not in m.text else None)
    pg.on('pageerror', lambda e: erros.append(f'pageerror: {e}'))
    U = (OUT / 'pagina.html').as_uri()
    # 1) Cano do setor
    pg.goto(U + '#sg-ex-logistica'); pg.wait_for_timeout(2500); pg.screenshot(timeout=120000, path=str(OUT / '01-cano.png'), clip={'x': 268, 'y': 0, 'width': 1172, 'height': 760})
    print('cano:', pg.evaluate("document.querySelector('.cano') && document.querySelector('.cano').dataset.gargalos"), '| bolinhas:', pg.evaluate("[...CANO.estado.values()][0].bolinhas.length"))
    # Resolve um gargalo: o cano desentope e o campo fica avisado da comemoração
    pg.evaluate("ACOES.etapa('gmvtw8vbjp1nr', { dataset: { situacao: 'Resolvido' } })"); pg.wait_for_timeout(700)
    pg.screenshot(timeout=120000, path=str(OUT / '02-cano-desentope.png'), clip={'x': 268, 'y': 0, 'width': 1172, 'height': 760})
    print('festa pendente:', pg.evaluate('CAMPO.festa'))
    # 2) Comemoração no Início
    pg.evaluate("location.hash = 'inicio'"); pg.wait_for_timeout(2600); pg.screenshot(timeout=120000, path=str(OUT / '03-festa.png'))
    pg.wait_for_timeout(1200); pg.screenshot(timeout=120000, path=str(OUT / '04-festa2.png'))
    print('ilhas:', pg.evaluate('[...CAMPO.ilhas.keys()]'), '| 3D:', pg.evaluate('campoDisponivel()'), '| andares:', pg.evaluate("(CAMPO.ilhas.get('exemplo') && CAMPO.ilhas.get('exemplo').setores.get('ex-logistica').andares.length)"))
    pg.wait_for_timeout(5000)
    # 3) Modo apresentação
    pg.evaluate("location.hash = 'ap-exemplo'"); pg.wait_for_timeout(3200)
    print('apresentação:', pg.evaluate("CAMPO.ap && [CAMPO.ap.id, CAMPO.ap.passos.map(p => p.tipo + (p.setorId ? ':' + p.setorId : ''))]"))
    print('outra ilha escondida:', pg.evaluate("CAMPO.ilhas.get('outra').grupo.visible === false"), '| plaquinha escondida:', pg.evaluate("CAMPO.ilhas.get('outra').plaquinha.style.display"), '| body:', pg.evaluate("document.body.className"))
    pg.screenshot(timeout=120000, path=str(OUT / '10-ap-abertura.png'))
    pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(3000); pg.screenshot(timeout=120000, path=str(OUT / '11-ap-empresa.png'))
    pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(3000); pg.screenshot(timeout=120000, path=str(OUT / '12-ap-setor.png'))
    print('setor da vez:', pg.evaluate("CAMPO.ap.passos[CAMPO.ap.i].setorId"), '| feixe:', pg.evaluate('CAMPO.feixe.visible'))
    pg.evaluate("irParaPasso(CAMPO.ap.passos.length - 1)"); pg.wait_for_timeout(3600); pg.screenshot(timeout=120000, path=str(OUT / '13-ap-final.png'))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(800)
    print('depois do Esc:', pg.evaluate('location.hash'), '| ap:', pg.evaluate('CAMPO.ap'), '| body:', pg.evaluate("document.body.className"))
    # 4) RF Intelligence por voz
    pg.evaluate("location.hash = 'ia-s-ex-logistica'"); pg.wait_for_timeout(800)
    pg.click('[data-acao="iaVoz"]'); pg.wait_for_timeout(700); pg.screenshot(timeout=120000, path=str(OUT / '20-voz-ouvindo.png'), clip={'x': 268, 'y': 300, 'width': 1172, 'height': 600})
    pg.wait_for_timeout(900); pg.screenshot(timeout=120000, path=str(OUT / '21-voz-pensando.png'), clip={'x': 268, 'y': 300, 'width': 1172, 'height': 600})
    pg.wait_for_timeout(1600); pg.screenshot(timeout=120000, path=str(OUT / '22-voz-falando.png'), clip={'x': 268, 'y': 300, 'width': 1172, 'height': 600})
    print('pergunta por voz:', pg.evaluate("UI.chat.map(m => m.papel + ': ' + (m.texto || '').slice(0, 40))"), '| falado:', (pg.evaluate('window.__falado') or '')[:80])
    pg.wait_for_timeout(3000); print('orbe some no fim:', pg.evaluate("document.getElementById('voz-painel').hidden"))
    # Celular: cano e apresentação
    pm = nav.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True); pm.add_init_script(falso); pm.add_init_script(voz)
    pm.route('https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js', lambda r: r.fulfill(path=str(BASE / 'node_modules/three/build/three.min.js'), content_type='application/javascript'))
    pm.route('https://cdn.jsdelivr.net/npm/jspdf**', lambda r: r.abort()); pm.route('https://cdn.jsdelivr.net/npm/pptx**', lambda r: r.abort()); pm.route('https://fonts.googleapis.com/**', lambda r: r.abort())
    qm = pm.new_page(); qm.goto(U + '#sg-ex-logistica'); qm.wait_for_timeout(2000); qm.screenshot(timeout=120000, path=str(OUT / '30-cel-cano.png'))
    qm.goto(U + '#ap-exemplo'); qm.wait_for_timeout(4000); qm.keyboard.press('ArrowRight'); qm.keyboard.press('ArrowRight'); qm.wait_for_timeout(3500); qm.screenshot(timeout=120000, path=str(OUT / '31-cel-ap.png'))
    print('cel largura:', qm.evaluate('document.documentElement.scrollWidth'))
    nav.close()
print('ERROS:', *erros[:20], sep='\n  ') if erros else print('sem erros')
