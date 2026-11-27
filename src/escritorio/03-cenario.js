/* =====================================================================
   CENÁRIO — o anfiteatro do Realfort Squad (do jeito da foto de referência), em clima de desenho animado:
   - TÉRREO, na frente: as sete mini salas de coworking dos agentes, abertas, em arco. Cada uma com a
     cor e os objetos da função (obra do Builder, documentos do Report, quadro de pistas do Sherlock,
     ferramentas do Fix, mapas do Scout, gráficos do Data, ateliê do Pixel). Placa com o nome embaixo.
   - Mais na frente ainda: o lounge com sofás laranja, onde o time descansa, e o quiosque de café.
   - ANDAR DO MEIO: a Central Atlas (palco redondo, mesa, globo e telão), com escadas curvas dos lados.
     Nas pontas do andar do meio, salas da empresa.
   - ANDAR DE CIMA: as salas da empresa, com a Sala de reunião no meio.
   - Ao fundo, janelões com a cidade no fim de tarde.
   Tudo é desenhado em arco em volta de um ponto na frente (do lado da câmera): é isso que dá a cara
   de anfiteatro. polar(r, a) dá o ponto no raio r e no ângulo a (0 = bem no meio, positivo = direita).
   ===================================================================== */

const MESA_H = 0.62, ASSENTO_H = 0.4;
const MUNDO = {
  arco: { x: 0, z: 26 },
  nicho: { r0: 21.2, r1: 24.7, w: 4.15, passo: 11.6 * GRAU, h: 2.75 },
  meio: { y: 2.4, r0: 25.0, r1: 33.6, meia: 53 * GRAU },
  alto: { y: 4.8, r0: 33.6, salaR0: 34.9, salaR1: 40.4, meia: 44 * GRAU, h: 2.9 },
  atlas: { r: 29.0, palco: 0.3 },
  rampa: { a0: 44.5 * GRAU, a1: 52.5 * GRAU, r0: 18.4 },
  escada: { a: 11.5 * GRAU, largura: 2.6, r0: 31.3 },
  lounge: { x: 0, z: 12.4 },
  cafe: { x: -12.8, z: 10.6 }
};
const polar = (r, a) => [MUNDO.arco.x + r * Math.sin(a), MUNDO.arco.z - r * Math.cos(a)];
const anguloDe = (x, z) => Math.atan2(x - MUNDO.arco.x, MUNDO.arco.z - z);
const raioDe = (x, z) => Math.hypot(x - MUNDO.arco.x, MUNDO.arco.z - z);
// Grupo girado em volta do centro do arco. frente = true: o +z local aponta para a câmera (as mini salas, z local = -raio);
// frente = false: o +z local aponta para o fundo (salas da empresa, z local = +raio)
function grupoPolar(pai, ang, y, frente) {
  const g = new THREE.Group(); g.position.set(MUNDO.arco.x, y, MUNDO.arco.z); g.rotation.y = frente ? -ang : Math.PI - ang; pai.add(g); return g;
}
// Um grupo posicionado: converte o que é local para o mundo; "padraoLugar" vai junto em cada lugar criado
function contexto(g, phi, ox, oz, padraoLugar) {
  const mundo = (x, z) => [ox + x * Math.cos(phi) + z * Math.sin(phi), oz - x * Math.sin(phi) + z * Math.cos(phi)];
  const base = padraoLugar || {};
  return {
    g, phi, mundo,
    por(obj, x, y, z, rot) { obj.position.set(x, y, z); obj.rotation.y = rot || 0; g.add(obj); return obj; },
    lugar(id, x, z, rot, pose, extra) { const [wx, wz] = mundo(x, z); return novoLugar(base.camada || 'base', id, wx, wz, (rot || 0) + phi, pose, Object.assign({}, base, extra || {})); }
  };
}
const contextoPolar = (g, padrao) => contexto(g, g.rotation.y, MUNDO.arco.x, MUNDO.arco.z, padrao);
// anelSetor e arcoDeitado medem o ângulo a partir do +z; no anfiteatro o ângulo é a partir do -z
const aArco = (a) => Math.PI - a;

const pelePlastica = () => casco(ESC.branco, 0.34);
const couro = (cor) => padrao(cor || ESC.couro, 0.48, 0, { });

/* ---------- Móveis (origem no chão, frente para +z; quem senta fica do lado -z da mesa) ---------- */
function cadeira(cor) {
  const g = new THREE.Group(), c = couro(cor), base = metal(ESC.grafite, 0.4);
  bloco(0.46, 0.08, 0.44, 0.035, c, 0, ASSENTO_H - 0.08, 0, g);
  const encosto = bloco(0.44, 0.46, 0.07, 0.03, c, 0, ASSENTO_H - 0.02, -0.21, g); encosto.rotation.x = -0.12;
  peca(GEO.cil12, base, 0, 0.07, 0, 0.028, ASSENTO_H - 0.15, 0.028, g);
  for (let k = 0; k < 5; k++) { const p = peca(GEO.caixa, base, 0, 0.05, 0, 0.03, 0.025, 0.24, g); p.rotation.y = k * Math.PI * 2 / 5; p.position.set(Math.sin(p.rotation.y) * 0.1, 0.05, Math.cos(p.rotation.y) * 0.1); }
  g.add(sombraNoChao(0.7, 0.7, 0.5));
  return g;
}
function mesaTrabalho(w, d, tampo) {
  const g = new THREE.Group(), lado = metal(ESC.grafite, 0.45);
  bloco(w, 0.04, d, 0.015, tampo || casco(0xf7f7f8, 0.3), 0, MESA_H - 0.04, 0, g);
  bloco(0.04, MESA_H - 0.04, d * 0.9, 0.012, lado, -(w / 2 - 0.06), 0, 0, g);
  bloco(0.04, MESA_H - 0.04, d * 0.9, 0.012, lado, w / 2 - 0.06, 0, 0, g);
  bloco(w - 0.16, 0.3, 0.02, 0.006, padrao(ESC.grafite, 0.5), 0, 0.24, d / 2 - 0.06, g);
  peca(GEO.caixa, luz(ESC.laranja, 2.2), 0, 0.235, d / 2 - 0.045, w - 0.2, 0.012, 0.006, g);   // filete aceso na frente
  g.add(sombraNoChao(w * 1.3, d * 1.6, 0.55));
  return g;
}
// Tela com imagem: o lado aceso olha para +z
function telaPlana(w, h, tex, brilho) {
  const m = new THREE.Mesh(GEO.plano, guardado('tela:' + tex.uuid + ':' + (brilho || 1), () => { const mt = new THREE.MeshBasicMaterial({ map: tex }); mt.color.multiplyScalar(brilho || 1); return mt; }));
  m.scale.set(w, h, 1); return m;
}
function monitor(w, h, tex) {
  const g = new THREE.Group(), preto = padrao(0x16181c, 0.35, 0.3);
  bloco(0.16, 0.012, 0.12, 0.005, metal(0xb8bec6), 0, 0, 0, g);
  peca(GEO.caixa, metal(0xb8bec6), 0, 0, -0.02, 0.03, 0.14, 0.02, g);
  bloco(w, h, 0.025, 0.008, preto, 0, 0.12, -0.02, g);
  const t = telaPlana(w - 0.025, h - 0.025, tex); t.position.set(0, 0.12 + h / 2, -0.036); t.rotation.y = Math.PI; g.add(t);   // a tela olha para quem senta (-z)
  return g;
}
function laptop(tex) {
  const g = new THREE.Group(), al = metal(0xc3c8cf, 0.3);
  bloco(0.34, 0.014, 0.23, 0.006, al, 0, 0, 0, g);
  const tampa = new THREE.Group(); tampa.position.set(0, 0.014, 0.11); tampa.rotation.x = 0.32; g.add(tampa);   // dobradiça do lado de longe de quem usa
  bloco(0.34, 0.22, 0.01, 0.006, al, 0, 0, 0, tampa);
  const t = telaPlana(0.31, 0.19, tex); t.position.set(0, 0.11, -0.006); t.rotation.y = Math.PI; tampa.add(t);
  return g;
}
function estante(w, h, d, s, cores) {
  const g = new THREE.Group(), madeira = padrao(0x2f3238, 0.5, 0.2), n = Math.max(2, Math.round(h / 0.42));
  bloco(0.03, h, d, 0.008, madeira, -w / 2, 0, 0, g); bloco(0.03, h, d, 0.008, madeira, w / 2, 0, 0, g);
  const paleta = cores || [0xd9d3c7, 0x2b2f36, 0xff7a1a, 0x8b929c, 0xf2f3f5, 0x3d556b];
  for (let i = 0; i <= n; i++) {
    const y = i * (h - 0.03) / n; bloco(w, 0.025, d, 0.006, madeira, 0, y, 0, g);
    if (i === n) break;
    let x = -w / 2 + 0.05;
    while (x < w / 2 - 0.08) {
      const r = s();
      if (r < 0.62) { const lw = 0.025 + s() * 0.03, lh = 0.2 + s() * 0.12; peca(GEO.caixa, padrao(paleta[Math.floor(s() * paleta.length)], 0.7), x + lw / 2, y + 0.025, 0, lw, lh, d * 0.8, g); x += lw + 0.004; }
      else if (r < 0.78) { peca(GEO.caixa, padrao(0xc49a6c, 0.8), x + 0.09, y + 0.025, 0, 0.17, 0.13, d * 0.75, g); x += 0.2; }
      else if (r < 0.9) { peca(torneado([[0, 0], [0.04, 0], [0.05, 0.08], [0.03, 0.14], [0, 0.14]], 18), casco(s() > 0.5 ? 0xffffff : 0x2b2f36), x + 0.05, y + 0.025, 0, 1, 1, 1, g); x += 0.12; }
      else x += 0.1 + s() * 0.1;
    }
  }
  return g;
}
// Planta de vaso: folhas compridas juntadas numa peça só
function planta(tam, s, vaso) {
  const g = new THREE.Group(); tam = tam || 1;
  const pv = vaso === 'escuro' ? padrao(0x2b2f36, 0.45) : casco(0xf4f2ee, 0.4);
  peca(torneado([[0, 0], [0.15, 0], [0.19, 0.04], [0.21, 0.36], [0.22, 0.38], [0.2, 0.39], [0, 0.39]], 32), pv, 0, 0, 0, tam, tam, tam, g);
  peca(GEO.cil, padrao(0x3a2a1e, 0.95), 0, 0.37 * tam, 0, 0.19 * tam, 0.01, 0.19 * tam, g);
  const folha = new THREE.PlaneGeometry(0.15, 0.7, 1, 8).translate(0, 0.35, 0), p = folha.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 0.7; p.setZ(i, p.getZ(i) + y * y * 0.32); }   // folha curva para fora
  folha.computeVertexNormals();
  const lista = [], n = 14 + Math.floor(s() * 6), mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < n; i++) {
    const inclina = 0.15 + s() * 0.75, gira = i * 2.39996 + s() * 0.3, k = (0.7 + s() * 0.5) * tam;
    e.set(inclina, gira, 0, 'YXZ'); q.setFromEuler(e);
    mtx.compose(new THREE.Vector3((s() - 0.5) * 0.06, 0.38 * tam, (s() - 0.5) * 0.06), q, new THREE.Vector3(k, k * (0.9 + s() * 0.5), k));
    lista.push(folha.clone().applyMatrix4(mtx));
  }
  const tom = [0xb9d99a, 0xa8cf86, 0xc9e2a6][Math.floor(s() * 3)];
  const mf = guardado('folha:' + tom, () => new THREE.MeshStandardMaterial({ map: texFolha(), color: tom, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.55 }));
  const folhas = new THREE.Mesh(juntarGeometrias(lista), mf); folhas.castShadow = true; folhas.receiveShadow = true; g.add(folhas);
  g.add(sombraNoChao(0.8 * tam, 0.8 * tam, 0.6));
  return g;
}
function sofa(w, cor) {
  const g = new THREE.Group(), tec = padrao(cor || ESC.tecido, 0.92), pe = metal(ESC.grafite);
  bloco(w, 0.18, 0.78, 0.05, tec, 0, 0.07, 0, g);
  const n = Math.max(2, Math.round(w / 0.7));
  for (let i = 0; i < n; i++) bloco((w - 0.36) / n - 0.02, 0.14, 0.6, 0.05, tec, -w / 2 + 0.18 + (i + 0.5) * (w - 0.36) / n, 0.24, 0.06, g);
  bloco(w, 0.44, 0.2, 0.07, tec, 0, 0.22, -0.29, g);
  bloco(0.18, 0.34, 0.78, 0.07, tec, -w / 2 + 0.09, 0.07, 0, g); bloco(0.18, 0.34, 0.78, 0.07, tec, w / 2 - 0.09, 0.07, 0, g);
  [-1, 1].forEach((k) => { const a = bloco(0.36, 0.32, 0.12, 0.06, padrao(ESC.couro, 0.85), k * (w / 2 - 0.42), 0.36, -0.14, g); a.rotation.x = -0.25; a.rotation.z = k * 0.12; });
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => peca(GEO.cil12, pe, a * (w / 2 - 0.08), 0, b * 0.3, 0.02, 0.07, 0.02, g));
  g.add(sombraNoChao(w * 1.25, 1.3, 0.65));
  return g;
}
function mesaRedonda(r, h, tampo) {
  const g = new THREE.Group();
  peca(GEO.cil, tampo || casco(0xf7f7f8, 0.25), 0, h - 0.035, 0, r, 0.035, r, g);
  peca(GEO.cil, metal(ESC.grafite), 0, 0.02, 0, 0.035, h - 0.05, 0.035, g);
  peca(GEO.cil, metal(ESC.grafite), 0, 0, 0, r * 0.45, 0.02, r * 0.45, g);
  g.add(sombraNoChao(r * 2.4, r * 2.4, 0.5));
  return g;
}
// Quadro ou tela de parede: a imagem olha para +z
function quadro(w, h, tex, aceso) {
  const g = new THREE.Group();
  bloco(w + 0.06, h + 0.06, 0.04, 0.012, padrao(aceso ? 0x111317 : 0x2b2f36, 0.35, 0.2), 0, -0.03, 0, g);
  const t = telaPlana(w, h, tex, aceso ? 1.08 : 1); t.position.set(0, h / 2, 0.045); g.add(t);
  return g;
}
const caixaPapelao = (w, h, d, g, x, y, z) => { const c = peca(GEO.caixa, padrao(0xc39a66, 0.85), x, y, z, w, h, d, g); peca(GEO.caixa, padrao(0xd8c39a, 0.7), x, y + h - 0.002, z, w * 0.18, 0.004, d * 1.002, g); return c; };
// Peça de holograma (soma luz, não grava profundidade, não faz sombra)
function placaHolo(w, h, tex, cor, opacidade) {
  const m = new THREE.Mesh(GEO.plano, holo(cor || 0x9fe0ff, opacidade == null ? 0.85 : opacidade, tex));
  m.scale.set(w, h, 1); m.castShadow = false; m.receiveShadow = false; m.userData.vivo = true; m.renderOrder = 5;
  return m;
}

// Tubo reto passando por pontos (filete de luz em volta de vãos)
function tuboReto(pontos, raio) {
  const lista = [];
  for (let i = 0; i < pontos.length - 1; i++) {
    const a = new THREE.Vector3(...pontos[i]), b = new THREE.Vector3(...pontos[i + 1]), d = b.clone().sub(a), L = d.length();
    const g = new THREE.CylinderGeometry(raio, raio, L + raio * 1.2, 8, 1, true);
    g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(1, 1, 1)));
    lista.push(g);
  }
  return juntarGeometrias(lista);
}

// Árvore de vaso com copa de bolas (o jeito de desenho)
function arvoreRedonda(s) {
  const g = new THREE.Group();
  peca(torneado([[0, 0], [0.45, 0], [0.55, 0.08], [0.58, 0.6], [0.5, 0.64], [0, 0.64]], 32), casco(0xffffff, 0.45), 0, 0, 0, 1, 1, 1, g);
  peca(GEO.cil12, padrao(0x8a5a3a, 0.8), 0, 0.6, 0, 0.08, 1.4, 0.08, g);
  const verde = [0x7cc35a, 0x69b04a, 0x8fd06a];
  for (let k = 0; k < 6; k++) { const r = 0.55 + s() * 0.35; peca(GEO.esfera, padrao(verde[k % 3], 0.85), (s() - 0.5) * 0.9, 2.1 + s() * 0.8, (s() - 0.5) * 0.9, r, r * 0.92, r, g); }
  g.add(sombraNoChao(2.2, 2.2, 0.55));
  return g;
}

// Placa de desenho animado: pílula colorida com o nome em branco
function texPlacaFofa(nome, cor, sub) {
  return texGuardada(['fofa', nome, cor, sub].join('|'), () => textura(tela(768, 256, (q, W, H) => {
    q.clearRect(0, 0, W, H);
    q.fillStyle = 'rgba(0,0,0,.25)'; retanguloRedondo(q, 14, 22, W - 28, H - 34, (H - 34) / 2); q.fill();
    q.fillStyle = cor; retanguloRedondo(q, 8, 8, W - 28, H - 34, (H - 34) / 2); q.fill();
    q.fillStyle = 'rgba(255,255,255,.28)'; retanguloRedondo(q, 30, 18, W - 72, (H - 34) * 0.36, 30); q.fill();
    q.fillStyle = '#ffffff'; q.textAlign = 'center'; q.textBaseline = 'middle';
    let tam = sub ? 86 : 104; q.font = `900 ${tam}px ${FONTE}`; while (q.measureText(nome).width > W - 120 && tam > 30) { tam *= 0.93; q.font = `900 ${tam}px ${FONTE}`; }
    q.save(); q.shadowColor = 'rgba(0,0,0,.25)'; q.shadowOffsetY = 4; q.fillText(nome, W / 2 - 10, sub ? H * 0.38 : H * 0.44); q.restore();
    if (sub) { let t2 = 40; q.font = `700 ${t2}px ${FONTE}`; while (q.measureText(sub).width > W - 140 && t2 > 16) { t2 *= 0.93; q.font = `700 ${t2}px ${FONTE}`; } q.fillStyle = 'rgba(255,255,255,.92)'; q.fillText(sub, W / 2 - 10, H * 0.68); }
  })));
}
function placaFofa(nome, cor, sub, w) {
  const m = new THREE.Mesh(GEO.plano, guardado('pf:' + nome + cor + sub, () => { const mt = new THREE.MeshBasicMaterial({ map: texPlacaFofa(nome, cor, sub), transparent: true }); mt.color.multiplyScalar(1.12); return mt; }));
  m.scale.set(w, w / 3, 1); return m;
}
function texListras(a, b) {
  return texGuardada('listras' + a + b, () => { const t = textura(tela(256, 64, (q, W, H) => { q.fillStyle = a; q.fillRect(0, 0, W, H); q.fillStyle = b; for (let x = -H; x < W + H; x += 48) { q.beginPath(); q.moveTo(x, H); q.lineTo(x + 24, H); q.lineTo(x + 24 + H, 0); q.lineTo(x + H, 0); q.fill(); } })); t.wrapS = THREE.RepeatWrapping; t.repeat.set(4, 1); return t; });
}

function materialDeParede(tipo) {
  if (tipo === 'madeira') return guardado('pm:madeira', () => new THREE.MeshStandardMaterial({ map: texMadeira('media'), roughness: 0.6 }));
  if (tipo === 'escura') return guardado('pm:escura', () => new THREE.MeshStandardMaterial({ map: texMadeira('escura'), roughness: 0.6 }));
  if (tipo === 'clara') return guardado('pm:clara', () => padrao(0xf6efe4, 0.9));
  if (tipo === 'grafite') return guardado('pm:grafite', () => padrao(0x454b56, 0.85));
  if (tipo === 'azul') return guardado('pm:azul', () => padrao(0x2f5573, 0.85));
  if (tipo === 'marmore') return guardado('pm:marmore', () => new THREE.MeshStandardMaterial({ map: texMarmore(), roughness: 0.35 }));
  if (tipo === 'laranja') return guardado('pm:laranja', () => padrao(0xf39a52, 0.85));
  return guardado('pm:branca', () => padrao(0xfbf7f1, 0.9));
}

/* ---------- O salão: chão, andares em degrau, rampas, escadas, janelões e o céu ---------- */
function montarSalao(cena) {
  const T = THREE, g = new T.Group(); cena.add(g); const A = MUNDO.arco, Me = MUNDO.meio, Al = MUNDO.alto, s = sorteio(3);
  // o chão vai até os janelões; lá fora é o céu com a cidade (senão o chão continuaria e taparia a vista)
  const chao = new T.Mesh(new T.CircleGeometry(Al.salaR1 + 3.2, 160).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: 0xa8825e, roughness: 0.22, envMapIntensity: 0.9 })); chao.position.set(A.x, 0, A.z); chao.receiveShadow = true; g.add(chao);
  const noArco = (geo, mat, y) => { const m = peca(geo, mat, A.x, y || 0, A.z, 1, 1, 1, g); return m; };
  const creme = casco(0xe6cfae, 0.45), branco = casco(0xf7efe4, 0.35), laranja = luz(ESC.laranja, 2.8);
  // andar do meio e andar de cima (setores de anel; a frente de cada um tem o filete laranja)
  noArco(anelSetor(Me.r0, Me.r1 + 0.2, aArco(Me.meia), aArco(-Me.meia), Me.y, 120), creme);
  noArco(anelSetor(Al.r0, Al.salaR1 + 1.0, aArco(Al.meia), aArco(-Al.meia), Al.y, 120), creme);
  noArco(arcoDeitado(Me.r0 - 0.01, 0.035, aArco(Me.meia), aArco(-Me.meia), 160), laranja, Me.y - 0.12);
  noArco(arcoDeitado(Al.r0 - 0.01, 0.035, aArco(Al.meia), aArco(-Al.meia), 160), laranja, Al.y - 0.12);
  noArco(arcoDeitado(Al.r0 - 0.01, 0.05, aArco(Al.meia), aArco(-Al.meia), 160), casco(0xff9a4a, 0.5), Al.y * 0.5);
  // guarda-corpo de vidro na beira do andar de cima (com o vão das duas escadas)
  const E = MUNDO.escada, meiaE = (E.largura / 2 + 0.25) / Al.r0;
  [[-Al.meia, -E.a - meiaE], [-E.a + meiaE, E.a - meiaE], [E.a + meiaE, Al.meia]].forEach(([a0, a1]) => {
    const v = new T.Mesh(new T.CylinderGeometry(Al.r0 + 0.12, Al.r0 + 0.12, 0.85, 64, 1, true, aArco(a1), a1 - a0), vidro(0xe8f2ff)); v.position.set(A.x, Al.y + 0.43, A.z); g.add(v);
    noArco(arcoDeitado(Al.r0 + 0.12, 0.045, aArco(a1), aArco(a0), 80), casco(0xffffff, 0.3), Al.y + 0.86);
  });
  // rampas com degraus dos lados (térreo → andar do meio)
  const R = MUNDO.rampa, nd = 9;
  [-1, 1].forEach((k) => {
    for (let i = 0; i < nd; i++) { const r = R.r0 + (Me.r0 - R.r0) * i / nd; const a0 = k > 0 ? R.a0 : -R.a1, a1 = k > 0 ? R.a1 : -R.a0; noArco(anelSetor(r, Me.r0 + 0.1, aArco(a1), aArco(a0), Me.y * (i + 1) / nd, 24), i % 2 ? creme : branco); }
    const ab = k > 0 ? R.a1 : -R.a1; const [x0, z0] = polar(R.r0, ab), [x1, z1] = polar(Me.r0, ab);
    const lado = peca(GEO.caixa, casco(0xffffff, 0.3), (x0 + x1) / 2, 0, (z0 + z1) / 2, 0.25, 1, Math.hypot(x1 - x0, z1 - z0), g); lado.rotation.y = Math.atan2(x1 - x0, z1 - z0); lado.scale.y = Me.y + 0.9;
  });
  // escadas curvas dos dois lados do Atlas (andar do meio → andar de cima)
  [-1, 1].forEach((k) => {
    const ac = k * E.a, ma = (E.largura / 2) / ((E.r0 + Al.r0) / 2), nE = 8;
    for (let i = 0; i < nE; i++) { const r = E.r0 + (Al.r0 - E.r0) * i / nE; noArco(anelSetor(r, Al.r0 + 0.05, aArco(ac + ma), aArco(ac - ma), (Al.y - Me.y) * (i + 1) / nE, 16), i % 2 ? creme : branco, Me.y); }
    [-1, 1].forEach((j) => { const ab = ac + j * (ma + 0.004); const [x0, z0] = polar(E.r0, ab), [x1, z1] = polar(Al.r0, ab); const c = peca(GEO.caixa, casco(0xffffff, 0.3), (x0 + x1) / 2, Me.y, (z0 + z1) / 2, 0.18, Al.y - Me.y + 0.9, Math.hypot(x1 - x0, z1 - z0), g); c.rotation.y = Math.atan2(x1 - x0, z1 - z0); peca(GEO.caixa, luz(ESC.laranja, 2.6), (x0 + x1) / 2, Me.y + (Al.y - Me.y) / 2 + 0.5, (z0 + z1) / 2, 0.19, 0.04, Math.hypot(x1 - x0, z1 - z0), g).rotation.y = c.rotation.y; });
  });
  // janelões do fundo com a cidade no fim de tarde
  const RJ = Al.salaR1 + 3.0, aj = 70 * GRAU;
  for (let a = -aj; a <= aj + 1e-6; a += aj / 14) { const [x, z] = polar(RJ, a); const m = peca(GEO.caixa, padrao(0x3d3550, 0.5, 0.3), x, 0, z, 0.22, 22, 0.3, g); m.rotation.y = -a; }
  [Al.y + 0.0, 9.0, 14.5, 20].forEach((y) => noArco(arcoDeitado(RJ, 0.1, aArco(aj), aArco(-aj), 120), padrao(0x3d3550, 0.5, 0.3), y));
  const ceu = new T.Mesh(new T.CylinderGeometry(120, 120, 150, 72, 1, true, aArco(85 * GRAU), 170 * GRAU), new T.MeshBasicMaterial({ map: texCeu(), side: T.BackSide, fog: false, depthWrite: false }));
  ceu.position.set(A.x, -4, A.z); ceu.userData.vivo = true; cena.add(ceu);
  // plantas grandes e árvores redondas (o verde que quebra o branco)
  [[-Me.meia + 0.02, Me.r1 - 1.0, Me.y, 1.6], [Me.meia - 0.02, Me.r1 - 1.0, Me.y, 1.6], [-Al.meia + 0.03, Al.salaR1 + 0.5, Al.y, 1.7], [Al.meia - 0.03, Al.salaR1 + 0.5, Al.y, 1.7], [-Al.meia + 0.05, Al.r0 + 0.5, Al.y, 1.2], [Al.meia - 0.05, Al.r0 + 0.5, Al.y, 1.2]].forEach(([a, r, y, k]) => { const [x, z] = polar(r, a); const p = planta(k, s, 'escuro'); p.position.set(x, y, z); g.add(p); });
  [[-0.95, 17.5], [0.95, 17.5], [-0.82, 13.5], [0.82, 13.5]].forEach(([a, r]) => { const [x, z] = polar(r, a); const p = planta(2.2, s, 'escuro'); p.position.set(x, 0, z); g.add(p); navCirculo('base', x, z, 0.7); });
  [[-1.05, 21.0], [1.05, 21.0]].forEach(([a, r]) => { const [x, z] = polar(r, a); const ar = arvoreRedonda(s); ar.position.set(x, 0, z); g.add(ar); navCirculo('base', x, z, 0.8); });
  return g;
}

/* ---------- Central Atlas (andar do meio): palco, mesa curva, telão, globo e o anel no alto ---------- */
function montarCentral(cena) {
  const T = THREE, [cx, cz] = polar(MUNDO.atlas.r, 0), y0 = MUNDO.meio.y, hp = MUNDO.atlas.palco, s = sorteio(41);
  const g = new T.Group(); g.position.set(cx, y0, cz); cena.add(g);
  peca(GEO.cil, casco(0xfffaf3, 0.3), 0, 0, 0, 3.1, hp, 3.1, g);
  peca(GEO.cil, casco(0xff9a4a, 0.45), 0, 0, 0, 3.25, hp * 0.45, 3.25, g);
  peca(new T.TorusGeometry(3.12, 0.045, 8, 140).rotateX(Math.PI / 2), luz(ESC.laranja, 3), 0, hp - 0.02, 0, 1, 1, 1, g);
  peca(new T.RingGeometry(2.4, 2.47, 120).rotateX(-Math.PI / 2), luz(ESC.laranja, 2.2), 0, hp + 0.004, 0, 1, 1, 1, g);
  // mesa curva na frente do Atlas (ele senta virado para você)
  const mesa = new T.Group(); mesa.position.set(0, hp, -0.4); g.add(mesa);
  peca(anelSetor(0.95, 1.45, -1.3, 1.3, MESA_H - 0.05), casco(0xfffaf3, 0.3), 0, 0, 0, 1, 1, 1, mesa);
  peca(anelSetor(0.9, 1.55, -1.34, 1.34, 0.08, 64), casco(0xff8a2a, 0.4), 0, MESA_H - 0.07, 0, 1, 1, 1, mesa);
  peca(arcoDeitado(1.47, 0.02, -1.28, 1.28, 96), luz(ESC.laranja, 3.4), 0, 0.06, 0, 1, 1, 1, mesa);
  const selo = new T.Mesh(GEO.plano, guardado('seloRF', () => { const m = new T.MeshBasicMaterial({ map: texSelo('rf'), transparent: true }); m.color.multiplyScalar(1.25); return m; }));
  selo.scale.set(0.6, 0.6, 1); selo.position.set(0, 0.3, 1.47); mesa.add(selo);
  const lap = laptop(texTela('rede', '#58c8ff', 2)); lap.position.set(0, MESA_H, 1.05); mesa.add(lap);
  [-1, 1].forEach((k) => { const mo = monitor(0.42, 0.26, texTela(k < 0 ? 'barras' : 'mapa', '#58c8ff', 4 + k)); mo.position.set(k * 0.72, MESA_H, 0.85); mo.rotation.y = -k * 0.8; mesa.add(mo); });
  peca(torneado([[0, 0], [0.045, 0], [0.05, 0.1], [0, 0.1]], 18), casco(0xff7a1a), 0.42, MESA_H, 1.2, 1, 1, 1, mesa);
  mesa.add(cadeira(ESC.couro));
  navCirculo('base', cx, cz - 0.2, 1.7);
  CAMPO.lugarAtlas = novoLugar('base', 'atlas', cx, cz - 0.4, 0, 'sentar', { dono: 'atlas', y: y0 + hp });
  // telão do Atlas atrás dele (o pedido da vez e quem foi chamado)
  const tel = criarTelaoDoAtlas();
  const moldura = new T.Group(); moldura.position.set(0, hp, -2.4); g.add(moldura);
  [-1, 1].forEach((k) => bloco(0.18, 3.7, 0.18, 0.07, casco(0xffffff, 0.35), k * 2.15, 0, 0, moldura));
  bloco(4.5, 0.2, 0.22, 0.09, casco(0xff8a2a, 0.4), 0, 3.7, 0, moldura);
  const telao = placaHolo(4.0, 2.25, tel.tex, 0xd9f2ff, 0.97); telao.position.set(0, 2.5, 0.02); moldura.add(telao);
  CAMPO.animados.push((t) => { telao.material.opacity = 0.93 + Math.sin(t * 6) * 0.03; });
  // globo holográfico à esquerda e a tela do time à direita
  const ped = new T.Group(); ped.position.set(-2.3, hp, 0.6); g.add(ped);
  peca(torneado([[0, 0], [0.26, 0], [0.26, 0.05], [0.14, 0.12], [0.1, 0.7], [0.18, 0.76], [0, 0.76]], 36), casco(0xfffaf3, 0.35), 0, 0, 0, 1, 1, 1, ped);
  peca(new T.TorusGeometry(0.16, 0.012, 6, 48).rotateX(Math.PI / 2), luz(ESC.holo, 3), 0, 0.77, 0, 1, 1, 1, ped);
  const globo = new T.Group(); globo.position.set(0, 1.3, 0); ped.add(globo); globo.userData.vivo = true;
  const linhas = [];
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI; for (let k = 0; k < 48; k++) { const b0 = k / 48 * Math.PI * 2, b1 = (k + 1) / 48 * Math.PI * 2; linhas.push(Math.cos(b0) * Math.cos(a) * 0.46, Math.sin(b0) * 0.46, Math.cos(b0) * Math.sin(a) * 0.46, Math.cos(b1) * Math.cos(a) * 0.46, Math.sin(b1) * 0.46, Math.cos(b1) * Math.sin(a) * 0.46); } }
  for (let j = 1; j < 7; j++) { const yy = Math.cos(j / 7 * Math.PI) * 0.46, r = Math.sin(j / 7 * Math.PI) * 0.46; for (let k = 0; k < 48; k++) { const b0 = k / 48 * Math.PI * 2, b1 = (k + 1) / 48 * Math.PI * 2; linhas.push(Math.cos(b0) * r, yy, Math.sin(b0) * r, Math.cos(b1) * r, yy, Math.sin(b1) * r); } }
  const geoL = new T.BufferGeometry(); geoL.setAttribute('position', new T.Float32BufferAttribute(linhas, 3));
  globo.add(new T.LineSegments(geoL, new T.LineBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.7, blending: T.AdditiveBlending, depthWrite: false })));
  globo.add(new T.Mesh(new T.SphereGeometry(0.44, 32, 20), holo(0x2a7fd0, 0.18)));
  const anelG = new T.Mesh(new T.TorusGeometry(0.62, 0.008, 6, 96).rotateX(1.3), holo(ESC.laranja, 0.95)); globo.add(anelG);
  CAMPO.animados.push((t) => { globo.rotation.y = t * 0.3; anelG.rotation.z = t * 0.5; });
  navCirculo('base', cx - 2.3, cz + 0.6, 0.3);
  const telaTime = criarTelaDoTime();
  const pd = placaHolo(1.35, 0.84, telaTime.tex, 0xbfe8ff, 0.95); pd.position.set(2.35, hp + 1.5, 0.5); pd.rotation.y = -0.45; g.add(pd);
  CAMPO.animados.push((t) => { pd.position.y = hp + 1.5 + Math.sin(t * 0.9) * 0.03; });
  const anel = new T.Mesh(new T.TorusGeometry(2.8, 0.09, 14, 140).rotateX(Math.PI / 2), luz(ESC.laranja, 2.6)); anel.position.y = 5.2; anel.userData.vivo = true; g.add(anel);
  CAMPO.animados.push((t) => { anel.position.y = 5.2 + Math.sin(t * 0.7) * 0.12; });
  [-1, 1].forEach((k) => { const p = planta(1.5, s); p.position.set(k * 2.7, hp, -1.5); g.add(p); });
  novoLugar('base', 'globo-1', cx - 2.2, cz + 2.0, Math.PI, 'olhar', { olharPara: [cx - 2.3, y0 + 1.6, cz + 0.6], y: y0 + hp });
  novoLugar('base', 'time-1', cx + 2.7, cz + 1.8, Math.PI - 0.5, 'olhar', { olharPara: [cx + 2.35, y0 + 1.8, cz + 0.5], y: y0 + hp });
}

/* ---------- As mini salas de coworking dos agentes (térreo, em arco, abertas para a frente) ---------- */
const NICHOS = {
  builder: { fundo: 0xf6a531, lateral: 0xffe1b0, piso: 'madeira', quadro: ['planta', '#9fd0ff'], holo: 'planta', tapete: 0xffc94d },
  report: { fundo: 0x4a7be0, lateral: 0xd8e4fb, piso: 'madeira', quadro: ['documento', '#3d8bff'], holo: 'documento', tapete: 0x8fb4ff },
  sherlock: { fundo: 0x7a4fb3, lateral: 0xe4d8f3, piso: 'escura', quadro: ['quadro', '#8e5bd6'], holo: 'rede', tapete: 0xb98cff },
  fix: { fundo: 0x2fae6a, lateral: 0xd2f0de, piso: 'madeira', quadro: ['ferramentas', '#34c46a'], holo: 'codigo', tapete: 0x7fdca6 },
  scout: { fundo: 0x18a99b, lateral: 0xd0efeb, piso: 'madeira', quadro: ['mapa', '#22d3c0'], holo: 'radar', tapete: 0x6fe0d2 },
  data: { fundo: 0x24466f, lateral: 0xd4e2f1, piso: 'escura', quadro: ['barras', '#22d3ee'], holo: 'linhas', tapete: 0x58c8ff },
  pixel: { fundo: 0xe8559f, lateral: 0xfbd9ea, piso: 'madeira', quadro: ['moodboard', '#e0459b'], holo: 'onda', tapete: 0xffa6d0 }
};
// Ordem da fileira (da esquerda para a direita, como na foto)
const ORDEM_NICHOS = ['builder', 'report', 'sherlock', 'fix', 'data', 'scout', 'pixel'];
function texPlacaNicho(nome, sub, cor) {
  return texGuardada(['nicho', nome, sub, cor].join('|'), () => textura(tela(768, 200, (q, W, H) => {
    q.clearRect(0, 0, W, H);
    q.fillStyle = 'rgba(0,0,0,.28)'; retanguloRedondo(q, 10, 18, W - 20, H - 24, 34); q.fill();
    const g = q.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#3a3046'); g.addColorStop(1, '#241d2e'); q.fillStyle = g; retanguloRedondo(q, 6, 6, W - 20, H - 26, 34); q.fill();
    q.strokeStyle = 'rgba(255,170,110,.65)'; q.lineWidth = 4; retanguloRedondo(q, 6, 6, W - 20, H - 26, 34); q.stroke();
    q.fillStyle = cor; q.beginPath(); q.arc(84, (H - 20) / 2 + 6, 50, 0, 7); q.fill();
    q.fillStyle = '#fff'; q.font = `900 56px ${FONTE}`; q.textAlign = 'center'; q.textBaseline = 'middle'; q.fillText(nome[0], 84, (H - 20) / 2 + 9);
    q.textAlign = 'left'; q.fillStyle = '#ffffff'; let tam = 60; q.font = `800 ${tam}px ${FONTE}`; while (q.measureText(nome).width > W - 200 && tam > 24) { tam *= 0.93; q.font = `800 ${tam}px ${FONTE}`; } q.fillText(nome, 156, 70);
    q.fillStyle = '#ffc9a0'; let t2 = 32; q.font = `600 ${t2}px ${FONTE}`; while (q.measureText(sub).width > W - 200 && t2 > 14) { t2 *= 0.93; q.font = `600 ${t2}px ${FONTE}`; } q.fillText(sub, 158, 128);
  })));
}
// Letreiro de neon com o nome do agente (parede do fundo da mini sala)
function texNeon(nome, cor) {
  return texGuardada('neon:' + nome, () => textura(tela(512, 160, (q, W, H) => {
    q.clearRect(0, 0, W, H); q.textAlign = 'center'; q.textBaseline = 'middle'; q.font = `italic 800 96px ${FONTE}`;
    q.shadowColor = cor; q.shadowBlur = 28; q.fillStyle = cor; q.fillText(nome, W / 2, H / 2 + 6);
    q.shadowBlur = 8; q.fillStyle = '#ffffff'; q.fillText(nome, W / 2, H / 2 + 6);
  })));
}
// Coisinhas de mesa: caneca, porta-lápis, bloquinhos coloridos e caderno
function detalhesDeMesa(g, x, y, z, cor, s) {
  peca(torneado([[0, 0], [0.04, 0], [0.045, 0.09], [0, 0.09]], 18), casco(cor, 0.35), x + 0.48, y, z - 0.05, 1, 1, 1, g);
  const pc = new THREE.Group(); pc.position.set(x - 0.48, y, z - 0.08); g.add(pc);
  peca(GEO.cil, casco(0xffffff, 0.4), 0, 0, 0, 0.04, 0.09, 0.04, pc);
  [0xff7a1a, 0x22b8e6, 0xffd23f].forEach((c, k) => { const l = peca(GEO.cil12, padrao(c, 0.5), Math.cos(k * 2) * 0.015, 0.05, Math.sin(k * 2) * 0.015, 0.005, 0.12, 0.005, pc); l.rotation.set(Math.cos(k) * 0.2, 0, Math.sin(k) * 0.2); });
  [0xffe066, 0x9ee6b4, 0xffb38a].forEach((c, k) => { const n = peca(GEO.caixa, padrao(c, 0.8), x - 0.25 + k * 0.08, y, z + 0.2 - k * 0.02, 0.07, 0.005 + k * 0.002, 0.07, g); n.rotation.y = (s() - 0.5) * 0.6; });
  const cad = bloco(0.2, 0.02, 0.26, 0.008, padrao(cor, 0.6), x + 0.2, y, z - 0.18, g); cad.rotation.y = 0.3;
}
// Aparador baixo colorido encostado no fundo (com portinhas e coisas em cima)
function aparador(w, cor, s) {
  const g = new THREE.Group();
  bloco(w, 0.62, 0.42, 0.06, casco(0xfffaf3, 0.4), 0, 0.04, 0, g);
  const n = Math.max(2, Math.round(w / 0.55)); for (let k = 0; k < n; k++) { bloco(w / n - 0.05, 0.5, 0.02, 0.02, casco(k % 2 ? cor : 0xfff1dc, 0.45), -w / 2 + (k + 0.5) * w / n, 0.1, 0.215, g); peca(GEO.esfera, metal(0xd3d8de), -w / 2 + (k + 0.5) * w / n + w / n * 0.3, 0.35, 0.235, 0.015, 0.015, 0.015, g); }
  [-0.3, 0.1].forEach((x, k) => { const p = planta(0.35, s); p.position.set(x * w, 0.66, 0); g.add(p); });
  [0x4a7be0, 0xffd23f, 0xe8559f, 0x34c46a].forEach((c, k) => peca(GEO.caixa, padrao(c, 0.7), w * 0.3 + k * 0.035, 0.66, 0, 0.03, 0.2 + (k % 2) * 0.04, 0.16, g));
  g.add(sombraNoChao(w * 1.2, 0.9, 0.45));
  return g;
}
// Emblema 3D em cima de cada mini sala: dá para reconhecer o agente de longe
function emblemaDoAgente(id, g, x, y, z, a, s) {
  const T = THREE, e = new T.Group(); e.position.set(x, y, z); g.add(e); e.userData.vivo = true;
  const cor = casco(a.cor, 0.38), branco = casco(0xffffff, 0.35), escuro = casco(0x2b2f36, 0.4);
  peca(GEO.cil, branco, 0, 0, 0, 0.32, 0.08, 0.32, e);
  const topo = new T.Group(); topo.position.y = 0.1; e.add(topo);
  if (id === 'builder') { peca(new T.SphereGeometry(0.3, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), cor, 0, 0.02, 0, 1, 0.85, 1, topo); peca(GEO.cil, cor, 0, 0, 0.05, 0.4, 0.03, 0.36, topo); peca(GEO.caixa, casco(0xffd56a, 0.4), 0, 0.02, 0, 0.06, 0.26, 0.58, topo); }
  else if (id === 'report') { [0, 1, 2].forEach((k) => bloco(0.42, 0.06, 0.32, 0.015, k % 2 ? branco : cor, 0, k * 0.06, 0, topo).rotation.y = k * 0.15); const av = new T.Mesh(new T.ConeGeometry(0.1, 0.32, 3).rotateZ(-Math.PI / 2), branco); av.position.set(0, 0.42, 0); topo.add(av); }
  else if (id === 'sherlock') { const l = new T.Group(); l.position.y = 0.35; l.rotation.z = 0.5; topo.add(l); peca(new T.TorusGeometry(0.2, 0.045, 10, 36), casco(0xc8a052, 0.3), 0, 0, 0, 1, 1, 1, l); const lente = new T.Mesh(new T.CircleGeometry(0.19, 32), holo(0x9fe8ff, 0.5)); l.add(lente); peca(GEO.cil, escuro, 0, -0.42, 0, 0.04, 0.24, 0.04, l); }
  else if (id === 'fix') { const ge = new T.Shape(); for (let k = 0; k < 20; k++) { const ang = k / 20 * Math.PI * 2, r = k % 2 ? 0.22 : 0.3; if (k) ge.lineTo(Math.cos(ang) * r, Math.sin(ang) * r); else ge.moveTo(Math.cos(ang) * r, Math.sin(ang) * r); } const furo = new T.Path(); furo.absarc(0, 0, 0.09, 0, Math.PI * 2, true); ge.holes.push(furo); const eng = peca(new T.ExtrudeGeometry(ge, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 }), cor, 0, 0.36, -0.04, 1, 1, 1, topo); CAMPO.animados.push((t) => { eng.rotation.z = t * 0.9; }); }
  else if (id === 'data') { [[0.14, 0.22], [0.32, 0.38], [0.5, 0.58]].forEach(([h], k) => bloco(0.12, h, 0.12, 0.03, k === 2 ? casco(0xff7a1a, 0.4) : cor, -0.16 + k * 0.16, 0, 0, topo)); }
  else if (id === 'scout') { peca(GEO.cil12, escuro, 0, 0, 0, 0.03, 0.3, 0.03, topo); const pr = peca(new T.SphereGeometry(0.28, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.6), guardado('pratoS', () => { const m = casco(0xffffff, 0.35).clone(); m.side = T.DoubleSide; return m; }), 0, 0.42, 0, 1, 1, 1, topo); pr.rotation.x = Math.PI - 0.7; peca(GEO.esfera, cor, 0, 0.36, 0.05, 0.06, 0.06, 0.06, topo); CAMPO.animados.push((t) => { topo.rotation.y = t * 0.7; }); }
  else if (id === 'pixel') { const pal = peca(GEO.cil, casco(0xf1c98e, 0.5), 0, 0.02, 0, 0.32, 0.04, 0.24, topo); pal.rotation.x = -0.25; [0xff4f7a, 0xffd23f, 0x22b8e6, 0x34c46a, 0x8e5bd6].forEach((c, k) => peca(GEO.esfera, padrao(c, 0.5), Math.cos(k * 1.2) * 0.18, 0.09, Math.sin(k * 1.2) * 0.12, 0.05, 0.03, 0.05, topo)); const pin = peca(GEO.cil12, casco(0xffd23f, 0.4), 0.12, 0.3, 0, 0.025, 0.5, 0.025, topo); pin.rotation.z = -0.6; }
  CAMPO.animados.push((t) => { e.position.y = y + Math.sin(t * 1.6 + x) * 0.04; });
}
function montarNichos(cena) {
  const N = MUNDO.nicho, W = N.w, D = N.r1 - N.r0, H = N.h, piso = 0.18;
  CAMPO.capsulas = new Map();
  ORDEM_NICHOS.forEach((id, i) => {
    const a = agentePorId(id), d = NICHOS[id], s = sorteio(100 + i * 17), ang = (i - 3) * N.passo;
    const g = grupoPolar(cena, ang, 0, true), C = contextoPolar(g, {});
    const zf = -N.r0, zt = -N.r1, zm = (zf + zt) / 2, R0 = zt;   // frente, fundo e meio (z local negativo)
    const branco = casco(0xfffaf3, 0.32), destaque = casco(a.cor, 0.4), vid = guardado('vidroNicho', () => { const m = vidro(0xeaf4ff).clone(); m.opacity = 0.13; return m; });
    // base arredondada com o filete aceso em volta, piso de madeira e o tapete colorido
    bloco(W + 0.4, piso, D + 0.4, 0.09, branco, 0, 0, zm, g);
    peca(GEO.caixa, luz(ESC.laranja, 2.8), 0, piso * 0.5, zf + 0.205, W + 0.25, 0.04, 0.01, g);
    [-1, 1].forEach((k) => peca(GEO.caixa, luz(ESC.laranja, 2.4), k * (W / 2 + 0.205), piso * 0.5, zm, 0.01, 0.04, D + 0.25, g));
    peca(GEO.caixa, materialDeParede(d.piso), 0, piso, zm, W - 0.08, 0.012, D - 0.08, g).castShadow = false;
    const tap = peca(caixaRedonda(W * 0.6, 0.02, D * 0.45, 0.2), padrao(d.tapete, 0.95), 0.25, piso + 0.012, zm + 0.45, 1, 1, 1, g); tap.castShadow = false;
    // parede do fundo colorida (a única parede cheia), com rodapé e letreiro de neon
    peca(GEO.caixa, padrao(d.fundo, 0.7), 0, piso, zt + 0.03, W - 0.1, H - piso, 0.06, g).receiveShadow = true;
    peca(GEO.caixa, casco(0xfffaf3, 0.4), 0, piso, zt + 0.07, W - 0.1, 0.1, 0.03, g);
    const neon = new THREE.Mesh(GEO.plano, guardado('neonM:' + id, () => { const m = new THREE.MeshBasicMaterial({ map: texNeon(a.nome, a.css), transparent: true, depthWrite: false }); m.color.multiplyScalar(1.6); return m; }));
    neon.scale.set(1.5, 0.47, 1); neon.position.set(0.55, H - 0.45, zt + 0.08); g.add(neon);
    // estrutura: quatro colunas arredondadas, aro de cima (com luz na frente) e vidro nos lados e na frente
    [[-1, zf], [1, zf], [-1, zt], [1, zt]].forEach(([k, z]) => { bloco(0.1, H - piso, 0.1, 0.045, branco, k * (W / 2), piso, z, g); peca(GEO.esfera, destaque, k * (W / 2), H + 0.02, z, 0.09, 0.09, 0.09, g); });
    [zf, zt].forEach((z) => bloco(W + 0.1, 0.1, 0.1, 0.04, branco, 0, H - 0.05, z, g));
    [-1, 1].forEach((k) => bloco(0.1, 0.1, D, 0.04, branco, k * (W / 2), H - 0.05, zm, g));
    peca(GEO.caixa, luz(ESC.laranja, 3.2), 0, H - 0.12, zf + 0.075, W - 0.1, 0.035, 0.01, g);
    [-1, 1].forEach((k) => { const v = peca(GEO.caixa, vid, k * (W / 2), piso, zm, 0.02, H - piso - 0.12, D - 0.14, g); v.castShadow = false; v.receiveShadow = false; v.renderOrder = 2; });
    const vao = 1.25; [[-W / 2 + 0.07, -vao / 2], [vao / 2, W / 2 - 0.07]].forEach(([x0, x1]) => { const v = peca(GEO.caixa, vid, (x0 + x1) / 2, piso, zf, x1 - x0, H - piso - 0.12, 0.02, g); v.castShadow = false; v.receiveShadow = false; v.renderOrder = 2; });
    [-vao / 2, vao / 2].forEach((x) => bloco(0.06, H - piso - 0.12, 0.08, 0.025, destaque, x, piso, zf, g));
    // placa com o nome embaixo, na frente (como na foto)
    bloco(W * 0.8, 0.3, 0.36, 0.12, branco, 0, 0, zf + 0.42, g);
    const placa = new THREE.Mesh(GEO.plano, guardado('pn:' + id, () => { const m = new THREE.MeshBasicMaterial({ map: texPlacaNicho(a.nome, a.papel, a.css), transparent: true }); m.color.multiplyScalar(1.1); return m; }));
    placa.scale.set(W * 0.76, W * 0.76 * 200 / 768, 1); placa.position.set(0, 0.4, zf + 0.61); placa.rotation.x = -0.32; g.add(placa);
    // luminária pendurada no aro e uma planta pendente no canto
    const pend = new THREE.Group(); pend.position.set(-0.3, H - 0.12, R0 + 1.15); g.add(pend);
    peca(GEO.cil12, padrao(0x2b2f36, 0.5), 0, -0.55, 0, 0.008, 0.55, 0.008, pend);
    peca(new THREE.SphereGeometry(0.17, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), destaque, 0, -0.55, 0, 1, 1, 1, pend).rotation.x = Math.PI;
    peca(GEO.esfera, luz(0xffe2b8, 3), 0, -0.57, 0, 0.065, 0.03, 0.065, pend);
    const pen = new THREE.Group(); pen.position.set(W / 2 - 0.25, H - 0.05, zf - 0.25); g.add(pen); peca(GEO.cil, casco(0xffffff, 0.4), 0, 0, 0, 0.15, 0.17, 0.15, pen);
    for (let k = 0; k < 7; k++) { const f = peca(GEO.esfera, padrao([0x6fbf4a, 0x8fd06a, 0x5aa83f][k % 3], 0.8), (s() - 0.5) * 0.22, -0.12 - k * 0.15, (s() - 0.5) * 0.14, 0.09, 0.11, 0.07, pen); f.castShadow = false; }
    // mesa virada para a câmera, cadeira, tela do fundo, aparador, prateleiras, holograma e os detalhes
    const mz = R0 + 1.25, cz = R0 + 0.62, mx = -0.3;
    C.por(mesaTrabalho(1.55, 0.62), mx, piso, mz, 0);
    C.por(cadeira(ESC.couro), mx, piso, cz, 0);
    detalhesDeMesa(g, mx, piso + MESA_H, mz + 0.05, a.cor, s);
    const [tipoQ, corQ] = d.quadro;
    const qd = quadro(1.25, 0.72, texTela(tipoQ, corQ, i + 50), ['barras', 'mapa'].includes(tipoQ)); qd.position.set(-0.75, piso + 1.02, zt + 0.08); g.add(qd);
    const est = estante(0.95, 0.5, 0.22, s, [a.cor, 0xffffff, 0xff7a1a, 0xffd23f, 0x2b2f36]); est.position.set(1.25, piso + 1.3, zt + 0.15); g.add(est);
    const apa = aparador(1.3, a.cor, s); apa.position.set(1.25, piso, zt + 0.3); g.add(apa);
    const hp = placaHolo(0.9, 0.55, texTela(d.holo, corQ, i + 30), d.holo === 'documento' ? 0xffffff : 0xbfe6ff, d.holo === 'documento' ? 0.6 : 0.92);
    hp.position.set(1.05, piso + 1.55, R0 + 1.55); hp.rotation.y = -0.4; g.add(hp);
    CAMPO.animados.push((t) => { hp.position.y = piso + 1.55 + Math.sin(t * 1.1 + i) * 0.03; });
    const pAlta = planta(0.95, s); pAlta.position.set(-W / 2 + 0.38, piso, zf - 0.42); g.add(pAlta);
    const lixo = peca(GEO.cil, casco(a.cor, 0.45), mx + 0.95, piso, mz + 0.05, 0.1, 0.22, 0.1, g); lixo.castShadow = true;
    // quadrinhos e relógio na parede do fundo, pufe colorido no chão
    [[-1.7, 2.05, 0.32, 0.42], [-1.7, 1.48, 0.32, 0.3]].forEach(([x, y, w, h], k) => { const f = quadro(w, h, texTela(['onda', 'mapa', 'barras', 'cores'][(i + k) % 4], a.css, i * 3 + k), false); f.position.set(x, piso + y - h / 2, zt + 0.08); g.add(f); });
    const rel = new THREE.Group(); rel.position.set(-0.75, piso + 2.15, zt + 0.1); g.add(rel);
    peca(GEO.cil, casco(0xffffff, 0.35), 0, 0, 0, 0.17, 0.04, 0.17, rel).rotation.x = Math.PI / 2;
    peca(new THREE.TorusGeometry(0.17, 0.02, 8, 32), destaque, 0, 0, 0.0, 1, 1, 1, rel);
    const pont = peca(GEO.caixa, padrao(0x2b2f36, 0.5), 0, 0, 0.045, 0.012, 0.12, 0.006, rel); pont.userData.vivo = true; const pont2 = peca(GEO.caixa, padrao(ESC.laranja, 0.5), 0, 0, 0.05, 0.01, 0.15, 0.006, rel); pont2.userData.vivo = true;
    pont.geometry = GEO.caixa; CAMPO.animados.push((t) => { pont.rotation.z = -t * 0.05; pont2.rotation.z = -t * 0.6; });
    peca(GEO.esfera, padrao(d.tapete, 0.85), -1.35, piso + 0.16, zm + 0.55, 0.26, 0.17, 0.26, g);
    emblemaDoAgente(id, g, 0, H + 0.05, zt + 0.25, a, s);
    // suporte do fone na mesa (o fone sai dali quando o agente começa a trabalhar)
    const sup = new THREE.Group(); C.por(sup, mx + 0.66, piso + MESA_H, mz - 0.14, 0);
    peca(GEO.cil12, metal(0xd3d8de), 0, 0, 0, 0.012, 0.2, 0.012, sup); peca(GEO.cil, casco(a.cor, 0.4), 0, 0, 0, 0.06, 0.012, 0.06, sup);
    decorarCapsula(a.id, C, piso, s, R0);
    // no mapa de pisar a mini sala inteira é ocupada; o robô entra pelo vão da frente e passa voando por cima da mesa
    const [cx0, cz0] = polar(-zm, ang);
    navCaixa('base', cx0, cz0, W + 0.4, D + 0.4, -ang);
    const porta = C.mundo(0, zf + 1.0);
    CAMPO.capsulas.set(a.id, { g, ang, centro: [cx0, cz0], porta,
      lugar: C.lugar('capsula-' + a.id, mx, cz, 0, 'sentar', { dono: a.id, y: piso, porta, sobrevoar: true }) });
  });
}

// Faixa "Time de IA" (como na foto) e a decoração do andar do meio: floreiras na beirada, bancos e tapetes
function montarEnfeites(cena) {
  const T = THREE, s = sorteio(9), Me = MUNDO.meio, N = MUNDO.nicho;
  const [fx, fz] = polar(N.r1 + 0.1, 0);
  const faixa = new T.Group(); faixa.position.set(fx, Me.y + 0.55, fz); cena.add(faixa);
  [-1.6, 1.6].forEach((x) => peca(GEO.cil12, metal(0xdfe2e6, 0.3), x, -0.7, -0.05, 0.04, 0.75, 0.04, faixa));
  bloco(4.4, 0.95, 0.3, 0.42, casco(0xff7a1a, 0.4), 0, 0, 0, faixa);
  const tx = new T.Mesh(GEO.plano, guardado('faixaTime', () => { const m = new T.MeshBasicMaterial({ map: texPlacaFofa('Time de IA', '#c95a10', ''), transparent: true }); m.color.multiplyScalar(1.15); return m; }));
  tx.scale.set(4.3, 1.43, 1); tx.position.set(0, 0.48, 0.17); faixa.add(tx);
  peca(GEO.caixa, luz(0xffd2a8, 2.6), 0, 0.03, 0.16, 3.8, 0.04, 0.01, faixa);
  // floreiras ao longo da beirada do andar do meio (atrás das mini salas) e no andar de cima
  for (let a = -Me.meia + 0.05; a <= Me.meia - 0.05 + 1e-6; a += (Me.meia * 2 - 0.1) / 12) {
    if (Math.abs(a) < 0.12) continue;
    const [x, z] = polar(Me.r0 + 0.45, a); const f = new T.Group(); f.position.set(x, Me.y, z); f.rotation.y = -a; cena.add(f);
    bloco(1.2, 0.35, 0.45, 0.12, casco(0xfffaf3, 0.4), 0, 0, 0, f);
    for (let k = 0; k < 4; k++) { const b = peca(GEO.esfera, padrao([0x6fbf4a, 0x8fd06a, 0xff9ac2, 0xffd23f][k % 4], 0.8), -0.42 + k * 0.28, 0.42, (s() - 0.5) * 0.1, 0.17, 0.15, 0.17, f); b.castShadow = true; }
    navCaixa('base', x, z, 1.2, 0.45, -a);
  }
  // bancos coloridos e tapetes redondos dos dois lados do Atlas
  [-1, 1].forEach((k) => {
    const [x, z] = polar(27.2, k * 0.2); const tap = new T.Mesh(new T.CircleGeometry(1.6, 48).rotateX(-Math.PI / 2), padrao(k < 0 ? 0x8fb4ff : 0xffa6d0, 0.95)); tap.position.set(x, Me.y + 0.012, z); tap.receiveShadow = true; cena.add(tap);
    const banco = new T.Group(); banco.position.set(x, Me.y, z - 0.4); banco.rotation.y = 0; cena.add(banco);
    bloco(1.8, 0.16, 0.55, 0.08, casco(k < 0 ? 0x4a7be0 : 0xe8559f, 0.45), 0, 0.3, 0, banco);
    [-0.7, 0.7].forEach((xx) => bloco(0.1, 0.3, 0.45, 0.04, metal(0xdfe2e6, 0.3), xx, 0, 0, banco));
    banco.add(sombraNoChao(2.2, 0.9, 0.4));
    navCaixa('base', x, z - 0.4, 1.8, 0.55, 0);
    novoLugar('base', 'banco-' + (k < 0 ? 'e' : 'd'), x, z - 0.3, 0, 'sentar', { y: Me.y });
  });
}

/* ---------- Lounge do time (na frente, com sofás laranja) e o quiosque de café ---------- */
function montarLounge(cena) {
  const T = THREE, s = sorteio(77), { x: LX, z: LZ } = MUNDO.lounge, L = new T.Group(); L.position.set(LX, 0, LZ); cena.add(L);
  const C = contexto(L, 0, LX, LZ, {});
  const tap = new T.Mesh(new T.CircleGeometry(3.0, 72).rotateX(-Math.PI / 2), padrao(0x5b3f73, 0.95)); tap.position.y = 0.006; tap.receiveShadow = true; L.add(tap);
  const tap2 = new T.Mesh(new T.RingGeometry(2.55, 2.75, 72).rotateX(-Math.PI / 2), padrao(0xffb37a, 0.95)); tap2.position.y = 0.01; L.add(tap2);
  [3.9, 4.6].forEach((r) => peca(new T.TorusGeometry(r, 0.04, 8, 140).rotateX(Math.PI / 2), luz(ESC.laranja, 2.6), 0, 0.012, 0, 1, 1, 1, L));
  const laranja = 0xe0601a;
  C.por(sofa(2.4, laranja), -1.9, 0, 0, Math.PI / 2); C.por(sofa(2.4, laranja), 1.9, 0, 0, -Math.PI / 2);
  C.por(sofa(1.4, 0xd9541a), 0, 0, -1.9, 0);
  const mc = new T.Group(); C.por(mc, 0, 0, 0, 0);
  peca(GEO.cil, casco(0xfffaf3, 0.3), 0, 0.32, 0, 0.8, 0.07, 0.8, mc); peca(GEO.cil, metal(0xc9ced6, 0.3), 0, 0, 0, 0.62, 0.32, 0.62, mc);
  const seloM = new T.Mesh(new T.CircleGeometry(0.32, 6), guardado('seloRF', () => { const m = new T.MeshBasicMaterial({ map: texSelo('rf'), transparent: true }); m.color.multiplyScalar(1.25); return m; })); seloM.rotation.x = -Math.PI / 2; seloM.position.y = 0.395; mc.add(seloM);
  mc.add(sombraNoChao(2.2, 2.2, 0.5));
  [[0.45, 0.25, 0x4a7be0], [0.42, 0.28, 0xffd23f], [0.4, 0.31, 0xe8559f]].forEach(([x, yy, c], k) => bloco(0.3, 0.04, 0.22, 0.01, padrao(c, 0.7), x, 0.39 + k * 0.035, -0.3, mc));
  const lum = new T.Group(); C.por(lum, 0, 0, 0, 0); peca(GEO.cil12, metal(0xd3d8de), 0.3, 0.39, 0.25, 0.012, 0.25, 0.012, lum); peca(new T.SphereGeometry(0.14, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), casco(0xfff1dc, 0.4), 0.3, 0.64, 0.25, 1, 0.8, 1, lum); peca(GEO.esfera, luz(0xffe2b8, 2.8), 0.3, 0.64, 0.25, 0.05, 0.03, 0.05, lum);
  [[-2.6, -1.9], [2.6, -1.9]].forEach(([x, z]) => C.por(planta(1.2, s), x, 0, z, 0));
  navCaixa('base', LX - 1.9, LZ, 0.8, 2.4, 0); navCaixa('base', LX + 1.9, LZ, 0.8, 2.4, 0); navCaixa('base', LX, LZ - 1.9, 1.4, 0.8, 0); navCirculo('base', LX, LZ, 0.8);
  [-0.55, 0.55].forEach((z, k) => { C.lugar('sofa-' + k, -1.8, z, Math.PI / 2, 'sentar', { y: 0 }); C.lugar('sofa-' + (k + 2), 1.8, z, -Math.PI / 2, 'sentar', { y: 0 }); });
  C.lugar('sofa-4', 0, -1.8, 0, 'sentar', { y: 0 });
  // carrinho de café do lounge (toldo listrado, máquina, xícaras e frutas)
  const K = new T.Group(); C.por(K, 4.3, 0, -0.6, -0.55);
  bloco(1.6, 0.9, 0.7, 0.12, casco(0xffffff, 0.4), 0, 0.12, 0, K);
  bloco(1.7, 0.07, 0.8, 0.03, casco(0xff8a2a, 0.45), 0, 1.02, 0, K);
  [-0.6, 0.6].forEach((x) => [-0.25, 0.25].forEach((z) => peca(GEO.cilX, casco(0x2b2f36, 0.4), x, 0.1, z, 0.06, 0.1, 0.1, K)));
  peca(GEO.caixa, luz(ESC.laranja, 2.6), 0, 0.2, 0.355, 1.4, 0.03, 0.01, K);
  bloco(0.38, 0.48, 0.34, 0.07, casco(0x2b2f36, 0.35), -0.42, 1.09, -0.08, K);
  peca(GEO.caixa, metal(0xd8dce2), -0.42, 1.25, 0.11, 0.1, 0.035, 0.05, K);
  [0.0, 0.18].forEach((x) => peca(torneado([[0, 0], [0.045, 0], [0.05, 0.1], [0, 0.1]], 18), casco(0xffffff), x, 1.09, 0.15, 1, 1, 1, K));
  peca(GEO.cil, casco(0xfffaf3), 0.5, 1.09, -0.05, 0.17, 0.06, 0.17, K);
  [[0.46, -0.02, 0xff9a2a], [0.56, -0.1, 0x8fd06a], [0.5, 0.05, 0xffcf3a]].forEach(([x, z, c]) => peca(GEO.esfera, padrao(c, 0.45), x, 1.2, z, 0.06, 0.06, 0.06, K));
  [-0.75, 0.75].forEach((x) => peca(GEO.cil12, casco(0xffffff, 0.4), x, 1.05, -0.3, 0.03, 1.3, 0.03, K));
  const toldo = new T.Mesh(new T.BoxGeometry(1.9, 0.06, 1.0), new T.MeshStandardMaterial({ map: texListras('#ff8a2a', '#ffffff'), roughness: 0.7 })); toldo.position.set(0, 2.38, 0.05); toldo.rotation.x = 0.25; toldo.castShadow = true; K.add(toldo);
  for (let k = 0; k < 5; k++) peca(new T.SphereGeometry(0.19, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), casco(k % 2 ? 0xffffff : 0xff8a2a, 0.5), -0.76 + k * 0.38, 2.27, 0.56, 1, 0.7, 0.4, K);
  const menu = placaFofa('Café', '#ff8a2a', 'recarga do time', 1.1); menu.position.set(0, 2.75, -0.2); K.add(menu);
  { const [kx, kz] = C.mundo(4.3, -0.6); navCaixa('base', kx, kz, 1.8, 0.9, -0.55); }
  [[3.7, 0.25], [4.75, 0.15]].forEach(([x, z], k) => C.lugar('cafe-' + k, x, z, Math.PI - 0.55, 'cafe'));
  // pontos soltos para passear, conversar e acenar (na frente e no andar do meio)
  const pts = [[-6, 9.5], [-3.5, 8.0], [3.5, 8.0], [6, 9.5], [-8.5, 12.5], [8.5, 12.5], [-5, 15.2], [5, 15.2], [0, 7.6], [10.5, 9], [-10.5, 7.5]];
  pts.forEach(([x, z], k) => novoLugar('base', 'praca-' + k, x, z, Math.atan2(-x * 0.2, 1), 'praca'));
  [[-0.16, 27.0], [0.16, 27.0], [-0.2, 31.0], [0.2, 31.0]].forEach(([a, r], k) => { const [x, z] = polar(r, a); novoLugar('base', 'praca-meio-' + k, x, z, Math.PI - a * 0, 'praca', { y: MUNDO.meio.y }); });
}

/* ---------- As salas da empresa: andar de cima (e as pontas do andar do meio) ---------- */
function arranjoDasSalas(n) {
  const Al = MUNDO.alto, Me = MUNDO.meio, vagas = [];
  const rmA = (Al.salaR0 + Al.salaR1) / 2, larguraR = 7.0, folga = 0.45;
  vagas.push({ andar: 'alto', ang: 0, w: larguraR });
  const cabeAlto = Math.max(0, n - 4), maxLado = Math.ceil(Math.max(cabeAlto, Math.min(n, 8)) / 2);
  const ladoW = Math.min(5.6, ((Al.meia * rmA) - larguraR / 2 - folga * (maxLado + 0.5)) / Math.max(1, maxLado));
  const altos = Math.min(n, Math.max(8, n - 4)), meios = n - altos;
  for (let k = 0; k < altos; k++) { const lado = k % 2 ? 1 : -1, pos = Math.floor(k / 2); const dist = larguraR / 2 + folga + pos * (ladoW + folga) + ladoW / 2; vagas.push({ andar: 'alto', ang: lado * dist / rmA, w: ladoW }); }
  const rmM = 29.2; [24 * GRAU, 35 * GRAU].forEach((a, i) => [-1, 1].forEach((lado) => { if (vagas.length - 1 < altos + meios) vagas.push({ andar: 'meio', ang: lado * a, w: 4.6 }); }));
  return vagas.slice(0, n + 1);
}
function montarSalas(empresa) {
  const grupo = new THREE.Group(); grupo.name = 'salas';
  const setores = empresa ? setoresDa(empresa.id) : [];
  const vagas = arranjoDasSalas(setores.length);
  const salas = [{ reuniao: true, id: 'reuniao', nome: 'Sala de reunião' }].concat(setores.map((s) => ({ setor: s, id: s.id, nome: s.nome })));
  CAMPO.salas = new Map();
  salas.forEach((info, k) => { if (vagas[k]) CAMPO.salas.set(info.id, montarSala(grupo, info, vagas[k], empresa)); });
  return grupo;
}
// Uma sala da empresa: aberta na frente, paredes grossas nos lados, placa colorida em cima, tela com os números no fundo
function montarSala(grupo, info, vaga, empresa) {
  const alto = vaga.andar === 'alto', y = alto ? MUNDO.alto.y : MUNDO.meio.y, ang = vaga.ang, w = vaga.w;
  const r0 = alto ? MUNDO.alto.salaR0 : 26.6, r1 = alto ? MUNDO.alto.salaR1 : 32.0, H = alto ? MUNDO.alto.h : 2.8, prof = r1 - r0, zm = (r0 + r1) / 2;
  const g = grupoPolar(grupo, ang, y, false);
  const portaFora = polar(r0 - 0.75, ang);
  const C = contextoPolar(g, { porta: portaFora, camada: 'salas', y });
  const tipo = info.reuniao ? 'reuniao' : tipoDeSala(info.nome), s = sorteio(String(info.id).split('').reduce((t, c) => t + c.charCodeAt(0) * 7, 3));
  const D = info.setor ? dadosDaSala(info.setor) : null;
  const cor = { financeiro: 0x3fb58a, marketing: 0xff8a2a, comercial: 0x4a7be0, logistica: 0xf2b134, rh: 0xe8679f, operacoes: 0x7b8bd6, diretoria: 0x6a55a8, tecnologia: 0x2fa8e0, atendimento: 0x2cc0ad, reuniao: 0xff7a1a }[tipo] || 0x8fa3b8;
  const corCss = '#' + cor.toString(16).padStart(6, '0');
  const pisoSala = { financeiro: 'madeira', diretoria: 'escura', rh: 'madeira', marketing: 'clara', reuniao: 'madeira', comercial: 'madeira' }[tipo];
  peca(GEO.caixa, pisoSala ? materialDeParede(pisoSala) : casco(0xece2d4, 0.5), 0, 0.005, zm, w - 0.1, 0.014, prof - 0.05, g).castShadow = false;
  const fundoTipo = { financeiro: 'marmore', diretoria: 'escura', rh: 'madeira', reuniao: 'madeira', tecnologia: 'grafite', atendimento: 'azul' }[tipo];
  peca(GEO.caixa, fundoTipo ? materialDeParede(fundoTipo) : padrao(cor, 0.8), 0, 0, r1 - 0.03, w, H, 0.06, g);
  [-1, 1].forEach((k) => { bloco(0.28, H, prof + 0.1, 0.11, casco(0xfffaf3, 0.35), k * (w / 2 + 0.14), 0, zm, g); peca(GEO.caixa, padrao(k < 0 ? cor : 0xfff4e6, 0.85), k * (w / 2 - 0.005), 0.02, zm, 0.02, H - 0.08, prof - 0.08, g); });
  bloco(w + 0.56, 0.34, 0.42, 0.13, casco(0xfffaf3, 0.35), 0, H - 0.06, r0, g);
  peca(GEO.caixa, luz(ESC.laranja, 3), 0, H - 0.1, r0 - 0.22, w + 0.3, 0.04, 0.02, g);
  peca(GEO.caixa, luz(0xfff0dc, 1.3), 0, H - 0.05, zm, Math.max(0.6, w * 0.5), 0.02, 0.45, g);
  navCaixa('salas', ...polar(zm, ang), w + 0.56, prof + 0.3, Math.PI - ang);
  // placa colorida em cima da frente: nome e situação (a cor da faixa é a da saúde do setor)
  const sub = info.reuniao ? (empresa ? empresa.nome : 'Real Forte') : D.nomeSaude;
  const placa = placaFofa(info.nome, info.reuniao ? LARANJA_CSS : corCss, sub, Math.min(2.3, w - 0.3)); placa.position.set(0, H + 0.5, r0 - 0.24); placa.rotation.y = Math.PI; g.add(placa);
  if (!info.reuniao) { const bol = new THREE.Mesh(new THREE.CircleGeometry(0.13, 24), luz(COR_SAUDE[D.saude], 2.4)); bol.position.set(Math.min(2.3, w - 0.3) / 2 + 0.05, H + 0.62, r0 - 0.26); bol.rotation.y = Math.PI; g.add(bol); }
  // selo e a tela grande do fundo (números do setor, ou a logo da empresa na Sala de reunião)
  const largo = w >= 4.4, tvW = Math.min(2.1, w - (largo ? 1.9 : 0.7));
  const selo = new THREE.Mesh(GEO.plano, guardado('selo:' + tipo, () => { const m = new THREE.MeshBasicMaterial({ map: texSelo(info.reuniao ? 'rf' : iconeDaSala(tipo)), transparent: true }); m.color.multiplyScalar(1.25); return m; }));
  if (info.reuniao) { selo.scale.set(0.75, 0.75, 1); selo.position.set(0, 2.3, r1 - 0.08); }
  else if (largo) { selo.scale.set(0.9, 0.9, 1); selo.position.set(-(w / 2 - 0.85), 1.9, r1 - 0.08); }
  else { selo.scale.set(0.5, 0.5, 1); selo.position.set(0, 2.35, r1 - 0.08); }
  selo.rotation.y = Math.PI; g.add(selo);
  const telao = new THREE.Group(); telao.position.set(info.reuniao || !largo ? 0 : 0.6, 0.85, r1 - 0.1); telao.rotation.y = Math.PI; g.add(telao);
  if (info.reuniao) { const lw = Math.min(2.4, w - 1.2); telao.add(quadro(lw, lw * 0.56, texLogoEmpresa(empresa ? logoDe(empresa) : '', empresa ? empresa.nome : 'Real Forte'), true)); }
  else { const tx = texQuadroDoSetor(info.setor, D); tx.userData.descartavel = true; telao.add(quadro(tvW, tvW * 0.5625, tx, true)); }
  mobiliarSala(tipo, C, 0, r0, r1, w, s);
  const alvoTv = C.mundo(0, r1);
  C.lugar('sala:' + info.id + ':a', -0.5, r0 + 1.2, 0, 'olhar', { sala: info.id, olharAlvo: alvoTv });
  C.lugar('sala:' + info.id + ':b', 0.6, r0 + 1.4, -0.15, 'olhar', { sala: info.id, olharAlvo: alvoTv });
  // caixa invisível para o clique e o contorno que acende quando o mouse passa
  const caixa = new THREE.Mesh(new THREE.BoxGeometry(w, H, prof), new THREE.MeshBasicMaterial()); caixa.position.set(0, H / 2, zm); caixa.visible = false;
  caixa.userData = { tipo: 'sala', id: info.id, setorId: info.setor ? info.setor.id : '', nome: info.nome, reuniao: !!info.reuniao, D }; g.add(caixa);
  const contorno = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w - 0.1, H - 0.04, prof - 0.04)), new THREE.LineBasicMaterial({ color: new THREE.Color(ESC.laranja).multiplyScalar(2.5), transparent: true, opacity: 0, depthWrite: false }));
  contorno.position.set(0, H / 2, zm); contorno.userData.vivo = true; g.add(contorno);
  return { g, C, caixa, contorno, info, D, ang, centro: polar(zm, ang), porta: portaFora, y };
}

// O telão do Atlas: o pedido que chegou, quem ele chamou e o que está acontecendo
function criarTelaoDoAtlas() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 576; const tex = textura(c);
  const desenhar = () => {
    const q = c.getContext('2d'), W = c.width, H = c.height, P = CAMPO.pedido;
    q.clearRect(0, 0, W, H); q.fillStyle = 'rgba(20,70,130,.42)'; retanguloRedondo(q, 6, 6, W - 12, H - 12, 34); q.fill();
    q.strokeStyle = 'rgba(150,220,255,.9)'; q.lineWidth = 5; retanguloRedondo(q, 6, 6, W - 12, H - 12, 34); q.stroke();
    q.fillStyle = '#ffb27a'; q.font = `800 40px ${FONTE}`; q.fillText('ATLAS', 50, 78);
    q.fillStyle = 'rgba(220,240,255,.8)'; q.font = `500 26px ${FONTE}`; q.fillText(campoOuvindo() ? 'ouvindo você…' : P ? 'pedido em andamento' : 'pronto para o próximo pedido', 190, 76);
    const quebrar = (txt, x, y, larg, tam, max) => { q.font = `600 ${tam}px ${FONTE}`; const ps = String(txt).split(' '); let l = '', n = 0; for (const p of ps) { const t = l ? l + ' ' + p : p; if (q.measureText(t).width > larg && l) { q.fillText(l, x, y + n * tam * 1.25); n++; l = p; if (n >= max) return; } else l = t; } if (l && n < max) q.fillText(l, x, y + n * tam * 1.25); };
    if (!P) { q.fillStyle = '#ffffff'; quebrar('Fale comigo ou escreva na barra lá embaixo. Eu escolho quem do time resolve.', 50, 170, W - 100, 46, 3); return void (tex.needsUpdate = true); }
    q.fillStyle = 'rgba(220,240,255,.75)'; q.font = `600 26px ${FONTE}`; q.fillText('VOCÊ PEDIU', 50, 150);
    q.fillStyle = '#ffffff'; quebrar('“' + P.texto + '”', 50, 200, W - 100, 40, 3);
    q.fillStyle = 'rgba(220,240,255,.75)'; q.font = `600 26px ${FONTE}`; q.fillText('QUEM VAI RESOLVER', 50, 380);
    let x = 50; P.agentes.forEach((id) => { const a = agentePorId(id); q.font = `700 34px ${FONTE}`; const w = q.measureText(a.nome).width + 70; q.fillStyle = a.css; retanguloRedondo(q, x, 404, w, 62, 31); q.fill(); q.fillStyle = '#ffffff'; q.beginPath(); q.arc(x + 30, 435, 9, 0, 7); q.fill(); q.fillText(a.nome, x + 48, 447); x += w + 16; });
    tex.needsUpdate = true;
  };
  desenhar(); CAMPO.telao = { tex, desenhar };
  return CAMPO.telao;
}
// A tela do time ao lado do Atlas: lista dos agentes com o estado de agora (redesenhada pelo laço)
function criarTelaDoTime() {
  const c = document.createElement('canvas'); c.width = 640; c.height = 400; const tex = textura(c);
  const desenhar = () => {
    const q = c.getContext('2d'), W = c.width, H = c.height;
    q.clearRect(0, 0, W, H); q.fillStyle = 'rgba(30,90,150,.35)'; retanguloRedondo(q, 4, 4, W - 8, H - 8, 18); q.fill();
    q.strokeStyle = 'rgba(140,210,255,.8)'; q.lineWidth = 3; retanguloRedondo(q, 4, 4, W - 8, H - 8, 18); q.stroke();
    q.fillStyle = '#e6f6ff'; q.font = `700 30px ${FONTE}`; q.fillText('TIME DE IA', 30, 52);
    AGENTES.slice(1).forEach((a, i) => {
      const y = 92 + i * 42, r = CAMPO.robos && CAMPO.robos.get(a.id);
      q.fillStyle = a.css; q.beginPath(); q.arc(42, y - 8, 9, 0, 7); q.fill();
      q.fillStyle = '#ffffff'; q.font = `700 24px ${FONTE}`; q.fillText(a.nome, 64, y);
      q.fillStyle = 'rgba(210,235,255,.85)'; q.font = `400 20px ${FONTE}`;
      const t = r ? textoDoEstado(r) : 'Disponível'; let tt = t; while (q.measureText(tt).width > W - 250 && tt.length > 4) tt = tt.slice(0, -2); if (tt !== t) tt += '…';
      q.fillText(tt, 200, y);
    });
    tex.needsUpdate = true;
  };
  desenhar(); CAMPO.telaDoTime = { tex, desenhar };
  return CAMPO.telaDoTime;
}

function dadosDaSala(s) {
  const d = diagnosticoDe(s), itens = itensDo(s.id);
  const abertos = itens.filter((g) => !ehOport(g) && situacaoDe(g) !== 'Resolvido').length;
  const oport = itens.filter((g) => ehOport(g) && situacaoDe(g) !== 'Resolvido').length;
  const horas = somaHoras(itens);
  return { saude: d.saude, nomeSaude: SAUDE[d.saude].nome, nota: d.nota, abertos, oport, horas };
}
// Tela grande da sala: os números de verdade do setor (vêm do painel; nada inventado)
function texQuadroDoSetor(s, D) {
  return textura(tela(1024, 576, (q, W, H) => {
    const g = q.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#101826'); g.addColorStop(1, '#070b12'); q.fillStyle = g; q.fillRect(0, 0, W, H);
    const cor = COR_SAUDE_CSS[D.saude];
    q.fillStyle = cor; q.fillRect(0, 0, 14, H);
    q.fillStyle = '#ffffff'; q.font = `700 64px ${FONTE}`; let t = s.nome, tam = 64; while (q.measureText(t).width > W - 120 && tam > 26) { tam *= 0.94; q.font = `700 ${tam}px ${FONTE}`; } q.fillText(t, 60, 100);
    q.fillStyle = cor; q.beginPath(); q.arc(76, 160, 12, 0, 7); q.fill(); q.font = `600 34px ${FONTE}`; q.fillText(D.nomeSaude, 100, 172);
    const caixas = [['Nota do check-up', D.nota == null ? '—' : String(D.nota)], ['Gargalos abertos', String(D.abertos)], ['Oportunidades', String(D.oport)], ['Horas devolvidas/mês', D.horas ? fmtHoras(D.horas) : '—']];
    caixas.forEach(([rot, v], i) => {
      const x = 60 + (i % 2) * 470, y = 230 + Math.floor(i / 2) * 160;
      q.fillStyle = 'rgba(255,255,255,.06)'; retanguloRedondo(q, x, y, 440, 136, 16); q.fill();
      q.fillStyle = 'rgba(200,215,235,.8)'; q.font = `500 26px ${FONTE}`; q.fillText(rot, x + 26, y + 44);
      q.fillStyle = i === 1 && v !== '0' ? '#ff9a5a' : '#ffffff'; q.font = `700 58px ${FONTE}`; q.fillText(v, x + 26, y + 110);
    });
  }));
}


// O que é de cada um (em cima da mesa e nos cantos)
function decorarCapsula(id, C, piso, s, R0) {
  const g = C.g, mt = piso + MESA_H, mz = (R0 + 1.15), mx = -0.25;
  const em = (obj, x, y, z, rot) => C.por(obj, x, y, z, rot);
  if (id === 'builder') {
    em(laptop(texTela('planta', '#9fd0ff', 1)), mx - 0.2, mt, mz + 0.05, 0);
    [0, 1, 2].forEach((k) => { const r = peca(GEO.cil12, padrao(0xbfe0ff, 0.7), mx + 0.35 + k * 0.05, mt + 0.03, mz - 0.05, 0.025, 0.4, 0.025, g); r.rotation.z = Math.PI / 2; r.position.x = mx + 0.2; r.position.z = mz - 0.12 + k * 0.06; });
    // maquete de prédio e a miniatura de escavadeira no canto
    const maq = new THREE.Group(); em(maq, -1.15, piso, (R0 + 1.95), 0.3); 
    bloco(0.6, 0.35, 0.5, 0.03, casco(0xf2f3f5), 0, 0, 0, maq);
    [[-0.15, 0.3, 0.2], [0.05, 0.55, 0.16], [0.18, 0.22, 0.14]].forEach(([x, h, w]) => bloco(w, h, w, 0.015, casco(0xffffff, 0.3), x, 0.35, 0.02, maq));
    peca(GEO.caixa, padrao(0xffbf1f, 0.4), 0.05, 0.35 + 0.55, 0.02, 0.012, 0.25, 0.012, maq);
    const esc = new THREE.Group(); em(esc, 1.0, piso, (R0 + 2.15), -0.6); 
    bloco(0.34, 0.1, 0.22, 0.03, padrao(0x2b2f36, 0.6), 0, 0, 0, esc); bloco(0.26, 0.16, 0.2, 0.03, padrao(0xffbf1f, 0.35), 0, 0.1, 0, esc);
    const braco = peca(GEO.caixa, padrao(0xffbf1f, 0.35), 0.18, 0.2, 0, 0.3, 0.05, 0.05, esc); braco.rotation.z = 0.5;
    bloco(0.12, 0.09, 0.14, 0.02, padrao(0x8b929c, 0.5), 0.36, 0.08, 0, esc);
    [-1, 1].forEach((k) => peca(new THREE.SphereGeometry(0.11, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), padrao(0xffbf1f, 0.35), -1.0 + k * 0.18, piso + 1.98, (R0 + 0.18), 1, 0.8, 1, g));
  } else if (id === 'report') {
    em(laptop(texTela('documento', '#3d8bff', 2)), mx, mt, mz + 0.05, 0);
    for (let k = 0; k < 3; k++) bloco(0.21, 0.04 + k * 0.012, 0.29, 0.004, padrao(0xffffff, 0.8), mx + 0.5, mt + k * 0.002, mz - 0.03 + k * 0.01, g).rotation.y = k * 0.1;
    const imp = new THREE.Group(); em(imp, 1.05, piso, (R0 + 2.05), -0.4); 
    bloco(0.55, 0.42, 0.45, 0.03, padrao(0x2b2f36, 0.5), 0, 0, 0, imp); bloco(0.5, 0.2, 0.4, 0.04, casco(0xf4f4f5), 0, 0.42, 0, imp); bloco(0.3, 0.01, 0.22, 0.003, padrao(0xffffff, 0.8), 0, 0.62, 0.12, imp);
    const est2 = estante(0.7, 1.2, 0.3, s, [0x3d8bff, 0x2b2f36, 0xf2f3f5, 0x5b8fd9, 0xd9d3c7]); em(est2, -1.15, piso, (R0 + 0.70), Math.PI / 2 - 0.15); 
  } else if (id === 'sherlock') {
    em(laptop(texTela('rede', '#b98cff', 3)), mx + 0.05, mt, mz + 0.05, 0);
    const lamp = new THREE.Group(); em(lamp, mx - 0.5, mt, mz - 0.05, 0.4);
    peca(GEO.cil, metal(0xc8a052, 0.3), 0, 0, 0, 0.07, 0.02, 0.07, lamp); peca(GEO.cil12, metal(0xc8a052, 0.3), 0, 0.02, 0, 0.012, 0.28, 0.012, lamp);
    peca(new THREE.CylinderGeometry(0.06, 0.12, 0.08, 24, 1, true), padrao(0x2f6b45, 0.35), 0, 0.31, 0.05, 1, 1, 1, lamp).rotation.x = 0.6;
    peca(GEO.esfera, luz(0xffd28a, 3), 0, 0.29, 0.07, 0.025, 0.025, 0.025, lamp);
    for (let k = 0; k < 4; k++) bloco(0.26 - k * 0.02, 0.05, 0.18, 0.006, padrao([0x5a3a2a, 0x8e5bd6, 0x2b2f36, 0x7a4a2a][k], 0.7), mx + 0.52, mt + k * 0.05, mz, g).rotation.y = (k - 1.5) * 0.15;
    const arq = new THREE.Group(); em(arq, 1.1, piso, (R0 + 2.00), -0.3); 
    bloco(0.45, 0.8, 0.45, 0.02, padrao(0x6b4a33, 0.6), 0, 0, 0, arq); [0.2, 0.45, 0.7].forEach((y) => peca(GEO.caixa, metal(0xc8a052), 0, y, 0.23, 0.12, 0.02, 0.02, arq));
    caixaPapelao(0.35, 0.22, 0.3, g, -1.15, piso, (R0 + 2.00));
  } else if (id === 'fix') {
    const ban = mesaTrabalho(0.9, 0.5, padrao(0x6b737d, 0.5, 0.4)); em(ban, -1.12, piso, (R0 + 1.00), Math.PI / 2 - 0.12); 
    // braço robótico pequeno na bancada
    const br = new THREE.Group(); em(br, -1.15, piso + MESA_H, (R0 + 0.85), 0.5);
    peca(GEO.cil, padrao(0x2b2f36, 0.4, 0.5), 0, 0, 0, 0.08, 0.06, 0.08, br);
    const s1 = new THREE.Group(); s1.position.y = 0.06; s1.rotation.z = 0.5; br.add(s1); peca(GEO.cil12, padrao(0x34c46a, 0.35), 0, 0, 0, 0.03, 0.26, 0.03, s1);
    const s2 = new THREE.Group(); s2.position.y = 0.26; s2.rotation.z = -1.4; s1.add(s2); peca(GEO.esfera, padrao(0x2b2f36, 0.4, 0.5), 0, 0, 0, 0.045, 0.045, 0.045, s2); peca(GEO.cil12, padrao(0x34c46a, 0.35), 0, 0, 0, 0.025, 0.2, 0.025, s2);
    peca(GEO.caixa, padrao(0x2b2f36, 0.4, 0.5), 0, 0.2, 0, 0.07, 0.05, 0.03, s2);
    CAMPO.animados.push((t) => { s1.rotation.z = 0.5 + Math.sin(t * 0.9) * 0.25; s2.rotation.z = -1.4 + Math.sin(t * 1.3) * 0.3; br.rotation.y = 0.5 + Math.sin(t * 0.5) * 0.5; });
    s1.userData.vivo = true; br.userData.vivo = true;
    em(monitor(0.5, 0.3, texTela('codigo', '#34c46a', 5)), mx + 0.25, mt, mz + 0.05, 0);
    em(laptop(texTela('codigo', '#34c46a', 6)), mx - 0.35, mt, mz + 0.02, 0.15);
    const car = new THREE.Group(); em(car, 1.05, piso, (R0 + 2.10), -0.5); 
    bloco(0.5, 0.62, 0.4, 0.03, padrao(0xd9413a, 0.35, 0.2), 0, 0.06, 0, car); [0.2, 0.36, 0.52].forEach((y) => peca(GEO.caixa, metal(0xd0d4da), 0, y + 0.06, 0.205, 0.3, 0.02, 0.02, car));
  } else if (id === 'scout') {
    em(laptop(texTela('mapa', '#22d3c0', 3)), mx + 0.1, mt, mz + 0.05, 0);
    const gl = new THREE.Group(); em(gl, mx - 0.48, mt, mz - 0.02, 0);
    peca(GEO.cil, metal(0xc8a052), 0, 0, 0, 0.07, 0.02, 0.07, gl); peca(GEO.cil12, metal(0xc8a052), 0, 0.02, 0, 0.01, 0.1, 0.01, gl);
    const esf = peca(GEO.esfera, new THREE.MeshStandardMaterial({ map: texTela('mapa', '#2a9d8f', 9), roughness: 0.4 }), 0, 0.22, 0, 0.11, 0.11, 0.11, gl); esf.userData.vivo = true;
    CAMPO.animados.push((t) => { esf.rotation.y = t * 0.3; });
    const tri = new THREE.Group(); em(tri, 1.05, piso, (R0 + 2.05), -0.7); 
    [0, 2.1, 4.2].forEach((a) => { const p = peca(GEO.cil12, metal(ESC.grafite), Math.sin(a) * 0.12, 0, Math.cos(a) * 0.12, 0.012, 0.95, 0.012, tri); p.rotation.set(Math.cos(a) * 0.2, 0, -Math.sin(a) * 0.2); });
    const tel = peca(GEO.cil12, casco(0xf2f3f5, 0.3), 0, 0.98, 0, 0.05, 0.55, 0.05, tri); tel.rotation.z = 1.2; tel.position.x = -0.24;
    peca(GEO.cil12, padrao(0x22b8a6, 0.4), 0.02, 0.97, 0, 0.06, 0.06, 0.06, tri).rotation.z = 1.2;
  } else if (id === 'data') {
    [-0.42, 0, 0.42].forEach((x, k) => em(monitor(0.4, 0.26, texTela(['barras', 'linhas', 'rede'][k], '#22d3ee', 10 + k)), mx + x, mt, mz + 0.08 - Math.abs(x) * 0.25, -x * 0.9));
    const sv = new THREE.Group(); em(sv, -1.12, piso, (R0 + 0.70), Math.PI / 2); 
    bloco(0.42, 1.1, 0.55, 0.03, padrao(0x1b1e23, 0.4, 0.3), 0, 0, 0, sv);
    for (let k = 0; k < 8; k++) { const l = peca(GEO.caixa, luz(k % 3 ? 0x22d3ee : ESC.laranja, 3), -0.12 + (k % 2) * 0.05, 0.15 + k * 0.11, 0.28, 0.025, 0.012, 0.005, sv); l.userData.vivo = true; CAMPO.animados.push((t) => { l.visible = Math.sin(t * (2 + k * 0.7) + k) > -0.3; }); }
    // gráfico de barras holográfico sobre um pedestal
    const ped = new THREE.Group(); em(ped, 1.05, piso, (R0 + 2.00), 0); 
    peca(GEO.cil, casco(0xf2f3f5), 0, 0, 0, 0.18, 0.55, 0.18, ped); peca(new THREE.TorusGeometry(0.15, 0.01, 6, 36).rotateX(Math.PI / 2), luz(0x22d3ee, 3), 0, 0.56, 0, 1, 1, 1, ped);
    for (let k = 0; k < 5; k++) { const b = new THREE.Mesh(GEO.caixa, holo(k === 3 ? ESC.laranja : 0x22d3ee, 0.55)); b.scale.set(0.05, 0.1, 0.05); b.position.set(-0.12 + k * 0.06, 0.62, 0); b.userData.vivo = true; ped.add(b); CAMPO.animados.push((t) => { b.scale.y = 0.12 + (Math.sin(t * 0.8 + k * 1.3) + 1) * 0.12; }); }
  } else if (id === 'pixel') {
    const mesaT = new THREE.Group(); em(mesaT, mx - 0.05, mt, mz + 0.02, 0);
    const tab = peca(caixaRedonda(0.5, 0.012, 0.34, 0.02), padrao(0x1b1e23, 0.3), 0, 0.02, 0, 1, 1, 1, mesaT); tab.rotation.x = -0.35;
    const tt = telaPlana(0.46, 0.3, texTela('onda', '#e0459b', 7)); tt.rotation.set(-Math.PI / 2, 0, Math.PI); tt.position.set(0, 0.013, 0); tab.add(tt);   // tela deitada em cima da mesa digitalizadora (de cabeça para quem desenha)
    const copo = new THREE.Group(); em(copo, mx + 0.5, mt, mz - 0.05, 0); peca(GEO.cil, casco(0xff6ec7, 0.35), 0, 0, 0, 0.045, 0.1, 0.045, copo);
    ['#ff7a1a', '#22d3ee', '#ffbf1f', '#8e5bd6', '#34c46a'].forEach((c, k) => { const lp = peca(GEO.cil12, padrao(new THREE.Color(c).getHex(), 0.4), Math.cos(k) * 0.02, 0.05, Math.sin(k) * 0.02, 0.006, 0.16, 0.006, copo); lp.rotation.set(Math.cos(k) * 0.15, 0, Math.sin(k) * 0.15); });
    const cav = new THREE.Group(); em(cav, 1.0, piso, (R0 + 1.95), -0.55); 
    [-0.2, 0.2].forEach((x) => { const p = peca(GEO.caixa, padrao(0xc49a6c, 0.6), x, 0, 0.05, 0.03, 1.25, 0.03, cav); p.rotation.z = -x * 0.25; });
    peca(GEO.caixa, padrao(0xc49a6c, 0.6), 0, 0, -0.2, 0.03, 1.15, 0.03, cav).rotation.x = -0.3;
    const pin = quadro(0.62, 0.48, texTela('onda', '#e0459b', 12)); pin.position.set(0, 0.55, 0.1); pin.rotation.x = -0.12; cav.add(pin);
    const pufe = peca(GEO.esfera, padrao(0xe0459b, 0.85), -1.1, piso + 0.18, (R0 + 2.00), 0.32, 0.2, 0.32, g); pufe.castShadow = true;
    peca(GEO.esfera, padrao(0xff8fd0, 0.85), -1.1, piso + 0.3, (R0 + 2.00), 0.22, 0.1, 0.22, g);
  }
}


// Mesa com cadeira atrás (quem senta olha para a porta, de frente para a câmera)
function postoDeTrabalho(C, x, z, rot, telaTipo, cor, s, dois) {
  const g = new THREE.Group(); C.por(g, x, 0, z, rot + Math.PI);
  g.add(mesaTrabalho(1.3, 0.62));
  const cad = cadeira(cor || ESC.couro); cad.position.set(0, 0, -0.62); g.add(cad);
  if (dois) [-0.28, 0.28].forEach((dx, k) => { const m = monitor(0.42, 0.26, texTela(telaTipo, '#4fd1ff', s() * 100 | 0)); m.position.set(dx, MESA_H, 0.05); m.rotation.y = -dx * 0.6; g.add(m); });
  else { const m = monitor(0.56, 0.33, texTela(telaTipo, '#4fd1ff', s() * 100 | 0)); m.position.set(0, MESA_H, 0.06); g.add(m); }
  peca(GEO.caixa, padrao(0x2b2f36, 0.5), 0.3, MESA_H, -0.12, 0.3, 0.012, 0.1, g);
  if (s() > 0.5) peca(torneado([[0, 0], [0.035, 0], [0.037, 0.08], [0, 0.08]], 16), casco(s() > 0.5 ? 0xffffff : ESC.laranja), -0.45, MESA_H, -0.05, 1, 1, 1, g);
  
  return g;
}
function mobiliarSala(tipo, C, h0, r0, r1, larg, s) {
  const g = C.g, zf = r1 - 0.9, zm = (r0 + r1) / 2 + 0.3, lx = larg / 2 - 0.55;
  const plantaEm = (x, z, k) => { const p = planta(k || 1.1, s); C.por(p, x, h0, z, 0); };
  if (tipo === 'reuniao') {
    const mesa = new THREE.Group(); C.por(mesa, 0, h0, zm, 0);
    peca(caixaRedonda(3.0, 0.05, 1.15, 0.2), casco(0xf7f7f8, 0.2), 0, MESA_H - 0.05, 0, 1, 1, 1, mesa);
    [-0.9, 0.9].forEach((x) => bloco(0.18, MESA_H - 0.05, 0.7, 0.06, metal(ESC.grafite, 0.4), x, 0, 0, mesa));
    peca(GEO.caixa, luz(ESC.laranja, 2.4), 0, MESA_H - 0.06, 0.58, 2.6, 0.01, 0.01, mesa);
    mesa.add(sombraNoChao(3.8, 2.0, 0.55));
    
    [-1.05, -0.35, 0.35, 1.05].forEach((x, k) => [-1, 1].forEach((lado) => {
      const c = cadeira(ESC.couro); C.por(c, x, h0, zm + lado * 0.85, lado > 0 ? Math.PI : 0);
      C.lugar('reuniao-' + k + (lado > 0 ? 'f' : 't'), x, zm + lado * 0.85, lado > 0 ? Math.PI : 0, 'sentar', { y: h0, sala: 'reuniao', reuniao: true });
    }));
    const cred = new THREE.Group(); C.por(cred, 0, h0, r1 - 0.42, Math.PI); bloco(2.6, 0.5, 0.42, 0.04, padrao(0x2b2f36, 0.4, 0.2), 0, 0, 0, cred);
    plantaEm(-lx + 0.1, r1 - 0.7, 1.3); plantaEm(lx - 0.1, r1 - 0.7, 1.3);
    return;
  }
  if (tipo === 'financeiro') {
    postoDeTrabalho(C, -0.95, zf - 0.55, 0.12, 'linhas', ESC.grafite, s, true); postoDeTrabalho(C, 1.15, zf - 0.55, -0.12, 'barras', ESC.grafite, s, true);
    const arq = new THREE.Group(); C.por(arq, lx - 0.1, h0, r0 + 0.9, -Math.PI / 2 - 0.15); bloco(0.5, 0.95, 0.5, 0.02, padrao(0x3a3f47, 0.45, 0.4), 0, 0, 0, arq); [0.3, 0.6, 0.85].forEach((y) => peca(GEO.caixa, metal(0xd6dadf), 0, y, 0.255, 0.16, 0.02, 0.02, arq)); 
    plantaEm(-lx + 0.05, r0 + 0.8, 1.2);
  } else if (tipo === 'marketing') {
    postoDeTrabalho(C, 0.9, zf - 0.5, -0.15, 'onda', ESC.couro, s, false);
    const mood = new THREE.Group(); C.por(mood, -lx + 0.35, h0, zm - 0.1, Math.PI / 2 - 0.35); const q = quadro(1.3, 0.9, texTela('moodboard', '#e0459b', 21)); q.position.y = 0.75; mood.add(q);
    [-0.6, 0.6].forEach((x) => peca(GEO.cil12, metal(ESC.grafite), x, 0, 0, 0.02, 1.7, 0.02, mood)); 
    const anelL = new THREE.Group(); C.por(anelL, -0.6, h0, r1 - 1.0, Math.PI + 0.4); peca(GEO.cil12, metal(ESC.grafite), 0, 0, 0, 0.015, 1.45, 0.015, anelL);
    peca(new THREE.TorusGeometry(0.24, 0.025, 10, 48), luz(0xfff1e0, 2.2), 0, 1.6, 0, 1, 1, 1, anelL); 
    const pol = new THREE.Group(); C.por(pol, lx - 0.25, h0, r0 + 1.0, -Math.PI / 2 - 0.5); bloco(0.75, 0.3, 0.7, 0.12, couro(ESC.couro), 0, 0.12, 0, pol); bloco(0.75, 0.42, 0.18, 0.08, couro(ESC.couro), 0, 0.3, -0.28, pol); 
    plantaEm(lx - 0.1, r1 - 0.75, 1.2);
  } else if (tipo === 'comercial') {
    postoDeTrabalho(C, -1.0, zf - 0.5, 0.1, 'funil', ESC.couro, s, false); postoDeTrabalho(C, 1.1, zf - 0.5, -0.1, 'barras', ESC.couro, s, false);
    const mr = mesaRedonda(0.45, MESA_H); C.por(mr, 0.1, h0, r0 + 1.25, 0); 
    [-0.7, 0.9].forEach((x) => C.por(cadeira(ESC.grafite), 0.1 + x, h0, r0 + 1.25, x < 0 ? Math.PI / 2 : -Math.PI / 2));
    plantaEm(-lx + 0.1, r0 + 0.75, 1.2);
  } else if (tipo === 'logistica') {
    [-1, 1].forEach((k) => {
      const rack = new THREE.Group(); C.por(rack, k * (lx - 0.25), h0, zm - 0.1, k * Math.PI / 2 * -1); const az = metal(0x3d5a80, 0.5);
      [-0.75, 0.75].forEach((x) => [-0.22, 0.22].forEach((z) => peca(GEO.caixa, az, x, 0, z, 0.05, 1.7, 0.05, rack)));
      [0.05, 0.62, 1.2].forEach((y) => { peca(GEO.caixa, metal(0xff8a2a, 0.5), 0, y, 0, 1.55, 0.04, 0.5, rack); for (let i = 0; i < 3; i++) if (s() > 0.2) caixaPapelao(0.38 + s() * 0.1, 0.22 + s() * 0.2, 0.36, rack, -0.5 + i * 0.5, y + 0.04, 0); });
      
    });
    postoDeTrabalho(C, 0.2, zf - 0.45, 0, 'mapa', ESC.couro, s, true);
    const pal = new THREE.Group(); C.por(pal, -0.9, h0, r0 + 0.95, 0.3); bloco(0.9, 0.1, 0.7, 0.01, padrao(0xb8915c, 0.9), 0, 0, 0, pal);
    for (let i = 0; i < 4; i++) caixaPapelao(0.4, 0.3, 0.32, pal, -0.22 + (i % 2) * 0.44, 0.1 + Math.floor(i / 2) * 0.3, 0); 
    const kb = quadro(1.1, 0.62, texTela('kanban', '#4fd1ff', 31)); C.por(kb, 1.15, h0 + 1.0, r0 + 0.25, Math.PI);
  } else if (tipo === 'rh') {
    const tap = new THREE.Mesh(new THREE.CircleGeometry(1.15, 48).rotateX(-Math.PI / 2), padrao(0xd8cfc2, 0.98)); C.por(tap, -0.4, h0 + 0.016, zm - 0.1, 0);
    const sf = sofa(1.9); C.por(sf, -0.4, h0, zm - 0.95, 0); 
    const mc = mesaRedonda(0.35, 0.3); C.por(mc, -0.4, h0, zm - 0.05, 0); 
    const pol = new THREE.Group(); C.por(pol, 0.95, h0, zm + 0.1, -Math.PI / 2 - 0.4); bloco(0.75, 0.3, 0.7, 0.12, padrao(ESC.tecido, 0.9), 0, 0.12, 0, pol); bloco(0.75, 0.42, 0.18, 0.08, padrao(ESC.tecido, 0.9), 0, 0.3, -0.28, pol); 
    const est = estante(1.4, 1.6, 0.32, s); C.por(est, lx - 0.15, h0, zf - 0.3, -Math.PI / 2 - 0.25); 
    plantaEm(-lx + 0.1, r1 - 0.75, 1.4); plantaEm(lx - 0.05, r0 + 0.7, 1.1);
  } else if (tipo === 'diretoria') {
    const mesa = new THREE.Group(); C.por(mesa, 0.3, h0, zf - 0.55, Math.PI);
    bloco(1.9, 0.06, 0.85, 0.02, guardado('mesaDir', () => new THREE.MeshStandardMaterial({ map: texMadeira('escura'), roughness: 0.3 })), 0, MESA_H - 0.06, 0, mesa);
    bloco(1.7, MESA_H - 0.06, 0.7, 0.04, padrao(0x2b2f36, 0.4, 0.3), 0, 0, 0, mesa); peca(GEO.caixa, luz(ESC.laranja, 2.4), 0, 0.3, 0.36, 1.6, 0.012, 0.01, mesa);
    const cd = cadeira(0x2b2f36); cd.scale.set(1.15, 1.15, 1.15); cd.position.set(0, 0, -0.72); mesa.add(cd);
    const mo = monitor(0.58, 0.34, texTela('linhas', '#4fd1ff', 41)); mo.position.set(-0.3, MESA_H, 0.05); mesa.add(mo);
    
    [-0.15, 0.75].forEach((x) => C.por(cadeira(ESC.couro), 0.3 + x - 0.3, h0, zf - 1.45, Math.PI));
    const est = estante(1.3, 1.7, 0.32, s, [0x5a3a2a, 0x2b2f36, 0xc8a052, 0xd9d3c7]); C.por(est, -lx + 0.15, h0, zm - 0.2, Math.PI / 2 + 0.2); 
    plantaEm(lx - 0.1, r0 + 0.8, 1.3);
  } else if (tipo === 'tecnologia') {
    postoDeTrabalho(C, -0.9, zf - 0.5, 0.1, 'codigo', ESC.grafite, s, true); postoDeTrabalho(C, 1.1, zf - 0.5, -0.1, 'rede', ESC.grafite, s, true);
    const rk = new THREE.Group(); C.por(rk, lx - 0.2, h0, r0 + 1.0, -Math.PI / 2 - 0.2); bloco(0.6, 1.8, 0.7, 0.03, padrao(0x15171b, 0.35, 0.4), 0, 0, 0, rk);
    for (let k = 0; k < 10; k++) { const l = peca(GEO.caixa, luz(k % 4 ? 0x34c46a : ESC.laranja, 3), -0.2 + (k % 3) * 0.05, 0.2 + k * 0.15, 0.355, 0.03, 0.012, 0.005, rk); l.userData.vivo = true; CAMPO.animados.push((t) => { l.visible = Math.sin(t * (1.7 + k * 0.6) + k) > -0.4; }); }
    
    plantaEm(-lx + 0.1, r0 + 0.8, 1.1);
  } else if (tipo === 'atendimento') {
    [-1.1, 0.1, 1.3].forEach((x, k) => postoDeTrabalho(C, x, zf - 0.5 - (k === 1 ? 0.1 : 0), (1 - k) * 0.12, k === 1 ? 'kanban' : 'linhas', ESC.couro, s, false));
    plantaEm(-lx + 0.1, r0 + 0.8, 1.2); plantaEm(lx - 0.1, r0 + 0.8, 1.0);
  } else {   // operações e escritório comum
    postoDeTrabalho(C, -0.95, zf - 0.5, 0.1, tipo === 'operacoes' ? 'barras' : 'linhas', ESC.couro, s, false); postoDeTrabalho(C, 1.1, zf - 0.5, -0.1, tipo === 'operacoes' ? 'kanban' : 'barras', ESC.couro, s, false);
    if (tipo === 'operacoes') { const kb = quadro(1.2, 0.68, texTela('kanban', '#4fd1ff', 33)); C.por(kb, -lx + 0.2, h0 + 0.95, zm, Math.PI / 2 - 0.2); }
    const est = estante(1.2, 1.4, 0.32, s); C.por(est, lx - 0.15, h0, r0 + 1.1, -Math.PI / 2 - 0.25); 
    plantaEm(-lx + 0.1, r0 + 0.8, 1.2);
  }
}
