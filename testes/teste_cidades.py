"""Teste: dia/noite, clima da saúde, galáxia da biblioteca e comando de voz."""
import base64, json, pathlib, sys, glob
from playwright.sync_api import sync_playwright
BASE = pathlib.Path(__file__).parent; HTML = pathlib.Path(sys.argv[1])
SEM = {}
for f in glob.glob(str(BASE / 'dados' / 'vivo/*/*.json')):
    p = pathlib.Path(f); SEM[f'{p.parent.name}/{p.stem}'] = json.loads(p.read_text())
R = lambda d: {k: {'r': v} for k, v in d.items()}
SEM['setores/ex-logistica']['diagnostico'] = {'respostas': R({'logistica1': 'nao', 'logistica2': 'parte', 'logistica3': 'sim'})}
SEM['empresas/exemplo']['logo'] = 'data:image/png;base64,' + base64.b64encode((BASE / 'dados' / 'logo/escura-recorte.png').read_bytes()).decode()
SEM['empresas/sau'] = {'nome': 'Clínica Vida', 'segmento': 'Clínica médica', 'cidade': 'Vitória/ES', 'logo': 'data:image/png;base64,' + base64.b64encode((BASE / 'dados' / 'logo/teste-azul-amarelo.png').read_bytes()).decode()}
SEM['setores/sau-1'] = {'empresaId': 'sau', 'nome': 'Recepção', 'tipo': 'geral', 'diagnostico': {'respostas': R({f'geral{i}': 'sim' for i in range(1, 11)})}}
SEM['empresas/ind'] = {'nome': 'Metalúrgica Capixaba', 'segmento': 'Indústria metalúrgica', 'cidade': 'Serra/ES'}
SEM['setores/ind-1'] = {'empresaId': 'ind', 'nome': 'Produção', 'tipo': 'geral', 'diagnostico': {'respostas': R({f'geral{i}': ('parte' if i % 3 == 0 else 'sim') for i in range(1, 11)})}}
bib = [('b1', 'Conferência de carga no celular', 'logistica', 'metodologia', 'Conferência no papel e falta descoberta pelo cliente.', 'Checklist no celular com resumo do que faltou.'),
       ('b2', 'Inventário rotativo semanal', 'logistica', 'metodologia', 'Estoque não bate com o sistema.', 'Contagem por endereço toda semana, conferência rápida.'),
       ('b3', 'Planilha de demandas do marketing', 'marketing', 'intelligence', 'Demandas chegam pelo corredor e se perdem.', 'Formulário único e planilha de demandas por etapa.'),
       ('b4', 'Conciliação automática do extrato', 'financeiro', 'metodologia', 'Conciliação linha por linha toma horas.', 'Planilha que cruza o extrato com os títulos.'),
       ('b5', 'Pedido do WhatsApp organizado', 'comercial', 'intelligence', 'Pedido digitado duas vezes.', 'Página que transforma a mensagem em pedido pronto.'),
       ('b6', 'Cobrança com lista do dia', 'financeiro', 'metodologia', 'Cobrança liga para quem já pagou.', 'Lista diária a partir do relatório de títulos.')]
for i, ti, tp, og, pr, so in bib: SEM[f'biblioteca/{i}'] = {'titulo': ti, 'tipo': tp, 'origem': og, 'problema': pr, 'solucao': so, 'criadoEm': '2026-10-01T10:00:00Z'}
OUT = BASE / 'saida16'; OUT.mkdir(exist_ok=True)
(OUT / 'pagina.html').write_text("<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><style>body{margin:0}[hidden]{display:none!important}</style></head><body>" + HTML.read_text() + "</body></html>")
falso = (BASE / 'olhar.py').read_text().split('falso = """', 1)[1].split('""" %', 1)[0] % json.dumps(SEM)
falso = falso.replace("const sample = async () => ({ text: 'ok' });", "const sample = async (p, o) => ({ text: 'ok' }); sample.limits = async () => ({});")
erros = []
FASE = sys.argv[2] if len(sys.argv) > 2 else 'tudo'
with sync_playwright() as p:
    nav = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = nav.new_context(viewport={'width': 1440, 'height': 900}); ctx.add_init_script(falso)
    ctx.route('https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js', lambda r: r.fulfill(path=str(BASE / 'node_modules/three/build/three.min.js'), content_type='application/javascript'))
    ctx.route('https://cdn.jsdelivr.net/npm/jspdf**', lambda r: r.abort()); ctx.route('https://cdn.jsdelivr.net/npm/pptx**', lambda r: r.abort()); ctx.route('https://fonts.googleapis.com/**', lambda r: r.abort())
    pg = ctx.new_page()
    pg.on('console', lambda m: erros.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') and 'ERR_' not in m.text else None)
    pg.on('pageerror', lambda e: erros.append(f'pageerror: {e}'))
    U = (OUT / 'pagina.html').as_uri()
    pg.goto(U + '#inicio'); pg.wait_for_timeout(5000)
    if FASE == 'paredes': pg.evaluate('CAMPO.renderer.setPixelRatio(0.35)')
    print(pg.evaluate("""(() => {
      const M = CAMPO.multidao, por = {};
      M.agentes.forEach(a => { const k = a.tipo + ':' + a.estado; por[k] = (por[k]||0) + 1; });
      const ilhas = [...CAMPO.ilhas.values()].map(il => ({ id: il.id, cena: il.dados.cena, pos: [il.pos.x.toFixed(1), il.pos.z.toFixed(1)], postos: il.postos.length + '/' + il.postosLocais.length, visitas: il.visitas.length + '/' + il.visitasLocais.length, portas: il.portas.length + '/' + il.portasLocais.length, interno: il.interno ? il.interno.pontos.length : 0 }));
      const H = M.hall; const hall = Object.fromEntries(Object.entries(H).map(([k, v]) => [k, v.length]));
      return JSON.stringify({ agentes: M.agentes.length, por, ilhas, hall, elev: M.elevadores.length, nav: NAV.n, lim: NAV.lim, calls: CAMPO.renderer.info.render.calls, tris: CAMPO.renderer.info.render.triangles }, null, 1);
    })()"""))
    # Posto, porta e visita: quantos ficaram de fora (não deu para pisar) — e onde
    print(pg.evaluate("""(() => {
      const fora = [];
      CAMPO.ilhas.forEach(il => {
        il.grupo.updateMatrixWorld(true); const m = il.grupo.matrixWorld, v = new THREE.Vector3();
        const ok = (lista) => lista.map(p => { v.set(p.x, 0, p.z).applyMatrix4(m); return { p, x: v.x, z: v.z }; });
        [['posto', il.postosLocais, il.postos], ['visita', il.visitasLocais, il.visitas], ['porta', il.portasLocais, il.portas]].forEach(([nome, loc, mundo]) => {
          loc.forEach(p => { v.set(p.x, 0, p.z).applyMatrix4(m); const achou = mundo.some(q => Math.hypot(q.x - v.x, q.z - v.z) < 0.8); if (!achou) fora.push(il.dados.cena + ' ' + nome + ' ' + p.anim + ' @' + p.x.toFixed(2) + ',' + p.z.toFixed(2)); });
        });
      });
      return 'fora do mapa: ' + (fora.length ? '\\n  ' + fora.join('\\n  ') : 'nenhum');
    })()"""))
    if FASE in ('tudo', 'fotos'):
        pg.screenshot(path=str(OUT / '01-geral-dia.png'))
        pg.evaluate("animarCamera({ alvo: new THREE.Vector3(0, 1.0, 4.5), raio: 24, theta: 0.5, phi: 0.95 }, 10)"); pg.wait_for_timeout(2500); pg.screenshot(path=str(OUT / '02-hall.png'))
        pg.evaluate("animarCamera({ alvo: new THREE.Vector3(5.5, 0.8, 6.5), raio: 9, theta: 0.9, phi: 1.0 }, 10)"); pg.wait_for_timeout(2500); pg.screenshot(path=str(OUT / '03-cafe.png'))
        pg.evaluate("const il=[...CAMPO.ilhas.values()][0]; animarCamera(visaoDaIlha(il), 10)"); pg.wait_for_timeout(2500); pg.screenshot(path=str(OUT / '04-cidade.png'))
        pg.evaluate("const il=[...CAMPO.ilhas.values()][1]; animarCamera(visaoDaIlha(il), 10)"); pg.wait_for_timeout(2500); pg.screenshot(path=str(OUT / '05-cidade2.png'))
        pg.evaluate("animarCamera({ alvo: new THREE.Vector3(0, 6, 0), raio: 30, theta: 0.6, phi: 1.2 }, 10)"); pg.wait_for_timeout(2500); pg.screenshot(path=str(OUT / '06-torre.png'))
        pg.evaluate("CAMPO.horaManual = 'noite'"); pg.wait_for_timeout(9000)
        pg.evaluate("recentrarCampo()"); pg.wait_for_timeout(2500); pg.screenshot(path=str(OUT / '07-geral-noite.png'))
        pg.evaluate("animarCamera({ alvo: new THREE.Vector3(0, 1.0, 4.5), raio: 24, theta: 0.5, phi: 0.95 }, 10)"); pg.wait_for_timeout(2500); pg.screenshot(path=str(OUT / '08-hall-noite.png'))
        print(pg.evaluate("(() => { const M = CAMPO.multidao; return 'noite: visiveis ' + M.agentes.filter(a => a.visivel).length + ' de ' + M.agentes.length + ' · atividade ' + CAMPO.atividade.toFixed(2); })()"))
        pg.evaluate("CAMPO.horaManual = 'dia'"); pg.wait_for_timeout(3000)
    if FASE in ('tudo', 'paredes'):
        # Vigia: a cada meio segundo, ninguém pode estar num quadradinho proibido (parede, cerca, móvel, cidade de outra empresa)
        print(pg.evaluate("""new Promise(res => {
          const M = CAMPO.multidao, ruins = new Map(); let voltas = 0; const ult = new Map(), parado = new Map();
          const id = setInterval(() => {
            M.agentes.forEach((a, i) => {
              if (!a.visivel || a.semNav) return;
              const k = navI(a.x, a.z);
              if (!podePisar(k, a.dono)) ruins.set(i, (a.tipo + ' ' + a.estado + ' @' + a.x.toFixed(2) + ',' + a.z.toFixed(2) + ' livre=' + NAV.livre[k] + ' dono=' + NAV.dono[k] + '/' + a.dono));
              if (a.estado === 'andando') { const u = ult.get(i); if (u && Math.hypot(u[0]-a.x, u[1]-a.z) < 0.01) parado.set(i, (parado.get(i)||0) + 1); else parado.set(i, 0); }
              ult.set(i, [a.x, a.z]);
            });
            if (++voltas >= 120) { clearInterval(id);
              const presos = [...parado.entries()].filter(([, n]) => n >= 20).map(([i]) => { const a = M.agentes[i]; return a.tipo + ' @' + a.x.toFixed(1) + ',' + a.z.toFixed(1) + ' -> ' + (a.destino||[]).map(v=>v.toFixed(1)); });
              const por = {}; M.agentes.forEach(a => { const k = a.tipo + ':' + (a.tarefa ? a.tarefa.tipo : '-') + ':' + a.estado; por[k] = (por[k]||0) + 1; });
              res('dentro de parede: ' + ruins.size + (ruins.size ? '\\n  ' + [...ruins.values()].slice(0, 12).join('\\n  ') : '') + '\\nparados andando (10 s): ' + presos.length + (presos.length ? '\\n  ' + presos.slice(0, 10).join('\\n  ') : '') + '\\n' + JSON.stringify(por));
            }
          }, 500);
        })"""))
    if FASE in ('tudo', 'sim'):
        # Simulação sem desenhar: 200 s de rotina, conferindo parede, gente presa e para onde vão
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
    if FASE in ('tudo', 'ap'):
        # Apresentação: nada de outra empresa (nem gente dela) aparece
        ids = pg.evaluate("[...CAMPO.ilhas.keys()]")
        pg.evaluate(f"iniciarApresentacao('{ids[0]}')"); pg.wait_for_timeout(3500)
        print(pg.evaluate("""(() => { const ap = CAMPO.ap.id, M = CAMPO.multidao; const outros = M.agentes.filter(a => a.visivel && a.il && a.il !== ap).length;
          const emOutra = M.agentes.filter(a => { if (!a.visivel) return false; const d = NAV.dono[navI(a.x, a.z)]; return d && d !== CAMPO.ilhas.get(ap).navDono; }).length;
          const cidades = [...CAMPO.ilhas.values()].filter(il => il.grupo.visible).map(il => il.id);
          return 'apresentação: gente de outras empresas visível = ' + outros + ' · alguém visível dentro de outra cidade = ' + emOutra + ' · cidades visíveis = ' + cidades.join(','); })()"""))
        pg.screenshot(path=str(OUT / '09-apresentacao.png'))
        pg.evaluate("irParaPasso(2)"); pg.wait_for_timeout(3500); pg.screenshot(path=str(OUT / '10-ap-setor.png'))
        pg.evaluate("pararApresentacao()")
    nav.close()
print('ERROS:', *erros[:20], sep='\n  ') if erros else print('sem erros')
