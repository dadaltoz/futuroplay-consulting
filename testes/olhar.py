"""Uma olhada na página com um armazenamento falso e captura do PDF gerado."""
import base64, json, pathlib, sys
from playwright.sync_api import sync_playwright

BASE = pathlib.Path(__file__).parent
HTML = pathlib.Path(str(BASE.parent / 'dist' / 'real-forte-sistema.html'))
SEMENTES = {k: v for k, v in json.loads((BASE / 'dados' / 'sementes.json').read_text()).items() if not k.startswith(('tarefas/', 'oportunidades/'))}
SEMENTES.update(json.loads((BASE / 'dados' / 'sementes2.json').read_text()))
SEMENTES.update(json.loads((BASE / 'dados' / 'sementes3.json').read_text()))
CONCLUIDO = len(sys.argv) > 1
if CONCLUIDO:
    SEMENTES['empresas/exemplo'].update({'fase': 'concluido', 'concluidoEm': '2026-12-04', 'feedbackGeral': 'O pedido errado praticamente acabou e a equipe parou de redigitar. A conferência no celular virou rotina na expedição.', 'feedbackAutor': 'Diretor comercial', 'autorizaCase': 'nao'})
    SEMENTES['gargalos/ex-g1'].update({'situacao': 'Resolvido', 'depois': 'A vendedora cola a mensagem do pedido e a planilha sai pronta para o faturamento, com o código de cada produto. O caderno de códigos foi aposentado.', 'feedback': 'Agora o pedido sai em um minuto e sem erro de código.', 'horasAntes': '44', 'horasDepois': '6'})
    SEMENTES['empresas/teste2'] = {'nome': 'Transportadora Teste', 'segmento': 'Transporte', 'cidade': 'Vitória/ES', 'fase': 'concluido', 'inicio': '2026-08-01', 'concluidoEm': '2026-09-20', 'autorizaCase': 'sim', 'feedbackGeral': 'A programação de cargas parou de depender de uma pessoa só.', 'feedbackAutor': 'Sócio-diretor'}
    SEMENTES['setores/t2-op'] = {'empresaId': 'teste2', 'nome': 'Operação', 'responsavel': 'Supervisão'}
    SEMENTES['gargalos/t2-g1'] = {'empresaId': 'teste2', 'setorId': 't2-op', 'titulo': 'Programação de cargas na cabeça de uma pessoa', 'observacao': 'Só o supervisor sabe montar a programação do dia.', 'proposta': 'Planilha de programação com passo a passo.', 'situacao': 'Resolvido', 'depois': 'Qualquer pessoa da operação monta a programação seguindo a planilha.', 'feedback': 'Tirei férias pela primeira vez em dois anos.', 'horasAntes': '30', 'horasDepois': '6'}
    SEMENTES['gargalos/ex-g3'].update({'situacao': 'Resolvido', 'depois': 'O conferente marca a carga no celular e o resumo mostra o que faltou antes do caminhão sair.', 'feedback': 'A reclamação de volume faltando parou.', 'horasAntes': '33', 'horasDepois': '8,5'})
OUT = BASE / 'saida'
OUT.mkdir(exist_ok=True)

pagina = f"""<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>:root{{color-scheme:light}}body{{margin:0;font:14px system-ui}}img{{max-width:100%}}[hidden]{{display:none!important}}</style></head><body>{HTML.read_text()}</body></html>"""
(OUT / 'pagina.html').write_text(pagina)

falso = """
(() => {
  const sementes = %s;
  const dados = {};
  for (const [caminho, corpo] of Object.entries(sementes)) dados[caminho] = JSON.parse(JSON.stringify(corpo));
  const ouvintes = [];
  const avisar = () => ouvintes.forEach((o) => o());
  const snapCol = (nome) => { const docs = Object.entries(dados).filter(([k]) => k.split('/')[0] === nome && k.split('/').length === 2).map(([k, v]) => ({ id: k.split('/')[1], exists: true, data: () => v, metadata: {} })); return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: {} }; };
  const refDoc = (caminho) => ({ set: async (c) => { dados[caminho] = c; setTimeout(avisar, 0); }, update: async (c) => { Object.assign(dados[caminho], c); setTimeout(avisar, 0); }, delete: async () => { delete dados[caminho]; setTimeout(avisar, 0); },
    onSnapshot: (next) => { const f = () => next({ id: caminho.split('/')[1], exists: !!dados[caminho], data: () => dados[caminho], metadata: {} }); ouvintes.push(f); setTimeout(f, 20); return () => {}; } });
  const db = { doc: refDoc, collection: (nome) => ({ doc: (id) => refDoc(nome + '/' + id), onSnapshot: (next) => { const f = () => next(snapCol(nome)); ouvintes.push(f); setTimeout(f, 20); return () => {}; } }) };
  const downloads = { save: async ({ filename, data }) => { const buf = data instanceof Blob ? await data.arrayBuffer() : new TextEncoder().encode(data).buffer; let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); window.__arquivo = { filename, base64: btoa(s) }; return { status: 'saved' }; } };
  const sample = async () => ({ text: 'ok' });
  sample.json = async (p) => p.includes('apresentação curta') ? {
    titulo: 'Pedido pronto em um minuto',
    frase_dor: 'Todo pedido do WhatsApp é digitado duas vezes e o erro volta do cliente',
    dores: ['Quatro pessoas copiam pedido na mão várias vezes por dia', 'O código do produto fica num caderno', 'Item trocado só aparece quando o cliente recebe'],
    frase_melhoria: 'A vendedora cola a mensagem e recebe o pedido pronto no formato do faturamento',
    passos: [{titulo: 'Cola a mensagem', texto: 'Copia o pedido do WhatsApp e cola na página'}, {titulo: 'A página organiza', texto: 'Encontra o código de cada produto e monta as linhas'}, {titulo: 'Manda pro faturamento', texto: 'Copia as linhas prontas para a planilha de sempre'}],
    deixa_de_fazer: ['Digitar o mesmo pedido duas vezes', 'Procurar código no caderno', 'Corrigir pedido que voltou'],
    ganha: ['Pedido sai mais rápido', 'Menos devolução por erro', 'Todo mundo usa o mesmo jeito'],
    comparacao: [{hoje: 'Pedido digitado na mão', depois: 'Pedido colado e pronto'}, {hoje: 'Código buscado no caderno', depois: 'Código encontrado sozinho'}, {hoje: 'Erro descoberto pelo cliente', depois: 'Pedido conferido antes de sair'}],
    precisamos: ['A lista de produtos que o setor exporta', 'Dois pedidos de exemplo do WhatsApp'],
    pedido: 'Vamos testar com o comercial na próxima semana?'
  } : [];
  dados['config/geral'] = Object.assign({}, dados['config/geral'], { whatsapp: '27 99999-0000' });
  const mapa = { db, downloads, sample, user: { can: async () => true } };
  window.claude = { use: (n) => Promise.resolve(mapa[n] || null) };
})();
""" % json.dumps(SEMENTES)

erros = []
with sync_playwright() as p:
    nav = p.chromium.launch()
    def nova(largura, altura, tema):
        ctx = nav.new_context(viewport={'width': largura, 'height': altura}, color_scheme=tema, device_scale_factor=1)
        ctx.add_init_script(falso)
        ctx.route('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', lambda r: r.fulfill(path=str(BASE / 'node_modules/jspdf/dist/jspdf.umd.min.js'), content_type='application/javascript'))
        ctx.route('https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js', lambda r: r.fulfill(path=str(BASE / 'node_modules/jspdf-autotable/dist/jspdf.plugin.autotable.min.js'), content_type='application/javascript'))
        ctx.route('https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js', lambda r: r.fulfill(path=str(BASE / 'node_modules/pptxgenjs/dist/pptxgen.bundle.js'), content_type='application/javascript'))
        ctx.route('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js', lambda r: r.fulfill(body='window.QRCode=function(el,o){var c=document.createElement("canvas");c.width=240;c.height=240;el.appendChild(c)};window.QRCode.CorrectLevel={M:0};', content_type='application/javascript'))
        ctx.route('https://fonts.googleapis.com/**', lambda r: r.abort())
        pg = ctx.new_page()
        pg.on('console', lambda m: erros.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: erros.append(f'pageerror: {e}'))
        return pg

    pg = nova(1360, 900, 'light')
    if not CONCLUIDO:
        pg.goto((OUT / 'pagina.html').as_uri() + '#s-ex-comercial'); pg.wait_for_timeout(600)
        pg.screenshot(path=str(OUT / 'e1-setor.png'), full_page=True)
        pg.click('[data-acao="apresentacao"][data-id="ex-g1"]'); pg.wait_for_timeout(600)
        pg.screenshot(path=str(OUT / 'e2-previa-ppt.png'))
        pg.click('#botao-baixar-ppt'); pg.wait_for_timeout(2500)
        arq = pg.evaluate('window.__arquivo')
        if arq: (OUT / 'proposta.pptx').write_bytes(base64.b64decode(arq['base64'])); print('PPT:', arq['filename'])
        else: print('PPT NAO GERADO')
        pg.click('[data-acao="registrarEnvio"]'); pg.wait_for_timeout(500)
        print('situacao g1:', pg.evaluate("S.gargalos.find(g => g.id === 'ex-g1').situacao"), '| msgs:', pg.evaluate("S.conversas.filter(m => m.setorId === 'ex-comercial').length"))
        pg.click('[data-acao="setorAprovou"][data-id="ex-g1"]'); pg.wait_for_timeout(500)
        print('depois de aprovar:', pg.evaluate("S.gargalos.find(g => g.id === 'ex-g1').situacao"), '| empresa:', pg.evaluate("S.empresas.find(e => e.id === 'exemplo').fase"))
        pg.screenshot(path=str(OUT / 'e3-setor-aprovado.png'), full_page=True)
    else:
        pg.goto((OUT / 'pagina.html').as_uri() + '#empresas'); pg.wait_for_timeout(600)
        pg.screenshot(path=str(OUT / 'h1-inicio.png'))
        pg.goto((OUT / 'pagina.html').as_uri() + '#e-exemplo'); pg.wait_for_timeout(500)
        pg.screenshot(path=str(OUT / 'h2-empresa.png'), full_page=True)
        pg.goto((OUT / 'pagina.html').as_uri() + '#cases'); pg.wait_for_timeout(600)
        pg.screenshot(path=str(OUT / 'f1-cases.png'), full_page=True)
        pg.click('#botao-cases'); pg.wait_for_timeout(1500)
        arq = pg.evaluate('window.__arquivo')
        if arq: (OUT / 'cases.pdf').write_bytes(base64.b64decode(arq['base64'])); print('CASES:', arq['filename'])
        pm = nova(390, 844, 'dark')
        pm.goto((OUT / 'pagina.html').as_uri() + '#cases'); pm.wait_for_timeout(600)
        pm.screenshot(path=str(OUT / 'f2-celular-cases.png'), full_page=True)
        print('largura cases celular:', pm.evaluate('document.documentElement.scrollWidth'))
    nav.close()

print('ERROS:', *erros, sep='\n  ') if erros else print('sem erros no console')
