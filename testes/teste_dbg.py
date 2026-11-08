import sys
exec(open('teste_cidades.py').read().split("FASE = sys.argv[2]")[0])
with sync_playwright() as p:
    nav = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = nav.new_context(viewport={'width': 1440, 'height': 900}); ctx.add_init_script(falso)
    ctx.route('https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js', lambda r: r.fulfill(path=str(BASE / 'node_modules/three/build/three.min.js'), content_type='application/javascript'))
    ctx.route('https://cdn.jsdelivr.net/npm/jspdf**', lambda r: r.abort()); ctx.route('https://cdn.jsdelivr.net/npm/pptx**', lambda r: r.abort()); ctx.route('https://fonts.googleapis.com/**', lambda r: r.abort())
    pg = ctx.new_page(); pg.on('pageerror', lambda e: print('pageerror', e)); pg.on('console', lambda m: print('console', m.type, m.text) if m.type=='error' else None)
    pg.goto((OUT / 'pagina.html').as_uri() + '#inicio'); pg.wait_for_timeout(4000)
    print(pg.evaluate(sys.argv[2]))
    nav.close()
