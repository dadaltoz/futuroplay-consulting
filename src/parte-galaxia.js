<script>
'use strict';
/* =====================================================================
   Galáxia de soluções (tela Biblioteca)

   Cada solução da biblioteca é uma estrela:
   - as estrelas se agrupam em constelações pelo tipo de setor (Logística, Comercial...);
   - a cor diz de onde veio: verde = caso resolvido, azul-claro = oportunidade entregue,
     laranja = metodologia da Real Forte, lilás = sugestão da RF Intelligence;
   - estrela maior = mais horas devolvidas;
   - linhas finas ligam soluções parecidas (que usam as mesmas palavras).
   Buscar ou filtrar acende as estrelas que batem e apaga as outras; a câmera vai até elas.
   Passar o mouse mostra o nome; clicar abre a solução na lista logo abaixo.
   Usa o mesmo Three.js do campo. Sem 3D, a Biblioteca fica só com a lista.
   ===================================================================== */
const GALAXIA = { iniciada: false, rodando: false, estrelas: [], t: 0 };
const COR_ORIGEM = { caso: 0x2fbf71, entrega: 0x38bdf8, metodologia: 0xff9a4d, intelligence: 0xb197fc };
const COR_ORIGEM_CSS = { caso: '#2fbf71', entrega: '#38bdf8', metodologia: '#ff9a4d', intelligence: '#b197fc' };

function montarGalaxiaCena() {
  const T = THREE;
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = T.sRGBEncoding;
  GALAXIA.renderer = renderer;
  const cena = new T.Scene(); GALAXIA.cena = cena;
  GALAXIA.camera = new T.PerspectiveCamera(50, 1, 0.1, 600);
  // Textura de brilho redondo (a mesma ideia das luzes do campo)
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.18, 'rgba(255,255,255,.8)'); r.addColorStop(0.45, 'rgba(255,255,255,.18)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128); GALAXIA.tex = new T.CanvasTexture(c);
  // Fundo: poeira de estrelas e nebulosas coloridas
  const qtd = 1400, pos = new Float32Array(qtd * 3), cores = new Float32Array(qtd * 3);
  for (let i = 0; i < qtd; i++) {
    const raio = 60 + Math.random() * 140, a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1);
    pos.set([raio * Math.sin(b) * Math.cos(a), raio * Math.cos(b) * 0.6, raio * Math.sin(b) * Math.sin(a)], i * 3);
    const k = 0.5 + Math.random() * 0.5; cores.set([k * 0.8, k * 0.88, k], i * 3);
  }
  const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('color', new T.BufferAttribute(cores, 3));
  GALAXIA.fundo = new T.Points(geo, new T.PointsMaterial({ size: 0.7, map: GALAXIA.tex, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, blending: T.AdditiveBlending }));
  cena.add(GALAXIA.fundo);
  [[0x4d3a8f, -30, 5, -60, 90], [0x1d5a8f, 40, -8, -50, 80], [0x8f3a5a, 10, 12, -80, 70], [0x2a6f6a, -50, -10, 10, 70]].forEach(([cor, x, y, z, s]) => {
    const n = new T.Sprite(new T.SpriteMaterial({ map: GALAXIA.tex, color: cor, transparent: true, opacity: 0.28, depthWrite: false, blending: T.AdditiveBlending }));
    n.position.set(x, y, z); n.scale.set(s, s * 0.6, 1); cena.add(n);
  });
  GALAXIA.grupo = new T.Group(); cena.add(GALAXIA.grupo);
  // Palco: desenho + nomes das constelações + etiqueta da estrela
  const palco = document.createElement('div'); palco.className = 'galaxia-palco';
  palco.appendChild(renderer.domElement);
  GALAXIA.rotulos = document.createElement('div'); GALAXIA.rotulos.className = 'galaxia-rotulos'; palco.appendChild(GALAXIA.rotulos);
  GALAXIA.dica = document.createElement('div'); GALAXIA.dica.className = 'galaxia-dica'; GALAXIA.dica.hidden = true; palco.appendChild(GALAXIA.dica);
  GALAXIA.el = palco;
  new ResizeObserver(() => { const w = palco.clientWidth, h = palco.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); GALAXIA.camera.aspect = w / h; GALAXIA.camera.updateProjectionMatrix(); GALAXIA.w = w; GALAXIA.h = h; }).observe(palco);
  ligarControlesGalaxia(renderer.domElement);
}
// Câmera: gira em volta do centro escolhido; arrastar gira, rolar aproxima
const GCAM = { theta: 0.3, phi: 1.15, raio: 70, raioAlvo: 70, alvo: null, alvoDestino: null, vTheta: 0, parada: 0 };
function ligarControlesGalaxia(tela) {
  let inicio = null, arrastou = false, ultimo = null;
  const ray = new THREE.Raycaster(); ray.params.Points = { threshold: 1.2 };
  const estrelaNoPonto = (cx, cy) => {
    const r = tela.getBoundingClientRect(); const p = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(p, GALAXIA.camera);
    const hit = ray.intersectObjects(GALAXIA.estrelas.map((e) => e.alvo), false)[0];
    return hit ? hit.object.userData.estrela : null;
  };
  tela.addEventListener('pointerdown', (ev) => { tela.setPointerCapture(ev.pointerId); inicio = { x: ev.clientX, y: ev.clientY }; ultimo = { x: ev.clientX, y: ev.clientY }; arrastou = false; GCAM.parada = performance.now(); });
  tela.addEventListener('pointermove', (ev) => {
    if (inicio) {
      const dx = ev.clientX - ultimo.x, dy = ev.clientY - ultimo.y; ultimo = { x: ev.clientX, y: ev.clientY };
      if (Math.hypot(ev.clientX - inicio.x, ev.clientY - inicio.y) > 5) arrastou = true;
      if (arrastou) { GCAM.vTheta = -dx * 0.005; GCAM.theta += GCAM.vTheta; GCAM.phi = Math.min(2.6, Math.max(0.5, GCAM.phi - dy * 0.004)); GCAM.parada = performance.now(); }
      return;
    }
    const e = estrelaNoPonto(ev.clientX, ev.clientY);
    GALAXIA.hover = e; tela.style.cursor = e ? 'pointer' : 'grab';
    if (e) { GALAXIA.dica.hidden = false; GALAXIA.dica.innerHTML = `<b>${esc(e.item.titulo)}</b><span>${esc(DIAGNOSTICOS[e.item.tipo].nome)} · ${esc(ORIGEM_BIB[e.item.origem])}${e.item.horas ? ' · ' + fmtHoras(e.item.horas) + ' h/mês' : ''}</span>`; const r = tela.getBoundingClientRect(); GALAXIA.dica.style.transform = `translate(${ev.clientX - r.left + 14}px, ${ev.clientY - r.top + 14}px)`; }
    else GALAXIA.dica.hidden = true;
  });
  tela.addEventListener('pointerup', (ev) => {
    const clique = inicio && !arrastou; inicio = null;
    if (!clique) return;
    const e = estrelaNoPonto(ev.clientX, ev.clientY); if (!e) return;
    // Abre a solução na lista e leva a tela até ela
    UI.bibAberto = e.item.id; voarGalaxia(e.pos.clone(), 26); render(true);
    setTimeout(() => { const card = document.querySelector('.bib-card.aberto'); if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 60);
  });
  tela.addEventListener('pointerleave', () => { GALAXIA.hover = null; GALAXIA.dica.hidden = true; });
  tela.addEventListener('wheel', (ev) => { ev.preventDefault(); GCAM.raioAlvo = Math.min(140, Math.max(14, GCAM.raioAlvo * Math.exp(ev.deltaY * 0.0012))); GCAM.parada = performance.now(); }, { passive: false });
}
function voarGalaxia(alvo, raio) { GCAM.alvoDestino = alvo; GCAM.raioAlvo = raio; }

// Monta as estrelas a partir da biblioteca (só refaz quando a biblioteca muda)
function montarEstrelas(itens) {
  const T = THREE;
  GALAXIA.estrelas.forEach((e) => { e.objs.forEach((o) => { GALAXIA.grupo.remove(o); if (o.material) o.material.dispose(); }); });
  (GALAXIA.linhas || []).forEach((l) => { GALAXIA.grupo.remove(l); l.geometry.dispose(); l.material.dispose(); });
  (GALAXIA.nebulosas || []).forEach((n) => { GALAXIA.grupo.remove(n); n.material.dispose(); });
  GALAXIA.rotulos.innerHTML = ''; GALAXIA.estrelas = []; GALAXIA.linhas = []; GALAXIA.constelacoes = []; GALAXIA.nebulosas = [];
  const tipos = [...new Set(itens.map((x) => x.tipo))];
  const geoAlvo = new T.SphereGeometry(1, 8, 6);
  tipos.forEach((tipo, k) => {
    // Cada constelação num ponto de uma espiral, um pouco acima ou abaixo do plano
    const a = k * 2.4, d = tipos.length === 1 ? 0 : 16 + k * 4.5;
    const centro = new T.Vector3(Math.cos(a) * d, Math.sin(k * 1.7) * 6, Math.sin(a) * d);
    const daqui = itens.filter((x) => x.tipo === tipo);
    const rotulo = document.createElement('div'); rotulo.className = 'constelacao'; rotulo.textContent = DIAGNOSTICOS[tipo].nome; GALAXIA.rotulos.appendChild(rotulo);
    GALAXIA.constelacoes.push({ tipo, centro, rotulo });
    // Nuvem de luz da constelação (a cor vem da mistura das estrelas dela)
    const corNuvem = new T.Color(0x000000); daqui.forEach((x) => corNuvem.add(new T.Color(COR_ORIGEM[x.origem] || 0xffffff))); corNuvem.multiplyScalar(1 / Math.max(1, daqui.length));
    const neb = new T.Sprite(new T.SpriteMaterial({ map: GALAXIA.tex, color: corNuvem, transparent: true, opacity: 0.22, depthWrite: false, blending: T.AdditiveBlending }));
    const tamNeb = 10 + Math.sqrt(daqui.length) * 6; neb.scale.set(tamNeb, tamNeb * 0.7, 1); neb.position.copy(centro); GALAXIA.grupo.add(neb);
    (GALAXIA.nebulosas = GALAXIA.nebulosas || []).push(neb);
    daqui.forEach((item, i) => {
      const ang = i * 2.39996, rr = 1.6 + Math.sqrt(i) * 2.4;   // girassol: espalha sem amontoar
      const pos = centro.clone().add(new T.Vector3(Math.cos(ang) * rr, (Math.random() - 0.5) * 3, Math.sin(ang) * rr));
      const cor = COR_ORIGEM[item.origem] || 0xffffff;
      const tam = 2.4 + Math.min(3, (Number(item.horas) || 0) / 8);
      const nucleo = new T.Sprite(new T.SpriteMaterial({ map: GALAXIA.tex, color: 0xffffff, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
      nucleo.scale.setScalar(tam * 0.55); nucleo.position.copy(pos);
      const halo = new T.Sprite(new T.SpriteMaterial({ map: GALAXIA.tex, color: cor, transparent: true, opacity: 0.85, depthWrite: false, blending: T.AdditiveBlending }));
      halo.scale.setScalar(tam * 2.2); halo.position.copy(pos);
      const alvo = new T.Mesh(geoAlvo, new T.MeshBasicMaterial({ visible: false })); alvo.scale.setScalar(tam * 0.6); alvo.position.copy(pos);
      GALAXIA.grupo.add(nucleo, halo, alvo);
      const e = { item, pos, tam, nucleo, halo, alvo, objs: [nucleo, halo, alvo], fase: Math.random() * 6, luz: 1 };
      alvo.userData.estrela = e; GALAXIA.estrelas.push(e);
    });
  });
  // Linhas entre soluções parecidas (duas ou mais palavras em comum)
  const pal = GALAXIA.estrelas.map((e) => palavras([e.item.titulo, e.item.problema, e.item.solucao].join(' ')));
  for (let i = 0; i < GALAXIA.estrelas.length; i++) for (let j = i + 1; j < GALAXIA.estrelas.length; j++) {
    let n = 0; pal[i].forEach((p) => { if (pal[j].has(p)) n++; });
    if (n < 2) continue;
    const geo = new T.BufferGeometry().setFromPoints([GALAXIA.estrelas[i].pos, GALAXIA.estrelas[j].pos]);
    const linha = new T.Line(geo, new T.LineBasicMaterial({ color: 0x9cc4ff, transparent: true, opacity: Math.min(0.5, 0.12 + n * 0.06), depthWrite: false, blending: T.AdditiveBlending }));
    linha.userData = { a: GALAXIA.estrelas[i], b: GALAXIA.estrelas[j], base: linha.material.opacity };
    GALAXIA.grupo.add(linha); GALAXIA.linhas.push(linha);
  }
}
// Acende as estrelas da busca/filtro; a câmera vai até o meio delas
function destacarEstrelas(ids) {
  const chave = [...ids].sort().join('|');
  if (GALAXIA.chaveDestaque === chave) return; GALAXIA.chaveDestaque = chave;
  const todas = ids.size === GALAXIA.estrelas.length;
  GALAXIA.estrelas.forEach((e) => { e.luzAlvo = ids.has(e.item.id) ? 1 : 0.12; });
  const marcadas = GALAXIA.estrelas.filter((e) => ids.has(e.item.id));
  if (!marcadas.length || todas) { voarGalaxia(new THREE.Vector3(0, 0, 0), GALAXIA.raioGeral || 70); return; }
  const c = new THREE.Vector3(); marcadas.forEach((e) => c.add(e.pos)); c.divideScalar(marcadas.length);
  const espalho = Math.max(...marcadas.map((e) => e.pos.distanceTo(c)));
  voarGalaxia(c, Math.max(20, espalho * 2.6 + 14));
}
function quadroGalaxia(agora) {
  if (!GALAXIA.rodando) return;
  GALAXIA.raf = requestAnimationFrame(quadroGalaxia);
  const dt = Math.min(0.05, ((agora - (GALAXIA.ultimo || agora)) / 1000) || 0.016); GALAXIA.ultimo = agora;
  const parado = movimentoReduzido(); if (!parado) GALAXIA.t += dt; const t = GALAXIA.t;
  if (GCAM.alvoDestino) GCAM.alvo.lerp(GCAM.alvoDestino, Math.min(1, dt * 2.5));
  GCAM.raio += (GCAM.raioAlvo - GCAM.raio) * Math.min(1, dt * 2.5);
  GCAM.theta += GCAM.vTheta; GCAM.vTheta *= Math.pow(0.9, dt * 60);
  if (!parado && performance.now() - GCAM.parada > 3000) GCAM.theta += 0.05 * dt;
  const cam = GALAXIA.camera, sp = Math.sin(GCAM.phi);
  cam.position.set(GCAM.alvo.x + GCAM.raio * sp * Math.sin(GCAM.theta), GCAM.alvo.y + GCAM.raio * Math.cos(GCAM.phi) * 0.8 + 6, GCAM.alvo.z + GCAM.raio * sp * Math.cos(GCAM.theta));
  cam.lookAt(GCAM.alvo);
  GALAXIA.estrelas.forEach((e) => {
    e.luz += ((e.luzAlvo == null ? 1 : e.luzAlvo) - e.luz) * Math.min(1, dt * 4);
    const pisca = 0.85 + Math.sin(t * 2.2 + e.fase) * 0.15 + (GALAXIA.hover === e ? 0.6 : 0) + (UI.bibAberto === e.item.id ? 0.5 + Math.sin(t * 5) * 0.3 : 0);
    e.halo.material.opacity = 0.85 * e.luz * pisca; e.nucleo.material.opacity = Math.min(1, e.luz * pisca);
    const k = e.tam * 2.2 * (GALAXIA.hover === e ? 1.4 : 1); e.halo.scale.set(k, k, 1);
  });
  GALAXIA.linhas.forEach((l) => { l.material.opacity = l.userData.base * Math.min(l.userData.a.luz, l.userData.b.luz) * (0.8 + Math.sin(t * 1.5) * 0.2); });
  GALAXIA.fundo.rotation.y = t * 0.004;
  GALAXIA.renderer.render(GALAXIA.cena, cam);
  // Nomes das constelações presos no 3D
  const v = new THREE.Vector3();
  GALAXIA.constelacoes.forEach((c) => {
    v.copy(c.centro).add(new THREE.Vector3(0, 6.5, 0)).project(cam);
    if (v.z > 1) { c.rotulo.style.visibility = 'hidden'; return; }
    c.rotulo.style.visibility = 'visible';
    c.rotulo.style.transform = `translate(${((v.x + 1) / 2 * GALAXIA.w).toFixed(1)}px, ${((1 - v.y) / 2 * GALAXIA.h).toFixed(1)}px) translate(-50%, -50%)`;
  });
}
// Chamado pelo render: liga a galáxia quando a Biblioteca tem o lugar dela
function montarGalaxia(lugar, itens, visiveis) {
  if (!campoDisponivel()) return;
  try {
    if (!GALAXIA.iniciada) { montarGalaxiaCena(); GCAM.alvo = new THREE.Vector3(0, 0, 0); GALAXIA.iniciada = true; }
    if (GALAXIA.el.parentNode !== lugar) lugar.prepend(GALAXIA.el);
    const assinatura = JSON.stringify(itens.map((x) => [x.id, x.tipo, x.origem, x.titulo, x.horas]));
    if (GALAXIA.assinatura !== assinatura) {
      GALAXIA.assinatura = assinatura; GALAXIA.chaveDestaque = null; montarEstrelas(itens);
      const tipos = new Set(itens.map((x) => x.tipo)).size; GALAXIA.raioGeral = tipos <= 1 ? 26 : 26 + tipos * 6;
      GCAM.raio = GCAM.raioAlvo = GALAXIA.raioGeral * 1.6;
    }
    destacarEstrelas(new Set(visiveis.map((x) => x.id)));
    if (!GALAXIA.rodando) { GALAXIA.rodando = true; GALAXIA.ultimo = 0; GCAM.raio = GALAXIA.raioGeral * 1.6; GCAM.raioAlvo = GALAXIA.raioGeral; GALAXIA.raf = requestAnimationFrame(quadroGalaxia); }
  } catch (x) { console.warn('Galáxia indisponível:', x); lugar.remove(); }
}
function pararGalaxia() { if (!GALAXIA.rodando) return; GALAXIA.rodando = false; cancelAnimationFrame(GALAXIA.raf); }
</script>
