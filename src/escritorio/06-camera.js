/* =====================================================================
   CÂMERA, CLIQUES E CARTÃO DO ROBÔ
   Mouse: arrastar gira, botão direito (ou Shift) arrasta, rolar aproxima.
   Toque: um dedo gira, dois dedos aproximam e arrastam.
   Clique numa sala: abre o setor no painel (a Sala de reunião abre a empresa).
   Clique num robô: abre o cartão dele (quem é, o que está fazendo agora, o que vai fazer).
   ===================================================================== */

const CAM = { alvo: null, raio: 34, theta: 0, phi: 1.0, anim: null, auto: false };
const LIMITE = { theta: 0.6, phiMin: 0.75, phiMax: 1.36, raioMin: 6, raioMax: 100 };
function visaoGeral() {
  const asp = CAMPO.el ? Math.max(0.3, CAMPO.el.clientWidth / Math.max(1, CAMPO.el.clientHeight)) : 1.6;
  const raio = Math.min(LIMITE.raioMax, 63 * Math.max(1, 1.7 / asp));
  return { alvo: new THREE.Vector3(0, 1.6, 1.8), raio, theta: 0, phi: asp < 1 ? 1.0 : 1.1 };
}
function posicionarCamera() {
  const c = CAMPO.camera, s = Math.sin(CAM.phi);
  c.position.set(CAM.alvo.x + s * Math.sin(CAM.theta) * CAM.raio, CAM.alvo.y + Math.cos(CAM.phi) * CAM.raio, CAM.alvo.z + s * Math.cos(CAM.theta) * CAM.raio);
  c.lookAt(CAM.alvo);
}
function animarCamera(destino, ms) {
  if (movimentoReduzido() || !ms) { CAM.alvo.copy(destino.alvo); CAM.raio = destino.raio; CAM.theta = destino.theta; CAM.phi = destino.phi; CAM.anim = null; return; }
  CAM.anim = { de: { alvo: CAM.alvo.clone(), raio: CAM.raio, theta: CAM.theta, phi: CAM.phi }, para: destino, t0: performance.now(), ms };
}
function passoCamera() {
  const A = CAM.anim;
  if (A) {
    const k = Math.min(1, (performance.now() - A.t0) / A.ms), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    CAM.alvo.lerpVectors(A.de.alvo, A.para.alvo, e); CAM.raio = misturar(A.de.raio, A.para.raio, e); CAM.theta = misturar(A.de.theta, A.para.theta, e); CAM.phi = misturar(A.de.phi, A.para.phi, e);
    if (k >= 1) CAM.anim = null;
  } else if (CAMPO.ap && !CAM.mexeu) {   // apresentação: a câmera passeia devagar sozinha
    CAM.theta = Math.sin(CAMPO.t * 0.045) * 0.55; CAM.phi = 1.02 + Math.sin(CAMPO.t * 0.07) * 0.06;
  }
  posicionarCamera();
}
function recentrarCampo() { CAM.mexeu = false; animarCamera(visaoGeral(), 900); }
// Olhar de perto a cápsula de um agente (ou a Central, para o Atlas)
function verCapsula(id) {
  CAM.mexeu = true;
  if (id === 'atlas') { const [ax, az] = polar(MUNDO.atlas.r, 0); animarCamera({ alvo: new THREE.Vector3(ax, MUNDO.meio.y + 1.3, az), raio: 10, theta: 0, phi: 1.18 }, 1100); return; }
  const c = CAMPO.capsulas.get(id); if (!c) return;
  const [x, z] = c.centro; animarCamera({ alvo: new THREE.Vector3(x, 1.4, z), raio: 9, theta: Math.max(-LIMITE.theta, Math.min(LIMITE.theta, -c.ang)), phi: 1.2 }, 1100);
}
function verSala(id) {
  const s = CAMPO.salas && CAMPO.salas.get(id); if (!s) return;
  CAM.mexeu = true; const [x, z] = s.centro;
  animarCamera({ alvo: new THREE.Vector3(x, s.y + 1.4, z), raio: 11, theta: Math.max(-LIMITE.theta, Math.min(LIMITE.theta, -s.ang)), phi: 1.12 }, 1100);
}

/* ---------- Mouse e toque ---------- */
function ligarControles(el) {
  const ponteiros = new Map(); let arraste = null, pinca = null;
  const limitar = () => {
    CAM.theta = Math.max(-LIMITE.theta, Math.min(LIMITE.theta, CAM.theta)); CAM.phi = Math.max(LIMITE.phiMin, Math.min(LIMITE.phiMax, CAM.phi));
    CAM.raio = Math.max(LIMITE.raioMin, Math.min(LIMITE.raioMax, CAM.raio));
    CAM.alvo.x = Math.max(-20, Math.min(20, CAM.alvo.x)); CAM.alvo.z = Math.max(-16, Math.min(14, CAM.alvo.z)); CAM.alvo.y = Math.max(0, Math.min(6, CAM.alvo.y));
  };
  const arrastarCena = (dx, dy) => {
    const k = CAM.raio * 0.0016, c = Math.cos(CAM.theta), s = Math.sin(CAM.theta);
    CAM.alvo.x -= (dx * c - dy * s * 1.4) * k; CAM.alvo.z -= (-dx * s - dy * c * 1.4) * k;
  };
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId); ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    CAM.anim = null; arraste = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, mover: e.button === 2 || e.shiftKey, t: performance.now() };
    if (ponteiros.size === 2) { const [a, b] = [...ponteiros.values()]; pinca = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; }
  });
  el.addEventListener('pointermove', (e) => {
    const p = ponteiros.get(e.pointerId);
    if (!p) { passarPorCima(e); return; }
    p.x = e.clientX; p.y = e.clientY;
    if (ponteiros.size === 2 && pinca) {
      const [a, b] = [...ponteiros.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      CAM.raio *= pinca.d / Math.max(1, d); arrastarCena(mx - pinca.mx, my - pinca.my); pinca = { d, mx, my }; CAM.mexeu = true; limitar(); return;
    }
    if (!arraste) return;
    const dx = e.clientX - arraste.x, dy = e.clientY - arraste.y; arraste.x = e.clientX; arraste.y = e.clientY;
    if (Math.hypot(e.clientX - arraste.x0, e.clientY - arraste.y0) > 4) { CAM.mexeu = true; esconderDica(); }
    if (arraste.mover) arrastarCena(dx, dy); else { CAM.theta -= dx * 0.0042; CAM.phi -= dy * 0.0034; }
    limitar();
  });
  const soltar = (e) => {
    const p = ponteiros.get(e.pointerId); ponteiros.delete(e.pointerId); if (ponteiros.size < 2) pinca = null;
    if (arraste && p && ponteiros.size === 0) {
      const curto = Math.hypot(e.clientX - arraste.x0, e.clientY - arraste.y0) < 6 && performance.now() - arraste.t < 600;
      if (curto && e.type === 'pointerup') clicar(e);
      arraste = null;
    }
  };
  el.addEventListener('pointerup', soltar); el.addEventListener('pointercancel', soltar);
  el.addEventListener('pointerleave', () => { if (!ponteiros.size) { marcarSala(null); esconderDica(); } });
  el.addEventListener('wheel', (e) => { e.preventDefault(); CAM.anim = null; CAM.mexeu = true; CAM.raio *= Math.exp(e.deltaY * 0.0011); limitar(); }, { passive: false });
}
// O que está debaixo do ponteiro (robô primeiro, depois sala)
function apontado(e) {
  const r = CAMPO.el.getBoundingClientRect(), v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  CAMPO.raio.setFromCamera(v, CAMPO.camera);
  const alvos = [...CAMPO.robos.values()].map((x) => x.alvo).concat(CAMPO.salas ? [...CAMPO.salas.values()].map((s) => s.caixa) : []);
  const hit = CAMPO.raio.intersectObjects(alvos, false)[0];
  return hit ? hit.object.userData : null;
}
function passarPorCima(e) {
  const u = apontado(e);
  CAMPO.el.style.cursor = u ? 'pointer' : 'grab';
  if (u && u.tipo === 'sala') {
    marcarSala(u.id);
    const linha = u.reuniao ? 'Sala de reunião · onde o time se reúne quando trabalha junto' : `${u.D.nomeSaude} · ${plural(u.D.abertos, 'gargalo aberto', 'gargalos abertos')}`;
    mostrarDica(e, u.nome, linha, CAMPO.ap ? '' : (u.reuniao ? 'clique para abrir a empresa' : 'clique para abrir o setor'));
  } else if (u && u.tipo === 'robo') {
    marcarSala(null); const r = CAMPO.robos.get(u.id);
    mostrarDica(e, r.a.nome, `${r.a.papel} · ${estadoDoRobo(r)}`, 'clique para ver o cartão');
  } else { marcarSala(null); esconderDica(); }
}
function marcarSala(id) {
  if (CAMPO.salaMarcada === id) return; CAMPO.salaMarcada = id;
  if (CAMPO.salas) CAMPO.salas.forEach((s, k) => { s.alvoBrilho = k === id ? 1 : 0; });
}
function clicar(e) {
  const u = apontado(e);
  if (!u) { fecharCartao(); return; }
  if (u.tipo === 'robo') { abrirCartao(u.id); return; }
  if (u.tipo === 'sala' && !CAMPO.ap) {
    if (typeof UI !== 'undefined') UI.origemTransicao = { x: e.clientX, y: e.clientY, t: performance.now() };
    location.hash = u.reuniao ? 'e-' + CAMPO.empresaId : 's-' + u.setorId;
  }
}

/* ---------- Camada de HTML por cima do 3D: dica do ponteiro e cartão do robô ---------- */
function camadaHTML(lugar) {
  if (!CAMPO.dica || !lugar.contains(CAMPO.dica)) {
    CAMPO.dica = Object.assign(document.createElement('div'), { className: 'esc-dica', hidden: true }); lugar.appendChild(CAMPO.dica);
    CAMPO.cartao = Object.assign(document.createElement('aside'), { className: 'esc-cartao', hidden: true }); CAMPO.cartao.setAttribute('aria-live', 'polite'); lugar.appendChild(CAMPO.cartao);
    CAMPO.cartao.addEventListener('click', (e) => {
      const b = e.target.closest('[data-esc]'); if (!b) return;
      if (b.dataset.esc === 'fechar') fecharCartao(); else if (b.dataset.esc === 'ver') verCapsula(CAMPO.cartaoDe);
      else if (b.dataset.esc === 'dispensar') { dispensarAgente(CAMPO.robos.get(CAMPO.cartaoDe)); abrirCartao(CAMPO.cartaoDe); }
    });
    // barra para falar com o Atlas (texto ou microfone) e o balão com a resposta dele
    CAMPO.fala = Object.assign(document.createElement('div'), { className: 'esc-fala', hidden: true }); CAMPO.fala.setAttribute('aria-live', 'polite'); lugar.appendChild(CAMPO.fala);
    const barra = document.createElement('form'); barra.className = 'esc-comando'; barra.setAttribute('autocomplete', 'off');
    barra.innerHTML = `<button type="button" class="esc-mic" aria-label="Falar com o Atlas" title="Falar com o Atlas (o microfone só grava enquanto este botão estiver aceso)"><span></span></button>
      <input name="pedido" placeholder="Fale com o Atlas: “Sherlock, qual o maior gargalo?”" aria-label="Pedido para o Atlas" maxlength="300">
      <button type="submit" class="esc-enviar" aria-label="Mandar">➜</button>`;
    lugar.appendChild(barra); CAMPO.barra = barra;
    const campo = barra.querySelector('input');
    // começou a escrever: o time para e olha para você
    campo.addEventListener('focus', () => { CAMPO.ouvindo = true; atualizarTelao(); });
    campo.addEventListener('blur', () => { setTimeout(() => { if (document.activeElement !== campo && !CAMPO.gravando) { CAMPO.ouvindo = false; atualizarTelao(); } }, 250); });
    barra.addEventListener('submit', (e) => { e.preventDefault(); const v = campo.value.trim(); if (!v) return; campo.value = ''; campo.blur(); pedirAoAtlas(v); });
    barra.querySelector('.esc-mic').addEventListener('click', () => alternarMicrofone(campo));
    if (CAMPO.cartaoDe) abrirCartao(CAMPO.cartaoDe);
    atualizarFalaAtlas();
  }
}
// Microfone: ditado do navegador (pt-BR). Só grava enquanto o botão está aceso; o texto aparece na barra
function alternarMicrofone(campo) {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (CAMPO.gravando) { try { CAMPO.gravando.stop(); } catch (x) { /* já parou */ } return; }
  if (!Rec) { falarAtlas('Este navegador não deixa usar o microfone aqui. Escreva o pedido na barra.', 5); return; }
  const rec = new Rec(); rec.lang = 'pt-BR'; rec.interimResults = true; rec.continuous = false;
  CAMPO.gravando = rec; CAMPO.ouvindo = true; CAMPO.barra.classList.add('gravando'); atualizarTelao();
  let ultimo = '';
  rec.onresult = (ev) => { ultimo = [...ev.results].map((r) => r[0].transcript).join(' '); campo.value = ultimo; };
  rec.onerror = () => { /* fim do ditado */ };
  rec.onend = () => { CAMPO.gravando = null; CAMPO.barra.classList.remove('gravando'); CAMPO.ouvindo = false; if (ultimo.trim()) { campo.value = ''; pedirAoAtlas(ultimo); } else atualizarTelao(); };
  try { rec.start(); } catch (x) { rec.onend(); }
}
// Balão com a fala do Atlas (some sozinho)
function atualizarFalaAtlas() {
  const f = CAMPO.fala, F = CAMPO.falaAtlas; if (!f) return;
  if (!F || CAMPO.t > F.ate) { f.hidden = true; return; }
  const r = CAMPO.robos && [...CAMPO.robos.values()].find((x) => x.ultimo && F.texto.includes(x.ultimo.resultado));
  f.innerHTML = `<b>Atlas</b><span>${esc(F.texto)}</span>${r && r.ultimo.link ? `<a href="${esc(r.ultimo.link)}">Ver no painel</a>` : ''}`;
  f.classList.toggle('pensando', F.pensando); f.hidden = false;
}
function mostrarDica(e, titulo, linha, acao) {
  const d = CAMPO.dica; if (!d) return; const r = CAMPO.lugar.getBoundingClientRect();
  d.innerHTML = `<b>${esc(titulo)}</b><span>${esc(linha)}</span>${acao ? `<small>${esc(acao)}</small>` : ''}`;
  d.hidden = false; d.style.left = Math.min(r.width - 250, e.clientX - r.left + 16) + 'px'; d.style.top = (e.clientY - r.top + 14) + 'px';
}
function esconderDica() { if (CAMPO.dica) CAMPO.dica.hidden = true; }
function abrirCartao(id) {
  const r = CAMPO.robos && CAMPO.robos.get(id); if (!r || !CAMPO.cartao) return;
  CAMPO.cartaoDe = id; const a = r.a;
  const foto = retratoDo(a.id);
  CAMPO.cartao.style.setProperty('--cor', a.css);
  CAMPO.cartao.innerHTML = `<button type="button" class="esc-fechar" data-esc="fechar" aria-label="Fechar">×</button>
    <div class="esc-topo">${foto ? `<img src="${foto}" alt="${esc(a.nome)}">` : ''}<div><h3>${esc(a.nome)}</h3><p class="esc-papel">${esc(a.papel)}</p><p class="esc-jeito">${esc(a.jeito)}</p></div></div>
    <dl class="esc-dados">
      <div><dt>Estado</dt><dd><span class="esc-estado" data-esc-estado>${esc(estadoDoRobo(r))}</span></dd></div>
      <div><dt>Agora</dt><dd data-esc-agora>${esc(textoDoEstado(r))}</dd></div>
      <div><dt>Pedido</dt><dd>${r.tarefa ? esc('“' + r.tarefa.texto + '”') : 'Nenhum pedido agora'}</dd></div>
      ${r.ultimo ? `<div><dt>Resultado recente</dt><dd>${esc(r.ultimo.resultado)}</dd></div>` : ''}
    </dl>
    <div class="esc-faz"><b>O que vai fazer</b><ul>${a.faz.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
      <p class="esc-aviso">O que já é de verdade: o Sherlock lê os gargalos do painel e o Data lê os números. As outras ferramentas (arquivos, Mac, internet) entram nas próximas etapas: até lá, o pedido fica anotado e o robô avisa.</p></div>
    <div class="esc-acoes"><button type="button" class="btn peq" data-esc="ver">${a.id === 'atlas' ? 'Ver a Central' : 'Ver a mini sala'}</button>${r.tarefa ? '<button type="button" class="btn peq" data-esc="dispensar">Liberar do pedido</button>' : ''}</div>`;
  CAMPO.cartao.hidden = false;
}
function fecharCartao() { CAMPO.cartaoDe = ''; if (CAMPO.cartao) CAMPO.cartao.hidden = true; }
// Atualiza os textos que mudam (cartão aberto e a faixa do time no rodapé)
function atualizarTextosDoTime() {
  if (CAMPO.cartaoDe && CAMPO.cartao && !CAMPO.cartao.hidden) {
    const r = CAMPO.robos.get(CAMPO.cartaoDe); const e1 = CAMPO.cartao.querySelector('[data-esc-estado]'), e2 = CAMPO.cartao.querySelector('[data-esc-agora]');
    if (e1) e1.textContent = estadoDoRobo(r); if (e2) e2.textContent = textoDoEstado(r);
  }
  if (CAMPO.lugar) CAMPO.lugar.querySelectorAll('[data-agente]').forEach((el) => {
    const r = CAMPO.robos.get(el.dataset.agente); if (!r) return; const s = el.querySelector('.est'); const txt = textoDoEstado(r);
    if (s && s.textContent !== txt) s.textContent = txt; el.classList.toggle('andando', estadoDoRobo(r) === 'Caminhando');
  });
}
