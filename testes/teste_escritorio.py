"""Teste do escritório 3D (Realfort Squad): monta, tira fotos de várias câmeras e confere o básico.

Uso:  python3 teste_escritorio.py ../dist/real-forte-sistema.html [fotos|tudo]
- fotos: só as fotos (visão geral, cápsulas, salas, Central, celular)
- tudo:  fotos + robôs andando sem atravessar móvel + cliques + privacidade na apresentação
As fotos ficam em testes/saida_escritorio/.
"""
import base64, json, pathlib, sys, glob, math
from playwright.sync_api import sync_playwright
BASE = pathlib.Path(__file__).parent; HTML = pathlib.Path(sys.argv[1]); MODO = sys.argv[2] if len(sys.argv) > 2 else 'tudo'
SEM = {}
for f in glob.glob(str(BASE / 'dados' / 'vivo/*/*.json')):
    p = pathlib.Path(f); SEM[f'{p.parent.name}/{p.stem}'] = json.loads(p.read_text())
R = lambda d: {k: {'r': v} for k, v in d.items()}
SEM['setores/ex-logistica']['diagnostico'] = {'respostas': R({'logistica1': 'nao', 'logistica2': 'parte', 'logistica3': 'sim', 'logistica4': 'parte', 'logistica5': 'sim'})}
SEM['setores/ex-comercial']['diagnostico'] = {'respostas': R({'comercial1': 'sim', 'comercial2': 'parte', 'comercial3': 'sim'})}
SEM['setores/ex-financeiro']['diagnostico'] = {'respostas': R({f'financeiro{i}': 'sim' for i in range(1, 11)})}
for sid, nome in [('ex-marketing', 'Marketing'), ('ex-rh', 'Recursos Humanos'), ('ex-diretoria', 'Diretoria'), ('ex-ti', 'Tecnologia')]:
    SEM['setores/' + sid] = {'empresaId': 'exemplo', 'nome': nome, 'responsavel': 'Teste'}
SEM['empresas/exemplo']['logo'] = 'data:image/png;base64,' + base64.b64encode((BASE / 'dados' / 'logo/escura-recorte.png').read_bytes()).decode()
SEM['empresas/outra'] = {'nome': 'Outro Cliente Secreto', 'segmento': 'Indústria', 'cidade': 'Serra/ES'}
SEM['setores/outra-prod'] = {'empresaId': 'outra', 'nome': 'Produção Secreta', 'responsavel': 'X'}
OUT = BASE / 'saida_escritorio'; OUT.mkdir(exist_ok=True)
(OUT / 'pagina.html').write_text("<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><style>body{margin:0}[hidden]{display:none!important}</style></head><body>" + HTML.read_text() + "</body></html>")
falso = (BASE / 'olhar.py').read_text().split('falso = """', 1)[1].split('""" %', 1)[0] % json.dumps(SEM)
erros = []
def rotas(ctx):
    ctx.route('https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js', lambda r: r.fulfill(path=str(BASE / 'node_modules/three/build/three.min.js'), content_type='application/javascript'))
    ctx.route('https://cdn.jsdelivr.net/npm/jspdf**', lambda r: r.abort()); ctx.route('https://cdn.jsdelivr.net/npm/pptx**', lambda r: r.abort()); ctx.route('https://fonts.googleapis.com/**', lambda r: r.abort())
def camera(pg, alvo, raio, theta, phi, espera=900):
    pg.evaluate(f"(() => {{ CAM.anim = null; CAM.mexeu = true; CAM.alvo.set({alvo[0]}, {alvo[1]}, {alvo[2]}); CAM.raio = {raio}; CAM.theta = {theta}; CAM.phi = {phi}; }})()")
    pg.wait_for_timeout(espera)
FOTOS = [
    ('01-geral', (0, 1.6, 1.8), 63, 0, 1.1),
    ('02-lado', (0, 1.6, 1.8), 60, -0.5, 1.1),
    ('03-salinhas', (0, 1.6, 4), 20, 0, 1.2),
    ('04-builder', None, 0, 0, 0),
    ('05-central', (0, 3.8, -3), 11, 0, 1.15),
    ('06-salas', (0, 6.0, -11), 18, 0, 1.12),
    ('07-sala-perto', None, 0, 0, 0),
    ('08-lounge', (0, 0.8, 12.4), 11, 0.3, 1.1),
]
with sync_playwright() as p:
    exe = '/opt/pw-browsers/chromium' if pathlib.Path('/opt/pw-browsers/chromium').exists() else None   # navegador já instalado na máquina, se houver
    nav = p.chromium.launch(executable_path=exe, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = nav.new_context(viewport={'width': 1440, 'height': 900}); ctx.add_init_script(falso); rotas(ctx)
    pg = ctx.new_page()
    pg.on('console', lambda m: erros.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') and 'ERR_' not in m.text else None)
    pg.on('pageerror', lambda e: erros.append(f'pageerror: {e}'))
    U = (OUT / 'pagina.html').as_uri()
    pg.goto(U + '#inicio'); pg.wait_for_timeout(9000)
    print('3D:', pg.evaluate('campoDisponivel()'), '| iniciado:', pg.evaluate('CAMPO.iniciado'), '| pós:', pg.evaluate('POS.ativo'), '| salas:', pg.evaluate('CAMPO.salas && [...CAMPO.salas.keys()]'))
    print('desenhos por quadro:', pg.evaluate('CAMPO.renderer.info.render.calls'), '| triângulos:', pg.evaluate('CAMPO.renderer.info.render.triangles'))
    for nome, alvo, raio, th, ph in FOTOS:
        if nome == '04-builder': pg.evaluate("verCapsula('builder'); CAM.anim && (CAM.anim.ms = 1)"); pg.wait_for_timeout(900)
        elif nome == '07-sala-perto': pg.evaluate("verSala('ex-logistica'); CAM.anim && (CAM.anim.ms = 1)"); pg.wait_for_timeout(900)
        else: camera(pg, alvo, raio, th, ph)
        pg.screenshot(path=str(OUT / f'{nome}.png'), timeout=120000)
    if MODO == 'tudo':
        # robôs: ninguém dentro de móvel (casa ocupada do mapa) depois de um tempo andando
        pg.evaluate("recentrarCampo()"); pg.wait_for_timeout(1000)
        presos = []
        for k in range(10):
            pg.wait_for_timeout(2500)
            r = pg.evaluate("[...CAMPO.robos.values()].filter(r => r.id !== 'atlas' && r.caminho && !(r.voos && r.voos.has(r.i)) && !livreEm(r.g.position.x, r.g.position.z)).map(r => r.id + '@' + r.g.position.x.toFixed(1) + ',' + r.g.position.z.toFixed(1))")
            presos += r
        print('andando dentro de móvel ou parede (amostras):', presos[:10])
        print('atividades:', pg.evaluate("[...CAMPO.robos.values()].map(r => r.id + ':' + textoDoEstado(r))"))
        pg.screenshot(path=str(OUT / '10-vida.png'), timeout=120000)
        # cartão do robô
        pg.click('.esc-ag[data-agente="sherlock"]'); pg.wait_for_timeout(600)
        print('cartão:', pg.evaluate("!document.querySelector('.esc-cartao').hidden"), pg.evaluate("document.querySelector('.esc-cartao h3').textContent"))
        pg.screenshot(path=str(OUT / '11-cartao.png'), timeout=120000)
        # pedido ao Atlas: Sherlock lê o maior gargalo do painel; Pixel fica aguardando a ferramenta
        pg.click('.esc-fechar'); pg.click('.esc-comando input'); pg.wait_for_timeout(1200)
        print('ouvindo ao clicar na barra:', pg.evaluate("[...CAMPO.robos.values()].map(r => estadoDoRobo(r))[1]"))
        pg.screenshot(path=str(OUT / '15-ouvindo-barra.png'), timeout=120000)
        pg.fill('.esc-comando input', 'Sherlock, qual o maior gargalo da empresa?'); pg.press('.esc-comando input', 'Enter'); pg.wait_for_timeout(2500)
        pg.screenshot(path=str(OUT / '16-pedido.png'), timeout=120000)
        print('chamados:', pg.evaluate("CAMPO.pedido && CAMPO.pedido.agentes"), '| fala:', pg.evaluate("CAMPO.falaAtlas && CAMPO.falaAtlas.texto"))
        pg.wait_for_timeout(16000)
        print('Sherlock:', pg.evaluate("CAMPO.robos.get('sherlock').tarefa && CAMPO.robos.get('sherlock').tarefa.etapa"), '| fala:', pg.evaluate("CAMPO.falaAtlas && CAMPO.falaAtlas.texto"))
        pg.evaluate("verCapsula('sherlock'); CAM.anim && (CAM.anim.ms = 1)"); pg.wait_for_timeout(1000); pg.screenshot(path=str(OUT / '17-sherlock-trabalhando.png'), timeout=120000)
        pg.fill('.esc-comando input', 'faça um post bonito para o instagram'); pg.press('.esc-comando input', 'Enter'); pg.wait_for_timeout(18000)
        print('Pixel:', pg.evaluate("CAMPO.robos.get('pixel').tarefa && CAMPO.robos.get('pixel').tarefa.etapa"), '| fala:', pg.evaluate("CAMPO.falaAtlas && CAMPO.falaAtlas.texto"))
        pg.evaluate("recentrarCampo()"); pg.wait_for_timeout(1200)
        # ouvindo: todos olham para a câmera
        pg.evaluate("CAMPO.ouvindo = true"); pg.wait_for_timeout(1500); pg.screenshot(path=str(OUT / '12-ouvindo.png'), timeout=120000)
        print('ouvindo:', pg.evaluate("[...CAMPO.robos.values()].map(r => estadoDoRobo(r)).join(',')")); pg.evaluate("CAMPO.ouvindo = false")
        # outra empresa no seletor
        pg.select_option('[data-escolher-empresa]', 'outra'); pg.wait_for_timeout(1500)
        print('salas da outra:', pg.evaluate('[...CAMPO.salas.keys()]'), '| setores de exemplo somem:', pg.evaluate("!CAMPO.salas.has('ex-logistica')"))
        pg.select_option('[data-escolher-empresa]', 'exemplo'); pg.wait_for_timeout(1500)
        # apresentação: só a empresa apresentada
        pg.evaluate("location.hash = 'ap-exemplo'"); pg.wait_for_timeout(2500)
        print('apresentação:', pg.evaluate('CAMPO.ap'), '| salas:', pg.evaluate('[...CAMPO.salas.keys()]'), '| "Secreto" na tela:', pg.evaluate("document.body.innerText.includes('Secreto')"))
        pg.screenshot(path=str(OUT / '13-apresentacao.png'), timeout=120000)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(800); print('Esc volta para:', pg.evaluate('location.hash'))
        # clique numa sala abre o setor
        pg.evaluate("location.hash = 'inicio'"); pg.wait_for_timeout(2000)
        pos = pg.evaluate("(() => { const s = CAMPO.salas.get('ex-logistica'); const v = new THREE.Vector3(s.centro[0], s.y + 1.4, s.centro[1]).project(CAMPO.camera); const r = CAMPO.el.getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; })()")
        pg.mouse.move(pos[0], pos[1]); pg.wait_for_timeout(400); pg.screenshot(path=str(OUT / '14-sala-hover.png'), timeout=120000)
        pg.mouse.click(pos[0], pos[1]); pg.wait_for_timeout(1500); print('clique na sala abriu:', pg.evaluate('location.hash'))
    # celular
    pm = nav.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True); pm.add_init_script(falso); rotas(pm)
    qm = pm.new_page(); qm.on('pageerror', lambda e: erros.append(f'pageerror cel: {e}'))
    qm.goto(U + '#inicio'); qm.wait_for_timeout(9000); qm.evaluate("CAM.anim = null; Object.assign(CAM, visaoGeral())"); qm.wait_for_timeout(800)
    qm.screenshot(path=str(OUT / '20-celular.png'), timeout=120000)
    print('celular largura:', qm.evaluate('document.documentElement.scrollWidth'))
    nav.close()
print('ERROS:', *erros[:20], sep='\n  ') if erros else print('sem erros')
