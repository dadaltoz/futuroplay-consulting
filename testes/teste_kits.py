"""Teste: campo 3D das empresas no Início."""
import base64, json, pathlib, sys, glob
from playwright.sync_api import sync_playwright
BASE = pathlib.Path(__file__).parent; HTML = pathlib.Path(sys.argv[1])
SEM = {}
for f in glob.glob(str(BASE / 'dados' / 'vivo/*/*.json')):
    p = pathlib.Path(f); SEM[f'{p.parent.name}/{p.stem}'] = json.loads(p.read_text())
R = lambda d: {k: {'r': v} for k, v in d.items()}
SEM['setores/ex-logistica']['diagnostico'] = {'respostas': R({'logistica1': 'nao', 'logistica2': 'parte', 'logistica3': 'sim'})}
SEM['setores/ex-comercial']['diagnostico'] = {'respostas': R({'comercial1': 'sim', 'comercial2': 'parte', 'comercial3': 'sim'})}
SEM['setores/ex-financeiro']['diagnostico'] = {'respostas': R({f'financeiro{i}': 'sim' for i in range(1, 11)})}
extras = [('ind', 'Metalúrgica Capixaba', 'Indústria metalúrgica', 'Serra/ES', ['Produção', 'Compras', 'Qualidade']),
          ('var', 'Super Bom Preço', 'Supermercado', 'Vila Velha/ES', ['Frente de caixa', 'Estoque']),
          ('ser', 'Contábil Vitória', 'Serviços contábeis', 'Vitória/ES', ['Fiscal', 'Pessoal', 'Atendimento', 'Diretoria']),
          ('agr', 'Café Montanha', 'Agro: café especial', 'Venda Nova/ES', ['Colheita', 'Armazém']),
          ('con', 'Construtora Horizonte', 'Construção civil', 'Cariacica/ES', ['Obras', 'Suprimentos', 'Financeiro']),
          ('sau', 'Clínica Vida', 'Clínica médica', 'Vitória/ES', ['Recepção', 'Faturamento']),
          ('tec', 'Nuvem Sistemas', 'Tecnologia e software', 'Vitória/ES', ['Suporte', 'Comercial', 'Produto'])]
resp = ['sim', 'parte', 'nao']
for k, (eid, nome, seg, cid, setores) in enumerate(extras):
    SEM[f'empresas/{eid}'] = {'nome': nome, 'segmento': seg, 'cidade': cid, 'criadoEm': '2026-10-01'}
    for j, sn in enumerate(setores):
        sid = f'{eid}-s{j}'
        r = {f'geral{i}': resp[(i + j + k) % 3] if (i + j) % 4 else 'sim' for i in range(1, 6 + j)} if (j + k) % 4 else {}
        SEM[f'setores/{sid}'] = {'empresaId': eid, 'nome': sn, 'tipo': 'geral', 'diagnostico': {'respostas': R(r)}, 'criadoEm': '2026-10-01'}
        if j == 0: SEM[f'gargalos/{sid}-g'] = {'empresaId': eid, 'setorId': sid, 'titulo': 'Retrabalho no ' + sn, 'situacao': 'Aberto', 'criadoEm': '2026-10-02', 'movimentos': []}
        if j == 1: SEM[f'gargalos/{sid}-o'] = {'empresaId': eid, 'setorId': sid, 'tipo': 'oportunidade', 'titulo': 'Painel do ' + sn, 'situacao': 'Aberto', 'criadoEm': '2026-10-02', 'movimentos': []}
OUT = BASE / 'saida17'; OUT.mkdir(exist_ok=True)
(OUT / 'pagina.html').write_text("<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><style>body{margin:0}[hidden]{display:none!important}</style></head><body>" + HTML.read_text() + "</body></html>")
LOGO = 'data:image/png;base64,' + base64.b64encode((BASE / 'dados' / 'logo/escura-recorte.png').read_bytes()).decode()
so = sys.argv[2] if len(sys.argv) > 2 else 'todas'
SEM['empresas/exemplo']['logo'] = LOGO
falso = (BASE / 'olhar.py').read_text().split('falso = """', 1)[1].split('""" %', 1)[0] % json.dumps(SEM)
erros = []
with sync_playwright() as p:
    nav = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = nav.new_context(viewport={'width': 1440, 'height': 900}); ctx.add_init_script(falso)
    ctx.route('https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js', lambda r: r.fulfill(path=str(BASE / 'node_modules/three/build/three.min.js'), content_type='application/javascript'))
    ctx.route('https://cdn.jsdelivr.net/npm/jspdf**', lambda r: r.abort()); ctx.route('https://cdn.jsdelivr.net/npm/pptx**', lambda r: r.abort()); ctx.route('https://fonts.googleapis.com/**', lambda r: r.abort())
    pg = ctx.new_page()
    pg.on('console', lambda m: erros.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') and 'ERR_' not in m.text else None)
    pg.on('pageerror', lambda e: erros.append(f'pageerror: {e}'))
    pg.goto((OUT / 'pagina.html').as_uri() + '#inicio'); pg.wait_for_timeout(5000)
    pg.evaluate("CAMPO.horaManual = 'dia'"); pg.wait_for_timeout(3000)
    so = sys.argv[2].split(',') if len(sys.argv) > 2 else None
    lista = pg.evaluate("[...CAMPO.ilhas.values()].map(il => [il.id, il.dados.cena])")
    print(lista, 'calls', pg.evaluate('CAMPO.renderer.info.render.calls'))
    print(pg.evaluate("""(() => { const fora = []; CAMPO.ilhas.forEach(il => { il.grupo.updateMatrixWorld(true); const m = il.grupo.matrixWorld, v = new THREE.Vector3(); [['posto', il.postosLocais, il.postos], ['visita', il.visitasLocais, il.visitas], ['porta', il.portasLocais, il.portas]].forEach(([n, loc, mu]) => loc.forEach(p => { v.set(p.x, 0, p.z).applyMatrix4(m); if (!mu.some(q => Math.hypot(q.x - v.x, q.z - v.z) < 0.8)) fora.push(il.dados.cena + ' ' + n + ' ' + p.anim + ' @' + p.x.toFixed(2) + ',' + p.z.toFixed(2)); })); }); return 'fora do mapa: ' + (fora.join(' | ') || 'nenhum'); })()"""))
    if so and 'sim' in so:
        print(pg.evaluate("""(() => {
          pararCampo();
          const M = CAMPO.multidao; let t = CAMPO.t; const ruins = new Map(), ult = new Map(), presoN = new Map(), presos = new Set();
          const cont = {}, noHall = []; let max = 0, ms = 0, travessias = 0;
          const dentroHall = (a) => a.x > -10 && a.x < 10 && a.z > -3.5 && a.z < 10.5;
          const antes = new Map();
          for (let i = 0; i < 4000; i++) {
            t += 0.05; const t0 = performance.now(); passoMultidao(M, t, 0.05); ms += performance.now() - t0;
            M.agentes.forEach((a, k) => {
              if (!a.visivel) { antes.delete(k); return; }
              if (!a.semNav && !podePisar(navI(a.x, a.z), a.dono)) ruins.set(k, a.tipo + ' ' + a.estado + ' @' + a.x.toFixed(2) + ',' + a.z.toFixed(2));
              // Entrar ou sair do hall só pelas portas (frente: x de -1,5 a 1,5; lados: z de -0,4 a 2,0)
              const d = dentroHall(a), b = antes.get(k);
              if (b != null && b !== d) { const naPorta = (Math.abs(a.z - 10.5) < 0.6 && Math.abs(a.x) < 1.5) || (Math.abs(Math.abs(a.x) - 10) < 0.6 && a.z > -0.4 && a.z < 2.0); if (!naPorta) travessias++; }
              antes.set(k, d);
              if (i % 100 === 0) {
                const u = ult.get(k);
                if (a.estado === 'andando' && u && Math.hypot(u[0] - a.x, u[1] - a.z) < 0.05) { presoN.set(k, (presoN.get(k) || 0) + 1); if (presoN.get(k) >= 2) presos.add(a.tipo + ' @' + a.x.toFixed(1) + ',' + a.z.toFixed(1) + ' -> ' + (a.destino || []).map((v) => v.toFixed(1))); } else presoN.set(k, 0);
                ult.set(k, [a.x, a.z]);
              }
            });
            if (i % 20 === 0) { const n = M.agentes.filter((a) => a.visivel && dentroHall(a)).length; max = Math.max(max, n); noHall.push(n); }
            M.agentes.forEach((a) => { if (a.estado === 'atividade' && a.tarefa && !a._contou) { a._contou = true; const k = a.tipo + ':' + a.tarefa.tipo + (a.lugar && a.lugar.anim ? ':' + a.lugar.anim : ''); cont[k] = (cont[k] || 0) + 1; } if (a.estado !== 'atividade') a._contou = false; });
          }
          const media = noHall.reduce((x, y) => x + y, 0) / noHall.length;
          const conversas = M.agentes.filter((a) => a.ultimaConversa > 0).length;
          return 'sim 200 s: dentro de parede = ' + ruins.size + (ruins.size ? '\\n  ' + [...ruins.values()].slice(0, 10).join('\\n  ') : '') +
            '\\natravessou parede do hall fora da porta = ' + travessias +
            '\\npresos (10 s sem sair do lugar andando) = ' + presos.size + (presos.size ? '\\n  ' + [...presos].slice(0, 10).join('\\n  ') : '') +
            '\\nno hall: média ' + media.toFixed(1) + ' · máximo ' + max + ' · quem já conversou: ' + conversas + ' de ' + M.agentes.length +
            '\\npasso da multidão: ' + (ms / 4000).toFixed(2) + ' ms por quadro' +
            '\\natividades: ' + JSON.stringify(cont);
        })()"""))
        so = ['nada']
    if not so or 'geral' in so:
        pg.evaluate("recentrarCampo()"); pg.wait_for_timeout(2500); pg.screenshot(path=str(OUT / '00-geral.png'))
    for eid, cena in lista:
        if so and cena not in so: continue
        pg.evaluate(f"(() => {{ const il = CAMPO.ilhas.get('{eid}'); const v = visaoDaIlha(il); v.raio = 27; v.phi = 0.86; animarCamera(v, 10); }})()"); pg.wait_for_timeout(2500)
        pg.screenshot(path=str(OUT / f'{cena}.png'))
    nav.close()
print('ERROS:', *erros[:20], sep='\n  ') if erros else print('sem erros')
