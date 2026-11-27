"""Fotos rápidas do escritório para ajustar o visual (sem o HUD por cima).
Uso: python3 foto_rapida.py nome:x,y,z,raio,theta,phi [nome2:...]   ou   nome:capsula=builder  /  nome:sala=ex-logistica
"""
import pathlib, sys
from playwright.sync_api import sync_playwright
BASE = pathlib.Path(__file__).parent
src = (BASE / 'teste_escritorio.py').read_text()
pre = src.split('FOTOS = [')[0].replace("HTML = pathlib.Path(sys.argv[1]); MODO = sys.argv[2] if len(sys.argv) > 2 else 'tudo'", "HTML = BASE.parent / 'dist' / 'real-forte-sistema.html'; MODO = 'x'")
g = {'__file__': str(BASE / 'teste_escritorio.py')}; exec(pre, g)
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = nav.new_context(viewport={'width': 1300, 'height': 820}); ctx.add_init_script(g['falso']); g['rotas'](ctx)
    pg = ctx.new_page(); pg.on('pageerror', lambda e: print('PAGEERROR', e))
    pg.on('console', lambda m: print('CONSOLE', m.text[:300]) if m.type in ('error', 'warning') and 'ERR_' not in m.text else None)
    pg.goto((g['OUT'] / 'pagina.html').as_uri() + '#inicio'); pg.wait_for_timeout(7000)
    pg.evaluate("UI.escritorioEmpresa = 'exemplo'; render(true)"); pg.wait_for_timeout(2500)
    pg.add_style_tag(content='.campo-hud{display:none!important} .lado,#lado,aside.lado{display:none!important} .campo3d{position:fixed!important;inset:0!important;height:100vh!important;border-radius:0!important;z-index:9999}')
    pg.wait_for_timeout(800)
    for arg in sys.argv[1:]:
        nome, v = arg.split(':', 1)
        if v.startswith('capsula='): pg.evaluate(f"verCapsula('{v[8:]}'); CAM.anim && (CAM.anim.ms = 1)")
        elif v.startswith('sala='): pg.evaluate(f"verSala('{v[5:]}'); CAM.anim && (CAM.anim.ms = 1)")
        elif v.startswith('js='): pg.evaluate(v[3:])
        else:
            x, y, z, r, th, ph = map(float, v.split(','))
            pg.evaluate(f"CAM.anim = null; CAM.mexeu = true; CAM.alvo.set({x},{y},{z}); CAM.raio = {r}; CAM.theta = {th}; CAM.phi = {ph};")
        pg.wait_for_timeout(1200)
        pg.screenshot(path=str(g['OUT'] / f'r-{nome}.png'), timeout=120000)
    nav.close()
