/* =====================================================================
   CINEMA E LIGAÇÃO COM O PAINEL
   - Renderizador com sombras macias, reflexos (um "estúdio" assado uma vez como ambiente) e
     pós-processamento próprio: brilho em volta das luzes (bloom), cor de cinema (ACES) e vinheta.
     Sem WebGL2, desenha direto (sem o brilho).
   - O que não se mexe é juntado em poucas peças (assar): menos desenhos por quadro.
   - montarCampo(lugar): chamado pela tela Início a cada redesenho. Lê a empresa escolhida
     (data-empresa) ou a apresentação (data-apresentar) e monta as salas dela.
   ===================================================================== */

const POS = { ativo: false };
function criarRenderizador() {
  const T = THREE;
  const r = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, telaPequena() ? 1.5 : 1.75));
  r.outputEncoding = T.sRGBEncoding; r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 0.8;
  r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
  r.shadowMap.autoUpdate = false;   // o que faz sombra não se mexe: o mapa de sombra é feito uma vez (e de novo quando as salas mudam)
  r.domElement.className = 'campo-canvas';
  CAMPO.renderer = r; CAMPO.el = r.domElement;
  POS.ativo = !!(r.capabilities.isWebGL2);
  return r;
}
// Ambiente para os reflexos: uma sala branca com faixas de luz quente e uma janela de fim de tarde
function ambienteDeReflexo(renderer) {
  const T = THREE, cena = new T.Scene();
  const sala = new T.Mesh(new T.BoxGeometry(30, 12, 30), new T.MeshBasicMaterial({ color: 0x3a3840, side: T.BackSide })); sala.position.y = 5; cena.add(sala);
  const luzM = (cor, k) => { const m = new T.MeshBasicMaterial({ color: cor }); m.color.multiplyScalar(k); return m; };
  [[-6, 10.9, 0], [6, 10.9, 0], [0, 10.9, -8], [0, 10.9, 8]].forEach(([x, y, z]) => { const p = new T.Mesh(new T.BoxGeometry(5, 0.2, 2.2), luzM(0xffe6cc, 0.8)); p.position.set(x, y, z); cena.add(p); });
  const jan = new T.Mesh(new T.PlaneGeometry(26, 6), luzM(0xffb98a, 0.9)); jan.position.set(0, 4, -14.9); cena.add(jan);
  const jan2 = new T.Mesh(new T.PlaneGeometry(26, 4), luzM(0x7a6fb0, 1.4)); jan2.position.set(0, 8, -14.85); cena.add(jan2);
  [-1, 1].forEach((k) => { const f = new T.Mesh(new T.BoxGeometry(0.2, 0.3, 26), luzM(0xff8a2a, 4)); f.position.set(k * 14.8, 1, 0); cena.add(f); });
  const chao = new T.Mesh(new T.PlaneGeometry(30, 30).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0x5a554f })); chao.position.y = -0.95; cena.add(chao);
  const pm = new T.PMREMGenerator(renderer); const env = pm.fromScene(cena, 0.035).texture; pm.dispose();
  return env;
}
function montarLuzes(cena) {
  const T = THREE;
  cena.add(new T.HemisphereLight(0xffe9d6, 0x6a4a5a, 0.24));
  const sol = new T.DirectionalLight(0xffdcb8, 0.62); sol.position.set(-16, 30, 26); sol.target.position.set(0, 0, -4);
  sol.castShadow = true; const sc = sol.shadow.camera; sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.far = 110; sc.near = 5; sc.far = 80;
  sol.shadow.mapSize.set(telaPequena() ? 2048 : 4096, telaPequena() ? 2048 : 4096); sol.shadow.bias = -0.0003; sol.shadow.normalBias = 0.025;
  cena.add(sol, sol.target);
  const frente = new T.DirectionalLight(0xffd2b0, 0.25); frente.position.set(10, 8, 30); cena.add(frente);
  const contra = new T.DirectionalLight(0xb9a6ff, 0.22); contra.position.set(6, 12, -30); cena.add(contra);   // luz lilás de trás (contorno de desenho)
}

/* ---------- Pós-processamento: brilho das luzes + cor de cinema + vinheta ---------- */
const VERT_TELA = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
function criarPos(renderer) {
  const T = THREE;
  const quad = new T.Mesh(new T.PlaneGeometry(2, 2)); const cenaQ = new T.Scene(); cenaQ.add(quad); quad.frustumCulled = false;
  const camQ = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const alvo = (w, h, amostras) => new T.WebGLRenderTarget(w, h, { type: T.HalfFloatType, samples: amostras || 0, depthBuffer: !!amostras });
  const claro = new T.ShaderMaterial({ uniforms: { tCena: { value: null }, limiar: { value: 1.5 } }, vertexShader: VERT_TELA,
    fragmentShader: 'uniform sampler2D tCena; uniform float limiar; varying vec2 vUv; void main(){ vec3 c = texture2D(tCena, vUv).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(limiar, limiar + 1.2, l), 1.0); }' });
  const borrar = new T.ShaderMaterial({ uniforms: { tFonte: { value: null }, direcao: { value: new T.Vector2() } }, vertexShader: VERT_TELA,
    fragmentShader: 'uniform sampler2D tFonte; uniform vec2 direcao; varying vec2 vUv; void main(){ vec3 s = texture2D(tFonte, vUv).rgb * 0.227; s += (texture2D(tFonte, vUv + direcao * 1.385).rgb + texture2D(tFonte, vUv - direcao * 1.385).rgb) * 0.316; s += (texture2D(tFonte, vUv + direcao * 3.231).rgb + texture2D(tFonte, vUv - direcao * 3.231).rgb) * 0.070; gl_FragColor = vec4(s, 1.0); }' });
  const final = new T.ShaderMaterial({ uniforms: { tCena: { value: null }, b0: { value: null }, b1: { value: null }, b2: { value: null }, b3: { value: null }, b4: { value: null }, forca: { value: 1.0 }, exposicao: { value: 0.62 }, vinheta: { value: 0.32 } }, vertexShader: VERT_TELA,
    fragmentShader: `uniform sampler2D tCena, b0, b1, b2, b3, b4; uniform float forca, exposicao, vinheta; varying vec2 vUv;
      vec3 ajuste(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
      vec3 aces(vec3 c){ const mat3 i = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777); const mat3 o = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602); return clamp(o * ajuste(i * c), 0.0, 1.0); }
      vec3 paraSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
      void main(){
        vec3 c = texture2D(tCena, vUv).rgb;
        vec3 b = texture2D(b0, vUv).rgb * 0.34 + texture2D(b1, vUv).rgb * 0.26 + texture2D(b2, vUv).rgb * 0.2 + texture2D(b3, vUv).rgb * 0.12 + texture2D(b4, vUv).rgb * 0.08;
        c += b * forca;
        c = aces(c * exposicao / 0.6);
        float lum = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = clamp(mix(vec3(lum), c, 1.32), 0.0, 1.0); c = clamp((c - 0.5) * 1.1 + 0.5, 0.0, 1.0);   // um pouco mais de contraste   // cores mais vivas (jeito de desenho)
        vec2 d = vUv - 0.5; c *= 1.0 - vinheta * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
        gl_FragColor = vec4(paraSRGB(c), 1.0);
      }` });
  POS.T = { quad, cenaQ, camQ, claro, borrar, final, alvo };
  POS.ativo = true;
}
function tamanhoPos(w, h) {
  if (!POS.ativo || !POS.T) return; const T = POS.T, pr = CAMPO.renderer.getPixelRatio(), W = Math.max(2, Math.round(w * pr)), H = Math.max(2, Math.round(h * pr));
  if (POS.w === W && POS.h === H) return; POS.w = W; POS.h = H;
  (POS.rts || []).forEach((x) => x.dispose());
  POS.cena = T.alvo(W, H, 4); POS.niveis = [];
  let lw = Math.round(W / 2), lh = Math.round(H / 2);
  POS.claro = T.alvo(lw, lh);
  for (let k = 0; k < 5; k++) { POS.niveis.push({ a: T.alvo(lw, lh), b: T.alvo(lw, lh), w: lw, h: lh }); lw = Math.max(2, Math.round(lw / 2)); lh = Math.max(2, Math.round(lh / 2)); }
  POS.rts = [POS.cena, POS.claro].concat(...POS.niveis.map((n) => [n.a, n.b]));
}
function desenharQuadro() {
  const R = CAMPO.renderer, cena = CAMPO.cena, cam = CAMPO.camera;
  if (!POS.ativo || !POS.cena) { R.setRenderTarget(null); R.render(cena, cam); return; }
  const T = POS.T, passe = (mat, alvo) => { T.quad.material = mat; R.setRenderTarget(alvo); R.render(T.cenaQ, T.camQ); };
  R.setRenderTarget(POS.cena); R.render(cena, cam);
  T.claro.uniforms.tCena.value = POS.cena.texture; passe(T.claro, POS.claro);
  let fonte = POS.claro;
  POS.niveis.forEach((n) => {
    T.borrar.uniforms.tFonte.value = fonte.texture; T.borrar.uniforms.direcao.value.set(1 / n.w, 0); passe(T.borrar, n.a);
    T.borrar.uniforms.tFonte.value = n.a.texture; T.borrar.uniforms.direcao.value.set(0, 1 / n.h); passe(T.borrar, n.b);
    fonte = n.b;
  });
  const U = T.final.uniforms; U.tCena.value = POS.cena.texture; ['b0', 'b1', 'b2', 'b3', 'b4'].forEach((k, i) => { U[k].value = POS.niveis[i].b.texture; });
  passe(T.final, null);
}

/* ---------- Juntar o que não se mexe (menos desenhos por quadro) ---------- */
function ehVivo(o, raiz) { for (let x = o; x && x !== raiz.parent; x = x.parent) { if (x.userData && x.userData.vivo) return true; if (x.visible === false) return true; } return false; }
function assar(raiz) {
  raiz.updateMatrixWorld(true);
  const grupos = new Map(), inv = new THREE.Matrix4().copy(raiz.matrixWorld).invert();
  raiz.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material) || ehVivo(o, raiz) || o.userData.tipo) return;
    if (o.castShadow) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); const s = o.getWorldScale(new THREE.Vector3()); if (o.geometry.boundingSphere.radius * Math.max(s.x, s.y, s.z) < 0.22) o.castShadow = false; }   // peça pequena não faz sombra
    const chave = o.material.uuid + ':' + o.castShadow + ':' + o.receiveShadow + ':' + o.renderOrder;
    if (!grupos.has(chave)) grupos.set(chave, []); grupos.get(chave).push(o);
  });
  grupos.forEach((lista) => {
    if (lista.length < 2) return;
    const geos = lista.map((o) => { const g = o.geometry.clone(); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); return g; });
    const m = new THREE.Mesh(juntarGeometrias(geos), lista[0].material); geos.forEach((g) => g.dispose());
    m.castShadow = lista[0].castShadow; m.receiveShadow = lista[0].receiveShadow; m.renderOrder = lista[0].renderOrder; m.userData.assado = true;
    raiz.add(m); lista.forEach((o) => o.parent.remove(o));
  });
}

/* ---------- Montagem (uma vez) e as salas (sempre que a empresa ou os setores mudam) ---------- */
function iniciarEscritorio() {
  const T = THREE; geometrias(); navIniciar();
  CAMPO.animados = []; CAMPO.raio = new T.Raycaster();
  const R = criarRenderizador();
  const cena = new T.Scene(); CAMPO.cena = cena;
  cena.background = new T.Color(0x2a2240); cena.fog = new T.Fog(0x6b5478, 140, 330);
  cena.environment = ambienteDeReflexo(R);
  CAMPO.camera = new T.PerspectiveCamera(26, 1.6, 0.5, 500);
  CAM.alvo = new T.Vector3(); Object.assign(CAM, visaoGeral());
  montarLuzes(cena);
  const base = new T.Group(); base.name = 'base'; cena.add(base);
  montarSalao(base); montarCentral(base); montarNichos(base); montarLounge(base); montarEnfeites(base);
  assar(base);
  navCombinar();
  colocarRobos(cena);
  if (POS.ativo) { try { criarPos(R); } catch (x) { POS.ativo = false; } }
  ligarControles(R.domElement);
  CAMPO.iniciado = true;
}
// Chave do que aparece nas salas: se mudar, as salas são montadas de novo
function chaveDasSalas(e) {
  if (!e) return 'nenhuma';
  return [e.id, e.nome, logoDe(e)].concat(setoresDa(e.id).map((s) => { const D = dadosDaSala(s); return [s.id, s.nome, D.saude, D.nota, D.abertos, D.oport, D.horas].join(':'); })).join('|');
}
function atualizarSalas(empresaId) {
  const e = empresaPorId(empresaId) || null, chave = chaveDasSalas(e);
  if (CAMPO.chaveSalas === chave) return;
  const antes = CAMPO.salas ? new Set(CAMPO.salas.keys()) : null, mesmaEmpresa = CAMPO.empresaId === (e ? e.id : '');
  CAMPO.chaveSalas = chave; CAMPO.empresaId = e ? e.id : '';
  // tira as salas antigas (e quem estava lá dentro volta a escolher o que fazer)
  if (CAMPO.grupoSalas) {
    CAMPO.cena.remove(CAMPO.grupoSalas);
    CAMPO.grupoSalas.traverse((o) => { if (o.isMesh && o.userData.assado) o.geometry.dispose(); if (o.material && o.material.map && o.material.map.userData && o.material.map.userData.descartavel) o.material.map.dispose(); });
  }
  navLimparSalas();
  const g = montarSalas(e); CAMPO.grupoSalas = g; CAMPO.cena.add(g);
  g.traverse((o) => { if (o.isMesh && o.material && o.material.map && o.material.map.isCanvasTexture && !TEX.has(o.material.map)) { /* texturas da sala ficam com a sala */ } });
  assar(g); navCombinar(); CAMPO.renderer.shadowMap.needsUpdate = true;
  // salas novas da mesma empresa nascem com uma animação rápida de montagem
  if (antes && mesmaEmpresa) CAMPO.salas.forEach((s, id) => { if (!antes.has(id)) { s.nascendo = CAMPO.t; s.g.scale.set(1, 0.02, 1); } });
  if (CAMPO.robos) CAMPO.robos.forEach((r) => {
    if (r.lugar && r.lugar.camada === 'salas') { r.lugar = null; }
    if (r.atividade && r.atividade.tipo === 'visitar') { r.caminho = null; r.atividade.chegou = true; r.atividade.ate = 0; }
  });
}
function passoDasSalas(t, dt) {
  if (!CAMPO.salas) return;
  CAMPO.salas.forEach((s) => {
    const alvo = s.alvoBrilho || 0; s.brilho = misturar(s.brilho || 0, alvo, Math.min(1, dt * 10)); s.contorno.material.opacity = s.brilho * 0.9;
    if (s.nascendo != null) { const k = Math.min(1, (t - s.nascendo) / 1.4), e = 1 - Math.pow(1 - k, 3); s.g.scale.y = Math.max(0.02, e); s.contorno.material.opacity = Math.max(s.contorno.material.opacity, 1 - k); if (k >= 1) s.nascendo = null; }
  });
}

/* ---------- Laço de quadros ---------- */
function ajustarTamanho() {
  const el = CAMPO.lugar; if (!el) return; const w = el.clientWidth || 800, h = el.clientHeight || 500;
  if (CAMPO.w === w && CAMPO.h === h) return; CAMPO.w = w; CAMPO.h = h;
  CAMPO.renderer.setSize(w, h, false); CAMPO.el.style.width = '100%'; CAMPO.el.style.height = '100%';
  CAMPO.camera.aspect = w / h; CAMPO.camera.updateProjectionMatrix(); tamanhoPos(w, h);
}
function quadroDoEscritorio(agora) {
  if (!CAMPO.rodando) return;
  CAMPO.raf = requestAnimationFrame(quadroDoEscritorio);
  if (document.hidden) { CAMPO.ultimo = 0; return; }
  const dt = CAMPO.ultimo ? Math.min(0.05, (agora - CAMPO.ultimo) / 1000) : 0.016; CAMPO.ultimo = agora;
  const t = (CAMPO.t += dt);
  ajustarTamanho();
  passoDosRobos(t, dt); passoDasSalas(t, dt);
  CAMPO.animados.forEach((f) => f(t, dt));
  passoCamera();
  if (t - (CAMPO.textosEm || 0) > 0.4) { CAMPO.textosEm = t; atualizarTextosDoTime(); atualizarFalaAtlas(); if (CAMPO.telao) CAMPO.telao.desenhar(); }
  if (t - (CAMPO.telaTimeEm || 0) > 1.0 && CAMPO.telaDoTime) { CAMPO.telaTimeEm = t; CAMPO.telaDoTime.desenhar(); }
  desenharQuadro();
}
function montarCampo(lugar) {
  if (!campoDisponivel()) return;
  try {
    if (!CAMPO.iniciado) iniciarEscritorio();
    CAMPO.lugar = lugar;
    if (CAMPO.el.parentNode !== lugar) lugar.prepend(CAMPO.el);
    camadaHTML(lugar); CAMPO.w = 0; ajustarTamanho();
    const ap = lugar.dataset.apresentar || '';
    CAMPO.ap = ap ? { id: ap } : null;
    atualizarSalas(ap || lugar.dataset.empresa || '');
    if (!CAMPO.rodando) {
      CAMPO.rodando = true; CAMPO.ultimo = 0; CAMPO.raf = requestAnimationFrame(quadroDoEscritorio);
      const geral = visaoGeral();
      if (!CAMPO.jaAbriu && !movimentoReduzido()) { CAM.alvo.copy(geral.alvo); CAM.raio = geral.raio * 1.45; CAM.theta = -0.7; CAM.phi = 0.62; animarCamera(geral, 2400); }
      else if (!CAM.mexeu || ap) animarCamera(geral, 0);
      CAMPO.jaAbriu = true;
    }
    if (CAMPO.festa) executarFesta();
  } catch (x) {
    console.warn('Escritório 3D indisponível:', x); CAMPO.disponivel = false; pararCampo();
    if (typeof render === 'function') setTimeout(() => render(true), 0);
  }
}
function pararCampo() {
  if (!CAMPO.rodando) return;
  CAMPO.rodando = false; cancelAnimationFrame(CAMPO.raf); CAMPO.ap = null;
}
// Gargalo resolvido: o time comemora (quem está de pé pula, o Atlas acena) e o número aparece por cima
function comemorarNoCampo(gargaloId, texto) {
  const g = typeof gargaloPorId === 'function' ? gargaloPorId(gargaloId) : null;
  CAMPO.festa = { empresaId: g ? g.empresaId : '', texto: texto || 'Gargalo resolvido' };
  if (CAMPO.rodando) executarFesta();
}
function executarFesta() {
  const f = CAMPO.festa; CAMPO.festa = null; if (!f || !CAMPO.lugar) return;
  CAMPO.festaAte = CAMPO.t + 3.2;
  const b = document.createElement('div'); b.className = 'esc-festa'; b.textContent = f.texto; CAMPO.lugar.appendChild(b);
  setTimeout(() => b.remove(), 3600);
}
// Esc sai da apresentação e volta para a página da empresa
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && CAMPO.ap && CAMPO.rodando) location.hash = 'e-' + CAMPO.ap.id; });
// Retrato do robô para o cartão: desenhado uma vez numa cena só dele
const RETRATOS = new Map();
function retratoDo(id) {
  if (RETRATOS.has(id)) return RETRATOS.get(id);
  try {
    const T = THREE, R = CAMPO.renderer, a = agentePorId(id), cena = new T.Scene(); cena.background = new T.Color(0x1b2029); cena.environment = CAMPO.cena.environment;
    const r = montarRobo(a); cena.add(r.g); r.g.rotation.y = -0.35; r.bracos[0].ombro.rotation.z = -0.25; r.bracos[1].ombro.rotation.z = 0.25; mudarRosto(r, 'feliz', 0, 0);
    const l1 = new T.DirectionalLight(0xffffff, 1.4); l1.position.set(-2, 3, 4); cena.add(l1); cena.add(new T.HemisphereLight(0xe8eeff, 0x554433, 0.6));
    const l2 = new T.DirectionalLight(new T.Color(a.cor), 1.2); l2.position.set(3, 1, -2); cena.add(l2);
    const cam = new T.PerspectiveCamera(28, 1, 0.1, 20); const h = r.alturaCabeca * 0.62; cam.position.set(0, h + 0.15, 2.5); cam.lookAt(0, h, 0);
    const S = 220, pr = R.getPixelRatio(), alvo = R.getRenderTarget(), vp = new T.Vector4(); R.getViewport(vp);
    R.setRenderTarget(null); R.setViewport(0, 0, S / pr, S / pr); R.setScissor(0, 0, S / pr, S / pr); R.setScissorTest(true);
    R.render(cena, cam);
    const c = document.createElement('canvas'); c.width = c.height = S; const H = R.domElement.height;
    c.getContext('2d').drawImage(R.domElement, 0, H - S, S, S, 0, 0, S, S);
    R.setScissorTest(false); R.setViewport(vp); R.setRenderTarget(alvo);
    const url = c.toDataURL('image/png'); RETRATOS.set(id, url); return url;
  } catch (x) { RETRATOS.set(id, ''); return ''; }
}
