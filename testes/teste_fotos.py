import sys
exec(open('teste_cidades.py').read().split("FASE = sys.argv[2]")[0])
OUT2 = BASE / 'saida18'; OUT2.mkdir(exist_ok=True)
with sync_playwright() as p:
    nav = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = nav.new_context(viewport={'width': 1440, 'height': 900}); ctx.add_init_script(falso)
    ctx.route('https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js', lambda r: r.fulfill(path=str(BASE / 'node_modules/three/build/three.min.js'), content_type='application/javascript'))
    ctx.route('https://cdn.jsdelivr.net/npm/jspdf**', lambda r: r.abort()); ctx.route('https://cdn.jsdelivr.net/npm/pptx**', lambda r: r.abort()); ctx.route('https://fonts.googleapis.com/**', lambda r: r.abort())
    pg = ctx.new_page(); erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.goto((OUT / 'pagina.html').as_uri() + '#inicio'); pg.wait_for_timeout(4500)
    def foto(nome, cam, espera=2600):
        if cam: pg.evaluate(f"animarCamera({cam}, 10)")
        pg.wait_for_timeout(espera); pg.screenshot(path=str(OUT2 / nome))
    pg.evaluate("(() => { const il = [...CAMPO.ilhas.values()].find(i => i.dados.cena === 'distribuicao'); il.dados.nome = \"Elson's\"; montarMundo([...CAMPO.ilhas.values()]); })()"); pg.wait_for_timeout(2500)
    fotos = [l.split('|') for l in open('fotos.txt').read().strip().splitlines()]
    for hora in sys.argv[2].split(','):
        pg.evaluate(f"CAMPO.horaManual = '{hora}'"); pg.wait_for_timeout(3500)
        for nome, cam in fotos: foto(f'{hora}-{nome}.png', cam)
    print(pg.evaluate("(() => { const M = CAMPO.multidao; const por = {}; M.agentes.forEach(a => { if (a.visivel) por[a.tipo] = (por[a.tipo]||0)+1; }); return JSON.stringify({ por, veiculos: CAMPO.transito.veiculos.map(v => v.tipo + (v.recolhido ? '(rec)' : '') + ':' + v.s.toFixed(0)).join(' '), cenas: [...CAMPO.ilhas.values()].map(i => i.dados.cena) }); })()"))
    print('erros', erros[:5])
    nav.close()
