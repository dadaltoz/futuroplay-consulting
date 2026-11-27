/* =====================================================================
   VIDA — mapa de pisar, caminhos, rotinas livres, pedidos ao Atlas e a animação (jeito de desenho).

   Mapa de pisar: grade de 20 cm sobre a praça. Cabanas, casinhas, palco e móveis marcam as casas
   onde não se passa. Para entrar numa mini sala ou sala, o robô vai até a porta (fora), passa pelo vão
   (via) e segue reto até o lugar. Caminho na praça: A* na grade, depois esticado.

   Rotinas livres (só animação de quem está DISPONÍVEL; nenhuma tarefa inventada): mini sala, sofá,
   café, visitar uma sala da empresa, conversar, passear, olhar o globo, acenar para você.
   A Sala de reunião fica para quando houver colaboração de verdade (ninguém entra lá à toa).

   Pedido ao Atlas: você escreve (ou fala). Todos param e olham para você. O Atlas escolhe quem
   resolve (pelo nome ou pelas palavras do pedido; se não bater, pergunta à IA). O escolhido dá um
   pulinho, vai para a mini sala, senta e põe o fone. Quando o painel já tem a resposta (gargalos,
   números), ela aparece de verdade; quando falta a ferramenta, o robô avisa e o pedido fica anotado.
   ===================================================================== */

const NAV = { passo: 0.2, meio: 44, n: 0, base: null, salas: null, grade: null, folga: 0.3, cx: 0, cz: -10 };
const LUGARES = new Map();
function navIniciar() {
  NAV.n = Math.round(2 * NAV.meio / NAV.passo);
  NAV.base = new Uint8Array(NAV.n * NAV.n); NAV.salas = new Uint8Array(NAV.n * NAV.n); NAV.grade = new Uint8Array(NAV.n * NAV.n);
  // bordas dos andares, laterais das rampas e das escadas, e o que fica fora do salão
  for (let j = 0; j < NAV.n; j++) for (let i = 0; i < NAV.n; i++) { const [x, z] = centroDaCasa(i, j); if (foraDoMapa(x, z)) NAV.base[j * NAV.n + i] = 1; }
}
const casaDe = (x, z) => [Math.floor((x - NAV.cx + NAV.meio) / NAV.passo), Math.floor((z - NAV.cz + NAV.meio) / NAV.passo)];
const centroDaCasa = (i, j) => [NAV.cx - NAV.meio + (i + 0.5) * NAV.passo, NAV.cz - NAV.meio + (j + 0.5) * NAV.passo];
function marcar(camada, x0, z0, x1, z1, dentro) {
  const M = camada === 'salas' ? NAV.salas : NAV.base; if (!M) return;
  const [i0, j0] = casaDe(Math.min(x0, x1), Math.min(z0, z1)), [i1, j1] = casaDe(Math.max(x0, x1), Math.max(z0, z1));
  for (let j = Math.max(0, j0); j <= Math.min(NAV.n - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(NAV.n - 1, i1); i++) { const [x, z] = centroDaCasa(i, j); if (dentro(x, z)) M[j * NAV.n + i] = 1; }
}
// Caixa girada (largura no x local, fundo no z local) mais a folga do corpo
function navCaixa(camada, cx, cz, w, d, ang) {
  const f = NAV.folga, hw = w / 2 + f, hd = d / 2 + f, c = Math.cos(ang || 0), s = Math.sin(ang || 0), R = Math.hypot(hw, hd);
  marcar(camada, cx - R, cz - R, cx + R, cz + R, (x, z) => { const dx = x - cx, dz = z - cz; return Math.abs(dx * c - dz * s) <= hw && Math.abs(dx * s + dz * c) <= hd; });
}
function navCirculo(camada, cx, cz, r) { const R = r + NAV.folga; marcar(camada, cx - R, cz - R, cx + R, cz + R, (x, z) => Math.hypot(x - cx, z - cz) <= R); }
function navCombinar() { for (let k = 0; k < NAV.grade.length; k++) NAV.grade[k] = NAV.base[k] | NAV.salas[k]; }
function navLimparSalas() { NAV.salas.fill(0); [...LUGARES.values()].filter((l) => l.camada === 'salas').forEach((l) => LUGARES.delete(l.id)); }
const livre = (i, j) => i >= 0 && j >= 0 && i < NAV.n && j < NAV.n && !NAV.grade[j * NAV.n + i];
const livreEm = (x, z) => { const [i, j] = casaDe(x, z); return livre(i, j); };
// Lugar onde um robô pode parar. pose: sentar, olhar, cafe, praca. porta/via: entrada de mini sala ou sala
function novoLugar(camada, id, x, z, ang, pose, extra) {
  const l = Object.assign({ id, camada, x, z, ang, pose, ocupado: '' }, extra || {}); LUGARES.set(id, l); return l;
}
function casaLivrePerto(i, j) {
  if (livre(i, j)) return [i, j];
  for (let r = 1; r < 16; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue; if (livre(i + di, j + dj)) return [i + di, j + dj]; }
  return null;
}
function retoLivre(ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / (NAV.passo * 0.5));
  for (let k = 1; k < n; k++) { const t = k / n; if (!livreEm(ax + (bx - ax) * t, az + (bz - az) * t)) return false; }
  return true;
}
// A* na grade (8 vizinhos, sem cortar quina) e depois o caminho esticado
function acharCaminho(ax, az, bx, bz) {
  const N = NAV.n, ini = casaLivrePerto(...casaDe(ax, az)), fim = casaLivrePerto(...casaDe(bx, bz));
  if (!ini || !fim) return null;
  const k0 = ini[1] * N + ini[0], k1 = fim[1] * N + fim[0];
  const g = new Float32Array(N * N).fill(Infinity), de = new Int32Array(N * N).fill(-1), fechado = new Uint8Array(N * N);
  const heap = [], h = (k) => { const i = k % N, j = (k / N) | 0, dx = Math.abs(i - fim[0]), dz = Math.abs(j - fim[1]); return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz); };
  const por = (k, f) => { heap.push([f, k]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const tirar = () => { const top = heap[0], ult = heap.pop(); if (heap.length) { heap[0] = ult; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
  g[k0] = 0; por(k0, h(k0)); let achou = false, giros = 0;
  while (heap.length && giros++ < 90000) {
    const [, k] = tirar(); if (fechado[k]) continue; fechado[k] = 1; if (k === k1) { achou = true; break; }
    const i = k % N, j = (k / N) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue; const ni = i + di, nj = j + dj; if (!livre(ni, nj)) continue;
      if (di && dj && (!livre(i + di, j) || !livre(i, j + dj))) continue;
      const nk = nj * N + ni, ng = g[k] + (di && dj ? Math.SQRT2 : 1);
      if (ng < g[nk]) { g[nk] = ng; de[nk] = k; por(nk, ng + h(nk)); }
    }
  }
  if (!achou) return null;
  const casas = []; for (let k = k1; k !== -1; k = de[k]) casas.push(centroDaCasa(k % N, (k / N) | 0)); casas.reverse();
  casas[0] = [ax, az]; casas.push([bx, bz]);
  const reto = [casas[0]]; let a = 0;
  while (a < casas.length - 1) { let b = casas.length - 1; while (b > a + 1 && !retoLivre(casas[a][0], casas[a][1], casas[b][0], casas[b][1])) b--; reto.push(casas[b]); a = b; }
  return reto;
}
// Onde não se anda: fora do salão, beiradas entre os andares (menos rampas e escadas), pontas dos andares
function foraDoMapa(x, z) {
  const r = raioDe(x, z), a = Math.abs(anguloDe(x, z)), N = MUNDO.nicho, Me = MUNDO.meio, Al = MUNDO.alto, R = MUNDO.rampa, E = MUNDO.escada;
  if (r > Al.salaR1 + 0.6 || z > 18.5 || a > 64 * GRAU) return true;
  const naRampa = a > R.a0 && a < R.a1 && r > R.r0 - 0.2 && r < Me.r0 + 0.4;
  if (naRampa) return a < R.a0 + 0.012 || a > R.a1 - 0.012;
  if (r > R.r0 && r < Me.r0 + 0.3 && a > N.passo * 3.5 && a < R.a0 + 0.02) return true;      // entre a fileira das mini salas e a rampa
  if (r > R.r0 && r < Me.r0 && a > R.a1) return true;                                           // depois da rampa
  if (r >= Me.r0 - 0.3 && a > Me.meia) return true;                                             // ponta do andar do meio
  if (r >= N.r1 - 0.05 && r < Me.r0 + 0.25 && !naRampa) return true;                            // beirada térreo / andar do meio
  const naEscada = Math.abs(a - E.a) < (E.largura / 2) / Al.r0 && r > E.r0 - 0.3 && r < Al.r0 + 0.4;
  if (naEscada) return Math.abs(a - E.a) > (E.largura / 2 - 0.25) / Al.r0;
  if (r > Al.r0 - 0.35 && r < Al.r0 + 0.3) return true;                                         // beirada andar do meio / de cima
  if (r >= Al.r0 && a > Al.meia - 0.01) return true;                                            // ponta do andar de cima
  return false;
}
// Altura do chão: térreo, rampas, andar do meio (com o palco do Atlas), escadas e andar de cima
function alturaDoChao(x, z) {
  const r = raioDe(x, z), a = Math.abs(anguloDe(x, z)), Me = MUNDO.meio, Al = MUNDO.alto, R = MUNDO.rampa, E = MUNDO.escada;
  const degrau = (k, n) => Math.min(1, Math.ceil(Math.max(0, k) * n) / n);
  if (r >= Al.r0 && a <= Al.meia + 0.02) return Al.y;
  if (Math.abs(a - E.a) < (E.largura / 2 + 0.2) / Al.r0 && r > E.r0 && r < Al.r0) return Me.y + (Al.y - Me.y) * degrau((r - E.r0) / (Al.r0 - E.r0), 8);
  if (r >= Me.r0 && a <= Me.meia + 0.02) { const [ax, az] = polar(MUNDO.atlas.r, 0); return Me.y + (Math.hypot(x - ax, z - az) < 3.2 ? MUNDO.atlas.palco : 0); }
  if (a > R.a0 && a < R.a1 && r > R.r0 && r < Me.r0) return Me.y * degrau((r - R.r0) / (Me.r0 - R.r0), 9);
  return 0;
}

/* ---------- Robôs ---------- */
const VELOCIDADE = { atlas: 1.1, builder: 1.15, report: 1.25, sherlock: 1.1, fix: 1.4, scout: 1.6, data: 1.25, pixel: 1.35 };
function colocarRobos(cena) {
  CAMPO.robos = new Map();
  AGENTES.forEach((a, k) => {
    const r = montarRobo(a); r.g.scale.setScalar(ESCALA_ROBO); cena.add(r.g); CAMPO.robos.set(a.id, r);
    Object.assign(r, { vel: 0, velMax: VELOCIDADE[a.id] || 1.2, fase: Math.random() * 6, caminho: null, i: 0, atividade: null, lugar: null, saida: null,
      sentar: 0, gesto: null, gestoT: 0, olhar: null, piscaEm: 1 + Math.random() * 3, olharEm: 0, olharAleatorio: null, proxima: 3 + k * 1.6 + Math.random() * 4, balao: null, pulo: null, inclina: 0 });
    // começo do dia: cada um sentado no seu lugar (o Atlas na Central, os outros nas mini salas)
    const l = a.id === 'atlas' ? CAMPO.lugarAtlas : CAMPO.capsulas.get(a.id).lugar;
    sentarNoLugar(r, l, true); r.sentarAlvo = 1; r.giroAlvo = l.ang;
    r.atividade = { tipo: a.id === 'atlas' ? 'central' : 'capsula', ate: a.id === 'atlas' ? Infinity : r.proxima, chegou: true, desde: 0 };
    r.gesto = a.id === 'atlas' ? 'digitar' : 'trabalho';
  });
}
const saidaDe = (l) => (l.porta ? { via: l.via, porta: l.porta, sobrevoar: !!l.sobrevoar } : null);
function sentarNoLugar(r, l, ja) {
  if (r.lugar && r.lugar !== l) r.lugar.ocupado = '';
  r.lugar = l; l.ocupado = r.id; r.saida = saidaDe(l);
  if (ja) { r.g.position.set(l.x, (l.y || 0), l.z); r.g.rotation.y = l.ang; r.sentar = l.pose === 'sentar' ? 1 : 0; }
}
function soltarLugar(r) { if (r.lugar) { r.lugar.ocupado = ''; r.lugar = null; } }
// Manda o robô até um lugar: sai pela porta (se estiver dentro), cruza a praça e entra pela porta do destino
function andarAte(r, l, chegou) {
  const p = r.g.position, pts = [[p.x, p.z]], voos = new Set();
  if (r.saida) { if (r.saida.via) pts.push(r.saida.via); pts.push(r.saida.porta); if (r.saida.sobrevoar) voos.add(pts.length - 1); }
  const de = pts[pts.length - 1], para = l.porta || [l.x, l.z];
  const meio = acharCaminho(de[0], de[1], para[0], para[1]); if (!meio) return false;
  meio.slice(1).forEach((q) => pts.push(q));
  if (l.porta) { if (l.via) pts.push(l.via); pts.push([l.x, l.z]); if (l.sobrevoar) voos.add(pts.length - 1); }
  r.caminho = pts; r.voos = voos; r.i = 1; r.aoChegar = chegou || null; r.saida = null; return true;
}
const robosLivres = () => [...CAMPO.robos.values()].filter((r) => r.id !== 'atlas' && !r.tarefa);
const sorteia = (lista) => lista[Math.floor(Math.random() * lista.length)];
const livresDo = (pref) => [...LUGARES.values()].filter((l) => l.id.startsWith(pref) && !l.ocupado);
// Escolhe a próxima atividade livre (pesos)
function proximaAtividade(r, t) {
  const salas = CAMPO.salas ? [...CAMPO.salas.values()].filter((s) => !s.info.reuniao) : [];
  const opcoes = [['capsula', 22], ['sofa', 13], ['cafe', 11], ['visitar', salas.length ? 15 : 0], ['conversar', 16], ['passear', 12], ['globo', 6], ['acenar', 5]];
  const total = opcoes.reduce((s, o) => s + o[1], 0); let x = Math.random() * total, tipo = 'passear';
  for (const [k, p] of opcoes) { x -= p; if (x <= 0) { tipo = k; break; } }
  if (r.atividade && r.atividade.tipo === tipo && tipo !== 'capsula') tipo = 'passear';
  soltarLugar(r); r.gesto = null; r.olhar = null;
  const ir = (l, tipoA, dur, extra) => {
    if (!l) return false; l.ocupado = r.id; r.lugar = l;
    r.atividade = Object.assign({ tipo: tipoA, ate: Infinity, dur, chegou: false, desde: t }, extra || {});
    if (!andarAte(r, l, () => chegarNoLugar(r, l))) { l.ocupado = ''; r.lugar = null; return false; }
    return true;
  };
  let ok = false;
  if (tipo === 'capsula') ok = ir(CAMPO.capsulas.get(r.id).lugar, 'capsula', 14 + Math.random() * 14);
  else if (tipo === 'sofa') ok = ir(sorteia(livresDo('sofa-')), 'sofa', 10 + Math.random() * 10);
  else if (tipo === 'cafe') ok = ir(sorteia(livresDo('cafe-')), 'cafe', 7 + Math.random() * 4);
  else if (tipo === 'globo') ok = ir(sorteia(livresDo('globo-').concat(livresDo('time-'))), 'globo', 5 + Math.random() * 4);
  else if (tipo === 'visitar') { const s = sorteia(salas); ok = s && ir(sorteia(livresDo('sala:' + s.info.id + ':')), 'visitar', 6 + Math.random() * 4, { sala: s.info.nome }); }
  else if (tipo === 'acenar') { r.atividade = { tipo: 'acenar', ate: t + 2.8, chegou: true }; r.gesto = 'acenar'; r.gestoT = 0; mostrarBalao(r, 'coracao', 2.4); ok = true; }
  else if (tipo === 'conversar') ok = comecarConversa(r, t);
  if (!ok) ok = ir(sorteia(livresDo('praca-')), 'passear', 3 + Math.random() * 4);
  if (!ok) r.atividade = { tipo: 'parado', ate: t + 2, chegou: true };
}
function chegarNoLugar(r, l) {
  const at = r.atividade; if (!at) return;
  at.chegou = true; at.ate = CAMPO.t + (at.dur || 5); at.chegouEm = CAMPO.t;
  r.giroAlvo = l.ang; r.saida = saidaDe(l);
  if (l.pose === 'sentar') r.sentarAlvo = 1; else pular(r, 0.18);
  r.gesto = { capsula: 'trabalho', sofa: 'relaxar', cafe: 'beber', visitar: 'olharTela', globo: 'olharTela', conversar: 'falar' }[at.tipo] || null; r.gestoT = 0;
  if (l.olharPara) r.olhar = new THREE.Vector3(...l.olharPara);
  else if (l.olharAlvo) r.olhar = new THREE.Vector3(l.olharAlvo[0], (l.y || 0) + 1.5, l.olharAlvo[1]);
  if (at.tipo === 'cafe') mostrarBalao(r, 'cafe', 3);
  else if (at.tipo === 'visitar') mostrarBalao(r, Math.random() < 0.5 ? 'ideia' : 'duvida', 2.6);
  else if (at.tipo === 'passear' && Math.random() < 0.35) mostrarBalao(r, 'musica', 2.4);
}
// Conversa: chama um colega livre e os dois se encontram na praça, um de frente para o outro
function comecarConversa(r, t) {
  const cands = robosLivres().filter((o) => o !== r && o.atividade && ['passear', 'parado', 'globo', 'cafe'].includes(o.atividade.tipo) && !o.parceiro);
  if (!cands.length) return false;
  const o = sorteia(cands), ps = livresDo('praca-'); if (!ps.length) return false;
  const p = sorteia(ps), ang = Math.random() * Math.PI * 2, dx = Math.sin(ang) * 0.6, dz = Math.cos(ang) * 0.6;
  if (!livreEm(p.x + dx, p.z + dz) || !livreEm(p.x - dx, p.z - dz)) return false;
  p.ocupado = r.id; const dur = 9 + Math.random() * 6;
  [[r, 1, o], [o, -1, r]].forEach(([x, k, outro]) => {
    soltarLugar(x); x.gesto = null; x.olhar = null; x.parceiro = outro;
    const lx = novoLugar('base', 'conversa-' + x.id, p.x + dx * k, p.z + dz * k, Math.atan2(-dx * k, -dz * k), 'conversa');
    x.lugar = lx; lx.ocupado = x.id;
    x.atividade = { tipo: 'conversar', ate: Infinity, dur, chegou: false, com: outro.a.nome, ponto: p, desde: t, puxou: x === r };
    if (!andarAte(x, lx, () => chegarNoLugar(x, lx))) x.atividade = { tipo: 'parado', ate: t + 1, chegou: true };
  });
  return true;
}
function encerrarAtividade(r) {
  const at = r.atividade;
  if (at && at.tipo === 'conversar') { if (at.ponto) at.ponto.ocupado = ''; const o = r.parceiro; r.parceiro = null; LUGARES.delete('conversa-' + r.id); r.lugar = null; if (o && o.parceiro === r) { o.parceiro = null; o.atividade.ate = Math.min(o.atividade.ate, CAMPO.t + 0.6); } }
  r.sentarAlvo = 0; r.gesto = null; r.olhar = null; r.dormindo = false;
}
// O Atlas fica na Central: digita, olha o telão, às vezes acena para você
function rotinaDoAtlas(r, t) {
  if (CAMPO.atlasFala && t < CAMPO.atlasFala) { r.gesto = 'falar'; r.olhar = CAMPO.camera.position; return; }
  if (t < (r.trocaEm || 0)) return;
  const x = Math.random();
  if (x < 0.55) { r.gesto = 'digitar'; r.olhar = null; r.trocaEm = t + 7 + Math.random() * 6; }
  else if (x < 0.85) { const [ax, az] = polar(MUNDO.atlas.r, 0); r.gesto = 'olharTela'; r.olhar = new THREE.Vector3(ax, MUNDO.meio.y + 2.9, az - 2.4); r.trocaEm = t + 4 + Math.random() * 3; }
  else { r.gesto = 'acenar'; r.olhar = null; r.trocaEm = t + 2.6; mostrarBalao(r, 'coracao', 2.2); }
  r.gestoT = 0;
}
// Balão de desenho em cima da cabeça
function mostrarBalao(r, tipo, dur) {
  const b = r.partes.balao; if (!b) return;
  b.material.map = texBalao(tipo); b.material.needsUpdate = true; b.visible = true;
  r.balao = { tipo, t0: CAMPO.t, ate: CAMPO.t + (dur || 2.5) };
}
function pular(r, altura) { r.pulo = { t0: CAMPO.t, h: altura || 0.25 }; }

/* ---------- Pedido ao Atlas ---------- */
// Quem chamar: pelo nome do agente, ou pelas palavras do pedido (até três)
function quemChamar(texto) {
  const t = normal(texto);
  const porNome = AGENTES.slice(1).filter((a) => new RegExp('\\b' + normal(a.nome) + '\\b').test(t)).map((a) => a.id);
  if (porNome.length) return porNome.slice(0, 3);
  return Object.keys(CHAMADO).filter((id) => CHAMADO[id].test(t)).slice(0, 3);
}
// O que o painel já sabe responder de verdade (sem ferramenta nova): gargalos e números da empresa do escritório
function respostaDoPainel(id, texto) {
  const e = empresaPorId(CAMPO.empresaId); if (!e) return null;
  const t = normal(texto);
  if (id === 'sherlock' && /gargal|problema|trava|pior|maior|causa/.test(t)) {
    const abertos = gargalosDa(e.id).filter((g) => situacaoDe(g) !== 'Resolvido');
    if (!abertos.length) return { texto: `A ${nomeCurto(e)} não tem gargalo aberto no painel.` };
    const peso = (g) => numero(g.horasAntes) || 0;
    const g = abertos.slice().sort((a, b) => peso(b) - peso(a))[0], s = setorPorId(g.setorId);
    return { texto: `o maior gargalo aberto da ${nomeCurto(e)} é “${g.titulo}”${s ? `, em ${s.nome}` : ''}${peso(g) ? `, com ${fmtHoras(peso(g))} h/mês antes da melhoria` : ''}. São ${plural(abertos.length, 'gargalo aberto', 'gargalos abertos')} no total.`, link: '#sg-' + g.setorId };
  }
  if (id === 'data' && /hora|nota|quant|numero|indicador|check|total|resolv/.test(t)) {
    const horas = somaHoras(itensDa(e.id)), ck = checkupDa(e.id), c = contagem(gargalosDa(e.id));
    return { texto: `na ${nomeCurto(e)}, ${horas ? fmtHoras(horas) + ' h/mês devolvidas' : 'nenhuma hora devolvida anotada ainda'}; nota do check-up ${ck.nota == null ? 'ainda sem nota' : ck.nota}; ${plural(c['Resolvido'], 'gargalo resolvido', 'gargalos resolvidos')} e ${plural(gargalosDa(e.id).length - c['Resolvido'], 'aberto', 'abertos')}.`, link: '#ck-' + e.id };
  }
  return null;
}
async function pedirAoAtlas(textoBruto) {
  const texto = String(textoBruto || '').trim(); if (!texto) return;
  CAMPO.ouvindo = false;
  let ids = quemChamar(texto);
  if (!ids.length && typeof ia !== 'undefined' && ia && ia.json) {
    falarAtlas('Deixa eu ver quem do time resolve isso…', 2.5, true);
    try {
      const r = await ia.json(`Você é o Atlas, coordenador de um time de agentes. Escolha quem atende o pedido abaixo.
Agentes: builder (cria empresas, setores, salas e agentes), report (relatórios, PDF, apresentações, planilhas), sherlock (gargalos, causas, desperdícios), fix (abre apps e sites, organiza arquivos, automações), scout (pesquisa na internet, fornecedores, preços), data (cálculos, indicadores, horas, projeções), pixel (design, imagens, campanhas, visual).
Pedido: "${texto.replace(/"/g, "'")}"
Responda só JSON: {"agentes": ["id"], "motivo": "uma frase curta"}. Use de 1 a 3 agentes. Se nenhum servir, devolva lista vazia.`);
      ids = (r && Array.isArray(r.agentes) ? r.agentes : []).map((x) => String(x).toLowerCase()).filter((x) => CHAMADO[x]).slice(0, 3);
    } catch (x) { ids = []; }
  }
  if (!ids.length) { CAMPO.pedido = { texto, agentes: [] }; falarAtlas('Não consegui saber quem chamar. Tente com o nome do agente, por exemplo: “Sherlock, qual o maior gargalo?”', 6); atualizarTelao(); return; }
  CAMPO.pedido = { texto, agentes: ids, quando: CAMPO.t };
  const nomes = ids.map((id) => agentePorId(id).nome);
  const lista = nomes.length > 1 ? nomes.slice(0, -1).join(', ') + ' e ' + nomes[nomes.length - 1] : nomes[0];
  falarAtlas(`Chamei ${lista}. ${ids.length > 1 ? 'Eles já estão indo' : 'Já está indo'} para a mini sala.`, 4.5);
  ids.forEach((id, k) => setTimeout(() => chamarAgente(CAMPO.robos.get(id), texto), 250 + k * 350));
  atualizarTelao();
}
function falarAtlas(texto, dur, pensando) {
  CAMPO.falaAtlas = { texto, ate: CAMPO.t + (dur || 4), pensando: !!pensando }; CAMPO.atlasFala = CAMPO.t + Math.min(3, dur || 3);
  const r = CAMPO.robos && CAMPO.robos.get('atlas'); if (r) mostrarBalao(r, pensando ? 'conversa' : 'ideia', 2.2);
  if (!pensando && typeof dizer === 'function') try { dizer(texto); } catch (x) { /* sem voz */ }
  atualizarFalaAtlas();
}
// O agente chamado: susto feliz, pulinho, olha para você e vai para a mini sala
function chamarAgente(r, texto) {
  if (!r) return;
  encerrarAtividade(r); soltarLugar(r); r.caminho = null;
  r.tarefa = { texto, etapa: 'chamado', desde: CAMPO.t, resposta: respostaDoPainel(r.id, texto) };
  r.atividade = { tipo: 'tarefa', ate: Infinity, chegou: true };
  mostrarBalao(r, 'atencao', 1.6); pular(r, 0.35); r.gesto = 'acenar'; r.gestoT = 0;
  setTimeout(() => {
    if (!r.tarefa) return; r.tarefa.etapa = 'indo'; r.gesto = null;
    const l = CAMPO.capsulas.get(r.id).lugar; l.ocupado = r.id; r.lugar = l;
    r.atividade = { tipo: 'tarefa', ate: Infinity, chegou: false, desde: CAMPO.t };
    const chegou = () => { r.atividade.chegou = true; r.sentarAlvo = 1; r.giroAlvo = l.ang; r.saida = saidaDe(l); comecarTrabalho(r); };
    if (Math.hypot(r.g.position.x - l.x, r.g.position.z - l.z) < 0.3) chegou(); else if (!andarAte(r, l, chegou)) chegou();
  }, 1300);
}
function comecarTrabalho(r) {
  if (!r.tarefa) return;
  r.tarefa.etapa = 'trabalhando'; r.tarefa.comecou = CAMPO.t; r.gesto = 'trabalho'; r.gestoT = 0; mostrarBalao(r, 'fone', 1.6);
  setTimeout(() => {
    if (!r.tarefa || r.tarefa.etapa !== 'trabalhando') return;
    const R = r.tarefa.resposta;
    if (R) { r.tarefa.etapa = 'concluido'; mostrarBalao(r, 'estrela', 3); pular(r, 0.2); falarAtlas(`${r.a.nome}: ${R.texto}`, 10); r.ultimo = { texto: r.tarefa.texto, resultado: R.texto, link: R.link }; }
    else { r.tarefa.etapa = 'aguardando'; mostrarBalao(r, 'duvida', 3); falarAtlas(`${r.a.nome} recebeu o pedido, mas a ferramenta para fazer isso de verdade ainda não está ligada. O pedido fica anotado na mini sala dele.`, 7); }
    if (CAMPO.cartaoDe === r.id) abrirCartao(r.id);
  }, 6500);
}
// Libera o agente (botão do cartão, ou sozinho um tempo depois de concluir)
function dispensarAgente(r) { if (!r) return; r.tarefa = null; r.gesto = 'trabalho'; r.atividade = { tipo: 'capsula', ate: CAMPO.t + 4, chegou: true }; if (CAMPO.pedido && !robosComTarefa().length) { CAMPO.pedido = null; atualizarTelao(); } }
const robosComTarefa = () => [...CAMPO.robos.values()].filter((r) => r.tarefa);
function atualizarTelao() { if (CAMPO.telao) CAMPO.telao.desenhar(); }

// Texto do que o robô está fazendo (cartão e tela do time)
function textoDoEstado(r) {
  if (campoOuvindo()) return 'Prestando atenção em você';
  if (r.tarefa) return { chamado: 'Recebeu um pedido', indo: 'Indo para a mini sala', trabalhando: 'Trabalhando no pedido', concluido: 'Pedido concluído', aguardando: 'Aguardando ferramenta' }[r.tarefa.etapa];
  const at = r.atividade || {}; const indo = r.caminho && !at.chegou;
  if (CAMPO.festaAte && CAMPO.t < CAMPO.festaAte) return 'Comemorando com o time';
  if (r.dormindo) return 'Cochilando no lounge';
  const t = { central: 'Na Central, acompanhando o time', capsula: 'Na mini sala, de olho no computador', sofa: 'Descansando no lounge', cafe: 'Tomando um café', globo: 'Olhando o globo da Central', passear: 'Dando uma volta', acenar: 'Acenando para você', parado: 'Disponível', conversar: 'Conversando com ' + (at.com || 'um colega'), visitar: 'Visitando a sala ' + (at.sala || '') }[at.tipo] || 'Disponível';
  if (indo) return { capsula: 'Voltando para a mini sala', sofa: 'Indo para o lounge', cafe: 'Indo tomar um café', globo: 'Indo até a Central', passear: 'Dando uma volta', conversar: 'Indo conversar com ' + (at.com || 'um colega'), visitar: 'Indo até a sala ' + (at.sala || '') }[at.tipo] || t;
  return t;
}
// Estado no vocabulário do projeto (Disponível, Ouvindo, Caminhando, Trabalhando, Concluído, Aguardando…)
function estadoDoRobo(r) {
  if (campoOuvindo()) return 'Ouvindo';
  if (r.tarefa) return { chamado: 'Ouvindo', indo: 'Caminhando', trabalhando: 'Trabalhando', concluido: 'Concluído', aguardando: 'Aguardando ferramenta' }[r.tarefa.etapa];
  if (r.caminho && r.atividade && !r.atividade.chegou) return 'Caminhando';
  return 'Disponível';
}
// A equipe presta atenção quando você abre o comando, escreve para o Atlas ou liga o microfone
function campoOuvindo() { return !!(CAMPO.ouvindo || (typeof CMD !== 'undefined' && CMD.aberto)); }

/* ---------- Passo de cada quadro ---------- */
function passoDosRobos(t, dt) {
  if (!CAMPO.robos) return;
  const ouvindo = campoOuvindo(), festa = CAMPO.festaAte && t < CAMPO.festaAte, cam = CAMPO.camera.position;
  if (ouvindo && !CAMPO.ouviuEm) { CAMPO.ouviuEm = t; [...CAMPO.robos.values()].forEach((r, i) => setTimeout(() => { mostrarBalao(r, 'atencao', 1.6); pular(r, 0.15); }, i * 70)); }
  if (!ouvindo) CAMPO.ouviuEm = 0;
  CAMPO.robos.forEach((r) => {
    const at = r.atividade;
    if (r.id === 'atlas') rotinaDoAtlas(r, t);
    else if (at && !at.chegou && r.caminho && at.desde != null && t - at.desde > 45) { r.caminho = null; soltarLugar(r); at.chegou = true; at.ate = t; }
    if (r.tarefa && r.tarefa.etapa === 'concluido' && t - r.tarefa.desde > 40) dispensarAgente(r);
    if (r.id !== 'atlas' && !r.tarefa && !ouvindo && !festa && (!at || (at.chegou && t > at.ate))) { if (!r.pausaAte) { encerrarAtividade(r); r.pausaAte = t + 0.4 + Math.random() * 1.4; } else if (t > r.pausaAte) { r.pausaAte = 0; proximaAtividade(r, t); } }
    // balões das rotinas
    if (at && at.chegou && !r.balao && !r.tarefa) {
      if (at.tipo === 'conversar' && at.puxou && r.parceiro && t - (at.ultimoBalao || 0) > 2.3) { at.ultimoBalao = t; const quem = (Math.floor(t / 2.3) % 2) ? r : r.parceiro; mostrarBalao(quem, sorteia(['conversa', 'ideia', 'coracao', 'estrela', 'musica', 'conversa']), 2.0); }
      else if (at.tipo === 'sofa' && at.chegouEm && t - at.chegouEm > 3 && !at.balaoFeito) { at.balaoFeito = true; if (Math.random() < 0.55) { r.dormindo = true; mostrarBalao(r, 'zzz', Math.max(3, at.ate - t - 0.5)); } else mostrarBalao(r, 'musica', 3); }
      else if (at.tipo === 'capsula' && Math.random() < dt * 0.04) mostrarBalao(r, sorteia(['ideia', 'musica']), 2.2);
    }
    // anda (flutua) pelo caminho; para quando a equipe está ouvindo ou comemorando
    const parado = ouvindo || festa || (r.tarefa && r.tarefa.etapa === 'chamado');
    let alvoVel = 0, dirAng = null;
    if (r.caminho && !parado) {
      const p = r.g.position, w = r.caminho[r.i];
      if (w) {
        const dx = w[0] - p.x, dz = w[1] - p.z, d = Math.hypot(dx, dz);
        if (d < 0.1) { r.i++; if (r.i >= r.caminho.length) { r.caminho = null; const f = r.aoChegar; r.aoChegar = null; if (f) f(); } }
        else { dirAng = Math.atan2(dx, dz); const virar = Math.abs(angDif(r.g.rotation.y, dirAng)); alvoVel = r.velMax * (virar > 1.3 ? 0.2 : 1) * Math.min(1, d / 0.4 + 0.35); }
      }
    }
    if (r.sentar > 0.05 && r.caminho) { alvoVel = 0; r.sentarAlvo = 0; }
    r.vel = misturar(r.vel, alvoVel, Math.min(1, dt * 5));
    const giroAntes = r.g.rotation.y;
    if (dirAng != null && r.vel > 0.01) {
      r.g.rotation.y += angDif(r.g.rotation.y, dirAng) * Math.min(1, dt * 6);
      r.g.position.x += Math.sin(r.g.rotation.y) * r.vel * dt; r.g.position.z += Math.cos(r.g.rotation.y) * r.vel * dt;
    } else if (r.giroAlvo != null && !r.caminho) r.g.rotation.y += angDif(r.g.rotation.y, r.giroAlvo) * Math.min(1, dt * 5);
    if ((ouvindo || (r.tarefa && r.tarefa.etapa === 'chamado')) && r.sentar < 0.5) { const a = Math.atan2(cam.x - r.g.position.x, cam.z - r.g.position.z); r.g.rotation.y += angDif(r.g.rotation.y, a) * Math.min(1, dt * 5); }
    r.inclina = misturar(r.inclina, angDif(giroAntes, r.g.rotation.y) / Math.max(dt, 1e-3) * 0.12, Math.min(1, dt * 6));
    const pertoDoLugar = r.lugar && Math.hypot(r.g.position.x - r.lugar.x, r.g.position.z - r.lugar.z) < 0.6;
    let y0 = r.lugar && r.lugar.y != null && (!r.caminho || r.sentar > 0.5) && pertoDoLugar ? r.lugar.y : alturaDoChao(r.g.position.x, r.g.position.z);
    // sobrevoo: entrando ou saindo da mini sala, o robô sobe e passa por cima da mesa (desenho animado pode)
    if (r.caminho && r.voos && r.voos.has(r.i)) { const a0 = r.caminho[r.i - 1], a1 = r.caminho[r.i], tot = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]) || 1, falta = Math.hypot(a1[0] - r.g.position.x, a1[1] - r.g.position.z), q = Math.max(0, Math.min(1, 1 - falta / tot)); y0 += Math.sin(q * Math.PI) * 1.25; }
    r.g.position.y = misturar(r.g.position.y, y0, Math.min(1, dt * 8));
    r.sentar = misturar(r.sentar, r.sentarAlvo != null ? r.sentarAlvo : r.sentar, Math.min(1, dt * 5));
  });
  // espaço pessoal e cumprimento: quem passa perto de outro desvia e dá um tchauzinho
  const lista = [...CAMPO.robos.values()];
  for (let a = 0; a < lista.length; a++) for (let b = a + 1; b < lista.length; b++) {
    const A = lista[a], B = lista[b], pa = A.g.position, pb = B.g.position, dx = pb.x - pa.x, dz = pb.z - pa.z, d = Math.hypot(dx, dz);
    if (d < 1.5 && A.caminho && B.caminho && t - (A.cumprimentou || 0) > 18 && t - (B.cumprimentou || 0) > 18) { A.cumprimentou = B.cumprimentou = t; A.tchau = B.tchau = { ate: t + 1.3 }; A.tchauPara = B; B.tchauPara = A; }
    if (d > 0.7 || d < 1e-4) continue;
    const em = (0.7 - d) * 0.5, ux = dx / d, uz = dz / d, mA = A.caminho ? 1 : 0, mB = B.caminho ? 1 : 0;
    if (mA && livreEm(pa.x - ux * em, pa.z - uz * em)) { pa.x -= ux * em * (mB ? 1 : 2); pa.z -= uz * em * (mB ? 1 : 2); }
    if (mB && livreEm(pb.x + ux * em, pb.z + uz * em)) { pb.x += ux * em * (mA ? 1 : 2); pb.z += uz * em * (mA ? 1 : 2); }
  }
  CAMPO.robos.forEach((r) => animarRobo(r, t, dt, ouvindo, festa));
}

/* ---------- Animação do corpo (procedural, de desenho: flutua, estica e encolhe, pula) ---------- */
const chegarPerto = (o, prop, alvo, k) => { o[prop] += (alvo - o[prop]) * k; };
const saidaElastica = (k) => { const c = 1.70158 + 1; return 1 + c * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2); };
function animarRobo(r, t, dt, ouvindo, festa) {
  const M = r.M, k = Math.min(1, dt * 9), andar = Math.min(1, r.vel / Math.max(0.3, r.velMax * 0.7)), S = r.sentar, voa = 1 - S;
  r.fase += dt * (1.6 + r.vel * 3.0);
  // flutuar: o corpo sobe do chão, balança devagar, e o propulsor acende embaixo
  const alturaVoo = (0.2 + Math.sin(t * 2.2 + r.fase * 0.3) * 0.045) * voa;
  const elevar = (r.lugar && r.lugar.pose === 'sentar' ? Math.max(0, (ASSENTO_H + 0.03) / ESCALA_ROBO - M.perna) : 0) * S;
  let pulo = 0, achata = 0;
  if (r.pulo) { const q = (t - r.pulo.t0) / 0.55; if (q >= 1) r.pulo = null; else { pulo = 4 * r.pulo.h * q * (1 - q); achata = q < 0.15 ? (0.15 - q) * 1.2 : q > 0.85 ? (q - 0.85) * 1.2 : -0.06 * Math.sin(q * Math.PI); } }
  const gestoFesta = festa && S < 0.5;
  if (gestoFesta) pulo += Math.abs(Math.sin(t * 7 + r.fase)) * 0.16;
  r.corpo.position.y = alturaVoo + elevar + pulo;
  r.corpo.position.z = -0.03 * S;
  // estica e encolhe (respiração, flutuação e o pouso do pulo)
  const esp = 1 + Math.sin(t * 4.4 + r.fase) * 0.018 * voa - achata;
  r.corpo.scale.set(1 + (1 - esp) * 0.6, esp, 1 + (1 - esp) * 0.6);
  r.corpo.rotation.z = Math.max(-0.35, Math.min(0.35, -r.inclina));
  const P = r.partes.propulsor; if (P) { P.position.y = r.corpo.position.y * 0.6; P.visible = voa > 0.15; P.scale.setScalar(0.8 + Math.sin(t * 14 + r.fase) * 0.08 + andar * 0.3); }
  r.sombra.scale.setScalar(Math.max(0.4, 1 - alturaVoo * 0.9 - pulo * 0.6));
  // pernas: penduradas balançando no ar; sentado, esticadas para a frente
  r.pernas.forEach((p, i) => chegarPerto(p.rotation, 'x', misturar(0.18 + Math.sin(t * 2.4 + i * 1.3) * 0.1 + andar * 0.35, -1.42, S), k));
  // braços e cabeça conforme o gesto
  const B = r.bracos, alvo = { oz: [-0.22, 0.22], ox: [0.3 * andar + Math.sin(t * 2.2 + 1) * 0.05, 0.3 * andar + Math.sin(t * 2.2 + 2) * 0.05], cx: [-0.25, -0.25], cz: [0, 0], cy: [0, 0], tx: 0.2 * andar };
  let expr = 'normal', olhar = r.olhar, cabX = 0, cabZ = Math.sin(t * 2.6 + r.fase) * 0.05 * andar;
  const gesto = gestoFesta ? 'comemorar' : ouvindo ? 'ouvir' : (r.tarefa && r.tarefa.etapa === 'chamado') ? 'acenar' : r.caminho ? null : r.gesto;
  r.gestoT += dt; const gt = r.gestoT;
  if (gesto === 'trabalho' || gesto === 'digitar') {
    const tipoT = gesto === 'digitar' ? 'digitar' : ({ sherlock: 'lupa', scout: 'binoculo', pixel: 'desenhar', fix: 'consertar', builder: 'apontar', data: 'apontar' }[r.id] || 'digitar');
    const ciclo = (gt % 12) / 12, especial = tipoT !== 'digitar' && ciclo > 0.55;
    if (!especial) { alvo.ox = [-1.0 + Math.sin(t * 14) * 0.08, -1.0 + Math.sin(t * 14 + 2) * 0.08]; alvo.cx = [-0.55, -0.55]; alvo.oz = [-0.2, 0.2]; expr = 'foco'; olhar = null; cabX = 0.26 + Math.sin(t * 7) * 0.03; }
    else if (tipoT === 'lupa') { alvo.ox = [-1.75, -0.9]; alvo.cx = [-1.35, -0.5]; alvo.oz = [0.15, 0.2]; cabX = 0.15 + Math.sin(t * 1.5) * 0.1; expr = 'foco'; }
    else if (tipoT === 'binoculo') { alvo.ox = [-1.95, -1.95]; alvo.cx = [-1.25, -1.25]; alvo.oz = [0.35, -0.35]; cabX = -0.1; olhar = null; }
    else if (tipoT === 'desenhar') { alvo.ox = [-0.85 + Math.sin(t * 3) * 0.12, -0.7]; alvo.cx = [-0.5 + Math.cos(t * 3) * 0.12, -0.9]; alvo.oz = [-0.25, 0.35]; expr = 'feliz'; cabX = 0.3; }
    else if (tipoT === 'consertar') { alvo.ox = [-1.1, -1.0]; alvo.cx = [-0.6, -0.6]; alvo.cy = [Math.sin(t * 6) * 0.6, 0]; expr = 'foco'; cabX = 0.3; }
    else if (tipoT === 'apontar') { alvo.ox = [-1.0, -1.45]; alvo.oz = [-0.2, 0.55]; alvo.cx = [-0.55, -0.15]; cabZ = -0.08; olhar = null; r.olharAleatorio = null; }
    if (r.tarefa && r.tarefa.etapa === 'concluido') expr = 'feliz';
    if (r.tarefa && r.tarefa.etapa === 'aguardando') expr = 'duvida';
  } else if (gesto === 'acenar') {
    alvo.oz = [-2.55, 0.22]; alvo.ox = [-0.25, 0]; alvo.cz = [Math.sin(gt * 10) * 0.5, 0]; alvo.cx = [-0.2, -0.15]; expr = 'feliz'; olhar = CAMPO.camera.position;
    if (S < 0.5 && !r.caminho) r.giroAlvo = Math.atan2(CAMPO.camera.position.x - r.g.position.x, CAMPO.camera.position.z - r.g.position.z);
  } else if (gesto === 'falar') {
    const f = Math.sin(gt * 2.3), q = Math.sin(gt * 1.7 + 1);
    alvo.ox = [-0.5 - Math.max(0, f) * 0.7, -0.4 - Math.max(0, q) * 0.6]; alvo.cx = [-0.9 * Math.max(0, f), -0.8 * Math.max(0, q)]; alvo.oz = [-0.3 - Math.max(0, q) * 0.4, 0.3 + Math.max(0, f) * 0.4];
    expr = Math.sin(gt * 0.9) > 0.2 ? 'feliz' : 'normal'; cabX = Math.sin(gt * 3.1) * 0.08; cabZ = Math.sin(gt * 1.3) * 0.1;
    if (r.parceiro) olhar = r.parceiro.cabeca.getWorldPosition(new THREE.Vector3());
  } else if (gesto === 'beber') {
    const gole = Math.sin(gt * 0.8) > 0.4; alvo.ox = [gole ? -1.4 : -0.75, 0]; alvo.cx = [gole ? -1.9 : -1.3, -0.15]; cabX = gole ? -0.15 : 0; expr = gole ? 'feliz' : 'normal';
  } else if (gesto === 'relaxar') {
    alvo.tx = -0.2; alvo.ox = [-0.5, -0.5]; alvo.cx = [-0.4, -0.4]; alvo.oz = [-0.1, 0.1]; expr = r.dormindo ? 'piscar' : (Math.sin(gt * 0.4) > 0.6 ? 'feliz' : 'normal'); if (r.dormindo) { cabZ = 0.22; cabX = 0.2; olhar = null; r.olharAleatorio = null; }
  } else if (gesto === 'olharTela') {
    if (Math.sin(gt * 0.6) > 0.2) { alvo.ox = [-1.25, 0]; alvo.cx = [-2.0, -0.1]; alvo.oz = [0.25, 0.22]; cabZ = 0.14; }
  } else if (gesto === 'comemorar') {
    alvo.oz = [-2.7, 2.7]; alvo.ox = [-0.2, -0.2]; alvo.cx = [-0.3, -0.3]; expr = 'feliz'; olhar = CAMPO.camera.position;
  } else if (gesto === 'ouvir') {
    expr = 'ouvindo'; olhar = CAMPO.camera.position; alvo.ox = [-0.15, -0.15]; alvo.oz = [-0.35, 0.35];
  }
  // tchauzinho de quem cruza com um colega (um braço só, sem parar de flutuar)
  if (r.tchau && t < r.tchau.ate && !gesto) { alvo.oz[1] = 2.4; alvo.cz[1] = Math.sin(t * 12) * 0.45; expr = 'feliz'; olhar = r.tchauPara ? r.tchauPara.cabeca.getWorldPosition(new THREE.Vector3()) : olhar; }
  if (S > 0.5 && !gesto) { alvo.ox = [-0.6, -0.6]; alvo.cx = [-0.5, -0.5]; }
  B.forEach((b, i) => {
    chegarPerto(b.ombro.rotation, 'x', alvo.ox[i], k); chegarPerto(b.ombro.rotation, 'z', alvo.oz[i], k);
    chegarPerto(b.cotovelo.rotation, 'x', alvo.cx[i], k); chegarPerto(b.cotovelo.rotation, 'z', alvo.cz[i], k); chegarPerto(b.cotovelo.rotation, 'y', alvo.cy[i], k);
  });
  chegarPerto(r.tronco.rotation, 'x', alvo.tx, k);
  // acessórios: fone quando trabalha; xícara no café; binóculo do Scout; paleta do Pixel; halo do Data
  const comFone = gesto === 'trabalho';
  if (r.partes.fone) { const F = r.partes.fone, s0 = misturar(F.scale.x, comFone ? 1 : 0, Math.min(1, dt * 8)); F.scale.setScalar(Math.max(0.001, s0)); F.visible = s0 > 0.03; }
  if (r.partes.xicara) r.partes.xicara.visible = gesto === 'beber';
  if (r.partes.binoculo) { const up = gesto === 'trabalho' && (r.gestoT % 12) / 12 > 0.55 ? 1 : 0; r.binoK = misturar(r.binoK || 0, up, k); r.partes.binoculo.position.set(0, misturar(0.2, M.tronco + 0.06 + M.cab[0] * M.cab[2], r.binoK), misturar(0.2, 0.33, r.binoK)); }
  if (r.partes.paleta) r.partes.paleta.visible = gesto === 'trabalho';
  if (r.partes.halo) { r.partes.halo.rotation.y = t * 1.2; r.partes.halo.position.y = 0.52 + Math.sin(t * 2) * 0.015; }
  if (r.id === 'data') animarPeitoDoData(r, t);
  // balão: aparece com um "pop" e some no fim
  const Bl = r.partes.balao;
  if (r.balao && Bl) {
    const q = t - r.balao.t0, fim = r.balao.ate - t;
    if (fim <= 0) { r.balao = null; Bl.visible = false; }
    else { const e = Math.min(1, q / 0.3), s0 = 0.42 * saidaElastica(e) * Math.min(1, fim / 0.25); Bl.scale.set(s0, s0, 1); Bl.position.set(0.18, r.alturaCabeca + 0.5 + r.corpo.position.y + Math.sin(t * 3) * 0.03, 0); Bl.material.opacity = Math.min(1, fim / 0.25); }
  }
  // cabeça: olha o alvo (ou dá uma olhada em volta de vez em quando)
  if (!olhar && t > r.olharEm) { r.olharEm = t + 1.8 + Math.random() * 3; r.olharAleatorio = Math.random() < 0.35 ? null : { yaw: (Math.random() - 0.5) * 1.5, pitch: (Math.random() - 0.5) * 0.3 }; }
  let yaw = 0, pitch = cabX;
  if (olhar) {
    const cp = r.g.position, ox = olhar.x - cp.x, oz = olhar.z - cp.z, oy = olhar.y - (cp.y + (r.alturaCabeca + r.corpo.position.y) * ESCALA_ROBO);
    yaw = Math.max(-1.25, Math.min(1.25, angDif(r.g.rotation.y, Math.atan2(ox, oz)))); pitch = Math.max(-0.5, Math.min(0.45, -Math.atan2(oy, Math.hypot(ox, oz))));
  } else if (r.olharAleatorio && !gesto && !r.caminho) { yaw = r.olharAleatorio.yaw; pitch = r.olharAleatorio.pitch; }
  else if (r.caminho) { yaw = 0; pitch = 0.05; }
  chegarPerto(r.cabeca.rotation, 'y', yaw, Math.min(1, dt * 5)); chegarPerto(r.cabeca.rotation, 'x', pitch, Math.min(1, dt * 5)); chegarPerto(r.cabeca.rotation, 'z', cabZ + (gesto === 'ouvir' ? 0.1 : 0), Math.min(1, dt * 4));
  if (t > r.piscaEm) { r.piscaAte = t + 0.12; r.piscaEm = t + 2.2 + Math.random() * 3.5; }
  const olhos = r.piscaAte && t < r.piscaAte && expr !== 'feliz' ? 'piscar' : expr;
  mudarRosto(r, olhos, olhar ? Math.max(-1, Math.min(1, yaw / 1.4)) * 0.6 : 0, 0);
}
