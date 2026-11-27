/* =====================================================================
   ROBÔS — o corpo de cada agente e o rosto digital.
   Todos seguem o mesmo esqueleto (pernas, tronco, ombros, cotovelos, pescoço e cabeça), assim as
   animações servem para todos. O que muda é a forma: cada um tem corpo, cabeça e acessórios próprios.
   Esqueleto (de baixo para cima):
     g (pé no chão, virado para +z) → corpo → quadril → pernas (E, D) e tronco → ombros (E, D) → cotovelos
                                                                         → pescoço → cabeça
   O rosto é um canvas pequeno (olhos acesos) aplicado no visor; muda só quando a expressão muda.
   ===================================================================== */

const COR_OLHO = '#62ecff';
// Desenha os olhos no canvas do visor. dx/dy: para onde olha (-1 a 1). expr: normal, feliz, foco, ouvindo, duvida, preocupado, piscar
function desenharOlhos(q, W, H, expr, dx, dy, cor) {
  q.fillStyle = '#000'; q.fillRect(0, 0, W, H);
  const cx = W / 2 + dx * W * 0.07, cy = H * 0.5 + dy * H * 0.1, sep = W * 0.15, c = cor || COR_OLHO;
  q.save(); q.shadowColor = c; q.shadowBlur = W * 0.04; q.fillStyle = c; q.strokeStyle = c; q.lineCap = 'round'; q.lineWidth = W * 0.035;
  const pilula = (x, y, w, h) => { retanguloRedondo(q, x - w / 2, y - h / 2, w, h, Math.min(w, h) / 2); q.fill(); };
  [-1, 1].forEach((k) => {
    const x = cx + k * sep;
    if (expr === 'piscar') { q.beginPath(); q.moveTo(x - W * 0.04, cy); q.lineTo(x + W * 0.04, cy); q.stroke(); }
    else if (expr === 'feliz') { q.beginPath(); q.arc(x, cy + H * 0.06, W * 0.045, Math.PI * 1.1, Math.PI * 1.9); q.stroke(); }
    else if (expr === 'foco') { pilula(x, cy + H * 0.03, W * 0.075, H * 0.17); q.save(); q.globalCompositeOperation = 'destination-out'; q.shadowBlur = 0; q.fillRect(x - W * 0.06, cy - H * 0.2, W * 0.12, H * 0.13); q.restore(); }
    else if (expr === 'ouvindo') { q.beginPath(); q.arc(x, cy, W * 0.05, 0, Math.PI * 2); q.fill(); q.save(); q.fillStyle = '#000'; q.shadowBlur = 0; q.beginPath(); q.arc(x + W * 0.012, cy - H * 0.05, W * 0.014, 0, 7); q.fill(); q.restore(); }
    else if (expr === 'duvida') { pilula(x, cy + (k < 0 ? H * 0.05 : -H * 0.04), W * 0.06, k < 0 ? H * 0.12 : H * 0.26); }
    else if (expr === 'preocupado') { pilula(x, cy + H * 0.04, W * 0.065, H * 0.2); q.save(); q.globalCompositeOperation = 'destination-out'; q.shadowBlur = 0; q.beginPath(); q.moveTo(x - W * 0.06, cy - H * 0.2); q.lineTo(x + W * 0.06, cy - H * 0.2); q.lineTo(x + k * W * 0.06, cy - H * 0.02); q.closePath(); q.fill(); q.restore(); }
    else pilula(x, cy, W * 0.07, H * 0.25);
  });
  if (expr === 'feliz' || expr === 'normal') { q.lineWidth = W * 0.02; q.beginPath(); q.arc(cx, cy + H * (expr === 'feliz' ? 0.14 : 0.17), W * (expr === 'feliz' ? 0.05 : 0.03), Math.PI * 0.15, Math.PI * 0.85); q.stroke(); }
  if (expr === 'duvida') { q.font = `700 ${H * 0.28}px ${FONTE}`; q.textAlign = 'center'; q.fillText('?', cx + sep * 2.1, cy - H * 0.15); }
  q.restore();
}
// Mãos, braços e pernas (cápsula com a ponta em cima no ponto de giro)
function capsula(raio, comp) { const ch = 'cap:' + raio + ':' + comp; if (!GEO[ch]) GEO[ch] = new THREE.CapsuleGeometry(raio, comp, 4, 14).translate(0, -comp / 2 - raio * 0.4, 0); return GEO[ch]; }
function textoManchas() {
  return texGuardada('manchas', () => textura(tela(512, 256, (q, W, H) => {
    q.fillStyle = '#f6f6f7'; q.fillRect(0, 0, W, H); const s = sorteio(8);
    ['#ff7a1a', '#e0459b', '#22d3ee', '#ffbf1f', '#8e5bd6', '#34c46a'].forEach((c) => { for (let i = 0; i < 4; i++) { q.fillStyle = c; q.beginPath(); const x = s() * W, y = s() * H, r = 6 + s() * 16; q.arc(x, y, r, 0, 7); q.fill(); for (let k = 0; k < 5; k++) { q.beginPath(); q.arc(x + (s() - 0.5) * r * 3, y + (s() - 0.5) * r * 3, r * 0.25 * s(), 0, 7); q.fill(); } } });
  })));
}

/* Medidas e jeito de cada corpo. perna = altura do quadril; tronco = altura do tronco; cab = raio da cabeça
   e a escala dela (largura, altura, fundo); visor = largura e altura do visor (radianos na esfera) */
const CORPOS = {
  atlas: { perna: 0.27, pe: [0.13, 0.075, 0.2], larguraQuadril: 0.1, tronco: 0.35, ombro: [0.205, 0.27], braco: [0.042, 0.11, 0.1], mao: 0.058, cab: [0.255, 1.08, 0.95, 1.0], visor: [2.15, 1.3], orelha: 0.09 },
  builder: { perna: 0.25, pe: [0.15, 0.085, 0.22], larguraQuadril: 0.12, tronco: 0.36, ombro: [0.25, 0.28], braco: [0.056, 0.11, 0.1], mao: 0.07, cab: [0.24, 1.12, 0.92, 1.0], visor: [2.0, 1.1], orelha: 0 },
  report: { perna: 0.3, pe: [0.12, 0.07, 0.19], larguraQuadril: 0.09, tronco: 0.4, ombro: [0.175, 0.32], braco: [0.038, 0.12, 0.11], mao: 0.05, cab: [0.23, 1.0, 1.02, 1.0], visor: [2.0, 1.2], orelha: 0 },
  sherlock: { perna: 0.22, pe: [0.12, 0.07, 0.18], larguraQuadril: 0.09, tronco: 0.35, ombro: [0.2, 0.26], braco: [0.042, 0.1, 0.09], mao: 0.052, cab: [0.245, 1.04, 0.96, 1.0], visor: [2.05, 1.15], orelha: 0 },
  fix: { perna: 0.26, pe: [0.14, 0.08, 0.2], larguraQuadril: 0.11, tronco: 0.34, ombro: [0.22, 0.27], braco: [0.04, 0.12, 0.11], mao: 0.05, cab: [0.235, 1.05, 0.95, 1.0], visor: [2.05, 1.15], orelha: 0 },
  scout: { perna: 0.34, pe: [0.12, 0.07, 0.19], larguraQuadril: 0.09, tronco: 0.33, ombro: [0.18, 0.26], braco: [0.036, 0.12, 0.11], mao: 0.048, cab: [0.235, 1.08, 0.92, 1.0], visor: [2.65, 1.05], orelha: 0 },
  data: { perna: 0.28, pe: [0.12, 0.07, 0.19], larguraQuadril: 0.1, tronco: 0.34, ombro: [0.2, 0.27], braco: [0.04, 0.11, 0.1], mao: 0.052, cab: [0.23, 1, 1, 1], visor: null, orelha: 0 },
  pixel: { perna: 0.26, pe: [0.13, 0.075, 0.19], larguraQuadril: 0.1, tronco: 0.34, ombro: [0.2, 0.25], braco: [0.04, 0.11, 0.1], mao: 0.055, cab: [0.245, 1.06, 0.96, 1.0], visor: [2.1, 1.2], orelha: 0 }
};

function montarRobo(a) {
  const T = THREE, M = CORPOS[a.id], branco = casco(0xf7f8f9, 0.26), junta = padrao(0x2a2e35, 0.38, 0.55), acento = padrao(a.cor, 0.35, 0.1), aceso = luz(a.cor, 2.8);
  const r = { a, id: a.id, M, g: new T.Group(), partes: {} };
  const g = r.g; g.userData.robo = a.id;
  const corpo = new T.Group(); g.add(corpo);
  const quadril = new T.Group(); quadril.position.y = M.perna; corpo.add(quadril);
  // pernas: coxa curta + pé arredondado (a sola tem a cor de destaque)
  const pernas = [-1, 1].map((k) => {
    const p = new T.Group(); p.position.set(k * M.larguraQuadril, 0, 0); quadril.add(p);
    peca(capsula(0.05, Math.max(0.02, M.perna - 0.16)), junta, 0, 0, 0, 1, 1, 1, p);
    const pe = new T.Group(); pe.position.y = -M.perna + 0.005; p.add(pe);
    bloco(M.pe[0], M.pe[1], M.pe[2], 0.04, branco, 0, 0.012, 0.025, pe);
    bloco(M.pe[0] * 0.96, 0.02, M.pe[2] * 0.96, 0.01, a.id === 'builder' ? acento : junta, 0, 0, 0.025, pe);
    return p;
  });
  const tronco = new T.Group(); quadril.add(tronco);
  // ombros e braços
  const bracos = [-1, 1].map((k) => {
    const ombro = new T.Group(); ombro.position.set(k * M.ombro[0], M.ombro[1], 0); tronco.add(ombro);
    peca(GEO.esfera, junta, 0, 0, 0, M.braco[0] * 1.25, M.braco[0] * 1.25, M.braco[0] * 1.25, ombro);
    peca(capsula(M.braco[0], M.braco[1]), a.id === 'fix' ? junta : branco, 0, 0, 0, 1, 1, 1, ombro);
    const cotovelo = new T.Group(); cotovelo.position.y = -M.braco[1] - M.braco[0] * 0.6; ombro.add(cotovelo);
    peca(GEO.esfera, junta, 0, 0, 0, M.braco[0] * 0.95, M.braco[0] * 0.95, M.braco[0] * 0.95, cotovelo);
    peca(capsula(M.braco[0] * 0.95, M.braco[2]), a.id === 'fix' ? junta : branco, 0, 0, 0, 1, 1, 1, cotovelo);
    const mao = new T.Group(); mao.position.y = -M.braco[2] - M.braco[0] * 0.9; cotovelo.add(mao);
    if (!(a.id === 'fix')) peca(GEO.esfera, branco, 0, -M.mao * 0.4, 0, M.mao, M.mao * 1.1, M.mao * 0.9, mao);
    return { ombro, cotovelo, mao };
  });
  const pescoco = new T.Group(); pescoco.position.y = M.tronco + 0.02; tronco.add(pescoco);
  peca(GEO.cil, junta, 0, -0.03, 0, 0.055, 0.07, 0.055, pescoco);
  const cabeca = new T.Group(); cabeca.position.y = 0.04; pescoco.add(cabeca);
  const [R, ex, ey, ez] = M.cab;
  const casca = new T.Group(); casca.scale.set(ex, ey, ez); casca.position.y = R * ey; cabeca.add(casca);
  // rosto: canvas dos olhos
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; const tx = new T.CanvasTexture(cv); tx.encoding = T.sRGBEncoding;
  r.rosto = { cv, tx, chave: '' };
  const matVisor = new T.MeshPhysicalMaterial({ color: 0x06080b, roughness: 0.07, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.04, emissive: 0xffffff, emissiveMap: tx, emissiveIntensity: 2.3 });
  if (a.id === 'data') {
    peca(caixaRedonda(0.46, 0.38, 0.4, 0.13), branco, 0, -0.19, 0, 1, 1, 1, cabeca).position.set(0, 0.02, 0);
    const painel = peca(caixaRedonda(0.39, 0.21, 0.04, 0.07), new T.MeshPhysicalMaterial({ color: 0x06080b, roughness: 0.06, metalness: 0.2, clearcoat: 1 }), 0, 0.1, 0.185, 1, 1, 1, cabeca);
    const olhos = new T.Mesh(GEO.plano, new T.MeshBasicMaterial({ map: tx, transparent: true, blending: T.AdditiveBlending, depthWrite: false })); olhos.scale.set(0.37, 0.185, 1); olhos.position.set(0, 0.205, 0.227); olhos.material.color.multiplyScalar(2.2); cabeca.add(olhos); painel.castShadow = false;
    [-1, 1].forEach((k) => { bloco(0.03, 0.16, 0.16, 0.012, junta, k * 0.24, 0.12, 0, cabeca); peca(GEO.caixa, aceso, k * 0.258, 0.14, 0, 0.006, 0.12, 0.1, cabeca); });
    const halo = new T.Mesh(new T.TorusGeometry(0.17, 0.006, 6, 64).rotateX(Math.PI / 2), holo(0x22d3ee, 0.9)); halo.position.y = 0.52; halo.userData.vivo = true; cabeca.add(halo); r.partes.halo = halo;
  } else {
    peca(GEO.esferaFina, branco, 0, 0, 0, R, R, R, casca);
    const [L, V] = M.visor;
    const visor = new T.Mesh(new T.SphereGeometry(R * 1.012, 48, 28, Math.PI / 2 - L / 2, L, Math.PI / 2 - V / 2 + 0.06, V), matVisor); casca.add(visor);
    // aro do visor (dá acabamento, como o capacete de um astronauta de brinquedo)
    if (M.orelha) [-1, 1].forEach((k) => {
      const o = new T.Group(); o.position.set(k * R * 1.0, 0, 0); casca.add(o);
      // fone de ouvido: disco deitado de lado, anel aceso e o miolo escuro
      peca(GEO.cilX, a.id === 'builder' ? acento : branco, 0, 0, 0, 0.06, M.orelha, M.orelha, o);
      const anel = new T.Mesh(new T.TorusGeometry(M.orelha * 0.72, 0.011, 8, 40), luz(a.id === 'atlas' ? ESC.laranja : a.cor, 3)); anel.rotation.y = Math.PI / 2; anel.position.x = k * 0.031; o.add(anel);
      peca(GEO.cilX, junta, k * 0.03, 0, 0, 0.012, M.orelha * 0.55, M.orelha * 0.55, o);
    });
  }
  // ---- tronco e acessórios de cada um ----
  if (a.id === 'atlas') {
    peca(torneado([[0, -0.02], [0.13, -0.02], [0.18, 0.03], [0.205, 0.12], [0.2, 0.22], [0.17, 0.3], [0.12, 0.35], [0, 0.36]]), branco, 0, 0, 0, 1, 1, 1, tronco);
    peca(GEO.toro, aceso, 0, 0.035, 0, 0.17, 1.5, 0.17, tronco);
    const emb = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 0.012, 32).rotateX(Math.PI / 2), padrao(ESC.navy, 0.3, 0.2)); emb.position.set(0, 0.2, 0.198); tronco.add(emb);
    const sim = new T.Mesh(GEO.plano, guardado('simboloPeito', () => new T.MeshBasicMaterial({ map: comSimbolo(textura(tela(128, 128, (q) => { if (simboloPronto()) q.drawImage(IMG_SIMBOLO, 8, 8, 112, 112); })), () => {}), transparent: true })));
    if (!simboloPronto() && IMG_SIMBOLO) IMG_SIMBOLO.addEventListener('load', () => { const c = sim.material.map.image; c.getContext('2d').drawImage(IMG_SIMBOLO, 8, 8, 112, 112); sim.material.map.needsUpdate = true; }, { once: true });
    sim.scale.set(0.11, 0.11, 1); sim.position.set(0, 0.2, 0.206); tronco.add(sim);
    peca(GEO.cil12, junta, 0, R * 2 * ey + 0.0, 0, 0.008, 0.1, 0.008, cabeca); peca(GEO.esfera, luz(ESC.laranja, 3.4), 0, R * 2 * ey + 0.11, 0, 0.022, 0.022, 0.022, cabeca);
    peca(tuboPor([[-R * 1.07, R * 0.8, 0.02], [-R * 0.95, R * 0.45, 0.16], [-R * 0.45, R * 0.35, 0.27]], 0.008), junta, 0, 0, 0, 1, 1, 1, cabeca);
    peca(GEO.esfera, luz(ESC.laranja, 2.5), -R * 0.42, R * 0.35, 0.275, 0.014, 0.014, 0.014, cabeca);
  } else if (a.id === 'builder') {
    bloco(0.44, 0.36, 0.32, 0.11, branco, 0, -0.01, 0, tronco);
    [-1, 1].forEach((k) => bloco(0.04, 0.24, 0.24, 0.02, acento, k * 0.215, 0.05, 0, tronco));
    bloco(0.2, 0.05, 0.02, 0.01, acento, 0, 0.24, 0.16, tronco);
    peca(GEO.toro, junta, 0, 0.03, 0, 0.215, 3, 0.17, tronco);
    [-0.12, 0, 0.12].forEach((x) => bloco(0.07, 0.07, 0.05, 0.012, padrao(0x8a6b3c, 0.7), x, 0.0, 0.17, tronco));
    const cap = new T.Group(); cap.position.y = R * ey * 1.08; cabeca.add(cap); cap.rotation.x = -0.08;
    peca(new T.SphereGeometry(R * 1.12, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), padrao(0xffbf1f, 0.28, 0.05), 0, 0.02, 0, 1.08, 0.82, 1.02, cap);
    peca(GEO.cil, padrao(0xffbf1f, 0.28, 0.05), 0, 0, 0.04, R * 1.32, 0.02, R * 1.28, cap);
    peca(GEO.caixa, padrao(0xffc93f, 0.28), 0, 0.02, 0, 0.05, R * 0.95, R * 2.1, cap);
    bracos.forEach(({ cotovelo }) => peca(GEO.cil, acento, 0, -M.braco[2] - 0.02, 0, M.braco[0] * 1.25, M.braco[2] * 0.7, M.braco[0] * 1.25, cotovelo));
  } else if (a.id === 'report') {
    peca(torneado([[0, -0.02], [0.1, -0.02], [0.14, 0.04], [0.155, 0.17], [0.15, 0.3], [0.12, 0.38], [0, 0.4]]), branco, 0, 0, 0, 1, 1, 1, tronco);
    peca(GEO.toro, acento, 0, 0.37, 0, 0.11, 1.6, 0.11, tronco);
    const gravata = new T.Mesh(new T.ConeGeometry(0.03, 0.2, 4).rotateX(Math.PI), acento); gravata.position.set(0, 0.25, 0.145); gravata.rotation.x = -0.12; tronco.add(gravata);
    bloco(0.13, 0.08, 0.02, 0.01, padrao(0x1b1e23, 0.3), 0, 0.06, 0.142, tronco);
    bloco(0.1, 0.05, 0.004, 0.002, padrao(0xffffff, 0.7), 0, 0.12, 0.146, tronco);
    const oc = new T.Group(); oc.position.set(0, R * ey * 1.0, R * 1.04); cabeca.add(oc);
    [-1, 1].forEach((k) => { const l = new T.Mesh(new T.TorusGeometry(0.068, 0.009, 8, 36), padrao(0x2f6fdb, 0.25, 0.4)); l.position.x = k * 0.085; oc.add(l); });
    peca(GEO.caixa, padrao(0x2f6fdb, 0.25, 0.4), 0, 0.01, 0, 0.04, 0.012, 0.012, oc);
  } else if (a.id === 'sherlock') {
    const capa = padrao(0x8a5a3c, 0.78);
    peca(torneado([[0, -0.04], [0.22, -0.04], [0.225, 0.04], [0.2, 0.18], [0.18, 0.28], [0.13, 0.34], [0, 0.35]]), capa, 0, 0, 0, 1, 1, 1, tronco);
    peca(GEO.toro, padrao(0x5b3a26, 0.7), 0, 0.11, 0, 0.205, 3, 0.205, tronco);
    peca(GEO.toro, padrao(0x8e5bd6, 0.6), 0, 0.32, 0, 0.135, 4, 0.135, tronco);
    [0.2, 0.14].forEach((y) => peca(GEO.esfera, padrao(0x3a2418, 0.5), 0, y, 0.19, 0.014, 0.014, 0.008, tronco));
    const ch = new T.Group(); ch.position.y = R * ey * 1.78; ch.rotation.set(-0.12, 0, 0.08); cabeca.add(ch);
    const feltro = padrao(0x5a3a2a, 0.82);
    peca(GEO.cil, feltro, 0, 0, 0, R * 1.42, 0.022, R * 1.32, ch);
    peca(torneado([[0, 0.17], [0.15, 0.16], [0.19, 0.12], [0.205, 0.02], [0.21, 0], [0, 0]], 36), feltro, 0, 0.02, 0, 1.08, 1, 1, ch);
    peca(GEO.cil, padrao(0x8e5bd6, 0.6), 0, 0.03, 0, 0.215, 0.045, 0.215, ch);
    // lupa na mão direita
    const lupa = new T.Group(); lupa.position.set(0, -0.06, 0.03); bracos[1].mao.add(lupa); lupa.rotation.x = -0.2;
    peca(GEO.cil12, padrao(0x2b1b12, 0.5), 0, -0.02, 0, 0.012, 0.11, 0.012, lupa).rotation.x = Math.PI;
    const aro = new T.Mesh(new T.TorusGeometry(0.06, 0.009, 8, 36), metal(0xc8a052, 0.25)); aro.position.y = 0.06; lupa.add(aro);
    const lente = new T.Mesh(new T.CircleGeometry(0.058, 32), holo(0x9fe8ff, 0.35)); lente.position.y = 0.06; lupa.add(lente);
    r.partes.lupa = lupa;
  } else if (a.id === 'fix') {
    peca(torneado([[0, -0.02], [0.17, -0.02], [0.19, 0.02], [0.19, 0.29], [0.165, 0.34], [0, 0.35]], 28), branco, 0, 0, 0, 1, 1, 1, tronco);
    peca(GEO.toro, acento, 0, 0.13, 0, 0.192, 3, 0.192, tronco); peca(GEO.toro, acento, 0, 0.2, 0, 0.192, 1.4, 0.192, tronco);
    for (let k = 0; k < 8; k++) { const ang = k / 8 * Math.PI * 2; peca(GEO.esfera, junta, Math.sin(ang) * 0.19, 0.29, Math.cos(ang) * 0.19, 0.012, 0.012, 0.012, tronco); }
    [0.05, 0.08].forEach((y) => peca(GEO.caixa, aceso, 0, y, 0.19, 0.1, 0.008, 0.006, tronco));
    bloco(0.26, 0.26, 0.12, 0.04, padrao(0x56606b, 0.5, 0.4), 0, 0.05, -0.22, tronco);
    peca(GEO.cil12, junta, 0.08, 0.31, -0.24, 0.008, 0.16, 0.008, tronco); peca(GEO.esfera, aceso, 0.08, 0.48, -0.24, 0.016, 0.016, 0.016, tronco);
    const ocl = new T.Group(); ocl.position.set(0, R * ey * 1.55, R * 0.62); ocl.rotation.x = -0.55; cabeca.add(ocl);
    [-1, 1].forEach((k) => { peca(GEO.cil, junta, k * 0.075, 0, 0, 0.06, 0.06, 0.06, ocl).rotation.x = Math.PI / 2; const vl = peca(GEO.cil, new T.MeshPhysicalMaterial({ color: 0x2bd47a, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.7, emissive: 0x0d4a2a }), k * 0.075, 0, 0.065, 0.05, 0.006, 0.05, ocl); vl.rotation.x = Math.PI / 2; });
    // mão direita = chave inglesa, mão esquerda = garra
    const chave = new T.Group(); bracos[1].mao.add(chave);
    peca(GEO.caixa, metal(0xd3d8de, 0.25), 0, -0.13, 0, 0.03, 0.13, 0.014, chave);
    const boca = new T.Mesh(new T.TorusGeometry(0.035, 0.013, 8, 24, Math.PI * 1.45), metal(0xd3d8de, 0.25)); boca.position.y = -0.17; boca.rotation.z = Math.PI * 1.27; chave.add(boca);
    peca(GEO.cil12, acento, 0, -0.02, 0, 0.03, 0.04, 0.03, chave);
    const garra = new T.Group(); bracos[0].mao.add(garra); peca(GEO.esfera, acento, 0, -0.02, 0, 0.04, 0.035, 0.04, garra);
    [0, 2.1, 4.2].forEach((ang) => { const d = peca(capsula(0.012, 0.05), junta, Math.sin(ang) * 0.025, -0.04, Math.cos(ang) * 0.025, 1, 1, 1, garra); d.rotation.set(Math.cos(ang) * 0.4, 0, -Math.sin(ang) * 0.4); });
  } else if (a.id === 'scout') {
    peca(torneado([[0, -0.02], [0.12, -0.02], [0.155, 0.05], [0.16, 0.2], [0.14, 0.3], [0.1, 0.34], [0, 0.35]]), branco, 0, 0, 0, 1, 1, 1, tronco);
    const colete = padrao(0x8f8a63, 0.82);
    peca(new T.CylinderGeometry(0.172, 0.168, 0.2, 32, 1, true), colete, 0, 0.16, 0, 1, 1, 1, tronco).material = guardado('colete', () => { const m = padrao(0x8f8a63, 0.82).clone(); m.side = T.DoubleSide; return m; });
    [-1, 1].forEach((k) => bloco(0.07, 0.06, 0.03, 0.01, padrao(0x77724f, 0.85), k * 0.08, 0.1, 0.17, tronco));
    peca(GEO.toro, acento, 0, 0.26, 0, 0.17, 1.6, 0.17, tronco);
    [-1, 1].forEach((k) => { const ant = new T.Group(); ant.position.set(k * 0.12, R * ey * 1.85, -0.04); ant.rotation.z = -k * 0.35; cabeca.add(ant); peca(GEO.cil12, junta, 0, 0, 0, 0.007, 0.16, 0.007, ant); peca(GEO.esfera, luz(k < 0 ? a.cor : ESC.laranja, 3), 0, 0.17, 0, 0.018, 0.018, 0.018, ant); });
    const bin = new T.Group(); bin.position.set(0, 0.2, 0.2); tronco.add(bin);
    [-1, 1].forEach((k) => { const c = peca(GEO.cil, padrao(0x2b2f36, 0.45, 0.4), k * 0.035, 0, -0.06, 0.03, 0.12, 0.03, bin); c.rotation.x = Math.PI / 2; peca(GEO.cil, padrao(0x22b8a6, 0.2, 0.4), k * 0.035, 0, 0.062, 0.022, 0.004, 0.022, bin).rotation.x = Math.PI / 2; });
    peca(GEO.caixa, padrao(0x2b2f36, 0.45), 0, -0.01, -0.03, 0.05, 0.02, 0.04, bin);
    r.partes.binoculo = bin;
  } else if (a.id === 'data') {
    bloco(0.36, 0.34, 0.28, 0.09, branco, 0, -0.01, 0, tronco);
    [-1, 1].forEach((k) => peca(GEO.caixa, aceso, k * 0.181, 0.05, 0, 0.006, 0.2, 0.012, tronco));
    const cvp = document.createElement('canvas'); cvp.width = 128; cvp.height = 80; const txp = textura(cvp);
    const tp = new T.Mesh(GEO.plano, new T.MeshBasicMaterial({ map: txp })); tp.material.color.multiplyScalar(1.6); tp.scale.set(0.15, 0.094, 1); tp.position.set(0, 0.17, 0.142); tronco.add(tp);
    bloco(0.17, 0.11, 0.008, 0.01, padrao(0x111317, 0.3), 0, 0.115, 0.136, tronco);
    r.partes.peito = { cv: cvp, tx: txp, ultimo: -1 };
  } else if (a.id === 'pixel') {
    const corpoP = new T.MeshPhysicalMaterial({ map: textoManchas(), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 });
    peca(torneado([[0, -0.02], [0.15, -0.02], [0.21, 0.07], [0.22, 0.15], [0.19, 0.26], [0.12, 0.33], [0, 0.35]]), corpoP, 0, 0, 0, 1, 1, 1, tronco);
    peca(GEO.toro, acento, 0, 0.02, 0, 0.16, 1.8, 0.16, tronco);
    const boina = new T.Group(); boina.position.set(-0.02, R * ey * 1.82, -0.02); boina.rotation.set(-0.15, 0, 0.32); cabeca.add(boina);
    peca(GEO.esfera, padrao(0xe0459b, 0.85), 0, 0, 0, R * 1.08, R * 0.34, R * 1.08, boina);
    peca(GEO.cil12, padrao(0xe0459b, 0.85), 0, R * 0.28, 0, 0.012, 0.05, 0.012, boina);
    [[0.12, 0.06, 0xffbf1f], [-0.08, 0.1, 0x22d3ee], [0.02, -0.12, 0xff7a1a]].forEach(([x, z, c]) => peca(GEO.esfera, padrao(c, 0.6), x, R * 0.27, z, 0.03, 0.012, 0.03, boina));
    const pincel = new T.Group(); pincel.position.set(0, -0.06, 0.02); pincel.rotation.x = 0.5; bracos[1].mao.add(pincel);
    peca(GEO.cil12, padrao(0x9a6b45, 0.6), 0, -0.04, 0, 0.009, 0.2, 0.009, pincel);
    peca(GEO.cil12, metal(0xc8ccd2), 0, 0.16, 0, 0.011, 0.03, 0.011, pincel);
    peca(GEO.cone, padrao(0xe0459b, 0.6), 0, 0.19, 0, 0.012, 0.05, 0.012, pincel);
    const pal = new T.Group(); pal.position.set(0, -0.06, 0.04); pal.rotation.set(0.2, 0, Math.PI / 2); bracos[0].mao.add(pal); pal.visible = false;
    peca(GEO.cil, padrao(0xd8b88a, 0.6), 0, 0, 0, 0.1, 0.012, 0.075, pal);
    ['#ff7a1a', '#22d3ee', '#ffbf1f', '#e0459b'].forEach((c, k) => peca(GEO.cil, padrao(new T.Color(c).getHex(), 0.5), Math.cos(k * 1.3) * 0.055, 0.012, Math.sin(k * 1.3) * 0.04, 0.016, 0.006, 0.016, pal));
    r.partes.paleta = pal;
  }
  // fone de ouvido (aparece quando o agente vai trabalhar): arco por cima da cabeça e as duas conchas
  if (a.id !== 'atlas') {
    const fone = new T.Group(); fone.position.y = R * ey; cabeca.add(fone); fone.visible = false;
    const larg = a.id === 'data' ? 0.25 : R * ex * 1.02, alto = a.id === 'data' ? 0.22 : R * ey * 1.05;
    const arco = new T.Mesh(new T.TorusGeometry(1, 0.035, 10, 40, Math.PI), junta); arco.scale.set(larg + 0.03, alto + 0.06, 1); fone.add(arco);
    [-1, 1].forEach((k) => { peca(GEO.cilX, casco(a.cor, 0.35), k * (larg + 0.02), -0.02, 0, 0.07, 0.085, 0.085, fone); const an = new T.Mesh(new T.TorusGeometry(0.06, 0.01, 8, 32), luz(a.cor, 3)); an.rotation.y = Math.PI / 2; an.position.set(k * (larg + 0.058), -0.02, 0); fone.add(an); });
    r.partes.fone = fone;
  }
  // propulsor embaixo dos pés: o robô flutua (a luz pulsa e some quando ele senta)
  const prop = new T.Group(); prop.position.y = 0.0; g.add(prop);
  const disco = new T.Mesh(new T.CircleGeometry(0.17, 32).rotateX(-Math.PI / 2), holo(0x8fefff, 0.9)); prop.add(disco);
  const cone = new T.Mesh(new T.CylinderGeometry(0.16, 0.04, 0.3, 24, 1, true), holo(0x7fe7ff, 0.28)); cone.position.y = 0.16; prop.add(cone);
  r.partes.propulsor = prop;
  // xícara na mão direita (só aparece no café)
  const xic = new T.Group(); xic.position.set(0, -0.07, 0.05); bracos[0].mao.add(xic); xic.visible = false;
  peca(torneado([[0, 0], [0.035, 0], [0.04, 0.07], [0, 0.07]], 18), casco(0xffffff, 0.35), 0, 0, 0, 1, 1, 1, xic);
  r.partes.xicara = xic;
  // balão de desenho animado em cima da cabeça
  const balao = new T.Sprite(new T.SpriteMaterial({ map: texBalao('conversa'), transparent: true, depthTest: false, depthWrite: false }));
  balao.renderOrder = 20; balao.visible = false; g.add(balao); r.partes.balao = balao;
  // sombra macia no chão
  const sombra = sombraMacia(0.75, 0.75, 0.7); sombra.position.y = 0.006; g.add(sombra);
  g.traverse((o) => { if (o.isMesh && !o.userData.sombra) { o.castShadow = false; o.receiveShadow = true; } o.userData.vivo = true; });   // sombra = a mancha macia (eles flutuam)
  // caixa de clique (invisível) do tamanho do robô
  const alvo = new T.Mesh(new T.BoxGeometry(0.6, 1.1, 0.6), new T.MeshBasicMaterial()); alvo.position.y = 0.55; alvo.visible = false; alvo.userData = { tipo: 'robo', id: a.id }; g.add(alvo);
  juntarPorGrupo(g);
  Object.assign(r, { corpo, quadril, pernas, tronco, bracos, pescoco, cabeca, alvo, sombra, alturaCabeca: M.perna + M.tronco + 0.06 + R * ey });
  mudarRosto(r, 'normal', 0, 0);
  return r;
}
/* Junta as peças de um mesmo grupo que usam o mesmo material (elas não se mexem entre si): o robô
   continua com as mesmas juntas, mas com menos desenhos por quadro. Peça com tipo (clique), sombra ou
   material único fica como está. */
function juntarPorGrupo(raiz) {
  const grupos = []; raiz.traverse((o) => { if (o.isGroup || o === raiz) grupos.push(o); });
  grupos.forEach((grp) => {
    const porMaterial = new Map();
    grp.children.forEach((o) => { if (!o.isMesh || o.userData.tipo || o.userData.sombra || Array.isArray(o.material)) return; const k = o.material.uuid; if (!porMaterial.has(k)) porMaterial.set(k, []); porMaterial.get(k).push(o); });
    porMaterial.forEach((lista) => {
      if (lista.length < 2) return;
      const geos = lista.map((o) => { o.updateMatrix(); return o.geometry.clone().applyMatrix4(o.matrix); });
      const m = new THREE.Mesh(juntarGeometrias(geos), lista[0].material); geos.forEach((x) => x.dispose());
      m.castShadow = false; m.receiveShadow = true; m.userData.vivo = true; m.renderOrder = lista[0].renderOrder;
      lista.forEach((o) => grp.remove(o)); grp.add(m);
    });
  });
}
// Troca a expressão (só redesenha se mudou)
function mudarRosto(r, expr, dx, dy) {
  const qx = Math.round((dx || 0) * 4) / 4, qy = Math.round((dy || 0) * 4) / 4, chave = expr + ':' + qx + ':' + qy;
  if (r.rosto.chave === chave) return;
  r.rosto.chave = chave;
  const q = r.rosto.cv.getContext('2d');
  desenharOlhos(q, r.rosto.cv.width, r.rosto.cv.height, expr, qx, qy, r.id === 'fix' ? '#6dffb0' : COR_OLHO);
  r.rosto.tx.needsUpdate = true;
}
// O peito do Data: barrinhas que sobem e descem (enfeite, sem número)
function animarPeitoDoData(r, t) {
  const p = r.partes.peito; if (!p) return; const k = Math.floor(t * 4); if (k === p.ultimo) return; p.ultimo = k;
  const q = p.cv.getContext('2d'), W = p.cv.width, H = p.cv.height; q.fillStyle = '#04121a'; q.fillRect(0, 0, W, H);
  for (let i = 0; i < 7; i++) { const h = (0.25 + 0.6 * (0.5 + 0.5 * Math.sin(t * 1.3 + i * 0.9))) * (H - 16); q.fillStyle = i === 4 ? LARANJA_CSS : '#22d3ee'; q.fillRect(8 + i * 16, H - 8 - h, 10, h); }
  p.tx.needsUpdate = true;
}
