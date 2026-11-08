<script>
'use strict';
/* =====================================================================
   Campo 3D das empresas (tela Início)

   Cada empresa é uma ilha flutuando num campo aberto. No centro fica a
   torre da Real Forte, ligada a cada empresa por uma linha de luz.
   Em cada ilha:
   - a cena do segmento: distribuição tem galpão e caminhões rodando,
     indústria tem fábrica com fumaça, varejo tem loja com gente entrando...
     (o segmento é lido do cadastro da empresa; ver CENAS);
   - a logo da empresa estampada na fachada (sem logo, vai o nome);
   - um prédio por setor: a ALTURA é a nota do check-up e a COR do topo é
     a saúde do setor (verde saudável, amarelo atenção, vermelho crítico,
     azul em diagnóstico, cinza sem diagnóstico);
   - losangos acima do setor: vermelho = gargalo aberto, azul = oportunidade aberta;
   - o anel de luz da ilha tem a cor da saúde da empresa.

   Mouse: arrastar gira, rolar aproxima, botão direito (ou Shift) arrasta o campo,
   passar por cima levanta a ilha, clicar voa até a empresa e abre a página dela.
   Celular: arrastar gira, pinça aproxima, um toque escolhe, outro toque abre.

   Usa a biblioteca Three.js (carregada no topo da página). Sem ela, ou se o
   aparelho não tiver 3D, a tela Início mostra os cartões de sempre.
   Nada aqui grava dados: o campo só lê o que está no painel.
   ===================================================================== */

const CAMPO = { iniciado: false, rodando: false, ilhas: new Map(), t: 0 };
const ALTURA_ILHA = 0.04;     // a quadra da empresa fica no nível da calçada (sem platô)

// Cada segmento vira uma cena. A primeira regra que bater com o texto do segmento vale.
const CENAS = [
  ['distribuicao', /distribui|atacad|log[ií]stic|transport|entrega|armaz|frete|centro de distribui/i],
  ['industria', /ind[uú]stri|f[aá]brica|manufat|metal|pl[aá]stic|t[eê]xtil|confec|qu[ií]mic|gr[aá]fica/i],
  ['agro', /agro|fazenda|rural|gr[aã]os|caf[eé]|pecu[aá]r|agr[ií]col|cooperativa|frigor/i],
  ['construcao', /constru|obra|engenharia|imobili[aá]r|incorpora/i],
  ['saude', /sa[uú]de|cl[ií]nica|hospital|farm[aá]c|odonto|m[eé]dic|laborat/i],
  ['tecnologia', /tecnolog|software|sistemas|\bti\b|digital|internet|telecom|startup/i],
  ['varejo', /varejo|loja|supermerc|mercado|com[eé]rcio|restaur|aliment|padaria|food|moda/i]
];
const cenaDoSegmento = (texto) => { const r = CENAS.find(([, re]) => re.test(String(texto || ''))); return r ? r[0] : 'servicos'; };

const COR3D = {
  chao: 0x0a1527, linha: 0x1c3a66, linha2: 0x132a4c,
  topo: 0xe8edf4, rocha: 0x1b2e50, rocha2: 0x24406b,
  parede: 0xf4f1ea, parede2: 0xdfe3e9, telhado: 0x2a4373, navy: 0x0f2342,
  laranja: 0xd9681a, vidro: 0x8fbaf5, asfalto: 0x2a3346, faixa: 0xf2f4f8,
  verde: 0x3f9e66, verde2: 0x2f7f52, terra: 0x9a7350, papelao: 0xc99a62, vermelho: 0xd8443a
};
// Cor da saúde (setor e empresa)
const COR_SAUDE = { saudavel: 0x2fbf71, atencao: 0xf0b429, critico: 0xf0523f, andamento: 0x4d8ff0, sem: 0x8796ad };
const COR_OPORTUNIDADE = 0x38bdf8;   // losango azul-claro das oportunidades
const COR_SAUDE_CSS = { saudavel: '#2fbf71', atencao: '#f0b429', critico: '#f0523f', andamento: '#4d8ff0', sem: '#8796ad' };

// O campo só aparece com a biblioteca carregada e com 3D disponível no aparelho
function campoDisponivel() {
  if (CAMPO.disponivel != null) return CAMPO.disponivel;
  try {
    const c = document.createElement('canvas');
    CAMPO.disponivel = !!(window.THREE && window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (x) { CAMPO.disponivel = false; }
  return CAMPO.disponivel;
}
const movimentoReduzido = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const telaPequena = () => window.innerWidth < 700;

/* ---------- Peças básicas (geometrias e materiais reaproveitados) ---------- */
const G3 = {};
function geometrias() {
  const T = THREE;
  G3.caixa = new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);           // base no y = 0
  G3.cil = new T.CylinderGeometry(1, 1, 1, 24).translate(0, 0.5, 0);
  G3.cone = new T.ConeGeometry(1, 1, 24).translate(0, 0.5, 0);
  G3.roda = new T.CylinderGeometry(1, 1, 1, 14).rotateX(Math.PI / 2);   // eixo no z
  G3.bola = new T.IcosahedronGeometry(1, 2);
  G3.copa = copaIrregular();   // copa com tufos (acabamento de cinema)
  G3.losango = new T.OctahedronGeometry(1, 0);
  const tri = new T.Shape(); tri.moveTo(-0.5, 0); tri.lineTo(0.5, 0); tri.lineTo(0, 1); tri.closePath();
  G3.prismaZ = new T.ExtrudeGeometry(tri, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);   // cumeeira no z
  G3.prismaX = G3.prismaZ.clone().rotateY(Math.PI / 2);                                              // cumeeira no x
  G3.placa = new T.PlaneGeometry(1, 1);
  G3.caixaC = new T.BoxGeometry(1, 1, 1);   // centrada (para peças que giram em volta do meio)
}
const cacheMat = new Map();
function mat(cor, op) {
  const chave = cor + '|' + JSON.stringify(op || {});
  if (!cacheMat.has(chave)) cacheMat.set(chave, new THREE.MeshStandardMaterial(Object.assign({ color: cor, roughness: 0.78, metalness: 0.04 }, op || {})));
  return cacheMat.get(chave);
}
// Luz (topo dos setores, losangos, LEDs): fora do ajuste de tons para a cor sair pura, sem desbotar
const luzMat = (cor, forca) => mat(cor, { emissive: cor, emissiveIntensity: forca == null ? 1 : forca, roughness: 0.4, toneMapped: false });
function peca(pai, geo, material, sx, sy, sz, x, y, z) {
  const m = new THREE.Mesh(geo, material);
  m.scale.set(sx, sy, sz); m.position.set(x || 0, y || 0, z || 0);
  m.castShadow = true; m.receiveShadow = true;
  pai.add(m); return m;
}
const caixa = (pai, w, h, d, cor, x, y, z) => peca(pai, G3.caixa, typeof cor === 'number' ? mat(cor) : cor, w, h, d, x, y, z);
const cilindro = (pai, r, h, cor, x, y, z) => peca(pai, G3.cil, typeof cor === 'number' ? mat(cor) : cor, r, h, r, x, y, z);
const cone = (pai, r, h, cor, x, y, z) => peca(pai, G3.cone, typeof cor === 'number' ? mat(cor) : cor, r, h, r, x, y, z);

// Texturas desenhadas na hora (brilho redondo, janelas, logo)
function texturaBrilho() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function brilho(pai, cor, tamanho, x, y, z, forca) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: CAMPO.texBrilho, color: cor, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: forca == null ? 0.8 : forca }));
  s.scale.set(tamanho, tamanho, 1); s.position.set(x, y, z); pai.add(s); return s;
}
// Janelas: grade de retângulos claros, usada como luz da fachada. "acesas" é a chance de cada janela estar acesa.
function texturaJanelas(colunas, linhas, acesas, corLuz) {
  const c = document.createElement('canvas'); c.width = colunas * 16; c.height = linhas * 16;
  const g = c.getContext('2d');
  const desenhar = () => {
    g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < colunas; i++) for (let j = 0; j < linhas; j++) {
      if (Math.random() > acesas) continue;
      g.fillStyle = corLuz || '#ffffff'; g.globalAlpha = 0.55 + Math.random() * 0.45;
      g.fillRect(i * 16 + 3, j * 16 + 4, 10, 8);
    }
    g.globalAlpha = 1;
  };
  desenhar();
  const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
  return { tex, redesenhar: () => { desenhar(); tex.needsUpdate = true; } };
}
const iniciaisDe = (nome) => String(nome || '?').trim().split(/\s+/).filter((p) => !/^(de|da|do|dos|das|e|ltda|me|sa|s\/a)$/i.test(p)).slice(0, 2).map((p) => p.charAt(0)).join('').toUpperCase() || '?';
/* Cores da logo: a empresa com logo azul e amarela ganha prédios com telhado azul e faixas amarelas.
   A logo é lida uma vez (pixels coloridos, sem branco, preto e cinza) e as duas cores mais
   presentes viram "telhado" (a principal) e "destaque" (a segunda). Sem logo, ficam as cores da Real Forte. */
const CORES_LOGO = new Map();
const CORES_PADRAO = { telhado: COR3D.telhado, destaque: COR3D.laranja, escuro: COR3D.navy };
function coresDaLogo(logo) {
  if (!logo) return CORES_PADRAO;
  if (CORES_LOGO.has(logo)) return CORES_LOGO.get(logo) || CORES_PADRAO;
  CORES_LOGO.set(logo, null);
  const img = new Image();
  img.onload = () => {
    try {
      const k = 64 / Math.max(img.width, img.height); const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
      const g = cv.getContext('2d'); g.drawImage(img, 0, 0, cv.width, cv.height);
      const px = g.getImageData(0, 0, cv.width, cv.height).data; const baldes = new Map(); const cor = new THREE.Color(); const hsl = {};
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] < 235) continue;
        cor.setRGB(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255); cor.getHSL(hsl);
        if (hsl.s < 0.28 || hsl.l > 0.9 || hsl.l < 0.1) continue;   // branco, preto e cinza não contam
        // Pixels de borda (meio apagados) e cores fracas pesam menos que as cores cheias da logo
        const peso = hsl.s * hsl.s;
        const bk = Math.round(hsl.h * 12) % 12; const x = baldes.get(bk) || { n: 0, r: 0, g: 0, bl: 0 };
        x.n += peso; x.r += px[i] * peso; x.g += px[i + 1] * peso; x.bl += px[i + 2] * peso; baldes.set(bk, x);
      }
      const lista = [...baldes.entries()].sort((a, b) => b[1].n - a[1].n);
      if (!lista.length) { CORES_LOGO.set(logo, CORES_PADRAO); return; }
      const media = (x) => new THREE.Color(x.r / x.n / 255, x.g / x.n / 255, x.bl / x.n / 255);
      const principal = media(lista[0][1]);
      const total = lista.reduce((s, [, x]) => s + x.n, 0);
      const distante = (b) => Math.min(Math.abs(b - lista[0][0]), 12 - Math.abs(b - lista[0][0])) >= 2;
      const outro = lista.find(([bk, x]) => distante(bk) && x.n > total * 0.03);
      const ph = {}; principal.getHSL(ph);
      const telhado = new THREE.Color().setHSL(ph.h, Math.min(0.85, ph.s), Math.min(0.45, Math.max(0.2, ph.l)));
      const destaque = outro ? media(outro[1]) : new THREE.Color().setHSL(ph.h, Math.min(1, ph.s + 0.1), Math.min(0.7, ph.l + 0.2));
      const escuro = new THREE.Color().setHSL(ph.h, Math.min(0.7, ph.s), 0.16);
      CORES_LOGO.set(logo, { telhado: telhado.getHex(), destaque: destaque.getHex(), escuro: escuro.getHex() });
      if (CAMPO.rodando) atualizarIlhas();   // refaz a ilha com as cores novas
    } catch (x) { CORES_LOGO.set(logo, CORES_PADRAO); }
  };
  img.onerror = () => CORES_LOGO.set(logo, CORES_PADRAO);
  img.src = logo;
  return CORES_PADRAO;
}
const corCss = (n) => '#' + new THREE.Color(n).getHexString();
// Placa da fachada: a logo da empresa (fundo branco) ou, sem logo, o nome (fundo escuro), com uma faixa da cor de destaque embaixo
function texturaPlaca(e, largura, altura, aoCarregar) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = Math.round(1024 * altura / largura);
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = CAMPO.renderer.capabilities.getMaxAnisotropy();
  const cores = e.cores || CORES_PADRAO;
  const faixa = () => { g.fillStyle = corCss(cores.destaque); g.fillRect(0, c.height * 0.9, c.width, c.height * 0.1); };
  const comNome = () => {
    g.fillStyle = corCss(cores.escuro); g.fillRect(0, 0, c.width, c.height);
    faixa();
    const texto = String(e.nome || '').toUpperCase();
    let fonte = c.height * 0.5; g.font = `700 ${fonte}px Arial, sans-serif`;
    while (g.measureText(texto).width > c.width * 0.86 && fonte > 20) { fonte -= 4; g.font = `700 ${fonte}px Arial, sans-serif`; }
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(texto, c.width * 0.5, c.height * 0.46);
    tex.needsUpdate = true;
  };
  comNome();
  if (e.logo) {
    const img = new Image(); if (!/^(data|blob):/.test(e.logo)) img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
        const folga = 0.09, w = c.width * (1 - folga * 2), h = c.height * 0.9 * (1 - folga * 2);
        const k = Math.min(w / img.width, h / img.height);
        g.drawImage(img, (c.width - img.width * k) / 2, (c.height * 0.9 - img.height * k) / 2, img.width * k, img.height * k);
        faixa();
        tex.needsUpdate = true; if (aoCarregar) aoCarregar();
      } catch (x) { comNome(); }
    };
    img.onerror = comNome;
    img.src = e.logo;
  }
  return tex;
}
// Letreiro da fachada: moldura saltada, logo iluminada, filete de luz na cor de destaque e dois refletores
function placaLogo(pai, il, e, w, h, x, y, z, giro) {
  const grupo = new THREE.Group(); grupo.position.set(x, y, z); grupo.rotation.y = giro || 0; pai.add(grupo);
  const cores = e.cores || CORES_PADRAO;
  caixa(grupo, w + 0.18, h + 0.18, 0.14, cores.escuro, 0, -(h + 0.18) / 2, 0.04);
  const tex = texturaPlaca(e, w, h); il.descartar.push(tex);
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.32 }); il.descartar.push(m);
  const p = new THREE.Mesh(G3.placa, m); p.scale.set(w, h, 1); p.position.set(0, 0, 0.115); grupo.add(p);
  const filete = caixa(grupo, w + 0.18, 0.035, 0.03, luzMat(cores.destaque, 1.6), 0, -(h + 0.18) / 2 - 0.035, 0.1); filete.castShadow = false;
  brilho(grupo, cores.destaque, w * 0.9, 0, -(h / 2) - 0.12, 0.2, 0.22);
  [-w * 0.32, w * 0.32].forEach((dx) => {
    caixa(grupo, 0.04, 0.04, 0.32, 0x2b3446, dx, h / 2 + 0.1, 0.22);
    brilho(grupo, 0xfff1d6, 0.55, dx, h / 2 + 0.1, 0.38, 0.85);
  });
  return grupo;
}

/* ---------- Gente ----------
   Personagens em miniatura com proporção de gente: pernas e braços que mexem ao andar, pescoço, cabeça,
   cabelo (ou careca), uniforme na cor da empresa, crachá no peito e a logo da empresa nas costas.
   O corpo parado vira uma peça só com as cores nos vértices (uma chamada de desenho), e as pernas e os
   braços são peças à parte para poderem balançar. A frente do boneco é o +x. */
const PELES = [0xf0c9a5, 0xe0b48e, 0xc99572, 0x9c6b4c, 0xf4d3b5];
const CACHE_PESSOA = new Map();
// Junta várias formas (cada uma com a sua cor e posição) numa só geometria com cor por vértice
function fundir(partes) {
  const pos = [], nor = [], cor = [], idx = []; let base = 0;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color(), nm = new THREE.Matrix3();
  partes.forEach(({ geo, p, r, esc, cor: hex }) => {
    const g = geo.index ? geo : geo;   // as formas básicas já têm índice
    e.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0); q.setFromEuler(e);
    m.compose(v.set(p[0], p[1], p[2]), q, s.set(esc[0], esc[1], esc[2])); nm.getNormalMatrix(m);
    c.setHex(hex);
    const P = g.attributes.position, N = g.attributes.normal, t = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      t.fromBufferAttribute(P, i).applyMatrix4(m); pos.push(t.x, t.y, t.z);
      t.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(t.x, t.y, t.z);
      cor.push(c.r, c.g, c.b);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base);
    else for (let i = 0; i < P.count; i++) idx.push(i + base);
    base += P.count;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
  geo.setIndex(idx); geo.computeBoundingSphere();
  return geo;
}
function formasDeGente() {
  if (G3.membro) return;
  G3.membro = new THREE.CapsuleGeometry(1, 1, 2, 7);        // altura total 3 (raio 1 + corpo 1 + raio 1)
  G3.esfera = new THREE.SphereGeometry(1, 12, 8);
  G3.meiaEsfera = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
  G3.cubo = new THREE.BoxGeometry(1, 1, 1);
  CAMPO.matGente = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.02 });
}
// Logo da empresa (para as costas do uniforme). Uma textura por logo, guardada.
function matLogoRoupa(logo) {
  if (!logo) return null;
  CAMPO.logosRoupa = CAMPO.logosRoupa || new Map();
  if (!CAMPO.logosRoupa.has(logo)) {
    const t = new THREE.TextureLoader().load(logo); t.encoding = THREE.sRGBEncoding;
    CAMPO.logosRoupa.set(logo, new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
  }
  return CAMPO.logosRoupa.get(logo);
}
/* opcoes: roupa (cor do uniforme), detalhe (gola/faixa), calca, pele, cabelo (cor, 'careca' ou null), capacete (cor),
   logo (data URL da logo da empresa), cracha (cor da fita do crachá). */
function novaPessoa(o) {
  formasDeGente();
  const pele = o.pele || PELES[0], roupa = o.roupa || 0x2f5ea8, calca = o.calca || 0x2b3446, detalhe = o.detalhe || roupa;
  const chave = [roupa, detalhe, calca, pele, o.cabelo, o.capacete, o.cracha, o.saia].join('|');
  if (!CACHE_PESSOA.has(chave)) {
    const corpo = [
      { geo: G3.membro, p: [0, 0.43, 0], esc: [0.072, 0.045, 0.088], cor: roupa },             // tronco
      { geo: G3.cubo, p: [0, 0.505, 0], esc: [0.11, 0.025, 0.17], cor: roupa },               // ombros
      { geo: G3.cubo, p: [0.035, 0.515, 0], esc: [0.05, 0.018, 0.09], cor: detalhe },         // gola na cor de destaque
      { geo: G3.cubo, p: [0, 0.33, 0], esc: [0.125, 0.04, 0.165], cor: calca },                // cintura
      { geo: G3.membro, p: [0, 0.545, 0], esc: [0.022, 0.012, 0.022], cor: pele },              // pescoço
      { geo: G3.esfera, p: [0.004, 0.615, 0], esc: [0.058, 0.064, 0.055], cor: pele },         // cabeça
      { geo: G3.esfera, p: [0.05, 0.612, 0], esc: [0.012, 0.016, 0.012], cor: pele }           // nariz
    ];
    if (o.cracha !== false) {
      corpo.push({ geo: G3.cubo, p: [0.072, 0.43, 0.035], esc: [0.006, 0.042, 0.03], cor: 0xffffff });     // crachá
      corpo.push({ geo: G3.cubo, p: [0.073, 0.452, 0.035], esc: [0.006, 0.01, 0.03], cor: o.cracha || detalhe });
      corpo.push({ geo: G3.cubo, p: [0.07, 0.49, 0.035], esc: [0.004, 0.05, 0.004], cor: o.cracha || detalhe });   // fita
    }
    if (o.capacete) corpo.push({ geo: G3.meiaEsfera, p: [0, 0.632, 0], esc: [0.07, 0.06, 0.07], cor: o.capacete });
    else if (o.cabelo && o.cabelo !== 'careca') {
      corpo.push({ geo: G3.meiaEsfera, p: [-0.006, 0.628, 0], esc: [0.063, 0.058, 0.06], cor: o.cabelo });
      corpo.push({ geo: G3.esfera, p: [-0.03, 0.6, 0], esc: [0.04, 0.045, 0.056], cor: o.cabelo });   // nuca
    }
    const perna = fundir([
      { geo: G3.membro, p: [0, -0.13, 0], esc: [0.032, 0.085, 0.034], cor: calca },
      { geo: G3.cubo, p: [0.018, -0.29, 0], esc: [0.075, 0.03, 0.045], cor: 0x1b1f2a }          // sapato
    ]);
    const braco = fundir([
      { geo: G3.membro, p: [0, -0.085, 0], esc: [0.024, 0.058, 0.024], cor: roupa },
      { geo: G3.esfera, p: [0, -0.19, 0], esc: [0.022, 0.024, 0.02], cor: pele }                 // mão
    ]);
    CACHE_PESSOA.set(chave, { corpo: fundir(corpo), perna, braco });
  }
  const formas = CACHE_PESSOA.get(chave);
  const g = new THREE.Group();
  const corpo = new THREE.Mesh(formas.corpo, CAMPO.matGente); corpo.castShadow = true; g.add(corpo);
  const pernas = [-0.042, 0.042].map((z) => { const pv = new THREE.Group(); pv.position.set(0, 0.31, z); const m = new THREE.Mesh(formas.perna, CAMPO.matGente); m.castShadow = true; pv.add(m); g.add(pv); return pv; });
  const bracos = [-0.105, 0.105].map((z) => { const pv = new THREE.Group(); pv.position.set(0, 0.5, z); const m = new THREE.Mesh(formas.braco, CAMPO.matGente); m.castShadow = false; pv.add(m); g.add(pv); return pv; });
  const mLogo = matLogoRoupa(o.logo);
  if (mLogo) { const p = new THREE.Mesh(G3.placa, mLogo); p.scale.set(0.11, 0.11 / (o.proporcaoLogo || 3.4), 1); p.position.set(-0.073, 0.46, 0); p.rotation.y = -Math.PI / 2; g.add(p); }
  const carga = caixa(g, 0.13, 0.11, 0.14, COR3D.papelao, 0.12, 0.36, 0); carga.visible = false;
  g.userData = { pernas, bracos, carga };
  g.scale.setScalar(o.escala || 1.32);
  return g;
}
// Pose sentada (pernas para a frente, braços no teclado)
function sentar(p, digitando) {
  p.userData.pernas.forEach((pv) => { pv.rotation.z = Math.PI / 2; });
  p.userData.bracos.forEach((pv) => { pv.rotation.z = digitando ? 1.1 : 0.35; });
  p.userData.sentado = true;
}
function levantar(p) { p.userData.pernas.forEach((pv) => { pv.rotation.z = 0; }); p.userData.bracos.forEach((pv) => { pv.rotation.z = 0; }); p.userData.sentado = false; }
// Uniforme de cada empresa a partir das cores da logo
function uniformeDa(il, i) {
  const c = il.cores || CORES_PADRAO, sorte = sorteio(il.id + 'farda' + i);
  const roupa = i % 3 === 2 ? c.destaque : c.telhado;
  return { roupa, detalhe: roupa === c.destaque ? c.telhado : c.destaque, calca: i % 4 === 3 ? 0x5a6577 : 0x2b3446, pele: PELES[Math.floor(sorte() * PELES.length)],
    cabelo: [0x1b1b1f, 0x3a2a1e, 0x5a3a22, 0xe8c66a, 'careca'][Math.floor(sorte() * 5)], logo: il.dados && il.dados.logo, cracha: c.destaque };
}
// Uniforme da Real Forte: azul-marinho, gola laranja e a logo da Real Forte nas costas
function uniformeRealForte(cabelo, pele) {
  return { roupa: 0x1f3a68, detalhe: COR3D.laranja, calca: 0x1d2840, pele: pele || PELES[0], cabelo, logo: (typeof LOGO !== 'undefined' && LOGO.claro) || null, proporcaoLogo: (typeof LOGO !== 'undefined' && LOGO.proporcao) || 3.4, cracha: COR3D.laranja };
}

/* ---------- Coisas que aparecem em várias cenas ---------- */
function placaDoca(n) {
  CAMPO.placasDoca = CAMPO.placasDoca || {};
  if (!CAMPO.placasDoca[n]) {
    const t = new THREE.CanvasTexture(telaDe(64, 64, (g) => { g.fillStyle = '#0f2342'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#ffb27a'; g.fillRect(0, 58, 64, 6); g.fillStyle = '#ffffff'; g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 32, 30); }));
    t.encoding = THREE.sRGBEncoding; CAMPO.placasDoca[n] = t;
  }
  return CAMPO.placasDoca[n];
}
function arvore(pai, x, z, s) {
  const k = s || 1;
  cilindro(pai, 0.07 * k, 0.45 * k, 0x7a5a3c, x, 0, z);
  const c = peca(pai, G3.copa, mat(Math.random() < 0.5 ? COR3D.verde : COR3D.verde2, { roughness: 0.85 }), 0.42 * k, 0.5 * k, 0.42 * k, x, 0.75 * k, z);
  c.rotation.y = Math.random() * 3;
}
function caminhao(corCabine, corFaixa) {
  const g = new THREE.Group();
  caixa(g, 1.3, 0.62, 0.52, COR3D.parede, -0.22, 0.2, 0);
  caixa(g, 1.31, 0.09, 0.53, corFaixa || COR3D.laranja, -0.22, 0.56, 0);
  caixa(g, 0.44, 0.52, 0.5, corCabine || COR3D.navy, 0.68, 0.2, 0);
  caixa(g, 0.05, 0.18, 0.42, luzMat(COR3D.vidro, 0.5), 0.91, 0.47, 0);
  [[-0.6, 0.27], [-0.6, -0.27], [0.1, 0.27], [0.1, -0.27], [0.7, 0.27], [0.7, -0.27]].forEach(([x, z]) => peca(g, G3.roda, mat(0x1a1f2b), 0.15, 0.15, 0.1, x, 0.15, z));
  brilho(g, 0xfff3c4, 0.5, 0.95, 0.3, 0.16, 0.7); brilho(g, 0xfff3c4, 0.5, 0.95, 0.3, -0.16, 0.7);
  return g;
}
function carro(cor) {
  const g = new THREE.Group();
  caixa(g, 0.9, 0.24, 0.44, cor, 0, 0.12, 0);
  caixa(g, 0.48, 0.2, 0.4, luzMat(COR3D.vidro, 0.25), -0.05, 0.36, 0);
  [[-0.3, 0.22], [-0.3, -0.22], [0.3, 0.22], [0.3, -0.22]].forEach(([x, z]) => peca(g, G3.roda, mat(0x1a1f2b), 0.11, 0.11, 0.08, x, 0.11, z));
  brilho(g, 0xfff3c4, 0.35, 0.47, 0.15, 0.13, 0.6); brilho(g, 0xfff3c4, 0.35, 0.47, 0.15, -0.13, 0.6);
  return g;
}

/* ---------- Cenas por segmento ----------
   Ficam no meio da cidade, com a frente (z positivo) voltada para o portão.
   O fundo da cidade (z negativo) fica para os prédios dos setores. */
const CENA3D = {
  distribuicao(g, il, e) {
    // Galpão com telhado de duas águas, faixa laranja e três docas
    caixa(g, 4.6, 1.9, 2.8, COR3D.parede, -0.9, 0, 0.7).userData.semTeto = true;   // sem tampa: o telhado é de vidro
    // Por dentro: paredes claras, piso de concreto e três fileiras de porta-paletes com caixas
    peca(g, G3.caixa, mat(0xe9ecf1, { side: THREE.BackSide, roughness: 0.9 }), 4.54, 1.88, 2.74, -0.9, 0.01, 0.7).castShadow = false;
    const lotePP = novoLote(), sortePP = sorteio(il.id + 'paletes'), montante = mat(il.cores.destaque, { roughness: 0.5 }), longarina = mat(0x2f5ea8, { roughness: 0.5 }), papelao = mat(COR3D.papelao), palete = mat(0x8a6a48);
    [-0.2, 0.6, 1.4].forEach((z) => {
      for (let x = -2.9; x <= 1.11; x += 0.8) [-0.17, 0.17].forEach((dz) => lotePP.add(G3.caixa, montante, x, 0, z + dz, 0.04, 1.4, 0.04));
      [0.45, 0.9, 1.35].forEach((y) => [-0.17, 0.17].forEach((dz) => lotePP.add(G3.caixa, longarina, -0.9, y, z + dz, 4.0, 0.04, 0.03, 0, 0, 0, false)));
      for (let x = -2.5; x < 1.1; x += 0.8) [0.03, 0.48, 0.93].forEach((y) => {
        if (sortePP() < 0.22) return;
        lotePP.add(G3.caixa, palete, x, y, z, 0.62, 0.05, 0.3, 0, 0, 0, false);
        const n = 1 + Math.floor(sortePP() * 2);
        for (let k = 0; k < n; k++) lotePP.add(G3.caixa, papelao, x - 0.16 + k * 0.32 * (n === 1 ? 0.5 : 1), y + 0.05, z, n === 1 ? 0.5 : 0.28, 0.28 + sortePP() * 0.08, 0.28, 0, 0, 0, false);
      });
    });
    lotePP.montar(g, il.descartar);
    // Telhado de duas águas em vidro, com tesouras na cor da logo
    const vidroTeto = new THREE.MeshStandardMaterial({ color: 0xcfe4f7, transparent: true, opacity: 0.28, roughness: 0.08, metalness: 0.3, depthWrite: false, side: THREE.DoubleSide }); il.descartar.push(vidroTeto);
    const tetoVidro = peca(g, G3.prismaX, vidroTeto, 4.8, 0.75, 3.0, -0.9, 1.9, 0.7); tetoVidro.castShadow = false;
    const tesoura = mat(il.cores.telhado, { roughness: 0.5 }), inclin = Math.atan2(0.75, 1.5), lado = Math.hypot(0.75, 1.5);
    for (let x = -3.3; x <= 1.51; x += 0.6) [1, -1].forEach((s) => { const v = peca(g, G3.caixaC, tesoura, 0.05, 0.05, lado, x, 1.9 + 0.375, 0.7 + s * 0.75); v.rotation.x = s * inclin; });
    caixa(g, 4.8, 0.07, 0.07, tesoura, -0.9, 2.62, 0.7);
    [-1, 1].forEach((s) => caixa(g, 4.8, 0.06, 0.06, tesoura, -0.9, 1.9, 0.7 + s * 1.47));
    // Faixa na cor da logo em volta do galpão (só nas paredes, para o vidro mostrar o lado de dentro)
    [[4.64, 0.04, 0, 1.4], [4.64, 0.04, 0, -1.4], [0.04, 2.84, 2.3, 0], [0.04, 2.84, -2.3, 0]].forEach(([w, d, dx, dz]) => caixa(g, w, 0.16, d, il.cores.destaque, -0.9 + dx, 1.6, 0.7 + dz));
    [-2.3, -1.05, 0.2].forEach((x) => { caixa(g, 0.8, 0.95, 0.06, 0x334058, x, 0, 2.12); caixa(g, 0.9, 0.05, 0.4, COR3D.parede2, x, 0.98, 2.3); });
    placaLogo(g, il, e, 3.7, 0.72, -0.9, 1.47, 2.1);
    // Paletes com caixas ao lado da doca
    [[1.85, 1.4], [2.35, 1.4], [1.85, 1.9], [2.35, 2.25]].forEach(([x, z], i) => {
      caixa(g, 0.42, 0.08, 0.42, 0x8a6a48, x, 0, z);
      for (let k = 0; k < 1 + (i % 3); k++) caixa(g, 0.36, 0.3, 0.36, COR3D.papelao, x, 0.08 + k * 0.3, z);
    });
    // Caminhões parados nas docas
    const portas = [-2.3, -1.05, 0.2].map((x) => caixa(g, 0.82, 0.95, 0.03, 0xc5ccd6, x, 0, 2.165));
    il.animados.push((t, dt) => { const alvo = (CAMPO.atividade == null ? 1 : CAMPO.atividade) > 0.5 ? 0.16 : 1; portas.forEach((p) => { p.scale.y += (alvo - p.scale.y) * Math.min(1, (dt || 0.016) * 2); p.position.y = 0.95 * (1 - p.scale.y); }); });
    [-2.3, -1.05, 0.2].forEach((x, i) => {
      const enc = caminhao(i === 1 ? il.cores.escuro : il.cores.destaque, i === 1 ? il.cores.destaque : il.cores.telhado); enc.position.set(x, 0.02, 3.07); enc.rotation.y = -Math.PI / 2; g.add(enc);
      const mDoca = new THREE.MeshBasicMaterial({ map: placaDoca(i + 1), toneMapped: false }); il.descartar.push(mDoca);
      const placa = new THREE.Mesh(G3.placa, mDoca); placa.scale.set(0.3, 0.3, 1); placa.position.set(x, 1.24, 2.135); g.add(placa);
    });
    // Esteira de caixas saindo da doca
    caixa(g, 0.4, 0.3, 1.0, 0x2b3446, 1.25, 0, 2.6);
    const caixas = [0, 1, 2].map(() => caixa(g, 0.24, 0.2, 0.24, COR3D.papelao, 1.25, 0.3, 2.2));
    il.animados.push((t) => caixas.forEach((c, i) => { const p = ((t * 0.35 + i / 3) % 1); c.position.z = 2.15 + p * 0.9; }));
  },
  industria(g, il, e) {
    caixa(g, 4.3, 1.6, 2.6, COR3D.parede, -0.8, 0, 0.8);
    [-0.25, 0.6, 1.45].forEach((z, i) => peca(g, G3.prismaX, mat(i % 2 ? il.cores.telhado : 0x34507f), 4.3, 0.55, 0.86, -0.8, 1.6, z + 0.2 - 0.6));
    caixa(g, 1.1, 1.0, 0.06, 0x334058, 0.4, 0, 2.12);
    placaLogo(g, il, e, 2.5, 0.66, -1.55, 1.18, 2.1);
    // Chaminés com fumaça
    [[1.9, 0.0, 3.0], [2.6, 0.6, 2.4]].forEach(([x, z, h], k) => {
      cilindro(g, 0.26, h, COR3D.parede2, x, 0, z);
      caixa(g, 0.54, 0.16, 0.54, il.cores.destaque, x, h * 0.72, z).scale.set(0.54, 0.16, 0.54);
      const fumacas = [0, 1, 2, 3, 4].map(() => { const m = new THREE.MeshStandardMaterial({ color: 0xe7ecf3, transparent: true, opacity: 0.6, roughness: 1 }); il.descartar.push(m); const b = new THREE.Mesh(G3.bola, m); b.userData.move = true; g.add(b); return b; });
      il.animados.push((t) => fumacas.forEach((b, i) => {
        const p = (t * 0.22 + i / 5 + k * 0.1) % 1;
        b.position.set(x + p * 0.6, h + p * 2.4, z - p * 0.3); const s = 0.18 + p * 0.45; b.scale.set(s, s, s); b.material.opacity = 0.65 * (1 - p);
      }));
    });
    // Esteira com produtos
    caixa(g, 3.4, 0.1, 0.5, 0x2b3446, -0.8, 0.35, 2.85);
    [-2.3, 0.7].forEach((x) => caixa(g, 0.08, 0.35, 0.4, 0x2b3446, x, 0, 2.85));
    const itens = [0, 1, 2, 3].map(() => caixa(g, 0.26, 0.24, 0.26, il.cores.destaque, 0, 0.45, 2.85));
    il.animados.push((t) => itens.forEach((c, i) => { c.position.x = -2.4 + ((t * 0.3 + i / 4) % 1) * 3.2; }));
  },
  varejo(g, il, e) {
    caixa(g, 4.2, 1.5, 2.4, COR3D.parede, -0.6, 0, 0.5);
    caixa(g, 3.4, 0.95, 0.05, luzMat(0xbcd8ff, 0.5), -0.6, 0.05, 1.72);
    for (let i = 0; i < 9; i++) { const f = caixa(g, 4.2 / 9, 0.06, 0.8, i % 2 ? COR3D.parede : il.cores.destaque, -0.6 - 2.1 + (i + 0.5) * 4.2 / 9, 1.08, 2.05); f.rotation.x = 0.35; }
    placaLogo(g, il, e, 3.3, 0.8, -0.6, 2.05, 1.7);
    caixa(g, 0.1, 0.5, 0.1, 0x2b3446, -1.9, 1.5, 1.66); caixa(g, 0.1, 0.5, 0.1, 0x2b3446, 0.7, 1.5, 1.66);
    // Estacionamento com carros parados
    for (let i = 0; i < 5; i++) caixa(g, 0.04, 0.01, 0.8, COR3D.faixa, -2.6 + i * 1.0, 0.015, 3.6);
    [[-2.1, 0x2f5ea8], [-0.1, COR3D.vermelho], [0.9, 0xe9edf3]].forEach(([x, cor]) => { const c = carro(cor); c.position.set(x, 0.01, 3.6); c.rotation.y = Math.PI / 2; g.add(c); });
    arvore(g, 2.6, 2.2, 1.2); arvore(g, 2.9, 0.6, 1);
  },
  servicos(g, il, e) {
    const janelas = texturaJanelas(6, 14, 0.55, '#ffe9b8'); il.descartar.push(janelas.tex);
    const fachada = new THREE.MeshStandardMaterial({ color: il.cores === CORES_PADRAO ? 0x5c7db3 : il.cores.telhado, roughness: 0.35, metalness: 0.3, emissive: 0xffffff, emissiveMap: janelas.tex, emissiveIntensity: 0.75 }); il.descartar.push(fachada); il.matsJanela.push([fachada, 0.75]);
    peca(g, G3.caixa, fachada, 2.0, 4.4, 2.0, -1.4, 0, 0.6);
    caixa(g, 2.1, 0.2, 2.1, COR3D.navy, -1.4, 4.4, 0.6);
    peca(g, G3.caixa, fachada, 1.7, 2.4, 1.7, 0.75, 0, 1.0);
    caixa(g, 1.8, 0.16, 1.8, COR3D.navy, 0.75, 2.4, 1.0);
    cilindro(g, 0.03, 1.0, 0xb8c2d4, -1.0, 4.6, 0.3);
    const pisca = brilho(g, 0xff4b3a, 0.6, -1.0, 5.65, 0.3, 0.9);
    il.animados.push((t) => { pisca.material.opacity = Math.sin(t * 3) > 0.3 ? 0.95 : 0.1; });
    let proxima = 0;
    il.animados.push((t) => { if (t > proxima) { proxima = t + 2.2; janelas.redesenhar(); } });
    // Totem com a logo na entrada
    caixa(g, 0.22, 1.25, 0.22, il.cores.escuro, -2.55, 0, 2.9); caixa(g, 0.22, 1.25, 0.22, il.cores.escuro, -0.25, 0, 2.9);
    placaLogo(g, il, e, 2.6, 0.82, -1.4, 1.7, 2.9);
    arvore(g, 1.9, 2.6, 1.1); arvore(g, 0.4, 2.9, 0.9); arvore(g, 2.6, 0.6, 1.2);
  },
  agro(g, il, e) {
    // Plantação em fileiras
    for (let i = 0; i < 9; i++) caixa(g, 3.4, 0.16, 0.18, i % 2 ? COR3D.verde : COR3D.verde2, 1.2, 0, 0.6 + i * 0.32);
    caixa(g, 3.6, 0.02, 3.0, COR3D.terra, 1.2, 0, 1.9);
    // Silos
    [[-2.9, 0.1], [-1.75, -0.2], [-2.3, 1.15]].forEach(([x, z]) => { cilindro(g, 0.55, 2.3, 0xd5dce6, x, 0, z); cone(g, 0.58, 0.6, 0xb4bfce, x, 2.3, z); caixa(g, 0.06, 2.3, 0.06, il.cores.destaque, x + 0.55, 0, z); });
    // Celeiro com a logo
    caixa(g, 2.2, 1.15, 1.3, 0xb5432f, -2.0, 0, 2.7);
    peca(g, G3.prismaX, mat(il.cores.telhado), 2.3, 0.6, 1.4, -2.0, 1.15, 2.7);
    placaLogo(g, il, e, 1.9, 0.55, -2.0, 0.72, 3.36);
    // Trator parado
    const trator = new THREE.Group();
    caixa(trator, 0.6, 0.3, 0.38, 0x3f9e66, 0, 0.18, 0);
    caixa(trator, 0.3, 0.32, 0.34, luzMat(COR3D.vidro, 0.2), -0.12, 0.48, 0);
    peca(trator, G3.roda, mat(0x1a1f2b), 0.2, 0.2, 0.12, -0.2, 0.2, 0.22); peca(trator, G3.roda, mat(0x1a1f2b), 0.2, 0.2, 0.12, -0.2, 0.2, -0.22);
    peca(trator, G3.roda, mat(0x1a1f2b), 0.12, 0.12, 0.1, 0.24, 0.12, 0.22); peca(trator, G3.roda, mat(0x1a1f2b), 0.12, 0.12, 0.1, 0.24, 0.12, -0.22);
    trator.position.set(3.25, 0.16, 3.55); trator.rotation.y = Math.PI / 2; g.add(trator);   // parado na beira da plantação
  },
  construcao(g, il, e) {
    // Prédio subindo: lajes, pilares e o último andar em obra
    for (let a = 0; a < 4; a++) {
      caixa(g, 2.6, 0.12, 2.0, 0xc9d1dc, -1.0, a * 0.8, 0.6);
      if (a < 3) [[-2.15, -0.25], [0.15, -0.25], [-2.15, 1.45], [0.15, 1.45]].forEach(([x, z]) => caixa(g, 0.14, 0.7, 0.14, 0xaab4c3, x, a * 0.8 + 0.12, z));
    }
    [[-2.15, -0.25], [0.15, -0.25], [-2.15, 1.45], [0.15, 1.45]].forEach(([x, z]) => caixa(g, 0.1, 0.7, 0.1, il.cores.destaque, x, 3.32, z));
    // Grua girando com a carga indo e voltando
    caixa(g, 0.26, 5.6, 0.26, 0xf0b429, 1.6, 0, -0.3);
    const lanca = new THREE.Group(); lanca.position.set(1.6, 5.6, -0.3); g.add(lanca);
    caixa(lanca, 4.6, 0.18, 0.18, 0xf0b429, -1.0, 0, 0); caixa(lanca, 0.5, 0.4, 0.4, 0x5a6577, 1.1, -0.2, 0);
    const cabo = caixa(lanca, 0.02, 1.6, 0.02, 0x333a48, -2.2, -1.6, 0); const carga = caixa(lanca, 0.4, 0.25, 0.4, il.cores.destaque, -2.2, -1.85, 0);
    il.animados.push((t) => { lanca.rotation.y = Math.sin(t * 0.25) * 1.1; const x = -1.4 - (Math.sin(t * 0.5) + 1) * 0.9; cabo.position.x = x; carga.position.x = x; });
    // Tapume com a logo e montes de areia
    caixa(g, 3.6, 1.0, 0.06, COR3D.parede, -0.8, 0, 3.0);
    placaLogo(g, il, e, 3.0, 0.72, -0.8, 0.52, 3.04);
    cone(g, 0.5, 0.45, 0xd8b98a, 2.4, 0, 1.8); cone(g, 0.35, 0.32, 0xc7a676, 2.9, 0, 2.3);
  },
  saude(g, il, e) {
    caixa(g, 4.0, 1.8, 2.3, COR3D.parede, -0.8, 0, 0.6);
    caixa(g, 4.04, 0.2, 2.34, il.cores.telhado, -0.8, 1.2, 0.6);
    caixa(g, 1.4, 0.06, 0.8, COR3D.parede2, -0.8, 0.95, 2.1);
    caixa(g, 1.0, 0.9, 0.05, luzMat(0xbcd8ff, 0.45), -0.8, 0, 1.77);
    placaLogo(g, il, e, 2.8, 0.62, -0.8, 1.55, 1.77);
    // Cruz no telhado, pulsando
    const cruzMat = new THREE.MeshStandardMaterial({ color: 0xf0523f, emissive: 0xf0523f, emissiveIntensity: 1 }); il.descartar.push(cruzMat);
    peca(g, G3.caixa, cruzMat, 0.9, 0.12, 0.3, -0.8, 2.15, 0.6); peca(g, G3.caixa, cruzMat, 0.3, 0.12, 0.9, -0.8, 2.15, 0.6);
    caixa(g, 0.3, 0.35, 0.3, COR3D.parede2, -0.8, 1.8, 0.6);
    const halo = brilho(g, 0xf0523f, 2.2, -0.8, 2.3, 0.6, 0.5);
    il.animados.push((t) => { const p = 0.6 + Math.sin(t * 2.4) * 0.4; cruzMat.emissiveIntensity = 0.5 + p; halo.material.opacity = 0.25 + p * 0.35; });
    arvore(g, 2.3, 2.6, 1); arvore(g, 2.8, 1.2, 1.1);
  },
  tecnologia(g, il, e) {
    caixa(g, 3.4, 1.2, 2.2, 0x1d2c4a, -1.0, 0, 1.0);
    for (let i = 0; i < 3; i++) caixa(g, 3.42, 0.05, 2.22, luzMat(0x38d6f5, 1.2), -1.0, 0.3 + i * 0.3, 1.0);
    placaLogo(g, il, e, 2.9, 0.58, -1.0, 0.7, 2.11);
    const janelas = texturaJanelas(5, 16, 0.6, '#8fe9ff'); il.descartar.push(janelas.tex);
    const vidro = new THREE.MeshStandardMaterial({ color: 0x2a4a7a, roughness: 0.25, metalness: 0.5, emissive: 0xffffff, emissiveMap: janelas.tex, emissiveIntensity: 0.9 }); il.descartar.push(vidro); il.matsJanela.push([vidro, 0.9]);
    peca(g, G3.caixa, vidro, 1.4, 4.2, 1.4, 1.4, 0, 0.4);
    caixa(g, 1.5, 0.14, 1.5, 0x38d6f5, 1.4, 4.2, 0.4).material = luzMat(0x38d6f5, 1);
    // Pulsos de luz subindo pela torre e antena girando
    const pulsos = [0, 1, 2].map(() => caixa(g, 1.44, 0.06, 1.44, luzMat(0x38d6f5, 2), 1.4, 0, 0.4));
    il.animados.push((t) => pulsos.forEach((p, i) => { p.position.y = ((t * 0.5 + i / 3) % 1) * 4.2; }));
    const antena = new THREE.Group(); antena.position.set(1.4, 4.34, 0.4); g.add(antena);
    cilindro(antena, 0.04, 0.5, 0xb8c2d4, 0, 0, 0);
    const prato = peca(antena, G3.bola, mat(0xe8edf4), 0.32, 0.08, 0.32, 0.15, 0.55, 0); prato.rotation.z = 0.6;
    il.animados.push((t) => { antena.rotation.y = t * 0.8; });
    // Fibras saindo do prédio
    [-0.5, 0, 0.5].forEach((dz) => caixa(g, 0.04, 0.01, 1.6, luzMat(0x38d6f5, 1.5), -1.0 + dz * 2, 0.01, 2.9));
  }
};


/* ---------- Prédios dos setores ---------- */
// Prédio do setor: o corpo tem a altura da nota; em cima, um andar verde por melhoria entregue
// (gargalo resolvido ou oportunidade entregue); no topo, a luz da saúde e os losangos.
function predioSetor(g, il, x, z, s) {
  const d = s.d; const nota = d.nota; const cor = COR_SAUDE[d.saude] || COR_SAUDE.sem;
  const grupo = new THREE.Group(); grupo.position.set(x, 0, z); g.add(grupo);
  const altura = nota == null ? 0.55 : 0.7 + nota / 100 * 2.6;
  if (nota == null) peca(grupo, G3.caixa, mat(COR3D.parede2, { transparent: true, opacity: 0.5 }), 0.8, altura, 0.8, 0, 0, 0);
  else {
    const f = fachadaDe('setor'), geo = caixaUV(0.8, altura, 0.8, f.mu, f.mv); il.descartar.push(geo);
    const corpo = new THREE.Mesh(geo, materiaisDaCaixa(CAMPO.matSetor, mat(COR3D.parede2, { roughness: 0.85 }))); corpo.castShadow = corpo.receiveShadow = true; grupo.add(corpo);
    caixa(grupo, 0.28, 0.32, 0.03, luzMat(0xbcd8ff, 0.4), 0, 0.06, 0.41).castShadow = false;   // porta de vidro
    caixa(grupo, 0.38, 0.03, 0.14, COR3D.navy, 0, 0.4, 0.46);                                // marquise
  }
  caixa(grupo, 0.94, 0.06, 0.94, 0xb4bdca, 0, 0, 0);   // embasamento
  grupo.scale.setScalar(1.45);                          // a porta olha para a frente da cidade (o portão)
  const andares = [];
  for (let i = 0; i < Math.min(s.r || 0, 6); i++) andares.push(peca(grupo, G3.caixa, CAMPO.matAndar, 0.74, 0.24, 0.74, 0, altura + i * 0.3 + 0.03, 0));
  const topoY = altura + andares.length * 0.3;
  const topo = new THREE.Group(); topo.position.y = topoY; grupo.add(topo);
  peca(topo, G3.caixa, luzMat(cor, 0.9), 0.84, 0.14, 0.84, 0, 0, 0);
  const halo = brilho(topo, cor, 1.5, 0, 0.2, 0, 0.55);
  sinais(topo, il, s.g, s.o);
  il.setores.set(s.id, { grupo, topo, andares, halo, x, z, topoY, esc: 1.45 });
}
function sinais(topo, il, gargalos, oportunidades) {
  const lista = [];
  for (let i = 0; i < Math.min(gargalos, 3); i++) lista.push(COR_SAUDE.critico);
  for (let i = 0; i < Math.min(oportunidades, 3); i++) lista.push(COR_OPORTUNIDADE);
  lista.forEach((cor, i) => {
    const s = peca(topo, G3.losango, luzMat(cor, 1.6), 0.13, 0.19, 0.13, (i % 3 - 1) * 0.28, 0.55 + Math.floor(i / 3) * 0.42, 0);
    s.castShadow = false;
    const y0 = s.position.y;
    il.animados.push((t) => { s.position.y = y0 + Math.sin(t * 2 + i) * 0.06; s.rotation.y = t * 1.5 + i; });
  });
}

/* ---------- Dados de cada ilha ---------- */
function saudeDaEmpresa(setores) {
  const presentes = new Set(setores.map((x) => x.d.saude));
  for (const k of ['critico', 'atencao', 'andamento', 'saudavel']) if (presentes.has(k)) return k;
  return 'sem';
}
function dadosDaIlha(e) {
  const ck = checkupDa(e.id);
  const aberto = (g) => situacaoDe(g) !== 'Resolvido';
  const setores = ck.setores.slice(0, 12).map(({ s, d }) => ({ id: s.id, nome: s.nome, d: { nota: d.nota, saude: d.saude }, g: gargalosDo(s.id).filter(aberto).length, o: oportunidadesDo(s.id).filter(aberto).length, r: itensDo(s.id).filter((x) => !aberto(x)).length }));
  return {
    id: e.id, nome: e.nome, segmento: e.segmento || '', cidade: e.cidade || '', logo: logoDe(e), cores: coresDaLogo(logoDe(e)), cena: cenaDoSegmento(e.segmento),
    nota: ck.nota, saude: saudeDaEmpresa(ck.setores), setores, totalSetores: ck.setores.length,
    gargalos: gargalosDa(e.id).filter(aberto).length, oportunidades: itensDa(e.id).filter((g) => ehOport(g) && aberto(g)).length,
    horas: somaHoras(itensDa(e.id)), andamento: emAndamento(itensDa(e.id)), entregues: itensDa(e.id).filter((g) => situacaoDe(g) === 'Resolvido').length,
    eixos: ck.eixos
  };
}

/* ---------- Vida nas ilhas ----------
   Tudo o que deixa a ilha "encorpada", como maquete de arquitetura:
   - chão de grama, calçadas de concreto e faixa de pedestre na chegada da ponte;
   - prédios com fachada de verdade (janelas que acendem à noite), embasamento e ar-condicionado no teto;
   - sombra suave no pé de cada coisa (é o que dá peso e tira a cara de "flutuando");
   - rocha em camadas por baixo, com raízes e cristais na cor da saúde da empresa;
   - árvores de vários tipos, arbustos, canteiros, bancos e postes que acendem com cone de luz no chão;
   - um detalhe próprio de cada segmento (heliponto, empilhadeira, tanques, cata-vento...).
   As peças repetidas são desenhadas de uma vez só (InstancedMesh) para não pesar no computador. */

// Sorteio que se repete: a mesma empresa ganha sempre as mesmas árvores, no mesmo lugar
function sorteio(semente) {
  let h = 1779033703;
  for (const ch of String(semente)) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}

// Texturas desenhadas na hora, guardadas para todas as ilhas usarem
function telaDe(w, h, desenhar) { const c = document.createElement('canvas'); c.width = w; c.height = h; desenhar(c.getContext('2d'), w, h); return c; }
function texturaRepetida(canvas, cor) {
  const t = new THREE.CanvasTexture(canvas); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (cor !== false) t.encoding = THREE.sRGBEncoding;
  t.anisotropy = CAMPO.renderer ? Math.min(8, CAMPO.renderer.capabilities.getMaxAnisotropy()) : 4;
  return t;
}
function pontilhar(g, w, h, qtd, cores, tam, sorte) {
  for (let i = 0; i < qtd; i++) { g.fillStyle = cores[Math.floor(sorte() * cores.length)]; const s = tam * (0.5 + sorte()); g.fillRect(sorte() * w, sorte() * h, s, s); }
}
function materiaisDaVida() {
  if (CAMPO.vida) return CAMPO.vida;
  const T = THREE, sorte = sorteio('vida');
  const V = {};
  // Grama: verde de maquete com pontinhos claros e escuros
  const grama = texturaRepetida(telaDe(256, 256, (g, w, h) => { g.fillStyle = '#5f7f45'; g.fillRect(0, 0, w, h); pontilhar(g, w, h, 3200, ['#55743d', '#6b8a4f', '#4c6a36', '#748f55'], 2.2, sorte); }));
  grama.repeat.set(5, 5);
  V.grama = pisoNoturno(new T.MeshStandardMaterial({ map: grama, roughness: 0.95 }));
  // Concreto da calçada, com juntas
  const concreto = texturaRepetida(telaDe(128, 128, (g, w, h) => {
    g.fillStyle = '#d9dce1'; g.fillRect(0, 0, w, h); pontilhar(g, w, h, 600, ['#cfd3d9', '#e3e6ea'], 1.6, sorte);
    g.fillStyle = '#bfc5ce'; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h); g.fillRect(0, 63, w, 1); g.fillRect(63, 0, 1, h);
  }));
  concreto.repeat.set(14, 14);
  V.calcada = pisoNoturno(new T.MeshStandardMaterial({ map: concreto, roughness: 0.9 }));
  V.meioFio = mat(0xc9ced6, { roughness: 0.85 });
  // Sombra de contato: um retângulo bem borrado, escuro no meio
  const sombra = new T.CanvasTexture(telaDe(128, 128, (g) => {
    g.shadowColor = 'rgba(0,0,0,1)'; g.shadowBlur = 22; g.shadowOffsetX = 1000; g.fillStyle = '#000';
    g.fillRect(36 - 1000, 36, 56, 56);
  }));
  V.sombra = new T.MeshBasicMaterial({ color: 0x0b1a33, map: sombra, transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  V.placaChao = new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  V.invisivel = new T.MeshBasicMaterial({ visible: false });
  // Heliponto: círculo escuro, anel e o H
  V.heliponto = new T.CanvasTexture(telaDe(256, 256, (g) => {
    g.fillStyle = '#2b3446'; g.beginPath(); g.arc(128, 128, 126, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#f2f4f8'; g.lineWidth = 10; g.beginPath(); g.arc(128, 128, 100, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#f2f4f8'; g.fillRect(84, 70, 22, 116); g.fillRect(150, 70, 22, 116); g.fillRect(84, 117, 88, 22);
  }));
  V.heliponto.encoding = T.sRGBEncoding;
  CAMPO.vida = V;
  return V;
}

/* Fachadas: um "módulo" de janela que se repete em metros (não estica com o tamanho do prédio).
   Cada estilo tem a cor (map) e a luz das janelas à noite (emissiveMap). mu e mv = tamanho do módulo. */
const ESTILOS_FACHADA = {
  // Galpão: chapa com nervuras, rodapé escuro e uma faixa de janelas no alto
  galpao: { w: 128, h: 256, mu: 1.0, mv: 2.0, desenhar(g, luz, w, h) {
    g.fillStyle = '#efebe4'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e2ddd5'; for (let x = 0; x < w; x += 8) g.fillRect(x, 0, 2, h);
    g.fillStyle = '#aeb6c2'; g.fillRect(0, h - 22, w, 22);
    const y0 = h * 0.3, y1 = h * 0.4;
    g.fillStyle = '#34445c'; g.fillRect(8, y0 - 3, w - 16, y1 - y0 + 6);
    g.fillStyle = '#6f8fb8'; g.fillRect(11, y0, w - 22, y1 - y0);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(11, y0, w - 22, 4);
    g.fillStyle = '#34445c'; for (let x = 11; x < w - 11; x += 27) g.fillRect(x, y0, 3, y1 - y0);
    luz.fillStyle = '#ffd59a'; luz.fillRect(11, y0, w - 22, y1 - y0);
  } },
  // Comercial (clínica, loja): faixa de janela larga em cada andar
  comercial: { w: 128, h: 96, mu: 0.8, mv: 0.6, desenhar(g, luz, w, h) {
    g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e4dfd6'; g.fillRect(0, h - 8, w, 8);
    g.fillStyle = '#2e3d55'; g.fillRect(6, 18, w - 12, 50);
    const gr = g.createLinearGradient(0, 21, 0, 65); gr.addColorStop(0, '#a9c6ea'); gr.addColorStop(1, '#6a8fbf');
    g.fillStyle = gr; g.fillRect(9, 21, w - 18, 44);
    g.fillStyle = '#2e3d55'; g.fillRect(w / 2 - 2, 21, 4, 44);
    g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.moveTo(14, 64); g.lineTo(40, 21); g.lineTo(52, 21); g.lineTo(26, 64); g.fill();
    luz.fillStyle = '#ffe1ad'; luz.fillRect(9, 21, w - 18, 44);
  } },
  // Prédio do setor: janelinhas em grade, algumas acesas à noite (3 colunas x 4 andares no módulo)
  setor: { w: 192, h: 256, mu: 0.8, mv: 1.2, desenhar(g, luz, w, h, sorte) {
    g.fillStyle = '#e8ecf1'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) {
      const x = i * 64, y = j * 64;
      g.fillStyle = '#d8dee7'; g.fillRect(x, y + 58, 64, 6);
      g.fillStyle = '#3a4a63'; g.fillRect(x + 12, y + 12, 40, 36);
      g.fillStyle = '#8aa6cc'; g.fillRect(x + 15, y + 15, 34, 30);
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + 15, y + 15, 34, 5);
      const r = sorte(); luz.fillStyle = r < 0.55 ? '#ffe2b0' : r < 0.75 ? '#cfe3ff' : '#000'; luz.fillRect(x + 15, y + 15, 34, 30);
    }
  } }
};
function fachadaDe(estilo) {
  CAMPO.fachadas = CAMPO.fachadas || {};
  if (CAMPO.fachadas[estilo]) return CAMPO.fachadas[estilo];
  const E = ESTILOS_FACHADA[estilo], sorte = sorteio(estilo);
  const cLuz = document.createElement('canvas'); cLuz.width = E.w; cLuz.height = E.h;
  const gLuz = cLuz.getContext('2d'); gLuz.fillStyle = '#000'; gLuz.fillRect(0, 0, E.w, E.h);
  const cor = telaDe(E.w, E.h, (g, w, h) => E.desenhar(g, gLuz, w, h, sorte));
  const map = texturaRepetida(cor), emissiveMap = texturaRepetida(cLuz);
  const material = new THREE.MeshStandardMaterial({ map, emissive: 0xffffff, emissiveMap, emissiveIntensity: 0.6, roughness: 0.6, metalness: 0.05 });
  CAMPO.fachadas[estilo] = { mat: material, mu: E.mu, mv: E.mv };
  return CAMPO.fachadas[estilo];
}
// Caixa com a textura em metros: o módulo da janela não estica (a base fica em y = 0)
function caixaUV(w, h, d, mu, mv) {
  const geo = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
  const uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];   // faces: +x, -x, +y, -y, +z, -z
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, (uv.getX(i) - 0.5) * dims[f][0] / mu + 0.5, uv.getY(i) * dims[f][1] / mv); }
  return geo;
}
const materiaisDaCaixa = (fachada, teto) => [fachada, fachada, teto, teto, fachada, fachada];

// Lote: junta as peças iguais (mesma forma e mesmo material) para desenhar todas de uma vez
function novoLote() {
  const grupos = new Map();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  return {
    add(geo, material, x, y, z, sx, sy, sz, rx, ry, rz, sombra) {
      const chave = geo.uuid + '|' + material.uuid;
      if (!grupos.has(chave)) grupos.set(chave, { geo, material, ms: [], sombra: sombra !== false });
      e.set(rx || 0, ry || 0, rz || 0); q.setFromEuler(e); m4.compose(v.set(x, y, z), q, s.set(sx, sy, sz));
      grupos.get(chave).ms.push(m4.clone());
    },
    // Peça de um objeto girado em volta do próprio centro (cx, cz)
    girado(geo, material, cx, cz, giro, ox, y, oz, sx, sy, sz, sombra) {
      const c = Math.cos(giro), sn = Math.sin(giro);
      this.add(geo, material, cx + ox * c + oz * sn, y, cz - ox * sn + oz * c, sx, sy, sz, 0, giro, 0, sombra);
    },
    montar(pai, lista) {
      grupos.forEach(({ geo, material, ms, sombra }) => {
        const im = new THREE.InstancedMesh(geo, material, ms.length);
        ms.forEach((m, i) => im.setMatrixAt(i, m)); im.instanceMatrix.needsUpdate = true; variarCorDasCopas(im);
        im.castShadow = sombra; im.receiveShadow = true; im.frustumCulled = false;
        pai.add(im); lista.push(im);
      });
    }
  };
}

// Ar-condicionado no teto
function arCondicionado(lote, x, y, z, giro) {
  lote.girado(G3.caixa, mat(0xc9d0da, { roughness: 0.6 }), x, z, giro || 0, 0, y, 0, 0.34, 0.2, 0.26);
  lote.girado(G3.cil, mat(0x3a4458), x, z, giro || 0, 0, y + 0.2, 0, 0.09, 0.015, 0.09, false);
}
function ambulancia() {
  const amb = new THREE.Group();
  caixa(amb, 1.1, 0.55, 0.5, 0xffffff, -0.1, 0.12, 0); caixa(amb, 1.11, 0.1, 0.51, 0xf0523f, -0.1, 0.4, 0);
  caixa(amb, 0.35, 0.42, 0.48, 0xffffff, 0.62, 0.12, 0);
  caixa(amb, 0.05, 0.18, 0.4, luzMat(COR3D.vidro, 0.5), 0.8, 0.36, 0);
  [[-0.45, 0.26], [-0.45, -0.26], [0.5, 0.26], [0.5, -0.26]].forEach(([x, z]) => peca(amb, G3.roda, mat(0x1a1f2b), 0.13, 0.13, 0.08, x, 0.13, z));
  return amb;
}

/* Acabamento dos prédios da cena: troca as caixas brancas grandes por fachada com janelas,
   põe embasamento de concreto e, nos tetos planos, platibanda e ar-condicionado. */
const ESTILO_DA_CENA = { distribuicao: 'galpao', industria: 'galpao', varejo: 'comercial', saude: 'comercial' };
const TETO_PLANO = { varejo: true, saude: true };
function revestirCena(il, D) {
  const estilo = ESTILO_DA_CENA[D.cena]; if (!estilo) return;
  const f = fachadaDe(estilo), parede = mat(COR3D.parede), teto = mat(COR3D.parede2, { roughness: 0.85 });
  il.matsJanela.push([f.mat, 0.6]);
  const lote = novoLote();
  [...il.grupoSegmento.children].forEach((m) => {
    if (!m.isMesh || m.geometry !== G3.caixa || m.material !== parede) return;
    const s = m.scale.clone(); if (s.y < 0.9 || s.x < 1 || s.z < 1 || m.position.y > 0.05) return;
    m.geometry = caixaUV(s.x, s.y, s.z, f.mu, f.mv); il.descartar.push(m.geometry);
    m.material = m.userData.semTeto ? [f.mat, f.mat, CAMPO.vida.invisivel, teto, f.mat, f.mat] : materiaisDaCaixa(f.mat, teto); m.scale.set(1, 1, 1);
    const { x, z } = m.position;
    // Embasamento: calçada em volta do prédio
    lote.add(G3.caixa, CAMPO.vida.calcada, x, 0, z, s.x + 0.5, 0.035, s.z + 0.5, 0, 0, 0, false);
    if (TETO_PLANO[D.cena]) {
      const borda = mat(0xdcd6cc, { roughness: 0.8 });
      lote.add(G3.caixa, borda, x, s.y, z + s.z / 2 - 0.03, s.x, 0.1, 0.06); lote.add(G3.caixa, borda, x, s.y, z - s.z / 2 + 0.03, s.x, 0.1, 0.06);
      lote.add(G3.caixa, borda, x + s.x / 2 - 0.03, s.y, z, 0.06, 0.1, s.z); lote.add(G3.caixa, borda, x - s.x / 2 + 0.03, s.y, z, 0.06, 0.1, s.z);
      arCondicionado(lote, x - s.x / 2 + 0.45, s.y, z - s.z / 2 + 0.4); arCondicionado(lote, x + s.x / 2 - 0.45, s.y, z - s.z / 2 + 0.4);
    }
  });
  lote.montar(il.grupoSegmento, il.descartar);
}

/* Detalhe de cada segmento (vem depois da cena). */
const EXTRAS_DO_SEGMENTO = {
  saude(g, il) {
    // Ala nova com heliponto no teto e luzes piscando nos cantos
    const f = fachadaDe('comercial');
    const ala = new THREE.Mesh(caixaUV(1.5, 2.6, 1.5, f.mu, f.mv), materiaisDaCaixa(f.mat, mat(COR3D.parede2, { roughness: 0.85 })));
    ala.position.set(1.9, 0, -0.4); ala.castShadow = ala.receiveShadow = true; g.add(ala); il.descartar.push(ala.geometry);
    caixa(g, 1.58, 0.08, 1.58, il.cores.telhado, 1.9, 2.6, -0.4);
    caixa(g, 1.9, 0.035, 1.9, CAMPO.vida.calcada, 1.9, 0, -0.4).castShadow = false;
    const mHeli = new THREE.MeshStandardMaterial({ map: CAMPO.vida.heliponto, roughness: 0.8 }); il.descartar.push(mHeli);
    const heli = new THREE.Mesh(new THREE.CircleGeometry(0.64, 40), mHeli); heli.rotation.x = -Math.PI / 2; heli.position.set(1.9, 2.69, -0.4); heli.receiveShadow = true; g.add(heli); il.descartar.push(heli.geometry);
    const luzes = [[-0.66, -0.66], [0.66, -0.66], [-0.66, 0.66], [0.66, 0.66]].map(([dx, dz]) => { caixa(g, 0.06, 0.06, 0.06, luzMat(0x7ff0b3, 1.4), 1.9 + dx, 2.68, -0.4 + dz); return brilho(g, 0x7ff0b3, 0.45, 1.9 + dx, 2.78, -0.4 + dz, 0.8); });
    il.animados.push((t) => luzes.forEach((s, i) => { s.material.opacity = Math.sin(t * 3 - i * 0.8) > 0.2 ? 0.9 : 0.15; }));
    // Ambulância parada na entrada
    const amb = ambulancia(); amb.position.set(0.8, 0.02, 3.35); amb.rotation.y = Math.PI; g.add(amb);
  },
  distribuicao(g, il) {
    // Empilhadeira parada ao lado da doca, com um palete
    const emp = new THREE.Group(); emp.position.set(2.75, 0.02, 3.6); emp.rotation.y = Math.PI; g.add(emp);
    caixa(emp, 0.42, 0.24, 0.3, il.cores.destaque, 0, 0.08, 0); caixa(emp, 0.2, 0.22, 0.26, 0x2b3446, -0.08, 0.32, 0);
    caixa(emp, 0.03, 0.6, 0.03, 0x2b3446, 0.23, 0.05, 0.09); caixa(emp, 0.03, 0.6, 0.03, 0x2b3446, 0.23, 0.05, -0.09);
    caixa(emp, 0.24, 0.02, 0.05, 0x8a96a8, 0.36, 0.12, 0.07); caixa(emp, 0.24, 0.02, 0.05, 0x8a96a8, 0.36, 0.12, -0.07);
    caixa(emp, 0.24, 0.2, 0.22, COR3D.papelao, 0.36, 0.14, 0);
    [[-0.13, 0.16], [-0.13, -0.16], [0.13, 0.16], [0.13, -0.16]].forEach(([x, z]) => peca(emp, G3.roda, mat(0x1a1f2b), 0.07, 0.07, 0.05, x, 0.07, z));
  },
  industria(g, il, D) {
    // Tanques com cano até a fábrica
    [[-3.75, 0.25], [-3.75, 1.25]].forEach(([x, z]) => {
      cilindro(g, 0.38, 1.1, 0xd5dce6, x, 0, z); peca(g, G3.bola, mat(0xc9d1dc), 0.38, 0.2, 0.38, x, 1.1, z);
      cilindro(g, 0.39, 0.08, il.cores.destaque, x, 0.72, z);
      caixa(g, 0.5, 0.06, 0.06, 0x8a96a8, x + 0.55, 0.95, z);
    });
    caixa(g, 0.06, 0.06, 1.0, 0x8a96a8, -3.2, 0.95, 0.75);
  },
  varejo(g, il) {
    const lote = novoLote();
    arCondicionado(lote, -2.2, 1.5, -0.3); arCondicionado(lote, -1.4, 1.5, -0.3); arCondicionado(lote, 0.9, 1.5, -0.3);
    lote.montar(g, il.descartar);
  },
  servicos(g, il) {
    const lote = novoLote();
    arCondicionado(lote, 0.45, 2.56, 0.65); arCondicionado(lote, 1.1, 2.56, 1.35); arCondicionado(lote, -1.8, 4.6, 1.0);
    lote.montar(g, il.descartar);
  },
  agro(g, il) {
    // Cata-vento girando
    const x = 3.35, z = 2.05;
    cilindro(g, 0.06, 2.6, 0xf2f4f8, x, 0, z); caixa(g, 0.16, 0.16, 0.3, 0xe2e7ee, x, 2.55, z);
    const rotor = new THREE.Group(); rotor.position.set(x, 2.63, z + 0.18); g.add(rotor);
    [0, 1, 2].forEach((k) => { const p = new THREE.Group(); p.rotation.z = k * Math.PI * 2 / 3; rotor.add(p); caixa(p, 0.08, 0.85, 0.02, 0xf2f4f8, 0, 0, 0); });
    peca(rotor, G3.bola, mat(il.cores.destaque), 0.07, 0.07, 0.07, 0, 0, 0.02);
    il.animados.push((t) => { rotor.rotation.z = -t * 1.4; });
  },
  construcao(g, il) {
    const lote = novoLote();
    [-2.4, -1.6, -0.8, 0.0, 0.8].forEach((x) => { lote.add(G3.cone, mat(0xff7a1a), x, 0, 3.35, 0.07, 0.22, 0.07); lote.add(G3.caixa, mat(0xf2f4f8), x, 0.09, 3.35, 0.09, 0.04, 0.09, 0, 0, 0, false); });
    lote.montar(g, il.descartar);
  },
  tecnologia(g, il) {
    // Placas solares e ar-condicionado no teto do prédio baixo
    const lote = novoLote(), painel = mat(0x1f3f78, { roughness: 0.25, metalness: 0.6 });
    [-2.25, -1.35, -0.45].forEach((x) => { lote.add(G3.caixa, painel, x, 1.32, 0.45, 0.8, 0.03, 0.5, -0.45, 0, 0); lote.add(G3.caixa, mat(0x8a96a8), x, 1.2, 0.55, 0.05, 0.14, 0.05); });
    arCondicionado(lote, -2.3, 1.2, 1.7); arCondicionado(lote, -1.6, 1.2, 1.7);
    lote.montar(g, il.descartar);
  }
};

// Caixas ocupadas pela cena (no chão da ilha), para não plantar nada em cima
function areasOcupadas(il) {
  il.grupo.updateMatrixWorld(true);
  const caixaTmp = new THREE.Box3(), lista = [];
  // Peças da cidade e as da cena do segmento (que fica num grupo próprio, maior)
  il.grupoCena.children.filter((o) => o !== il.grupoSegmento).concat(il.grupoSegmento ? il.grupoSegmento.children : []).forEach((o) => {
    if (o.userData.move || o.isSprite || o.isInstancedMesh) return;
    caixaTmp.setFromObject(o); if (caixaTmp.isEmpty() || caixaTmp.min.y > 0.12) return;
    const w = caixaTmp.max.x - caixaTmp.min.x, d = caixaTmp.max.z - caixaTmp.min.z;
    if (w > 9 || d > 9) return;   // anéis do chão
    lista.push({ x0: caixaTmp.min.x, x1: caixaTmp.max.x, z0: caixaTmp.min.z, z1: caixaTmp.max.z, sombra: w > 0.25 && d > 0.25 && o.userData.semSombra !== true });
  });
  return lista;
}
// Sombra de contato no pé de tudo o que está parado no chão
function sombrasDeContato(il) {
  const lote = novoLote();
  il.ocupado.filter((b) => b.sombra).forEach((b) => {
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    lote.add(CAMPO.vida.placaChao, CAMPO.vida.sombra, (b.x0 + b.x1) / 2, 0.04, (b.z0 + b.z1) / 2, w * 1.55 + 0.35, 1, d * 1.55 + 0.35, 0, 0, 0, false);
  });
  lote.montar(il.grupoCena, il.descartar);
}

/* ---------- Mini cidade de cada empresa ----------
   Uma quadra grande (26 x 20), só da empresa (quem é de fora não entra; os consultores da Real Forte entram).
   O que é igual em todas: cerca, portão com a logo, guarita, quadro de gestão à vista, copa e os prédios
   dos setores no fundo (altura = nota, topo = saúde, andar verde = melhoria).
   O que dá a cara do segmento (para reconhecer de longe): a cena do segmento bem maior no meio e um
   "kit" do segmento nos pátios dos lados e nos cantos do fundo — coisas grandes e altas (carretas e
   contêineres na distribuição; chaminés, tanques e ponte rolante na indústria; silos e pivô no agro;
   gruas na construção; torres no escritório; pronto-socorro na saúde; totem e estacionamento no varejo;
   torre de antenas e data center na tecnologia). Os veículos ficam parados, como cenário.
   Áreas da quadra (no sistema dela; o portão fica no z = +10):
   - meio: a cena do segmento (x de -5,5 a 5,5; z de -3 a 5,4);
   - pátio da esquerda e da direita: x de 7 a 11,2 (dos dois lados), z de -3,8 a 9,2;
   - cantos do fundo: x de 6,6 a 11,2 (dos dois lados), z de -8,7 a -4,6;
   - fundo no meio: os prédios dos setores. */
const CID_X = 13, CID_Z = 10, PORTAO = 1.7;
const ESC_CENA = 1.5, CENA_Z = -1.0;   // a cena do segmento fica 50% maior e no meio da quadra
const daCena = (x, z) => [x * ESC_CENA, CENA_Z + z * ESC_CENA];   // ponto da cena -> ponto da quadra
function lugaresNaCidade(n) {
  const lista = [], porFila = 6;
  for (let i = 0; i < n; i++) { const fila = Math.floor(i / porFila), naFila = Math.min(porFila, n - fila * porFila), k = i % porFila; lista.push([(k - (naFila - 1) / 2) * 2.1, -5.6 - fila * 2.7]); }
  return lista;
}
// Formas a mais que só a cidade usa
function formasDaCidade() {
  if (G3.cilDeitado) return;
  G3.cilDeitado = new THREE.CylinderGeometry(1, 1, 1, 18).rotateZ(Math.PI / 2);   // cilindro deitado, eixo no x, centrado
  G3.cupula = new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  G3.torreResf = new THREE.LatheGeometry([[1, 0], [0.86, 0.3], [0.7, 0.62], [0.68, 0.8], [0.74, 1]].map(([r, y]) => new THREE.Vector2(r, y)), 32);
}
// Peça de um objeto girado: deslocamento (ox, y, oz) no sistema do objeto; "incl" inclina no eixo z do objeto
function pecaGirada(K, geo, m, cx, cz, giro, ox, y, oz, sx, sy, sz, incl, sombra) {
  const c = Math.cos(giro), s = Math.sin(giro);
  K.add(geo, m, cx + ox * c + oz * s, y, cz - ox * s + oz * c, sx, sy, sz, 0, giro, incl || 0, sombra);
}
/* Veículos parados (montados em lote: pesam pouco). A frente do veículo é o +x dele.
   giro: 0 = olha para +x; Math.PI/2 = olha para -z; -Math.PI/2 = olha para +z. */
function veiculo(K, tipo, cx, cz, giro, esc, c1, c2, y0) {
  const e = esc || 1, base = y0 || 0;
  const P = (geo, m, ox, y, oz, sx, sy, sz, incl) => pecaGirada(K, geo, typeof m === 'number' ? mat(m) : m, cx, cz, giro, ox * e, base + y * e, oz * e, sx * e, sy * e, sz * e, incl);
  const R = (x, z, r, l) => P(G3.roda, 0x1a1f2b, x, r, z, r, r, l || 0.1);
  const vidro = luzMat(COR3D.vidro, 0.35), branco = COR3D.parede, escuro = 0x2b3446;
  const cabine = () => { P(G3.caixa, c1, 0.82, 0.2, 0, 0.62, 0.62, 0.56); P(G3.caixa, c1, 0.74, 0.82, 0, 0.42, 0.14, 0.52); P(G3.caixa, vidro, 1.14, 0.52, 0, 0.04, 0.22, 0.48); P(G3.caixa, escuro, 0, 0.1, 0, 3.4, 0.12, 0.44); [-1.85, -1.5, 0.45, 0.95].forEach((x) => [0.29, -0.29].forEach((z) => R(x, z, 0.16))); };
  const tipos = {
    caminhao() { P(G3.caixa, branco, -0.22, 0.2, 0, 1.3, 0.62, 0.52); P(G3.caixa, c2, -0.22, 0.56, 0, 1.31, 0.09, 0.53); P(G3.caixa, c1, 0.68, 0.2, 0, 0.44, 0.52, 0.5); P(G3.caixa, vidro, 0.91, 0.47, 0, 0.05, 0.18, 0.42); P(G3.caixa, escuro, 0.05, 0.08, 0, 1.75, 0.12, 0.42); [-0.6, 0.1, 0.7].forEach((x) => [0.27, -0.27].forEach((z) => R(x, z, 0.15))); },
    carreta() { P(G3.caixa, branco, -0.78, 0.26, 0, 2.5, 0.72, 0.58); P(G3.caixa, c2, -0.78, 0.62, 0, 2.52, 0.14, 0.6); cabine(); },
    prancha() { P(G3.caixa, escuro, -0.78, 0.26, 0, 2.5, 0.1, 0.62); [-1.6, -0.85, -0.1].forEach((x) => P(G3.roda, 0x9aa6b8, x, 0.62, 0, 0.26, 0.26, 0.46)); cabine(); },
    graneleiro() { P(G3.caixa, c2, -0.78, 0.26, 0, 2.5, 0.56, 0.6); P(G3.caixa, 0xd9b96a, -0.78, 0.8, 0, 2.4, 0.05, 0.52); cabine(); },
    carro() { P(G3.caixa, c1, 0, 0.1, 0, 0.9, 0.24, 0.44); P(G3.caixa, vidro, -0.05, 0.34, 0, 0.48, 0.2, 0.4); [[-0.3, 0.22], [-0.3, -0.22], [0.3, 0.22], [0.3, -0.22]].forEach(([x, z]) => R(x, z, 0.11, 0.08)); },
    van() { P(G3.caixa, c1, -0.05, 0.12, 0, 1.15, 0.55, 0.5); P(G3.caixa, c2, -0.05, 0.42, 0, 1.16, 0.06, 0.51); P(G3.caixa, vidro, 0.53, 0.44, 0, 0.04, 0.18, 0.44); [[-0.38, 0.24], [-0.38, -0.24], [0.36, 0.24], [0.36, -0.24]].forEach(([x, z]) => R(x, z, 0.12, 0.08)); },
    ambulancia() { P(G3.caixa, 0xffffff, -0.1, 0.12, 0, 1.1, 0.55, 0.5); P(G3.caixa, 0xf0523f, -0.1, 0.4, 0, 1.11, 0.1, 0.51); P(G3.caixa, 0xffffff, 0.62, 0.12, 0, 0.35, 0.42, 0.48); P(G3.caixa, vidro, 0.8, 0.36, 0, 0.05, 0.18, 0.4); P(G3.caixa, luzMat(0xf0523f, 1.5), 0.45, 0.67, 0.1, 0.1, 0.05, 0.14); P(G3.caixa, luzMat(0x4d8ff0, 1.5), 0.45, 0.67, -0.1, 0.1, 0.05, 0.14); [[-0.45, 0.26], [-0.45, -0.26], [0.5, 0.26], [0.5, -0.26]].forEach(([x, z]) => R(x, z, 0.13, 0.08)); },
    trator() { P(G3.caixa, c1, 0.05, 0.16, 0, 0.62, 0.3, 0.36); P(G3.caixa, vidro, -0.12, 0.46, 0, 0.3, 0.32, 0.34); P(G3.caixa, c1, -0.12, 0.78, 0, 0.36, 0.04, 0.4); R(-0.2, 0.24, 0.23, 0.13); R(-0.2, -0.24, 0.23, 0.13); R(0.26, 0.22, 0.13, 0.1); R(0.26, -0.22, 0.13, 0.1); },
    colheitadeira() { P(G3.caixa, c1, -0.1, 0.32, 0, 1.4, 0.72, 0.85); P(G3.caixa, c1, -0.35, 1.04, 0, 0.8, 0.28, 0.7); P(G3.caixa, vidro, 0.42, 1.04, 0, 0.42, 0.42, 0.6); P(G3.caixa, c1, 0.42, 1.46, 0, 0.46, 0.05, 0.64); P(G3.caixa, c2, 0.98, 0.1, 0, 0.42, 0.3, 1.9); P(G3.roda, c2, 1.12, 0.42, 0, 0.15, 0.15, 1.8); P(G3.roda, c1, -0.35, 1.25, 0.75, 0.06, 0.06, 0.8); R(0.35, 0.47, 0.32, 0.18); R(0.35, -0.47, 0.32, 0.18); R(-0.6, 0.42, 0.2, 0.14); R(-0.6, -0.42, 0.2, 0.14); },
    betoneira() { P(G3.caixa, c1, 0.72, 0.2, 0, 0.45, 0.55, 0.52); P(G3.caixa, vidro, 0.96, 0.48, 0, 0.04, 0.2, 0.44); P(G3.caixa, escuro, 0, 0.08, 0, 1.9, 0.14, 0.44); P(G3.cilDeitado, 0xe2e7ee, -0.28, 0.62, 0, 1.2, 0.33, 0.33, 0.22); P(G3.cilDeitado, c2, -0.28, 0.62, 0, 0.16, 0.34, 0.34, 0.22); [-0.65, -0.25, 0.7].forEach((x) => [0.25, -0.25].forEach((z) => R(x, z, 0.15))); },
    escavadeira() { [0.3, -0.3].forEach((z) => P(G3.caixa, escuro, 0, 0, z, 1.15, 0.26, 0.26)); P(G3.caixa, c1, -0.1, 0.26, 0, 0.95, 0.42, 0.72); P(G3.caixa, vidro, 0.18, 0.68, 0.2, 0.36, 0.38, 0.3); P(G3.caixa, c1, -0.45, 0.68, -0.1, 0.4, 0.2, 0.5); P(G3.caixaC, c1, 0.78, 0.98, -0.12, 1.0, 0.14, 0.14, 0.6); P(G3.caixaC, c1, 1.3, 0.78, -0.12, 0.8, 0.12, 0.12, -1.0); P(G3.caixaC, 0x3a3f4a, 1.52, 0.3, -0.12, 0.28, 0.26, 0.34); },
    empilhadeira() { P(G3.caixa, c1, 0, 0.08, 0, 0.42, 0.24, 0.3); P(G3.caixa, escuro, -0.08, 0.32, 0, 0.2, 0.22, 0.26); [0.09, -0.09].forEach((z) => P(G3.caixa, escuro, 0.23, 0.05, z, 0.03, 0.6, 0.03)); [0.07, -0.07].forEach((z) => P(G3.caixa, 0x8a96a8, 0.36, 0.12, z, 0.24, 0.02, 0.05)); P(G3.caixa, COR3D.papelao, 0.36, 0.14, 0, 0.24, 0.2, 0.22); [[-0.13, 0.16], [-0.13, -0.16], [0.13, 0.16], [0.13, -0.16]].forEach(([x, z]) => R(x, z, 0.07, 0.05)); },
    helicoptero() { P(G3.bola, c1, 0, 0.42, 0, 0.55, 0.3, 0.3); P(G3.bola, vidro, 0.3, 0.46, 0, 0.24, 0.2, 0.22); P(G3.caixaC, c1, -0.78, 0.5, 0, 1.0, 0.08, 0.08); P(G3.caixa, c2, -1.25, 0.46, 0, 0.14, 0.3, 0.03); [0.22, -0.22].forEach((z) => P(G3.caixaC, escuro, 0.05, 0.06, z, 0.85, 0.03, 0.04)); P(G3.cil, escuro, 0, 0.7, 0, 0.04, 0.12, 0.04); P(G3.caixaC, escuro, 0, 0.84, 0, 2.0, 0.02, 0.08); P(G3.caixaC, escuro, 0, 0.84, 0, 0.08, 0.02, 2.0); P(G3.caixa, c2, 0, 0.38, 0, 0.56, 0.06, 0.31); }
  };
  (tipos[tipo] || tipos.carro)();
}
// Ajudantes para montar o kit de cada segmento (tudo em lote, no sistema da quadra)
function ajudantesDoKit(il, D, g, K, P) {
  const c = il.cores, V = CAMPO.vida;
  const m = (cor, op) => (typeof cor === 'number' ? mat(cor, op) : cor);
  const H = {
    il, D, g, K, c,
    bx: (cor, x, y, z, w, h, d, giro, sombra) => K.add(G3.caixa, m(cor), x, y, z, w, h, d, 0, giro || 0, 0, sombra),
    cil: (cor, x, y, z, r, h, sombra) => K.add(G3.cil, m(cor), x, y, z, r, h, r, 0, 0, 0, sombra),
    cone: (cor, x, y, z, r, h) => K.add(G3.cone, m(cor), x, y, z, r, h, r),
    bola: (cor, x, y, z, sx, sy, sz) => K.add(G3.bola, m(cor), x, y, z, sx, sy, sz),
    deitado: (cor, x, y, z, comp, r, giro) => K.add(G3.cilDeitado, m(cor), x, y, z, comp, r, r, 0, giro || 0, 0),
    // Peça reta de a = [x, y, z] até b (vigas, esteiras, braços)
    viga: (cor, a, b, larg, alt) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], hz = Math.hypot(dx, dz), L = Math.hypot(hz, dy);
      K.add(G3.caixaC, m(cor), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, L, alt || larg, larg, 0, Math.atan2(-dz, dx), Math.atan2(dy, hz));
    },
    // Chão do pátio (asfalto, terra, concreto...) e pintura no chão: dá para pisar
    chao: (cor, x0, x1, z0, z1) => K.add(G3.caixa, typeof cor === 'number' ? mat(cor, { roughness: 0.92 }) : cor, (x0 + x1) / 2, 0.004, (z0 + z1) / 2, x1 - x0, 0.02, z1 - z0, 0, 0, 0, false),
    pintura: (cor, x, z, w, d, giro) => K.add(G3.caixa, m(cor), x, 0.026, z, w, 0.01, d, 0, giro || 0, 0, false),
    veiculo: (tipo, x, z, giro, esc, c1, c2, y0) => veiculo(K, tipo, x, z, giro, esc, c1 == null ? c.destaque : c1, c2 == null ? c.telhado : c2, y0),
    // Postos de trabalho: p no sistema da quadra; pc no sistema da cena do segmento (antes de crescer)
    p: (x, z, rot, anim, extra) => P.push(ponto(x, z, rot, anim, extra)),
    pc: (x, z, rot, anim, extra) => { const [a, b] = daCena(x, z); P.push(ponto(a, b, rot, anim, extra)); },
    porta: (x, z) => il.portasLocais.push(ponto(x, z, Math.PI / 2, 'olhar')),
    anima: (f) => il.animados.push(f),
    // Poste com luz que acende à noite (e o cone de luz no chão)
    poste: (x, z, h) => {
      const a = h || 2.2;
      K.add(G3.cil, mat(0x2b3a57, { roughness: 0.5, metalness: 0.4 }), x, 0, z, 0.05, a, 0.05);
      K.add(G3.caixa, luzMat(0xffe3b0, 1.3), x, a, z, 0.36, 0.06, 0.14, 0, 0, 0, false);
      il.postes.push(brilho(g, 0xffd28a, 1.4, x, a, z, 0));
      const poca = new THREE.Mesh(V.placaChao, il.matPocaLuz); poca.scale.set(3, 1, 3); poca.position.set(x, 0.05, z); poca.visible = false; g.add(poca); il.pocasLuz.push(poca);
    },
    // Fumaça saindo (chaminé, torre de resfriamento)
    fumaca: (x, y, z, esc, cor) => {
      const bolas = [0, 1, 2, 3, 4].map(() => { const mm = new THREE.MeshStandardMaterial({ color: cor || 0xe7ecf3, transparent: true, opacity: 0.6, roughness: 1, depthWrite: false }); il.descartar.push(mm); const b = new THREE.Mesh(G3.bola, mm); b.userData.move = true; g.add(b); return b; });
      const f = Math.random();
      il.animados.push((t) => bolas.forEach((b, i) => { const p = (t * 0.16 + i / 5 + f) % 1; b.position.set(x + p * 1.1 * esc, y + p * 2.8 * esc, z - p * 0.4 * esc); const s = (0.25 + p * 0.65) * esc; b.scale.set(s, s, s); b.material.opacity = 0.6 * (1 - p); }));
    },
    // Luz que pisca (no alto das torres, nas ambulâncias)
    piscar: (x, y, z, cor, tam, rapido) => { const s = brilho(g, cor, tam || 0.8, x, y, z, 0.9); const f = Math.random() * 6; il.animados.push((t) => { s.material.opacity = Math.sin(t * (rapido ? 9 : 2.6) + f) > 0.25 ? 0.95 : 0.12; }); return s; },
    // Totem alto com a logo dos dois lados
    totem: (x, z, h, larg) => {
      const L = larg || 2.2;
      [-L / 2 + 0.22, L / 2 - 0.22].forEach((dx) => K.add(G3.caixa, m(c.escuro), x + dx, 0, z, 0.24, h - 1.1, 0.24));
      K.add(G3.caixa, m(c.escuro), x, h - 1.25, z, L + 0.2, 1.3, 0.26);
      K.add(G3.caixa, luzMat(c.destaque, 1.3), x, h + 0.05, z, L + 0.24, 0.07, 0.28, 0, 0, 0, false);
      placaLogo(g, il, D, L - 0.12, 0.95, x, h - 0.6, z + 0.14); placaLogo(g, il, D, L - 0.12, 0.95, x, h - 0.6, z - 0.14, Math.PI);
    },
    // Galpão com fachada, telhado de duas águas e a faixa na cor da empresa
    galpao: (x, z, w, h, d) => {
      const f = fachadaDe('galpao'), geo = caixaUV(w, h, d, f.mu, f.mv); il.descartar.push(geo); il.matsJanela.push([f.mat, 0.6]);
      const mm = new THREE.Mesh(geo, materiaisDaCaixa(f.mat, m(COR3D.parede2, { roughness: 0.85 }))); mm.position.set(x, 0, z); mm.castShadow = mm.receiveShadow = true; g.add(mm);
      K.add(G3.prismaX, m(c.telhado), x, h, z, w + 0.14, 0.62, d + 0.14);
      K.add(G3.caixa, m(c.destaque), x, h - 0.36, z + d / 2 + 0.012, w, 0.16, 0.02, 0, 0, 0, false);
      return mm;
    },
    // Prédio comum (clínica, escritório baixo) com janelas que acendem à noite
    predio: (x, z, w, h, d, cor) => {
      const f = fachadaDe('comercial'), geo = caixaUV(w, h, d, f.mu, f.mv); il.descartar.push(geo); il.matsJanela.push([f.mat, 0.6]);
      const mm = new THREE.Mesh(geo, materiaisDaCaixa(f.mat, m(COR3D.parede2, { roughness: 0.85 }))); mm.position.set(x, 0, z); mm.castShadow = mm.receiveShadow = true; g.add(mm);
      K.add(G3.caixa, m(cor || c.escuro), x, h, z, w + 0.12, 0.14, d + 0.12);
      return mm;
    },
    // Torre de vidro com as janelas acesas e a coroa de LED
    torre: (x, z, w, h, d, cor, corLuz) => {
      const j = texturaJanelas(Math.max(3, Math.round(w * 3)), Math.max(6, Math.round(h * 3)), 0.55, corLuz || '#ffe9b8'); il.descartar.push(j.tex);
      const mm = new THREE.MeshStandardMaterial({ color: cor, roughness: 0.28, metalness: 0.45, emissive: 0xffffff, emissiveMap: j.tex, emissiveIntensity: 0.75, envMap: CAMPO.ambiente, envMapIntensity: 0.5 }); il.descartar.push(mm); il.matsJanela.push([mm, 0.75]);
      peca(g, G3.caixa, mm, w, h, d, x, 0, z);
      K.add(G3.caixa, m(COR3D.navy), x, h, z, w + 0.12, 0.22, d + 0.12);
      K.add(G3.caixa, luzMat(c.destaque, 1.3), x, h + 0.22, z, w + 0.14, 0.06, d + 0.14, 0, 0, 0, false);
    },
    container: (cor, x, y, z, giro) => {
      K.add(G3.caixa, m(cor, { roughness: 0.55, metalness: 0.25 }), x, y, z, 2.2, 0.9, 1.0, 0, giro || 0, 0);
      [-1.08, 1.08].forEach((ox) => pecaGirada(K, G3.caixa, m(0x2b3446), x, z, giro || 0, ox, y, 0, 0.05, 0.92, 1.02));
    },
    // Placa com texto (letreiro)
    letreiro: (texto, fundo, letra, x, y, z, w, h, giro) => {
      const tela = telaDe(512, 128, (q) => { q.fillStyle = fundo; q.fillRect(0, 0, 512, 128); q.fillStyle = letra; q.font = `bold ${Math.min(64, Math.floor(760 / Math.max(6, texto.length)))}px sans-serif`; q.textAlign = 'center'; q.textBaseline = 'middle'; q.fillText(texto, 256, 68); });
      const tex = new THREE.CanvasTexture(tela); tex.encoding = THREE.sRGBEncoding; il.descartar.push(tex);
      const mm = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }); il.descartar.push(mm);
      const pl = new THREE.Mesh(G3.placa, mm); pl.scale.set(w, h, 1); pl.position.set(x, y, z); pl.rotation.y = giro || 0; g.add(pl);
    }
  };
  return H;
}

/* ---------- O kit de cada segmento ---------- */
const KITS = {
  // Distribuição: pátio de carretas, estantes altas, contêineres, posto de combustível, expedição e totem
  distribuicao(H) {
    const { c } = H, asfalto = 0x3a4254;
    H.chao(asfalto, -11.2, -7.0, -3.6, 8.2);
    for (let i = 0; i <= 3; i++) H.pintura(COR3D.faixa, -11.0 + i * 1.33, 0.5, 0.05, 3.8);
    [-10.33, -9.0, -7.67].forEach((x, i) => { if (i === 1) { carretaEmManobra(H, x, 0.6, c.escuro, c.destaque); return; } H.veiculo('carreta', x, 0.6, -Math.PI / 2, 1.05, i === 1 ? c.escuro : c.destaque, i === 1 ? c.destaque : c.telhado); H.p(x, 2.6, Math.PI / 2, i === 1 ? 'tablet' : 'olhar', { dur: 14 }); });
    [-10.4, -8.2].forEach((x, i) => H.veiculo('caminhao', x, 6.3, -Math.PI / 2, 1.25, i ? c.destaque : c.escuro, i ? c.telhado : c.destaque));
    H.p(-9.3, 6.3, 0, 'carregar'); H.p(-9.3, 4.4, Math.PI / 2, 'tablet');
    H.poste(-7.2, -2.4, 2.8); H.poste(-7.2, 4.2, 2.8);
    // Estantes altas a céu aberto (direita), com caixas, e a empilhadeira parada
    const ferro = H.c.destaque, azul = 0x2f5ea8, pap = COR3D.papelao, pal = 0x8a6a48;
    H.chao(0xb8bfc9, 7.0, 11.2, -3.8, 2.6);
    [7.6, 9.1, 10.6].forEach((x, r) => {
      for (let k = 0; k <= 5; k++) [-0.28, 0.28].forEach((dx) => H.bx(ferro, x + dx, 0, -3.4 + k * 0.88, 0.06, 2.9, 0.06));
      [0.7, 1.4, 2.1, 2.8].forEach((y) => [-0.28, 0.28].forEach((dx) => H.bx(azul, x + dx, y, -1.2, 0.05, 0.06, 4.45, 0, false)));
      for (let k = 0; k < 5; k++) [0.05, 0.76, 1.46, 2.16].forEach((y, j) => { if ((k * 3 + j + r) % 4 === 0) return; H.bx(pal, x, y, -2.96 + k * 0.88, 0.5, 0.06, 0.7, 0, false); H.bx(pap, x, y + 0.06, -2.96 + k * 0.88, 0.44, 0.48 + ((k + j) % 2) * 0.12, 0.6, 0, false); });
    });
    H.p(8.35, -2.5, 0, 'agachar'); H.p(8.35, -0.4, Math.PI, 'carregar'); H.p(9.85, -1.6, 0, 'olhar');
    H.veiculo('empilhadeira', 8.4, 1.9, Math.PI / 2, 1.6, c.destaque);
    // Contêineres empilhados (direita, na frente)
    const cores = [c.destaque, 0x2f5ea8, 0xd8443a, 0x5a6577, c.telhado, 0x3f9e66];
    [[7.6, 4.1, 2], [8.9, 4.1, 3], [10.2, 4.1, 1], [7.6, 6.7, 1], [8.9, 6.7, 2], [10.2, 6.7, 2]].forEach(([x, z, n], i) => { for (let k = 0; k < n; k++) H.container(cores[(i + k) % cores.length], x, k * 0.92, z, Math.PI / 2); });
    H.p(8.25, 8.4, Math.PI / 2, 'tablet'); H.p(10.9, 5.4, Math.PI, 'carregar');
    // Posto de combustível das carretas (fundo, à esquerda)
    H.chao(asfalto, -11.2, -6.6, -8.7, -4.6);
    H.bx(0xf4f6fa, -8.9, 1.75, -6.6, 3.4, 0.22, 2.4); H.bx(luzMat(c.destaque, 1.1), -8.9, 1.72, -6.6, 3.44, 0.06, 2.44, 0, false);
    [[-10.4, -7.6], [-7.4, -7.6], [-10.4, -5.6], [-7.4, -5.6]].forEach(([x, z]) => H.bx(0xc9ced6, x, 0, z, 0.14, 1.75, 0.14));
    [-9.6, -8.2].forEach((x) => { H.bx(0xf4f6fa, x, 0, -6.6, 0.4, 0.9, 0.3); H.bx(luzMat(0x38d6f5, 1), x, 0.6, -6.44, 0.3, 0.16, 0.02, 0, false); });
    H.veiculo('caminhao', -8.9, -7.75, Math.PI, 1.25, c.telhado, c.destaque);
    H.p(-10.35, -6.6, 0, 'operar');
    // Expedição (fundo, à direita): galpão com duas docas e paletes saindo
    H.galpao(8.9, -7.2, 3.8, 2.4, 2.6);
    [8.1, 9.7].forEach((x) => H.bx(0x334058, x, 0, -5.89, 0.9, 1.1, 0.04, 0, false));
    [[7.7, -5.0], [10.1, -5.0]].forEach(([x, z]) => { H.bx(pal, x, 0, z, 0.6, 0.08, 0.6); H.bx(pap, x, 0.08, z, 0.52, 0.5, 0.52); });
    H.p(8.9, -5.0, Math.PI / 2, 'carregar'); H.porta(8.1, -5.5);
    // Totem com a logo na entrada
    H.totem(-6.2, 8.6, 4.6, 2.2);
  },
  // Indústria: chaminés altas, parque de tanques com tubulação, ponte rolante, pátio de aço e torre de resfriamento
  industria(H) {
    const { c } = H, concreto = 0xb8bfc9, amarelo = 0xf0b429;
    H.chao(concreto, -11.2, -7.0, -3.8, 9.2); H.chao(concreto, 7.0, 11.2, -3.8, 9.2);
    [-7.1, 7.1].forEach((x) => H.pintura(amarelo, x, 2.7, 0.08, 13.0));
    // Chaminés (fundo, à esquerda): bem altas, com faixas e fumaça
    H.chao(concreto, -11.2, -6.6, -8.7, -4.6);
    [[-9.8, -7.4, 7.6], [-7.9, -5.9, 6.4]].forEach(([x, z, h], k) => {
      H.cil(0xe9edf3, x, 0, z, 0.42, h); for (let i = 0; i < 4; i++) H.cil(0xd8443a, x, h - 0.5 - i * 0.95, z, 0.43, 0.42);
      H.cil(0x5a6577, x, h, z, 0.47, 0.14); H.cil(0x8a96a8, x, 0, z, 0.72, 0.4);
      H.fumaca(x, h + 0.1, z, 1.3 + k * 0.3); H.piscar(x, h + 0.25, z, 0xff3b30, 0.7);
    });
    H.p(-8.8, -7.6, Math.PI, 'tablet');
    // Tanques (esquerda) e a tubulação até a fábrica
    [[-9.9, -2.3], [-7.95, -2.3], [-8.9, 0.3]].forEach(([x, z]) => { H.cil(0xdfe4eb, x, 0, z, 0.86, 2.5); H.bola(0xd5dce6, x, 2.5, z, 0.86, 0.3, 0.86); H.cil(c.destaque, x, 1.6, z, 0.875, 0.16); H.bx(0x5a6577, x + 0.86, 0, z, 0.06, 2.6, 0.16); });
    [-10.6, -8.9, -7.2].forEach((x) => { [2.15, 2.55].forEach((z) => H.bx(0x5a6577, x, 0, z, 0.1, 1.5, 0.1)); H.bx(0x5a6577, x, 1.45, 2.35, 0.12, 0.08, 0.6); });
    [[2.25, 0x8a96a8], [2.45, c.destaque]].forEach(([z, cor]) => H.deitado(cor, -8.4, 1.62, z, 5.4, 0.07));
    H.p(-11.0, 0.3, 0, 'tablet'); H.p(-8.0, 3.2, Math.PI / 2, 'martelar');
    // Pátio de bobinas e vigas (esquerda, na frente)
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) H.deitado(0x9aa6b8, -10.3 + i * 1.0, 0.36, 4.7 + j * 1.0, 0.55, 0.34, Math.PI / 2);
    for (let k = 0; k < 4; k++) [7.4, 8.2].forEach((z) => H.bx(0x5a6577, -9.0, k * 0.13, z, 3.4, 0.12, 0.3));
    H.p(-9.8, 6.4, Math.PI / 2, 'carregar'); H.p(-7.6, 6.4, Math.PI / 2, 'agachar');
    // Ponte rolante (direita): dois pórticos amarelos e a viga que corre por cima do pátio de aço
    [-0.6, 3.6].forEach((z) => { [7.3, 10.9].forEach((x) => H.bx(amarelo, x, 0, z, 0.24, 3.2, 0.24)); H.bx(amarelo, 9.1, 3.2, z, 3.9, 0.3, 0.3); });
    [8.2, 10.0].forEach((x) => H.bx(amarelo, x, 3.5, 1.5, 0.22, 0.22, 4.5));
    const ponte = new THREE.Group(); ponte.userData.move = true; H.g.add(ponte);
    caixa(ponte, 2.3, 0.26, 0.3, 0xe0a21b, 9.1, 3.72, 0); caixa(ponte, 0.4, 0.3, 0.42, 0x2b3446, 9.1, 3.42, 0);
    const cabo = caixa(ponte, 0.03, 1, 0.03, 0x333a48, 9.1, 1.85, 0), carga = caixa(ponte, 1.6, 0.14, 0.24, 0x5a6577, 9.1, 1.7, 0);
    H.anima((t) => { ponte.position.z = 1.5 + Math.sin(t * 0.18) * 1.6; const y = 1.75 + Math.sin(t * 0.35) * 0.35; cabo.scale.y = 3.42 - y; cabo.position.y = y; carga.position.y = y - 0.14; });
    H.veiculo('prancha', 9.1, 1.4, -Math.PI / 2, 1.0, c.escuro, c.destaque);
    H.p(7.85, 1.5, 0, 'operar'); H.p(10.35, -0.1, Math.PI, 'olhar');
    // Bancadas de solda com faíscas e prensas (direita, na frente)
    const bancada = mat(0x8a96a8, { metalness: 0.6, roughness: 0.4 });
    [8.0, 10.2].forEach((x, i) => {
      H.bx(bancada, x, 0, 6.2, 1.4, 0.85, 0.7); H.bx(c.destaque, x, 0.85, 6.2, 1.42, 0.05, 0.72);
      const faisca = brilho(H.g, 0xffd27a, 0.6, x + 0.2, 1.0, 6.2, 0.9); H.anima((t) => { faisca.material.opacity = Math.sin(t * 23 + i * 5) > 0.2 ? 0.95 : 0.05; faisca.scale.setScalar(0.3 + Math.random() * 0.45); });
      H.p(x + 0.2, 7.0, Math.PI / 2, 'martelar', { dur: 25 }); H.p(x - 0.4, 5.4, -Math.PI / 2, 'operar');
      H.bx(0x5a6577, x, 0, 8.5, 1.0, 1.4, 0.9); H.bx(c.destaque, x, 1.4, 8.5, 1.02, 0.08, 0.92);
    });
    // Torre de resfriamento (fundo, à direita), soltando vapor
    const concretoT = new THREE.MeshStandardMaterial({ color: 0xd5dae1, roughness: 0.85, side: THREE.DoubleSide }); H.il.descartar.push(concretoT);
    const torreR = new THREE.Mesh(G3.torreResf, concretoT); torreR.scale.set(1.7, 3.8, 1.7); torreR.position.set(8.9, 0, -6.6); torreR.castShadow = torreR.receiveShadow = true; H.g.add(torreR);
    H.fumaca(8.9, 3.9, -6.6, 1.8, 0xf4f6fa);
    H.p(7.0, -4.8, Math.PI / 2, 'tablet');
  },
  // Varejo: estacionamento grande, totem gigante com a logo, doca de recebimento, paletes e tenda de promoção
  varejo(H) {
    const { c } = H, asfalto = 0x3a4254, cores = [0x2f5ea8, 0xd8443a, 0xe9edf3, 0x1b1b1f, c.destaque, 0x3f9e66, 0x9aa6b8, 0xe0a21b];
    H.chao(asfalto, -11.2, -7.0, -3.8, 9.2);
    for (let i = 0; i <= 11; i++) [-10.2, -7.95].forEach((x) => H.pintura(COR3D.faixa, x, -3.3 + i * 1.1, 1.3, 0.05));
    for (let i = 0; i < 11; i++) [[-10.2, 0], [-7.95, Math.PI]].forEach(([x, giro], k) => { if ((i * 5 + k * 3) % 7 === 0) return; H.veiculo('carro', x, -2.75 + i * 1.1, giro, 1.25, cores[(i + k * 3) % cores.length]); });
    H.poste(-9.07, -0.5, 2.8); H.poste(-9.07, 5.0, 2.8);
    // Carrinhos de compra
    H.bx(0x8a96a8, -9.07, 0, 8.7, 0.05, 0.5, 1.6);
    for (let i = 0; i < 5; i++) H.bx(0xc9ced6, -9.4, 0.12, 8.1 + i * 0.28, 0.4, 0.3, 0.22);
    H.p(-10.0, 9.05, 0, 'carregar');
    // Totem gigante com a logo (fundo, à esquerda)
    H.totem(-8.9, -6.6, 6.4, 2.8);
    H.bx(c.escuro, -8.9, 1.4, -6.6, 2.4, 0.7, 0.2); H.bx(luzMat(0xfff1d6, 0.9), -8.9, 1.5, -6.48, 2.2, 0.5, 0.02, 0, false);
    // Doca de recebimento (direita, atrás): plataforma, duas vans e um caminhão encostados
    H.bx(0xc9ced6, 9.1, 0, -3.3, 4.2, 0.55, 1.0);
    [[7.8, 'van'], [9.2, 'caminhao'], [10.6, 'van']].forEach(([x, tipo]) => H.veiculo(tipo, x, tipo === 'van' ? -2.0 : -1.65, -Math.PI / 2, tipo === 'van' ? 1.3 : 1.25, tipo === 'van' ? 0xf4f6fa : c.destaque, c.destaque));
    H.p(7.8, 0.3, Math.PI / 2, 'carregar'); H.p(10.6, 0.3, Math.PI / 2, 'tablet');
    // Paletes de mercadoria colorida (direita, no meio)
    [[7.8, 2.4], [9.1, 2.4], [10.4, 2.4], [7.8, 3.8], [10.4, 3.8]].forEach(([x, z], i) => { H.bx(0x8a6a48, x, 0, z, 0.8, 0.08, 0.8); for (let k = 0; k < 2 + (i % 2); k++) H.bx(cores[(i + k) % cores.length], x, 0.08 + k * 0.32, z, 0.72, 0.3, 0.72); });
    H.veiculo('empilhadeira', 9.1, 3.9, Math.PI / 2, 1.6, c.destaque);
    H.p(8.45, 3.1, 0, 'agachar'); H.p(9.75, 3.1, Math.PI, 'carregar');
    // Tenda de promoção (direita, na frente)
    H.bx(c.destaque, 9.1, 1.5, 7.3, 2.2, 0.1, 2.0); [[8.1, 6.4], [10.1, 6.4], [8.1, 8.2], [10.1, 8.2]].forEach(([x, z]) => H.bx(0xf4f6fa, x, 0, z, 0.06, 1.5, 0.06));
    H.bx(0xf4f6fa, 9.1, 0, 7.0, 1.2, 0.7, 0.5); H.bx(c.telhado, 9.1, 0.7, 7.0, 1.22, 0.05, 0.52);
    H.p(9.1, 6.45, -Math.PI / 2, 'conversar', { dur: 20 }); H.p(9.4, 7.6, Math.PI / 2, 'olhar');
    // Estoque (fundo, à direita)
    H.galpao(8.9, -7.2, 3.8, 2.2, 2.6); H.bx(0x334058, 8.9, 0, -5.89, 1.2, 1.2, 0.04, 0, false); H.porta(8.9, -5.5);
  },
  // Serviços: campus de torres (uma bem alta no fundo), coworking ao ar livre, praça com fonte e cúpula de vidro
  servicos(H) {
    const { c } = H, V = CAMPO.vida;
    H.chao(V.grama, -11.2, -7.0, 4.4, 9.2); H.chao(V.grama, 7.0, 11.2, 4.0, 9.2);
    // Torre corporativa alta (fundo, à esquerda)
    H.torre(-8.9, -6.6, 2.0, 7.8, 2.0, c.telhado === CORES_PADRAO.telhado ? 0x2a4a7a : c.telhado);
    H.cil(0xb8c2d4, -8.9, 8.0, -6.6, 0.04, 1.4); H.piscar(-8.9, 9.45, -6.6, 0xff3b30, 0.7);
    H.p(-8.9, -5.2, Math.PI / 2, 'tablet'); H.porta(-8.9, -5.3);
    // Segunda torre (direita, atrás)
    H.torre(9.1, -1.4, 2.4, 5.6, 2.4, 0x34507f, '#cfe3ff'); H.porta(9.1, 0.1);
    H.p(8.3, 0.4, Math.PI / 2, 'conversar'); H.p(8.8, 0.55, Math.PI, 'conversar');
    // Coworking ao ar livre (esquerda): deck com mesas e notebooks
    H.chao(mat(0x9a6a42, { roughness: 0.8 }), -11.0, -7.2, -0.2, 3.4);
    [[-10.1, 0.7], [-8.1, 0.7], [-10.1, 2.5], [-8.1, 2.5]].forEach(([x, z]) => {
      H.bx(0xf4f6fa, x, 0.66, z, 1.0, 0.04, 0.55); H.bx(0x2b3446, x, 0.08, z, 0.04, 0.6, 0.04);
      H.bx(0x1a2233, x, 0.7, z, 0.3, 0.02, 0.2, 0, false);
      [-1, 1].forEach((s) => { H.cil(0x2b3446, x + s * 0.6, 0, z, 0.14, 0.4); H.p(x + s * 0.6, z, s > 0 ? Math.PI : 0, 'digitar', { dur: 30 }); });
    });
    // Praça com fonte (esquerda, na frente) e jardim com bancos (direita, na frente)
    H.cil(0xdfe4eb, -9.1, 0, 6.8, 1.0, 0.35); H.cil(luzMat(0x5fb8ff, 0.7), -9.1, 0.3, 6.8, 0.88, 0.06); H.cil(0xdfe4eb, -9.1, 0, 6.8, 0.12, 0.9);
    const jato = brilho(H.g, 0xbfe6ff, 1.2, -9.1, 1.0, 6.8, 0.6); H.anima((t) => { jato.scale.set(1.0, 1.2 + Math.sin(t * 3) * 0.2, 1); });
    H.p(-10.6, 6.8, 0, 'olhar'); H.p(-9.1, 5.3, -Math.PI / 2, 'conversar');
    [[8.0, 5.6], [10.2, 5.6], [9.1, 8.2]].forEach(([x, z]) => { H.bx(0x9a6a42, x, 0.36, z, 1.4, 0.05, 0.42); [-0.6, 0.6].forEach((dx) => H.bx(0x2b3446, x + dx, 0, z, 0.06, 0.36, 0.38)); [-0.35, 0.35].forEach((dx) => H.p(x + dx, z, Math.PI / 2, 'sentar', { dur: 16 })); });
    [[7.6, 7.0], [10.6, 7.0]].forEach(([x, z]) => { H.cil(0x7a5a3c, x, 0, z, 0.07, 0.6); H.bola(0x4f9a5e, x, 1.0, z, 0.5, 0.6, 0.5); });
    // Cúpula de vidro do centro de convenções (fundo, à direita)
    const vid = new THREE.MeshStandardMaterial({ color: 0xcfe4f7, transparent: true, opacity: 0.32, roughness: 0.06, metalness: 0.3, depthWrite: false, side: THREE.DoubleSide }); H.il.descartar.push(vid);
    const cup = new THREE.Mesh(G3.cupula, vid); cup.scale.set(2.0, 2.0, 2.0); cup.position.set(8.9, 0.3, -6.6); H.g.add(cup);
    H.cil(0xdfe4eb, 8.9, 0, -6.6, 2.05, 0.3); H.cil(luzMat(c.destaque, 1.2), 8.9, 0.3, -6.6, 2.07, 0.05);
    [[8.4, -6.9], [9.4, -6.2], [9.2, -7.3]].forEach(([x, z]) => H.bola(0x3f8a52, x, 0.9, z, 0.45, 0.55, 0.45));
    H.p(8.9, -4.3, Math.PI / 2, 'tablet');
  },
  // Saúde: pronto-socorro com ambulâncias, torre do hospital com a cruz acesa, helicóptero, centro de diagnóstico e tanques de oxigênio
  saude(H) {
    const { c } = H, V = CAMPO.vida;
    H.chao(0xe9edf3, 7.0, 11.2, -3.8, 4.0);
    // Pronto-socorro (direita): marquise com letreiro e três ambulâncias paradas
    const vidroPS = new THREE.MeshStandardMaterial({ color: 0xcfe4f7, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.3, depthWrite: false }); H.il.descartar.push(vidroPS);
    peca(H.g, G3.caixa, vidroPS, 4.2, 0.06, 2.9, 9.1, 1.6, 0.6).castShadow = false;
    [[9.1, -0.85, 4.24, 0.12], [9.1, 2.05, 4.24, 0.12], [7.0, 0.6, 0.12, 2.94], [11.2, 0.6, 0.12, 2.94]].forEach(([x, z, w, d]) => H.bx(0xf4f6fa, x, 1.55, z, w, 0.16, d));
    H.bx(luzMat(0xf0523f, 1.2), 9.1, 1.52, 2.1, 4.24, 0.05, 0.03, 0, false);
    [[7.1, -0.8], [11.1, -0.8], [7.1, 2.0], [11.1, 2.0]].forEach(([x, z]) => H.bx(0xc9ced6, x, 0, z, 0.12, 1.55, 0.12));
    H.bx(0xd8443a, 9.1, 1.7, 2.02, 3.0, 0.5, 0.06);
    H.letreiro('PRONTO-SOCORRO', '#d8443a', '#ffffff', 9.1, 1.95, 2.06, 2.8, 0.5);
    [7.9, 9.1, 10.3].forEach((x) => { H.veiculo('ambulancia', x, 0.5, -Math.PI / 2, 1.35); H.piscar(x - 0.13, 0.95, 1.1, 0xf0523f, 0.5, true); H.piscar(x + 0.13, 0.95, 1.1, 0x4d8ff0, 0.5, true); });
    H.p(7.9, 2.55, Math.PI / 2, 'olhar'); H.p(10.3, 2.55, Math.PI / 2, 'carregar'); H.p(9.1, 3.2, Math.PI / 2, 'tablet');
    // Torre do hospital (fundo, à esquerda) com a cruz vermelha acesa no alto
    H.predio(-8.9, -6.7, 3.2, 5.4, 2.6, 0x4d8ff0); H.porta(-8.9, -5.0);
    const cruz = new THREE.MeshStandardMaterial({ color: 0xf0523f, emissive: 0xf0523f, emissiveIntensity: 1.2, toneMapped: false }); H.il.descartar.push(cruz);
    peca(H.g, G3.caixa, cruz, 0.34, 1.3, 0.14, -8.9, 5.6, -5.45); peca(H.g, G3.caixa, cruz, 1.3, 0.34, 0.14, -8.9, 6.08, -5.45);
    const halo = brilho(H.g, 0xf0523f, 3.4, -8.9, 6.25, -5.3, 0.5);
    H.anima((t) => { const k = 0.6 + Math.sin(t * 2.2) * 0.4; cruz.emissiveIntensity = 0.6 + k; halo.material.opacity = 0.25 + k * 0.35; });
    H.p(-8.2, -4.9, Math.PI / 2, 'tablet');
    // Helicóptero no heliponto da ala nova (em cima do prédio da cena)
    const [hx, hz] = daCena(1.9, -0.4); H.veiculo('helicoptero', hx, hz, Math.PI / 4, 1.1, 0xf4f6fa, 0xd8443a, 2.69 * ESC_CENA + 0.01);
    // Centro de diagnóstico (esquerda, atrás) e o jardim dos pacientes (esquerda, na frente)
    H.predio(-9.1, -1.6, 3.6, 2.2, 2.4, 0x4d8ff0); H.bx(0x4d8ff0, -9.1, 1.5, -0.39, 3.6, 0.18, 0.04, 0, false); H.porta(-9.1, -0.05);
    H.letreiro('DIAGNÓSTICO', '#0f2342', '#ffffff', -9.1, 1.9, -0.36, 2.0, 0.42);
    H.chao(V.grama, -11.2, -7.0, 1.4, 9.2);
    [[-10.0, 3.6], [-8.2, 3.6], [-9.1, 6.4]].forEach(([x, z]) => { H.bx(0x9a6a42, x, 0.36, z, 1.4, 0.05, 0.42); [-0.6, 0.6].forEach((dx) => H.bx(0x2b3446, x + dx, 0, z, 0.06, 0.36, 0.38)); [-0.35, 0.35].forEach((dx) => H.p(x + dx, z, Math.PI / 2, 'sentar', { dur: 16 })); });
    [[-10.6, 5.0], [-7.6, 5.0], [-10.6, 8.2], [-7.6, 8.2]].forEach(([x, z]) => { H.cil(0x7a5a3c, x, 0, z, 0.07, 0.6); H.bola(0x4f9a5e, x, 1.0, z, 0.5, 0.6, 0.5); });
    // Tanques de oxigênio e gerador (fundo, à direita)
    [8.0, 9.1, 10.2].forEach((x) => { H.cil(0xf4f6fa, x, 0, -7.4, 0.42, 3.0); H.cil(0x2fbf71, x, 2.2, -7.4, 0.43, 0.2); H.bola(0xf4f6fa, x, 3.0, -7.4, 0.42, 0.2, 0.42); });
    H.bx(0x5a6577, 9.1, 0, -5.4, 2.0, 0.9, 0.9); H.bx(0x2fbf71, 9.1, 0.9, -5.4, 2.02, 0.06, 0.92);
    H.p(9.1, -4.55, Math.PI / 2, 'tablet');
  },
  // Agro: pivô central girando, plantações, silos grandes com a torre de grãos, máquinas paradas, feno e celeiro
  agro(H) {
    const { c } = H, terra = 0x8a6a48;
    H.chao(terra, -11.2, -7.0, -3.8, 9.2); H.chao(terra, 7.0, 11.2, 4.6, 9.2);
    // Pivô central (esquerda): roda de plantação e o braço de irrigação girando devagar
    const cx = -9.1, cz = 2.2;
    H.cil(0x5f9a4e, cx, 0, cz, 2.05, 0.12); H.cil(0x76ad5b, cx, 0, cz, 1.45, 0.13); H.cil(0x5f9a4e, cx, 0, cz, 0.85, 0.14); H.cil(0x8a96a8, cx, 0, cz, 0.12, 1.1);
    const braco = new THREE.Group(); braco.position.set(cx, 0, cz); braco.userData.move = true; H.g.add(braco);
    caixa(braco, 2.0, 0.06, 0.08, 0xc9ced6, 1.0, 1.0, 0);
    [0.7, 1.4, 1.95].forEach((r) => { const t1 = caixa(braco, 0.05, 1.0, 0.05, 0x8a96a8, r, 0, 0.12); t1.rotation.x = -0.15; const t2 = caixa(braco, 0.05, 1.0, 0.05, 0x8a96a8, r, 0, -0.12); t2.rotation.x = 0.15; peca(braco, G3.roda, mat(0x1a1f2b), 0.1, 0.1, 0.06, r, 0.1, 0); });
    H.anima((t) => { braco.rotation.y = t * 0.05; });
    // Plantação em fileiras (esquerda, na frente e atrás)
    for (let i = 0; i < 7; i++) H.bx(i % 2 ? COR3D.verde : COR3D.verde2, -9.1, 0, 5.45 + i * 0.6, 4.0, 0.16, 0.24);
    for (let i = 0; i < 5; i++) H.bx(i % 2 ? 0xc9b24a : 0xb39a3c, -9.1, 0, -3.4 + i * 0.6, 4.0, 0.18, 0.26);
    H.p(-9.6, 4.95, -Math.PI / 2, 'agachar'); H.p(-6.75, 7.5, Math.PI, 'agachar'); H.p(-10.3, -0.6, Math.PI / 2, 'agachar');
    // Silos grandes e a torre do elevador de grãos (fundo, à esquerda)
    const silos = [[-10.2, -7.6], [-8.3, -7.6], [-10.2, -5.6]];
    silos.forEach(([x, z]) => { H.cil(0xd5dce6, x, 0, z, 0.86, 4.0); H.cone(0xb4bfce, x, 4.0, z, 0.9, 0.8); [1.0, 2.0, 3.0].forEach((y) => H.cil(0xaab4c3, x, y, z, 0.875, 0.06)); H.bx(c.destaque, x + 0.86, 0, z, 0.06, 4.0, 0.12); });
    H.bx(0x8a96a8, -7.5, 0, -5.4, 0.6, 5.8, 0.6); H.bx(c.destaque, -7.5, 5.8, -5.4, 0.8, 0.5, 0.8);
    silos.forEach(([x, z]) => H.viga(0x8a96a8, [-7.5, 5.9, -5.4], [x, 4.75, z], 0.14, 0.18));
    H.piscar(-7.5, 6.45, -5.4, 0xff3b30, 0.7);
    H.p(-7.5, -4.4, Math.PI / 2, 'operar');
    // Máquinas paradas (direita): colheitadeira, tratores e o caminhão graneleiro
    H.veiculo('colheitadeira', 9.1, -2.1, -Math.PI / 2, 1.3, 0x3f9e66, 0xf0b429);
    [7.8, 10.4].forEach((x) => H.veiculo('trator', x, 1.6, -Math.PI / 2, 1.7, 0x3f9e66));
    H.veiculo('graneleiro', 9.1, 4.6, -Math.PI / 2, 1.0, c.destaque, 0x3f9e66);
    H.p(9.1, 0.3, Math.PI / 2, 'olhar'); H.p(9.1, 2.6, -Math.PI / 2, 'tablet');
    // Fardos de feno (direita, na frente)
    for (let i = 0; i < 4; i++) H.deitado(0xd9b96a, 7.7 + i * 0.95, 0.36, 8.2, 0.5, 0.35, Math.PI / 2);
    for (let i = 0; i < 3; i++) H.deitado(0xcfae5e, 8.18 + i * 0.95, 1.02, 8.2, 0.5, 0.35, Math.PI / 2);
    H.p(9.1, 7.3, Math.PI / 2, 'carregar');
    // Celeiro grande (fundo, à direita): vermelho, telhado de duas águas e o acabamento branco
    H.bx(0xb5432f, 8.9, 0, -7.0, 3.6, 2.0, 2.6); H.bx(0xf4f1ea, 8.9, 0, -5.69, 1.4, 1.5, 0.04, 0, false);
    H.K.add(G3.prismaX, mat(H.c.telhado), 8.9, 2.0, -7.0, 3.7, 1.1, 2.75);
    [-1, 1].forEach((s) => H.bx(0xf4f1ea, 8.9 + s * 1.8, 0, -5.68, 0.08, 2.0, 0.04, 0, false));
    H.bx(0xf4f1ea, 8.9, 2.0, -5.68, 3.6, 0.08, 0.04, 0, false);
    H.viga(0xf4f1ea, [8.25, 0.05, -5.66], [9.55, 1.45, -5.66], 0.06); H.viga(0xf4f1ea, [9.55, 0.05, -5.66], [8.25, 1.45, -5.66], 0.06);
    H.porta(8.9, -5.3); H.p(7.6, -5.0, Math.PI / 2, 'carregar');
  },
  // Construção: duas gruas altas, canteiro de contêineres, prédio começando com andaime, betoneira, escavadeira e pátio de materiais
  construcao(H) {
    const { c } = H, terra = 0x9a7350;
    H.chao(terra, -11.2, -7.0, -3.8, 9.2); H.chao(terra, 7.0, 11.2, -3.8, 9.2); H.chao(terra, -11.2, -6.6, -8.7, -4.6); H.chao(terra, 6.6, 11.2, -8.7, -4.6);
    // Segunda grua (fundo, à esquerda): bem alta, girando devagar
    const gx = -8.9, gz = -6.6, alto = 8.8;
    H.bx(0xb8bfc9, gx, 0, gz, 1.2, 0.3, 1.2);
    [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].forEach(([dx, dz]) => H.bx(0xf0b429, gx + dx, 0.3, gz + dz, 0.07, alto - 0.3, 0.07));
    for (let y = 1; y < alto; y += 1.0) H.bx(0xf0b429, gx, y, gz, 0.44, 0.05, 0.44);
    const lanca = new THREE.Group(); lanca.position.set(gx, alto, gz); lanca.userData.move = true; H.g.add(lanca);
    caixa(lanca, 6.2, 0.22, 0.22, 0xf0b429, 2.4, 0, 0); caixa(lanca, 1.8, 0.22, 0.22, 0xf0b429, -1.4, 0, 0);
    caixa(lanca, 0.7, 0.5, 0.5, 0x8a96a8, -1.9, -0.5, 0); caixa(lanca, 0.5, 0.45, 0.45, 0x2b3446, 0.3, -0.45, 0);
    caixa(lanca, 0.08, 1.2, 0.08, 0xf0b429, 0, 0.22, 0);
    const caboG = caixa(lanca, 0.02, 3.4, 0.02, 0x333a48, 3.6, -3.4, 0), cargaG = caixa(lanca, 0.5, 0.3, 0.5, c.destaque, 3.6, -3.7, 0);
    H.anima((t) => { lanca.rotation.y = Math.sin(t * 0.12) * 1.2 + 0.6; const x = 2.0 + (Math.sin(t * 0.3) + 1) * 1.6; caboG.position.x = x; cargaG.position.x = x; });
    H.piscar(gx, alto + 1.3, gz, 0xff3b30, 0.7);
    H.p(-7.4, -5.0, Math.PI / 2, 'olhar');
    // Canteiro (direita, atrás): contêineres de escritório empilhados, escada e banheiros químicos
    [[8.1, -2.8, 0], [10.2, -2.8, 0], [8.1, -2.8, 0.92], [10.2, -2.8, 0.92], [8.1, -1.6, 0]].forEach(([x, z, y], i) => H.container(i % 2 ? 0xe9edf3 : c.destaque, x, y, z, 0));
    [[8.1, -2.29, 0], [10.2, -2.29, 0], [8.1, -2.29, 0.92]].forEach(([x, z, y]) => H.bx(luzMat(0xbcd8ff, 0.5), x, 0.35 + y, z, 0.7, 0.3, 0.02, 0, false));
    H.viga(0x5a6577, [7.0, 0.1, -1.9], [7.0, 1.82, -3.4], 0.5, 0.06);
    [7.6, 8.25, 8.9].forEach((x) => { H.bx(0x2f5ea8, x, 0, 0.5, 0.52, 1.15, 0.52); H.bx(0xf4f6fa, x, 1.15, 0.5, 0.56, 0.06, 0.56); });
    H.p(9.1, -0.75, Math.PI / 2, 'tablet'); H.porta(8.1, -1.0);
    // Prédio 2 começando (direita, na frente): laje, pilares, primeiro andar e andaime
    H.bx(0xc9d1dc, 9.1, 0, 5.4, 3.6, 0.15, 3.0);
    [[7.6, 4.2], [9.1, 4.2], [10.6, 4.2], [7.6, 6.6], [9.1, 6.6], [10.6, 6.6]].forEach(([x, z]) => H.bx(0xaab4c3, x, 0.15, z, 0.18, 2.6, 0.18));
    H.bx(0xc9d1dc, 9.1, 1.4, 5.4, 3.6, 0.14, 3.0);
    for (let x = 7.4; x <= 10.81; x += 0.68) H.bx(0x4d8ff0, x, 0, 7.15, 0.04, 2.9, 0.04);
    [0.75, 1.5, 2.25, 2.9].forEach((y) => H.bx(0x4d8ff0, 9.1, y, 7.15, 3.5, 0.04, 0.04));
    H.p(8.3, 7.7, Math.PI / 2, 'martelar'); H.p(9.9, 7.7, Math.PI / 2, 'martelar'); H.p(11.0, 5.4, Math.PI, 'carregar');
    // Pátio de materiais (esquerda): tijolos, ferragens, tubos e areia; betoneira e escavadeira paradas
    const tijolo = mat(0xb5432f, { roughness: 0.9 });
    [[-10.4, -3.0], [-9.4, -3.0], [-10.4, -2.0]].forEach(([x, z]) => { H.bx(0x8a6a48, x, 0, z, 0.8, 0.08, 0.55); for (let k = 0; k < 4; k++) H.bx(tijolo, x, 0.08 + k * 0.13, z, 0.7, 0.12, 0.45); });
    for (let k = 0; k < 5; k++) H.bx(0x5a6577, -7.9, 0.05 + k * 0.06, -2.6 + k * 0.05, 0.12, 0.05, 2.6);
    for (let i = 0; i < 3; i++) for (let j = 0; j < (i === 2 ? 1 : 2); j++) H.deitado(0x9aa6b8, -9.0, 0.2 + j * 0.34, -0.4 + i * 0.34, 2.2, 0.16, 0);
    H.cone(0xd8b98a, -10.3, 0, 1.8, 0.8, 0.7); H.cone(0xc7a676, -8.4, 0, 2.2, 0.6, 0.5);
    H.veiculo('betoneira', -9.4, 5.0, -Math.PI / 2, 1.35, c.destaque, 0x5a6577);
    H.veiculo('escavadeira', -9.9, 7.9, 0.5, 1.3, 0xf0b429);
    H.cone(0x8a6a48, -7.8, 0, 8.2, 0.75, 0.55);
    H.p(-10.4, -1.2, Math.PI / 2, 'carregar'); H.p(-8.4, 4.0, Math.PI, 'operar'); H.p(-7.0, -1.9, Math.PI, 'agachar');
    // Caçamba e pilha de entulho (fundo, à direita)
    H.bx(c.destaque, 8.9, 0, -6.8, 2.4, 0.8, 1.2); H.bx(0x8a6a48, 8.9, 0.8, -6.8, 2.2, 0.12, 1.0); H.cone(0x9aa6b8, 10.4, 0, -5.4, 0.7, 0.6);
    H.p(8.9, -5.7, Math.PI / 2, 'carregar');
  },
  // Tecnologia: torre de antenas, data center com as máquinas de ar, geradores, fazenda solar e laboratório ao ar livre
  tecnologia(H) {
    const { c } = H, piso = 0x1d2c4a;
    H.chao(piso, 7.0, 11.2, -3.8, 9.2); H.chao(piso, -11.2, -6.6, -8.7, -4.6);
    for (let z = -3.4; z <= 9; z += 1.6) H.pintura(luzMat(0x38d6f5, 0.9), 9.1, z, 4.0, 0.03);
    // Torre de telecomunicações (fundo, à esquerda): treliça alta, antenas e a luz piscando
    const tx = -8.9, tz = -6.6, alto = 8.6;
    [[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38]].forEach(([dx, dz]) => H.bx(0xd5dce6, tx + dx, 0, tz + dz, 0.07, alto, 0.07));
    for (let y = 0.8; y < alto; y += 0.8) { H.bx(0xd5dce6, tx, y, tz - 0.38, 0.8, 0.04, 0.04); H.bx(0xd5dce6, tx, y, tz + 0.38, 0.8, 0.04, 0.04); H.bx(0xd5dce6, tx - 0.38, y, tz, 0.04, 0.04, 0.8); H.bx(0xd5dce6, tx + 0.38, y, tz, 0.04, 0.04, 0.8); }
    for (let y = 0; y < alto - 0.8; y += 0.8) [-0.38, 0.38].forEach((dx) => H.viga(0xd5dce6, [tx + dx, y, tz - 0.38], [tx + dx, y + 0.8, tz + 0.38], 0.03));
    H.bx(0xf4f6fa, tx, alto, tz, 1.2, 0.08, 1.2); H.cil(0xb8c2d4, tx, alto, tz, 0.04, 1.6);
    [[6.8, 0], [7.4, Math.PI], [6.0, Math.PI / 2]].forEach(([y, a]) => H.bola(0xf4f6fa, tx + Math.cos(a) * 0.55, y, tz - Math.sin(a) * 0.55, 0.12, 0.32, 0.32));
    H.piscar(tx, alto + 1.65, tz, 0xff3b30, 0.8); H.piscar(tx, alto * 0.55, tz, 0xff3b30, 0.5);
    H.p(-7.8, -5.5, Math.PI, 'tablet');
    // Data center (direita, atrás): prédio escuro com linhas de LED e as máquinas de ar no teto
    H.bx(0x16233d, 9.1, 0, -1.5, 3.8, 2.0, 4.4);
    [0.5, 1.0, 1.5].forEach((y) => { H.bx(luzMat(0x38d6f5, 1.3), 9.1, y, 0.72, 3.82, 0.04, 0.02, 0, false); H.bx(luzMat(0x38d6f5, 1.3), 7.19, y, -1.5, 0.02, 0.04, 4.42, 0, false); });
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) arCondicionado(H.K, 8.0 + i * 1.1, 2.0, -2.8 + j * 1.6);
    H.letreiro('DATA CENTER', '#0b1a33', '#38d6f5', 9.1, 1.75, 0.74, 2.2, 0.38);
    H.bx(0x334058, 9.1, 0, 0.71, 0.9, 1.2, 0.04, 0, false); H.porta(9.1, 1.1);
    H.p(8.2, 1.3, Math.PI / 2, 'tablet');
    // Geradores (direita, no meio) e laboratório ao ar livre (direita, na frente)
    [7.6, 9.1, 10.6].forEach((x) => { H.container(0x5a6577, x, 0, 3.4, Math.PI / 2); H.bx(0x2b3446, x + 0.51, 0.25, 3.4, 0.02, 0.4, 1.6, 0, false); });
    H.p(8.35, 4.9, Math.PI / 2, 'operar');
    [[7.8, 6.6], [10.4, 6.6], [7.8, 8.3], [10.4, 8.3]].forEach(([x, z]) => {
      H.bx(0xf4f6fa, x, 0.95, z, 1.1, 0.04, 0.5); H.bx(0x2b3446, x, 0, z, 0.05, 0.95, 0.05);
      H.bx(luzMat(0x38d6f5, 0.9), x, 1.08, z - 0.2, 0.45, 0.28, 0.02, 0, false);
      H.p(x, z + 0.45, Math.PI / 2, 'operar', { dur: 28 });
    });
    // Fazenda solar (esquerda): fileiras de painéis inclinados
    const painel = mat(0x1f3f78, { roughness: 0.25, metalness: 0.6 });
    for (let k = 0; k < 7; k++) { const z = -3.2 + k * 1.75; H.K.add(G3.caixaC, painel, -9.1, 0.5, z, 4.0, 0.04, 0.95, -0.5, 0, 0); [-10.8, -9.1, -7.4].forEach((x) => H.bx(0x8a96a8, x, 0, z + 0.15, 0.05, 0.42, 0.05)); }
    H.p(-9.1, -2.2, Math.PI / 2, 'varrer'); H.p(-9.6, 3.0, Math.PI / 2, 'tablet');
    // Prédio de vidro da inovação (fundo, à direita)
    H.torre(8.9, -6.7, 3.0, 3.6, 2.6, 0x2a4a7a, '#8fe9ff'); H.porta(8.9, -5.1);
    H.p(8.0, -4.9, Math.PI / 2, 'conversar'); H.p(8.6, -4.65, Math.PI, 'conversar');
  }
};
// Postos em volta da cena do segmento (no sistema da cena, antes de crescer): docas, esteiras, entradas
const CENA_POSTOS = {
  distribuicao: [[0.95, 3.5, Math.PI, 'carregar'], [-2.95, 3.1, 0, 'tablet'], [1.62, 2.7, Math.PI, 'operar'], [2.6, 1.0, Math.PI / 2, 'agachar'], [2.1, 2.9, 0, 'carregar']],
  industria: [[-2.0, 3.35, Math.PI / 2, 'operar'], [-0.8, 3.35, Math.PI / 2, 'operar'], [0.4, 3.35, Math.PI / 2, 'operar'], [-3.1, -0.6, 0, 'tablet']],
  varejo: [[1.6, 2.3, 0, 'carregar'], [-2.6, 2.3, Math.PI, 'varrer']],
  servicos: [[-1.4, 3.4, Math.PI / 2, 'tablet'], [0.9, 2.6, Math.PI, 'conversar']],
  saude: [[-0.8, 2.6, -Math.PI / 2, 'tablet'], [1.8, 3.4, Math.PI, 'conversar'], [2.0, 3.0, Math.PI, 'olhar'], [3.4, 0.0, Math.PI, 'tablet']],
  agro: [[0.2, 3.5, Math.PI / 2, 'agachar'], [1.6, 3.5, Math.PI / 2, 'agachar'], [-1.2, 0.9, 0, 'tablet']],
  construcao: [[-1.5, 3.4, Math.PI / 2, 'martelar'], [-0.2, 3.4, Math.PI / 2, 'martelar'], [2.0, 2.5, Math.PI, 'carregar'], [-2.6, 2.5, 0, 'tablet']],
  tecnologia: [[1.4, 1.5, Math.PI, 'tablet'], [-0.4, 3.4, Math.PI / 2, 'conversar']]
};

/* ---------- A cidade: o que é igual em todas e, depois, o kit do segmento ---------- */
function montarCidade(il, D) {
  const T = THREE, V = CAMPO.vida, g = il.grupoCena, sorte = sorteio(D.id + 'cidade');
  formasDaCidade();
  const postos = il.postosLocais = []; il.portasLocais = [];
  // Chão da quadra: concreto claro, com gramado nas bordas
  const base = new T.Mesh(G3.caixa, [V.meioFio, V.meioFio, V.calcada, V.meioFio, V.meioFio, V.meioFio]);
  base.scale.set(CID_X * 2, ALTURA_ILHA, CID_Z * 2); base.position.y = -ALTURA_ILHA; base.receiveShadow = true; base.castShadow = true; il.grupo.add(base);
  const lote = novoLote();
  [[-CID_X + 0.9, 0, 1.4, CID_Z * 2 - 0.6], [CID_X - 0.9, 0, 1.4, CID_Z * 2 - 0.6], [0, -CID_Z + 0.7, CID_X * 2 - 3.4, 1.0]].forEach(([x, z, w, d]) => lote.add(G3.caixa, V.grama, x, 0.002, z, w, 0.02, d, 0, 0, 0, false));
  // Caminho do portão até a frente da cena, com faixas acesas nas bordas
  if (!CAMPO.matCaminho) CAMPO.matCaminho = pisoNoturno(new T.MeshStandardMaterial({ color: 0xf2f4f7, roughness: 0.7 }));
  if (!CAMPUS_NOVO) { lote.add(G3.caixa, CAMPO.matCaminho, 0, 0.004, 7.8, 3.0, 0.02, 4.4, 0, 0, 0, false);
  [-1.55, 1.55].forEach((x) => lote.add(G3.caixa, luzMat(il.cores.destaque, 0.9), x, 0.006, 7.8, 0.06, 0.02, 4.4, 0, 0, 0, false)); }
  // Cerca: montantes e painéis de vidro com a faixa na cor da empresa (abertura no portão)
  const montante = mat(0x2b3a57, { roughness: 0.5, metalness: 0.4 });
  const vidroC = new T.MeshStandardMaterial({ color: 0xcfe0f2, transparent: true, opacity: 0.3, roughness: 0.1, depthWrite: false, side: T.DoubleSide }); il.descartar.push(vidroC);
  const trecho = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 1.5)), giro = Math.atan2(-(z1 - z0), x1 - x0);
    for (let k = 0; k <= n; k++) { const x = x0 + (x1 - x0) * k / n, z = z0 + (z1 - z0) * k / n; lote.add(G3.caixa, montante, x, 0, z, 0.07, 1.05, 0.07); }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const p = new T.Mesh(G3.caixa, vidroC); p.scale.set(L, 0.9, 0.03); p.position.set(cx, 0.06, cz); p.rotation.y = giro; g.add(p);
    lote.add(G3.caixa, mat(il.cores.destaque, { roughness: 0.5 }), cx, 0.96, cz, L, 0.06, 0.06, 0, giro, 0);
  };
  trecho(-CID_X, -CID_Z, CID_X, -CID_Z); trecho(-CID_X, -CID_Z, -CID_X, CID_Z); trecho(CID_X, -CID_Z, CID_X, CID_Z);
  trecho(-CID_X, CID_Z, -PORTAO, CID_Z); trecho(PORTAO, CID_Z, CID_X, CID_Z);
  // Portão: pórtico com a logo, faixa acesa no chão, folhas que correm e a guarita com o vigia
  [-PORTAO, PORTAO].forEach((x) => lote.add(G3.caixa, mat(il.cores.escuro, { roughness: 0.5 }), x, 0, CID_Z, 0.3, 2.6, 0.3));
  lote.add(G3.caixa, mat(il.cores.escuro, { roughness: 0.5 }), 0, 2.6, CID_Z, PORTAO * 2 + 0.3, 0.3, 0.32);
  placaLogo(g, il, D, 2.3, 0.55, 0, 2.47, CID_Z + 0.17);
  lote.add(G3.caixa, luzMat(il.cores.destaque, 1.1), 0, 0.006, CID_Z, PORTAO * 2 - 0.3, 0.02, 0.08, 0, 0, 0, false);
  const grade = mat(il.cores.escuro, { roughness: 0.4, metalness: 0.5 });
  il.folhasPortao = [-1, 1].map((s) => {
    const f = new T.Group(); f.position.set(s * (PORTAO * 1.5 + 0.15), 0, CID_Z - 0.18); f.userData.pisavel = true; g.add(f);
    caixa(f, PORTAO, 0.06, 0.05, grade, 0, 0.05, 0); caixa(f, PORTAO, 0.06, 0.05, grade, 0, 0.95, 0);
    for (let k = 0; k <= 6; k++) caixa(f, 0.035, 0.9, 0.035, grade, -PORTAO / 2 + k * PORTAO / 6, 0.08, 0);
    caixa(f, PORTAO, 0.03, 0.06, luzMat(il.cores.destaque, 1.2), 0, 1.01, 0).castShadow = false;
    return f;
  });
  caixa(g, 1.4, 1.5, 1.2, mat(0xf4f6fa), 3.3, 0, CID_Z - 1.0); caixa(g, 1.5, 0.1, 1.3, il.cores.escuro, 3.3, 1.5, CID_Z - 1.0);
  caixa(g, 1.0, 0.6, 0.04, luzMat(0xbcd8ff, 0.4), 3.3, 0.8, CID_Z - 0.38).castShadow = false;
  postos.push(ponto(2.15, CID_Z - 0.55, -Math.PI / 2, 'olhar', { dur: 60 }));   // o vigia olha para fora
  // Árvores no gramado dos lados
  const verdes = [mat(0x4f9a5e, { roughness: 0.85 }), mat(0x3f8a52, { roughness: 0.85 }), mat(0x6aad5f, { roughness: 0.85 })], tronco = mat(0x7a5a3c, { roughness: 1 });
  const arv = (x, z, k) => { lote.add(G3.cil, tronco, x, 0, z, 0.07 * k, 0.5 * k, 0.07 * k); lote.add(G3.copa, verdes[Math.floor(sorte() * 3)], x, 0.8 * k, z, 0.45 * k, 0.55 * k, 0.45 * k, 0, sorte() * 3, 0); lote.add(V.placaChao, V.sombra, x, 0.03, z, 1.3 * k, 1, 1.3 * k, 0, 0, 0, false); };
  [-8.3, -3.9, -1.5, 3.3, 5.3, 8.8].forEach((z, i) => { if (!CAMPUS_NOVO || z < 1.2) arv(-CID_X + 0.9, z, 0.9 + sorte() * 0.3); arv(CID_X - 0.9, z + (i % 2 ? 0.6 : -0.6), 0.9 + sorte() * 0.3); });
  // Postes (acendem à noite, com o cone de luz no chão)
  il.postes = []; il.pocasLuz = [];
  il.matPocaLuz = new T.MeshBasicMaterial({ map: CAMPO.texBrilho, color: 0xffc27a, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }); il.descartar.push(il.matPocaLuz);
  const H = ajudantesDoKit(il, D, g, lote, postos);
  [[-2.2, 8.7], [2.2, 8.7], [-2.2, 6.2], [2.2, 6.2], [-12.1, -6], [12.1, -6], [-12.1, 1], [12.1, 1], [-12.1, 7], [12.1, 7], [-3.5, -9.3], [3.5, -9.3], [-6.2, -4.1], [6.2, -4.1]].filter(([x, z]) => !CAMPUS_NOVO || (z > -3.2 && !(x < -5.5 && z > 1.3) && !(x > 9.5 && z > -3 && z < 6.6))).forEach(([x, z]) => H.poste(x, z, 1.8));
  if (CAMPUS_NOVO) campusPadrao(H, il, D, g); else {
  // Copa dos funcionários (na frente, à direita): balcão e mesas com guarda-sol
  H.bx(il.cores.telhado, 5.6, 0, 8.95, 1.4, 0.95, 0.55); H.bx(0xf4f6fa, 5.6, 0.95, 8.95, 1.5, 0.05, 0.6);
  postos.push(ponto(5.25, 8.3, -Math.PI / 2, 'emPeCafe', { dur: 10 }), ponto(5.95, 8.3, -Math.PI / 2, 'emPeCafe', { dur: 10 }));
  [[3.6, 6.6], [5.5, 6.7]].forEach(([x, z]) => {
    H.cil(0x8a96a8, x, 0, z, 0.04, 0.7); H.cil(0xf4f6fa, x, 0.7, z, 0.34, 0.04); H.cil(0x2b3446, x, 0.74, z, 0.025, 0.7); H.cone(il.cores.destaque, x, 1.3, z, 0.75, 0.3);
    [0, 2.1, 4.2].forEach((a) => { const cx = x + Math.cos(a) * 0.6, cz = z + Math.sin(a) * 0.6; H.cil(il.cores.telhado, cx, 0, cz, 0.14, 0.4); postos.push(ponto(cx, cz, Math.atan2(-(z - cz), x - cx), 'cafe', { dur: 16 })); });
  });
  // Gestão à vista (na frente, à esquerda): quadro com a nota de cada setor e a roda de conversa do começo do turno
  const cq = telaDe(512, 320, (q) => {
    q.fillStyle = '#f4f6fa'; q.fillRect(0, 0, 512, 320); q.fillStyle = '#0f2342'; q.fillRect(0, 0, 512, 54);
    q.fillStyle = '#ffffff'; q.font = 'bold 28px sans-serif'; q.fillText('GESTÃO À VISTA', 20, 37);
    const lista = (D.setores || []).slice(0, 5);
    if (!lista.length) { q.fillStyle = '#5a6577'; q.font = '24px sans-serif'; q.fillText('Setores ainda não cadastrados', 20, 120); }
    lista.forEach((st, i) => {
      const y = 78 + i * 46, n = st.d.nota;
      q.fillStyle = '#2b3446'; q.font = '22px sans-serif'; q.fillText(String(st.nome || '').slice(0, 14), 20, y + 24);
      q.fillStyle = '#dfe3e9'; q.fillRect(200, y + 6, 240, 24);
      q.fillStyle = COR_SAUDE_CSS[st.d.saude] || '#8796ad'; q.fillRect(200, y + 6, n == null ? 0 : 240 * n / 100, 24);
      q.fillStyle = '#0f2342'; q.font = 'bold 22px sans-serif'; q.fillText(n == null ? '–' : String(n), 452, y + 26);
    });
  });
  const texQ = new T.CanvasTexture(cq); texQ.encoding = T.sRGBEncoding; il.descartar.push(texQ);
  const matQ = new T.MeshBasicMaterial({ map: texQ }); il.descartar.push(matQ);
  [-4.2, -2.4].forEach((x) => lote.add(G3.caixa, montante, x, 0, 6.3, 0.07, 1.55, 0.07));
  caixa(g, 1.9, 1.15, 0.06, il.cores.escuro, -3.3, 0.5, 6.28);
  const pq = new T.Mesh(G3.placa, matQ); pq.scale.set(1.76, 1.1, 1); pq.position.set(-3.3, 1.075, 6.32); g.add(pq);
  [[-3.9, 7.25], [-3.3, 7.4], [-2.7, 7.25], [-4.35, 7.0]].forEach(([x, z]) => postos.push(ponto(x, z, Math.PI / 2, 'olhar', { dur: 16 })));
  postos.push(ponto(-2.1, 6.85, Math.PI * 0.85, 'conversar', { dur: 16 }));   // quem conduz a conversa
  // O kit do segmento: o que faz a cidade ter a cara do que a empresa faz
  (KITS[D.cena] || KITS.servicos)(H);
  (CENA_POSTOS[D.cena] || []).forEach(([x, z, rot, anim]) => H.pc(x, z, rot, anim));
  }
  postos.push(ponto(-1.9, 9.0, 0, 'varrer', { dur: 25 }), ponto(-1.0, -4.0, Math.PI, 'varrer', { dur: 25 }));
  lote.montar(g, il.descartar);
}
// Depois dos setores: quem visita fica na frente da porta; um posto de reunião em frente a cada setor
function postosDosSetores(il) {
  il.visitasLocais = [];
  il.setores.forEach((s) => {
    const z = s.lift ? (il.campusTelhado ? il.campusTelhado.z1 : -4) + 1.0 + (s.z < -6 ? 0.9 : 0) : s.z + 1.2;
    il.visitasLocais.push(ponto(s.x - 0.35, z, Math.PI / 2, 'tablet', { dur: 10, prop: 'prancheta' }));
    il.postosLocais.push(ponto(s.x + 0.42, z, Math.PI / 2, 'tablet', { dur: 18 }));
    if (!s.lift) il.portasLocais.push(ponto(s.x, s.z + 0.95, Math.PI / 2, 'olhar'));
  });
  // Porta do prédio principal da cena (o maior prédio da frente)
  const cx = new THREE.Box3(); let maior = null, area = 0;
  il.grupo.updateMatrixWorld(true);
  (il.grupoSegmento ? il.grupoSegmento.children : []).forEach((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.move) return;
    cx.setFromObject(o); const w = cx.max.x - cx.min.x, d = cx.max.z - cx.min.z;
    if (cx.max.y - cx.min.y < 1.4 || cx.min.y > 0.15 || w > 9) return;
    if (w * d > area) { area = w * d; maior = cx.clone(); }
  });
  if (maior) il.portasLocais.push(ponto((maior.min.x + maior.max.x) / 2, maior.max.z + 0.35, Math.PI / 2, 'olhar'));
}
// Posição no mundo: a quadra gira para o portão ficar de frente para a sede
function prepararPostos(il) {
  il.grupo.updateMatrixWorld(true);
  const m = il.grupo.matrixWorld, v = new THREE.Vector3(), giro = il.grupo.rotation.y;
  const mundo = (p) => { v.set(p.x, 0, p.z).applyMatrix4(m); return Object.assign({}, p, { x: v.x, z: v.z, rot: p.rot + giro, ocupado: null, falhas: 0 }); };
  il.postos = (il.postosLocais || []).map(mundo);
  il.visitas = (il.visitasLocais || []).map(mundo);
  il.portas = (il.portasLocais || []).map(mundo);
  il.portaCasa = mundo({ x: 0, z: CID_Z + 0.9, rot: -Math.PI / 2 });   // portão, do lado de fora: por onde se chega e se vai embora
  il.area = { x0: -CID_X + 0.6, x1: CID_X - 0.6, z0: -CID_Z + 0.6, z1: CID_Z - 0.6, mat: m.clone(), so: il.navDono };
  // Quem trabalha por dentro (galpão): os lugares e os corredores estão no sistema da cena (que cresceu)
  const R = CAMPUS_NOVO ? null : INTERNOS[il.dados.cena];
  if (R) {
    const inv = m.clone().invert(), w = new THREE.Vector3();
    const daCenaP = (p) => { const [x, z] = daCena(p.x, p.z); return Object.assign({}, p, { x, z }); };
    const paraCena = ([x, z]) => [x / ESC_CENA, (z - CENA_Z) / ESC_CENA];
    const praMundo = ([x, z]) => { const [a, b] = daCena(x, z); w.set(a, 0, b).applyMatrix4(m); return [w.x, w.z]; };
    const praLocal = (x, z) => { w.set(x, 0, z).applyMatrix4(inv); return [w.x, w.z]; };
    il.interno = { qtd: R.qtd, pontos: R.pontos.map(daCenaP).map(mundo), rota: (de, para) => R.rota(paraCena(praLocal(de[0], de[1])), paraCena(praLocal(para[0], para[1]))).map(praMundo) };
  } else il.interno = null;
}
/* Gente que trabalha por dentro do galpão (o telhado é de vidro): anda pelos corredores entre as
   estantes, pega a caixa na estante e leva até a porta da doca. Não usa o mapa de fora: o caminho
   é pelos corredores, que ficam entre as estantes. */
const INTERNOS = {
  distribuicao: {
    qtd: 3,
    pontos: [].concat(
      ...[-2.5, -1.7, -0.9, -0.1, 0.7].map((x, i) => [ponto(x, 0.2, i % 2 ? Math.PI / 2 : -Math.PI / 2, i % 2 ? 'agachar' : 'olhar', { dur: 6 }), ponto(x + 0.4, 1.0, i % 2 ? -Math.PI / 2 : Math.PI / 2, 'agachar', { dur: 6 }), ponto(x, 1.83, Math.PI / 2, 'olhar', { dur: 5 })]),
      [-2.3, -1.05, 0.2].map((x) => ponto(x, 1.93, -Math.PI / 2, 'carregar', { dur: 4, doca: true }))),
    rota(a, b) {
      if (Math.abs(a[1] - b[1]) < 0.2 || (a[1] > 1.7 && b[1] > 1.7)) return [a, b];
      const X = 1.26; return [a, [X, a[1]], [X, b[1]], b];   // corredor do fundo liga as fileiras
    }
  }
};

/* ---------- Montagem da cidade da empresa ---------- */
function montarIlha(D) {
  const T = THREE;
  materiaisDaVida();
  const il = { id: D.id, dados: D, cores: D.cores || CORES_PADRAO, animados: [], descartar: [], matsJanela: [], postes: [], fase: Math.random() * 6, pos: new T.Vector3() };
  il.grupo = new T.Group(); il.grupo.userData.ilha = D.id;
  // Borda acesa na cor da saúde da empresa, em volta da quadra
  const corSaude = COR_SAUDE[D.saude];
  il.matAro = new T.MeshStandardMaterial({ color: corSaude, emissive: corSaude, emissiveIntensity: 1.1, toneMapped: false }); il.descartar.push(il.matAro);
  [[0, CID_Z + 0.06, CID_X * 2 + 0.24, 0.07], [0, -CID_Z - 0.06, CID_X * 2 + 0.24, 0.07], [CID_X + 0.06, 0, 0.07, CID_Z * 2 + 0.24], [-CID_X - 0.06, 0, 0.07, CID_Z * 2 + 0.24]].forEach(([x, z, w, d]) => {
    const m = new T.Mesh(G3.caixa, il.matAro); m.scale.set(w, 0.05, d); m.position.set(x, -ALTURA_ILHA, z); m.userData.pisavel = true; il.grupo.add(m);
  });
  // A cidade (chão, cerca, portão, pátio, descanso), a cena do segmento e os prédios dos setores
  il.grupoCena = new T.Group(); il.grupo.add(il.grupoCena);
  // A cena do segmento fica num grupo próprio, 50% maior, no meio da quadra (é ela que dá a cara de longe)
  il.grupoSegmento = new T.Group(); il.grupoSegmento.scale.setScalar(ESC_CENA); il.grupoSegmento.position.z = CENA_Z; il.grupoCena.add(il.grupoSegmento);
  montarCidade(il, D);
  if (!CAMPUS_NOVO) {
    (CENA3D[D.cena] || CENA3D.servicos)(il.grupoSegmento, il, D);
    revestirCena(il, D);
    if (EXTRAS_DO_SEGMENTO[D.cena]) EXTRAS_DO_SEGMENTO[D.cena](il.grupoSegmento, il, D);
  }
  il.setores = new Map();
  (CAMPUS_NOVO ? (n) => lugaresNoTelhado(n, il) : lugaresNaCidade)(D.setores.length).forEach(([x, z], i) => predioSetor(il.grupoCena, il, x, z, D.setores[i]));
  if (CAMPUS_NOVO) il.setores.forEach((st) => { const y = (il.campusTelhado ? il.campusTelhado.h : 4) + 0.02; st.grupo.position.y = y; st.grupo.scale.setScalar(1.0); st.esc = 1.0; st.lift = y; });
  il.ocupado = areasOcupadas(il);
  sombrasDeContato(il);
  postosDosSetores(il);
  // Alvo invisível para o mouse achar a empresa
  il.alvo = new T.Mesh(new T.BoxGeometry(CID_X * 2, 7, CID_Z * 2), new T.MeshBasicMaterial({ visible: false }));
  il.alvo.position.y = 3.4; il.alvo.userData.ilha = D.id; il.grupo.add(il.alvo); il.descartar.push(il.alvo.geometry, il.alvo.material);
  // Brilho no chão em volta da quadra, na cor da saúde
  il.poca = new T.Mesh(new T.PlaneGeometry(CID_X * 2.7, CID_Z * 2.9), new T.MeshBasicMaterial({ map: CAMPO.texBrilho, color: corSaude, transparent: true, opacity: 0.12, depthWrite: false }));
  il.poca.rotation.x = -Math.PI / 2; il.poca.position.y = 0.006; il.descartar.push(il.poca.geometry, il.poca.material);
  /* Trilha de dados da sede até o portão (montada em montarMundo): os pulsos correm mais rápido
     quanto mais melhorias estão em andamento; passando o mouse na empresa, a trilha acende e os
     números aparecem em cima do portão. */
  il.texFluxo = CAMPO.texFluxo.clone(); il.texFluxo.needsUpdate = true; il.descartar.push(il.texFluxo);
  il.matFluxo = new T.MeshBasicMaterial({ map: il.texFluxo, vertexColors: true, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }); il.descartar.push(il.matFluxo);
  il.velFluxo = 0.25 + Math.min(4, D.andamento) * 0.22;
  il.rotuloPonte = document.createElement('div'); il.rotuloPonte.className = 'ponte-rotulo';
  il.rotuloPonte.innerHTML = `<span class="pr-ida">${icone('seta')}${plural(D.andamento, 'melhoria em andamento', 'melhorias em andamento')}</span><span class="pr-volta">${icone('ok')}${plural(D.entregues, 'entregue', 'entregues')}${D.horas ? ' · ' + fmtHoras(D.horas) + ' h/mês' : ''}</span>`;
  CAMPO.rotulos.appendChild(il.rotuloPonte);
  il.grupo.traverse((o) => { o.userData.ilha = D.id; });
  CAMPO.cena.add(il.grupo); CAMPO.cena.add(il.poca);
  il.plaquinha = criarPlaquinha(D);
  return il;
}
/* ---------- Mapa de onde dá para andar ----------
   O chão é dividido em quadradinhos de meio metro. Cada um diz:
   - se dá para pisar (paredes, prédios, móveis e cercas não dão; portas e portões dão);
   - de quem é: 0 = área livre (piso branco e o hall da Real Forte), k = só a empresa k pisa ali
     (a cidade de cada empresa é só dela; os consultores da Real Forte entram em todas).
   Com isso cada pessoa acha o próprio caminho na hora (busca A*), e o caminho é "alisado"
   para virar curvas e diagonais naturais, não um zigue-zague de grade. */
const NAV = { cel: 0.5 };
const DONO_RF = 254;   // consultores da Real Forte: entram em qualquer empresa
function criarNav(limite) {
  NAV.lim = limite; NAV.x0 = -limite; NAV.z0 = -limite;
  NAV.n = Math.ceil((limite * 2) / NAV.cel);
  const N = NAV.n * NAV.n;
  NAV.livre = new Uint8Array(N).fill(1);
  NAV.dono = new Uint8Array(N);
  NAV.alt = new Float32Array(N);
  NAV.g = new Float32Array(N); NAV.veio = new Int32Array(N); NAV.marca = new Uint32Array(N); NAV.fechado = new Uint32Array(N); NAV.geracao = 1;
  NAV.heap = new Int32Array(N); NAV.f = new Float32Array(N);
}
const navI = (x, z) => { const i = Math.floor((x - NAV.x0) / NAV.cel), j = Math.floor((z - NAV.z0) / NAV.cel); return i < 0 || j < 0 || i >= NAV.n || j >= NAV.n ? -1 : j * NAV.n + i; };
const navX = (k) => NAV.x0 + ((k % NAV.n) + 0.5) * NAV.cel;
const navZ = (k) => NAV.z0 + (Math.floor(k / NAV.n) + 0.5) * NAV.cel;
const podePisar = (k, dono) => k >= 0 && NAV.livre[k] === 1 && (NAV.dono[k] === 0 || NAV.dono[k] === dono || dono === DONO_RF);
const alturaEm = (x, z) => { const k = navI(x, z); return k < 0 ? 0 : NAV.alt[k]; };
// Marca um retângulo que gira (em coordenadas locais de um grupo): fn(k) para cada quadradinho dentro
function navRetangulo(matriz, x0, x1, z0, z1, folga, fn) {
  const inv = new THREE.Matrix4().copy(matriz).invert(), v = new THREE.Vector3();
  const cantos = [[x0 - folga, z0 - folga], [x1 + folga, z0 - folga], [x0 - folga, z1 + folga], [x1 + folga, z1 + folga]].map(([x, z]) => v.set(x, 0, z).applyMatrix4(matriz).clone());
  const mx0 = Math.min(...cantos.map((c) => c.x)), mx1 = Math.max(...cantos.map((c) => c.x)), mz0 = Math.min(...cantos.map((c) => c.z)), mz1 = Math.max(...cantos.map((c) => c.z));
  for (let z = mz0; z <= mz1 + NAV.cel; z += NAV.cel) for (let x = mx0; x <= mx1 + NAV.cel; x += NAV.cel) {
    const k = navI(x, z); if (k < 0) continue;
    v.set(navX(k), 0, navZ(k)).applyMatrix4(inv);
    if (v.x >= x0 - folga && v.x <= x1 + folga && v.z >= z0 - folga && v.z <= z1 + folga) fn(k);
  }
}
const navBloquear = (matriz, x0, x1, z0, z1, folga) => navRetangulo(matriz, x0, x1, z0, z1, folga == null ? 0.22 : folga, (k) => { NAV.livre[k] = 0; });
const navLiberar = (matriz, x0, x1, z0, z1) => navRetangulo(matriz, x0, x1, z0, z1, 0, (k) => { NAV.livre[k] = 1; });
// Linha reta livre entre dois pontos (para alisar o caminho)
function linhaLivre(ax, az, bx, bz, dono) {
  // Confere de 10 em 10 cm no meio e dos dois lados (a pessoa tem largura): não raspa quina de parede
  const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / 0.1));
  const ox = -(bz - az) / (d || 1) * 0.18, oz = (bx - ax) / (d || 1) * 0.18;
  for (let s = 0; s <= n; s++) {
    const t = s / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    if (!podePisar(navI(x, z), dono) || !podePisar(navI(x + ox, z + oz), dono) || !podePisar(navI(x - ox, z - oz), dono)) return false;
  }
  return true;
}
// O quadradinho livre mais perto de um ponto
function pontoLivre(x, z, dono) {
  const k0 = navI(x, z); if (podePisar(k0, dono)) return k0;
  for (let r = 1; r < 14; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
    const k = navI(x + dx * NAV.cel, z + dz * NAV.cel); if (podePisar(k, dono)) return k;
  }
  return -1;
}
// Busca A* (8 direções) e depois alisa: de cada ponto pula para o mais longe que se vê em linha reta
function acharCaminho(ax, az, bx, bz, dono, limiteNos) {
  const ini = pontoLivre(ax, az, dono), fim = pontoLivre(bx, bz, dono);
  NAV.nos = 0;
  if (ini < 0 || fim < 0) return null;
  const n = NAV.n, ger = ++NAV.geracao, H = NAV.heap, F = NAV.f, G = NAV.g;
  const fx = fim % n, fz = Math.floor(fim / n);
  const h = (k) => { const dx = Math.abs((k % n) - fx), dz = Math.abs(Math.floor(k / n) - fz); return (dx + dz) + (1.4142 - 2) * Math.min(dx, dz); };
  let tam = 0;
  const pushH = (k) => { let i = tam++; H[i] = k; while (i > 0) { const p = (i - 1) >> 1; if (F[H[p]] <= F[H[i]]) break; const t = H[p]; H[p] = H[i]; H[i] = t; i = p; } };
  const popH = () => { const top = H[0]; H[0] = H[--tam]; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < tam && F[H[l]] < F[H[m]]) m = l; if (r < tam && F[H[r]] < F[H[m]]) m = r; if (m === i) break; const t = H[m]; H[m] = H[i]; H[i] = t; i = m; } return top; };
  NAV.marca[ini] = ger; G[ini] = 0; F[ini] = h(ini); NAV.veio[ini] = -1; pushH(ini);
  const viz = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
  let nos = 0, achou = false;
  while (tam && nos++ < (limiteNos || 26000)) {
    const k = popH(); if (k === fim) { achou = true; break; }
    if (NAV.fechado[k] === ger) continue; NAV.fechado[k] = ger;
    const kx = k % n, kz = Math.floor(k / n);
    for (const [dx, dz, c] of viz) {
      const x = kx + dx, z = kz + dz; if (x < 0 || z < 0 || x >= n || z >= n) continue;
      const v = z * n + x; if (!podePisar(v, dono)) continue;
      if (dx && dz && (!podePisar(kz * n + x, dono) || !podePisar(z * n + kx, dono))) continue;   // não corta quina de parede
      const g = G[k] + c;
      if (NAV.marca[v] !== ger || g < G[v]) { NAV.marca[v] = ger; G[v] = g; F[v] = g + h(v); NAV.veio[v] = k; pushH(v); }
    }
  }
  NAV.nos = nos;
  if (!achou) return null;
  const celulas = []; for (let k = fim; k !== -1; k = NAV.veio[k]) celulas.push(k);
  celulas.reverse();
  // Alisar
  const pts = [[ax, az]];
  let i = 0;
  while (i < celulas.length - 1) {
    let j = celulas.length - 1; const [px, pz] = pts[pts.length - 1];
    while (j > i + 1 && !linhaLivre(px, pz, navX(celulas[j]), navZ(celulas[j]), dono)) j--;
    pts.push([navX(celulas[j]), navZ(celulas[j])]); i = j;
  }
  if (linhaLivre(pts[pts.length - 1][0], pts[pts.length - 1][1], bx, bz, dono)) pts[pts.length - 1] = [bx, bz];
  return pts;
}

/* ---------- Multidão ----------
   Todas as pessoas que andam pelo mundo são desenhadas juntas: cada parte do corpo (tronco, cabeça,
   cabelo, braços, pernas, crachá...) é uma peça só repetida para todo mundo (InstancedMesh), pintada
   com a cor de cada um. Assim cabe muita gente sem pesar.
   Cada pessoa tem uma rotina: trabalhar num posto da sua empresa, andar pela própria cidade, ir ao hall
   da Real Forte tomar café, ver os telões, sentar no lounge, conversar com quem encontra. Ela escolhe o
   destino e acha o caminho sozinha (sempre por onde dá para pisar, entrando e saindo pelas portas),
   faz curvas suaves, desvia de quem está na frente e, à noite, a maioria vai embora. */
const MULTIDAO_MAX = 520;
const PARTES = ['roupa', 'detalhe', 'cracha', 'calca', 'pele', 'cabelo', 'capacete', 'pernaE', 'pernaD', 'bracoE', 'bracoD', 'maoE', 'maoD', 'prancheta', 'caixa', 'tablet', 'xicara', 'lanterna', 'facho'];
function geometriaDasPartes() {
  formasDeGente();
  const P = {};
  const f = (lista) => { const g = fundir(lista.map((x) => Object.assign({ cor: 0xffffff }, x))); return g; };
  P.roupa = f([{ geo: G3.membro, p: [0, 0.43, 0], esc: [0.072, 0.045, 0.088] }, { geo: G3.cubo, p: [0, 0.505, 0], esc: [0.11, 0.025, 0.17] }]);
  P.detalhe = f([{ geo: G3.cubo, p: [0.035, 0.515, 0], esc: [0.05, 0.018, 0.09] }, { geo: G3.cubo, p: [0.07, 0.49, 0.035], esc: [0.004, 0.05, 0.004] }, { geo: G3.cubo, p: [0.073, 0.452, 0.035], esc: [0.006, 0.01, 0.03] }]);
  P.cracha = f([{ geo: G3.cubo, p: [0.072, 0.43, 0.035], esc: [0.006, 0.042, 0.03] }]);
  P.calca = f([{ geo: G3.cubo, p: [0, 0.33, 0], esc: [0.125, 0.04, 0.165] }]);
  P.pele = f([{ geo: G3.membro, p: [0, 0.545, 0], esc: [0.022, 0.012, 0.022] }, { geo: G3.esfera, p: [0.004, 0.615, 0], esc: [0.058, 0.064, 0.055] }, { geo: G3.esfera, p: [0.05, 0.612, 0], esc: [0.012, 0.016, 0.012] }]);
  P.cabelo = f([{ geo: G3.meiaEsfera, p: [-0.006, 0.628, 0], esc: [0.063, 0.058, 0.06] }, { geo: G3.esfera, p: [-0.03, 0.6, 0], esc: [0.04, 0.045, 0.056] }]);
  P.capacete = f([{ geo: G3.meiaEsfera, p: [0, 0.632, 0], esc: [0.07, 0.06, 0.07] }, { geo: G3.cubo, p: [0.05, 0.635, 0], esc: [0.05, 0.006, 0.1] }]);
  P.perna = fundir([{ geo: G3.membro, p: [0, -0.13, 0], esc: [0.032, 0.085, 0.034], cor: 0xffffff }, { geo: G3.cubo, p: [0.018, -0.29, 0], esc: [0.075, 0.03, 0.045], cor: 0x2a2a30 }]);
  P.braco = f([{ geo: G3.membro, p: [0, -0.085, 0], esc: [0.024, 0.058, 0.024] }]);
  P.mao = f([{ geo: G3.esfera, p: [0, -0.19, 0], esc: [0.022, 0.024, 0.02] }]);
  P.prancheta = fundir([{ geo: G3.cubo, p: [0.13, 0.31, 0.06], esc: [0.014, 0.15, 0.11], cor: 0x8a5a2b }, { geo: G3.cubo, p: [0.136, 0.32, 0.06], esc: [0.006, 0.13, 0.095], cor: 0xffffff }, { geo: G3.cubo, p: [0.136, 0.39, 0.06], esc: [0.008, 0.02, 0.045], cor: 0xd9681a }]);
  P.caixa = f([{ geo: G3.cubo, p: [0.13, 0.38, 0], esc: [0.13, 0.11, 0.15] }]);
  P.tablet = f([{ geo: G3.cubo, p: [0.12, 0.42, 0.03], esc: [0.07, 0.008, 0.11], r: [0, 0, 0.5] }]);
  P.xicara = f([{ geo: G3.membro, p: [0.02, -0.2, 0], esc: [0.016, 0.008, 0.016] }]);
  P.lanterna = f([{ geo: G3.membro, p: [0.03, -0.21, 0], esc: [0.016, 0.03, 0.016] }]);
  P.facho = new THREE.PlaneGeometry(1.25, 0.9).rotateX(-Math.PI / 2).translate(0.95, 0.01, 0);
  return P;
}
function criarMultidao() {
  const T = THREE, geo = geometriaDasPartes();
  const M = { meshes: {}, logos: new Map(), agentes: [], grupo: new T.Group(), postosSede: [], hash: new Map() };
  const mat = new T.MeshStandardMaterial({ roughness: 0.62, metalness: 0.02 });
  const matVC = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.02 });
  const fixo = { cracha: 0xffffff, caixa: COR3D.papelao, tablet: 0x1a2233, xicara: 0xffffff, lanterna: 0xfff2b0, facho: 0xffe2a0 };
  PARTES.forEach((p) => {
    const g = p.startsWith('perna') ? geo.perna : p.startsWith('braco') ? geo.braco : p.startsWith('mao') ? geo.mao : geo[p];
    let m = p.startsWith('perna') || p === 'prancheta' ? matVC : mat;
    if (fixo[p] != null) m = new T.MeshStandardMaterial({ color: fixo[p], roughness: 0.5, emissive: p === 'tablet' ? 0x3a7bd5 : 0x000000, emissiveIntensity: p === 'tablet' ? 0.6 : 0 });
    if (p === 'lanterna') m = new T.MeshBasicMaterial({ color: fixo[p], toneMapped: false });
    if (p === 'facho') m = new T.MeshBasicMaterial({ map: CAMPO.texBrilho, color: fixo[p], transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
    const im = new T.InstancedMesh(g, m, MULTIDAO_MAX);
    im.instanceMatrix.setUsage(T.DynamicDrawUsage); im.frustumCulled = false; im.count = 0;
    im.castShadow = ['roupa', 'calca', 'pele', 'pernaE', 'pernaD', 'caixa'].includes(p); im.receiveShadow = false;
    if (fixo[p] == null && p !== 'prancheta') { im.setColorAt(0, new T.Color(0xffffff)); im.instanceColor.setUsage(T.DynamicDrawUsage); }
    M.grupo.add(im); M.meshes[p] = im;
  });
  M.tmp = { B: new T.Matrix4(), L: new T.Matrix4(), q: new T.Quaternion(), v: new T.Vector3(), s: new T.Vector3(), c: new T.Color(), eixoY: new T.Vector3(0, 1, 0), eixoZ: new T.Vector3(0, 0, 1),
    pernaE: new T.Matrix4().makeTranslation(0, 0.31, -0.042), pernaD: new T.Matrix4().makeTranslation(0, 0.31, 0.042), bracoE: new T.Matrix4().makeTranslation(0, 0.5, -0.105), bracoD: new T.Matrix4().makeTranslation(0, 0.5, 0.105), R: new T.Matrix4() };
  M.zero = new T.Matrix4().makeScale(0, 0, 0);
  CAMPO.cena.add(M.grupo);
  return M;
}
function logoDaMultidao(M, logo, prop) {
  if (!logo) return null;
  if (!M.logos.has(logo)) {
    const m = matLogoRoupa(logo), g = new THREE.PlaneGeometry(1, 1);
    g.scale(0.11, 0.11 / (prop || 3.4), 1); g.rotateY(-Math.PI / 2); g.translate(-0.074, 0.46, 0);
    const im = new THREE.InstancedMesh(g, m, MULTIDAO_MAX); im.frustumCulled = false; im.count = 0; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    M.grupo.add(im); M.logos.set(logo, im);
  }
  return M.logos.get(logo);
}
// Desenha todo mundo neste quadro
function desenharMultidao(M) {
  const T = M.tmp, n = {}; PARTES.forEach((p) => { n[p] = 0; }); M.logos.forEach((im) => { im.count = 0; });
  const por = (p, mat, cor) => { const im = M.meshes[p], i = n[p]++; im.setMatrixAt(i, mat); if (cor != null && im.instanceColor) im.setColorAt(i, T.c.setHex(cor)); };
  M.agentes.forEach((a) => {
    if (!a.visivel) return;
    T.q.setFromAxisAngle(T.eixoY, a.rot); T.B.compose(T.v.set(a.x, a.y + (a.dyVista != null ? a.dyVista : a.dy || 0), a.z), T.q, T.s.setScalar(a.esc));
    const L = a.look, P = a.poseVista || a.pose, lanterna = L.vigia && M.noite > 0.25;
    por('roupa', T.B, L.roupa); por('detalhe', T.B, L.detalhe); por('cracha', T.B); por('calca', T.B, L.calca); por('pele', T.B, L.pele);
    if (L.capacete) por('capacete', T.B, L.capacete); else if (L.cabelo) por('cabelo', T.B, L.cabelo);
    [['pernaE', P.pernaE], ['pernaD', P.pernaD]].forEach(([p, ang]) => { T.L.multiplyMatrices(T.B, T[p]).multiply(T.R.makeRotationZ(ang)); por(p, T.L, L.calca); });
    [['bracoE', 'maoE', P.bracoE], ['bracoD', 'maoD', lanterna ? 0.85 : P.bracoD]].forEach(([p, m, ang]) => { T.L.multiplyMatrices(T.B, T[p]).multiply(T.R.makeRotationZ(ang)); por(p, T.L, L.roupa); por(m, T.L, L.pele); if (p === 'bracoD' && P.prop === 'xicara') por('xicara', T.L); if (p === 'bracoD' && lanterna) por('lanterna', T.L); });
    if (lanterna) por('facho', T.B);   // o círculo de luz da lanterna no chão, na frente
    if (P.prop === 'prancheta' || (L.prancheta && P.prop !== 'xicara')) por('prancheta', T.B);
    if (P.prop === 'caixa') por('caixa', T.B); if (P.prop === 'tablet') por('tablet', T.B);
    const lg = L.logoMesh; if (lg) { lg.setMatrixAt(lg.count++, T.B); }
  });
  PARTES.forEach((p) => { const im = M.meshes[p]; im.count = n[p]; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; });
  M.logos.forEach((im) => { im.instanceMatrix.needsUpdate = true; });
}

/* ---------- Gente com rotina ---------- */
const ANIMS = {
  // Pose de cada atividade: pernas, braços e o que tem na mão
  digitar: (t, f) => ({ pernaE: Math.PI / 2, pernaD: Math.PI / 2, bracoE: 1.1 + Math.sin(t * 12 + f) * 0.06, bracoD: 1.1 + Math.sin(t * 12 + f + 1.7) * 0.06, dy: -0.02 }),
  sentar: (t, f) => ({ pernaE: Math.PI / 2, pernaD: Math.PI / 2, bracoE: 0.35, bracoD: 0.35 + Math.max(0, Math.sin(t * 0.9 + f)) * 0.6, dy: -0.02 }),
  cafe: (t, f) => ({ pernaE: Math.PI / 2, pernaD: Math.PI / 2, bracoE: 0.35, bracoD: 0.9 + Math.max(0, Math.sin(t * 0.8 + f)) * 0.8, dy: -0.02, prop: 'xicara' }),
  emPeCafe: (t, f) => ({ pernaE: 0, pernaD: 0, bracoE: 0.1, bracoD: 0.9 + Math.max(0, Math.sin(t * 0.8 + f)) * 0.8, prop: 'xicara' }),
  olhar: (t, f) => ({ pernaE: 0, pernaD: 0, bracoE: 0.15 + Math.sin(t * 0.5 + f) * 0.05, bracoD: 0.15, dy: 0 }),
  tablet: (t, f) => ({ pernaE: 0, pernaD: 0, bracoE: 0.9, bracoD: 0.9 + Math.sin(t * 2 + f) * 0.05, prop: 'tablet' }),
  carregar: (t, f) => ({ pernaE: 0, pernaD: 0, bracoE: 1.2, bracoD: 1.2, prop: 'caixa' }),
  martelar: (t, f) => ({ pernaE: 0.15, pernaD: -0.15, bracoE: 0.6, bracoD: 1.0 + Math.abs(Math.sin(t * 6 + f)) * 1.3 }),
  varrer: (t, f) => ({ pernaE: Math.sin(t * 2 + f) * 0.15, pernaD: -Math.sin(t * 2 + f) * 0.15, bracoE: 0.9 + Math.sin(t * 3 + f) * 0.35, bracoD: 0.9 - Math.sin(t * 3 + f) * 0.35 }),
  agachar: (t, f) => ({ pernaE: 1.1, pernaD: 1.1, bracoE: 1.2 + Math.sin(t * 3 + f) * 0.2, bracoD: 1.2 + Math.cos(t * 3 + f) * 0.2, dy: -0.1 }),
  operar: (t, f) => ({ pernaE: 0, pernaD: 0, bracoE: 1.0 + Math.sin(t * 1.5 + f) * 0.1, bracoD: 1.0 + Math.cos(t * 1.7 + f) * 0.15 }),
  conversar: (t, f) => ({ pernaE: 0, pernaD: 0, bracoE: 0.2 + Math.max(0, Math.sin(t * 2.3 + f)) * 0.7, bracoD: 0.15 + Math.max(0, Math.sin(t * 1.9 + f + 2)) * 0.5 }),
  parado: (t, f) => ({ pernaE: 0, pernaD: 0, bracoE: 0.08 + Math.sin(t + f) * 0.03, bracoD: 0.08, dy: 0 })
};
const ang180 = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// Cria uma pessoa. tipo: 'func' (funcionário de uma empresa), 'rf' (equipe da Real Forte no hall), 'consultor'
function novoAgente(M, o) {
  const sorte = o.sorte || Math.random;
  const a = Object.assign({ x: 0, z: 0, y: 0, rot: sorte() * 6.28, v: 0, vBase: 0.5 + sorte() * 0.28, esc: 1.32 * (0.94 + sorte() * 0.1), fase: sorte() * 6, estado: 'pensando', t: sorte() * 2, caminho: null, ip: 0,
    ultimaConversa: -30, visivel: false, ativo: false, limiar: 0.1 + sorte() * 0.85, pose: ANIMS.parado(0, 0) }, o);
  a.look.logoMesh = a.look.logo ? logoDaMultidao(M, a.look.logo, a.look.proporcaoLogo) : null;
  M.agentes.push(a);
  return a;
}
// Lugares (postos de trabalho, mesas do café, sofás, telões...): cada um guarda quem está usando
function ponto(x, z, rot, anim, extra) { return Object.assign({ x, z, rot, anim, ocupado: null }, extra || {}); }
function livreDe(lista, a) { const l = lista.filter((p) => !p.ocupado && !(p.falhas >= 2) && podePisar(navI(p.x, p.z), a.dono)); return l.length ? l[Math.floor(Math.random() * l.length)] : null; }
function soltarPonto(a) { if (a.lugar) { a.lugar.ocupado = null; a.lugar = null; } }
// Ponto qualquer onde dá para andar numa área (para passear sem destino certo)
function pontoAleatorio(area, dono) {
  for (let k = 0; k < 24; k++) {
    const x = area.x0 + Math.random() * (area.x1 - area.x0), z = area.z0 + Math.random() * (area.z1 - area.z0);
    const p = area.mat ? new THREE.Vector3(x, 0, z).applyMatrix4(area.mat) : { x, z };
    const kk = navI(p.x, p.z); if (podePisar(kk, dono) && (!area.so || NAV.dono[kk] === area.so)) return [p.x, p.z];
  }
  return null;
}
// Escolhe o que fazer agora
function escolherTarefa(M, a) {
  const anterior = a.lugar;
  soltarPonto(a);
  if (a.tipo === 'interno') return tarefaInterna(M, a, anterior);
  if (a.tipo === 'vigia') return tarefaVigia(M, a);
  if (a.tipo === 'noturno') return tarefaNoturna(M, a);
  if (a.tipo === 'equipe') return tarefaEquipe(M, a);
  if (a.tipo === 'obra') return tarefaObra(M, a);
  if (a.tipo === 'visitante') return tarefaVisitante(M, a);
  const A = CAMPO.atividade == null ? 1 : CAMPO.atividade, il = a.il && CAMPO.ilhas.get(a.il);
  if (a.limiar > A + 0.04) { const porta = a.portaCasa; if (porta) return irAte(M, a, porta.x, porta.z, { tipo: 'embora' }); }
  const r = Math.random();
  const hall = M.postosSede;
  if (a.tipo === 'func' && il) {
    if (r < 0.56) { const p = livreDe(il.postos || [], a); if (p) return irAte(M, a, p.x, p.z, { tipo: 'posto', lugar: p }); }
    if (r < 0.64) { const q = destinoFora(M, a); if (q) return q; }   // sai da quadra: praça, centro de diagnóstico, estação
    if (r < 0.74) {
      // Às vezes sai para a calçada de fora: dá uma volta ou senta num banco
      if (Math.random() < 0.3 && il.calcadaPts && il.calcadaPts.length) {
        const b = Math.random() < 0.5 && livreDe(il.bancosFora || [], a); if (b) return irAte(M, a, b.x, b.z, { tipo: 'posto', lugar: b });
        const q = il.calcadaPts[Math.floor(Math.random() * il.calcadaPts.length)]; return irAte(M, a, q[0], q[1], { tipo: 'passear' });
      }
      const q = pontoAleatorio(il.area, a.dono); if (q) return irAte(M, a, q[0], q[1], { tipo: 'passear' });
    }
    if (r < 0.74 + 0.08 * A) return irAoHall(M, a);
    if (r < 0.9) { const q = irAPraca(M, a); if (q) return q; }   // de dia, uma em cada quatro saídas é para o hall da Real Forte
    const q = pontoAleatorio(M.areaPraca, a.dono); if (q) return irAte(M, a, q[0], q[1], { tipo: 'passear' });
  }
  if (a.tipo === 'consultor') {
    if (a.emCampo) { a.emCampo = false; return (Math.random() < 0.6 && irAoCentro(M, a, sortearChave([['diag', 3], ['estr', 2], ['apres', 2], ['perf', 1]]))) || irAoHall(M, a); }
    const ilhas = [...CAMPO.ilhas.values()]; const alvo = ilhas.length ? ilhas[Math.floor(Math.random() * ilhas.length)] : null;
    const p = alvo && livreDe(alvo.visitas || [], a);
    if (p && r < 0.5) { a.emCampo = true; a.ilVisita = alvo.id; return irAte(M, a, p.x, p.z, { tipo: 'visita', lugar: p }); }
    if (r < 0.82) { const q = irAoCentro(M, a, sortearChave([['diag', 3], ['estr', 2], ['apres', 2], ['ia', 1]])); if (q) return q; }
    if (r < 0.92) { const q = irAEstacao(M, a); if (q) return q; }
    return irAoHall(M, a);
  }
  // Equipe da Real Forte no hall
  if (r < 0.15 && M.elevadores.length) { const e = M.elevadores[Math.floor(Math.random() * M.elevadores.length)]; return irAte(M, a, e.x, e.z, { tipo: 'elevador' }); }
  if (r < 0.24) { const q = irAoCentro(M, a, Math.random() < 0.6 ? 'sedeFora' : 'conexoes'); if (q) return q; }
  if (r < 0.3) { const q = pontoAleatorio(M.areaPraca, a.dono); if (q) return irAte(M, a, q[0], q[1], { tipo: 'passear' }); }
  return irAoHall(M, a);
}
// Dentro do galpão: pega a caixa numa estante e leva até a doca (pelos corredores)
function tarefaInterna(M, a, anterior) {
  const il = CAMPO.ilhas.get(a.il), R = il && il.interno;
  const A = CAMPO.atividade == null ? 1 : CAMPO.atividade;
  if (!R) { a.estado = 'parado'; a.t = 5; return true; }
  if (a.limiar > A + 0.04) { a.estado = 'sumido'; a.visivel = false; a.t = 5; return true; }
  if (anterior) a.temCaixa = !anterior.doca;
  const opcoes = R.pontos.filter((p) => !p.ocupado && (a.temCaixa ? p.doca : !p.doca));
  const p = opcoes[Math.floor(Math.random() * opcoes.length)];
  if (!p) { a.estado = 'parado'; a.t = 2; return true; }
  p.ocupado = a; a.lugar = p; a.tarefa = { tipo: 'posto', lugar: p }; a.destino = [p.x, p.z];
  a.caminho = R.rota([a.x, a.z], [p.x, p.z]); a.ip = 1; a.estado = 'andando';
  a.levando = a.temCaixa ? 'caixa' : null;
  return true;
}
// No hall: fila do café, mesa, sofá, telões, arquibancada da RF Intelligence ou a sala de reunião
function irAoHall(M, a) {
  const H = M.hall, r = Math.random();
  const listas = r < 0.42 ? [H.fila] : r < 0.6 ? [H.telas] : r < 0.75 ? [H.sofas] : r < 0.87 ? [H.arena] : r < 0.95 ? [H.reuniao] : [H.empe];
  for (const l of listas.concat([H.empe, H.telas, H.sofas])) { const p = livreDe(l, a); if (p) return irAte(M, a, p.x, p.z, { tipo: l === H.fila ? 'fila' : 'hall', lugar: p }); }
  const q = pontoAleatorio(M.areaHall, a.dono); if (q) return irAte(M, a, q[0], q[1], { tipo: 'passear' });
  a.estado = 'parado'; a.t = 3; return true;
}
// Pede o caminho até lá (no máximo algumas buscas por quadro, para não travar)
function irAte(M, a, x, z, tarefa) {
  if (tarefa.lugar) { tarefa.lugar.ocupado = a; a.lugar = tarefa.lugar; }
  a.tarefa = tarefa; a.destino = [x, z]; a.estado = 'pedindo'; M.fila = M.fila || []; M.fila.push(a);
  return true;
}
function resolverCaminhos(M) {
  let feitos = 0, nos = 0;
  while (M.fila && M.fila.length && feitos < 5 && nos < 30000) {
    const a = M.fila.shift(); if (a.estado !== 'pedindo') continue;
    feitos++;
    const c = acharCaminho(a.x, a.z, a.destino[0], a.destino[1], a.dono);
    nos += NAV.nos || 0;
    if (!c || c.length < 1) { if (a.lugar) a.lugar.falhas = (a.lugar.falhas || 0) + 1; soltarPonto(a); a.estado = 'parado'; a.t = 1 + Math.random() * 2; continue; }
    a.caminho = c; a.ip = 1; a.estado = 'andando'; a.melhor = null; a.semAvanco = 0;
    if (c.length === 1) { a.ip = 0; }
  }
}
// Chegou ao destino: começa a atividade do lugar
function chegou(M, a) {
  const tf = a.tarefa || {}; const l = a.lugar;
  if (tf.tipo === 'embora' || tf.tipo === 'elevador' || tf.tipo === 'entrar') { a.estado = 'sumido'; a.visivel = false; a.t = tf.tipo === 'embora' ? 5 : 10 + Math.random() * 25; if (tf.rot != null) a.rot = tf.rot + Math.PI; return; }
  if (tf.tipo === 'fila') {
    // Pega o café no balcão e vai para uma mesa, um sofá ou fica em pé conversando
    a.estado = 'atividade'; a.anim = 'olhar'; a.t = 2.5 + Math.random() * 3; a.rot = l ? l.rot : a.rot;
    a.depois = () => { soltarPonto(a); a.comCafe = true; const H = M.hall; const p = livreDe(H.mesas, a) || livreDe(H.sofas, a) || livreDe(H.empe, a); if (p) irAte(M, a, p.x, p.z, { tipo: 'hall', lugar: p }); else escolherTarefa(M, a); };
    return;
  }
  if (l) { a.rot = l.rot; a.anim = l.anim === 'sentar' && a.comCafe ? 'cafe' : l.anim === 'olhar' && a.comCafe ? 'emPeCafe' : l.anim; a.estado = 'atividade'; a.t = (l.dur || 14) * (0.7 + Math.random() * 0.8); if (tf.tipo === 'visita') a.t = 9 + Math.random() * 6; return; }
  a.estado = 'atividade'; a.anim = 'olhar'; a.t = 2 + Math.random() * 4;
}
// Na apresentação nada de outro cliente aparece: nem a gente dele, nem quem está dentro da cidade dele
function visivelNaApresentacao(a) {
  const ap = CAMPO.ap; if (!ap) return true;
  if (a.il) return a.il === ap.id;
  const d = NAV.dono[navI(a.x, a.z)], il = CAMPO.ilhas.get(ap.id);
  return !d || (il && d === il.navDono);
}
// A pose que aparece vai até a pose pedida em vez de pular (andando a troca é rápida; sentar e levantar levam ~0,3 s)
function misturarPose(a, dt) {
  const alvo = a.pose, v = a.poseVista || (a.poseVista = { pernaE: alvo.pernaE, pernaD: alvo.pernaD, bracoE: alvo.bracoE, bracoD: alvo.bracoD });
  const k = Math.min(1, dt * (a.estado === 'andando' ? 22 : 9));
  ['pernaE', 'pernaD', 'bracoE', 'bracoD'].forEach((p) => { v[p] += ((alvo[p] || 0) - v[p]) * k; });
  v.prop = alvo.prop; a.dyVista = (a.dyVista || 0) + ((a.dy || 0) - (a.dyVista || 0)) * k;
}
// Um quadro da multidão
function passoMultidao(M, t, dt) {
  if (!M) return;
  resolverCaminhos(M);
  const A = CAMPO.atividade == null ? 1 : CAMPO.atividade;
  M.noite = noiteAgora();
  if (M.meshes.facho) M.meshes.facho.material.opacity = 0.5 * M.noite;
  // Vizinhança (para desviar e para encontrar alguém para conversar)
  M.hash.clear();
  M.agentes.forEach((a) => { if (!a.visivel || a.semNav) return; const k = Math.floor(a.x) * 4096 + Math.floor(a.z); if (!M.hash.has(k)) M.hash.set(k, []); M.hash.get(k).push(a); });
  const vizinhos = (a, cb) => { const cx = Math.floor(a.x), cz = Math.floor(a.z); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = M.hash.get((cx + i) * 4096 + cz + j); if (l) l.forEach((b) => { if (b !== a) cb(b); }); } };
  M.agentes.forEach((a) => {
    const ok = a.soNoite ? A < 0.6 : a.limiar < A;   // manutenção e limpeza só trabalham de noite
    if (a.estado === 'sumido') {
      a.t -= dt; a.visivel = false;
      if (a.t <= 0 && ok) { const p = a.desembarque || (a.tarefa && (a.tarefa.tipo === 'elevador' || a.tarefa.tipo === 'entrar') ? a : a.portaCasa); a.desembarque = null; if (p) { a.x = p.x; a.z = p.z; } a.tarefa = null; a.visivel = true; escolherTarefa(M, a); }
      return;
    }
    if (!a.ativo) { a.ativo = true; }
    a.visivel = visivelNaApresentacao(a);
    const f = a.fase;
    if (a.estado === 'andando' && a.caminho) {
      const alvo = a.caminho[Math.min(a.ip, a.caminho.length - 1)];
      const dx = alvo[0] - a.x, dz = alvo[1] - a.z, dist = Math.hypot(dx, dz);
      const ultimo = a.ip >= a.caminho.length - 1;
      // Sem avançar há 3 s (alguém parado no caminho, ou desviou demais): perto do fim já conta como chegou; senão refaz o caminho dali
      if (a.melhor == null || dist < a.melhor - 0.1) { a.melhor = dist; a.semAvanco = 0; } else a.semAvanco = (a.semAvanco || 0) + dt;
      if (a.semAvanco > 3) { a.semAvanco = 0; a.melhor = null; if (ultimo && dist < 0.9) { a.v = 0; chegou(M, a); } else irAte(M, a, a.destino[0], a.destino[1], a.tarefa || {}); }
      else if (dist < 0.12 || (!ultimo && dist < 0.4 && (a.semNav || linhaLivre(a.x, a.z, a.caminho[a.ip + 1][0], a.caminho[a.ip + 1][1], a.dono)))) {
        // Passa para o próximo ponto só quando dali já se vê o próximo (assim ninguém raspa a quina da parede)
        a.melhor = null; if (ultimo) { a.v = 0; chegou(M, a); } else a.ip++;
      }
      else {
        // Vira devagar na direção do próximo ponto (curva suave), anda mais devagar nas curvas
        const desejo = Math.atan2(-dz, dx), dif = ang180(desejo - a.rot);
        a.rot += Math.sign(dif) * Math.min(Math.abs(dif), dt * 3.2);
        let alvoV = a.vBase * (1 - Math.min(0.7, Math.abs(dif) / 1.6)) * (ultimo ? Math.min(1, 0.35 + dist) : 1);
        /* Desvio: quem está perto empurra para o LADO (não para trás), assim a pessoa contorna em vez de travar.
           Quem vem de frente faz cada um ir para a sua direita; atrás de quem anda devagar, diminui o passo. */
        let sx = 0, sz = 0;
        const fx = Math.cos(a.rot), fz = -Math.sin(a.rot), rx = -fz, rz = fx;   // frente e direita
        if (!a.semNav) vizinhos(a, (b) => {
          const ox = a.x - b.x, oz = a.z - b.z, d = Math.hypot(ox, oz);
          if (d < 0.6 && d > 0.001) {
            const frente = -(ox * fx + oz * fz), lado = ox * rx + oz * rz, forca = (0.6 - d) * 1.4;
            const sentido = Math.abs(lado) > 0.05 ? Math.sign(lado) : 1;   // bem na frente: passa pela direita
            if (frente > -0.1) { sx += rx * sentido * forca; sz += rz * sentido * forca; }
            if (d < 0.22) { sx += ox / d * (0.22 - d) * 2; sz += oz / d * (0.22 - d) * 2; }   // encostou: afasta um pouco
          }
          if (b.estado === 'andando' && d < 0.75 && (-ox * fx - oz * fz) > d * 0.7) alvoV *= 0.6;
          // Encontro: às vezes param para conversar
          if (d < 0.95 && t - a.ultimaConversa > 28 && t - b.ultimaConversa > 28 && (b.estado === 'andando' || (b.estado === 'atividade' && b.anim === 'olhar')) && Math.random() < 0.012) {
            [a, b].forEach((p, i) => { p.ultimaConversa = t; p.estadoAntes = p.estado; p.estado = 'conversa'; p.t = 5 + Math.random() * 6; p.rot = Math.atan2(-((i ? a : b).z - p.z), (i ? a : b).x - p.x); });
          }
        });
        if (a.estado !== 'andando') return;
        a.v += (alvoV - a.v) * Math.min(1, dt * 3);
        const nx = a.x + Math.cos(a.rot) * a.v * dt + sx * dt * 1.6, nz = a.z - Math.sin(a.rot) * a.v * dt + sz * dt * 1.6;
        const pisa = (x, z) => a.semNav || podePisar(navI(x, z), a.dono);
        if (pisa(nx, nz)) { a.x = nx; a.z = nz; }
        else if (pisa(nx, a.z)) a.x = nx;          // encostou na parede: desliza junto dela
        else if (pisa(a.x, nz)) a.z = nz;
        else { const bx = a.x + Math.cos(a.rot) * a.v * dt, bz = a.z - Math.sin(a.rot) * a.v * dt; if (pisa(bx, bz)) { a.x = bx; a.z = bz; } else { a.v *= 0.6; a.bloqueios = (a.bloqueios || 0) + 1; if (a.bloqueios > 20) { a.bloqueios = 0; irAte(M, a, a.destino[0], a.destino[1], a.tarefa || {}); } } }
        // Passo: a fase anda junto com a distância percorrida, então a perna nunca dá salto nem congela no meio
        a.passo = (a.passo || 0) + a.v * dt * 13;
        const k = Math.sin(a.passo), amp = Math.min(1, a.v / 0.3);
        a.pose = { pernaE: k * 0.55 * amp, pernaD: -k * 0.55 * amp, bracoE: -k * 0.4 * amp, bracoD: k * 0.4 * amp, prop: a.comCafe ? 'xicara' : a.levando || null };
        if (a.comCafe) a.pose.bracoD = 0.9;
        a.dy = Math.abs(k) * 0.018 * amp;
      }
    } else if (a.estado === 'conversa') {
      a.t -= dt; a.pose = ANIMS.conversar(t, f); a.dy = 0;
      if (a.t <= 0) { a.estado = a.caminho ? 'andando' : 'parado'; if (a.estadoAntes === 'atividade') { a.estado = 'atividade'; a.t = 2; } }
    } else if (a.estado === 'atividade') {
      a.t -= dt; const an = ANIMS[a.anim] || ANIMS.parado; a.pose = an(t, f); a.dy = a.pose.dy || 0;
      if (a.lugar && a.lugar.prop) a.pose.prop = a.lugar.prop;
      if (a.t <= 0 || (!ok && a.tarefa && a.tarefa.tipo !== 'embora')) { const d = a.depois; a.depois = null; if (a.anim === 'cafe' || a.anim === 'emPeCafe') a.comCafe = false; if (d) d(); else escolherTarefa(M, a); }
    } else if (a.estado === 'parado' || a.estado === 'pensando') {
      a.t -= dt; a.pose = ANIMS.parado(t, f); a.dy = 0;
      if (a.t <= 0) escolherTarefa(M, a);
    } else if (a.estado === 'pedindo') { a.pose = ANIMS.parado(t, f); a.dy = 0; }
    misturarPose(a, dt);
    const yAlvo = alturaEm(a.x, a.z); a.y += (yAlvo - a.y) * Math.min(1, dt * 8);
  });
  desenharMultidao(M);
}

/* ---------- O mundo: a sede da Real Forte no meio e a cidade de cada empresa em volta ----------
   Ninguém usa veículo: todo mundo anda a pé. Aqui se monta o mapa de onde dá para pisar (NAV):
   - a sede e a praça (a única área pública do mundo, nas cores da Real Forte);
   - a cidade de cada empresa (só a empresa pisa nela; os consultores da Real Forte também entram);
   - tudo o que está em pé dentro das cidades (prédios, cercas, árvores, máquinas) vira obstáculo.
   Do piso branco saem trilhas de dados acesas da sede até o portão de cada empresa. */

/* Caminho: uma linha de pontos por onde alguém anda. pos(s) põe o ponto a s unidades do início. */
function caminho(pontos) {
  const pts = pontos.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(p[0], p[2] || 0, p[1])));
  const lens = []; let total = 0;
  for (let i = 1; i < pts.length; i++) { const d = pts[i].distanceTo(pts[i - 1]); lens.push(d); total += d; }
  return {
    pts, total,
    pos(s, alvo) {
      let i = 0; s = Math.max(0, Math.min(total, s));
      while (i < lens.length - 1 && s > lens[i]) { s -= lens[i]; i++; }
      const k = lens[i] ? s / lens[i] : 0;
      alvo.lerpVectors(pts[i], pts[i + 1], k);
      return Math.atan2(-(pts[i + 1].z - pts[i].z), pts[i + 1].x - pts[i].x);
    }
  };
}
// Passo de quem anda (para os bonecos montados um a um, como a equipe da cobertura)
function passo(obj, t, andando, fase) {
  const u = obj.userData; const k = andando ? Math.sin(t * 8.5 + (fase || 0)) : 0;
  u.pernas[0].rotation.z = k * 0.55; u.pernas[1].rotation.z = -k * 0.55;
  if (u.bracos && !u.sentado) { u.bracos[0].rotation.z = -k * 0.45; u.bracos[1].rotation.z = k * 0.45; }
  return andando ? Math.abs(k) * 0.02 : 0;
}
// Faixa fina no chão que segue uma linha de pontos (a trilha de dados); a cor pode mudar ao longo dela
function faixaNoChao(pontos, de, ate, cores) {
  const n = pontos.length, pos = [], uv = [], cor = [], idx = [], lat = new THREE.Vector3(), tg = new THREE.Vector3();
  let s = 0; const total = pontos.reduce((acc, p, i) => acc + (i ? p.distanceTo(pontos[i - 1]) : 0), 0);
  for (let i = 0; i < n; i++) {
    if (i) s += pontos[i].distanceTo(pontos[i - 1]);
    tg.subVectors(pontos[Math.min(n - 1, i + 1)], pontos[Math.max(0, i - 1)]); lat.set(-tg.z, 0, tg.x).normalize();
    const c = typeof cores === 'function' ? cores(s / total) : (cores || [1, 1, 1]);
    [de, ate].forEach(([l, h], j) => { pos.push(pontos[i].x + lat.x * l, pontos[i].y + h, pontos[i].z + lat.z * l); uv.push(s / total, j); cor.push(c[0], c[1], c[2]); });
    if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}

/* ---------- Posição da empresa no mundo ----------
   A quadra gira para o portão ficar de frente para a sede. */
function posicionarIlha(il, x, z, giro) {
  il.pos.set(x, ALTURA_ILHA, z);
  il.grupo.position.copy(il.pos);
  il.grupo.rotation.y = giro != null ? giro : Math.atan2(-x, -z);   // portão virado para a avenida do lado da sede
  il.poca.position.set(x, 0.03, z); il.poca.rotation.z = il.grupo.rotation.y;
  const dist = Math.hypot(x, z) || 1;
  il.dirTorre = new THREE.Vector3(-x / dist, 0, -z / dist);
  il.grupo.updateMatrixWorld(true);
  il.portao = new THREE.Vector3(0, 0, CID_Z + 0.9).applyMatrix4(il.grupo.matrixWorld).setY(0);
  il.pontoEstacao = il.portao.clone().setY(2.6);   // onde aparece o rótulo com os números ao passar o mouse
  il.posicionada = true;
  painelDaZona(il);
}
// Painel do lado de fora do portão: os números da empresa (gargalos abertos, em andamento, entregues, check-up)
function painelDaZona(il) {
  const T = THREE, D = il.dados;
  if (il.painel) { il.grupo.remove(il.painel); }
  const c = document.createElement('canvas'); c.width = 512; c.height = 288; const g = c.getContext('2d');
  const cor = COR_SAUDE_CSS[D.saude] || '#8796ad';
  g.fillStyle = 'rgba(12,26,50,.92)'; g.fillRect(0, 0, 512, 288);
  g.fillStyle = cor; g.fillRect(0, 0, 512, 8);
  g.fillStyle = '#ffb27a'; g.font = '600 22px monospace'; g.fillText('RF · ACOMPANHAMENTO', 28, 50);
  g.fillStyle = '#fff'; g.font = 'bold 34px sans-serif'; g.fillText(String(D.nome || '').slice(0, 22), 28, 98);
  const linha = (y, rot, val) => { g.fillStyle = '#9fb3d1'; g.font = '24px sans-serif'; g.fillText(rot, 28, y); g.fillStyle = '#fff'; g.font = 'bold 30px sans-serif'; g.textAlign = 'right'; g.fillText(val, 484, y); g.textAlign = 'left'; };
  linha(150, 'Gargalos abertos', String(D.gargalos)); linha(192, 'Em andamento', String(D.andamento)); linha(234, 'Entregues', String(D.entregues));
  linha(276, 'Check-up', D.nota == null ? '—' : String(D.nota));
  const tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding; il.descartar.push(tex);
  const m = new T.MeshBasicMaterial({ map: tex, toneMapped: false, side: T.DoubleSide }); il.descartar.push(m);
  const painel = new T.Group(); il.painel = painel; il.grupo.add(painel);
  painel.position.set(PORTAO + 3.4, -ALTURA_ILHA, CID_Z + 1.7);
  caixa(painel, 0.08, 1.1, 0.08, COR3D.navy, 0, 0, 0);
  caixa(painel, 1.78, 1.04, 0.06, mat(COR3D.navy, { metalness: 0.4 }), 0, 1.05, 0);
  [0.035, -0.035].forEach((dz) => { const p = new T.Mesh(G3.placa, m); p.scale.set(1.68, 0.945, 1); p.position.set(0, 1.57, dz); if (dz < 0) p.rotation.y = Math.PI; painel.add(p); });
  caixa(painel, 1.78, 0.04, 0.07, luzMat(COR_SAUDE[D.saude] || COR_SAUDE.sem, 1.4), 0, 2.09, 0).castShadow = false;
}

/* ---------- O que está em pé dentro da cidade vira obstáculo no mapa ----------
   Lê as peças da própria cena (inclusive as repetidas em lote) no sistema da quadra.
   Fica de fora o que está no chão (piso, grama, faixas, sombras), o que está no alto (placas,
   telhados, luminárias) e o que é marcado como "pisável" (folhas do portão, borda acesa). */
function obstaculosDaCidade(il) {
  const T = THREE, lista = [], inv = new T.Matrix4(), m = new T.Matrix4(), mi = new T.Matrix4(), caixaT = new T.Box3();
  il.grupo.updateMatrixWorld(true);
  inv.copy(il.grupo.matrixWorld).invert();
  const conferir = (geo, matriz) => {
    if (!geo.boundingBox) geo.computeBoundingBox();
    caixaT.copy(geo.boundingBox).applyMatrix4(matriz);
    if (caixaT.isEmpty() || caixaT.max.y < 0.1 || caixaT.min.y > 0.9) return;   // acima de 0,9 passa por baixo (marquise, toldo)
    if (caixaT.max.x - caixaT.min.x > 24 || caixaT.max.z - caixaT.min.z > 18) return;   // o chão da quadra
    lista.push([caixaT.min.x, caixaT.max.x, caixaT.min.z, caixaT.max.z]);
  };
  const visitar = (o, pular) => {
    pular = pular || o.userData.move || o.userData.pisavel || o === il.alvo;
    if (!pular && o.isMesh && o.material && o.material.visible !== false) {
      m.multiplyMatrices(inv, o.matrixWorld);
      if (o.isInstancedMesh) { for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, mi); conferir(o.geometry, mi.premultiply(m)); } }
      else conferir(o.geometry, m);
    }
    o.children.forEach((c) => visitar(c, pular));
  };
  visitar(il.grupo, false);
  return lista;
}
/* Ajusta um lugar (posto, mesa, porta) para ficar onde dá para pisar.
   Quem senta: abre o quadradinho do assento e o acesso por trás. Quem fica em pé: recua um pouco. */
function ajustarPonto(p, dono) {
  const fx = Math.cos(p.rot), fz = -Math.sin(p.rot);
  const sentado = p.anim === 'sentar' || p.anim === 'cafe' || p.anim === 'digitar';
  const abrir = (x, z) => { const k = navI(x, z); if (k >= 0) NAV.livre[k] = 1; };
  if (sentado) {
    abrir(p.x, p.z);
    // Só abre um acesso se o assento ficou ilhado (nenhum vizinho livre): pelo lado que tem chão livre logo depois
    const k = navI(p.x, p.z), N = NAV.n;
    const temVizinho = [-1, 1, -N, N, -N - 1, -N + 1, N - 1, N + 1].some((d) => podePisar(k + d, dono));
    if (!temVizinho) {
      if (podePisar(navI(p.x - fx, p.z - fz), dono)) abrir(p.x - fx * 0.5, p.z - fz * 0.5);
      else if (podePisar(navI(p.x + fx, p.z + fz), dono)) abrir(p.x + fx * 0.5, p.z + fz * 0.5);
      else return false;
    }
    return podePisar(navI(p.x, p.z), dono);
  }
  if (podePisar(navI(p.x, p.z), dono)) return true;
  for (let d = 0.1; d <= 0.75; d += 0.1) { const x = p.x - fx * d, z = p.z - fz * d; if (podePisar(navI(x, z), dono)) { p.x = x; p.z = z; return true; } }
  return false;
}

/* ---------- Montagem do mundo (refeito quando muda a disposição ou uma empresa é refeita) ---------- */
function descartarMundo() {
  const W = CAMPO.mundo; if (!W) return;
  CAMPO.cena.remove(W.grupo);
  W.grupo.traverse((o) => { if (o.isMesh && !Object.values(G3).includes(o.geometry)) o.geometry.dispose(); });   // as formas básicas são de todos
  (W.extras || []).forEach((x) => { if (x && x.dispose) x.dispose(); });   // texturas e materiais feitos para este mundo
  CAMPO.mundo = null;
}
// Roupa da multidão a partir do uniforme
const lookDe = (u, extra) => Object.assign({ roupa: u.roupa, detalhe: u.detalhe || u.roupa, calca: u.calca || 0x2b3446, pele: u.pele || PELES[0], cabelo: u.cabelo === 'careca' ? null : u.cabelo, capacete: u.capacete || null, logo: u.logo || null, proporcaoLogo: u.proporcaoLogo }, extra || {});
// Põe a pessoa no mundo: já trabalhando num posto, andando pela área ou (se é hora de estar em casa) fora de vista
function nascer(a, area, lugares) {
  const A = CAMPO.atividade == null ? 1 : CAMPO.atividade;
  const casa = a.portaCasa;
  if (a.limiar > A) { a.estado = 'sumido'; a.visivel = false; a.t = 1 + Math.random() * 6; if (casa) { a.x = casa.x; a.z = casa.z; } return; }
  const p = lugares && lugares.length ? livreDe(lugares, a) : null;
  if (p && Math.random() < 0.65) {
    p.ocupado = a; a.lugar = p; a.tarefa = { tipo: 'posto', lugar: p };
    a.x = p.x; a.z = p.z; a.rot = p.rot; a.anim = p.anim; a.estado = 'atividade'; a.t = 2 + Math.random() * (p.dur || 14); a.visivel = true;
  } else {
    const q = pontoAleatorio(area, a.dono);
    if (q) { a.x = q[0]; a.z = q[1]; } else if (casa) { a.x = casa.x; a.z = casa.z; }
    a.estado = 'pensando'; a.t = Math.random() * 5; a.visivel = true;
  }
  a.y = alturaEm(a.x, a.z);
}
function montarMundo(lista) {
  descartarMundo();
  const T = THREE;
  const grupo = new T.Group(); CAMPO.cena.add(grupo);
  const W = CAMPO.mundo = { grupo, porIlha: new Map() };
  const daIlha = (id, o) => { if (!W.porIlha.has(id)) W.porIlha.set(id, []); W.porIlha.get(id).push(o); return o; };
  // 1) Mapa de onde dá para pisar: o tamanho cobre todas as cidades
  criarNav(PLANO.lim);   // o mapa cobre a cidade inteira (o plano diretor é fixo)
  const I = new T.Matrix4(), S = CAMPO.sedeNav;
  S.alturas.forEach(([x0, x1, z0, z1, h]) => navRetangulo(I, x0, x1, z0, z1, 0, (k) => { NAV.alt[k] = Math.max(NAV.alt[k], h); }));
  S.obst.forEach(([x0, x1, z0, z1]) => navBloquear(I, x0, x1, z0, z1));
  marcarPlanoNoNav();   // ruas (só se atravessa na faixa), calçadas, centros e praças
  lista.forEach((il, i) => {
    il.navDono = i + 1;
    il.grupo.updateMatrixWorld(true);
    const m = il.grupo.matrixWorld;
    navRetangulo(m, -CID_X, CID_X, -CID_Z, CID_Z, 0, (k) => { NAV.dono[k] = il.navDono; NAV.alt[k] = ALTURA_ILHA; });
    obstaculosDaCidade(il).forEach(([x0, x1, z0, z1]) => navBloquear(m, x0, x1, z0, z1));
  });
  // Lotes livres: canteiro de obras ou área verde reservada
  W.extras = []; W.idsPorLote = lista.map((il) => il.id); preencherLotes(lista.length, W);
  pontosDeOnibus(lista, W);   // ponto do ônibus da Real Forte na frente de cada empresa
  outdoorsDasEmpresas(lista, W, daIlha);   // peça de cada empresa no gramado da frente (e os vídeos da Lança na Elson's)
  // Sombras do sol cobrindo o mundo todo
  const sol = CAMPO.luzes && CAMPO.luzes.sol;
  if (sol) { const L = 112; Object.assign(sol.shadow.camera, { left: -L, right: L, top: L, bottom: -L }); sol.shadow.camera.updateProjectionMatrix(); }
  // 2) Lugares de cada cidade (postos de trabalho, portas, visitas) no mundo, já onde dá para pisar
  lista.forEach((il) => {
    prepararPostos(il);
    il.postos = il.postos.filter((p) => ajustarPonto(p, il.navDono));
    il.visitas = il.visitas.filter((p) => ajustarPonto(p, il.navDono));
    il.portas = il.portas.filter((p) => ajustarPonto(p, il.navDono));
  });
  const P = CAMPO.sedePontos;
  ['fila', 'mesas', 'sofas', 'telas', 'arena', 'reuniao', 'empe', 'elevadores'].forEach((k) => { P[k].forEach((p) => { p.ocupado = null; p.falhas = 0; }); });
  // 3) Rondas, passeio pela calçada da quadra e manutenção de cada empresa
  vidaDoMundo(lista, W, daIlha);
  // 4) Gente
  const M = CAMPO.multidao || (CAMPO.multidao = criarMultidao());
  M.agentes.length = 0; M.fila = [];
  M.hall = { fila: P.fila, mesas: P.mesas, sofas: P.sofas, telas: P.telas, arena: P.arena, reuniao: P.reuniao, empe: P.empe };
  Object.keys(M.hall).forEach((k) => { M.hall[k] = M.hall[k].filter((p) => ajustarPonto(p, 0)); });
  M.elevadores = P.elevadores.filter((p) => ajustarPonto(p, 0));
  M.areaHall = S.area;
  M.areaPraca = { x0: -12.5, x1: 12.5, z0: 11.4, z1: 20 };
  const sorte = sorteio('multidao' + lista.length);
  const lugaresHall = [].concat(M.hall.mesas, M.hall.sofas, M.hall.telas, M.hall.empe);
  // Equipe da Real Forte no hall (a maior concentração de gente do mundo)
  const cabelos = [0x1b1b1f, 0x3a2a1e, 0x5a3a22, 0xe8c66a, 'careca', 0x1b1b1f, 0x2a1e16];
  for (let i = 0; i < 30; i++) {
    const a = novoAgente(M, { tipo: 'rf', dono: 0, look: lookDe(uniformeRealForte(cabelos[i % cabelos.length], PELES[(i * 3) % PELES.length])), sorte, limiar: 0.06 + sorte() * 0.6 });
    a.portaCasa = M.elevadores[i % Math.max(1, M.elevadores.length)] || { x: 0, z: 11 };
    nascer(a, M.areaHall, lugaresHall);
  }
  // Consultores da Real Forte (prancheta na mão): visitam as empresas e voltam para a sede
  const nCons = Math.max(5, Math.min(10, lista.length + 4));
  for (let i = 0; i < nCons; i++) {
    const a = novoAgente(M, { tipo: 'consultor', dono: DONO_RF, look: lookDe(uniformeRealForte(cabelos[(i + 2) % cabelos.length], PELES[(i + 1) % PELES.length]), { prancheta: true }), sorte, limiar: 0.1 + sorte() * 0.8 });
    a.portaCasa = M.elevadores[i % Math.max(1, M.elevadores.length)] || { x: 0, z: 11 };
    nascer(a, M.areaHall, M.hall.empe);
  }
  // Funcionários de cada empresa (alguns ficam no turno da noite)
  const porCidade = Math.max(14, Math.min(48, Math.floor((MULTIDAO_MAX - 70) / Math.max(1, lista.length))));
  const CAPACETE = { industria: 0xf0b429, construcao: 0xf0b429, distribuicao: 0xf0b429 };
  lista.forEach((il) => {
    const n = Math.min(porCidade, 20 + il.setores.size * 2), cena = il.dados.cena;   // poucos e com destino
    for (let i = 0; i < n; i++) {
      const u = uniformeDa(il, 200 + i);
      if (CAPACETE[cena] && i % 5 < 2) u.capacete = CAPACETE[cena];
      if (cena === 'saude' && i % 3 === 0) { u.roupa = 0xffffff; u.detalhe = 0x4d8ff0; }   // jaleco
      const a = novoAgente(M, { tipo: 'func', il: il.id, dono: il.navDono, look: lookDe(u), sorte, limiar: i % 10 < Math.round(1 + turnoDe(il) * 2.5) ? 0.04 + sorte() * 0.12 : 0.24 + sorte() * 0.7 });
      a.portaCasa = il.portaCasa;
      nascer(a, il.area, il.postos);
    }
    // Quem trabalha por dentro (no galpão, dá para ver pelo telhado de vidro)
    if (il.interno) for (let i = 0; i < il.interno.qtd; i++) {
      const u = uniformeDa(il, 400 + i); u.capacete = 0xf0b429;
      const a = novoAgente(M, { tipo: 'interno', il: il.id, dono: il.navDono, semNav: true, look: lookDe(u), sorte, limiar: i === 0 ? 0.1 : 0.3 + sorte() * 0.6 });
      const p0 = il.interno.pontos[i % il.interno.pontos.length];
      a.portaCasa = { x: p0.x, z: p0.z };
      a.x = p0.x; a.z = p0.z; a.y = alturaEm(a.x, a.z); a.estado = 'pensando'; a.t = Math.random() * 3; a.visivel = true;
    }
  });
  // Vigias, manutenção e limpeza
  gentDaNoite(M, lista, sorte);
  // Centros, praças e estações; a equipe da Real Forte pela cidade, a obra e o trânsito
  prepararLugaresDaCidade(M); gentDaCidade(M, sorte); visitantesDaCidade(M, sorte); montarTransito(lista);
}

/* ---------- Gráficos dos telões do hall (com os números do painel) ----------
   Fora da apresentação: todas as empresas. Na apresentação: só a empresa que está sendo apresentada. */
function dadosDosTeloes() {
  const ap = CAMPO.ap;
  const empresas = empresasAtivas().filter((e) => !ap || e.id === ap.id);
  const itens = [].concat(...empresas.map((e) => itensDa(e.id)));
  const gargalos = itens.filter((g) => !ehOport(g));
  const porEmpresa = empresas.map((e) => { const ck = checkupDa(e.id); return { nome: e.nome, nota: ck.nota, saude: saudeDaEmpresa(ck.setores), setores: ck.setores }; });
  return { empresas, itens, gargalos, porEmpresa, ap };
}
function desenharGraficos(t, soAnimado) {
  const lista = CAMPO.graficosSede || []; if (!lista.length) return;
  if (!soAnimado || !CAMPO.dadosTeloes) CAMPO.dadosTeloes = dadosDosTeloes();
  const D = CAMPO.dadosTeloes;
  const noite = CAMPO.telaNoite;
  const cabeca = (g, w, titulo, sub) => {
    g.fillStyle = noite ? '#050b17' : '#0b1a33'; g.fillRect(0, 0, w, 9999);
    g.fillStyle = noite ? 'rgba(56,214,245,.06)' : 'rgba(95,184,255,.08)'; for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 1, 9999);
    g.fillStyle = noite ? '#38d6f5' : '#d9681a'; g.fillRect(0, 0, w, 6);
    g.fillStyle = noite ? '#8fe6ff' : '#ffb27a'; g.font = '600 22px monospace'; g.fillText(titulo, 24, 42);
    if (noite) { g.fillStyle = '#38d6f5'; g.font = '600 15px monospace'; g.textAlign = 'right'; g.fillText('● MODO NOTURNO · MONITORANDO', w - 20, 42); g.textAlign = 'left'; }
    if (sub) { g.fillStyle = '#9fb3d1'; g.font = '18px sans-serif'; g.fillText(sub, 24, 68); }
  };
  const vazio = (g, w, h) => { g.fillStyle = '#9fb3d1'; g.font = '22px sans-serif'; g.textAlign = 'center'; g.fillText('Sem dados ainda', w / 2, h / 2 + 20); g.textAlign = 'left'; };
  lista.forEach((q) => {
    const { c, g, tex, tipo } = q, w = c.width, h = c.height;
    if (soAnimado && tipo !== 'rfi') return;
    if (tipo === 'etapas') {
      cabeca(g, w, 'GARGALOS POR ETAPA', D.ap ? 'Esta empresa' : 'Todas as empresas');
      const cont = contagem(D.gargalos), max = Math.max(1, ...SITUACOES.map((s) => cont[s]));
      if (!D.gargalos.length) vazio(g, w, h);
      else SITUACOES.forEach((s, i) => {
        const y = 100 + i * 50, L = (w - 290) * cont[s] / max;
        g.fillStyle = '#dbe4f2'; g.font = '20px sans-serif'; g.fillText(s, 24, y + 22);
        g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(200, y + 4, w - 290, 26);
        g.fillStyle = s === 'Resolvido' ? '#2fbf71' : '#d9681a'; g.fillRect(200, y + 4, Math.max(3, L), 26);
        g.fillStyle = '#fff'; g.font = 'bold 22px sans-serif'; g.fillText(String(cont[s]), 210 + Math.max(3, L), y + 25);
      });
    } else if (tipo === 'saude') {
      // Fora da apresentação: a nota de cada empresa. Na apresentação: a nota de cada setor dela.
      const linhas = D.ap ? (D.porEmpresa[0] ? D.porEmpresa[0].setores.slice(0, 6).map(({ s, d }) => ({ nome: s.nome, nota: d.nota, saude: d.saude })) : []) : D.porEmpresa.slice(0, 6);
      cabeca(g, w, D.ap ? 'CHECK-UP DOS SETORES' : 'CHECK-UP DAS EMPRESAS', '');
      if (!linhas.length) vazio(g, w, h);
      linhas.forEach((x, i) => {
        const y = 66 + i * 46, L = (w - 300) * (x.nota == null ? 0 : x.nota / 100);
        g.fillStyle = '#dbe4f2'; g.font = '19px sans-serif'; g.fillText(String(x.nome || '').slice(0, 16), 24, y + 22);
        g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(220, y + 5, w - 300, 24);
        g.fillStyle = COR_SAUDE_CSS[x.saude] || '#8796ad'; g.fillRect(220, y + 5, L, 24);
        g.fillStyle = '#fff'; g.font = 'bold 20px sans-serif'; g.fillText(x.nota == null ? '–' : String(x.nota), w - 66, y + 24);
      });
    } else if (tipo === 'entregas' || tipo === 'horas') {
      const entregues = D.itens.filter((x) => situacaoDe(x) === 'Resolvido').length, horas = somaHoras(D.itens);
      g.fillStyle = noite ? '#050b17' : '#0b1a33'; g.fillRect(0, 0, w, h); g.fillStyle = noite ? '#38d6f5' : '#d9681a'; g.fillRect(0, 0, w, 8);
      g.textAlign = 'center';
      g.fillStyle = '#ffb27a'; g.font = '600 26px monospace'; g.fillText(tipo === 'horas' ? 'HORAS / MÊS' : 'ENTREGUES', w / 2, 70);
      g.fillStyle = '#fff'; g.font = 'bold 120px sans-serif'; g.fillText(tipo === 'horas' ? fmtHoras(horas) : String(entregues), w / 2, h / 2 + 30);
      g.fillStyle = '#9fb3d1'; g.font = '24px sans-serif';
      g.fillText(tipo === 'horas' ? 'devolvidas às equipes' : plural(emAndamento(D.itens), 'em andamento', 'em andamento'), w / 2, h / 2 + 90);
      g.textAlign = 'left';
    } else if (tipo === 'rfi') {
      cabeca(g, w, 'RF INTELLIGENCE · ONLINE', D.ap ? (D.empresas[0] ? D.empresas[0].nome : '') : plural(D.empresas.length, 'empresa acompanhada', 'empresas acompanhadas'));
      const abertos = D.gargalos.filter((x) => situacaoDe(x) !== 'Resolvido').length, ops = D.itens.filter((x) => ehOport(x) && situacaoDe(x) !== 'Resolvido').length;
      [[plural(abertos, 'gargalo aberto', 'gargalos abertos')], [plural(ops, 'oportunidade', 'oportunidades')], [plural(emAndamento(D.itens), 'melhoria em andamento', 'melhorias em andamento')]].forEach(([txt], i) => {
        g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(24, 96 + i * 52, 300, 40);
        g.fillStyle = '#fff'; g.font = 'bold 22px sans-serif'; g.fillText(txt, 38, 124 + i * 52);
      });
      // Onda do "processamento" (só enfeite, sem número)
      g.strokeStyle = '#38d6f5'; g.lineWidth = 3; g.beginPath();
      for (let x = 350; x <= w - 20; x += 5) { const y = 160 + Math.sin(x * 0.035 + t * 2.4) * 30 + Math.sin(x * 0.012 - t * 1.3) * 18; x > 350 ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
      g.strokeStyle = '#ff9a52'; g.lineWidth = 2; g.beginPath();
      for (let x = 350; x <= w - 20; x += 5) { const y = 230 + Math.sin(x * 0.05 - t * 3.1) * 16; x > 350 ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
    tex.needsUpdate = true;
  });
  // Barras da mesa de projeção: a nota de cada empresa (ou de cada setor, na apresentação)
  const notas = D.ap ? (D.porEmpresa[0] ? D.porEmpresa[0].setores.map(({ d }) => d.nota) : []) : D.porEmpresa.map((x) => x.nota);
  CAMPO.valoresMesa = (CAMPO.barrasMesa || []).map((b, i) => (notas[i] == null ? 0.08 : 0.15 + notas[i] / 100 * 1.1));
}

/* ---------- Vida no mundo ----------
   - outdoor da Real Forte passando o vídeo da marca em loop, a meia altura, na praça da sede;
   - sombras de nuvens passando devagar pelo piso branco (só de dia);
   - à noite: vigias com lanterna fazendo ronda (por dentro da cerca e pela calçada da quadra),
     manutenção e limpeza, e cidades com mais ou menos luz acesa conforme o turno do segmento.
   Tudo aqui é só aparência do mundo 3D: nada entra em conta nenhuma do painel. */

// Quanto cada segmento continua trabalhando à noite (1 = a noite toda; perto de 0 = quase tudo descansa).
// Decide quanta gente fica no turno da noite e quanta janela e poste ficam acesos.
const TURNO_DA_NOITE = { saude: 1, distribuicao: 1, industria: 0.85, tecnologia: 0.6, varejo: 0.45, servicos: 0.35, agro: 0.35, construcao: 0.25 };
const turnoDe = (il) => (il && il.dados && TURNO_DA_NOITE[il.dados.cena] != null ? TURNO_DA_NOITE[il.dados.cena] : 0.4);
// O vídeo do outdoor fica guardado junto com a página (sem internet ou sem o arquivo, aparece a capa com a logo)
const VIDEO_OUTDOOR = '/_blob/c6673670649c6a3480a4c74fdf466ba9';
const noiteAgora = () => (CAMPO.luzDoCeu ? CAMPO.luzDoCeu.postes : 0);   // 0 de dia, 1 de noite

// Formas usadas só aqui (ficam junto das formas básicas, para não serem jogadas fora quando o mundo é refeito)
function formasDaVida() {
  if (G3.placaDeitada) return;
  const T = THREE;
  G3.placaDeitada = new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);               // plano no chão
  G3.feixe = new T.ConeGeometry(1, 1, 24, 1, true).translate(0, -0.5, 0);          // cone de luz: ponta em cima
  G3.anel = new T.TorusGeometry(1, 0.035, 8, 64).rotateX(Math.PI / 2);                // anel deitado
  CAMPO.matsVida = {
    calcada: pisoNoturno(new T.MeshStandardMaterial({ color: 0xdfe4eb, roughness: 0.82 })),
    meioFio: pisoNoturno(new T.MeshStandardMaterial({ color: 0xc2c9d3, roughness: 0.8 })),
    vaso: mat(0xe9edf2, { roughness: 0.6 }), terra: mat(0x5a4636, { roughness: 1 }), tronco: mat(0x7a5a3c, { roughness: 1 }),
    copas: [mat(0x4f9a5e, { roughness: 0.85 }), mat(0x3f8a52, { roughness: 0.85 }), mat(0x6aad5f, { roughness: 0.85 })],
    madeira: mat(0x9a6a42, { roughness: 0.8 }), ferro: mat(0x2b3446, { roughness: 0.5, metalness: 0.4 }),
    poste: mat(COR3D.navy, { roughness: 0.45, metalness: 0.4 }), lampada: luzMat(0xffe3b0, 1.3),
    // Luzes do piso: a tampinha (cor por luz) e o brilho em volta (soma luz, preto = apagado)
    tampa: new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    halo: new T.MeshBasicMaterial({ map: CAMPO.texBrilho, color: 0xffffff, transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false })
  };
}

/* ---------- Real Forte Vision: o grande painel oficial da cidade ----------
   Telão curvo na ala leste do Terminal da Real Forte, virado para a praça. Alterna o vídeo da marca
   (em loop, sem som) com mensagens institucionais e as conquistas do painel (horas devolvidas,
   melhorias entregues, empresas acompanhadas). Na apresentação, os números são só da empresa apresentada. */
function montarOutdoor(pai) {
  /* Real Forte Vision: telão curvo de LED na ala leste do Terminal da Real Forte (não mais no chão da
     praça). Alterna o vídeo da Real Forte com as mensagens feitas dos números do painel. */
  const T = THREE, V = TERMINAL, W = V.VW, H = V.VH, R = V.VR, A = 2 * Math.asin(W / 2 / R);
  const g = new T.Group(); g.position.set(V.VX, PLANO.ALT + V.VY0 + H / 2, V.VZ - R); CAMPO.cena.add(g);
  const grafite = mat(0x161a21, { roughness: 0.35, metalness: 0.55 }), laranja = COR3D.laranja;
  const grafiteDuplo = new T.MeshStandardMaterial({ color: 0x161a21, roughness: 0.35, metalness: 0.55, side: T.DoubleSide });
  // Moldura: trilho de cima e de baixo (curvos), com filete de luz, e fundo grafite atrás da tela
  [H / 2 + 0.12, -H / 2 - 0.12].forEach((y) => {
    const tr = new T.Mesh(new T.CylinderGeometry(R + 0.06, R + 0.06, 0.22, 40, 1, true, -A / 2 - 0.015, A + 0.03), grafiteDuplo);   // aberto: sem as tampas em fatia tr.position.y = y; tr.castShadow = true; g.add(tr);
    const fl = new T.Mesh(new T.CylinderGeometry(R + 0.1, R + 0.1, 0.05, 40, 1, true, -A / 2, A), luzMat(laranja, 1.4)); fl.position.y = y + (y > 0 ? 0.08 : -0.08); g.add(fl);
  });
  const fundo = new T.Mesh(new T.CylinderGeometry(R - 0.12, R - 0.12, H + 0.3, 40, 1, true, -A / 2 - 0.015, A + 0.03), new T.MeshStandardMaterial({ color: 0x161a21, roughness: 0.4, metalness: 0.5, side: T.DoubleSide })); g.add(fundo);
  [-1, 1].forEach((s) => { const a = s * (A / 2 + 0.012); caixa(g, 0.2, H + 0.5, 0.2, grafite, Math.sin(a) * R, -H / 2 - 0.25, Math.cos(a) * R - 0.05); });
  // Pés até o chão
  [-0.32, 0, 0.32].forEach((u) => { const a = u * A; caixa(g, 0.18, V.VY0, 0.18, grafite, Math.sin(a) * (R - 0.2), -H / 2 - V.VY0, Math.cos(a) * (R - 0.2)); });
  // Mensagens: canvas desenhado na hora com os números do painel
  const cm = document.createElement('canvas'); cm.width = 1024; cm.height = 576;
  const texMsg = new T.CanvasTexture(cm); texMsg.encoding = T.sRGBEncoding;
  // Capa (logo sobre o azul-marinho): aparece antes do vídeo carregar e se ele não carregar
  const c = document.createElement('canvas'); c.width = 1024; c.height = 576; const q = c.getContext('2d');
  const capa = new T.CanvasTexture(c); capa.encoding = T.sRGBEncoding;
  let logoImg = null;
  const desenharCapa = (img) => {
    if (img) logoImg = img;
    const grad = q.createLinearGradient(0, 0, 0, 576); grad.addColorStop(0, '#163259'); grad.addColorStop(1, '#0b1a33');
    q.fillStyle = grad; q.fillRect(0, 0, 1024, 576); q.fillStyle = '#d9681a'; q.fillRect(0, 548, 1024, 28);
    if (img) { const k = Math.min(640 / img.width, 300 / img.height); q.drawImage(img, (1024 - img.width * k) / 2, (540 - img.height * k) / 2, img.width * k, img.height * k); }
    else { q.fillStyle = '#ffffff'; q.textAlign = 'center'; q.textBaseline = 'middle'; q.font = '700 92px Arial, sans-serif'; q.fillText('REAL FORTE', 512, 250); q.font = '400 42px Arial, sans-serif'; q.fillText('CONSULTORIA', 512, 340); }
    capa.needsUpdate = true;
  };
  desenharCapa(null);
  if (typeof LOGO !== 'undefined' && LOGO.claro) { const img = new Image(); img.onload = () => { try { desenharCapa(img); } catch (e) { desenharCapa(null); } }; img.src = LOGO.claro; }
  const matTela = new T.MeshBasicMaterial({ map: capa, toneMapped: false });
  const tela = new T.Mesh(new T.CylinderGeometry(R, R, H, 48, 1, true, -A / 2, A), matTela); g.add(tela);
  // Plaquinha com o nome em cima do telão
  { const texN = texturaTexto(['REAL FORTE VISION'], '#0f2342', '#ffffff', 768, 96); const pn = new T.Mesh(G3.placa, new T.MeshBasicMaterial({ map: texN, toneMapped: false })); pn.scale.set(2.8, 0.35, 1); pn.position.set(0, H / 2 + 0.45, R + 0.02); g.add(pn); }
  // À noite o telão clareia o chão da praça
  const poca = new T.Mesh(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: CAMPO.texBrilho, color: 0x7fc4ff, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
  poca.scale.set(W * 1.4, 1, 6); poca.position.set(0, -H / 2 - V.VY0 + 0.03, R + 2.6); g.add(poca);
  // O vídeo: sem som, em loop. Começa sozinho; se o navegador exigir um toque antes, tenta de novo no primeiro clique.
  const video = document.createElement('video');
  video.muted = true; video.loop = true; video.playsInline = true; video.preload = 'auto';
  video.setAttribute('muted', ''); video.setAttribute('playsinline', '');
  CAMPO.outdoor = { g, video, matTela, capa, poca, texVideo: null, cm, texMsg, logo: () => logoImg, quadro: -1 };
  const tocar = () => { if (movimentoReduzido()) return; const p = video.play(); if (p && p.catch) p.catch(() => {}); };
  video.addEventListener('playing', () => {
    const O = CAMPO.outdoor;
    if (!O.texVideo) { O.texVideo = new T.VideoTexture(video); O.texVideo.encoding = T.sRGBEncoding; }
    O.videoOk = true;
  });
  video.addEventListener('error', () => { CAMPO.outdoor.videoOk = false; });
  video.src = VIDEO_OUTDOOR; tocar();
  window.addEventListener('pointerdown', tocar, { once: true });
}

/* ---------- Sombras de nuvens no piso ----------
   Um plano bem grande, quase colado no chão, com manchas suaves que andam com o vento. Some à noite. */
function criarNuvens() {
  const T = THREE, c = document.createElement('canvas'); c.width = c.height = 512;
  const q = c.getContext('2d'); q.fillStyle = '#000'; q.fillRect(0, 0, 512, 512);
  const sorte = sorteio('nuvens');
  for (let i = 0; i < 9; i++) {
    const cx = sorte() * 512, cz = sorte() * 512, r = 50 + sorte() * 70;
    // Cada nuvem são algumas bolas macias juntas; desenhada também do outro lado da borda (a textura se repete sem emenda)
    for (let b = 0; b < 5; b++) {
      const bx = cx + (sorte() - 0.5) * r * 1.6, bz = cz + (sorte() - 0.5) * r * 0.8, br = r * (0.5 + sorte() * 0.5);
      [-512, 0, 512].forEach((ox) => [-512, 0, 512].forEach((oz) => {
        const gr = q.createRadialGradient(bx + ox, bz + oz, 0, bx + ox, bz + oz, br);
        gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        q.fillStyle = gr; q.fillRect(bx + ox - br, bz + oz - br, br * 2, br * 2);
      }));
    }
  }
  const tex = new T.CanvasTexture(c); tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.repeat.set(3, 3);
  const m = new T.Mesh(new T.PlaneGeometry(320, 320).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0x0e1a30, alphaMap: tex, transparent: true, opacity: 0, depthWrite: false }));
  m.position.y = 0.012; m.renderOrder = -1; CAMPO.cena.add(m);
  CAMPO.sombraNuvens = { m, tex };
}

/* ---------- Rondas, passeio e manutenção de cada empresa ----------
   Chamada quando o mundo é montado, depois que o mapa de onde dá para pisar está pronto. */
function vidaDoMundo(lista, W) {
  const T = THREE; formasDaVida();
  W.vida = {}; W.extras = W.extras || [];
  lista.forEach((il) => {
    il.grupo.updateMatrixWorld(true);
    const m = il.grupo.matrixWorld, v = new T.Vector3(), X = CID_X, Z = CID_Z;
    const mundo = (x, z) => { v.set(x, 0, z).applyMatrix4(m); return [v.x, v.z]; };
    il.bancosFora = [];
    // Volta pela calçada da quadra (na ordem de quem dá a volta): passeio e ronda de fora
    const b = il.lote ? il.lote.b : null, volta = [];
    if (b) {
      const o = 0.8;
      for (let x = b.x0 + o; x <= b.x1 - o; x += 3) volta.push([x, b.z0 + o]);
      for (let z = b.z0 + o; z <= b.z1 - o; z += 3) volta.push([b.x1 - o, z]);
      for (let x = b.x1 - o; x >= b.x0 + o; x -= 3) volta.push([x, b.z1 - o]);
      for (let z = b.z1 - o; z >= b.z0 + o; z -= 3) volta.push([b.x0 + o, z]);
    }
    il.calcadaPts = volta.filter(([x, z]) => podePisar(navI(x, z), 0));
    il.rondasFora = il.calcadaPts.slice();
    // Ronda de dentro: a volta por dentro da cerca (cada ponto vai para o lugar livre mais perto)
    il.rondas = [[3.6, Z - 1.3], [X - 1.4, Z - 2], [X - 1.4, 3], [X - 1.4, -2], [X - 1.4, -7], [6, -Z + 1.1], [0, -Z + 1.1], [-6, -Z + 1.1], [-X + 1.4, -7], [-X + 1.4, -2], [-X + 1.4, 3], [-X + 1.4, Z - 2], [-3.6, Z - 1.3]]
      .map(([x, z]) => { const [wx, wz] = mundo(x, z); const k = pontoLivre(wx, wz, il.navDono); return k >= 0 && NAV.dono[k] === il.navDono ? [navX(k), navZ(k)] : null; }).filter(Boolean);
    // Manutenção à noite: em cada poste da cidade (de frente para ele) e em alguns postos de máquina
    il.manut = [];
    const pw = new T.Vector3();
    il.postes.forEach((s, i) => {
      s.getWorldPosition(pw); const dx = il.pos.x - pw.x, dz = il.pos.z - pw.z, d = Math.hypot(dx, dz) || 1;
      const x = pw.x + dx / d * 0.6, z = pw.z + dz / d * 0.6;
      il.manut.push(ponto(x, z, Math.atan2(-(pw.z - z), pw.x - x), i % 2 ? 'martelar' : 'operar', { dur: 14 }));
    });
    (il.postos || []).filter((p) => p.anim === 'operar' || p.anim === 'tablet').slice(0, 4).forEach((p) => il.manut.push(ponto(p.x, p.z, p.rot, 'agachar', { dur: 12 })));
    il.manut = il.manut.filter((p) => ajustarPonto(p, il.navDono));
  });
}

/* ---------- Gente da noite ----------
   Vigias (sempre, de dia e de noite): um faz a ronda por dentro da cerca, outro pela calçada de fora.
   Manutenção e limpeza: chegam no fim da tarde e vão embora quando amanhece. No hall, dois da limpeza. */
function gentDaNoite(M, lista, sorte) {
  const A = CAMPO.atividade == null ? 1 : CAMPO.atividade;
  const VIGIA = { roupa: 0x1f2b44, detalhe: 0xf2d33a, calca: 0x161d2b, capacete: 0x1f2b44 };
  const MANUT = { roupa: 0xf07a22, detalhe: 0xf4f4f4, calca: 0x2b3446, capacete: 0xffffff };
  const LIMPEZA = { roupa: 0x2f7d6b, detalhe: 0xd8efe7, calca: 0x2b3446, cabelo: 0x2a1e16 };
  const pele = (i) => PELES[i % PELES.length];
  const comecar = (a, area) => {
    if (a.soNoite && A >= 0.6) { a.estado = 'sumido'; a.visivel = false; a.t = 1 + Math.random() * 6; const c = a.portaCasa; if (c) { a.x = c.x; a.z = c.z; } return; }
    const q = (a.rondas && a.rondas.length ? a.rondas[Math.floor(Math.random() * a.rondas.length)] : null) || pontoAleatorio(area, a.dono);
    const c = a.portaCasa; if (q) { a.x = q[0]; a.z = q[1]; } else if (c) { a.x = c.x; a.z = c.z; }
    a.y = alturaEm(a.x, a.z); a.estado = 'pensando'; a.t = Math.random() * 4; a.visivel = true;
  };
  lista.forEach((il, n) => {
    [0, 1].forEach((k) => {
      const a = novoAgente(M, { tipo: 'vigia', il: il.id, dono: il.navDono, vBase: 0.42 + sorte() * 0.08, limiar: 0, look: lookDe(Object.assign({ pele: pele(n * 2 + k) }, VIGIA), { vigia: true }), sorte });
      a.portaCasa = il.portaCasa; a.rondas = k === 0 ? il.rondas : il.rondasFora;
      comecar(a, il.area);
    });
    const nManut = turnoDe(il) >= 0.85 ? 2 : 1;
    for (let k = 0; k < nManut + 1; k++) {
      const manut = k < nManut;
      const a = novoAgente(M, { tipo: 'noturno', funcao: manut ? 'manutencao' : 'limpeza', soNoite: true, il: il.id, dono: il.navDono, limiar: 0, look: lookDe(Object.assign({ pele: pele(n + k + 3) }, manut ? MANUT : LIMPEZA)), sorte });
      a.portaCasa = il.portaCasa; comecar(a, il.area);
    }
  });
  for (let k = 0; k < 2; k++) {
    const a = novoAgente(M, { tipo: 'noturno', funcao: 'limpeza', soNoite: true, dono: 0, limiar: 0, look: lookDe(Object.assign({ pele: pele(k + 1) }, LIMPEZA)), sorte });
    a.portaCasa = M.elevadores[k % Math.max(1, M.elevadores.length)] || { x: 0, z: 11 };
    comecar(a, M.areaHall);
  }
}
// Vigia: vai para o próximo ponto da ronda (às vezes pula um), para, olha em volta e segue
function tarefaVigia(M, a) {
  const pts = a.rondas || [];
  if (!pts.length) { const q = pontoAleatorio(a.il ? CAMPO.ilhas.get(a.il).area : M.areaHall, a.dono); if (q) return irAte(M, a, q[0], q[1], { tipo: 'ronda' }); a.estado = 'parado'; a.t = 4; return true; }
  a.iRonda = ((a.iRonda == null ? Math.floor(Math.random() * pts.length) : a.iRonda) + 1 + (Math.random() < 0.25 ? 1 : 0)) % pts.length;
  const [x, z] = pts[a.iRonda];
  return irAte(M, a, x, z, { tipo: 'ronda' });
}
// Manutenção e limpeza: só trabalham do fim da tarde até amanhecer
function tarefaNoturna(M, a) {
  const A = CAMPO.atividade == null ? 1 : CAMPO.atividade;
  if (A >= 0.6) { const p = a.portaCasa; if (p) return irAte(M, a, p.x, p.z, { tipo: 'embora' }); a.estado = 'sumido'; a.visivel = false; a.t = 5; return true; }
  const il = a.il && CAMPO.ilhas.get(a.il);
  if (a.funcao === 'manutencao' && il && il.manut && il.manut.length) {
    const p = livreDe(il.manut, a); if (p) return irAte(M, a, p.x, p.z, { tipo: 'posto', lugar: p });
  }
  let q = null;
  if (il) q = Math.random() < 0.45 && il.calcadaPts && il.calcadaPts.length ? il.calcadaPts[Math.floor(Math.random() * il.calcadaPts.length)] : pontoAleatorio(il.area, a.dono);
  else q = pontoAleatorio(Math.random() < 0.7 ? M.areaHall : M.areaPraca, a.dono);
  if (q) return irAte(M, a, q[0], q[1], { tipo: 'limpar', lugar: ponto(q[0], q[1], Math.random() * 6.28, 'varrer', { dur: 9 }) });
  a.estado = 'parado'; a.t = 3; return true;
}

/* ---------- Carreta que manobra no pátio (distribuição) ----------
   Ela anda até 1,8 m para a frente, para (carregando) e volta de ré, num ciclo de 40 s.
   A área por onde ela passa fica bloqueada para as pessoas (uma caixa invisível que conta como parede). */
function carretaEmManobra(H, x, z, c1, c2) {
  const T = THREE, g = H.g, il = H.il, ESC = 1.05, CURSO = 1.8, TRAS = 2.13 * ESC / 1.05, FRENTE = 1.22;
  const K = novoLote(); veiculo(K, 'carreta', 0, 0, -Math.PI / 2, ESC, c1, c2);
  const carro = new T.Group(); carro.userData.move = true; carro.position.set(x, 0, z); g.add(carro);
  K.montar(carro, il.descartar);
  if (!CAMPO.matSoParede) CAMPO.matSoParede = new T.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const area = new T.Mesh(G3.caixa, CAMPO.matSoParede); area.scale.set(0.72, 0.8, TRAS + FRENTE + CURSO); area.position.set(x, 0, z + (FRENTE + CURSO - TRAS) / 2); g.add(area);
  const giroflex = brilho(carro, 0xff9a2a, 0.8, 0, 1.12, 0.82, 0.1);
  const farois = [-0.18, 0.18].map((d) => brilho(carro, 0xfff4d6, 0.7, d, 0.36, 1.24, 0));
  const re = [-0.22, 0.22].map((d) => brilho(carro, 0xff3b30, 0.5, d, 0.4, -2.12, 0));
  const f = Math.random() * 40, suave = (u) => u * u * (3 - 2 * u);
  il.animados.push((t) => {
    const u = (t + f) % 40; let off = 0, andando = 0, deRe = false;
    if (u >= 10 && u < 16) { off = suave((u - 10) / 6); andando = 1; }
    else if (u >= 16 && u < 26) off = 1;
    else if (u >= 26 && u < 33) { off = 1 - suave((u - 26) / 7); andando = 1; deRe = true; }
    carro.position.z = z + off * CURSO;
    const noite = noiteAgora();
    giroflex.material.opacity = andando ? (Math.sin(t * 9) > 0 ? 0.95 : 0.15) : 0.08;
    farois.forEach((s) => { s.material.opacity = noite * 0.9; });
    re.forEach((s) => { s.material.opacity = deRe ? (Math.sin(t * 6) > 0 ? 0.9 : 0.3) : 0; });
  });
}

/* ---------- Quadro a quadro da vida ---------- */
function passoVida(t, dt) {
  const noite = noiteAgora();
  if (!CAMPO.sombraNuvens) criarNuvens();
  // Nuvens: andam com o vento; só de dia
  const N = CAMPO.sombraNuvens; N.tex.offset.x = (N.tex.offset.x + dt * 0.0042) % 1; N.tex.offset.y = (N.tex.offset.y + dt * 0.0016) % 1;
  N.m.material.opacity = 0.16 * Math.max(0, 1 - noite * 1.6); N.m.visible = N.m.material.opacity > 0.005;
  // Real Forte Vision: à noite clareia o chão da frente; troca entre o vídeo e as mensagens
  const O = CAMPO.outdoor; if (O) { O.poca.material.opacity = 0.32 * noite; passoVision(O); }
}

/* Ciclo do Real Forte Vision: vídeo da marca (18 s) e depois três mensagens de 6 s.
   Sem o vídeo (arquivo não carregou), fica só nas mensagens. */
function passoVision(O) {
  const agora = performance.now() / 1000, ciclo = O.videoOk ? 36 : 18, u = agora % ciclo;
  const quadro = O.videoOk && u < 18 ? 0 : 1 + Math.floor((O.videoOk ? u - 18 : u) / 6);
  if (quadro === O.quadro) return;
  O.quadro = quadro;
  if (quadro === 0) { O.matTela.map = O.texVideo; O.matTela.needsUpdate = true; return; }
  const D = CAMPO.dadosTeloes || { empresas: [], itens: [] }, g = O.cm.getContext('2d'), W = 1024, H = 576;
  const horas = somaHoras(D.itens || []), entregues = (D.itens || []).filter((x) => situacaoDe(x) === 'Resolvido').length, n = (D.empresas || []).length;
  const grad = g.createLinearGradient(0, 0, W, H); grad.addColorStop(0, '#13294b'); grad.addColorStop(1, '#070f1f');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(95,184,255,.06)'; for (let x = 0; x < W; x += 48) g.fillRect(x, 0, 1, H);
  g.fillStyle = '#d9681a'; g.fillRect(0, H - 18, W, 18); g.fillRect(64, 110, 90, 6);
  const logo = O.logo(); if (logo) { const k = Math.min(220 / logo.width, 70 / logo.height); g.drawImage(logo, W - 64 - logo.width * k, 40, logo.width * k, logo.height * k); }
  g.textAlign = 'left'; g.fillStyle = '#ffb27a'; g.font = '600 26px monospace'; g.fillText('REAL FORTE VISION', 64, 84);
  const msg = [
    ['Inteligência, estratégia e pessoas.', 'Real Forte Consultoria · desde 1982'],
    [horas ? fmtHoras(horas) + ' h/mês' : 'Cada hora conta', horas ? 'devolvidas às equipes das empresas atendidas' : 'o tempo que o processo devolve para a equipe'],
    [plural(entregues, 'melhoria entregue', 'melhorias entregues'), plural(n, 'empresa acompanhada pela Real Forte', 'empresas acompanhadas pela Real Forte')]
  ][(quadro - 1) % 3];
  g.fillStyle = '#ffffff'; let f = 92; g.font = `700 ${f}px Arial, sans-serif`; while (g.measureText(msg[0]).width > W - 128 && f > 40) { f -= 4; g.font = `700 ${f}px Arial, sans-serif`; }
  g.fillText(msg[0], 64, 300);
  g.fillStyle = '#b9c7dd'; g.font = '400 36px Arial, sans-serif'; g.fillText(msg[1], 64, 370);
  O.texMsg.needsUpdate = true; O.matTela.map = O.texMsg; O.matTela.needsUpdate = true;
}

/* ---------- Plano diretor da cidade Real Forte ----------
   A cidade é uma grade fixa de quadras separadas por avenidas (5 m de asfalto, calçada de 1,6 m em
   volta de cada quadra). Tudo fica no nível da rua: nada de ilha nem platô.
   - Quadra do meio: a sede Real Forte (torre, hall de vidro e a base em estilo placa-mãe).
   - Anel 1 (8 quadras em volta): os 5 centros da consultoria, a Praça das Conexões com a Estação
     Central, a Praça da Estratégia e a Praça da Inovação.
   - Anel 2 (16 lotes): as empresas atendidas, sempre na mesma ordem (a primeira cadastrada fica no
     lote da frente). Os 2 próximos lotes livres viram canteiro de obras; os outros, área verde reservada.
   Pedestre só atravessa a rua na faixa (no meio de cada trecho). Veículo só anda na rua, pela mão
   direita, em rota definida (bloco do trânsito). */
const PLANO = {
  RUA: 5, CALC: 1.6, ALT: 0.04,
  XR: [-95.5, -59.5, -23.5, 23.5, 59.5, 95.5],          // eixo das avenidas que correm no sentido z
  ZR: [-89.5, -53.5, -17.5, 29.5, 65.5, 101.5],         // eixo das avenidas que correm no sentido x
  BX: [[-93, -62], [-57, -26], [-21, 21], [26, 57], [62, 93]],
  BZ: [[-87, -56], [-51, -20], [-15, 27], [32, 63], [68, 99]],
  lim: 112,
  // Ordem em que as empresas ocupam os lotes: primeiro a frente (de onde a câmera olha), depois os lados e o fundo
  // (o lote do fundo, no eixo da sede, é do Terminal da Real Forte: a rodoviária da cidade)
  ORDEM_LOTES: [[0, 2], [1, 2], [-1, 2], [2, 1], [-2, 1], [2, 2], [-2, 2], [2, 0], [-2, 0], [1, -2], [-1, -2], [2, -1], [-2, -1], [2, -2], [-2, -2]],
  obst: [], ruas: [], faixas: [], quadras: [], pontos: {}, alvos: [], estacoes: [], animados: []
};
const blocoDe = (i, j) => { const [x0, x1] = PLANO.BX[i + 2], [z0, z1] = PLANO.BZ[j + 2]; return { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 }; };
// Lote da k-ésima empresa: o portão fica virado para a avenida do lado da sede
function loteDaEmpresa(k) {
  const par = PLANO.ORDEM_LOTES[k];
  if (!par) { const x = -72 + (k - 16) % 5 * 36, z = 122 + Math.floor((k - 16) / 5) * 36; return { i: 9, j: 9, b: { x0: x - 15.5, x1: x + 15.5, z0: z - 15.5, z1: z + 15.5, cx: x, cz: z }, dir: [0, -1], cx: x, cz: z + 2.5, giro: Math.PI }; }   // além dos 16 lotes (raro)
  const [i, j] = par, b = blocoDe(i, j);
  const dir = Math.abs(j) >= Math.abs(i) ? [0, -Math.sign(j)] : [-Math.sign(i), 0];
  const M = 4 + CID_Z;   // do meio da empresa até a borda do lote, do lado do portão
  let cx = b.cx, cz = b.cz;
  if (dir[1]) cz = (dir[1] < 0 ? b.z0 : b.z1) - dir[1] * M; else cx = (dir[0] < 0 ? b.x0 : b.x1) - dir[0] * M;
  return { i, j, b, dir, cx, cz, giro: Math.atan2(dir[0], dir[1]) };
}
const rotDe = (fx, fz) => Math.atan2(-fz, fx);   // direção para onde a pessoa olha -> rot

/* Os cinco centros: nome, o que representam e para onde o clique leva (telas que já existem no painel) */
const CENTROS = {
  diag: { nome: 'Centro de Diagnóstico Empresarial', desc: 'Onde cada empresa entra no processo da consultoria: check-up e diagnóstico dos setores.',
    links: () => empresasAtivas().map((e) => ['#ck-' + e.id, 'Check-up · ' + e.nome]) },
  estr: { nome: 'Centro de Estratégia e Soluções', desc: 'Planos de ação, soluções para os gargalos e acompanhamento das melhorias.',
    links: () => [['#biblioteca', 'Biblioteca de soluções']].concat(empresasAtivas().map((e) => ['#e-' + e.id, 'Gargalos · ' + e.nome])) },
  ia: { nome: 'Centro de Inteligência Artificial', desc: 'A inteligência e as automações aplicadas à consultoria.',
    links: () => [['#ia', 'RF Intelligence'], ['#sinais', 'RF Sinais']] },
  perf: { nome: 'Centro de Performance e Resultados', desc: 'Nota de cada empresa e horas devolvidas às equipes.',
    links: () => empresasAtivas().map((e) => { const ck = checkupDa(e.id), h = somaHoras(itensDa(e.id)); return ['#e-' + e.id, `${e.nome} · nota ${ck.nota == null ? '–' : ck.nota}${h ? ' · ' + fmtHoras(h) + ' h/mês' : ''}`]; }) },
  station: { nome: 'Terminal da Real Forte', desc: 'A rodoviária da cidade: daqui saem os ônibus da Real Forte que passam no ponto de cada empresa.',
    links: () => empresasAtivas().map((e) => ['#e-' + e.id, 'Ônibus até · ' + e.nome]) },
  apres: { nome: 'Centro de Apresentações e Negócios', desc: 'Tour em tela cheia para mostrar o diagnóstico ao dono da empresa.',
    links: () => empresasAtivas().map((e) => ['#ap-' + e.id, 'Apresentar · ' + e.nome]) }
};

// Placa com texto (nome do centro, aviso de obra): textura de canvas
function texturaTexto(linhas, fundo, cor, w, h) {
  const c = telaDe(w || 512, h || 160, (g, W, H) => {
    g.fillStyle = fundo; g.fillRect(0, 0, W, H); g.fillStyle = '#d9681a'; g.fillRect(0, H - 12, W, 12);
    g.fillStyle = cor; g.textAlign = 'center'; g.textBaseline = 'middle';
    linhas.forEach((l, i) => { g.font = `${i ? '400' : '700'} ${Math.min(i ? 30 : 44, Math.floor((W * 1.5) / Math.max(8, l.length)))}px Arial, sans-serif`; g.fillText(l, W / 2, H * (linhas.length === 1 ? 0.45 : 0.34 + i * 0.3)); });
  });
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; return t;   // anisotropia: letreiro nítido mesmo visto de lado
}
// Vidro com janelas que acendem à noite (entra na lista que o céu controla)
function vidroComJanelas(cols, linhas, cor, corLuz, acesas, forca) {
  const j = texturaJanelas(cols, linhas, acesas == null ? 0.55 : acesas, corLuz || '#ffe9b8');
  const m = new THREE.MeshStandardMaterial({ color: cor, roughness: 0.22, metalness: 0.5, emissive: 0xffffff, emissiveMap: j.tex, emissiveIntensity: forca || 0.75, envMap: CAMPO.ambiente, envMapIntensity: 0.65 });
  (CAMPO.matsTorre = CAMPO.matsTorre || []).push([m, forca || 0.75]);
  return m;
}

/* ---------- Monta a cidade fixa (uma vez, junto com a cena) ---------- */
/* Terminal da Real Forte: medidas usadas pela cidade e pelo telão curvo (Real Forte Vision) */
const TERMINAL = { HX: -2.8, RX: 8.4, RY: 9.2, Z0: -78, Z1: -64, VX: 9.2, VZ: -63.9, VR: 9, VW: 6.0, VY0: 1.1, VH: 3.4 };
// Arco de tubo com espessura igual em toda a volta (meia-elipse ou quarto), no plano x-y
function tuboEmArco(rx, ry, raio, a0, a1) {
  const pts = []; for (let n = 0; n <= 48; n++) { const a = a0 + (a1 - a0) * n / 48; pts.push(new THREE.Vector3(Math.cos(a) * rx, Math.sin(a) * ry, 0)); }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, raio, 8, false);
}
// Letreiro da fachada do terminal: logo à esquerda, TERMINAL DA / REAL FORTE à direita
function texturaLetreiroTerminal() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d'), tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8;
  const desenhar = (img) => {
    g.clearRect(0, 0, 1024, 256); g.fillStyle = 'rgba(11,26,51,0.82)'; g.beginPath(); g.roundRect ? g.roundRect(8, 8, 1008, 240, 28) : g.rect(8, 8, 1008, 240); g.fill();
    g.strokeStyle = '#ff8a3d'; g.lineWidth = 6; g.stroke();
    if (img) { const k = Math.min(300 / img.width, 170 / img.height); g.drawImage(img, 40, 128 - img.height * k / 2, img.width * k, img.height * k); }
    g.fillStyle = '#ffffff'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.font = '500 54px Arial, sans-serif'; g.fillText('TERMINAL DA', img ? 380 : 120, 86);
    g.font = '800 92px Arial, sans-serif'; g.fillText('REAL FORTE', img ? 380 : 120, 168);
    tex.needsUpdate = true;
  };
  desenhar(null);
  if (typeof LOGO !== 'undefined' && LOGO.claro) { const img = new Image(); img.onload = () => { try { desenhar(img); } catch (e) { desenhar(null); } }; img.src = LOGO.claro; }
  return tex;
}
/* Totem de direção: lâmina escura com o nome e a lista de destinos (com setas) e uma tela azul embaixo.
   Fica virado para (sen giro, cos giro). Quem consulta para na frente dele ('totem'). */
function totemDeDirecao(g, x, z, giro, M, obst, pt) {
  const T = THREE, grupo = new T.Group(); grupo.position.set(x, PLANO.ALT, z); grupo.rotation.y = giro; g.add(grupo);
  const c = document.createElement('canvas'); c.width = 256; c.height = 640; const q = c.getContext('2d');
  q.fillStyle = '#141a24'; q.fillRect(0, 0, 256, 640); q.fillStyle = '#ff8a3d'; q.fillRect(0, 0, 256, 6);
  q.fillStyle = '#ffffff'; q.textAlign = 'center'; q.font = '800 34px Arial, sans-serif'; q.fillText('REAL FORTE', 128, 70); q.fillStyle = '#ffb27a'; q.font = '500 18px Arial, sans-serif'; q.fillText('CONSULTORIA', 128, 96);
  ['Terminal', 'Empresas', 'Real Forte Lab', 'Café das Ideias', 'Praça Central'].forEach((t, i) => { const y = 160 + i * 58; q.fillStyle = 'rgba(255,255,255,.08)'; q.fillRect(18, y - 30, 220, 46); q.fillStyle = '#ffffff'; q.textAlign = 'left'; q.font = '500 22px Arial, sans-serif'; q.fillText(t, 32, y); q.textAlign = 'right'; q.fillStyle = '#ffb27a'; q.fillText('→', 226, y); });
  const gr = q.createLinearGradient(0, 470, 0, 630); gr.addColorStop(0, '#0d3a7a'); gr.addColorStop(1, '#38d6f5'); q.fillStyle = gr; q.fillRect(18, 470, 220, 150);
  q.strokeStyle = 'rgba(255,255,255,.8)'; q.lineWidth = 3; q.beginPath(); for (let k = 0; k <= 220; k += 4) q.lineTo(18 + k, 545 + Math.sin(k / 18) * 22); q.stroke();
  const tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding; tex.anisotropy = 8;
  caixa(grupo, 1.05, 2.9, 0.26, M.grafite, 0, 0, 0); caixa(grupo, 0.05, 2.7, 0.28, M.laranja, 0.5, 0.1, 0).castShadow = false;
  const pl = new T.Mesh(G3.placa, new T.MeshBasicMaterial({ map: tex, toneMapped: false })); pl.scale.set(0.95, 2.4, 1); pl.position.set(0, 1.5, 0.135); grupo.add(pl);
  const fx = Math.sin(giro), fz = Math.cos(giro);
  obst(x - 0.65, x + 0.65, z - 0.65, z + 0.65);
  pt('totem', x + fx * 0.95, z + fz * 0.95, -fx, -fz, 'olhar', 7);
  return grupo;
}
function montarPlano() {
  const T = THREE, P = PLANO, V = materiaisDaVida(); formasDaVida();
  const g = new T.Group(); CAMPO.cena.add(g); CAMPO.planoGrupo = g;
  const K = novoLote();
  const R = P.RUA / 2, C = P.CALC;
  const M = P.mats = {
    asfalto: mat(0x454c59, { roughness: 0.92 }), faixa: mat(0xf4f6f9, { roughness: 0.6 }),
    calcada: pisoNoturno(new T.MeshStandardMaterial({ color: 0xe2e6ec, roughness: 0.85 })),
    quadra: pisoNoturno(new T.MeshStandardMaterial({ color: 0xeef1f5, roughness: 0.8 })),
    pedra: pisoNoturno(new T.MeshStandardMaterial({ color: 0xdadfe7, roughness: 0.7 })),
    pedraClara: pisoNoturno(new T.MeshStandardMaterial({ color: 0xf1f3f6, roughness: 0.55, envMap: CAMPO.ambiente, envMapIntensity: 0.3 })),
    saibro: pisoNoturno(new T.MeshStandardMaterial({ color: 0xd8d0bf, roughness: 0.95 })),
    pcb: new T.MeshStandardMaterial({ color: 0x161d28, roughness: 0.5, metalness: 0.35 }),
    preto: mat(0x101318, { roughness: 0.4, metalness: 0.45 }), grafite: mat(0x252b35, { roughness: 0.5, metalness: 0.3 }),
    branco: mat(0xf4f6f9, { roughness: 0.45 }), pedraBege: mat(0xd9d3c7, { roughness: 0.75 }), metal: mat(0xc9d0da, { roughness: 0.35, metalness: 0.7 }),
    navy: mat(COR3D.navy, { roughness: 0.45, metalness: 0.35 }), laranja: luzMat(COR3D.laranja, 1.2), ciano: luzMat(0x38d6f5, 1.0), laranjaFraco: luzMat(COR3D.laranja, 0.6), cianoFraco: luzMat(0x38d6f5, 0.5),
    agua: new T.MeshStandardMaterial({ color: 0x4f8fd6, roughness: 0.08, metalness: 0.35, envMap: CAMPO.ambiente, envMapIntensity: 1, emissive: 0x1d4f8a, emissiveIntensity: 0.25 }),
    sebe: mat(0x3a5e30, { roughness: 0.9 }), tronco: mat(0x5e4630, { roughness: 1 }), copa: mat(0x4a7a38, { roughness: 0.85 }), copa2: mat(0x37602c, { roughness: 0.85 }),
    madeira: mat(0x9a6a42, { roughness: 0.8 }), estofado: mat(0xf1e6d6, { roughness: 0.9 }), lampadaQuente: luzMat(0xffd9a0, 1.4),
    vidroGuarda: new T.MeshStandardMaterial({ color: 0xcfe4f7, transparent: true, opacity: 0.3, roughness: 0.05, metalness: 0.4, depthWrite: false }),
    cabecaPoste: new T.MeshStandardMaterial({ color: 0xffe9c4, emissive: 0xffd28a, emissiveIntensity: 0.2, toneMapped: false })
  };
  [M.copa, M.copa2, M.sebe].forEach((m) => { m.userData.variarCor = true; });   // cada árvore com o seu tom de verde
  const caixaV = (m, x0, x1, z0, z1, y0, h, sombra) => K.add(G3.caixa, m, (x0 + x1) / 2, y0 || 0, (z0 + z1) / 2, x1 - x0, h, z1 - z0, 0, 0, 0, sombra);
  const obst = (x0, x1, z0, z1) => P.obst.push([Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1)]);
  const obstCirculo = (cx, cz, r) => { obst(cx - r * 0.92, cx + r * 0.92, cz - r * 0.38, cz + r * 0.38); obst(cx - r * 0.38, cx + r * 0.38, cz - r * 0.92, cz + r * 0.92); obst(cx - r * 0.7, cx + r * 0.7, cz - r * 0.7, cz + r * 0.7); };
  const lista = (k) => (P.pontos[k] = P.pontos[k] || []);
  const pt = (k, x, z, fx, fz, anim, dur, extra) => lista(k).push(ponto(x, z, rotDe(fx, fz), anim, Object.assign({ dur: dur || 14 }, extra || {})));
  const arvore = (x, z, k, semObst) => { const e = k || 1; K.add(G3.cil, M.tronco, x, 0.04, z, 0.07 * e, 0.6 * e, 0.07 * e); K.add(G3.copa, (Math.round(x * 7 + z * 3) % 2) ? M.copa : M.copa2, x, 0.04 + 1.0 * e, z, 0.6 * e, 0.72 * e, 0.6 * e, 0, (x + z) % 3, 0); { const a0 = (x * 1.7 + z) % 6.28; [0, 2.3, 4.4].forEach((da, n) => K.add(G3.copa, n % 2 ? M.copa2 : M.copa, x + Math.cos(a0 + da) * 0.34 * e, 0.04 + (1.2 + n * 0.12) * e, z + Math.sin(a0 + da) * 0.34 * e, 0.38 * e, 0.42 * e, 0.38 * e, 0, da, 0)); }   /* copa em vários volumes (mais natural) */ if (!semObst) obst(x - 0.3, x + 0.3, z - 0.3, z + 0.3); };
  const banco = (lst, x, z, fx, fz, comp) => {   // banco virado para (fx, fz); dois lugares
    const L = comp || 1.3, aoLongoDeX = Math.abs(fz) > Math.abs(fx);
    caixaV(M.pedraBege, x - (aoLongoDeX ? L / 2 : 0.21), x + (aoLongoDeX ? L / 2 : 0.21), z - (aoLongoDeX ? 0.21 : L / 2), z + (aoLongoDeX ? 0.21 : L / 2), 0.04, 0.36);
    obst(x - (aoLongoDeX ? L / 2 : 0.21), x + (aoLongoDeX ? L / 2 : 0.21), z - (aoLongoDeX ? 0.21 : L / 2), z + (aoLongoDeX ? 0.21 : L / 2));
    if (lst) [-0.32, 0.32].forEach((d) => pt(lst, x + (aoLongoDeX ? d : 0), z + (aoLongoDeX ? 0 : d), fx, fz, 'sentar', 16));
  };
  const placa = (texto, sub, x, z, giro, larg) => {   // totem com o nome (dos dois lados)
    const w = larg || 3.2, tex = texturaTexto(sub ? [texto, sub] : [texto], '#0f2342', '#ffffff', 640, 200);
    const m = new T.MeshBasicMaterial({ map: tex, toneMapped: false });
    const grupo = new T.Group(); grupo.position.set(x, 0, z); grupo.rotation.y = giro || 0; g.add(grupo);
    caixa(grupo, 0.18, 2.2, 0.18, M.navy, -w / 2 + 0.2, 0, 0); caixa(grupo, 0.18, 2.2, 0.18, M.navy, w / 2 - 0.2, 0, 0);
    caixa(grupo, w + 0.12, w * 200 / 640 + 0.12, 0.12, M.navy, 0, 1.25, 0);
    [0, Math.PI].forEach((r) => { const p = new T.Mesh(G3.placa, m); p.scale.set(w, w * 200 / 640, 1); p.rotation.y = r; p.position.set(0, 1.31 + w * 100 / 640, r ? -0.065 : 0.065); grupo.add(p); });
    const c = Math.cos(giro || 0), s = Math.sin(giro || 0);
    obst(x - Math.abs(c) * w / 2 - 0.1, x + Math.abs(c) * w / 2 + 0.1, z - Math.abs(s) * w / 2 - 0.1, z + Math.abs(s) * w / 2 + 0.1);
  };
  const alvo = (chave, x0, x1, z0, z1, h) => {   // caixa invisível para o mouse achar o centro
    const a = new T.Mesh(G3.caixa, new T.MeshBasicMaterial({ visible: false })); a.scale.set(x1 - x0, h, z1 - z0); a.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    a.userData.centro = chave; g.add(a); P.alvos.push(a); P.topoCentro = P.topoCentro || {}; P.topoCentro[chave] = { x: (x0 + x1) / 2, z: (z0 + z1) / 2, y: h };
  };

  /* Rooftop: deck de madeira, guarda-corpo de vidro, jardineiras, lounge com sofás, pérgola com
     luzinhas quentes e algumas pessoas sentadas conversando (a cidade tem vida também no alto) */
  P.brilhosNoite = []; P.gentesNoAlto = [];
  const terraco = (x0, x1, z0, z1, y, pessoas) => {
    caixaV(M.madeira, x0 + 0.1, x1 - 0.1, z0 + 0.1, z1 - 0.1, y, 0.06, false);
    [[x0, x1, z0, z0 + 0.04], [x0, x1, z1 - 0.04, z1], [x0, x0 + 0.04, z0, z1], [x1 - 0.04, x1, z0, z1]].forEach(([a, b, c, d]) => peca(g, G3.caixa, M.vidroGuarda, b - a, 0.55, d - c, (a + b) / 2, y, (c + d) / 2).castShadow = false);
    for (let x = x0 + 0.5; x < x1 - 0.8; x += 1.6) { caixaV(M.branco, x, x + 1.1, z0 + 0.15, z0 + 0.55, y, 0.35); K.add(G3.bola, M.copa, x + 0.55, y + 0.45, z0 + 0.35, 0.5, 0.32, 0.22); }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2 + 0.4;
    caixaV(M.estofado, cx - 1.4, cx - 0.5, cz - 0.9, cz + 0.9, y, 0.32); caixaV(M.estofado, cx + 0.5, cx + 1.4, cz - 0.9, cz + 0.9, y, 0.32);   // sofás
    K.add(G3.cil, M.grafite, cx, y, cz, 0.35, 0.3, 0.35);   // mesa de centro
    [[-1.8, -1.3], [1.8, -1.3], [-1.8, 1.3], [1.8, 1.3]].forEach(([a, b]) => K.add(G3.cil, M.preto, cx + a, y, cz + b, 0.05, 2.1, 0.05));
    for (let k = -1.8; k <= 1.81; k += 0.45) caixaV(M.preto, cx + k - 0.03, cx + k + 0.03, cz - 1.4, cz + 1.4, y + 2.1, 0.06, false);
    for (let k = -1.8; k <= 1.81; k += 0.6) [cz - 1.3, cz + 1.3].forEach((z) => K.add(G3.bola, M.lampadaQuente, cx + k, y + 2.0, z, 0.05, 0.05, 0.05));
    const b = brilho(g, 0xffc98a, 6, cx, y + 1.6, cz, 0); P.brilhosNoite.push(b);
    for (let n = 0; n < (pessoas || 0); n++) {
      const pes = novaPessoa(Object.assign(uniformeRealForte([0x1b1b1f, 0x3a2a1e, 0xe8c66a][n % 3], PELES[(n * 2 + 1) % PELES.length]), { escala: 1.32 }));
      const lado = n % 2 ? 1 : -1; pes.position.set(cx + lado * 0.95, y + 0.06, cz - 0.5 + Math.floor(n / 2) * 0.9); pes.rotation.y = lado > 0 ? Math.PI : 0; sentar(pes, false); g.add(pes);
      P.gentesNoAlto.push({ p: pes, f: n * 1.7 });
    }
  };

  // ---------- Avenidas, faixas e entradas da cidade ----------
  const zMin = P.ZR[0] - R, zMax = P.ZR[5] + R, xMin = P.XR[0] - R, xMax = P.XR[5] + R;
  const rua = (x0, x1, z0, z1) => { caixaV(M.asfalto, x0, x1, z0, z1, 0, 0.012, false); P.ruas.push([x0, x1, z0, z1]); };
  P.XR.forEach((x) => rua(x - R, x + R, zMin, zMax));
  P.ZR.forEach((z) => rua(xMin, xMax, z - R, z + R));
  P.entradas = [{ id: 'leste', no: [xMax - R, 29.5], fora: [150, 29.5] }, { id: 'oeste', no: [xMin + R, 29.5], fora: [-150, 29.5] }, { id: 'sul', no: [23.5, zMax - R], fora: [23.5, 155] }, { id: 'norte', no: [-23.5, zMin + R], fora: [-23.5, -150] }];
  rua(xMax, 152, 29.5 - R, 29.5 + R); rua(-152, xMin, 29.5 - R, 29.5 + R); rua(23.5 - R, 23.5 + R, zMax, 157); rua(-23.5 - R, -23.5 + R, -152, zMin);
  const tracejar = (ax, az, bx, bz) => {
    const L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
    for (let s = 1.2; s < L - 1.2; s += 2.4) K.add(G3.caixa, M.faixa, ax + dx * s, 0.012, az + dz * s, dx ? 1.2 : 0.1, 0.003, dz ? 1.2 : 0.1, 0, 0, 0, false);
  };
  P.XR.forEach((x) => { for (let k = 0; k < 5; k++) tracejar(x, P.ZR[k] + R, x, P.ZR[k + 1] - R); });
  P.ZR.forEach((z) => { for (let k = 0; k < 5; k++) tracejar(P.XR[k] + R, z, P.XR[k + 1] - R, z); });
  tracejar(xMax, 29.5, 150, 29.5); tracejar(-150, 29.5, xMin, 29.5); tracejar(23.5, zMax, 23.5, 155); tracejar(-23.5, -150, -23.5, zMin);
  // Faixa de pedestre no meio de cada trecho (é só ali que se atravessa)
  const faixaPedestre = (cx, cz, ruaAoLongoDeX) => {
    const w = ruaAoLongoDeX ? 2.2 : P.RUA, d = ruaAoLongoDeX ? P.RUA : 2.2;
    P.faixas.push([cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2]);
    for (let s = -2; s <= 2; s++) { const o = s * 0.95; if (ruaAoLongoDeX) K.add(G3.caixa, M.faixa, cx, 0.012, cz + o, 2.0, 0.003, 0.5, 0, 0, 0, false); else K.add(G3.caixa, M.faixa, cx + o, 0.012, cz, 0.5, 0.003, 2.0, 0, 0, 0, false); }
  };
  P.XR.forEach((x) => { for (let k = 0; k < 5; k++) faixaPedestre(x, (P.ZR[k] + P.ZR[k + 1]) / 2, false); });
  P.ZR.forEach((z) => { for (let k = 0; k < 5; k++) faixaPedestre((P.XR[k] + P.XR[k + 1]) / 2, z, true); });

  // ---------- Quadras: calçada em volta e o miolo (gramado nos lotes, piso nos centros) ----------
  const lotes = new Set(P.ORDEM_LOTES.map(([i, j]) => i + ',' + j));
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
    const b = blocoDe(i, j); P.quadras.push([b.x0, b.x1, b.z0, b.z1]);
    caixaV(M.calcada, b.x0, b.x1, b.z0, b.z0 + C, 0, P.ALT, false); caixaV(M.calcada, b.x0, b.x1, b.z1 - C, b.z1, 0, P.ALT, false);
    caixaV(M.calcada, b.x0, b.x0 + C, b.z0 + C, b.z1 - C, 0, P.ALT, false); caixaV(M.calcada, b.x1 - C, b.x1, b.z0 + C, b.z1 - C, 0, P.ALT, false);
    const miolo = lotes.has(i + ',' + j) ? V.grama : i === 0 && j === 0 ? M.pcb : M.quadra;
    caixaV(miolo, b.x0 + C, b.x1 - C, b.z0 + C, b.z1 - C, 0, lotes.has(i + ',' + j) ? 0.035 : P.ALT, false);
    // Postes na calçada (a cada ~10 m, longe das faixas e das quinas)
    const postes = [];
    [[b.x0 + 0.5, b.z0 + 0.5, b.x1 - 0.5, b.z0 + 0.5], [b.x0 + 0.5, b.z1 - 0.5, b.x1 - 0.5, b.z1 - 0.5], [b.x0 + 0.5, b.z0 + 0.5, b.x0 + 0.5, b.z1 - 0.5], [b.x1 - 0.5, b.z0 + 0.5, b.x1 - 0.5, b.z1 - 0.5]].forEach(([ax, az, bx, bz]) => {
      const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(L / 10));
      for (let k = 1; k < n; k++) { const u = k / n; if (Math.abs(u - 0.5) < 0.12) continue; postes.push([ax + (bx - ax) * u, az + (bz - az) * u]); }
    });
    postes.forEach(([x, z]) => { K.add(G3.cil, M.navy, x, 0.04, z, 0.05, 2.7, 0.05); K.add(G3.caixa, M.cabecaPoste, x, 2.72, z, 0.3, 0.06, 0.3, 0, 0, 0, false); obst(x - 0.1, x + 0.1, z - 0.1, z + 0.1); });
    P.postes = (P.postes || []).concat(postes);
  }

  // ---------- Base da sede em estilo placa-mãe ----------
  // Praça da frente em pedra clara; trilhas acesas saindo do hall; "chips" (prédios administrativos); jardins geométricos
  caixaV(M.pedraClara, -13, 13, 10.5, 25.4, P.ALT, 0.006, false);
  const trilha = (m, pts) => { for (let k = 0; k < pts.length - 1; k++) { const [ax, az] = pts[k], [bx, bz] = pts[k + 1]; caixaV(m, Math.min(ax, bx) - 0.04, Math.max(ax, bx) + 0.04, Math.min(az, bz) - 0.04, Math.max(az, bz) + 0.04, P.ALT, 0.006, false); } const [ex, ez] = pts[pts.length - 1]; K.add(G3.cil, m, ex, P.ALT, ez, 0.16, 0.008, 0.16, 0, 0, 0, false); };
  [-1, 1].forEach((s) => {
    for (let k = 0; k < 4; k++) { const z = -2.6 + k * 0.9 - (k > 1 ? 4.4 : 0); trilha(k % 2 ? M.cianoFraco : M.laranjaFraco, [[s * 10.15, z + (k > 1 ? 0 : 0)], [s * (11.5 + k * 0.7), z], [s * (11.5 + k * 0.7), -6.6 - k * 1.3], [s * 19.2, -6.6 - k * 1.3]]); }
    for (let k = 0; k < 3; k++) trilha(k % 2 ? M.laranjaFraco : M.cianoFraco, [[s * 10.15, 8.2 + k * 0.7], [s * (12 + k), 8.2 + k * 0.7], [s * (12 + k), 23 - k * 0.8], [s * 13, 23 - k * 0.8]]);
  });
  for (let k = 0; k < 6; k++) { const x = -7.5 + k * 3; trilha(k % 2 ? M.cianoFraco : M.laranjaFraco, [[x, -3.65], [x, -6 - (k % 3) * 1.2], [x + (k < 3 ? -2 : 2), -6 - (k % 3) * 1.2], [x + (k < 3 ? -2 : 2), -13.2]]); }
  // Chips: prédios administrativos pretos com "pinos" laranja e teto de vidro
  [[-16.5, -10.2, 5, 4.4], [16.5, -10.2, 5, 4.4], [-16.6, 13.2, 4.2, 3.6], [16.6, 13.2, 4.2, 3.6]].forEach(([x, z, w, d]) => {
    const vid = vidroComJanelas(6, 3, 0x14171d, '#ffcf9a', 0.5, 0.6);
    peca(g, G3.caixa, vid, w, 2.2, d, x, P.ALT, z).castShadow = true;
    caixaV(M.preto, x - w / 2 - 0.08, x + w / 2 + 0.08, z - d / 2 - 0.08, z + d / 2 + 0.08, 2.24, 0.14);
    for (let k = 0; k < Math.floor(w / 0.6); k++) [z - d / 2 - 0.25, z + d / 2 + 0.25].forEach((zz) => caixaV(M.laranjaFraco, x - w / 2 + 0.3 + k * 0.6 - 0.07, x - w / 2 + 0.3 + k * 0.6 + 0.07, zz - 0.18, zz + 0.18, P.ALT, 0.02, false));
    caixaV(M.laranja, x - w / 2, x + w / 2, z - d / 2 - 0.01, z + d / 2 + 0.01, 2.38, 0.04, false);
    obst(x - w / 2 - 0.3, x + w / 2 + 0.3, z - d / 2 - 0.3, z + d / 2 + 0.3);
  });
  // Jardins geométricos dos lados do hall
  [-1, 1].forEach((s) => {
    [[-6.2, -3.2], [11.5, 14.5]].forEach(([zA, zB], n) => {
      if (n === 1) return;
      const xa = s * 12.3, xb = s * 18.8, x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
      caixaV(M.sebe, x0, x1, zA, zA + 0.35, P.ALT, 0.5); caixaV(M.sebe, x0, x1, zB - 0.35, zB, P.ALT, 0.5);
      caixaV(V.grama, x0 + 0.3, x1 - 0.3, zA + 0.35, zB - 0.35, P.ALT, 0.02, false);
      [0.25, 0.5, 0.75].forEach((u) => K.add(G3.bola, M.sebe, x0 + (x1 - x0) * u, P.ALT + 0.35, (zA + zB) / 2, 0.38, 0.38, 0.38));
      obst(x0, x1, zA, zB);
    });
  });
  // Pontos de encontro dos consultores na praça da frente
  [[-7, 22.5], [7, 22.5]].forEach(([x, z]) => {
    K.add(G3.cil, M.branco, x, P.ALT, z, 0.55, 0.72, 0.55); obst(x - 0.55, x + 0.55, z - 0.55, z + 0.55);
    [0, 1, 2, 3].forEach((k) => { const a = k * Math.PI / 2 + 0.4, px = x + Math.cos(a) * 1.15, pz = z + Math.sin(a) * 1.15; pt('sedeFora', px, pz, x - px, z - pz, k % 2 ? 'conversar' : 'tablet', 14, { prop: k % 2 ? null : 'prancheta' }); });
  });

  // ---------- Centro de Diagnóstico Empresarial (frente, à direita) ----------
  {
    const k = 'diag';
    caixaV(M.pedra, 27.6, 37.4, 39.5, 55.5, P.ALT, 0.006, false);
    const vid = vidroComJanelas(10, 8, 0x2b4f78, '#e3f2ff', 0.6);
    peca(g, G3.caixa, vid, 12, 8, 14, 44, P.ALT, 47.5).castShadow = true;
    [2, 4, 6].forEach((y) => caixaV(M.branco, 37.9, 50.1, 40.4, 54.6, P.ALT + y, 0.18));
    caixaV(M.branco, 37.8, 50.2, 40.3, 54.7, P.ALT + 8, 0.28);
    terraco(39, 49, 47.2, 54, P.ALT + 8.28, 3); caixaV(V.grama, 38.4, 49.6, 41, 46.6, P.ALT + 8.28, 0.06, false);   // rooftop e jardim suspenso
    for (let z = 41; z <= 54.1; z += 1.45) caixaV(M.branco, 37.85, 38.05, z - 0.06, z + 0.06, P.ALT, 8);   // brises verticais
    const vid2 = vidroComJanelas(6, 2, 0x2b4f78, '#e3f2ff', 0.6);
    peca(g, G3.caixa, vid2, 10, 3.6, 6.6, 49, P.ALT, 37.2).castShadow = true;
    caixaV(V.grama, 44.2, 53.8, 34.1, 40.3, P.ALT + 3.6, 0.1, false);   // teto jardim
    caixaV(M.branco, 34.2, 38, 43.8, 51.2, 3.0, 0.22); caixaV(M.laranja, 34.3, 37.9, 43.9, 51.1, 2.98, 0.03, false);   // marquise
    [44.2, 50.8].forEach((z) => { K.add(G3.cil, M.metal, 34.5, P.ALT, z, 0.07, 3, 0.07); obst(34.35, 34.65, z - 0.15, z + 0.15); });
    obst(38, 50, 40.5, 54.5); obst(44, 54, 33.9, 40.5);
    placa('CENTRO DE DIAGNÓSTICO', 'Real Forte', 30.2, 55.6, Math.PI / 2, 3.4);
    [[30, 41.4], [30, 53.4]].forEach(([x, z]) => { caixaV(M.branco, x - 0.8, x + 0.8, z - 0.8, z + 0.8, P.ALT, 0.5); arvore(x, z, 1.0, true); obst(x - 0.8, x + 0.8, z - 0.8, z + 0.8); });
    banco(k, 33.2, 41.6, 0, 1); banco(k, 33.2, 53.4, 0, -1);
    [46, 47.5, 49].forEach((z) => pt(k, 36.4, z, 1, 0, 'olhar', 9));
    pt(k, 31.6, 46.6, 1, 0.7, 'conversar', 14); pt(k, 32.5, 47.6, -1, -0.7, 'conversar', 14); pt(k, 35.2, 44.6, 0, 1, 'tablet', 12, { prop: 'prancheta' });
    alvo(k, 34, 54, 33.9, 54.7, 8.3);
    P.entradaCentro = P.entradaCentro || {}; P.entradaCentro[k] = [36.4, 47.5];
  }
  // ---------- Centro de Estratégia e Soluções (esquerda): pódio de pedra, torre executiva, jardins ----------
  {
    const k = 'estr';
    caixaV(M.pedra, -37, -27.6, -3, 15, P.ALT, 0.006, false);
    caixaV(M.pedraBege, -52, -36.2, -5, 17, P.ALT, 3.2);
    const vidP = vidroComJanelas(12, 2, 0x1c2533, '#ffe3b8', 0.7);
    peca(g, G3.caixa, vidP, 0.1, 2.6, 18, -36.15, P.ALT + 0.2, 6).castShadow = false;
    const vidT = vidroComJanelas(6, 14, 0x1a2230, '#ffe3b8', 0.5);
    peca(g, G3.caixa, vidT, 10, 17, 10, -44, P.ALT + 3.2, 6).castShadow = true;
    for (let a = -48.5; a <= -39.4; a += 1.5) { caixaV(M.pedraBege, a - 0.09, a + 0.09, 0.85, 1.05, 3.2, 17); caixaV(M.pedraBege, a - 0.09, a + 0.09, 10.95, 11.15, 3.2, 17); }
    for (let z = 1.5; z <= 10.6; z += 1.5) { caixaV(M.pedraBege, -49.15, -48.95, z - 0.09, z + 0.09, 3.2, 17); caixaV(M.pedraBege, -39.05, -38.85, z - 0.09, z + 0.09, 3.2, 17); }
    caixaV(M.preto, -49.3, -38.7, 0.7, 11.3, 20.2, 0.4); caixaV(M.laranja, -49.35, -38.65, 0.65, 11.35, 20.6, 0.06, false);
    terraco(-48.9, -39.1, 1.1, 10.9, 20.66, 4);   // lounge executivo no alto da torre
    obst(-52, -36.2, -5, 17);
    // Espelho d'água e bancos na pracinha da entrada
    caixaV(M.pedraBege, -34.4, -30.6, 1.0, 11.0, P.ALT, 0.3); caixaV(M.agua, -34.2, -30.8, 1.2, 10.8, P.ALT, 0.32, false); obst(-34.4, -30.6, 1.0, 11.0);
    banco(k, -29.4, 2.5, 1, 0); banco(k, -29.4, 9.5, 1, 0);
    // Jardins geométricos (norte e sul do lote)
    [[-12.8, -6.5], [18.5, 25]].forEach(([za, zb]) => {
      for (let x = -54; x < -29; x += 4.2) { caixaV(M.sebe, x, x + 3.2, za, zb, P.ALT, 0.55); obst(x, x + 3.2, za, zb); K.add(G3.bola, M.copa2, x + 1.6, P.ALT + 0.55, (za + zb) / 2, 0.7, 0.7, 0.7); }
    });
    placa('CENTRO DE ESTRATÉGIA', 'e Soluções', -29.6, -4.2, -Math.PI / 2, 3.4);
    [4.5, 6, 7.5].forEach((z) => pt(k, -35.3, z, -1, 0, 'olhar', 9));
    pt(k, -29.6, 5.4, 1, 0.6, 'conversar', 14); pt(k, -28.8, 6.4, -1, -0.6, 'conversar', 14); pt(k, -30, 13.4, 0, -1, 'tablet', 12, { prop: 'prancheta' });
    alvo(k, -52, -36.2, -5, 17, 21);
    P.entradaCentro.estr = [-35.3, 6];
  }
  // ---------- Centro de Inteligência Artificial (direita): torre facetada torcida, cúpula, painéis e robôs ----------
  {
    const k = 'ia';
    caixaV(M.pedra, 27.6, 38.6, -3, 15, P.ALT, 0.006, false);
    const anel = new T.Mesh(G3.anel, M.ciano); anel.scale.set(2.6, 1, 2.6); anel.position.set(32.6, P.ALT + 0.02, 6); g.add(anel);
    obst(30.2, 35, 3.6, 8.4);
    const vid = vidroComJanelas(16, 2, 0x18283c, '#9fe8ff', 0.5, 0.9);
    const geoNivel = new T.CylinderGeometry(5.5, 5.5, 1.62, 12).translate(0, 0.81, 0);
    for (let n = 0; n < 9; n++) {
      const nivel = new T.Mesh(geoNivel, vid); nivel.position.set(45, P.ALT + n * 1.75, 6); nivel.rotation.y = n * 0.12; nivel.castShadow = true; g.add(nivel);
      K.add(G3.cil, M.grafite, 45, P.ALT + n * 1.75 + 1.62, 6, 5.7, 0.13, 5.7, 0, 0, 0, false);   // laje entre os andares
      if (n % 3 === 2 && n < 8) { const f = new T.Mesh(G3.anel, M.laranja); f.scale.set(5.75, 2.5, 5.75); f.position.set(45, P.ALT + n * 1.75 + 1.68, 6); g.add(f); }   // anel de luz laranja
    }
    const coroa = new T.Mesh(G3.anel, M.laranja); coroa.scale.set(4.2, 3, 4.2); coroa.position.set(45, P.ALT + 16.6, 6); g.add(coroa); P.animados.push((t) => { coroa.rotation.y = t * 0.4; });
    K.add(G3.cil, M.metal, 45, P.ALT + 15.8, 6, 0.08, 4.5, 0.08);
    obstCirculo(45, 6, 5.9);
    const cupula = new T.Mesh(new T.SphereGeometry(4, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshStandardMaterial({ color: 0x9fd6ff, roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.55, envMap: CAMPO.ambiente, envMapIntensity: 1 }));
    cupula.position.set(47.5, P.ALT, 20); g.add(cupula); caixaV(M.grafite, 43.4, 51.6, 15.9, 24.1, P.ALT, 0.25); obst(43.4, 51.6, 15.9, 24.1);
    { const f = new T.Mesh(G3.anel, M.laranja); f.scale.set(4.05, 2, 4.05); f.position.set(47.5, P.ALT + 0.27, 20); g.add(f); }
    // Painéis de dados na entrada (as ondas se mexem)
    P.paineisIA = [];
    [-1.4, 13.4].forEach((z) => {
      const tela = telaDe(256, 320, () => {}); const tex = new T.CanvasTexture(tela); tex.encoding = T.sRGBEncoding;
      const m = new T.MeshBasicMaterial({ map: tex, toneMapped: false });
      caixaV(M.preto, 33.4, 33.6, z - 1.35, z + 1.35, P.ALT, 3.5);
      const p = new T.Mesh(G3.placa, m); p.scale.set(2.5, 3.1, 1); p.rotation.y = -Math.PI / 2; p.position.set(33.35, P.ALT + 1.95, z); g.add(p);
      obst(33.3, 33.7, z - 1.35, z + 1.35); P.paineisIA.push({ tela, tex });
      pt(k, 31.8, z + (z < 6 ? 0.4 : -0.4), 1, 0, 'olhar', 10);
    });
    placa('CENTRO DE IA', 'Inteligência Artificial', 29.6, 16.4, Math.PI / 2, 3.2);
    [4.8, 6, 7.2].forEach((z) => pt(k, 38.2, z, 1, 0, 'olhar', 9));
    pt(k, 29.2, 10.2, 1, -1, 'tablet', 12); pt(k, 29.2, 1.8, 1, 1, 'conversar', 12); pt(k, 30.2, 1.4, -1, 0.3, 'conversar', 12);
    P.robosAnel = { cx: 32.6, cz: 6, r: 2.6, n: 2 };
    alvo(k, 39, 51.6, -0.1, 24.1, 19);
    P.entradaCentro.ia = [38.2, 6];
  }
  // ---------- Centro de Performance e Resultados (fundo): prédio institucional com linhas de luz e barras subindo ----------
  {
    const k = 'perf';
    caixaV(M.pedra, -15, 15, -28.4, -21.6, P.ALT, 0.006, false);
    const vid = vidroComJanelas(18, 6, 0x22344d, '#fff1d6', 0.55);
    peca(g, G3.caixa, vid, 30, 9, 11, 0, P.ALT, -34.5).castShadow = true;
    // Fachada Viva: luz integrada às lâminas da fachada, reage ao movimento da cidade (desenhada em passoPlano)
    for (let x = -14.6; x <= 14.65; x += 0.73) caixaV(M.grafite, x - 0.04, x + 0.04, -29.18, -28.98, P.ALT + 0.2, 8.6, false);
    { const tela = document.createElement('canvas'); tela.width = 1024; tela.height = 320; const tex = new T.CanvasTexture(tela); tex.encoding = T.sRGBEncoding;
      const fv = new T.Mesh(G3.placa, new T.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false })); fv.scale.set(29.6, 8.8, 1); fv.position.set(0, P.ALT + 4.5, -28.95); fv.renderOrder = 3; g.add(fv);
      P.fachadaViva = { tela, tex, pico: 0 }; }
    caixaV(M.branco, -15.2, 15.2, -40.2, -28.8, P.ALT + 9, 0.3);
    caixaV(M.grafite, -6, 6, -38, -31, P.ALT + 9.3, 1.2);
    terraco(-14.6, -7, -39.6, -30, P.ALT + 9.34, 2); terraco(7, 14.6, -39.6, -30, P.ALT + 9.34, 0);   // rooftops
    obst(-15, 15, -40, -29);
    [-10, -5, 5, 10].forEach((x) => { K.add(G3.cil, M.grafite, x, P.ALT, -22.6, 0.14, 0.7, 0.14); obst(x - 0.16, x + 0.16, -22.76, -22.44); });
    banco(k, -9, -25.6, 0, 1); banco(k, 9, -25.6, 0, 1);
    placa('CENTRO DE PERFORMANCE', 'e Resultados', -13, -23.4, 0, 3.4);
    [-1.5, 0, 1.5].forEach((x) => pt(k, x, -28, 0, -1, 'olhar', 9));
    pt(k, 4.5, -24.4, 0, -1, 'tablet', 12, { prop: 'prancheta' }); pt(k, -4.2, -24.1, 1, 0, 'conversar', 12); pt(k, -3.3, -24.1, -1, 0, 'conversar', 12);
    alvo(k, -15, 15, -40, -28.8, 10.5);
    P.entradaCentro.perf = [0, -28];
  }
  // ---------- Centro de Apresentações e Negócios (frente, à esquerda): pavilhão com abóbada e auditório ----------
  {
    const k = 'apres';
    caixaV(M.pedra, -36.4, -27.6, 39.5, 55.5, P.ALT, 0.006, false);
    const vid = vidroComJanelas(14, 2, 0x2c4a6f, '#fff3dd', 0.65);
    peca(g, G3.caixa, vid, 14, 4.2, 19, -43, P.ALT, 47.5).castShadow = true;
    const geoAbobada = new T.CylinderGeometry(1, 1, 1, 28, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2);   // meio cilindro deitado (eixo no z), aberto para baixo
    const abobada = new T.Mesh(geoAbobada, M.branco); abobada.scale.set(8, 2.6, 20); abobada.position.set(-43, P.ALT + 4.2, 47.5); abobada.castShadow = true; g.add(abobada);
    caixaV(M.laranja, -51, -35, 37.4, 37.5, P.ALT + 4.15, 0.06, false); caixaV(M.laranja, -51, -35, 57.5, 57.6, P.ALT + 4.15, 0.06, false);
    [[-55, -52.6, 5.4], [-52.6, -50.2, 6.2], [-50.2, -50.05, 0]].forEach(([a, b, h]) => { if (h) { caixaV(M.grafite, a, b, 41, 54, P.ALT, h); caixaV(M.laranja, a, b, 40.96, 41.0, P.ALT + h - 0.5, 0.08, false); } });
    obst(-55.2, -36, 38, 57); obst(-55, -50.2, 41, 54);
    caixaV(M.branco, -36.2, -31.6, 43.8, 51.2, 3.1, 0.22); caixaV(M.laranja, -36.1, -31.7, 43.9, 51.1, 3.08, 0.03, false);
    [44.2, 50.8].forEach((z) => { K.add(G3.cil, M.metal, -31.9, P.ALT, z, 0.07, 3.1, 0.07); obst(-32.05, -31.75, z - 0.15, z + 0.15); });
    [[-29.6, 41.4], [-29.6, 53.4]].forEach(([x, z]) => { caixaV(M.branco, x - 0.8, x + 0.8, z - 0.8, z + 0.8, P.ALT, 0.5); arvore(x, z, 1.0, true); obst(x - 0.8, x + 0.8, z - 0.8, z + 0.8); });
    placa('CENTRO DE APRESENTAÇÕES', 'e Negócios', -30.2, 39.4, -Math.PI / 2, 3.6);
    [46, 47.5, 49].forEach((z) => pt(k, -35.3, z, -1, 0, 'olhar', 9));
    pt(k, -33.4, 42.6, 0, 1, 'conversar', 14); pt(k, -33.4, 43.6, 0, -1, 'conversar', 14); pt(k, -33.6, 52.4, -1, 0, 'tablet', 12, { prop: 'prancheta' });
    alvo(k, -55.2, -31.6, 37.4, 57.6, 7.2);
    P.entradaCentro.apres = [-35.3, 47.5];
  }
  // ---------- Praça das Conexões e Estação Central (frente da sede) ----------
  {
    const k = 'conexoes';
    caixaV(M.pedra, -19.4, 19.4, 33.6, 61.4, P.ALT, 0.006, false);
    K.add(G3.cil, M.pedraClara, 0, P.ALT + 0.006, 50, 11.5, 0.006, 11.5, 0, 0, 0, false);
    // Espelho d'água com o holograma da torre da Real Forte flutuando em cima
    K.add(G3.cil, M.pedraBege, 0, P.ALT, 50, 4.9, 0.32, 4.9); K.add(G3.cil, M.agua, 0, P.ALT, 50, 4.6, 0.34, 4.6, 0, 0, 0, false); obstCirculo(0, 50, 5.0);
    PLANO.holograma = hologramaDaTorre(g, 0, 50);   /* holograma gigante da torre da Real Forte flutuando sobre o espelho d'água */
    for (let n = 0; n < 8; n++) { const a = n / 8 * Math.PI * 2 + Math.PI / 8, x = Math.cos(a) * 8.2, z = 50 + Math.sin(a) * 8.2; if (z < 41) continue; banco(k, x, z, -Math.cos(a), -Math.sin(a), 1.2); }
    for (let n = 0; n < 12; n++) { const a = n / 12 * Math.PI * 2, x = Math.cos(a) * 13.2, z = 50 + Math.sin(a) * 13.2; if (z > 39.5 && z < 60.5 && Math.abs(x) < 18.5) arvore(x, z, 1.1); }
    for (let n = 0; n < 10; n++) { const a = n / 10 * Math.PI * 2, x = Math.cos(a) * 5.8, z = 50 + Math.sin(a) * 5.8; pt(k, x, z, -Math.cos(a), -Math.sin(a), n % 3 ? 'olhar' : 'conversar', 12); }
    pt(k, -10, 44, 1, 0, 'conversar', 14); pt(k, -9.1, 44, -1, 0, 'conversar', 14); pt(k, 10, 56, 1, 0, 'conversar', 14); pt(k, 10.9, 56, -1, 0, 'conversar', 14);
    // Estação Central: cobertura longa com borda laranja, pilares e bancos
    caixaV(M.branco, -16.2, -0.8, 33.7, 37.3, 3.0, 0.2); caixaV(M.laranja, -16.25, -0.75, 33.66, 33.72, 2.98, 0.24, false);
    const vidroE = new T.MeshStandardMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.4, depthWrite: false });
    peca(g, G3.caixa, vidroE, 13.6, 0.05, 1.4, -8.5, 3.21, 35.5).castShadow = false;
    for (let x = -15.6; x <= -1.3; x += 2.86) { K.add(G3.cil, M.metal, x, P.ALT, 36.9, 0.08, 3, 0.08); obst(x - 0.15, x + 0.15, 36.75, 37.05); }
    [-13.5, -4].forEach((x) => { caixaV(M.pedraBege, x - 0.9, x + 0.9, 36.3, 36.7, P.ALT, 0.36); obst(x - 0.9, x + 0.9, 36.3, 36.7); [-0.45, 0.45].forEach((d) => pt('central', x + d, 36.1, 0, -1, 'sentar', 30)); });
    placa('ESTAÇÃO CENTRAL', 'Cápsulas · Linha Sede', -18.2, 38.6, Math.PI / 2, 3.4);
    // Estação Real Forte: o terminal de onde saem os ônibus que ligam todas as empresas
    caixaV(M.navy, 1.4, 17.6, 33.5, 37.5, 3.2, 0.3); caixaV(M.laranja, 1.35, 17.65, 33.45, 33.52, 3.18, 0.34, false); caixaV(M.laranja, 1.35, 17.65, 37.48, 37.55, 3.18, 0.34, false);
    for (let x = 2.0; x <= 17.1; x += 3.0) { K.add(G3.cil, M.navy, x, P.ALT, 37.1, 0.12, 3.2, 0.12); obst(x - 0.18, x + 0.18, 36.92, 37.28); }
    [5, 13].forEach((x) => { caixaV(M.pedraBege, x - 1.0, x + 1.0, 36.2, 36.6, P.ALT, 0.36); obst(x - 1.0, x + 1.0, 36.2, 36.6); [-0.5, 0.5].forEach((d) => pt('terminal', x + d, 36.0, 0, -1, 'sentar', 30)); });
    if (typeof LOGO !== 'undefined' && LOGO.claro) {
      const texL = new T.TextureLoader().load(LOGO.claro); texL.encoding = T.sRGBEncoding;
      const mL = new T.MeshBasicMaterial({ map: texL, transparent: true, toneMapped: false, depthWrite: false });
      caixaV(M.navy, 6.6, 12.4, 33.3, 33.5, 3.5, 1.5);
      const pl = new T.Mesh(G3.placa, mL); pl.scale.set(5.2, 5.2 / LOGO.proporcao, 1); pl.rotation.y = Math.PI; pl.position.set(9.5, 4.25, 33.28); g.add(pl);
    }
    placa('PONTO REAL FORTE', 'Ônibus · Praça das Conexões', 19.2, 38.6, Math.PI / 2, 3.4);
    alvo('conexoes', -19.4, 19.4, 33.6, 61.4, 0.6);
    // ---------- Café das Ideias: pavilhão de vidro e metal com mesas do lado de fora e luz quente ----------
    {
      const kc = 'cafeIdeias', X0 = 15.2, X1 = 19.2, Z0 = 44, Z1 = 52;
      caixaV(M.madeira, X0 - 1.6, X1 + 0.2, Z0 - 0.6, Z1 + 0.6, P.ALT, 0.04, false);
      const vidroC = new T.MeshStandardMaterial({ color: 0xffe2b8, transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.3, emissive: 0xffb56b, emissiveIntensity: 0.25, depthWrite: false });
      P.vidroCafe = vidroC;
      // Paredes de vidro; a porta fica no meio da fachada oeste (z 47 a 49), de frente para a praça
      const DZ0 = 47, DZ1 = 49, XB = 17.7;   // XB: frente do balcão (o balcão fica encostado na parede leste)
      [[X0, X0 + 0.05, Z0, DZ0], [X0, X0 + 0.05, DZ1, Z1], [X1 - 0.05, X1, Z0, Z1], [X0, X1, Z0, Z0 + 0.05], [X0, X1, Z1 - 0.05, Z1]].forEach(([a, b, c, d]) => peca(g, G3.caixa, vidroC, b - a, 2.9, d - c, (a + b) / 2, P.ALT, (c + d) / 2).castShadow = false);
      peca(g, G3.caixa, vidroC, 0.05, 0.6, DZ1 - DZ0, X0 + 0.025, P.ALT + 2.3, 48).castShadow = false;   // vidro em cima da porta
      for (let z = Z0; z <= Z1 + 0.01; z += 2) [X0, X1].forEach((x) => { if (x === X0 && z > DZ0 - 0.1 && z < DZ1 + 0.1) return; K.add(G3.caixa, M.preto, x, P.ALT, z, 0.08, 2.9, 0.08); });
      [DZ0, DZ1].forEach((z) => K.add(G3.caixa, M.preto, X0, P.ALT, z, 0.1, 2.9, 0.1));   // batentes da porta
      caixaV(M.branco, X0 - 0.9, X1 + 0.3, Z0 - 0.7, Z1 + 0.7, P.ALT + 2.9, 0.18); caixaV(M.laranja, X0 - 0.95, X1 + 0.35, Z0 - 0.75, Z1 + 0.75, P.ALT + 2.88, 0.04, false);   // cobertura
      caixaV(M.lampadaQuente, X0 + 0.4, X1 - 0.4, Z0 + 0.4, Z1 - 0.4, P.ALT + 2.86, 0.02, false);   // luz do teto
      // Balcão comprido na parede leste (na escala das pessoas): madeira, tampo de pedra e um filete laranja na frente
      const HB = 0.5;   // altura do balcão
      caixaV(M.madeira, XB, XB + 0.55, Z0 + 0.9, Z1 - 0.9, P.ALT, HB); caixaV(M.pedraBege, XB - 0.05, XB + 0.6, Z0 + 0.85, Z1 - 0.85, P.ALT + HB, 0.04);
      caixaV(M.laranja, XB - 0.02, XB, Z0 + 0.9, Z1 - 0.9, P.ALT + HB - 0.1, 0.03, false);
      // Máquina de expresso, xícaras, vitrine de doces
      const YT = P.ALT + HB + 0.04;
      caixaV(M.metal, XB + 0.15, XB + 0.5, 45.65, 46.35, YT, 0.26); caixaV(M.preto, XB + 0.13, XB + 0.16, 45.75, 46.25, YT + 0.08, 0.12, false);
      [45.9, 46.1].forEach((z) => K.add(G3.cil, M.preto, XB + 0.1, YT + 0.06, z, 0.015, 0.05, 0.015));   // bicos
      [46.8, 46.95, 47.1].forEach((z) => K.add(G3.cil, M.branco, XB + 0.25, YT, z, 0.035, 0.045, 0.035));
      peca(g, G3.caixa, M.vidroGuarda, 0.42, 0.2, 1.0, XB + 0.28, YT, 50.0).castShadow = false;
      [49.7, 50.0, 50.3].forEach((z, n) => K.add(G3.bola, n === 1 ? M.laranjaFraco : M.madeira, XB + 0.28, YT + 0.05, z, 0.07, 0.045, 0.07));
      caixaV(M.preto, XB + 0.2, XB + 0.45, 48.2, 48.5, YT, 0.12);   // caixa registradora
      // Prateleiras na parede do fundo com potes, e o cardápio em cima
      [0.72, 0.98].forEach((y) => { caixaV(M.madeira, X1 - 0.25, X1 - 0.07, Z0 + 1, Z1 - 1, P.ALT + y, 0.03); for (let z = Z0 + 1.3; z < Z1 - 1.1; z += 0.5) K.add(G3.cil, [M.branco, M.laranjaFraco, M.navy][Math.round(z * 2) % 3], X1 - 0.16, P.ALT + y + 0.03, z, 0.045, 0.12, 0.045); });
      const texM = texturaTexto(['CARDÁPIO', 'Expresso · Cappuccino · Pão de queijo · Bolo do dia'], '#1d1d1f', '#ffe9cf', 900, 200);
      const pm = new T.Mesh(G3.placa, new T.MeshBasicMaterial({ map: texM, toneMapped: false })); pm.scale.set(2.4, 0.53, 1); pm.rotation.y = -Math.PI / 2; pm.position.set(X1 - 0.08, P.ALT + 1.5, 48); g.add(pm);
      // Luminárias pendentes sobre o balcão
      [46.3, 48, 49.7].forEach((z) => { K.add(G3.cil, M.preto, XB + 0.3, P.ALT + 1.45, z, 0.008, 1.42, 0.008); K.add(G3.bola, M.lampadaQuente, XB + 0.3, P.ALT + 1.4, z, 0.09, 0.07, 0.09); });
      // Duas mesinhas lá dentro, uma em cada ponta, com dois banquinhos cada
      [45.3, 50.7].forEach((z) => {
        const x = 16.3; K.add(G3.cil, M.branco, x, P.ALT, z, 0.26, 0.6, 0.26); obst(x - 0.26, x + 0.26, z - 0.26, z + 0.26);
        [-1, 1].forEach((sx) => { const px = x + sx * 0.55; K.add(G3.cil, M.madeira, px, P.ALT, z, 0.12, 0.4, 0.12); pt(kc, px, z, x - px, 0, 'cafe', 18); });
      });
      // Paredes e balcão viram obstáculo; a porta fica livre
      obst(X0 - 0.05, X0 + 0.1, Z0, DZ0 - 0.05); obst(X0 - 0.05, X0 + 0.1, DZ1 + 0.05, Z1);
      obst(X0, X1, Z0 - 0.05, Z0 + 0.1); obst(X0, X1, Z1 - 0.1, Z1 + 0.05); obst(XB, X1 + 0.05, Z0, Z1);
      const texC = texturaTexto(['CAFÉ DAS IDEIAS', 'encontros · conversas · pausa'], '#3a2416', '#ffe9cf', 640, 180);
      const pc = new T.Mesh(G3.placa, new T.MeshBasicMaterial({ map: texC, toneMapped: false })); pc.scale.set(3.6, 1.0, 1); pc.rotation.y = -Math.PI / 2; pc.position.set(X0 - 0.92, P.ALT + 3.6, (Z0 + Z1) / 2); g.add(pc);
      caixaV(M.preto, X0 - 0.9, X0 - 0.85, Z0 + 2.1, Z1 - 2.1, P.ALT + 3.05, 1.12);
      [47.4, 48, 48.6].forEach((z) => pt(kc, XB - 0.4, z, 1, 0, 'olhar', 9));   // pedindo no balcão (lá dentro)
      // Barista da Real Forte: anda pelo balcão entre a máquina, o caixa e a vitrine
      {
        const barista = novaPessoa(Object.assign(uniformeRealForte(0x3a2a1e, PELES[3 % PELES.length]), { escala: 1.32 }));
        barista.position.set(XB + 0.95, P.ALT + 0.04, 48); barista.rotation.y = Math.PI; g.add(barista);
        const estacoes = [46.0, 48.0, 50.0, 48.0], CICLO = 5.5;
        P.animados.push((t) => {
          const k = Math.floor(t / CICLO), u = (t % CICLO) / CICLO, de = estacoes[k % 4], ate = estacoes[(k + 1) % 4];
          const mov = Math.min(1, Math.max(0, (u - 0.7) / 0.3));   // 70% do tempo trabalhando, o resto andando até o próximo lugar
          barista.position.z = de + (ate - de) * mov;
          const pe = barista.userData.pernas, br = barista.userData.bracos;
          if (mov > 0 && mov < 1) { const s = Math.sin(t * 9); pe[0].rotation.z = s * 0.5; pe[1].rotation.z = -s * 0.5; br[0].rotation.z = -s * 0.3; br[1].rotation.z = s * 0.3; barista.rotation.y = ate > de ? -Math.PI / 2 : Math.PI / 2; }
          else { pe[0].rotation.z = 0; pe[1].rotation.z = 0; br[0].rotation.z = 0.9 + Math.sin(t * 2.3) * 0.25; br[1].rotation.z = 0.7 + Math.max(0, Math.sin(t * 1.7 + 1)) * 0.5; barista.rotation.y = Math.PI; }
        });
      }
      // Mesas do lado de fora (norte e sul do pavilhão), com luzinhas em varal
      [[15.6, 55.4], [18.4, 57.2], [15.6, 59.6], [16.4, 41.4]].forEach(([x, z]) => {
        K.add(G3.cil, M.branco, x, P.ALT, z, 0.5, 0.72, 0.5); obst(x - 0.5, x + 0.5, z - 0.5, z + 0.5);
        [0, 2.1, 4.2].forEach((a) => { const px = x + Math.cos(a) * 0.95, pz = z + Math.sin(a) * 0.95; K.add(G3.cil, M.madeira, px, P.ALT, pz, 0.16, 0.42, 0.16); pt(kc, px, pz, x - px, z - pz, 'cafe', 16); });
      });
      [[14.2, 53.2], [19.6, 53.2], [14.2, 61.2], [19.6, 61.2]].forEach(([x, z]) => { K.add(G3.cil, M.preto, x, P.ALT, z, 0.04, 2.6, 0.04); obst(x - 0.08, x + 0.08, z - 0.08, z + 0.08); });
      for (let k = 0; k <= 10; k++) { const u = k / 10; [[14.2, 19.6, 53.2], [14.2, 19.6, 61.2]].forEach(([a, b, z]) => K.add(G3.bola, M.lampadaQuente, a + (b - a) * u, P.ALT + 2.45 - Math.sin(u * Math.PI) * 0.3, z, 0.05, 0.05, 0.05)); [[53.2, 61.2, 14.2], [53.2, 61.2, 19.6]].forEach(([a, b, x]) => K.add(G3.bola, M.lampadaQuente, x, P.ALT + 2.45 - Math.sin(u * Math.PI) * 0.3, a + (b - a) * u, 0.05, 0.05, 0.05)); }
      [[14.4, 43.4], [14.4, 52.6]].forEach(([x, z]) => { caixaV(M.branco, x - 0.5, x + 0.5, z - 0.5, z + 0.5, P.ALT, 0.45); K.add(G3.bola, M.copa, x, P.ALT + 0.62, z, 0.45, 0.38, 0.45); obst(x - 0.5, x + 0.5, z - 0.5, z + 0.5); });
      P.brilhosNoite.push(brilho(g, 0xffc98a, 9, 17.2, 2.0, 48, 0), brilho(g, 0xffc98a, 7, 17, 1.8, 57.4, 0));
      alvo('cafe', X0 - 0.9, X1 + 0.3, Z0 - 0.7, Z1 + 0.7, 3.2);
    }
  }
  // ---------- Praça da Estratégia (fundo, à esquerda): jardim geométrico, monumento e mesas de reunião ----------
  {
    const k = 'pracaEstr', cx = -41.5, cz = -35.5;
    caixaV(M.saibro, -55.4, -27.6, -49.4, -21.6, P.ALT, 0.006, false);
    [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]].forEach(([a, b], n) => {
      const x = cx + a * 8.6, z = cz + b * 8.6;
      if (n === 1 || n === 6) {   // mesas de reunião ao ar livre
        K.add(G3.cil, M.branco, x, P.ALT, z, 0.7, 0.72, 0.7); obst(x - 0.7, x + 0.7, z - 0.7, z + 0.7);
        [0, 1, 2, 3].forEach((q) => { const an = q * Math.PI / 2 + 0.3, px = x + Math.cos(an) * 1.3, pz = z + Math.sin(an) * 1.3; pt(k, px, pz, x - px, z - pz, q % 2 ? 'conversar' : 'tablet', 16, { prop: q % 2 ? null : 'prancheta' }); });
        return;
      }
      caixaV(M.sebe, x - 3, x + 3, z - 3, z - 2.6, P.ALT, 0.55); caixaV(M.sebe, x - 3, x + 3, z + 2.6, z + 3, P.ALT, 0.55);
      caixaV(M.sebe, x - 3, x - 2.6, z - 2.6, z + 2.6, P.ALT, 0.55); caixaV(M.sebe, x + 2.6, x + 3, z - 2.6, z + 2.6, P.ALT, 0.55);
      caixaV(V.grama, x - 2.6, x + 2.6, z - 2.6, z + 2.6, P.ALT, 0.02, false); K.add(G3.bola, M.copa2, x, P.ALT + 0.5, z, 0.9, 0.9, 0.9);
      obst(x - 3, x + 3, z - 3, z + 3);
    });
    // Monumento: lâminas de pedra subindo em espiral até a esfera laranja (planejar é dar um passo de cada vez)
    caixaV(M.pedraBege, cx - 1.6, cx + 1.6, cz - 1.6, cz + 1.6, P.ALT, 0.4); obst(cx - 1.7, cx + 1.7, cz - 1.7, cz + 1.7);
    K.add(G3.cil, M.grafite, cx, P.ALT + 0.4, cz, 0.12, 5.4, 0.12);
    for (let n = 0; n < 9; n++) { const a = n * 0.5, x = cx + Math.cos(a) * 0.75, z = cz - Math.sin(a) * 0.75; K.add(G3.caixaC, M.branco, x, P.ALT + 0.8 + n * 0.56, z, 1.7, 0.16, 0.5, 0, a, 0); }
    K.add(G3.bola, M.laranja, cx, P.ALT + 6.0, cz, 0.42, 0.42, 0.42);
    [0, 1, 2, 3].forEach((q) => { const an = q * Math.PI / 2 + Math.PI / 4, px = cx + Math.cos(an) * 2.6, pz = cz + Math.sin(an) * 2.6; pt(k, px, pz, cx - px, cz - pz, 'olhar', 10); });
    placa('PRAÇA DA ESTRATÉGIA', '', -29.4, -46.5, -Math.PI / 2, 3.0);
  }
  // ---------- Praça da Inovação (fundo, à direita): escultura de nó metálico, colunas de luz e robôs ----------
  {
    const k = 'pracaInov', cx = 41.5, cz = -35.5;
    caixaV(M.pedra, 27.6, 55.4, -49.4, -21.6, P.ALT, 0.006, false);
    for (let n = -3; n <= 3; n++) { caixaV(M.cianoFraco, cx + n * 3.6 - 0.03, cx + n * 3.6 + 0.03, -48.8, -22.2, P.ALT + 0.006, 0.004, false); caixaV(M.cianoFraco, 28.2, 54.8, cz + n * 3.6 - 0.03, cz + n * 3.6 + 0.03, P.ALT + 0.006, 0.004, false); }
    K.add(G3.cil, M.grafite, cx, P.ALT, cz, 1.6, 1.0, 1.6); obstCirculo(cx, cz, 1.9);
    const no = new T.Mesh(new T.TorusKnotGeometry(1.8, 0.42, 140, 14), new T.MeshStandardMaterial({ color: 0xe6ebf2, roughness: 0.18, metalness: 0.9, envMap: CAMPO.ambiente, envMapIntensity: 1.2 }));
    no.position.set(cx, 4.2, cz); no.castShadow = true; g.add(no); P.animados.push((t) => { no.rotation.y = t * 0.3; no.rotation.x = Math.sin(t * 0.2) * 0.2; });
    for (let n = 0; n < 8; n++) { const a = n / 8 * Math.PI * 2, x = cx + Math.cos(a) * 6.8, z = cz + Math.sin(a) * 6.8; K.add(G3.cil, M.ciano, x, P.ALT, z, 0.14, 3.4, 0.14, 0, 0, 0, false); obst(x - 0.18, x + 0.18, z - 0.18, z + 0.18); }
    const esfera = new T.Group(); esfera.position.set(50.5, 2.6, -27); g.add(esfera);
    [0, Math.PI / 3, -Math.PI / 3].forEach((r) => { const a = new T.Mesh(new T.TorusGeometry(1.3, 0.06, 8, 48), M.laranja); a.rotation.set(Math.PI / 2, r, 0); esfera.add(a); });
    K.add(G3.cil, M.grafite, 50.5, P.ALT, -27, 0.5, 1.1, 0.5); obst(49.9, 51.1, -27.6, -26.4);
    P.animados.push((t) => { esfera.rotation.y = -t * 0.5; esfera.rotation.z = t * 0.2; });
    for (let n = 0; n < 8; n++) { const a = n / 8 * Math.PI * 2 + 0.2, x = cx + Math.cos(a) * 3.4, z = cz + Math.sin(a) * 3.4; pt(k, x, z, cx - x, cz - z, n % 2 ? 'olhar' : 'tablet', 10); }
    banco(k, 33, -46, 0, 1); banco(k, 50, -46, 0, 1);
    placa('PRAÇA DA INOVAÇÃO', '', 53.6, -46.5, Math.PI / 2, 3.0);
    P.robosAnel2 = { cx, cz, r: 9.8, n: 4 };
  }

  // ---------- Estações das cápsulas (parada na rua, abrigo e lugares de espera na calçada) ----------
  const abrigo = (x0, x1, z0, z1) => { caixaV(M.branco, x0, x1, z0, z1, 2.4, 0.12); caixaV(M.laranja, x0, x1, z0, z1, 2.38, 0.03, false); [[x0 + 0.1, z0 + 0.1], [x1 - 0.1, z1 - 0.1]].forEach(([x, z]) => { K.add(G3.cil, M.metal, x, P.ALT, z, 0.05, 2.4, 0.05); obst(x - 0.1, x + 0.1, z - 0.1, z + 0.1); }); };
  const estacao = (id, linha, parada, espera, saida, desenho) => { if (desenho) desenho(); P.estacoes.push({ id, linha, parada, espera: espera.map(([x, z, fx, fz]) => ponto(x, z, rotDe(fx, fz), 'olhar', { dur: 45 })), saida: { x: saida[0], z: saida[1] } }); };
  const fila = (x0, z0, dx, dz, n, fx, fz) => Array.from({ length: n }, (_, i) => [x0 + dx * i, z0 + dz * i, fx, fz]);
  estacao('central', 1, [-6.5, 30.75], fila(-14.4, 34.5, 1.5, 0, 9, 0, -1), [-6.5, 35.5]);
  estacao('ia', 1, [24.75, 9.5], fila(27.0, 8.9, 0, 1.0, 4, -1, 0), [28.4, 10.4], () => abrigo(26.25, 27.55, 8.4, 12.6));
  estacao('perf', 1, [3.5, -18.75], fila(2.6, -20.9, 1.0, 0, 4, 0, 1), [4.0, -22.6], () => abrigo(2.0, 6.2, -21.55, -20.25));
  estacao('estr', 1, [-24.75, 2.5], fila(-27.0, 0.8, 0, 1.0, 4, 1, 0), [-28.4, 2.0], () => abrigo(-27.55, -26.25, 0.2, 4.4));
  estacao('terminal', 3, [9.5, 30.75], fila(2.6, 34.5, 1.5, 0, 10, 0, -1), [9.5, 38.6]);   // ponto da Praça das Conexões
  // ---------- Terminal da Real Forte: a rodoviária da cidade (lote do fundo, no eixo da sede) ----------
  /* Abóbada de vidro alta com arcos (o laranja na frente é a marca), ala curva com o telão Real Forte
     Vision, praça com chafariz e escultura, totem de direção, monumento de boas-vindas e a plataforma
     de embarque atrás, com as baias 01, 02 e 03. Os ônibus entram pela pista oeste, param na plataforma
     e saem pela pista leste. */
  {
    const k = 'stationBancos', { HX, RX, RY, Z0, Z1 } = TERMINAL, ZM = (Z0 + Z1) / 2;
    // Pistas dos ônibus dentro do lote: entrada (oeste), plataforma (fundo) e saída (leste)
    [[-17.5, -12.5, -85.3, -56], [12.5, 17.5, -85.3, -56], [-17.5, 17.5, -85.3, -80.3]].forEach(([x0, x1, z0, z1]) => { caixaV(M.asfalto, x0, x1, z0, z1, P.ALT, 0.012, false); P.ruas.push([x0, x1, z0, z1]); });
    [[-17.5, -12.5], [12.5, 17.5]].forEach(([x0, x1]) => { P.faixas.push([x0, x1, -57.8, -56]); for (let s = -2; s <= 2; s++) K.add(G3.caixa, M.faixa, (x0 + x1) / 2 + s * 0.95, P.ALT + 0.012, -56.9, 0.5, 0.003, 1.7, 0, 0, 0, false); });
    // Piso: pedra clara no hall, na praça e na plataforma, com filete laranja na borda do embarque
    caixaV(M.pedraClara, -12.4, 12.4, -80.3, -57.6, P.ALT, 0.006, false);
    caixaV(M.laranja, -12.4, 12.4, -80.32, -80.2, P.ALT + 0.006, 0.01, false);
    // Abóbada principal (eixo na direção do embarque): vidro, arcos brancos por dentro e o arco laranja da frente
    const vidroAb = new T.MeshStandardMaterial({ color: 0x9cc6ec, transparent: true, opacity: 0.42, roughness: 0.04, metalness: 0.5, depthWrite: false, side: T.DoubleSide, envMap: CAMPO.ambiente, envMapIntensity: 1.1 });
    const geoAb = new T.CylinderGeometry(1, 1, 1, 48, 1, true, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2);
    const ab = new T.Mesh(geoAb, vidroAb); ab.scale.set(RX, RY, Z1 - Z0); ab.position.set(HX, P.ALT, ZM); ab.renderOrder = 3; g.add(ab);
    const arco = (rx, ry, z, tubo, m, x0) => { const a = new T.Mesh(tuboEmArco(rx, ry, tubo, 0, Math.PI), m); a.position.set(x0 == null ? HX : x0, P.ALT, z); a.castShadow = true; g.add(a); return a; };
    for (let n = 0; n <= 6; n++) arco(RX + 0.03, RY + 0.03, Z0 + (Z1 - Z0) * n / 6, 0.07, M.branco);
    arco(RX + 0.1, RY + 0.1, Z1, 0.11, M.metal);   // borda prateada da fachada
    arco(RX + 0.75, RY + 0.85, Z1 + 0.55, 0.24, M.laranja).castShadow = false;   // o arco laranja da marca
    [-1, 1].forEach((s) => { const pe = HX + s * (RX + 0.75); caixaV(M.grafite, pe - 0.35, pe + 0.35, Z1 + 0.2, Z1 + 0.9, P.ALT, 0.3); obst(pe - 0.4, pe + 0.4, Z1 + 0.15, Z1 + 0.95); });
    // Terças (linhas longitudinais da cobertura)
    [-1.2, -0.75, -0.35, 0, 0.35, 0.75, 1.2].forEach((an) => caixaV(an ? M.branco : M.laranja, HX + Math.sin(an) * RX - 0.05, HX + Math.sin(an) * RX + 0.05, Z0, Z1, P.ALT + Math.cos(an) * RY - 0.05, 0.08, false));
    // Fachadas da frente e do fundo: vidro em meia-elipse, com a porta (frente) e o vão do embarque (fundo)
    const meiaElipse = (furo) => {
      const sh = new T.Shape(); for (let n = 0; n <= 48; n++) { const a = n / 48 * Math.PI; const x = Math.cos(a) * RX, y = Math.sin(a) * RY; n ? sh.lineTo(x, y) : sh.moveTo(x, y); }
      sh.lineTo(RX, 0); const [x0, x1, y1] = furo; const h = new T.Path(); h.moveTo(x0, 0.001); h.lineTo(x0, y1); h.lineTo(x1, y1); h.lineTo(x1, 0.001); h.lineTo(x0, 0.001); sh.holes.push(h);
      return new T.ShapeGeometry(sh, 24);
    };
    const vidroF = new T.MeshStandardMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.3, roughness: 0.03, metalness: 0.45, depthWrite: false, side: T.DoubleSide, envMap: CAMPO.ambiente, envMapIntensity: 1.2 });
    const frente = new T.Mesh(meiaElipse([-2.0, 2.0, 3.1]), vidroF); frente.position.set(HX, P.ALT, Z1); frente.renderOrder = 3; g.add(frente);
    const fundo = new T.Mesh(meiaElipse([-6.0, 6.0, 3.4]), vidroF); fundo.position.set(HX, P.ALT, Z0); fundo.renderOrder = 3; g.add(fundo);
    for (let x = -RX + 1.4; x < RX - 0.6; x += 1.4) { if (Math.abs(x) < 2.1) continue; const h = RY * Math.sqrt(Math.max(0, 1 - (x / RX) ** 2)); caixaV(M.preto, HX + x - 0.035, HX + x + 0.035, Z1 - 0.04, Z1 + 0.04, P.ALT, h, false); }   // montantes
    caixaV(M.preto, HX - RX * 0.97, HX + RX * 0.97, Z1 - 0.05, Z1 + 0.05, P.ALT + 3.1, 0.12, false);   // travessa em cima da porta
    caixaV(M.preto, HX - 2.1, HX - 1.95, Z1 - 0.06, Z1 + 0.06, P.ALT, 3.15); caixaV(M.preto, HX + 1.95, HX + 2.1, Z1 - 0.06, Z1 + 0.06, P.ALT, 3.15);
    caixaV(M.ciano, HX - 1.95, HX + 1.95, Z1 + 0.02, Z1 + 0.06, P.ALT + 3.0, 0.06, false);   // luz da porta
    // Letreiro na fachada: TERMINAL DA REAL FORTE (com a logo)
    { const tx = texturaLetreiroTerminal(); const pl = new T.Mesh(G3.placa, new T.MeshBasicMaterial({ map: tx, transparent: true, toneMapped: false })); pl.scale.set(7.2, 1.8, 1); pl.position.set(HX, P.ALT + 5.0, Z1 + 0.07); g.add(pl); }
    // Laterais do hall (parede baixa onde a abóbada encosta no chão) e portas
    obst(HX - RX - 0.1, HX - RX + 0.5, Z0, Z1); obst(HX + RX - 0.5, HX + RX + 0.1, Z0, Z1);
    obst(HX - RX, HX - 2.0, Z1 - 0.15, Z1 + 0.15); obst(HX + 2.0, HX + RX, Z1 - 0.15, Z1 + 0.15);
    obst(HX - RX, HX - 6.0, Z0 - 0.15, Z0 + 0.15); obst(HX + 6.0, HX + RX, Z0 - 0.15, Z0 + 0.15);
    // Lá dentro: anel de luz no teto, painel de partidas, bancos, café e balcão de informações
    { const anel = new T.Mesh(new T.TorusGeometry(3.2, 0.09, 8, 72), M.lampadaQuente); anel.rotation.x = Math.PI / 2; anel.position.set(HX, P.ALT + 7.0, ZM); g.add(anel);
      const anel2 = new T.Mesh(new T.TorusGeometry(2.2, 0.05, 8, 64), M.laranja); anel2.rotation.x = Math.PI / 2; anel2.position.set(HX, P.ALT + 6.6, ZM); g.add(anel2); }
    const telaP = document.createElement('canvas'); telaP.width = 640; telaP.height = 200; const texP = new T.CanvasTexture(telaP); texP.encoding = T.sRGBEncoding;
    { const zP = -76.9, mP = new T.MeshBasicMaterial({ map: texP, toneMapped: false });
      caixaV(M.preto, HX - 2.9, HX + 2.9, zP - 0.1, zP + 0.1, P.ALT + 3.0, 1.9);
      [1, -1].forEach((sd) => { const pp = new T.Mesh(G3.placa, mP); pp.scale.set(5.6, 1.75, 1); pp.position.set(HX, P.ALT + 3.95, zP + sd * 0.11); if (sd < 0) pp.rotation.y = Math.PI; g.add(pp); });
      [-2.6, 2.6].forEach((x) => K.add(G3.cil, M.preto, HX + x, P.ALT + 4.9, zP, 0.015, 2.6, 0.015)); }   // cabos do painel
    P.painelPartidas = { tela: telaP, tex: texP };
    [[-6.9, -70.6], [1.3, -70.6], [-6.9, -73.8], [1.3, -73.8]].forEach(([x, z]) => { banco(k, x, z, 0, -1, 2.4); caixaV(M.madeira, x - 1.2, x + 1.2, z - 0.2, z + 0.2, 0.4, 0.04); });
    // Piso do hall: passarela escura da porta até o embarque (com filete laranja) e o anel embaixo da luz do teto
    caixaV(M.grafite, HX - 1.3, HX + 1.3, Z0, Z1 + 0.6, P.ALT + 0.006, 0.004, false); caixaV(M.laranja, HX - 0.04, HX + 0.04, Z0, Z1 + 0.6, P.ALT + 0.01, 0.003, false);
    { const r = new T.Mesh(new T.RingGeometry(3.05, 3.35, 64).rotateX(-Math.PI / 2), M.laranja); r.position.set(HX, P.ALT + 0.012, ZM); g.add(r); }
    // Vasos com árvores entre os bancos e colunas digitais na entrada
    [[HX - 3.4, -72.2], [HX + 3.4, -72.2]].forEach(([x, z]) => { K.add(G3.cil, M.branco, x, P.ALT, z, 0.55, 0.5, 0.55); arvore(x, z, 0.9, true); obst(x - 0.6, x + 0.6, z - 0.6, z + 0.6); });
    [[HX - 4.6, -65.6], [HX + 4.6, -65.6]].forEach(([x, z]) => { caixaV(M.preto, x - 0.3, x + 0.3, z - 0.3, z + 0.3, P.ALT, 3.2); caixaV(M.ciano, x - 0.31, x + 0.31, z + 0.3, z + 0.31, P.ALT + 0.6, 2.2, false); caixaV(M.laranja, x - 0.32, x + 0.32, z - 0.32, z + 0.32, P.ALT + 3.2, 0.06, false); obst(x - 0.4, x + 0.4, z - 0.4, z + 0.4); });
    // Banca de revistas e lanches (lado oeste)
    { caixaV(M.branco, HX - 7.7, HX - 6.0, -68.8, -66.6, P.ALT, 2.0); caixaV(M.laranja, HX - 6.02, HX - 5.98, -68.8, -66.6, P.ALT + 1.75, 0.2, false); caixaV(M.madeira, HX - 6.0, HX - 5.7, -68.6, -66.8, P.ALT, 0.6); obst(HX - 7.8, HX - 5.6, -68.9, -66.5);
      const tb = texturaTexto(['BANCA', 'revistas · lanches'], '#0f2342', '#ffffff', 384, 140); const pb = new T.Mesh(G3.placa, new T.MeshBasicMaterial({ map: tb, toneMapped: false })); pb.scale.set(2.0, 0.73, 1); pb.rotation.y = Math.PI / 2; pb.position.set(HX - 5.96, P.ALT + 2.45, -67.7); g.add(pb);
      pt('station', HX - 5.2, -67.7, -1, 0, 'olhar', 9); }
    // Café do terminal (lado oeste) e balcão de informações (lado leste)
    caixaV(M.madeira, HX - 7.6, HX - 6.2, -77.2, -75.4, P.ALT, 0.55); caixaV(M.pedraBege, HX - 7.65, HX - 6.15, -77.25, -75.35, P.ALT + 0.55, 0.04); obst(HX - 7.7, HX - 6.1, -77.3, -75.3);
    caixaV(M.lampadaQuente, HX - 7.6, HX - 6.2, -77.2, -75.4, P.ALT + 1.9, 0.04, false); [HX - 7.6, HX - 6.2].forEach((x) => K.add(G3.cil, M.preto, x, P.ALT, -75.4, 0.03, 1.9, 0.03));
    pt('station', HX - 5.7, -76.3, -1, 0, 'olhar', 10);
    { const tc = texturaTexto(['CAFÉ', 'Terminal'], '#3a2416', '#ffe9cf', 320, 140); const pc = new T.Mesh(G3.placa, new T.MeshBasicMaterial({ map: tc, toneMapped: false })); pc.scale.set(1.3, 0.57, 1); pc.rotation.y = Math.PI / 2; pc.position.set(HX - 6.15, P.ALT + 2.3, -76.3); g.add(pc); }
    { const ti = texturaTexto(['INFORMAÇÕES'], '#0f2342', '#ffffff', 384, 96); const pi = new T.Mesh(G3.placa, new T.MeshBasicMaterial({ map: ti, toneMapped: false })); pi.scale.set(1.9, 0.48, 1); pi.rotation.y = -Math.PI / 2; pi.position.set(HX + 5.55, P.ALT + 1.3, -70.3); g.add(pi); }
    caixaV(M.navy, HX + 5.6, HX + 7.0, -71.4, -69.2, P.ALT, 0.55); caixaV(M.laranja, HX + 5.58, HX + 5.6, -71.4, -69.2, P.ALT + 0.42, 0.04, false); obst(HX + 5.5, HX + 7.1, -71.5, -69.1);
    pt('station', HX + 5.1, -70.3, 1, 0, 'olhar', 8);
    P.brilhosNoite.push(brilho(g, 0xffd9a8, 18, HX, 4.5, ZM, 0), brilho(g, 0xffd9a8, 9, HX, 2.0, Z1 + 2.5, 0));
    // Plataforma de embarque com cobertura e as baias 01, 02 e 03
    caixaV(M.branco, -12.4, 12.4, -80.9, -78.0, 3.3, 0.16); caixaV(M.laranja, -12.45, 12.45, -80.95, -80.88, 3.28, 0.2, false);
    for (let x = -11.5; x <= 11.6; x += 4.6) { K.add(G3.cil, M.metal, x, P.ALT, -78.25, 0.07, 3.3, 0.07); obst(x - 0.15, x + 0.15, -78.4, -78.1); }
    [['01', -8], ['02', 0], ['03', 8]].forEach(([n, x]) => {
      const tb = texturaTexto([n], '#0f2342', '#ffb27a', 128, 128), mb = new T.MeshBasicMaterial({ map: tb, toneMapped: false });
      [0, Math.PI].forEach((r) => { const pb = new T.Mesh(G3.placa, mb); pb.scale.set(1.0, 1.0, 1); pb.rotation.y = r; pb.position.set(x, 2.6, -80.6 + (r ? -0.01 : 0.01)); g.add(pb); });   // um de cada lado (sem número espelhado) K.add(G3.cil, M.preto, x, 3.1, -80.6, 0.012, 0.2, 0.012);
    });
    const espera = [-10.5, -7.5, -4.5, -1.5, 1.5, 4.5, 7.5, 10.5].map((x) => [x, -79.3, 0, -1]);
    estacao('station', 3, [0, -81.55], espera, [HX, Z1 + 2.2]);
    // ---- Praça da frente ----
    // Chafariz com a escultura: anel laranja e a logo (prédios da Real Forte) no meio
    { const cx = -8.6, cz = -60.9;
      K.add(G3.cil, M.pedraBege, cx, P.ALT, cz, 2.1, 0.34, 2.1); K.add(G3.cil, M.agua, cx, P.ALT, cz, 1.9, 0.36, 1.9, 0, 0, 0, false); obstCirculo(cx, cz, 2.2);
      K.add(G3.cil, M.metal, cx, P.ALT + 0.36, cz, 0.25, 0.5, 0.25);
      const esc = new T.Group(); esc.position.set(cx, P.ALT + 2.25, cz); g.add(esc);
      const a1 = new T.Mesh(new T.TorusGeometry(1.35, 0.1, 12, 64), M.laranja); esc.add(a1);
      const a2 = new T.Mesh(new T.TorusGeometry(1.15, 0.05, 10, 64), M.metal); a2.rotation.y = Math.PI / 2; esc.add(a2);
      if (typeof LOGO !== 'undefined' && LOGO.claro) { const tl = new T.TextureLoader().load(LOGO.claro); tl.encoding = T.sRGBEncoding; const ml = new T.MeshBasicMaterial({ map: tl, transparent: true, toneMapped: false, side: T.DoubleSide, depthWrite: false }); const pl = new T.Mesh(G3.placa, ml); pl.scale.set(1.8, 1.8 / LOGO.proporcao, 1); esc.add(pl); P.logoEscultura = pl; }
      P.animados.push((t) => { esc.rotation.y = Math.sin(t * 0.25) * 0.6; a2.rotation.x = t * 0.4; });
      for (let n = 0; n < 6; n++) { const a = n / 6 * Math.PI * 2; K.add(G3.cil, M.branco, cx + Math.cos(a) * 1.5, P.ALT + 0.36, cz + Math.sin(a) * 1.5, 0.03, 0.5, 0.03, 0, 0, 0, false); }   // jatinhos
      for (let n = 0; n < 7; n++) { const a = -0.2 + n / 6 * Math.PI * 0.9; pt('encontros', cx + Math.cos(a) * 2.75, cz + Math.sin(a) * 2.75, -Math.cos(a), -Math.sin(a), n % 3 ? 'olhar' : 'foto', 9, { grupo: 900 + n }); }
    }
    // Caminhos de luz curvos no piso da praça (da porta até as calçadas)
    { const mLuz = M.laranja;
      P.matLuzPraca = mLuz;
      [[[HX - 1.2, Z1 + 0.6], [HX - 3.2, -61.6], [-6.0, -58.4], [-10.6, -57.7]], [[HX + 1.2, Z1 + 0.6], [HX + 3.4, -61.4], [5.2, -59.8], [11.4, -57.7]]].forEach((ctrl) => {
        const curva = new T.CatmullRomCurve3(ctrl.map(([x, z]) => new T.Vector3(x, P.ALT + 0.02, z)));
        const m = new T.Mesh(faixaNoChao(curva.getPoints(40), [0.07, 0], [-0.07, 0]), mLuz); g.add(m);
      }); }
    // Totem de direção (o visitante consulta antes de seguir)
    totemDeDirecao(g, HX + 3.6, -61.6, 0, M, obst, pt);
    // Monumento de boas-vindas, virado para a avenida
    { const x = 5.2, z = -58.5, w = 6.2;
      caixaV(M.grafite, x - w / 2, x + w / 2, z - 0.35, z + 0.35, P.ALT, 1.25); caixaV(M.laranja, x - w / 2, x + w / 2, z + 0.35, z + 0.37, P.ALT + 0.12, 0.05, false);
      const tw = texturaTexto(['BEM-VINDO À CIDADE REAL FORTE', 'CONSULTORIA · INOVAÇÃO · CONEXÃO'], '#1b212b', '#ffffff', 1024, 200);
      const pw = new T.Mesh(G3.placa, new T.MeshBasicMaterial({ map: tw, toneMapped: false })); pw.scale.set(w - 0.3, 1.05, 1); pw.position.set(x, P.ALT + 0.68, z + 0.36); g.add(pw);
      [[x - w / 2 - 0.9, z], [x + w / 2 + 0.9, z]].forEach(([fx, fz]) => { caixaV(M.sebe, fx - 0.6, fx + 0.6, fz - 0.5, fz + 0.5, P.ALT, 0.45); K.add(G3.bola, M.copa, fx, P.ALT + 0.5, fz, 0.5, 0.35, 0.4); });
      obst(x - w / 2 - 1.5, x + w / 2 + 1.5, z - 0.5, z + 0.5); }
    // Balizadores de luz e árvores da praça
    [[-11.6, -63.2], [-11.6, -58.6], [11.9, -62.8], [-4.6, -58.4]].forEach(([x, z]) => { K.add(G3.cil, M.grafite, x, P.ALT, z, 0.08, 0.7, 0.08); K.add(G3.cil, M.lampadaQuente, x, P.ALT + 0.6, z, 0.085, 0.08, 0.085); });
    [[-11.4, -61.0], [11.6, -60.6]].forEach(([x, z]) => { caixaV(M.branco, x - 0.7, x + 0.7, z - 0.7, z + 0.7, P.ALT, 0.45); arvore(x, z, 1.0, true); obst(x - 0.7, x + 0.7, z - 0.7, z + 0.7); });
    // Ala Real Forte Vision (lado leste): cobertura curva de vidro e o telão curvo na frente
    { const X0 = 4.0, X1 = 12.2, ZA = -76.0, ZB = -64.8, H = 5.4;
      const geoQ = new T.CylinderGeometry(1, 1, 1, 24, 1, true, 0, Math.PI / 2).rotateX(-Math.PI / 2);
      const q = new T.Mesh(geoQ, vidroAb); q.name = 'alaVidro'; q.scale.set(X1 - X0, H, ZB - ZA); q.position.set(X0, P.ALT, (ZA + ZB) / 2); q.renderOrder = 3; g.add(q);
      const aq = new T.Mesh(tuboEmArco(X1 - X0, H, 0.14, 0, Math.PI / 2), M.laranja); aq.position.set(X0, P.ALT, ZB); g.add(aq);
      for (let z = ZA; z < ZB; z += 2.8) { const ai = new T.Mesh(tuboEmArco(X1 - X0, H, 0.06, 0, Math.PI / 2), M.branco); ai.position.set(X0, P.ALT, z); g.add(ai); }
      caixaV(M.navy, X0 + 1.6, X1 - 0.4, ZA + 0.4, ZB - 0.4, P.ALT, 1.0);   // salas da ala (base)
      obst(HX + RX - 0.2, X1 + 0.2, ZA, TERMINAL.VZ + 0.25); }
    alvo('station', -12.4, 12.4, Z0, -57.6, RY + 1);
  }
  P.abrigo = abrigo;

  // ---------- Árvores nas calçadas do anel 1 e do boulevard ----------
  [[-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1]].forEach(([i, j]) => {
    const b = blocoDe(i, j);
    [[b.x0 + 2.6, b.z0 + 2.6, b.x1 - 2.6, b.z0 + 2.6], [b.x0 + 2.6, b.z1 - 2.6, b.x1 - 2.6, b.z1 - 2.6]].forEach(([ax, az, bx]) => {
      for (let x = ax; x <= bx; x += 6.5) if (!P.obst.some(([x0, x1, z0, z1]) => x > x0 - 1 && x < x1 + 1 && az > z0 - 1 && az < z1 + 1)) arvore(x, az, 0.95);
    });
  });

  // ---------- Circuitos de dados: da sede até a porta de cada centro (pulsos andando no chão) ----------
  P.matCircuito = new T.MeshBasicMaterial({ map: CAMPO.texFluxo.clone(), color: 0xff9a52, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
  P.matCircuito.map.needsUpdate = true; P.matCircuito.map.repeat.set(10, 1);
  const Y = 0.05;
  [[[10.3, 3.2], [16, 3.2], [16, 7.6], [37.8, 7.6]], [[-10.3, 3.2], [-16, 3.2], [-16, 7.6], [-34.8, 7.6]], [[2, -3.7], [2, -14], [1.5, -14], [1.5, -27.6]],
   [[4, 25.2], [4, 44.2], [21, 44.2], [21, 49], [35.8, 49]], [[-4, 25.2], [-4, 44.2], [-21, 44.2], [-21, 49], [-34.8, 49]]].forEach((rota) => {
    const pts = [];
    for (let k = 0; k < rota.length - 1; k++) { const [ax, az] = rota[k], [bx, bz] = rota[k + 1], L = Math.hypot(bx - ax, bz - az); for (let s = 0; s < L; s += 0.5) pts.push(new T.Vector3(ax + (bx - ax) * s / L, Y, az + (bz - az) * s / L)); }
    pts.push(new T.Vector3(rota[rota.length - 1][0], Y, rota[rota.length - 1][1]));
    const m = new T.Mesh(faixaNoChao(pts, [0.09, 0], [-0.09, 0]), P.matCircuito); m.renderOrder = 2; g.add(m);
  });

  // ---------- Micro encontros: duplas e trios conversando em pé e gente esperando no relógio ----------
  // Cada roda tem um número (grupo): quem chega prefere uma roda que já tem alguém, e assim a conversa se forma.
  let nGrupo = 0;
  const roda = (x, z, n) => { const raio = n === 2 ? 0.45 : 0.6, gr = ++nGrupo; for (let q = 0; q < n; q++) { const a = q / n * Math.PI * 2 + 0.5, px = x + Math.cos(a) * raio, pz = z + Math.sin(a) * raio; pt('encontros', px, pz, x - px, z - pz, 'conversar', 20, { grupo: gr }); } };
  [[-5, 40.8, 2], [-14.2, 46.5, 3], [4, 59.5, 2], [-4.5, -58.4, 3], [4.5, -58.6, 2], [47.8, -29.8, 2], [35.2, -41.2, 3], [-12.5, 22.8, 2], [12.5, 22.8, 3]].forEach(([x, z, n]) => roda(x, z, n));
  [Math.PI / 2 - 0.6, Math.PI / 2 + 0.6, -Math.PI / 2].forEach((a) => { const px = Math.cos(a) * 1.25, pz = 24.4 + Math.sin(a) * 1.25; pt('encontros', px, pz, px, pz - 24.4, 'olhar', 16, { grupo: ++nGrupo }); });   // esperando alguém no relógio
  // Pontos onde os visitantes param para fotografar a torre (virados para ela)
  [[-3.6, 26.4], [3.6, 26.4], [-8.2, 40.6], [8.2, 40.6], [-0.8, -58.7], [-25.0, -12.6], [25.0, -12.6], [-25.0, 21.5], [25.0, 21.5], [-12.6, 33.2], [12.6, 33.2]].forEach(([x, z]) => pt('fotoTorre', x, z, -x, -z, 'foto', 7));

  // ---------- Avenida da Inteligência (entre a sede e a Praça das Conexões) ----------
  /* A rua mais divertida da cidade: circuitos acesos no asfalto, setas de luz nas faixas, o nome pintado
     no chão, bandeiras da Real Forte nos postes, floreiras e totens de direção nas duas pontas. */
  {
    const ZA = P.ZR[3], X0 = P.XR[2] + R + 0.6, X1 = P.XR[3] - R - 0.6, perto = (x, z, d) => P.faixas.some(([a, b, c, e]) => x > a - d && x < b + d && z > c - d && z < e + d);
    // Circuitos: linhas ciano rente ao meio-fio, com "nós" (pontinhos) e derivações
    [ZA - R + 0.35, ZA + R - 0.35].forEach((z, n) => {
      for (let x = X0; x < X1; x += 0.5) if (!perto(x, z, 0.6)) K.add(G3.caixa, M.ciano, x + 0.25, 0.012, z, 0.5, 0.004, 0.06, 0, 0, 0, false);
      for (let x = X0 + 2; x < X1 - 1; x += 3.6) { if (perto(x, z, 1.2)) continue; const dz = n ? -0.45 : 0.45; K.add(G3.caixa, M.ciano, x, 0.012, z + dz / 2, 0.06, 0.004, Math.abs(dz), 0, 0, 0, false); K.add(G3.cil, M.ciano, x, 0.012, z + dz, 0.09, 0.005, 0.09, 0, 0, 0, false); }
    });
    // Setas de luz no meio de cada faixa (no sentido do trânsito)
    [[ZA + FAIXA, 1], [ZA - FAIXA, -1]].forEach(([z, sx]) => {
      for (let x = X0 + 3; x < X1 - 3; x += 5.5) { if (perto(x, z, 2)) continue; [-0.25, 0.25].forEach((dz) => { K.add(G3.caixaC, M.ciano, x, 0.015, z + dz, 0.6, 0.004, 0.07, 0, (dz > 0 ? 1 : -1) * sx * 0.6, 0, false); }); }   // as duas barras se encontram na frente: >
    });
    // Nome pintado no asfalto (uma vez em cada faixa)
    { const c = document.createElement('canvas'); c.width = 1024; c.height = 160; const q = c.getContext('2d');
      q.fillStyle = 'rgba(255,255,255,0.82)'; q.textAlign = 'center'; q.textBaseline = 'middle'; q.font = 'italic 600 58px Arial, sans-serif'; q.fillText('Avenida da Inteligência', 512, 62);
      q.font = '500 24px Arial, sans-serif'; q.fillStyle = 'rgba(255,255,255,0.6)'; q.fillText('R E A L   F O R T E   C O N S U L T O R I A', 512, 122);
      const tx = new T.CanvasTexture(c); tx.encoding = T.sRGBEncoding; tx.anisotropy = 8;
      const mx = new T.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false, toneMapped: false });
      [[-11.5, ZA - FAIXA, 0], [11.5, ZA + FAIXA, Math.PI]].forEach(([x, z, r]) => { const pl = new T.Mesh(G3.placa, mx); pl.scale.set(7.2, 1.12, 1); pl.rotation.set(-Math.PI / 2, 0, r); pl.position.set(x, 0.02, z); pl.renderOrder = 2; g.add(pl); }); }
    // Bandeiras verticais da Real Forte nos postes da avenida
    { const c = document.createElement('canvas'); c.width = 128; c.height = 320; const q = c.getContext('2d');
      const gr = q.createLinearGradient(0, 0, 0, 320); gr.addColorStop(0, '#163259'); gr.addColorStop(1, '#0b1a33'); q.fillStyle = gr; q.fillRect(0, 0, 128, 320);
      q.fillStyle = '#ff8a3d'; q.fillRect(0, 0, 128, 10); q.fillRect(0, 300, 128, 20);
      q.save(); q.translate(64, 160); q.rotate(-Math.PI / 2); q.fillStyle = '#ffffff'; q.textAlign = 'center'; q.textBaseline = 'middle'; q.font = '800 34px Arial, sans-serif'; q.fillText('REAL FORTE', 0, -12); q.font = '400 18px Arial, sans-serif'; q.fillStyle = '#ffb27a'; q.fillText('CIDADE DA CONSULTORIA', 0, 22); q.restore();
      const tb = new T.CanvasTexture(c); tb.encoding = T.sRGBEncoding; const mb = new T.MeshBasicMaterial({ map: tb, side: T.DoubleSide, toneMapped: false });
      P.postes.filter(([x, z]) => Math.abs(z - ZA) < R + 3.2 && x > X0 - 1 && x < X1 + 1).forEach(([x, z]) => {
        const lado = z < ZA ? 1 : -1, pl = new T.Mesh(G3.placa, mb); pl.scale.set(0.42, 1.05, 1); pl.rotation.y = Math.PI / 2; pl.position.set(x, 1.85, z + lado * 0.28); g.add(pl);
        K.add(G3.caixa, M.metal, x, 2.4, z + lado * 0.15, 0.03, 0.03, 0.3, 0, 0, 0, false);
      }); }
    // Floreiras na calçada (flores roxas e rosas), longe das faixas e dos postes
    { const mR = mat(0x9b6bd6, { roughness: 0.8 }), mP = mat(0xe887b5, { roughness: 0.8 });
      [ZA - R - 1.05, ZA + R + 1.05].forEach((z) => { for (let x = X0 + 1.5; x < X1 - 1; x += 4.2) {
        if (perto(x, z, 1.6) || P.postes.some(([px, pz]) => Math.hypot(px - x, pz - z) < 1.2) || P.obst.some(([a, b, c, e]) => x > a - 0.8 && x < b + 0.8 && z > c - 0.5 && z < e + 0.5)) continue;
        caixaV(M.branco, x - 0.7, x + 0.7, z - 0.3, z + 0.3, P.ALT, 0.38); caixaV(M.sebe, x - 0.62, x + 0.62, z - 0.22, z + 0.22, P.ALT + 0.38, 0.06, false);
        for (let k = 0; k < 5; k++) K.add(G3.bola, k % 2 ? mR : mP, x - 0.5 + k * 0.25, P.ALT + 0.48, z + (k % 2 ? 0.08 : -0.08), 0.12, 0.1, 0.12);
        obst(x - 0.72, x + 0.72, z - 0.32, z + 0.32);
      } }); }
    // Totens de direção nas pontas da avenida e a placa com o nome
    totemDeDirecao(g, X0 + 1.2, ZA + R + 1.0, 0, M, obst, pt);
    totemDeDirecao(g, X1 - 1.2, ZA - R - 1.0, Math.PI, M, obst, pt);
    placa('AVENIDA DA INTELIGÊNCIA', 'Sede · Praça das Conexões', X1 - 0.4, ZA + R + 0.9, 0, 3.4);
  }
  // Guarda-sóis nas mesas de fora do Café das Ideias
  [[15.6, 55.4], [18.4, 57.2], [15.6, 59.6], [16.4, 41.4]].forEach(([x, z], n) => {
    K.add(G3.cil, M.metal, x, P.ALT + 0.72, z, 0.03, 1.35, 0.03, 0, 0, 0, false);
    K.add(G3.cone, n % 2 ? M.branco : M.estofado, x, P.ALT + 1.82, z, 1.15, 0.4, 1.15);
    K.add(G3.cil, M.laranja, x, P.ALT + 1.8, z, 1.16, 0.03, 1.16, 0, 0, 0, false);
  });
  montarRelogio();
  K.montar(g, []);
  montarTelasDaCidade();
  montarEspaco();   // a ilha flutuando no espaço (no lugar da metrópole em volta)
  aplicarPisosRealistas();   // calçadas, praças, asfalto e grama com textura (some de longe)
  // Cabeças dos postes acendem à noite; manchas de luz no chão embaixo de cada poste
  const pocas = new T.InstancedMesh(G3.placaDeitada, new T.MeshBasicMaterial({ map: CAMPO.texBrilho, color: 0xffc27a, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }), P.postes.length);
  const m4 = new T.Matrix4(); P.postes.forEach(([x, z], i) => pocas.setMatrixAt(i, m4.makeScale(4.2, 1, 4.2).setPosition(x, 0.06, z)));
  pocas.frustumCulled = false; g.add(pocas); P.pocasPostes = pocas;
}

/* ---------- Marca a cidade fixa no mapa de onde dá para pisar (cada vez que o mundo é montado) ---------- */
function marcarPlanoNoNav() {
  const P = PLANO, I = new THREE.Matrix4();
  P.quadras.forEach(([x0, x1, z0, z1]) => navRetangulo(I, x0, x1, z0, z1, 0, (k) => { NAV.alt[k] = Math.max(NAV.alt[k], P.ALT); }));
  P.ruas.forEach(([x0, x1, z0, z1]) => navRetangulo(I, x0, x1, z0, z1, 0, (k) => { NAV.livre[k] = 0; }));
  P.faixas.forEach(([x0, x1, z0, z1]) => navRetangulo(I, x0, x1, z0, z1, 0, (k) => { NAV.livre[k] = 1; NAV.alt[k] = 0; }));
  P.obst.forEach(([x0, x1, z0, z1]) => navBloquear(I, x0, x1, z0, z1));
}

/* ---------- Lotes livres: canteiro de obras (os 2 próximos) ou área verde reservada ----------
   Lotes ocupados também ganham uma área verde escondida: ela só aparece na apresentação, no lugar das
   outras empresas (assim não sobra buraco e nenhum outro cliente aparece). */
function preencherLotes(n, W) {
  const T = THREE, P = PLANO, MP = P.mats, V = materiaisDaVida(); formasDaVida();
  W.gruas = []; W.reservasOcupadas = []; W.obras = [];
  const I = new T.Matrix4();
  const total = Math.max(P.ORDEM_LOTES.length, n);
  for (let k = 0; k < P.ORDEM_LOTES.length; k++) {
    const L = loteDaEmpresa(k), b = L.b, C = P.CALC + 0.4;
    const x0 = b.x0 + C, x1 = b.x1 - C, z0 = b.z0 + C, z1 = b.z1 - C;
    const grupo = new T.Group(); W.grupo.add(grupo);
    const K = novoLote(), obst = [];
    const caixaV = (m, a0, a1, c0, c1, y0, h, sombra) => K.add(G3.caixa, m, (a0 + a1) / 2, y0 || 0, (c0 + c1) / 2, a1 - a0, h, c1 - c0, 0, 0, 0, sombra);
    const sorte = sorteio('lote' + k);
    if (k < n) {
      // Área verde só para a apresentação (sem bloquear o mapa: nesse momento ninguém de outra empresa aparece)
      for (let q = 0; q < 7; q++) { const x = x0 + 3 + sorte() * (x1 - x0 - 6), z = z0 + 3 + sorte() * (z1 - z0 - 6); K.add(G3.cil, MP.tronco, x, 0.035, z, 0.08, 0.7, 0.08); K.add(G3.copa, MP.copa, x, 1.2, z, 0.8, 0.95, 0.8); }
      K.montar(grupo, []); grupo.visible = false; W.reservasOcupadas.push({ grupo, id: W.idsPorLote[k] });
      continue;
    }
    const proxima = k < n + 2;
    if (proxima) {
      // Canteiro de obras: tapume com a faixa laranja, terra, laje com ferragens, grua girando, contêiner e escavadeira
      const terra = mat(0xa8977c, { roughness: 1 }), concreto = mat(0xbfc4cb, { roughness: 0.9 }), ferro = mat(0x3a3f48, { roughness: 0.6, metalness: 0.5 }), amarelo = mat(0xf0b429, { roughness: 0.55 });
      caixaV(terra, x0, x1, z0, z1, 0, 0.045, false);
      const tap = (a0, a1, c0, c1) => { caixaV(MP.branco, a0, a1, c0, c1, 0, 1.5); caixaV(MP.laranjaFraco, a0, a1, c0, c1, 1.1, 0.16, false); obst.push([a0, a1, c0, c1]); };
      const gx = L.cx + L.dir[0] * (CID_Z + 2.4), gz = L.cz + L.dir[1] * (CID_Z + 2.4);   // abertura do tapume no lado da avenida
      const aberto = (x, z) => Math.abs(x - gx) < 1.4 && Math.abs(z - gz) < 1.4;
      for (let x = x0; x < x1 - 0.01; x += 2.0) { const xe = Math.min(x1, x + 2.0); [[z0, z0 + 0.08], [z1 - 0.08, z1]].forEach(([c0, c1]) => { if (!aberto((x + xe) / 2, (c0 + c1) / 2)) tap(x, xe, c0, c1); }); }
      for (let z = z0; z < z1 - 0.01; z += 2.0) { const ze = Math.min(z1, z + 2.0); [[x0, x0 + 0.08], [x1 - 0.08, x1]].forEach(([a0, a1]) => { if (!aberto((a0 + a1) / 2, (z + ze) / 2)) tap(a0, a1, z, ze); }); }
      const cxo = L.cx - L.dir[0] * 1.5, czo = L.cz - L.dir[1] * 1.5;
      caixaV(concreto, cxo - 7, cxo + 7, czo - 6, czo + 6, 0.04, 0.3); obst.push([cxo - 7, cxo + 7, czo - 6, czo + 6]);
      for (let a = -6; a <= 6; a += 3) for (let c = -5; c <= 5; c += 2.5) { caixaV(concreto, cxo + a - 0.2, cxo + a + 0.2, czo + c - 0.2, czo + c + 0.2, 0.34, 1.6 + (Math.abs(a + c) % 3) * 0.8); caixaV(ferro, cxo + a - 0.05, cxo + a + 0.05, czo + c - 0.05, czo + c + 0.05, 1.9 + (Math.abs(a + c) % 3) * 0.8, 0.9, false); }
      // Grua
      const bx = cxo + 9 * (L.dir[1] ? 1 : 0) + (L.dir[0] ? -L.dir[0] * 7 : 0), bz = czo + 9 * (L.dir[0] ? 1 : 0) + (L.dir[1] ? -L.dir[1] * 7 : 0);
      caixaV(concreto, bx - 1.1, bx + 1.1, bz - 1.1, bz + 1.1, 0.04, 0.5); obst.push([bx - 1.1, bx + 1.1, bz - 1.1, bz + 1.1]);
      for (let y = 0.5; y < 17; y += 1.2) { caixaV(amarelo, bx - 0.35, bx + 0.35, bz - 0.35, bz + 0.35, y, 1.0); caixaV(ferro, bx - 0.37, bx + 0.37, bz - 0.37, bz + 0.37, y + 1.0, 0.2, false); }
      const topo = new T.Group(); topo.position.set(bx, 17.4, bz); grupo.add(topo);
      caixa(topo, 16, 0.5, 0.5, amarelo, 5.5, 0, 0); caixa(topo, 5, 0.6, 0.6, amarelo, -4.5, 0, 0); caixa(topo, 1.6, 1.4, 1.4, concreto, -6.2, -1.2, 0); caixa(topo, 0.9, 0.9, 0.9, 0xf4f6fa, 0.6, -1.0, 0);
      caixa(topo, 0.3, 2.6, 0.3, amarelo, 0, 0.4, 0); caixa(topo, 0.05, 7, 0.05, ferro, 8, -7, 0); caixa(topo, 1.2, 0.4, 1.0, 0x8a6a48, 8, -7.5, 0);
      const aviso = brilho(topo, 0xff3b30, 0.8, 13.4, 0.5, 0, 0.9); W.gruas.push({ topo, aviso, f: sorte() * 6 });
      // Contêiner do escritório da obra, pilhas de material e a escavadeira
      const ox = L.cx + (L.dir[1] ? -10 : -L.dir[0] * 9), oz = L.cz + (L.dir[0] ? -10 : -L.dir[1] * 9);
      caixaV(MP.branco, ox - 2.2, ox + 2.2, oz - 1.1, oz + 1.1, 0.04, 2.2); caixaV(MP.laranja, ox - 2.25, ox + 2.25, oz - 1.15, oz + 1.15, 2.24, 0.08, false); obst.push([ox - 2.2, ox + 2.2, oz - 1.1, oz + 1.1]);
      [[0.6, 0.4], [1.8, -0.6]].forEach(([a, c]) => { const px = L.cx + (L.dir[1] ? 9 + a : c * 3), pz = L.cz + (L.dir[0] ? 9 + a : c * 3); caixaV(mat(0x8a6a48), px - 0.7, px + 0.7, pz - 0.5, pz + 0.5, 0.04, 0.5); obst.push([px - 0.7, px + 0.7, pz - 0.5, pz + 0.5]); });
      const ex = L.cx + (L.dir[1] ? 6 : L.dir[0] * 4), ez = L.cz + (L.dir[0] ? 6 : L.dir[1] * 4);
      veiculo(K, 'escavadeira', ex, ez, L.giro, 1.4, 0xf0b429, 0x2b3446); obst.push([ex - 1.4, ex + 1.4, ez - 1.4, ez + 1.4]);
      // Placa de obra na frente, virada para a avenida
      const tex = texturaTexto(['EM OBRAS · NOVO DISTRITO', 'Espaço reservado para a próxima empresa'], '#0f2342', '#ffffff', 768, 200); W.extras.push(tex);
      const mm = new T.MeshBasicMaterial({ map: tex, toneMapped: false }); W.extras.push(mm);
      const pl = new T.Mesh(G3.placa, mm); pl.scale.set(5.4, 1.4, 1); pl.position.set(gx + (L.dir[1] ? 4.2 : 0) + L.dir[0] * 0.2, 1.6, gz + (L.dir[0] ? 4.2 : 0) + L.dir[1] * 0.2); pl.rotation.y = L.giro; grupo.add(pl);
      // Quem trabalha na obra (de dia)
      W.obras.push({ lote: L, entrada: { x: gx + L.dir[0] * 2.2, z: gz + L.dir[1] * 2.2 }, area: { x0: x0 + 1, x1: x1 - 1, z0: z0 + 1, z1: z1 - 1 }, pontos: [ponto(cxo - 7.8, czo, 0, 'martelar', { dur: 12 }), ponto(cxo + 7.8, czo, Math.PI, 'agachar', { dur: 12 }), ponto(ox + (L.dir[1] ? 0 : 0), oz + 1.8 * (L.dir[1] ? 1 : 0) + (L.dir[0] ? 0 : 0), 0, 'tablet', { dur: 10 }), ponto(ex + 2.2, ez, Math.PI, 'operar', { dur: 14 })] });
    } else {
      // Lote preparado para a próxima empresa: base de concreto com marcos acesos, caminho em volta,
      // árvores alinhadas, floreiras, bancos e um pavilhão de vidro de informações virado para a avenida
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, d = L.dir, lado = [-d[1], d[0]];
      caixaV(MP.saibro, x0 + 1.2, x1 - 1.2, z0 + 1.2, z1 - 1.2, 0.035, 0.01, false);
      caixaV(V.grama, x0 + 2.4, x1 - 2.4, z0 + 2.4, z1 - 2.4, 0.035, 0.014, false);
      caixaV(MP.pedraClara, cx - 7.5, cx + 7.5, cz - 6.5, cz + 6.5, 0.035, 0.03, false);
      [[-7.5, -6.5], [7.5, -6.5], [-7.5, 6.5], [7.5, 6.5]].forEach(([a, b]) => { K.add(G3.cil, MP.navy, cx + a, 0.035, cz + b, 0.1, 0.9, 0.1); K.add(G3.cil, MP.laranja, cx + a, 0.93, cz + b, 0.12, 0.08, 0.12, 0, 0, 0, false); obst.push([cx + a - 0.2, cx + a + 0.2, cz + b - 0.2, cz + b + 0.2]); });
      for (let u = x0 + 1.9; u <= x1 - 1.8; u += 4.4) [z0 + 0.75, z1 - 0.75].forEach((w) => { K.add(G3.cil, MP.tronco, u, 0.035, w, 0.07, 0.65, 0.07); K.add(G3.copa, MP.copa, u, 1.15, w, 0.6, 0.75, 0.6, 0, u % 3, 0); obst.push([u - 0.3, u + 0.3, w - 0.3, w + 0.3]); });
      for (let w = z0 + 4.2; w <= z1 - 4; w += 4.4) [x0 + 0.75, x1 - 0.75].forEach((u) => { K.add(G3.cil, MP.tronco, u, 0.035, w, 0.07, 0.65, 0.07); K.add(G3.copa, MP.copa2, u, 1.15, w, 0.6, 0.75, 0.6, 0, w % 3, 0); obst.push([u - 0.3, u + 0.3, w - 0.3, w + 0.3]); });
      [[-9.5, -8.5], [9.5, -8.5], [-9.5, 8.5], [9.5, 8.5]].forEach(([a, b]) => { caixaV(MP.branco, cx + a - 0.8, cx + a + 0.8, cz + b - 0.5, cz + b + 0.5, 0.035, 0.35); for (let q = 0; q < 4; q++) K.add(G3.bola, q % 2 ? MP.laranjaFraco : MP.copa, cx + a - 0.5 + q * 0.33, 0.48, cz + b, 0.17, 0.13, 0.17); obst.push([cx + a - 0.8, cx + a + 0.8, cz + b - 0.5, cz + b + 0.5]); });
      { const px = cx + d[0] * 9.6 - lado[0] * 6.5, pz = cz + d[1] * 9.6 - lado[1] * 6.5, hx = Math.abs(d[0]) ? 1.3 : 2.0, hz = Math.abs(d[0]) ? 2.0 : 1.3;
        caixaV(MP.pedraBege, px - hx - 0.3, px + hx + 0.3, pz - hz - 0.3, pz + hz + 0.3, 0.035, 0.08);
        K.add(G3.caixa, MP.vidroGuarda, px, 0.11, pz, hx * 2, 2.3, hz * 2, 0, 0, 0, false);
        caixaV(MP.branco, px - hx - 0.4, px + hx + 0.4, pz - hz - 0.4, pz + hz + 0.4, 2.41, 0.16); caixaV(MP.laranja, px - hx - 0.42, px + hx + 0.42, pz - hz - 0.42, pz + hz + 0.42, 2.39, 0.04, false);
        caixaV(MP.lampadaQuente, px - hx + 0.2, px + hx - 0.2, pz - hz + 0.2, pz + hz - 0.2, 2.38, 0.02, false);
        caixaV(MP.madeira, px - 0.5, px + 0.5, pz - 0.35, pz + 0.35, 0.11, 0.55);
        obst.push([px - hx - 0.3, px + hx + 0.3, pz - hz - 0.3, pz + hz + 0.3]);
        const texP = W.texPavilhao || (W.texPavilhao = texturaTexto(['LOTE PREPARADO', 'para a próxima empresa · Real Forte'], '#0f2342', '#ffffff', 640, 160)); if (!W.extras.includes(texP)) W.extras.push(texP);
        const mp = new T.MeshBasicMaterial({ map: texP, toneMapped: false }); W.extras.push(mp);
        const pl = new T.Mesh(G3.placa, mp); pl.scale.set(2.6, 0.65, 1); pl.rotation.y = L.giro; pl.position.set(px + d[0] * (hz + 0.45) * (Math.abs(d[1]) ? 1 : 0) + d[0] * (hx + 0.45) * (Math.abs(d[0]) ? 1 : 0), 2.85, pz + d[1] * (hz + 0.45)); grupo.add(pl); }
      const tex = W.texReserva || (W.texReserva = texturaTexto(['ÁREA DE EXPANSÃO', 'Real Forte'], '#0f2342', '#ffffff', 512, 160)); if (!W.extras.includes(tex)) W.extras.push(tex);
      const mm = W.matReserva || (W.matReserva = new T.MeshBasicMaterial({ map: tex, toneMapped: false })); if (!W.extras.includes(mm)) W.extras.push(mm);
      const sx = L.cx + L.dir[0] * (CID_Z + 2.0) + (L.dir[1] ? 3.4 : 0), sz = L.cz + L.dir[1] * (CID_Z + 2.0) + (L.dir[0] ? 3.4 : 0);
      caixaV(MP.navy, sx - 0.06, sx + 0.06, sz - 0.06, sz + 0.06, 0, 0.9);
      const pl = new T.Mesh(G3.placa, mm); pl.scale.set(1.8, 0.56, 1); pl.position.set(sx, 1.15, sz); pl.rotation.y = L.giro; grupo.add(pl);
      obst.push([sx - 0.3, sx + 0.3, sz - 0.3, sz + 0.3]);
    }
    K.montar(grupo, W.extras);
    obst.forEach(([a0, a1, c0, c1]) => navBloquear(I, a0, a1, c0, c1));
  }
  return total;
}

/* ---------- Quadro a quadro da cidade fixa ---------- */
function passoPlano(t, dt) {
  const P = PLANO, W = CAMPO.mundo, noite = noiteAgora(), ap = CAMPO.ap;
  if (!P.mats) return;
  P.animados.forEach((f) => f(t, dt));
  P.mats.cabecaPoste.emissiveIntensity = 0.2 + noite * 2.2;
  (P.brilhosNoite || []).forEach((b) => { b.material.opacity = 0.08 + noite * 0.5; });
  if (P.vidroCafe) P.vidroCafe.emissiveIntensity = 0.25 + noite * 0.9;
  (P.gentesNoAlto || []).forEach(({ p, f }) => { const b = p.userData.bracos; b[0].rotation.z = 0.35 + Math.max(0, Math.sin(t * 1.1 + f)) * 0.5; b[1].rotation.z = 0.35 + Math.max(0, Math.sin(t * 0.8 + f + 2)) * 0.3; });
  passoFachadaViva(t); passoPartidas(t); passoOutdoors(t); passoEspaco(t);
  if (P.onibusParados && !P.onibusParadosFeitos) { P.onibusParadosFeitos = true; P.onibusParados.forEach(([x, z]) => { const g2 = corpoDaRealForte([]); g2.visible = true; g2.position.set(x, P.ALT, z); }); }
  if (P.pocasPostes) { P.pocasPostes.material.opacity = noite * 0.42; P.pocasPostes.visible = noite > 0.02; }
  if (P.matCircuito) { P.matCircuito.map.offset.x -= dt * 0.35; P.matCircuito.opacity = 0.35 + noite * 0.5; }
  // Painéis do Centro de IA: ondas e barrinhas (só enfeite, sem número)
  if (P.paineisIA && t > (P.proxPainel || 0)) {
    P.proxPainel = t + 0.25;
    P.paineisIA.forEach(({ tela, tex }, i) => {
      const g = tela.getContext('2d'), w = tela.width, h = tela.height;
      g.fillStyle = '#071226'; g.fillRect(0, 0, w, h); g.fillStyle = '#d9681a'; g.fillRect(0, 0, w, 6);
      g.fillStyle = '#8fe6ff'; g.font = '600 18px monospace'; g.fillText(i ? 'AUTOMAÇÕES' : 'RF INTELLIGENCE', 14, 34);
      g.strokeStyle = '#38d6f5'; g.lineWidth = 3; g.beginPath(); for (let x = 10; x < w - 10; x += 4) { const y = 120 + Math.sin(x * 0.05 + t * 2.4 + i) * 26 + Math.sin(x * 0.017 - t) * 14; x > 10 ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
      for (let k = 0; k < 8; k++) { const v = 0.3 + 0.7 * Math.abs(Math.sin(t * 0.8 + k * 1.3 + i)); g.fillStyle = k % 2 ? '#ff9a52' : '#38d6f5'; g.fillRect(16 + k * 28, h - 24 - v * 110, 18, v * 110); }
      tex.needsUpdate = true;
    });
  }
  if (!W) return;
  (W.gruas || []).forEach((q) => { q.topo.rotation.y = Math.sin(t * 0.07 + q.f) * 1.4; q.aviso.material.opacity = Math.sin(t * 3 + q.f) > 0 ? 0.95 : 0.15; });
  (W.reservasOcupadas || []).forEach((r) => { r.grupo.visible = !!ap && ap.id !== r.id; });
  passoRobos(t, dt);
}

/* ---------- Robôs de apoio (Centro de IA e Praça da Inovação): rodam num anel e param quando alguém chega perto ---------- */
function criarRobos() {
  const T = THREE, P = PLANO; if (P.robos) return;
  P.robos = [];
  const corpo = mat(0xf4f6f9, { roughness: 0.35, metalness: 0.2 }), escuro = mat(0x1a2233, { roughness: 0.4 });
  [P.robosAnel, P.robosAnel2].forEach((A) => {
    if (!A) return;
    for (let k = 0; k < A.n; k++) {
      const r = new T.Group(); CAMPO.planoGrupo.add(r);
      peca(r, G3.caixaC, corpo, 0.42, 0.34, 0.34, 0, 0.3, 0); peca(r, G3.bola, corpo, 0.2, 0.18, 0.2, 0, 0.6, 0); peca(r, G3.caixaC, escuro, 0.05, 0.08, 0.22, 0.18, 0.62, 0);
      peca(r, G3.roda, escuro, 0.09, 0.09, 0.4, 0, 0.1, 0); const olho = brilho(r, 0x38d6f5, 0.28, 0.22, 0.62, 0, 0.9);
      P.robos.push({ r, olho, A, a: k / A.n * Math.PI * 2, v: 0.35 / A.r });
    }
  });
}
function passoRobos(t, dt) {
  const P = PLANO; if (!P.robos) criarRobos();
  const M = CAMPO.multidao;
  P.robos.forEach((b) => {
    const x = b.A.cx + Math.cos(b.a) * b.A.r, z = b.A.cz + Math.sin(b.a) * b.A.r;
    let perto = false;
    if (M) { const l = M.hash.get(Math.floor(x) * 4096 + Math.floor(z)); if (l) perto = l.some((p) => p.visivel && Math.hypot(p.x - x, p.z - z) < 0.9); }
    if (!perto) b.a += b.v * dt;
    b.r.position.set(x, PLANO.ALT, z); b.r.rotation.y = -b.a - Math.PI / 2 + Math.PI;
    b.olho.material.opacity = perto ? (Math.sin(t * 10) > 0 ? 1 : 0.3) : 0.9;
  });
}

/* ---------- Clique num centro: a câmera chega perto e abre o cartão com os atalhos ---------- */
function abrirCentro(chave) {
  const C = CENTROS[chave], P = PLANO; if (!C || CAMPO.ap) return;
  const tp = P.topoCentro[chave];
  animarCamera({ alvo: new THREE.Vector3(tp.x, Math.min(5, tp.y * 0.35), tp.z), raio: 40 + tp.y * 1.2, theta: CAM.theta, phi: 1.08 }, 800);   // de lado, para ver a fachada
  let el = CAMPO.cartaoCentro;
  if (!el) {
    el = document.createElement('div'); el.className = 'cartao-centro'; CAMPO.el.appendChild(el); CAMPO.cartaoCentro = el;
    el.addEventListener('click', (ev) => { if (ev.target.closest('[data-fechar]')) { el.hidden = true; } else if (ev.target.closest('a')) el.hidden = true; });
  }
  const links = C.links();
  el.innerHTML = `<button class="cc-fechar" data-fechar aria-label="Fechar">×</button><p class="cc-olho">Real Forte · centro da consultoria</p><h3>${esc(C.nome)}</h3><p class="cc-desc">${esc(C.desc)}</p>`
    + (links.length ? `<div class="cc-links">${links.map(([h, t]) => `<a href="${esc(h)}">${esc(t)}</a>`).join('')}</div>` : '<p class="cc-desc">Nenhuma empresa cadastrada ainda.</p>');
  el.hidden = false;
}
// Estilo do cartão e do rótulo dos centros (fica junto do código, para não depender de outro arquivo)
function estiloDaCidade() {
  if (document.getElementById('estilo-cidade')) return;
  const s = document.createElement('style'); s.id = 'estilo-cidade';
  s.textContent = `.cartao-centro{position:absolute;right:16px;top:96px;width:min(340px,calc(100% - 32px));background:rgba(10,22,44,.92);color:#eef2f8;border:1px solid rgba(160,190,240,.25);border-radius:14px;padding:16px 16px 12px;backdrop-filter:blur(10px);z-index:2000;box-shadow:0 18px 40px rgba(0,0,0,.35)}
.cartao-centro h3{margin:2px 0 6px;font-size:17px;color:#fff}.cartao-centro .cc-olho{margin:0;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#ffb27a}
.cartao-centro .cc-desc{margin:0 0 10px;font-size:13px;color:#b9c7dd;line-height:1.4}.cartao-centro .cc-links{display:flex;flex-direction:column;gap:6px;max-height:260px;overflow:auto}
.cartao-centro .cc-links a{display:block;padding:8px 10px;border-radius:8px;background:rgba(255,255,255,.07);color:#fff;text-decoration:none;font-size:13px}.cartao-centro .cc-links a:hover{background:rgba(217,104,26,.35)}
.cartao-centro .cc-fechar{position:absolute;right:8px;top:6px;background:none;border:0;color:#b9c7dd;font-size:22px;cursor:pointer;line-height:1}
.rotulo-centro{position:absolute;left:0;top:0;pointer-events:none;background:rgba(10,22,44,.85);color:#fff;font-size:12px;font-weight:600;padding:5px 10px;border-radius:999px;white-space:nowrap;border:1px solid rgba(255,178,122,.45)}
.campo-zoom{position:absolute;right:16px;bottom:16px;display:flex;flex-direction:column;gap:6px;z-index:1500}.campo-zoom button{width:38px;height:38px;border-radius:10px;border:1px solid rgba(160,190,240,.25);background:rgba(12,24,46,.78);color:#eef2f8;font-size:18px;cursor:pointer;backdrop-filter:blur(8px)}
.campo-zoom button.txt{width:auto;padding:0 10px;font-size:12px;font-weight:600}.campo-zoom button:hover{background:rgba(217,104,26,.55)}`;
  document.head.appendChild(s);
}

/* ---------- Fachada Viva (Centro de Performance) ----------
   Luz passando pelas lâminas da fachada, em ondas lentas. A intensidade segue o movimento da cidade
   (quanta gente está andando agora) e, por cima, uma linha de evolução subindo devagar, com o nome
   do centro discreto no canto. Nada de número de cliente: é só o "pulso" da cidade. */
function passoFachadaViva(t) {
  const F = PLANO.fachadaViva; if (!F || t < (F.prox || 0)) return;
  F.prox = t + 0.12;
  const M = CAMPO.multidao, andando = M ? M.agentes.filter((a) => a.visivel && a.estado === 'andando').length : 0;
  F.pico += ((Math.min(1, andando / 60)) - F.pico) * 0.1;
  const g = F.tela.getContext('2d'), W = F.tela.width, H = F.tela.height, n = 40, noite = noiteAgora();
  g.clearRect(0, 0, W, H);
  for (let k = 0; k < n; k++) {
    const x = (k + 0.5) / n * W, onda = 0.5 + 0.5 * Math.sin(k * 0.35 - t * 1.2), alto = (0.25 + 0.55 * onda * (0.4 + 0.6 * F.pico)) * H;
    const gr = g.createLinearGradient(0, H, 0, H - alto); gr.addColorStop(0, `rgba(255,138,61,${0.55 + noite * 0.3})`); gr.addColorStop(1, 'rgba(255,138,61,0)');
    g.fillStyle = gr; g.fillRect(x - 3, H - alto, 6, alto);
  }
  g.strokeStyle = `rgba(56,214,245,${0.5 + noite * 0.4})`; g.lineWidth = 3; g.beginPath();
  for (let x = 0; x <= W; x += 8) { const u = x / W, y = H * (0.82 - u * 0.5) + Math.sin(u * 9 + t * 0.6) * 10; x ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '600 22px monospace'; g.fillText('CENTRO DE PERFORMANCE · RESULTADOS', 24, 40);
  F.tex.needsUpdate = true;
}

/* Painel de partidas do Terminal da Real Forte: próximos pontos da linha e em quantos minutos o ônibus
   chega lá (pela distância de cada ônibus até o ponto). Na apresentação, só o ponto da empresa apresentada. */
function passoPartidas(t) {
  const Pp = PLANO.painelPartidas, X = CAMPO.transito, M = CAMPO.multidao; if (!Pp || !X || t < (Pp.prox || 0)) return;
  Pp.prox = t + 1;
  const g = Pp.tela.getContext('2d'), W = Pp.tela.width, H = Pp.tela.height, ap = CAMPO.ap;
  g.fillStyle = '#071226'; g.fillRect(0, 0, W, H); g.fillStyle = '#d9681a'; g.fillRect(0, 0, W, 5);
  g.fillStyle = '#ffb27a'; g.font = '600 20px monospace'; g.fillText('PARTIDAS · LINHA DAS EMPRESAS', 16, 32);
  const onibus = (X.veiculos || []).filter((v) => v.tipo === 'onibus' && !v.recolhido); if (!onibus.length) return;
  const tr = onibus[0].tr, nomes = new Map((M && M.estacoes || []).map((e) => [e.id, e]));
  const linhas = (tr.paradas || []).filter((p) => p.estacao && p.estacao !== 'station').map((p) => {
    const e = nomes.get(p.estacao), il = e && e.il ? CAMPO.ilhas.get(e.il) : null;
    if (ap && il && il.id !== ap.id) return null;
    const nome = il ? il.dados.nome : 'Praça das Conexões';
    const min = Math.min(...onibus.map((v) => { let d = p.i * PASSO_ROTA - v.s; if (d < 0) d += tr.total; return d / Math.max(1.5, v.vmax); })) / 60;
    return [nome, min];
  }).filter(Boolean).sort((a, b) => a[1] - b[1]).slice(0, 4);
  linhas.forEach(([nome, min], i) => {
    const y = 66 + i * 34; g.fillStyle = '#ffffff'; g.font = '20px Arial, sans-serif'; g.fillText(String(nome).slice(0, 30), 16, y);
    g.fillStyle = '#38d6f5'; g.textAlign = 'right'; g.fillText(min < 0.6 ? 'chegando' : Math.round(min) + ' min', W - 16, y); g.textAlign = 'left';
  });
  Pp.tex.needsUpdate = true;
}

/* ---------- Trânsito ----------
   Só na rua, pela mão direita, em rota definida:
   - Cápsulas autônomas da Real Forte: Linha Sede (em volta da sede, para nos centros) e Linha Distritos
     (em volta do anel dos centros, para na frente dos lotes). Param 5 s em cada estação: quem está
     esperando embarca e desce mais tarde em outra estação.
   - Carros executivos da Real Forte: deixam gente na sede, no Centro de Apresentações e no de Diagnóstico.
   - Um veículo por empresa, conforme o segmento: entra na cidade, para na frente do portão da empresa
     e sai por outra entrada. Distribuição e indústria: caminhão; saúde: ambulância; tecnologia: carro
     elétrico; varejo: van. Os outros segmentos não têm veículo (não é para ter caminhão em todo lugar).
   À noite roda menos: uma cápsula por linha e só a distribuição e a saúde continuam com operação.
   Todo veículo freia para quem está na faixa de pedestre e para o carro da frente. */
const VEICULO_DO_SEGMENTO = { distribuicao: 'carreta', industria: 'caminhao', saude: 'ambulancia', tecnologia: 'eletrico', varejo: 'van' };
// De quantos em quantos segundos sai um veículo da empresa (de dia / de noite; 0 = não sai)
const INTERVALO_DO_SEGMENTO = { distribuicao: [9, 14], industria: [16, 30], saude: [18, 24], tecnologia: [16, 40], varejo: [20, 45] };
const MAX_DA_EMPRESA = { distribuicao: 3, industria: 2, saude: 2, tecnologia: 2, varejo: 2 };   // quantos da mesma empresa podem estar rodando juntos
const MAX_POR_TIPO = 16, FAIXA = 1.25, PASSO_ROTA = 0.5;

/* Modelos dos veículos (frente no +x). Cada um tem "base" (cores fixas) e "cor" (pega a cor da empresa).
   "logo": onde vão as placas com a logo da empresa nas laterais [x, y, largura, altura, meia-largura do veículo]. */
function modelosDeVeiculo() {
  if (CAMPO.modelosVeiculo) return CAMPO.modelosVeiculo;
  formasDeGente();
  const B = G3.caixaC, Rd = G3.roda, branco = 0xf4f6f9, vidro = 0x1d2b40, pneu = 0x15181f, aro = 0xb8c2d0, chassi = 0x2b3446, farol = 0xfff4d6, lanterna = 0xd8443a, laranja = 0xff8a3d, cinza = 0x8a96a8, grade = 0x1a1f2b;
  const cx = (x, y, z, sx, sy, sz, cor, r) => ({ geo: B, p: [x, y, z], esc: [sx, sy, sz], cor, r });
  const par = (f) => [f(1), f(-1)];   // peça dos dois lados (z e -z)
  const rodas = (xs, z, r) => [].concat(...xs.map((x) => par((s) => [{ geo: Rd, p: [x, r, s * z], esc: [r, r, 0.12], cor: pneu }, { geo: Rd, p: [x, r, s * (z + 0.062)], esc: [r * 0.55, r * 0.55, 0.01], cor: aro }]).flat()));
  // Cabine de caminhão (bico achatado, para-brisa grande, defletor no teto, retrovisores, para-choque)
  const cabine = (x0, larg, alt) => ({
    base: [cx(x0 + 0.62, alt * 0.62, 0, 0.012, alt * 0.34, larg - 0.08, vidro), ...par((s) => cx(x0 + 0.42, alt * 0.64, s * (larg / 2 + 0.004), 0.3, alt * 0.26, 0.01, vidro)),
      cx(x0 + 0.62, alt * 0.3, 0, 0.012, alt * 0.22, larg * 0.66, grade), ...par((s) => cx(x0 + 0.623, alt * 0.3, s * larg * 0.39, 0.012, 0.07, 0.09, farol)),
      cx(x0 + 0.64, 0.25, 0, 0.07, 0.11, larg + 0.02, cinza), ...par((s) => cx(x0 + 0.56, alt * 0.66, s * (larg / 2 + 0.06), 0.04, 0.13, 0.03, grade)),
      ...par((s) => cx(x0 + 0.2, 0.2, s * (larg / 2 - 0.04), 0.14, 0.04, 0.08, cinza))],
    cor: [cx(x0 + 0.3, alt * 0.55, 0, 0.62, alt * 0.9, larg, 0xffffff), cx(x0 + 0.22, alt + 0.08, 0, 0.44, 0.17, larg - 0.04, 0xffffff)]
  });
  const cab = cabine(0.62, 0.62, 0.98), cab2 = cabine(0.32, 0.6, 0.9);
  const M = {
    // Carreta: cavalo + baú longo com a logo da empresa dos dois lados
    carreta: { len: 3.9, logo: [-0.85, 0.88, 2.2, 0.62, 0.333],
      base: [cx(-0.45, 0.24, 0, 3.6, 0.1, 0.42, chassi), cx(-0.85, 0.86, 0, 2.6, 0.92, 0.66, branco), cx(-2.16, 0.86, 0, 0.03, 0.9, 0.64, 0xdfe3e9), cx(-2.18, 0.86, 0, 0.01, 0.88, 0.02, 0x9aa3b0),
        ...par((s) => cx(-2.17, 0.45, s * 0.26, 0.02, 0.07, 0.08, lanterna)), ...par((s) => cx(-0.95, 0.34, s * 0.3, 1.5, 0.14, 0.01, 0x9aa3b0)),
        ...par((s) => ({ geo: G3.cilDeitado, p: [0.62, 0.3, s * 0.25], esc: [0.32, 0.09, 0.09], cor: 0xc9d0da }))].concat(cab.base, rodas([-1.9, -1.55, 0.25, 1.05], 0.27, 0.17)),
      cor: cab.cor.concat(par((s) => cx(-0.85, 0.43, s * 0.334, 2.6, 0.07, 0.01, 0xffffff))) },
    // Caminhão baú (indústria)
    caminhao: { len: 3.0, logo: [-0.45, 0.85, 1.6, 0.6, 0.323],
      base: [cx(-0.2, 0.24, 0, 2.6, 0.1, 0.42, chassi), cx(-0.45, 0.84, 0, 1.8, 0.88, 0.64, branco), cx(-1.36, 0.84, 0, 0.02, 0.86, 0.62, 0xdfe3e9), ...par((s) => cx(-1.37, 0.45, s * 0.25, 0.02, 0.07, 0.08, lanterna))].concat(cab2.base, rodas([-0.95, -0.62, 0.75], 0.27, 0.16)),
      cor: cab2.cor.concat(par((s) => cx(-0.45, 0.42, s * 0.324, 1.8, 0.07, 0.01, 0xffffff))) },
    // Van de entrega (varejo): capô curto, para-brisa inclinado, janela lateral
    van: { len: 1.75, logo: [-0.2, 0.55, 0.95, 0.34, 0.302],
      base: [cx(-0.12, 0.52, 0, 1.4, 0.66, 0.6, branco), cx(0.72, 0.36, 0, 0.32, 0.34, 0.58, branco), cx(0.6, 0.7, 0, 0.02, 0.32, 0.54, vidro, [0, 0, 0.55]), ...par((s) => cx(0.45, 0.7, s * 0.302, 0.32, 0.2, 0.01, vidro)),
        cx(0.89, 0.34, 0, 0.012, 0.12, 0.4, grade), ...par((s) => cx(0.892, 0.4, s * 0.22, 0.012, 0.06, 0.08, farol)), cx(0.92, 0.22, 0, 0.05, 0.08, 0.6, cinza), ...par((s) => cx(-0.83, 0.42, s * 0.24, 0.02, 0.08, 0.06, lanterna))].concat(rodas([-0.5, 0.62], 0.27, 0.14)),
      cor: par((s) => cx(-0.12, 0.3, s * 0.302, 1.4, 0.08, 0.01, 0xffffff)) },
    // Ambulância: van branca com faixas vermelhas, giroflex e a cruz no teto
    ambulancia: { len: 1.8, logo: [-0.25, 0.68, 0.7, 0.24, 0.312],
      base: [cx(-0.12, 0.56, 0, 1.45, 0.74, 0.62, branco), cx(0.74, 0.37, 0, 0.32, 0.36, 0.6, branco), cx(0.62, 0.72, 0, 0.02, 0.32, 0.56, vidro, [0, 0, 0.55]), ...par((s) => cx(0.47, 0.72, s * 0.312, 0.3, 0.2, 0.01, vidro)),
        ...par((s) => cx(-0.12, 0.4, s * 0.312, 1.45, 0.12, 0.01, 0xd8443a)), cx(0.35, 0.96, 0, 0.14, 0.06, 0.5, 0xd8443a), cx(0.35, 0.965, 0.12, 0.13, 0.065, 0.16, 0x4d8ff0),
        cx(-0.35, 0.94, 0, 0.42, 0.02, 0.12, 0xd8443a), cx(-0.35, 0.94, 0, 0.12, 0.02, 0.42, 0xd8443a), cx(0.91, 0.36, 0, 0.012, 0.12, 0.42, grade), ...par((s) => cx(0.912, 0.42, s * 0.22, 0.012, 0.06, 0.08, farol)), cx(0.94, 0.22, 0, 0.05, 0.08, 0.62, cinza)].concat(rodas([-0.5, 0.62], 0.28, 0.14)),
      cor: [] },
    // Carro elétrico (tecnologia): capô, cabine de vidro, teto e porta-malas, faixa de luz na frente
    eletrico: { len: 1.4, logo: [-0.05, 0.3, 0.5, 0.15, 0.282],
      base: [cx(-0.08, 0.47, 0, 0.66, 0.2, 0.5, vidro), cx(0.69, 0.27, 0, 0.012, 0.04, 0.46, 0x9fe8ff), cx(-0.69, 0.3, 0, 0.012, 0.05, 0.44, lanterna)].concat(rodas([-0.42, 0.44], 0.26, 0.13)),
      cor: [cx(0, 0.26, 0, 1.38, 0.22, 0.56, 0xffffff), cx(-0.1, 0.585, 0, 0.5, 0.03, 0.46, 0xffffff)] },
    // Carro executivo da Real Forte (preto, com o filete laranja)
    executivo: { len: 1.5,
      base: [cx(0, 0.26, 0, 1.48, 0.22, 0.58, 0x14171d), cx(-0.1, 0.47, 0, 0.7, 0.21, 0.52, vidro), cx(-0.12, 0.59, 0, 0.56, 0.03, 0.5, 0x14171d), ...par((s) => cx(0, 0.31, s * 0.292, 1.4, 0.025, 0.01, laranja)),
        cx(0.745, 0.28, 0, 0.012, 0.05, 0.48, farol), cx(-0.745, 0.3, 0, 0.012, 0.05, 0.46, lanterna)].concat(rodas([-0.46, 0.46], 0.27, 0.13)),
      cor: [] },
    // Ônibus da Real Forte (liga a Estação Real Forte ao ponto de cada empresa)
    onibus: { len: 3.8, logo: [-0.3, 0.43, 2.3, 0.3, 0.437],
      base: [cx(0, 0.8, 0, 3.6, 1.0, 0.86, branco), ...par((s) => cx(0, 0.43, s * 0.432, 3.6, 0.36, 0.01, 0x0f2342)), ...par((s) => cx(0, 1.0, s * 0.433, 3.3, 0.36, 0.01, vidro)),
        ...par((s) => cx(0, 0.7, s * 0.434, 3.6, 0.05, 0.01, laranja)), cx(1.805, 0.92, 0, 0.012, 0.6, 0.78, vidro), cx(-1.805, 1.02, 0, 0.012, 0.34, 0.7, vidro),
        cx(1.81, 1.22, 0, 0.012, 0.1, 0.6, laranja), cx(0, 1.32, 0, 3.4, 0.06, 0.8, 0xe6eaf0), cx(-0.4, 1.41, 0, 1.0, 0.13, 0.6, 0xd5dbe3), cx(1.2, 0.78, 0.435, 0.42, 0.86, 0.012, vidro),
        ...par((s) => cx(1.81, 0.45, s * 0.3, 0.012, 0.07, 0.12, farol)), ...par((s) => cx(-1.81, 0.48, s * 0.3, 0.012, 0.08, 0.1, lanterna)), cx(1.84, 0.27, 0, 0.06, 0.1, 0.86, cinza), cx(0, 0.25, 0, 3.5, 0.12, 0.8, chassi)].concat(rodas([-1.15, 1.15], 0.36, 0.2)),
      cor: [] },
    // Cápsula autônoma: micro-ônibus branco, faixa de vidro em volta, filete laranja de luz
    capsula: { len: 2.1,
      base: [cx(0, 0.6, 0, 2.0, 0.86, 0.9, branco), cx(1.005, 0.78, 0, 0.02, 0.44, 0.8, vidro), cx(-1.005, 0.78, 0, 0.02, 0.44, 0.8, vidro), ...par((s) => cx(0, 0.8, s * 0.452, 1.84, 0.34, 0.01, vidro)),
        cx(0, 1.06, 0, 1.92, 0.08, 0.84, 0xe6eaf0), ...par((s) => cx(0, 0.5, s * 0.453, 1.92, 0.04, 0.01, laranja)), cx(1.012, 0.46, 0, 0.01, 0.04, 0.7, laranja), cx(-1.012, 0.46, 0, 0.01, 0.04, 0.7, lanterna),
        cx(0, 0.2, 0, 1.9, 0.12, 0.84, chassi), cx(0.3, 0.6, 0.453, 0.5, 0.62, 0.012, 0xc9d0da)].concat(rodas([-0.65, 0.65], 0.4, 0.15)),
      cor: [] }
  };
  Object.keys(M).forEach((k) => { M[k].geoBase = fundir(M[k].base); M[k].geoCor = M[k].cor.length ? fundir(M[k].cor) : null; });
  CAMPO.modelosVeiculo = M;
  return M;
}
// Ônibus da Real Forte: peça própria com o nome nas laterais
function corpoDaRealForte(extras) {
  const T = THREE, Mo = modelosDeVeiculo().onibus;
  if (!CAMPO.matVeiculoEmpresa) CAMPO.matVeiculoEmpresa = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.25, envMap: CAMPO.ambiente, envMapIntensity: 0.5 });
  const g = new T.Group(), m = new T.Mesh(Mo.geoBase, CAMPO.matVeiculoEmpresa); m.castShadow = true; g.add(m);
  if (!CAMPO.texOnibus) CAMPO.texOnibus = texturaTexto(['REAL FORTE', 'Linha das Empresas'], '#0f2342', '#ffffff', 768, 100);
  const mm = new T.MeshBasicMaterial({ map: CAMPO.texOnibus, toneMapped: false }); extras.push(mm);
  const [x, y, w, h, z] = Mo.logo;
  [1, -1].forEach((s) => { const pl = new T.Mesh(G3.placa, mm); pl.scale.set(w, h, 1); pl.position.set(x, y, s * z); pl.rotation.y = s > 0 ? 0 : Math.PI; g.add(pl); });
  g.visible = false; CAMPO.cena.add(g);
  return g;
}
// Caminho na grade sem usar nenhuma das arestas proibidas
function caminhoEvitando(de, ate, arestas) {
  const igual = (a, b) => a[0] === b[0] && a[1] === b[1], ruim = (n, v) => arestas.some(([p, q]) => (igual(n, p) && igual(v, q)) || (igual(n, q) && igual(v, p)));
  const veio = new Map([[chaveNo(de), null]]), fila = [de];
  while (fila.length) { const n = fila.shift(); if (igual(n, ate)) break; vizinhosNo(n).forEach((v) => { const k = chaveNo(v); if (veio.has(k) || ruim(n, v)) return; veio.set(k, n); fila.push(v); }); }
  if (!veio.has(chaveNo(ate))) return null;
  const out = []; for (let n = ate; n; n = veio.get(chaveNo(n))) out.unshift(n); return out;
}
/* Linha dos ônibus: sai da Estação Real Forte, passa na frente do portão de cada empresa (na ordem
   em volta da cidade) e volta para a estação. Refeita quando entra ou sai empresa. */
function rotaDosOnibus(lista) {
  // Começa no Terminal da Real Forte: entra pela pista oeste, para na plataforma e sai pela pista leste
  const SA = [-23.5, -53.5], SB = [23.5, -53.5];
  const T0 = { A: [-23.5, 29.5], B: [23.5, 29.5], porta: [0, 29.5] };   // ponto da Praça das Conexões
  const trechos = [T0].concat(lista.filter(il_temLote).map((il) => Object.assign({ il }, trechoDoPortao(il.lote))).filter((t) => t.A));
  trechos.sort((a, b) => Math.atan2(a.porta[0], a.porta[1]) - Math.atan2(b.porta[0], b.porta[1]));
  const nos = [[-15, -53.5], [-15, -82.8], [15, -82.8], [15, -53.5], SB]; let atual = SB, antes = [SA, SB];   // -82.8: pista de trás do Terminal (plataforma)
  const vistos = new Set([chaveNo(SA) + chaveNo(SB), chaveNo(SB) + chaveNo(SA)]);
  trechos.forEach((t) => {
    const k = chaveNo(t.A) + chaveNo(t.B); if (vistos.has(k)) return;
    const c = atual[0] === t.A[0] && atual[1] === t.A[1] ? [atual] : caminhoEvitando(atual, t.A, [antes, [t.A, t.B]]);
    if (!c) return; vistos.add(k);
    nos.push(...c.slice(1), t.B); atual = t.B; antes = [t.A, t.B];
  });
  const volta = caminhoEvitando(atual, SA, [antes, [SA, SB]]);
  if (volta) nos.push(...volta.slice(1));   // termina no cruzamento de onde volta para a estação
  const limpos = nos.filter((n, i) => i === 0 || n[0] !== nos[i - 1][0] || n[1] !== nos[i - 1][1]);
  return trajeto(limpos, true);
}
// Ponto de ônibus na calçada de cada empresa, logo depois do portão (abrigo, banco e placa da Real Forte)
function pontosDeOnibus(lista, W) {
  const T = THREE, P = PLANO, R = P.RUA / 2, I = new T.Matrix4(), K = novoLote(), MP = P.mats;
  W.estacoesOnibus = [];
  lista.filter(il_temLote).forEach((il) => {
    const t = trechoDoPortao(il.lote); if (!t) return;
    const d = il.lote.dir, h = [-d[1], d[0]], r = [-d[0], -d[1]];   // h: sentido do ônibus; r: da rua para o lote
    const em = (along, fundo) => [t.porta[0] + h[0] * along + r[0] * fundo, t.porta[1] + h[1] * along + r[1] * fundo];
    const [px, pz] = em(5.5, FAIXA), cA = em(4.0, R + 0.25), cB = em(7.0, R + 1.45);
    const x0 = Math.min(cA[0], cB[0]), x1 = Math.max(cA[0], cB[0]), z0 = Math.min(cA[1], cB[1]), z1 = Math.max(cA[1], cB[1]);
    K.add(G3.caixa, MP.navy, (x0 + x1) / 2, 2.4, (z0 + z1) / 2, x1 - x0, 0.12, z1 - z0); K.add(G3.caixa, MP.laranja, (x0 + x1) / 2, 2.38, (z0 + z1) / 2, x1 - x0 + 0.04, 0.03, z1 - z0 + 0.04, 0, 0, 0, false);
    [em(4.1, R + 1.35), em(6.9, R + 1.35)].forEach(([x, z]) => { K.add(G3.cil, MP.metal, x, P.ALT, z, 0.05, 2.4, 0.05); navBloquear(I, x - 0.1, x + 0.1, z - 0.1, z + 0.1); });
    const espera = [4.4, 5.2, 6.0, 6.8].map((a) => { const [x, z] = em(a, R + 0.6); return ponto(x, z, rotDe(-r[0], -r[1]), 'olhar', { dur: 90 }); });
    const [sx, sz] = em(5.5, R + 2.6);
    W.estacoesOnibus.push({ id: 'emp-' + il.id, linha: 3, il: il.id, parada: [px, pz], espera, saida: { x: sx, z: sz } });
  });
  const objs = []; K.montar(W.grupo, objs); objs.forEach((o) => W.extras.push(o));
}
// Veículo de uma empresa: peça própria, já com a cor da empresa e a logo nas laterais (como um caminhão de verdade da empresa)
function corpoDaEmpresa(tipo, il, extras) {
  const T = THREE, Mo = modelosDeVeiculo()[tipo], cor = (il.cores && il.cores.destaque) || 0x2f5ea8;
  const geo = fundir(Mo.base.concat(Mo.cor.map((p) => Object.assign({}, p, { cor })))); extras.push(geo);
  if (!CAMPO.matVeiculoEmpresa) CAMPO.matVeiculoEmpresa = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.25, envMap: CAMPO.ambiente, envMapIntensity: 0.5 });
  const g = new T.Group(), m = new T.Mesh(geo, CAMPO.matVeiculoEmpresa); m.castShadow = true; g.add(m);
  if (Mo.logo) {
    const [x, y, w, h, z] = Mo.logo, tex = texturaPlaca(il.dados, w, h); extras.push(tex);
    const mm = new T.MeshBasicMaterial({ map: tex, toneMapped: false }); extras.push(mm);
    [1, -1].forEach((s) => { const pl = new T.Mesh(G3.placa, mm); pl.scale.set(w, h, 1); pl.position.set(x, y, s * z); pl.rotation.y = s > 0 ? 0 : Math.PI; g.add(pl); });
  }
  // Quem leva a carga: fica escondido e aparece quando o veículo encosta para carregar ou descarregar
  if (tipo !== 'ambulancia') {
    const aj = novaPessoa({ roupa: cor, detalhe: 0xf2d33a, calca: 0x2b3446, cabelo: 0x1b1b1f, pele: PELES[(il.id.length || 1) % PELES.length], escala: 1.32 });
    aj.visible = false; g.add(aj); g.userData.ajudante = aj;
  }
  g.visible = false; CAMPO.cena.add(g);
  return g;
}
/* Ajudante: sai pela traseira, leva (ou busca) a caixa até o portão e volta, no tempo da parada.
   Tudo no sistema do veículo: frente = +x, lado do lote = +z (o portão fica 1,5 à frente e uns 5 para dentro). */
function passoAjudante(v, t) {
  const aj = v.grupo.userData.ajudante, p = v.paradaAtual;
  if (!(v.espera > 0 && p && p.tipo)) { aj.visible = false; return; }
  const L = modelosDeVeiculo()[v.tipo].len, ax = -L / 2 - 0.35, az = 0.85, bx = 1.5, bz = 4.6;
  const dur = p.dur - 1, u = Math.min(1, Math.max(0, (p.dur - v.espera - 0.5) / dur));   // pelo tempo que já passou parado
  const ida = u < 0.5, f = ida ? u * 2 : 2 - u * 2;   // 0 = traseira, 1 = portão
  aj.visible = u > 0 && u < 1;
  aj.position.set(ax + (bx - ax) * f, 0.03 * f, az + (bz - az) * f);
  aj.rotation.y = ida ? Math.atan2(-(bz - az), bx - ax) : Math.atan2(bz - az, -(bx - ax));
  const s = Math.sin(t * 9), U = aj.userData;
  U.pernas[0].rotation.z = s * 0.5; U.pernas[1].rotation.z = -s * 0.5;
  const comCaixa = p.tipo === 'descarga' ? ida : !ida;   // descarga: leva a caixa; carga: volta com ela
  U.carga.visible = comCaixa; U.bracos.forEach((b, k) => { b.rotation.z = comCaixa ? 1.0 : (k ? s : -s) * 0.3; });
}

/* ---------- Rotas ---------- */
const chaveNo = (n) => n[0] + ',' + n[1];
function vizinhosNo(n) {
  const P = PLANO, i = P.XR.indexOf(n[0]), j = P.ZR.indexOf(n[1]), out = [];
  if (i < 0 || j < 0) return out;
  if (i > 0) out.push([P.XR[i - 1], n[1]]); if (i < 5) out.push([P.XR[i + 1], n[1]]);
  if (j > 0) out.push([n[0], P.ZR[j - 1]]); if (j < 5) out.push([n[0], P.ZR[j + 1]]);
  return out;
}
// Caminho mais curto pela grade de avenidas (sem usar a aresta proibida, nos dois sentidos)
function caminhoNaGrade(de, ate, proibida) {
  const igual = (a, b) => a[0] === b[0] && a[1] === b[1];
  const veio = new Map([[chaveNo(de), null]]), fila = [de];
  while (fila.length) {
    const n = fila.shift(); if (igual(n, ate)) break;
    vizinhosNo(n).forEach((v) => {
      const k = chaveNo(v); if (veio.has(k)) return;
      if (proibida && ((igual(n, proibida[0]) && igual(v, proibida[1])) || (igual(n, proibida[1]) && igual(v, proibida[0])))) return;
      veio.set(k, n); fila.push(v);
    });
  }
  if (!veio.has(chaveNo(ate))) return null;
  const out = []; for (let n = ate; n; n = veio.get(chaveNo(n))) out.unshift(n);
  return out;
}
/* Trajeto pela faixa da direita: desloca cada trecho para a direita, arredonda as curvas e
   reamostra de meio em meio metro (assim achar a posição em qualquer ponto é imediato). */
function trajeto(nos, ciclica) {
  const lista = nos.slice(); const m = lista.length;
  const dir = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1; return [dx / L, dz / L]; };
  const direita = (d) => [-d[1], d[0]];
  const pts = [];
  for (let k = 0; k < m; k++) {
    const temAntes = ciclica || k > 0, temDepois = ciclica || k < m - 1;
    const a = temAntes ? dir(lista[(k - 1 + m) % m], lista[k]) : null, b = temDepois ? dir(lista[k], lista[(k + 1) % m]) : null;
    const [x, z] = lista[k];
    if (!a || !b) { const r = direita(a || b); pts.push([x + r[0] * FAIXA, z + r[1] * FAIXA]); continue; }
    const ra = direita(a), rb = direita(b), cos = a[0] * b[0] + a[1] * b[1];
    if (cos > 0.99) { pts.push([x + ra[0] * FAIXA, z + ra[1] * FAIXA]); continue; }
    const cx = x + (ra[0] + rb[0]) * FAIXA, cz = z + (ra[1] + rb[1]) * FAIXA, R = 2.2;
    const s = [cx - a[0] * R, cz - a[1] * R], e = [cx + b[0] * R, cz + b[1] * R];
    for (let u = 0; u <= 1.0001; u += 0.2) { const v = 1 - u; pts.push([v * v * s[0] + 2 * v * u * cx + u * u * e[0], v * v * s[1] + 2 * v * u * cz + u * u * e[1]]); }
  }
  if (ciclica) pts.push(pts[0].slice());
  // Reamostrar
  const acum = [0]; for (let i = 1; i < pts.length; i++) acum.push(acum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = acum[acum.length - 1], n = Math.max(2, Math.floor(total / PASSO_ROTA) + 1);
  const px = new Float32Array(n), pz = new Float32Array(n), lim = new Float32Array(n), faixa = new Int16Array(n).fill(-1);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = Math.min(total, i * PASSO_ROTA); while (j < acum.length - 2 && acum[j + 1] < s) j++;
    const u = (s - acum[j]) / ((acum[j + 1] - acum[j]) || 1); px[i] = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * u; pz[i] = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * u;
  }
  // Velocidade nas curvas (pela mudança de direção) e onde estão as faixas de pedestre
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 3), b = Math.min(n - 1, i + 3), c = Math.max(0, Math.min(n - 1, i));
    const h1 = Math.atan2(pz[c] - pz[a], px[c] - px[a]), h2 = Math.atan2(pz[b] - pz[c], px[b] - px[c]);
    const dif = Math.abs(Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1)));
    lim[i] = dif > 0.25 ? 0.45 : 1;
    PLANO.faixas.forEach(([x0, x1, z0, z1], f) => { if (px[i] > x0 - 0.3 && px[i] < x1 + 0.3 && pz[i] > z0 - 0.3 && pz[i] < z1 + 0.3) faixa[i] = f; });
  }
  return { px, pz, lim, faixa, n, total: (n - 1) * PASSO_ROTA, ciclica };
}
const indiceMaisPerto = (tr, x, z) => { let m = 0, d = 1e9; for (let i = 0; i < tr.n; i++) { const e = (tr.px[i] - x) ** 2 + (tr.pz[i] - z) ** 2; if (e < d) { d = e; m = i; } } return m; };
// Na frente do portão: a avenida e os dois cruzamentos, no sentido em que a faixa da direita encosta no lote
function trechoDoPortao(L) {
  const P = PLANO, R = P.RUA / 2, d = L.dir, h = [-d[1], d[0]];
  if (d[1]) { const zr = d[1] < 0 ? L.b.z0 - R : L.b.z1 + R, xs = P.XR.filter((x) => x < L.cx).pop(), xb = P.XR.find((x) => x > L.cx); if (xs == null || xb == null) return null; return { A: h[0] > 0 ? [xs, zr] : [xb, zr], B: h[0] > 0 ? [xb, zr] : [xs, zr], porta: [L.cx, zr] }; }
  const xr = d[0] < 0 ? L.b.x0 - R : L.b.x1 + R, zs = P.ZR.filter((z) => z < L.cz).pop(), zb = P.ZR.find((z) => z > L.cz); if (zs == null || zb == null) return null;
  return { A: h[1] > 0 ? [xr, zs] : [xr, zb], B: h[1] > 0 ? [xr, zb] : [xr, zs], porta: [xr, L.cz] };
}
/* Rotina de cada veículo de empresa: entra na cidade, encosta no próprio portão para carregar e,
   conforme o segmento, passa em 1 ou 2 empresas clientes para descarregar (encosta do lado de fora,
   alguém leva a carga até o portão) e depois sai da cidade. Nunca faz meia-volta no meio da rua. */
const ENTREGAS_DO_SEGMENTO = { distribuicao: [1, 2], industria: [0, 1], tecnologia: [0, 1], varejo: [0, 0], saude: [0, 0] };
// Índice do trajeto mais perto de (x, z) a partir de i0 (para as paradas ficarem na ordem certa)
function indiceDepois(tr, x, z, i0) {
  let m = i0, d = 1e9;
  for (let i = i0; i < tr.n; i++) { const e = (tr.px[i] - x) ** 2 + (tr.pz[i] - z) ** 2; if (e < d) { d = e; m = i; } if (d < 0.36 && e > d + 4) break; }
  return m;
}
function rotaDaEmpresa(il, lista) {
  const P = PLANO, t = trechoDoPortao(il.lote); if (!t) return null;
  const E = P.entradas, ent = E[Math.floor(Math.random() * E.length)], sai = E.filter((e) => e !== ent)[Math.floor(Math.random() * (E.length - 1))];
  const [a, b] = ENTREGAS_DO_SEGMENTO[il.dados.cena] || [0, 0], quantas = a + Math.floor(Math.random() * (b - a + 1));
  const mesma = (p, q) => p[0] === q[0] && p[1] === q[1], usada = (tt, ar) => ar.some(([p, q]) => (mesma(p, tt.A) && mesma(q, tt.B)) || (mesma(p, tt.B) && mesma(q, tt.A)));
  const paradas = [{ il, t, tipo: 'carga' }], arestas = [[t.A, t.B]];
  (lista || []).filter((o) => o !== il && il_temLote(o)).sort(() => Math.random() - 0.5).forEach((o) => {
    if (paradas.length > quantas) return;
    const tt = trechoDoPortao(o.lote); if (!tt || usada(tt, arestas)) return;   // mesma avenida do portão anterior: pula (evita meia-volta)
    paradas.push({ il: o, t: tt, tipo: 'descarga' }); arestas.push([tt.A, tt.B]);
  });
  let nos = [ent.fora], atual = ent.no, antes = null;
  for (const p of paradas) {
    const c = caminhoEvitando(atual, p.t.A, [[p.t.A, p.t.B]].concat(antes ? [antes] : [])); if (!c) return null;
    nos = nos.concat(c, [p.t.B]); atual = p.t.B; antes = [p.t.A, p.t.B];
  }
  const fim = caminhoEvitando(atual, sai.no, [antes]); if (!fim) return null;
  nos = nos.concat(fim, [sai.fora]);
  const limpos = nos.filter((n, i) => i === 0 || n[0] !== nos[i - 1][0] || n[1] !== nos[i - 1][1]);
  const tr = trajeto(limpos, false);
  // Paradas: na faixa da direita, um pouco antes do portão (a traseira fica na frente da entrada)
  let i0 = 0; tr.paradas = [];
  paradas.forEach((p) => {
    const d = p.il.lote.dir, h = [-d[1], d[0]], r = [-h[1], h[0]];
    const i = indiceDepois(tr, p.t.porta[0] + r[0] * FAIXA - h[0] * 1.5, p.t.porta[1] + r[1] * FAIXA - h[1] * 1.5, i0);
    tr.paradas.push({ i, dur: 11, tipo: p.tipo, il: p.il.id }); i0 = i + 6;
  });
  return tr;
}

/* ---------- Monta o trânsito do mundo ---------- */
function montarTransito(lista) {
  const T = THREE, P = PLANO, Mod = modelosDeVeiculo();
  let X = CAMPO.transito;
  if (!X) {
    X = CAMPO.transito = { malhas: {}, veiculos: [] };
    const matBase = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.25, envMap: CAMPO.ambiente, envMapIntensity: 0.5 });
    const matCor = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.25, envMap: CAMPO.ambiente, envMapIntensity: 0.5 });
    Object.keys(Mod).forEach((k) => {
      const base = new T.InstancedMesh(Mod[k].geoBase, matBase, MAX_POR_TIPO); base.castShadow = true; base.frustumCulled = false; base.count = 0; base.instanceMatrix.setUsage(T.DynamicDrawUsage); CAMPO.cena.add(base);
      let cor = null;
      if (Mod[k].geoCor) { cor = new T.InstancedMesh(Mod[k].geoCor, matCor, MAX_POR_TIPO); cor.castShadow = true; cor.frustumCulled = false; cor.count = 0; cor.instanceMatrix.setUsage(T.DynamicDrawUsage); cor.setColorAt(0, new T.Color(0xffffff)); CAMPO.cena.add(cor); }
      X.malhas[k] = { base, cor };
    });
    // Mancha de farol no chão (à noite)
    X.farois = new T.InstancedMesh(G3.placaDeitada, new T.MeshBasicMaterial({ map: CAMPO.texBrilho, color: 0xfff0d0, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }), MAX_POR_TIPO * 7);
    X.farois.frustumCulled = false; X.farois.count = 0; CAMPO.cena.add(X.farois);
    X.tmp = { m: new T.Matrix4(), q: new T.Quaternion(), v: new T.Vector3(), s: new T.Vector3(1, 1, 1), y: new T.Vector3(0, 1, 0), c: new T.Color() };
    // Linhas fixas
    X.linha1 = trajeto([[-23.5, 29.5], [23.5, 29.5], [23.5, -17.5], [-23.5, -17.5]], true);
    X.rotaExec = trajeto([[23.5, 29.5], [-23.5, 29.5], [-23.5, 65.5], [23.5, 65.5]], true);
    X.linha1.paradas = P.estacoes.filter((e) => e.linha === 1).map((e) => ({ i: indiceMaisPerto(X.linha1, e.parada[0], e.parada[1]), dur: 5, estacao: e.id }));
    X.rotaExec.paradas = [[0, 28.25], [-24.75, 43.6], [24.75, 51.4]].map(([x, z]) => ({ i: indiceMaisPerto(X.rotaExec, x, z), dur: 6 }));
    X.linha1Exec = Object.assign({}, X.linha1, { paradas: [{ i: indiceMaisPerto(X.linha1, -24.75, -2), dur: 6 }] });
  }
  X.veiculos = [];
  const novo = (o) => { const v = Object.assign({ s: 0, v: 0, vmax: 2.4, espera: 0, ultimaParada: -1, cor: 0xffffff, ativo: true, rot: 0, k: X.veiculos.length }, o); v.rot = rotNaRota(v.tr, v.s); X.veiculos.push(v); return v; };
  [0, 1, 2].forEach((k) => novo({ tipo: 'capsula', tr: X.linha1, s: k / 3 * X.linha1.total, vmax: 2.3, linha: 1, ordem: k }));
  // Ônibus da Real Forte: 3 na linha das empresas, saindo da Estação Real Forte
  const rotaOnibus = rotaDosOnibus(lista), estOnibus = P.estacoes.filter((e) => e.linha === 3).concat((CAMPO.mundo && CAMPO.mundo.estacoesOnibus) || []);
  rotaOnibus.paradas = estOnibus.map((e) => ({ i: indiceMaisPerto(rotaOnibus, e.parada[0], e.parada[1]), dur: e.id === 'station' ? 12 : 6, estacao: e.id })).sort((a, b) => a.i - b.i);
  (X.onibus || []).forEach((g) => CAMPO.cena.remove(g)); X.onibus = [];
  [0, 1, 2].forEach((k) => { const g = corpoDaRealForte(X.extrasOnibus = X.extrasOnibus || []); X.onibus.push(g); novo({ tipo: 'onibus', grupo: g, tr: rotaOnibus, s: k / 3 * rotaOnibus.total, vmax: 2.6, linha: 3, ordem: k }); });
  novo({ tipo: 'executivo', tr: X.rotaExec, s: 0.3 * X.rotaExec.total, vmax: 2.6, ordem: 0 });
  novo({ tipo: 'executivo', tr: X.linha1Exec, s: 0.55 * X.linha1.total, vmax: 2.5, ordem: 1 });
  // Empresas: um veículo por empresa do segmento que tem; sai de tempos em tempos
  X.empresas = lista.map((il) => ({ il, tipo: VEICULO_DO_SEGMENTO[il.dados.cena], prox: 0, ativos: [], primeiro: true })).filter((e) => e.tipo && il_temLote(e.il));
  X.novo = novo; X.lista = lista;
  (X.corpos || []).forEach((g) => CAMPO.cena.remove(g)); (X.extrasCorpos || []).forEach((x) => x.dispose && x.dispose());
  X.corpos = []; X.extrasCorpos = [];
  X.empresas.forEach((e) => { e.corpos = Array.from({ length: MAX_DA_EMPRESA[e.il.dados.cena] || 1 }, () => corpoDaEmpresa(e.tipo, e.il, X.extrasCorpos)); X.corpos.push(...e.corpos); });
}
const il_temLote = (il) => !!(il.lote && il.lote.i !== 9);
function rotNaRota(tr, s) {
  const i = Math.max(0, Math.min(tr.n - 2, Math.floor(s / PASSO_ROTA)));
  return Math.atan2(-(tr.pz[i + 1] - tr.pz[i]), tr.px[i + 1] - tr.px[i]);
}
// A faixa de pedestre tem alguém atravessando? (vê de meio em meio segundo; vale para todos os veículos)
function faixaOcupada(f, M) {
  const X = CAMPO.transito; X.ocup = X.ocup || new Map();
  const c = X.ocup.get(f); const agora = CAMPO.t;
  if (c && agora - c.t < 0.3) return c.v;
  const [x0, x1, z0, z1] = PLANO.faixas[f]; let ocupada = false;
  if (M) for (let cx = Math.floor(x0 - 0.5); cx <= Math.floor(x1 + 0.5) && !ocupada; cx++) for (let cz = Math.floor(z0 - 0.5); cz <= Math.floor(z1 + 0.5) && !ocupada; cz++) {
    const l = M.hash.get(cx * 4096 + cz); if (l) ocupada = l.some((p) => p.visivel && p.x > x0 - 0.4 && p.x < x1 + 0.4 && p.z > z0 - 0.4 && p.z < z1 + 0.4);
  }
  X.ocup.set(f, { t: agora, v: ocupada });
  return ocupada;
}
// Gente esperando na estação embarca (até 4 por parada) e desce mais tarde em outra estação da mesma linha
function embarcar(idEstacao, linha) {
  const M = CAMPO.multidao; if (!M) return;
  const outras = (M.estacoes || []).filter((e) => e.id !== idEstacao && e.linha === linha);
  let n = 0;
  M.agentes.forEach((a) => {
    if (n >= 4 || a.estado !== 'atividade' || !a.tarefa || a.tarefa.tipo !== 'estacao' || a.estacaoId !== idEstacao) return;
    n++; soltarPonto(a); a.estado = 'sumido'; a.visivel = false; a.t = 8 + Math.random() * 14; a.tarefa = { tipo: 'viagem' };
    const d = outras[Math.floor(Math.random() * outras.length)]; a.desembarque = d ? { x: d.saida.x, z: d.saida.z } : null;
  });
}

/* ---------- Quadro a quadro do trânsito ---------- */
function passoTransito(t, dt) {
  const X = CAMPO.transito; if (!X || !X.veiculos) return;
  const A = CAMPO.atividade == null ? 1 : CAMPO.atividade, noite = noiteAgora(), M = CAMPO.multidao, ap = CAMPO.ap;
  // Veículos das empresas: sai um de tempos em tempos (de noite, só quem tem operação noturna)
  (X.empresas || []).forEach((e) => {
    e.ativos = e.ativos.filter((v) => X.veiculos.includes(v));
    const [dia, noturno] = INTERVALO_DO_SEGMENTO[e.il.dados.cena] || [0, 0], intervalo = A > 0.5 ? dia : noturno;
    if (!intervalo) return;
    e.prox -= dt; if (e.prox > 0) return;
    const livre = e.corpos.find((g) => !e.ativos.some((v) => v.grupo === g)); if (!livre) return;
    e.prox = intervalo * (0.8 + Math.random() * 0.5);
    const tr = rotaDaEmpresa(e.il, X.lista); if (!tr) return;
    // O primeiro já começa dentro da cidade, a caminho da empresa (para aparecer logo ao abrir)
    const s0 = e.primeiro ? Math.max(0, tr.paradas[0].i * PASSO_ROTA - 45) : 0; e.primeiro = false;
    e.ativos.push(X.novo({ tipo: e.tipo, grupo: livre, tr, s: s0, vmax: e.tipo === 'carreta' ? 2.1 : e.tipo === 'ambulancia' ? 3.0 : 2.5, cor: (e.il.cores && e.il.cores.destaque) || 0x2f5ea8, il: e.il.id, some: true }));
  });
  const tmp = X.tmp, n = {}; Object.keys(X.malhas).forEach((k) => { n[k] = 0; }); let nf = 0;
  const vivos = [];
  (X.corpos || []).concat(X.onibus || []).forEach((g) => { g.visible = false; });
  X.veiculos.forEach((v) => {
    const tr = v.tr;
    // Cápsula extra e carro executivo recolhem à noite (sempre parados numa parada, para não sumir no meio da rua)
    const deveRodar = v.tipo === 'onibus' ? (v.ordem < 2 || A > 0.5) : v.tipo === 'capsula' ? (v.ordem === 0 || A > 0.5) : v.tipo === 'executivo' ? (v.ordem === 0 ? A > 0.35 : A > 0.5) : true;
    if (!deveRodar && v.espera > 0) { v.recolhido = true; }
    if (deveRodar) v.recolhido = false;
    if (v.recolhido) { vivos.push(v); return; }
    // Para na parada
    if (v.espera > 0) { v.espera -= dt; v.v = 0; }
    else {
      const i = Math.min(tr.n - 1, Math.floor(v.s / PASSO_ROTA));
      let alvoV = v.vmax * tr.lim[i];
      // Próxima parada
      (tr.paradas || []).forEach((p, q) => {
        let d = (p.i - i) * PASSO_ROTA; if (tr.ciclica && d < 0) d += tr.total;
        if (d >= 0 && d < 7 && v.ultimaParada !== q) { alvoV = Math.min(alvoV, Math.max(0.35, d * 0.55)); if (d < 0.3) { v.espera = p.dur; v.ultimaParada = q; v.s = p.i * PASSO_ROTA; v.paradaAtual = p; if (p.estacao) embarcar(p.estacao, v.linha); } }
      });
      if (v.ultimaParada >= 0 && tr.paradas) { const p = tr.paradas[v.ultimaParada]; let d = (i - p.i) * PASSO_ROTA; if (tr.ciclica && d < 0) d += tr.total; if (d > 10) v.ultimaParada = -1; }
      // Faixa de pedestre ocupada logo à frente: espera
      for (let k = 1; k <= 8; k++) {
        const j = tr.ciclica ? (i + k) % tr.n : Math.min(tr.n - 1, i + k), f = tr.faixa[j];
        if (f >= 0 && tr.faixa[i] !== f && faixaOcupada(f, M)) { alvoV = Math.min(alvoV, Math.max(0, (k * PASSO_ROTA - 1.1) * 1.3)); break; }
      }
      // Carro da frente
      const fx = Math.cos(v.rot), fz = -Math.sin(v.rot), x = tr.px[i], z = tr.pz[i], L = modelosDeVeiculo()[v.tipo].len;
      X.veiculos.forEach((o) => {
        if (o === v || o.recolhido) return;
        const j = Math.min(o.tr.n - 1, Math.floor(o.s / PASSO_ROTA)), ox = o.tr.px[j] - x, oz = o.tr.pz[j] - z;
        const frente = ox * fx + oz * fz, lado = Math.abs(-ox * fz + oz * fx);
        if (frente > 0 && frente < 5.5 && lado < 1.0) { const folga = (L + modelosDeVeiculo()[o.tipo].len) / 2 + 0.7; alvoV = Math.min(alvoV, Math.max(0, (frente - folga) * 1.2)); }
      });
      v.v += (alvoV - v.v) * Math.min(1, dt * (alvoV < v.v ? 5 : 1.4));
      v.s += v.v * dt;
      if (v.s >= tr.total) { if (tr.ciclica) { v.s -= tr.total; v.ultimaParada = -1; } else if (v.some) return; else v.s = tr.total; }
    }
    vivos.push(v);
    // Desenho: posição e direção suavizada
    const i = Math.min(tr.n - 2, Math.floor(v.s / PASSO_ROTA)), u = (v.s - i * PASSO_ROTA) / PASSO_ROTA;
    const x = tr.px[i] + (tr.px[i + 1] - tr.px[i]) * u, z = tr.pz[i] + (tr.pz[i + 1] - tr.pz[i]) * u;
    const alvoRot = rotNaRota(tr, v.s + 1.0), dif = Math.atan2(Math.sin(alvoRot - v.rot), Math.cos(alvoRot - v.rot)); v.rot += dif * Math.min(1, dt * 6);
    if (ap && v.il && v.il !== ap.id) return;   // na apresentação, veículo de outra empresa não aparece
    tmp.q.setFromAxisAngle(tmp.y, v.rot);
    const y0 = z < -55.9 && z > -87 && Math.abs(x) < 21 ? 0.052 : 0.012;   // dentro do Terminal da Real Forte a pista fica na altura da calçada
    if (v.grupo) { v.grupo.visible = true; v.grupo.position.set(x, y0, z); v.grupo.quaternion.copy(tmp.q); if (v.grupo.userData.ajudante) passoAjudante(v, t); }
    const malha = X.malhas[v.tipo], idx = v.grupo ? MAX_POR_TIPO : n[v.tipo]++;
    if (idx < MAX_POR_TIPO) { tmp.m.compose(tmp.v.set(x, y0, z), tmp.q, tmp.s);
    malha.base.setMatrixAt(idx, tmp.m); if (malha.cor) { malha.cor.setMatrixAt(idx, tmp.m); malha.cor.setColorAt(idx, tmp.c.setHex(v.cor)); } }
    if (noite > 0.05 && nf < MAX_POR_TIPO * 7) { const L = modelosDeVeiculo()[v.tipo].len; tmp.m.compose(tmp.v.set(x + Math.cos(v.rot) * (L / 2 + 1.1), 0.03, z - Math.sin(v.rot) * (L / 2 + 1.1)), tmp.q, tmp.v.clone().set(2.4, 1, 1.5)); X.farois.setMatrixAt(nf++, tmp.m); }
  });
  X.veiculos = vivos;
  Object.keys(X.malhas).forEach((k) => { const m = X.malhas[k]; m.base.count = Math.min(MAX_POR_TIPO, n[k]); m.base.instanceMatrix.needsUpdate = true; if (m.cor) { m.cor.count = m.base.count; m.cor.instanceMatrix.needsUpdate = true; if (m.cor.instanceColor) m.cor.instanceColor.needsUpdate = true; } });
  X.farois.count = nf; X.farois.instanceMatrix.needsUpdate = true; X.farois.material.opacity = 0.42 * noite;
}

/* ---------- Rotinas pela cidade ----------
   Destinos de verdade fora das empresas: os centros da consultoria, as praças, a praça da sede e as
   estações das cápsulas (quem vai para a estação espera, embarca e desce em outra estação).
   Ninguém entra nos prédios: toda a movimentação é do lado de fora. */
// Copia os lugares da cidade fixa para este mundo (cada um ajustado para onde dá para pisar)
function prepararLugaresDaCidade(M) {
  const P = PLANO;
  const copiar = (l) => (l || []).map((p) => Object.assign({}, p, { ocupado: null, falhas: 0 })).filter((p) => ajustarPonto(p, 0));
  M.centros = {}; Object.keys(P.pontos).forEach((k) => { M.centros[k] = copiar(P.pontos[k]); });
  M.estacoes = P.estacoes.concat((CAMPO.mundo && CAMPO.mundo.estacoesOnibus) || []).map((e) => ({ id: e.id, linha: e.linha, il: e.il, saida: e.saida, espera: copiar(e.espera.map((p) => Object.assign({}, p, { dur: e.linha === 3 ? 90 : 45 }))).concat(e.id === 'central' ? M.centros.central || [] : e.id === 'terminal' ? M.centros.terminal || [] : e.id === 'station' ? (M.centros.stationBancos || []).concat(M.centros.station || []) : []) }));
  M.obras = (CAMPO.mundo && CAMPO.mundo.obras || []).map((o) => Object.assign({}, o, { pontos: copiar(o.pontos) }));
  M.centros.fachadas = copiar((CAMPO.mundo && CAMPO.mundo.pontosVisita) || []);   // calçada em frente ao portão de cada empresa
}
function irAoCentro(M, a, chave) {
  const p = livreDe((M.centros && M.centros[chave]) || [], a);
  return p ? irAte(M, a, p.x, p.z, { tipo: 'centro', lugar: p }) : null;
}
function sortearChave(pesos) { let r = Math.random() * pesos.reduce((s, [, w]) => s + w, 0); for (const [k, w] of pesos) { r -= w; if (r <= 0) return k; } return pesos[0][0]; }
/* Fase do dia (a mesma do relógio da praça) muda o que a cidade procura:
   manhã = operação (diagnóstico, estação, gente chegando); tarde = execução (estratégia, performance,
   apresentações, café); fim de tarde = retorno (estações). O peso de cada lugar é multiplicado aqui. */
const PESO_DA_FASE = {
  manha: { diag: 2, station: 1.6, estacao: 1.3, cafeIdeias: 1.2 },
  tarde: { estr: 1.8, perf: 1.8, apres: 1.6, cafeIdeias: 1.5, encontros: 1.4 },
  fim: { estacao: 2, station: 2, cafeIdeias: 0.6, encontros: 1.3 },
  noite: {}
};
const comFase = (pesos) => { const f = PESO_DA_FASE[faseDoDia().chave] || {}; return pesos.map(([k, w]) => [k, w * (f[k] || 1)]); };
// Micro encontro: prefere uma roda que já tem alguém (a dupla ou o trio se forma)
function irAoEncontro(M, a) {
  const L = (M.centros && M.centros.encontros) || []; if (!L.length) return null;
  const comGente = L.filter((p) => !p.ocupado && L.some((q) => q !== p && q.grupo === p.grupo && q.ocupado));
  const p = (comGente.length && Math.random() < 0.8 && livreDe(comGente, a)) || livreDe(L, a);
  return p ? irAte(M, a, p.x, p.z, { tipo: 'centro', lugar: p }) : null;
}
function irAPraca(M, a) {
  const k = sortearChave(comFase([['conexoes', 4], ['cafeIdeias', 4], ['encontros', 4], ['pracaEstr', 2], ['pracaInov', 2], ['sedeFora', 1]]));
  return k === 'encontros' ? irAoEncontro(M, a) : irAoCentro(M, a, k);
}
// Estação: a mais perto (quase sempre) ou outra qualquer
function irAEstacao(M, a, id) {
  const E = M.estacoes || []; if (!E.length) return null;
  if (id) { const st = E.find((e) => e.id === id), p = st && livreDe(st.espera, a); if (!p) return null; a.estacaoId = st.id; return irAte(M, a, p.x, p.z, { tipo: 'estacao', lugar: p }); }
  const perto = E.slice().sort((p, q) => Math.hypot(p.saida.x - a.x, p.saida.z - a.z) - Math.hypot(q.saida.x - a.x, q.saida.z - a.z));
  const st = Math.random() < 0.8 ? perto[0] : perto[Math.floor(Math.random() * perto.length)];
  const p = livreDe(st.espera, a); if (!p) return null;
  a.estacaoId = st.id;
  return irAte(M, a, p.x, p.z, { tipo: 'estacao', lugar: p });
}
// Funcionário da empresa saindo da quadra: a Praça das Conexões, o Centro de Diagnóstico, uma estação ou outra praça
function destinoFora(M, a) {
  const k = sortearChave(comFase([['praca', 4], ['diag', 2], ['estacao', 4], ['station', 2], ['apres', 1]]));   // o ônibus para no portão de cada empresa
  if (k === 'praca') return irAPraca(M, a);
  if (k === 'estacao') return irAEstacao(M, a);
  if (k === 'station') return irAEstacao(M, a, 'station');
  return irAoCentro(M, a, k);
}
// Equipe da Real Forte que trabalha nos centros e circula pela cidade
function tarefaEquipe(M, a) {
  const A = CAMPO.atividade == null ? 1 : CAMPO.atividade;
  if (a.limiar > A + 0.04) { const p = a.portaCasa; if (p) return irAte(M, a, p.x, p.z, { tipo: 'embora' }); }
  const k = sortearChave(comFase([['diag', 3], ['estr', 3], ['ia', 2], ['perf', 2], ['apres', 2], ['praca', 3], ['estacao', 2], ['hall', 2], ['sedeFora', 2], ['cafeIdeias', 3], ['station', 3], ['encontros', 3]]));
  const r = k === 'praca' ? irAPraca(M, a) : k === 'encontros' ? irAoEncontro(M, a) : k === 'estacao' ? irAEstacao(M, a) : k === 'station' ? irAEstacao(M, a, 'station') : k === 'hall' ? irAoHall(M, a) : irAoCentro(M, a, k);
  if (r) return r;
  a.estado = 'parado'; a.t = 2 + Math.random() * 3; return true;
}
// Obra: quem trabalha no canteiro (de dia) faz os serviços e anda pelo terreno
function tarefaObra(M, a) {
  const A = CAMPO.atividade == null ? 1 : CAMPO.atividade, o = (M.obras || [])[a.obra];
  if (!o) { a.estado = 'parado'; a.t = 5; return true; }
  if (a.limiar > A + 0.04) return irAte(M, a, o.entrada.x, o.entrada.z, { tipo: 'embora' });
  const p = Math.random() < 0.7 && livreDe(o.pontos, a);
  if (p) return irAte(M, a, p.x, p.z, { tipo: 'posto', lugar: p });
  const q = pontoAleatorio(o.area, a.dono); if (q) return irAte(M, a, q[0], q[1], { tipo: 'limpar', lugar: ponto(q[0], q[1], Math.random() * 6.28, Math.random() < 0.5 ? 'carregar' : 'agachar', { dur: 8 }) });
  a.estado = 'parado'; a.t = 3; return true;
}
// Gente da cidade: a equipe da Real Forte nos centros e quem trabalha nas obras
function gentDaCidade(M, sorte) {
  const cabelos = [0x1b1b1f, 0x3a2a1e, 0x5a3a22, 0xe8c66a, 'careca', 0x2a1e16];
  const central = (M.estacoes || []).find((e) => e.id === 'central'), casa = central ? central.saida : { x: -6.5, z: 35.5 };
  const lugares = [].concat(M.centros.conexoes || [], M.centros.sedeFora || [], M.centros.diag || [], M.centros.estr || []);
  for (let i = 0; i < 12; i++) {
    const a = novoAgente(M, { tipo: 'equipe', dono: 0, look: lookDe(uniformeRealForte(cabelos[i % cabelos.length], PELES[(i * 2 + 1) % PELES.length]), i % 3 === 0 ? { prancheta: true } : {}), sorte, limiar: 0.1 + sorte() * 0.75 });
    a.portaCasa = casa;   // chegam e vão embora pela Estação Central
    nascer(a, { x0: -18, x1: 18, z0: 38, z1: 60 }, lugares);
  }
  (M.obras || []).forEach((o, n) => {
    for (let i = 0; i < 3; i++) {
      const a = novoAgente(M, { tipo: 'obra', obra: n, dono: 0, look: lookDe({ roupa: 0xf07a22, detalhe: 0xf2d33a, calca: 0x2b3446, capacete: 0xf0b429, pele: PELES[(n + i * 2) % PELES.length] }), sorte, limiar: 0.2 + sorte() * 0.5 });
      a.portaCasa = o.entrada;
      nascer(a, o.area, o.pontos);
    }
  });
}

/* ---------- Visitantes e turistas ----------
   Gente de fora: chega pelo Terminal da Real Forte, consulta um totem, fotografa a torre, vai a um
   centro da consultoria ou até a frente de uma empresa, passa no café ou numa roda de conversa e volta
   para o terminal (ou pega o ônibus em outro ponto). Cada um tem um roteiro curto que se renova. */
ANIMS.foto = (t, f) => ({ pernaE: 0, pernaD: 0, bracoE: 2.15, bracoD: 2.2 + Math.sin(t * 3 + f) * 0.04, prop: 'tablet' });   // celular erguido
function novoRoteiro(a) {
  const meio = Math.random() < 0.55 ? 'centro' : 'empresa', r = ['totem', 'foto', meio];
  if (Math.random() < 0.6) r.push(Math.random() < 0.5 ? 'cafe' : 'encontro');
  if (Math.random() < 0.4) r.push(meio === 'centro' ? 'empresa' : 'centro');
  if (Math.random() < 0.5) r.push('foto');
  r.push(Math.random() < 0.6 ? 'terminal' : 'onibus');
  return r;
}
function tarefaVisitante(M, a) {
  const A = CAMPO.atividade == null ? 1 : CAMPO.atividade;
  if (a.limiar > A + 0.04) { const r = irAEstacao(M, a, 'station'); if (r) return r; const p = a.portaCasa; if (p) return irAte(M, a, p.x, p.z, { tipo: 'embora' }); }
  if (!a.roteiro || !a.roteiro.length) a.roteiro = novoRoteiro(a);
  for (let tent = 0; tent < 3 && a.roteiro.length; tent++) {
    const passo = a.roteiro.shift();
    const r = passo === 'totem' ? irAoCentro(M, a, 'totem')
      : passo === 'foto' ? irAoCentro(M, a, 'fotoTorre')
      : passo === 'centro' ? irAoCentro(M, a, sortearChave([['diag', 3], ['estr', 3], ['ia', 2], ['perf', 2], ['apres', 2]]))
      : passo === 'empresa' ? irAoCentro(M, a, 'fachadas')
      : passo === 'cafe' ? irAoCentro(M, a, 'cafeIdeias')
      : passo === 'encontro' ? irAoEncontro(M, a)
      : passo === 'terminal' ? irAEstacao(M, a, 'station')
      : passo === 'onibus' ? irAEstacao(M, a) : null;
    if (r) return r;
  }
  a.estado = 'parado'; a.t = 1.5 + Math.random() * 2; return true;
}
// Roupas de quem é de fora: terno, blazer, camisa clara; turistas com cores vivas
const LOOKS_VISITANTE = [
  { roupa: 0x3b4250, calca: 0x2a2f3a, detalhe: 0xf2f2f2 }, { roupa: 0xc9b79c, calca: 0x4a4038, detalhe: 0xffffff }, { roupa: 0xe9eef5, calca: 0x2b3446, detalhe: 0x8aa4c8 },
  { roupa: 0x6d2e46, calca: 0x2a2f3a, detalhe: 0xf2d0a7 }, { roupa: 0x2f8f83, calca: 0xd9cfbd, detalhe: 0xffffff }, { roupa: 0xf0a33a, calca: 0x3b5ba5, detalhe: 0xffffff },
  { roupa: 0xd94f5c, calca: 0xe9e2d4, detalhe: 0xffffff }, { roupa: 0x5b6cc9, calca: 0x2a2f3a, detalhe: 0xd9e3f7 }
];
function visitantesDaCidade(M, sorte) {
  const st = (M.estacoes || []).find((e) => e.id === 'station'), casa = st ? st.saida : { x: -2.8, z: -61.8 };
  const cabelos = [0x1b1b1f, 0x3a2a1e, 0x5a3a22, 0xe8c66a, 'careca', 0x8a5a3a, 0x2a1e16];
  const lugares = [].concat(M.centros.totem || [], M.centros.fotoTorre || [], M.centros.stationBancos || []);
  for (let i = 0; i < 16; i++) {
    const L = LOOKS_VISITANTE[i % LOOKS_VISITANTE.length];
    const a = novoAgente(M, { tipo: 'visitante', dono: 0, look: lookDe(Object.assign({ pele: PELES[(i * 3 + 2) % PELES.length], cabelo: cabelos[i % cabelos.length] }, L), i % 4 === 1 ? { prancheta: true } : {}), sorte, limiar: 0.12 + sorte() * 0.7 });
    a.portaCasa = casa;
    nascer(a, { x0: -12, x1: 12, z0: -64, z1: -57.8 }, lugares);
  }
}

/* ---------- Telas e outdoors da cidade ----------
   Outdoor aqui é infraestrutura urbana: telas instaladas nas fachadas (estilo Tóquio) e totens nos
   pontos certos, cada um com o jeito do lugar.
   - Real Forte: três vídeos (fachada do Centro de Diagnóstico, torre do Centro de Estratégia e o alto
     do pódio do Centro de Estratégia, virado para quem chega).
   - Elson's (quando a empresa estiver cadastrada com esse nome): os vídeos da Lança na entrada do
     centro de distribuição e em dois totens nas esquinas do lote.
   - Cada empresa ganha uma peça com a logo, no estilo do segmento: distribuição e indústria = robusto,
     saúde = limpo e acolhedor, tecnologia = fachada digital sutil, os outros = totem elegante.
   Os vídeos só tocam quando a câmera está perto (para não pesar) e não têm som. */
const VIDEOS_REAL_FORTE = [
  { src: '/_blob/36465c1251bf96a4c394b1912aab18a7', prop: 9 / 16 },   // A próxima jogada
  { src: '/_blob/c1ed5bba5e7864489f6291d3a5aeeb7d', prop: 9 / 16 },   // O sintoma e a causa
  { src: '/_blob/897429940e5ec377d335268f79b6a42d', prop: 16 / 9 }    // sala vazia (horizontal)
];
const VIDEOS_ELSONS = [
  { src: '/_blob/0acbb586225e462631a32a21e1b4ec5f', prop: 16 / 9 },   // Lança Fit (granola)
  { src: '/_blob/60278c0347031614716c482a19c6ffbf', prop: 9 / 16 },   // Lança (uva)
  { src: '/_blob/b5a7f79779a9ba294c921ac7bc726133', prop: 9 / 16 }    // Lança (suco e granola)
];
const ehElsons = (il) => /elson/i.test((il && il.dados && il.dados.nome) || '');
const ESTILO_DO_OUTDOOR = { distribuicao: 'robusto', industria: 'robusto', construcao: 'robusto', saude: 'acolhedor', tecnologia: 'digital', servicos: 'totem', varejo: 'totem', agro: 'totem' };

// Tela com vídeo: começa com a capa e troca para o vídeo quando ele começa a tocar
function telaDeVideo(pai, video, w, h, capa, lista) {
  const T = THREE, m = new T.MeshBasicMaterial({ map: capa, toneMapped: false });
  const tela = new T.Mesh(G3.placa, m); tela.scale.set(w, h, 1); pai.add(tela);
  const v = document.createElement('video'); v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'metadata';
  v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
  const item = { tela, m, v, capa, tex: null, tocando: false, doMundo: !!lista };
  v.addEventListener('playing', () => { if (!item.tex) { item.tex = new T.VideoTexture(v); item.tex.encoding = T.sRGBEncoding; } m.map = item.tex; m.needsUpdate = true; });
  v.addEventListener('error', () => { item.erro = true; m.map = capa; m.needsUpdate = true; });
  v.src = video.src;
  (CAMPO.telasVideo = CAMPO.telasVideo || []).push(item); if (lista) lista.push(item);
  return item;
}
// Tocar só o que está perto da câmera e visível (o resto fica pausado na última imagem)
function passoTelas() {
  const agora = performance.now(); if (agora < (CAMPO.proxTelas || 0)) return; CAMPO.proxTelas = agora + 500;
  const cam = CAMPO.camera.position, p = new THREE.Vector3();
  const visivel = (o) => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
  (CAMPO.telasVideo || []).forEach((it) => {
    if (it.erro) return;
    it.tela.getWorldPosition(p);
    const quer = !movimentoReduzido() && visivel(it.tela) && p.distanceTo(cam) < 120;
    if (quer && !it.tocando) { it.tocando = true; const r = it.v.play(); if (r && r.catch) r.catch(() => { it.tocando = false; }); }
    else if (!quer && it.tocando) { it.tocando = false; it.v.pause(); }
  });
}
// Faixa de luz das empresas de tecnologia: sobe e desce devagar na lâmina
function passoOutdoors(t) {
  passoTelas(); passoRelogio(); passoTeloesAnimados(t);
  const W = CAMPO.mundo; if (!W || !W.faixasDigitais) return;
  W.faixasDigitais.forEach((f, i) => { f.position.y = 1.1 + Math.sin(t * 0.6 + i) * 0.4; });
}
// Moldura de tela de fachada: caixa grafite atrás, filetes de luz em cima e embaixo
function molduraDeFachada(g, w, h, cor) {
  const graf = mat(0x161a21, { roughness: 0.35, metalness: 0.55 }), luz = luzMat(cor || COR3D.laranja, 1.4), ciano = luzMat(0x38d6f5, 1.3);
  caixa(g, w + 0.3, h + 0.3, 0.16, graf, 0, -h / 2 - 0.15, -0.1);
  [h / 2 + 0.15, -h / 2 - 0.21].forEach((y) => { caixa(g, w + 0.34, 0.05, 0.2, luz, 0, y, -0.1).castShadow = false; });
  // cantoneiras ciano nos quatro cantos (cara de tela de LED)
  [-1, 1].forEach((sx) => [-1, 1].forEach((sy) => {
    const x = sx * (w / 2 + 0.17), y = sy * (h / 2 + 0.17);
    caixa(g, 0.6, 0.05, 0.05, ciano, x - sx * 0.3, y - 0.025, 0.0).castShadow = false;
    caixa(g, 0.05, 0.6, 0.05, ciano, x, sy > 0 ? y - 0.6 : y, 0.0).castShadow = false;
  }));
}
function capaDaRealForte() { return CAMPO.capaRF || (CAMPO.capaRF = texturaTexto(['REAL FORTE', 'Consultoria · desde 1982'], '#0f2342', '#ffffff', 512, 300)); }

/* Telas fixas da Real Forte (montadas uma vez, junto com a cidade) */
function montarTelasDaCidade() {
  const T = THREE, g = CAMPO.planoGrupo, capa = capaDaRealForte();
  const instalar = (video, w, x, y, z, giro) => {
    const h = w / video.prop, grupo = new T.Group(); grupo.position.set(x, y, z); grupo.rotation.y = giro; g.add(grupo);
    molduraDeFachada(grupo, w, h); telaDeVideo(grupo, video, w, h, capa);
    return grupo;
  };
  instalar(VIDEOS_REAL_FORTE[0], 3.0, 37.6, 5.1, 42.0, -Math.PI / 2);   // fachada do Centro de Diagnóstico, virada para a sede
  instalar(VIDEOS_REAL_FORTE[1], 4.4, -38.62, 12.2, 6, Math.PI / 2);     // torre do Centro de Estratégia, virada para a sede
  const h3 = 8.0 / VIDEOS_REAL_FORTE[2].prop, p = instalar(VIDEOS_REAL_FORTE[2], 8.0, -44, 3.24 + 0.6 + h3 / 2, 16.5, 0);   // no alto do pódio, virada para a avenida
  [-3.2, 3.2].forEach((x) => caixa(p, 0.16, 0.5, 0.16, 0x161a21, x, -h3 / 2 - 0.6, -0.12));   // pés apoiados no pódio
}

/* Peças de cada empresa (refeitas a cada mundo): no gramado da frente, ao lado do portão */
function outdoorsDasEmpresas(lista, W, daIlha) {
  const T = THREE;
  // Telas do mundo anterior: para o vídeo e libera a memória
  CAMPO.telasVideo = (CAMPO.telasVideo || []).filter((it) => {
    if (!it.doMundo) return true;
    try { it.v.pause(); it.v.removeAttribute('src'); it.v.load(); } catch (e) { /* nada */ }
    if (it.tex) it.tex.dispose(); it.m.dispose(); return false;
  });
  lista.filter((il) => il.lote && il.lote.i !== 9).forEach((il) => {
    il.grupo.updateMatrixWorld(true);
    const m = il.grupo.matrixWorld, grupo = new T.Group(); grupo.applyMatrix4(m); grupo.position.y = PLANO.ALT; W.grupo.add(grupo); daIlha(il.id, grupo);
    const bloquear = (x0, x1, z0, z1) => navBloquear(m, x0, x1, z0, z1);
    const tex = texturaPlaca(il.dados, 3.6, 2.0); W.extras.push(tex);
    const mLogo = new T.MeshBasicMaterial({ map: tex, toneMapped: false }); W.extras.push(mLogo);
    const cor = (il.cores && il.cores.destaque) || COR3D.laranja, X = 9.0, Z = CID_Z + 1.9;   // à direita do portão, depois do painel de acompanhamento
    const elsons = ehElsons(il), estilo = elsons ? 'robusto' : ESTILO_DO_OUTDOOR[il.dados.cena] || 'totem';
    // Monumento da empresa na esquina da frente (direita): logo, nome e o segmento, com jardim
    { const mm = new T.Group(); mm.position.set(9.4, 0, CID_Z + 1.35); grupo.add(mm);
      const graf = mat(0x23282f, { roughness: 0.4, metalness: 0.5 });
      caixa(mm, 4.6, 1.15, 0.5, graf, 0, 0, 0); caixa(mm, 4.6, 0.05, 0.52, luzMat(cor, 1.3), 0, 1.15, 0).castShadow = false;
      const pl = new T.Mesh(G3.placa, mLogo); pl.scale.set(1.7, 0.95, 1); pl.position.set(-1.25, 0.6, 0.255); mm.add(pl);
      const tx = texturaTexto([String(il.dados.nome || '').toUpperCase().slice(0, 22), (SEGMENTO_DO_TELAO[il.dados.cena] || '').toUpperCase()], '#23282f', '#ffffff', 640, 220); W.extras.push(tx);
      const mt = new T.MeshBasicMaterial({ map: tx, toneMapped: false }); W.extras.push(mt);
      const pt2 = new T.Mesh(G3.placa, mt); pt2.scale.set(2.5, 0.86, 1); pt2.position.set(0.95, 0.6, 0.255); mm.add(pt2);
      const flor = [mat(0x9b6bd6, { roughness: 0.8 }), mat(0xe887b5, { roughness: 0.8 }), mat(0xf2d33a, { roughness: 0.8 }), mat(0x4f9a5e, { roughness: 0.85 })];
      caixa(mm, 5.6, 0.25, 0.7, mat(0x3f7a4c, { roughness: 0.9 }), 0, 0, 0.62);
      for (let k = 0; k < 12; k++) { const b = new T.Mesh(G3.bola, flor[k % 4]); b.scale.set(0.2, 0.16, 0.2); b.position.set(-2.6 + k * 0.47, 0.32, 0.62 + (k % 2 ? 0.12 : -0.12)); mm.add(b); }
      bloquear(9.4 - 2.9, 9.4 + 2.9, CID_Z + 1.0, CID_Z + 2.1); }
    // Telão da fachada do prédio principal: vídeo (Elson's) ou logo animada; feito uma vez por empresa
    telaoDoCampus(il, tex, W, elsons);
    // Calçada em frente ao portão: onde o visitante para para olhar (ou fotografar) a empresa
    [[1.8, 'foto'], [3.2, 'olhar']].forEach(([x, anim]) => {
      const p0 = new T.Vector3(x, 0, CID_Z + 3.1).applyMatrix4(m), p1 = new T.Vector3(x, 0, CID_Z + 2.1).applyMatrix4(m);
      (W.pontosVisita = W.pontosVisita || []).push(ponto(p0.x, p0.z, rotDe(p1.x - p0.x, p1.z - p0.z), anim, { dur: 8 }));
    });
    // O resto do lote: totem de direção, monumento, estacionamento e lounge dos funcionários
    campusDaEmpresa(il, grupo, bloquear, cor, W, elsons);
  });
  carrosEstacionados(W);
}

/* Telão do campus: a moldura está no prédio principal (montada com a cidade da empresa); aqui entra a
   imagem. Na Elson's: o vídeo da Lança Fit no telão, e os dois verticais da Lança no prédio
   administrativo (de frente para o pátio) e na ponta do prédio principal. */
function telaoDoCampus(il, texLogo, W, elsons) {
  const T = THREE, Tc = il.telaoCampus; if (!Tc) return;
  if (!Tc.feito) {
    Tc.feito = true;
    if (elsons) {
      telaDeVideo(Tc.grupo, VIDEOS_ELSONS[0], Tc.w, Tc.h, texLogo, null);
      (il.campusVerticais || []).slice(0, 2).map((v, k) => [VIDEOS_ELSONS[k + 1]].concat(v)).forEach(([vid, x, z, giro]) => {
        const w = 1.3, h = w / vid.prop, gg = new T.Group(); gg.position.set(x, 0.45 + h / 2, z); gg.rotation.y = giro; il.grupoCena.add(gg);
        molduraDeFachada(gg, w, h, il.cores.destaque); telaDeVideo(gg, vid, w, h, texLogo, null);
      });
    } else {
      const c = document.createElement('canvas'); c.width = 1024; c.height = 576;
      const texA = new T.CanvasTexture(c); texA.encoding = T.sRGBEncoding; il.descartar.push(texA);
      const mA = new T.MeshBasicMaterial({ map: texA, toneMapped: false }); il.descartar.push(mA);
      const tela = new T.Mesh(G3.placa, mA); tela.scale.set(Tc.w, Tc.h, 1); Tc.grupo.add(tela);
      Tc.item = { tela, c, tex: texA, il, logo: texLogo, prox: 0 };
    }
    molduraDeFachada(Tc.grupo, Tc.w, Tc.h, il.cores.destaque);
  }
  if (Tc.item) { Tc.item.logo = texLogo; (W.telasAnimadas = W.telasAnimadas || []).push(Tc.item); desenharTelaoAnimado(Tc.item, 0); }
}

/* ---------- Prédio de mídia de cada empresa ----------
   Um prédio estreito de vidro escuro no fundo do lote (atrás da cidade da empresa), com um telão de LED
   grande na frente, filetes de luz nas quinas e a logo no alto: chama a atenção de longe, sem ocupar a
   rua. Na Elson's o telão passa os vídeos da Lança (e mais duas telas verticais nas laterais); nas
   outras empresas, a logo animada com o nome e o segmento. */
const SEGMENTO_DO_TELAO = { distribuicao: 'Distribuição e logística', industria: 'Indústria', saude: 'Saúde', tecnologia: 'Tecnologia', servicos: 'Serviços', varejo: 'Varejo', agro: 'Agronegócio', construcao: 'Construção' };
function predioDeMidia(il, grupo, bloquear, texLogo, cor, W, elsons) {
  const T = THREE, Z = -13.2, LARG = 11.0, ALT = 10.2, TW = 9.6, TH = TW * 9 / 16, TY = 4.0;
  const p = new T.Group(); p.position.set(0, 0, Z); grupo.add(p);
  const vidro = CAMPO.vidroMidia || (CAMPO.vidroMidia = vidroComJanelas(8, 10, 0x0f141c, '#9fd8ff', 0.25, 0.6));   // um só material para todos os prédios de mídia
  peca(p, G3.caixa, vidro, LARG, ALT, 1.4, 0, 0, 0).castShadow = true;
  caixa(p, LARG + 0.2, 0.25, 1.6, mat(0x161a21, { roughness: 0.35, metalness: 0.55 }), 0, ALT, 0);
  caixa(p, LARG + 0.24, 0.06, 1.64, luzMat(cor, 1.4), 0, ALT + 0.25, 0).castShadow = false;
  [-LARG / 2, LARG / 2].forEach((x) => caixa(p, 0.07, ALT, 0.07, luzMat(0x38d6f5, 1.3), x, 0, 0.71).castShadow = false);   // quinas acesas
  caixa(p, LARG - 0.6, 3.0, 0.08, luzMat(0xffd9a8, 0.35), 0, 0.2, 0.71).castShadow = false;   // térreo iluminado (recepção)
  // Logo no alto (dos dois lados)
  const mLogo = new T.MeshBasicMaterial({ map: texLogo, toneMapped: false }); W.extras.push(mLogo);
  caixa(p, 4.4, 1.4, 0.3, mat(0x161a21, { roughness: 0.35, metalness: 0.55 }), 0, ALT + 0.25, 0);
  [1, -1].forEach((sd) => { const pl = new T.Mesh(G3.placa, mLogo); pl.scale.set(4.1, 1.15, 1); pl.position.set(0, ALT + 0.95, sd * 0.16); if (sd < 0) pl.rotation.y = Math.PI; p.add(pl); });
  // Telão da frente
  const tv = new T.Group(); tv.position.set(0, TY + TH / 2, 0.86); p.add(tv); molduraDeFachada(tv, TW, TH, cor);
  [-TW / 2 - 0.2, TW / 2 + 0.2].forEach((x) => caixa(tv, 0.05, TH + 0.3, 0.2, luzMat(0x38d6f5, 1.2), x, -TH / 2 - 0.15, -0.1).castShadow = false);
  // Atrás (virado para a outra avenida): uma tela menor com o mesmo conteúdo
  const tvAtras = new T.Group(); tvAtras.position.set(0, TY + 1.2 + TH * 0.35, -0.86); tvAtras.rotation.y = Math.PI; p.add(tvAtras); molduraDeFachada(tvAtras, TW * 0.7, TH * 0.7, cor);
  const atras = (m) => { const pl = new T.Mesh(G3.placa, m); pl.scale.set(TW * 0.7, TH * 0.7, 1); tvAtras.add(pl); };
  if (elsons) {
    atras(telaDeVideo(tv, VIDEOS_ELSONS[0], TW, TH, texLogo, W.telas = W.telas || []).m);
    // Duas torres finas nas laterais com as telas verticais da Lança
    [[-LARG / 2 - 1.1, VIDEOS_ELSONS[1]], [LARG / 2 + 1.1, VIDEOS_ELSONS[2]]].forEach(([x, vid]) => {
      caixa(p, 2.0, 8.8, 1.2, mat(0x161a21, { roughness: 0.35, metalness: 0.55 }), x, 0, 0);
      caixa(p, 2.04, 0.06, 1.24, luzMat(cor, 1.4), x, 8.8, 0).castShadow = false;
      const w = 1.7, h = w / vid.prop, t = new T.Group(); t.position.set(x, 8.2 - h / 2, 0.66); p.add(t); molduraDeFachada(t, w, h, cor);
      telaDeVideo(t, vid, w, h, texLogo, W.telas);
    });
    bloquear(-LARG / 2 - 2.2, LARG / 2 + 2.2, Z - 0.8, Z + 0.9);
  } else {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 576;
    const texA = new T.CanvasTexture(c); texA.encoding = T.sRGBEncoding; W.extras.push(texA);
    const mA = new T.MeshBasicMaterial({ map: texA, toneMapped: false }); W.extras.push(mA);
    const tela = new T.Mesh(G3.placa, mA); tela.scale.set(TW, TH, 1); tv.add(tela); atras(mA);
    const item = { tela, c, tex: texA, il, logo: texLogo, prox: 0 };
    (W.telasAnimadas = W.telasAnimadas || []).push(item); desenharTelaoAnimado(item, 0);
    bloquear(-LARG / 2 - 0.1, LARG / 2 + 0.1, Z - 0.8, Z + 0.9);
  }
}
// Telão animado (empresas sem vídeo): fundo na cor da empresa, faixas de luz passando, logo, nome e segmento
function desenharTelaoAnimado(it, t) {
  const g = it.c.getContext('2d'), W = 1024, H = 576, D = it.il.dados, cores = it.il.cores || CORES_PADRAO;
  const escuro = corCss(cores.escuro), dest = corCss(cores.destaque);
  const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, escuro); gr.addColorStop(1, '#05080f'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // faixas de luz diagonais andando
  g.save(); g.globalAlpha = 0.18; g.fillStyle = dest;
  for (let k = 0; k < 5; k++) { const x = ((t * 140 + k * 260) % (W + 400)) - 300; g.beginPath(); g.moveTo(x, H); g.lineTo(x + 90, H); g.lineTo(x + 300, 0); g.lineTo(x + 210, 0); g.fill(); }
  g.restore();
  // grade fina (cara de painel de LED)
  g.fillStyle = 'rgba(255,255,255,.035)'; for (let x = 0; x < W; x += 8) g.fillRect(x, 0, 1, H); for (let y = 0; y < H; y += 8) g.fillRect(0, y, W, 1);
  // cartão com a logo
  const img = it.logo && it.logo.image; const pulso = 1 + Math.sin(t * 1.6) * 0.015;
  if (img && img.width) { const cw = 420 * pulso, ch = cw * img.height / img.width; g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(70 + 8, H / 2 - ch / 2 - 40 + 8, cw, ch); g.drawImage(img, 70, H / 2 - ch / 2 - 40, cw, ch); }
  g.textAlign = 'left'; g.fillStyle = '#ffffff'; let f = 64; const nome = String(D.nome || '').toUpperCase(); g.font = `800 ${f}px Arial, sans-serif`;
  while (g.measureText(nome).width > 440 && f > 30) { f -= 4; g.font = `800 ${f}px Arial, sans-serif`; }
  g.fillText(nome, 530, 230);
  g.fillStyle = dest; g.fillRect(530, 258, 120, 6);
  g.fillStyle = '#d6deea'; g.font = '400 34px Arial, sans-serif'; g.fillText(SEGMENTO_DO_TELAO[D.cena] || '', 530, 312);
  // rodapé que corre
  g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, H - 64, W, 64); g.fillStyle = dest; g.fillRect(0, H - 64, W, 4);
  g.fillStyle = '#ffffff'; g.font = '500 28px Arial, sans-serif'; const txt = (D.nome || '') + '   ·   acompanhada pela Real Forte Consultoria   ·   ';
  const tw = g.measureText(txt).width, x0 = -((t * 90) % tw); for (let x = x0; x < W; x += tw) g.fillText(txt, x, H - 22);
  it.tex.needsUpdate = true;
}
function passoTeloesAnimados(t) {
  const W = CAMPO.mundo; if (!W || !W.telasAnimadas) return;
  const cam = CAMPO.camera.position, p = new THREE.Vector3(), agora = performance.now();
  const visivel = (o) => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
  W.telasAnimadas.forEach((it) => {
    if (agora < it.prox) return; it.prox = agora + (movimentoReduzido() ? 2000 : 90);
    it.tela.getWorldPosition(p); if (p.distanceTo(cam) > 150 || !visivel(it.tela)) return;
    desenharTelaoAnimado(it, agora / 1000);
  });
}

/* ---------- O lote inteiro de cada empresa ----------
   Além da cidade da empresa (os setores), o lote ganha o que um distrito empresarial de verdade tem:
   totem de direção no portão (com os destinos do segmento), monumento "Real Forte · Distrito
   Empresarial" na esquina, estacionamento com carros no fundo à esquerda e um lounge com tendas no
   fundo à direita (onde os funcionários tomam café). Tudo no sistema do lote: portão em +z. */
const DESTINOS_DO_SEGMENTO = {
  distribuicao: ['Recebimento', 'Expedição', 'Administrativo', 'Visitantes'], industria: ['Recepção', 'Produção', 'Expedição', 'Administrativo'],
  saude: ['Recepção', 'Exames', 'Pronto-socorro', 'Estacionamento'], tecnologia: ['Recepção', 'Inovação', 'Coworking', 'Auditório'],
  varejo: ['Loja', 'Carga e descarga', 'Administrativo', 'Estacionamento'], servicos: ['Recepção', 'Atendimento', 'Salas', 'Estacionamento'],
  agro: ['Recepção', 'Armazém', 'Campo', 'Administrativo'], construcao: ['Showroom', 'Obra', 'Administrativo', 'Visitantes']
};
function campusDaEmpresa(il, grupo, bloquear, cor, W, elsons) {
  const T = THREE, D = il.dados, cores = il.cores || CORES_PADRAO, graf = mat(0x161a21, { roughness: 0.35, metalness: 0.55 }), luz = luzMat(cor, 1.3);
  // Totem de direção ao lado do portão
  { const c = document.createElement('canvas'); c.width = 256; c.height = 600; const q = c.getContext('2d');
    q.fillStyle = '#141a24'; q.fillRect(0, 0, 256, 600); q.fillStyle = corCss(cores.destaque); q.fillRect(0, 0, 256, 8);
    q.fillStyle = '#ffffff'; q.textAlign = 'center'; q.font = '800 30px Arial, sans-serif';
    String(D.nome || '').toUpperCase().split(' ').slice(0, 3).forEach((p, i) => q.fillText(p.slice(0, 14), 128, 64 + i * 34));
    (DESTINOS_DO_SEGMENTO[D.cena] || ['Recepção', 'Administrativo', 'Visitantes']).forEach((t, i) => { const y = 230 + i * 64; q.fillStyle = 'rgba(255,255,255,.08)'; q.fillRect(16, y - 32, 224, 48); q.textAlign = 'left'; q.fillStyle = '#ffffff'; q.font = '500 23px Arial, sans-serif'; q.fillText(t, 28, y); q.textAlign = 'right'; q.fillStyle = '#ffb27a'; q.fillText('→', 228, y); });
    q.fillStyle = corCss(cores.destaque); q.fillRect(16, 520, 224, 4); q.fillStyle = '#9fb3d1'; q.textAlign = 'center'; q.font = '500 18px Arial, sans-serif'; q.fillText('REAL FORTE · DISTRITO', 128, 556);
    const tx = new T.CanvasTexture(c); tx.encoding = T.sRGBEncoding; tx.anisotropy = 8; W.extras.push(tx);
    const t = new T.Group(); t.position.set(-2.6, 0, CID_Z + 1.45); grupo.add(t);
    caixa(t, 0.9, 2.3, 0.24, graf, 0, 0, 0); caixa(t, 0.05, 2.1, 0.26, luz, 0.43, 0.1, 0).castShadow = false;
    const pl = new T.Mesh(G3.placa, new T.MeshBasicMaterial({ map: tx, toneMapped: false })); pl.scale.set(0.8, 1.88, 1); pl.position.set(0, 1.2, 0.125); t.add(pl);
    bloquear(-3.1, -2.1, CID_Z + 1.25, CID_Z + 1.65); }
  // Monumento na esquina da frente
  { const tx = CAMPO.texMonumento || (CAMPO.texMonumento = texturaTexto(['REAL FORTE CONSULTORIA', 'DISTRITO EMPRESARIAL'], '#1b212b', '#ffffff', 768, 180));
    const m = new T.Group(); m.position.set(-10.7, 0, CID_Z + 1.4); grupo.add(m);
    caixa(m, 3.4, 0.95, 0.42, graf, 0, 0, 0); caixa(m, 3.4, 0.04, 0.44, luz, 0, 0.1, 0).castShadow = false;
    const pl = new T.Mesh(G3.placa, new T.MeshBasicMaterial({ map: tx, toneMapped: false })); pl.scale.set(3.2, 0.75, 1); pl.position.set(0, 0.52, 0.215); m.add(pl);
    const flor = [mat(0x9b6bd6, { roughness: 0.8 }), mat(0xe887b5, { roughness: 0.8 }), mat(0xf2d33a, { roughness: 0.8 })];
    [-2.25, 2.25].forEach((x) => { caixa(m, 0.9, 0.3, 0.6, mat(0x3f7a4c, { roughness: 0.9 }), x, 0, 0); for (let k = 0; k < 4; k++) { const b = new T.Mesh(G3.bola, flor[k % 3]); b.scale.set(0.13, 0.11, 0.13); b.position.set(x - 0.3 + k * 0.2, 0.35, (k % 2 ? 0.12 : -0.12)); m.add(b); } });
    bloquear(-13.2, -8.2, CID_Z + 1.1, CID_Z + 1.7); }
  // Estacionamento (fundo, à esquerda): asfalto, vagas e carros
  { const X0 = -13.5, X1 = 3.6, Z0 = -15.2, Z1 = -10.5;
    caixa(grupo, X1 - X0, 0.012, Z1 - Z0, mat(0x4a515d, { roughness: 0.9 }), (X0 + X1) / 2, 0.0, (Z0 + Z1) / 2).castShadow = false;
    const branco = mat(0xf4f6f9, { roughness: 0.6 }), sorte = sorteio('estac' + il.id);
    for (let x = X0 + 0.15; x <= X1 - 0.1; x += 0.95) [Z0 + 0.1, Z1 - 1.8].forEach((z) => caixa(grupo, 0.04, 0.004, 1.7, branco, x, 0.012, z + 0.85).castShadow = false);
    grupo.updateMatrixWorld(true);
    for (let x = X0 + 0.15 + 0.475; x < X1 - 0.3; x += 0.95) [[Z0 + 0.95, 1], [Z1 - 0.95, -1]].forEach(([z, fz]) => {
      if (sorte() < 0.25) return;
      const p = new T.Vector3(x, 0.012, z); grupo.localToWorld(p);
      (W.carros = W.carros || []).push({ x: p.x, y: p.y, z: p.z, rot: grupo.rotation.y + (fz > 0 ? -Math.PI / 2 : Math.PI / 2), cor: [0xf2f3f5, 0x1c1f26, 0x9aa3ad, 0x5a6b82, 0x8c1d26, 0xc9ced6, 0x2f4d6e][Math.floor(sorte() * 7)] });
    });
    [X0 + 0.3, X1 - 0.3].forEach((x) => { caixa(grupo, 0.08, 2.6, 0.08, mat(0x1d2840, { roughness: 0.5 }), x, 0, Z1 + 0.15); caixa(grupo, 0.36, 0.06, 0.2, luzMat(0xffe9c4, 0.9), x + (x < 0 ? 0.14 : -0.14), 2.6, Z1 + 0.15).castShadow = false; });
    // Cobertura com painéis solares sobre as duas fileiras de vagas
    const solar = new T.MeshStandardMaterial({ color: 0x1c2f52, roughness: 0.25, metalness: 0.6, envMap: CAMPO.ambiente, envMapIntensity: 0.9 }); W.extras.push(solar);
    [Z0 + 0.95, Z1 - 0.95].forEach((z, n) => {
      const pn = new T.Mesh(G3.caixaC, solar); pn.scale.set(X1 - X0 - 0.6, 0.06, 2.0); pn.position.set((X0 + X1) / 2, 2.05, z); pn.rotation.x = n ? -0.12 : 0.12; pn.castShadow = true; grupo.add(pn);
      for (let x = X0 + 1.2; x < X1; x += 4.0) caixa(grupo, 0.1, 2.0, 0.1, mat(0x9aa2ad, { roughness: 0.4, metalness: 0.6 }), x, 0, z + (n ? -0.7 : 0.7));
    });
    bloquear(X0, X1, Z0, Z1); }
  // Lounge dos funcionários (fundo, à direita): deck, mesas com banquinhos, tendas e floreiras
  { const X0 = 5.4, X1 = 13.5, Z0 = -15.2, Z1 = -10.5, madeira = mat(0x9a6a42, { roughness: 0.8 }), branco = mat(0xf4f6f9, { roughness: 0.5 });
    caixa(grupo, X1 - X0, 0.03, Z1 - Z0, madeira, (X0 + X1) / 2, 0, (Z0 + Z1) / 2).castShadow = false;
    const mesas = [[X0 + (X1 - X0) * 0.3, -12.85], [X0 + (X1 - X0) * 0.72, -12.85]];
    const novos = [];
    mesas.forEach(([x, z]) => {
      const mm = new T.Mesh(G3.cil, branco); mm.scale.set(0.45, 0.6, 0.45); mm.position.set(x, 0, z); mm.castShadow = true; grupo.add(mm); bloquear(x - 0.45, x + 0.45, z - 0.45, z + 0.45);
      [0, 2.1, 4.2].forEach((a) => { const px = x + Math.cos(a) * 0.85, pz = z + Math.sin(a) * 0.85; const b = new T.Mesh(G3.cil, madeira); b.scale.set(0.13, 0.4, 0.13); b.position.set(px, 0, pz); grupo.add(b); novos.push(ponto(px, pz, Math.atan2(-(z - pz), x - px), 'cafe', { dur: 16 })); });
      // tenda (vela triangular) em cima de cada mesa
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute([-1.3, 2.3, -1.0, 1.4, 2.0, -0.8, 0.0, 2.45, 1.3], 3)); geo.computeVertexNormals(); W.extras.push(geo);
      const vela = new T.Mesh(geo, new T.MeshStandardMaterial({ color: 0xf7f4ee, roughness: 0.8, side: T.DoubleSide })); vela.position.set(x, 0, z); vela.castShadow = true; grupo.add(vela);
      [[-1.3, -1.0, 2.3], [1.4, -0.8, 2.0], [0.0, 1.3, 2.45]].forEach(([dx, dz, h]) => { const pp = new T.Mesh(G3.cil, graf); pp.scale.set(0.03, h, 0.03); pp.position.set(x + dx, 0, z + dz); grupo.add(pp); });
    });
    [[X0 + 0.4, Z1 - 0.3], [X1 - 0.4, Z1 - 0.3], [X1 - 0.4, Z0 + 0.3]].forEach(([x, z]) => { caixa(grupo, 0.6, 0.4, 0.6, branco, x, 0, z); const b = new T.Mesh(G3.bola, mat(0x4f9a5e, { roughness: 0.85 })); b.scale.set(0.35, 0.3, 0.35); b.position.set(x, 0.55, z); grupo.add(b); bloquear(x - 0.35, x + 0.35, z - 0.35, z + 0.35); });
    // os lugares do lounge viram postos da própria empresa (uma vez só por cidade)
    if (il.postosLocais && !il.postosLocais.lounge) { il.postosLocais.lounge = true; novos.forEach((p) => il.postosLocais.push(p)); }
  }
  // Árvores alinhadas nas laterais do lote (fora da cerca)
  for (let z = -8; z <= 8; z += 4) [-13.55, 13.55].forEach((x) => { const tr = new T.Mesh(G3.cil, mat(0x7a5a3c, { roughness: 1 })); tr.scale.set(0.07, 0.7, 0.07); tr.position.set(x, 0, z); grupo.add(tr); const cp = new T.Mesh(G3.copa, mat(0x4f9a5e, { roughness: 0.85 })); cp.scale.set(0.5, 0.65, 0.5); cp.position.set(x, 1.15, z); cp.castShadow = true; grupo.add(cp); });
}
// Carros parados nos estacionamentos das empresas: uma malha só para a cidade inteira
function carrosEstacionados(W) {
  const T = THREE, L = W.carros || []; if (!L.length) return;
  if (!CAMPO.geoCarro) {
    CAMPO.geoCarro = {
      cor: fundir([{ geo: G3.caixaC, p: [0, 0.2, 0], esc: [1.42, 0.22, 0.62], cor: 0xffffff }, { geo: G3.caixaC, p: [-0.08, 0.53, 0], esc: [0.62, 0.04, 0.52], cor: 0xffffff }]),
      escuro: fundir([{ geo: G3.caixaC, p: [-0.08, 0.41, 0], esc: [0.74, 0.2, 0.56], cor: 0x1a2430 }, { geo: G3.caixaC, p: [0.712, 0.22, 0], esc: [0.01, 0.05, 0.46], cor: 0xfff2d0 },
        ...[[-0.45, 1], [0.45, 1], [-0.45, -1], [0.45, -1]].map(([x, s]) => ({ geo: G3.roda, p: [x, 0.13, s * 0.29], esc: [0.13, 0.13, 0.07], cor: 0x111317 }))])
    };
  }
  const mc = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.45, envMap: CAMPO.ambiente, envMapIntensity: 0.8 }), me = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.4, envMap: CAMPO.ambiente, envMapIntensity: 0.8 });
  W.extras.push(mc, me);
  const ic = new T.InstancedMesh(CAMPO.geoCarro.cor, mc, L.length), ie = new T.InstancedMesh(CAMPO.geoCarro.escuro, me, L.length);
  const m4 = new T.Matrix4(), q = new T.Quaternion(), y = new T.Vector3(0, 1, 0), v = new T.Vector3(), s = new T.Vector3(1, 1, 1), c = new T.Color();
  L.forEach((k, i) => { q.setFromAxisAngle(y, k.rot); m4.compose(v.set(k.x, k.y, k.z), q, s); ic.setMatrixAt(i, m4); ie.setMatrixAt(i, m4); ic.setColorAt(i, c.setHex(k.cor)); });
  [ic, ie].forEach((im) => { im.castShadow = true; W.grupo.add(im); });
  W.malhaCarros = ic;
}

/* ---------- Relógio urbano ----------
   Na praça da sede, no eixo da avenida: mostra a hora e a fase do dia, que é o que muda o
   comportamento da cidade (manhã de operação, tarde de execução, noite de monitoramento). */
// Hora da cidade: a do relógio do computador; se alguém trocou dia/noite no botão, uma hora típica daquele período
function horaDaCidade() {
  const d = new Date(), m = CAMPO.horaManual;
  if (m && periodoPeloRelogio(d) !== m) d.setHours({ dia: 10, entardecer: 17, noite: 21 }[m] == null ? d.getHours() : { dia: 10, entardecer: 17, noite: 21 }[m]);
  return d;
}
function faseDoDia() {
  const per = periodoAtual(), h = horaDaCidade().getHours();
  if (per === 'noite') return { chave: 'noite', nome: 'NOITE · MONITORAMENTO' };
  if (per === 'entardecer') return { chave: 'fim', nome: 'FIM DE TARDE · RETORNO' };
  return h >= 12 && h < 18 ? { chave: 'tarde', nome: 'TARDE · EXECUÇÃO' } : { chave: 'manha', nome: 'MANHÃ · OPERAÇÃO' };
}
function montarRelogio() {
  const T = THREE, g = CAMPO.planoGrupo, X = 0, Z = 24.4, ALT = PLANO.ALT;
  const graf = mat(0x161a21, { roughness: 0.35, metalness: 0.55 });
  caixa(g, 1.3, 0.4, 1.3, mat(0xd9d3c7, { roughness: 0.7 }), X, ALT, Z);
  caixa(g, 0.32, 4.1, 0.32, graf, X, ALT + 0.4, Z); caixa(g, 0.04, 3.7, 0.34, luzMat(COR3D.laranja, 1.2), X + 0.15, ALT + 0.6, Z).castShadow = false;
  const cabeca = new T.Group(); cabeca.position.set(X, ALT + 5.3, Z); cabeca.scale.setScalar(0.85); g.add(cabeca);
  const disco = new T.Mesh(new T.CylinderGeometry(1.15, 1.15, 0.3, 48).rotateX(Math.PI / 2), graf); disco.castShadow = true; cabeca.add(disco);
  const aro = new T.Mesh(new T.TorusGeometry(1.17, 0.05, 8, 64), luzMat(COR3D.laranja, 1.4)); cabeca.add(aro);
  const tela = document.createElement('canvas'); tela.width = tela.height = 320; const tex = new T.CanvasTexture(tela); tex.encoding = T.sRGBEncoding;
  const mf = new T.MeshBasicMaterial({ map: tex, toneMapped: false });
  [0, Math.PI].forEach((r) => { const f = new T.Mesh(new T.CircleGeometry(1.08, 48), mf); f.rotation.y = r; f.position.z = r ? -0.155 : 0.155; cabeca.add(f); });
  PLANO.obst.push([X - 0.75, X + 0.75, Z - 0.75, Z + 0.75]);
  PLANO.relogio = { tela, tex, prox: 0 };
}
function passoRelogio() {
  const R = PLANO.relogio, agora = performance.now(); if (!R || agora < R.prox) return; R.prox = agora + 1000;
  const g = R.tela.getContext('2d'), S = 320, c = S / 2, d = horaDaCidade(), fase = faseDoDia();
  g.fillStyle = '#0b1a33'; g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; g.strokeStyle = k % 3 ? 'rgba(255,255,255,.5)' : '#ffb27a'; g.lineWidth = k % 3 ? 3 : 6; g.beginPath(); g.moveTo(c + Math.sin(a) * 128, c - Math.cos(a) * 128); g.lineTo(c + Math.sin(a) * 146, c - Math.cos(a) * 146); g.stroke(); }
  const ponteiro = (ang, comp, larg, cor) => { g.strokeStyle = cor; g.lineWidth = larg; g.lineCap = 'round'; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.sin(ang) * comp, c - Math.cos(ang) * comp); g.stroke(); };
  const h = d.getHours() % 12 + d.getMinutes() / 60, mi = d.getMinutes() + d.getSeconds() / 60;
  ponteiro(h / 12 * Math.PI * 2, 70, 9, '#ffffff'); ponteiro(mi / 60 * Math.PI * 2, 108, 6, '#ffffff'); ponteiro(d.getSeconds() / 60 * Math.PI * 2, 118, 2, '#ff8a3d');
  g.fillStyle = '#ff8a3d'; g.beginPath(); g.arc(c, c, 8, 0, Math.PI * 2); g.fill();
  g.textAlign = 'center'; g.fillStyle = '#ffffff'; g.font = '700 30px monospace'; g.fillText(String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'), c, c + 64);
  g.fillStyle = fase.chave === 'noite' ? '#38d6f5' : '#ffb27a'; g.font = '600 15px Arial, sans-serif'; g.fillText(fase.nome, c, c + 92);
  R.tex.needsUpdate = true;
}

/* ---------- Entorno da cidade: a metrópole em volta ----------
   Sem isso a cidade da consultoria fica "flutuando" num piso branco infinito (cara de maquete).
   Em volta dela: as avenidas continuam, quarteirões com prédios de várias alturas (janelas acesas à
   noite), parques, a baía a leste com a ponte da avenida de entrada e as montanhas ao fundo.
   Tudo em poucas malhas repetidas (instâncias), sem sombra, e a névoa dá a profundidade. */
function montarEntorno() {
  const T = THREE, P = PLANO, g = new T.Group(); g.name = 'entorno'; CAMPO.cena.add(g); CAMPO.entorno = g;
  const sorte = sorteio('entorno-rf'), R = P.RUA / 2, LIM = 300, BAIA = 166;
  const dentro = (x, z) => x > -101 && x < 101 && z > -95 && z < 107;   // a cidade da consultoria
  // Linhas das avenidas de fora (continuam a grade da cidade)
  const XS = P.XR.slice(), ZS = P.ZR.slice();
  for (let k = 1; k <= 6; k++) { XS.push(P.XR[5] + 36 * k, P.XR[0] - 36 * k); ZS.push(P.ZR[5] + 36 * k, P.ZR[0] - 36 * k); }
  XS.sort((a, b) => a - b); ZS.sort((a, b) => a - b);
  const asfalto = new T.MeshStandardMaterial({ color: 0x4a515d, roughness: 0.92 });
  const calcada = new T.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.85 }), gramaEntorno = new T.MeshStandardMaterial({ color: 0x86b06e, roughness: 0.95 });
  pisoRealista(asfalto, { escala: 3, variacao: 0.05, manchas: 0.12 }); pisoRealista(calcada, { escala: 1.6, linha: 0.16, variacao: 0.07 }); pisoRealista(gramaEntorno, { escala: 1, manchas: 0.32 });
  const K = novoLote();
  const faixa = (x0, x1, z0, z1, m, h, y) => K.add(G3.caixa, m, (x0 + x1) / 2, y || 0, (z0 + z1) / 2, x1 - x0, h, z1 - z0, 0, 0, 0, false);
  // Ruas de fora: cortadas onde a cidade já desenhou as dela e onde começa a baía
  XS.forEach((x) => { if (x > BAIA) return; [[-LIM, -95], [107, LIM]].forEach(([a, b]) => faixa(x - R, x + R, a, b, asfalto, 0.01)); if (Math.abs(x) > 101) faixa(x - R, x + R, -95, 107, asfalto, 0.01); });
  ZS.forEach((z) => { [[-LIM, -101], [101, BAIA]].forEach(([a, b]) => faixa(a, b, z - R, z + R, asfalto, 0.01)); if (z < -95 || z > 107) faixa(-101, 101, z - R, z + R, asfalto, 0.01); });
  // Prédios: três "famílias" de fachada (vidro escuro, vidro azul, concreto claro com janelas)
  const fam = [vidroComJanelas(6, 18, 0x1d2735, '#ffe3b8', 0.45, 0.6), vidroComJanelas(5, 14, 0x355a86, '#e3f2ff', 0.4, 0.5), vidroComJanelas(8, 8, 0xb9bec7, '#ffe9c4', 0.35, 0.45)];
  const listas = fam.map(() => []), topos = [], arvores = [];
  for (let i = 0; i < XS.length - 1; i++) for (let j = 0; j < ZS.length - 1; j++) {
    const x0 = XS[i] + R, x1 = XS[i + 1] - R, z0 = ZS[j] + R, z1 = ZS[j + 1] - R, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (dentro(cx, cz) || x1 > BAIA + 2 || Math.abs(cx) > LIM || Math.abs(cz) > LIM) continue;
    faixa(x0, x1, z0, z1, calcada, 0.04);
    // Sem prédios em volta: quarteirões verdes com árvores nas calçadas (a cidade da consultoria é o destaque)
    faixa(x0 + 1.6, x1 - 1.6, z0 + 1.6, z1 - 1.6, gramaEntorno, 0.05);
    for (let u = x0 + 2; u < x1 - 1; u += 6.5) [z0 + 0.8, z1 - 0.8].forEach((w) => arvores.push([u, w, 0.85 + sorte() * 0.3]));
    if (sorte() < 0.5) for (let q = 0; q < 5; q++) arvores.push([x0 + 4 + sorte() * (x1 - x0 - 8), z0 + 4 + sorte() * (z1 - z0 - 8), 1.0 + sorte() * 0.7]);
    continue;
    const dist = Math.hypot(cx, cz), r = sorte();
    if (r < 0.16) {   // parque do bairro
      for (let q = 0; q < 9; q++) arvores.push([x0 + 3 + sorte() * (x1 - x0 - 6), z0 + 3 + sorte() * (z1 - z0 - 6), 0.9 + sorte() * 0.8]);
      faixa(x0 + 1.5, x1 - 1.5, z0 + 1.5, z1 - 1.5, gramaEntorno, 0.05);
      continue;
    }
    // De 1 a 4 prédios por quarteirão; mais altos quanto mais longe do centro (o "skyline")
    const n = 1 + Math.floor(sorte() * 4), cols = n > 2 ? 2 : n, rows = n > 2 ? 2 : 1;
    for (let q = 0; q < n; q++) {
      const cw = (x1 - x0 - 4) / cols, cd = (z1 - z0 - 4) / rows, ci = q % cols, cj = Math.floor(q / cols);
      const w = cw * (0.55 + sorte() * 0.35), d = cd * (0.55 + sorte() * 0.35);
      const bx = x0 + 2 + cw * (ci + 0.5) + (sorte() - 0.5) * (cw - w) * 0.6, bz = z0 + 2 + cd * (cj + 0.5) + (sorte() - 0.5) * (cd - d) * 0.6;
      const alto = sorte() < 0.35 + Math.min(0.4, (dist - 120) / 400);
      const h = alto ? 18 + sorte() * 28 + (dist - 120) * 0.06 : 5 + sorte() * 9;
      const f = alto ? (sorte() < 0.6 ? 0 : 1) : 2;
      listas[f].push([bx, bz, w, h, d]);
      if (alto && sorte() < 0.7) topos.push([bx, h, bz, w * 0.4, 1.2 + sorte() * 1.5, d * 0.4]);
    }
    for (let q = 0; q < 4; q++) arvores.push([q < 2 ? x0 + 1 : x1 - 1, q % 2 ? z0 + 1 : z1 - 1, 0.8]);
  }
  K.montar(g, []);
  g.children.forEach((m) => { m.castShadow = false; m.receiveShadow = true; });
  const m4 = new T.Matrix4(), q4 = new T.Quaternion(), s3 = new T.Vector3(), v3 = new T.Vector3();
  const instancias = (geo, mat, itens, fn) => { if (!itens.length) return null; const im = new T.InstancedMesh(geo, mat, itens.length); itens.forEach((it, k) => { fn(it, v3, s3); im.setMatrixAt(k, m4.compose(v3, q4, s3)); }); im.castShadow = false; im.receiveShadow = false; g.add(im); return im; };
  listas.forEach((l, f) => instancias(G3.caixa, fam[f], l, ([x, z, w, h, d], v, s) => { v.set(x, 0, z); s.set(w, h, d); }));
  instancias(G3.caixa, mat(0x6b7380, { roughness: 0.7 }), topos, ([x, y, z, w, h, d], v, s) => { v.set(x, y, z); s.set(w, h, d); });
  instancias(G3.copa, mat(0x4c8a58, { roughness: 0.9 }), arvores, ([x, z, e], v, s) => { v.set(x, 1.0 * e, z); s.set(0.9 * e, 1.0 * e, 0.9 * e); });
  instancias(G3.cil, mat(0x6b4f36, { roughness: 1 }), arvores, ([x, z, e], v, s) => { v.set(x, 0, z); s.set(0.1 * e, 1.0 * e, 0.1 * e); });
  // Baía a leste: água, orla de pedra e a ponte da avenida de entrada (com dois pilares altos e estais)
  const agua = new T.Mesh(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: 0x3d73a8, roughness: 0.12, metalness: 0.35, envMap: CAMPO.ambiente, envMapIntensity: 0.9 }));
  agua.scale.set(1400, 1, 1400); agua.position.set(BAIA + 2 + 700, 0.02, 0); g.add(agua);
  const orla = new T.Mesh(G3.caixa, mat(0xb8b0a0, { roughness: 0.8 })); orla.scale.set(2, 0.3, 2 * LIM); orla.position.set(BAIA + 1, 0, 0); g.add(orla);
  const zP = 29.5, deck = mat(0x4a515d, { roughness: 0.9 }), branco = mat(0xf1f3f6, { roughness: 0.5 });
  const ponte = new T.Group(); g.add(ponte);
  caixa(ponte, 420, 0.25, P.RUA + 0.8, deck, BAIA + 210, 0.0, zP); caixa(ponte, 420, 0.5, 0.15, branco, BAIA + 210, 0.25, zP - R - 0.35); caixa(ponte, 420, 0.5, 0.15, branco, BAIA + 210, 0.25, zP + R + 0.35);
  [BAIA + 90, BAIA + 190].forEach((x) => {
    [-1, 1].forEach((s) => caixa(ponte, 0.9, 26, 0.9, branco, x, 0, zP + s * (R + 1.0)));
    caixa(ponte, 0.9, 0.9, P.RUA + 2.9, branco, x, 25, zP); caixa(ponte, 1.0, 0.25, P.RUA + 3.0, luzMat(COR3D.laranja, 1.2), x, 26, zP).castShadow = false;
    [-1, 1].forEach((s) => { for (let k = 1; k <= 5; k++) { const dx = k * 9, L = Math.hypot(dx, 24); [-1, 1].forEach((sd) => { const c = new T.Mesh(G3.cilDeitado, branco); c.scale.set(L, 0.05, 0.05); c.position.set(x + sd * dx / 2, 0.5 + 12, zP + s * (R + 1.0)); c.rotation.z = -sd * Math.atan2(24, dx); ponte.add(c); }); } });   // estais: descem do alto do pilar até o tabuleiro
  });
  // Montanhas ao fundo (a névoa deixa azuladas) — lembram o Mestre Álvaro
  const serra = mat(0x5f7468, { roughness: 1 });
  [[-260, -470, 95, 70], [-120, -520, 130, 110], [40, -480, 85, 60], [180, -540, 120, 85], [-380, -330, 90, 55], [-420, 120, 110, 60], [320, -420, 80, 50]].forEach(([x, z, r, h]) => {
    const m = new T.Mesh(G3.cone, serra); m.scale.set(r, h, r * 0.8); m.position.set(x, -2, z); g.add(m);
  });
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
}

/* ---------- Pisos com textura de verdade ----------
   Calçada em placas, praças em lajotas grandes, asfalto com grão e grama com manchas: o desenho é feito
   no próprio material pela posição no mundo (não estica em peça comprida) e some com a distância
   (assim não aparece aquele "chuvisco" quando a câmera está longe). Cada placa tem um tom levemente
   diferente, como um piso real. */
function pisoRealista(m, o) {
  if (!m || m.userData.pisoRF) return; m.userData.pisoRF = true;
  const esc = o.escala || 1, lin = o.linha || 0, varia = o.variacao || 0, manchas = o.manchas || 0, chave = [esc, lin, varia, manchas].join('_');
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vRfW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vec4 rfWp = vec4(transformed, 1.0);\n  #ifdef USE_INSTANCING\n  rfWp = instanceMatrix * rfWp;\n  #endif\n  vRfW = (modelMatrix * rfWp).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec2 vRfW;
float rfHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float rfRuido(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(rfHash(i), rfHash(i + vec2(1.0, 0.0)), f.x), mix(rfHash(i + vec2(0.0, 1.0)), rfHash(i + vec2(1.0, 1.0)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
  {
    vec2 p = vRfW * ${esc.toFixed(3)};
    float w = length(fwidth(p));
    float perto = 1.0 - smoothstep(0.12, 0.55, w);   // longe: o desenho some (sem chuvisco)
    vec2 f = abs(fract(p) - 0.5);
    float junta = smoothstep(0.5 - max(0.02, w * 0.8), 0.5, max(f.x, f.y)) * ${lin.toFixed(3)} * perto;
    float placa = (rfHash(floor(p)) - 0.5) * ${varia.toFixed(3)} * perto;
    float mancha = (rfRuido(vRfW * 0.08) - 0.5) * ${manchas.toFixed(3)} + (rfRuido(vRfW * 0.6) - 0.5) * ${(manchas * 0.5).toFixed(3)} * perto;
    diffuseColor.rgb *= (1.0 - junta) * (1.0 + placa + mancha);
  }`);
  };
  m.customProgramCacheKey = () => 'pisoRF_' + chave;
  m.needsUpdate = true;
}
function aplicarPisosRealistas() {
  const M = PLANO.mats, V = typeof materiaisDaVida === 'function' ? materiaisDaVida() : null;
  // Tons de concreto e pedra de verdade (o branco puro "estoura" na luz e dá cara de maquete).
  // A cor de dia guardada para o escurecer da noite também muda.
  const tom = (m, hex) => { if (!m) return; m.color.setHex(hex); (CAMPO.pisosNoite || []).forEach((e) => { if (e[0] === m) e[1] = hex; }); };
  tom(M.calcada, 0xb4b0a7); tom(M.quadra, 0xbdb9b0); tom(M.pedra, 0xaeaaa2); tom(M.pedraClara, 0xc8c4bb);
  pisoRealista(M.calcada, { escala: 1.6, linha: 0.3, variacao: 0.1 });
  pisoRealista(M.quadra, { escala: 0.9, linha: 0.18, variacao: 0.08, manchas: 0.06 });
  pisoRealista(M.pedra, { escala: 0.8, linha: 0.26, variacao: 0.12 });
  pisoRealista(M.pedraClara, { escala: 0.55, linha: 0.22, variacao: 0.09 });
  pisoRealista(M.saibro, { escala: 1, manchas: 0.22 });
  pisoRealista(M.asfalto, { escala: 3, variacao: 0.07, manchas: 0.16 });
  if (V && V.grama) pisoRealista(V.grama, { escala: 1, manchas: 0.36 });
  if (CAMPO.luzes && CAMPO.luzes.chao) pisoRealista(CAMPO.luzes.chao.material, { escala: 1, manchas: 0.26 });
}

/* ---------- Campus de cada empresa: um projeto próprio por segmento ----------
   Tudo no sistema da quadra (portão em +z; quadra de -13 a 13 por -10 a 10). Cada segmento tem a sua
   composição ocupando a quadra inteira (prédios grandes, pátio, estacionamento, jardim, operação).
   Regras comuns:
   - o corredor do portão (x de -1,9 a 1,9, z de 6,5 a 10) fica livre;
   - os setores da empresa ficam no telhado do prédio marcado como "telhado" (altura = nota, topo
     aceso = saúde do setor, andar verde = melhoria entregue): a legenda do painel continua valendo;
   - o telão (vídeo na Elson's, logo animada nas outras) fica na fachada de um prédio-chave;
   - pisos em camadas de alturas diferentes (nada de dois pisos no mesmo plano, que "piscam"). */
const CAMPUS_NOVO = true;
const CAMPUS_DO_SEGMENTO = {
  distribuicao: 'CENTRO DE DISTRIBUIÇÃO', industria: 'UNIDADE INDUSTRIAL', agro: 'ARMAZÉM E BENEFICIAMENTO', varejo: 'SUPERMERCADO',
  saude: 'HOSPITAL', tecnologia: 'CENTRO DE TECNOLOGIA', servicos: 'CENTRO EMPRESARIAL', construcao: 'SHOWROOM E BASE TÉCNICA'
};
function lugaresNoTelhado(n, il) {
  const R = il.campusTelhado || { x0: -6, x1: 6, z0: -9, z1: -4 }, larg = R.x1 - R.x0, prof = R.z1 - R.z0;
  const porFila = Math.max(1, Math.min(6, Math.floor((larg - 0.4) / 1.9))), filas = prof > 4.2 ? 2 : 1, passo = (larg - 0.4) / porFila, lista = [];
  for (let i = 0; i < n; i++) {
    const f = Math.min(filas - 1, Math.floor(i / porFila)), k = i % porFila, naFila = Math.min(porFila, n - Math.floor(i / porFila) * porFila);
    lista.push([(R.x0 + R.x1) / 2 + (k - (naFila - 1) / 2) * passo, filas > 1 ? (f ? R.z0 + 1.2 : R.z1 - 1.2) : (R.z0 + R.z1) / 2]);
  }
  return lista;
}
function placaTexto(g, linhas, fundo, cor, w, h, x, y, z, giro, larg, alt, descartar) {
  const tx = texturaTexto(linhas, fundo, cor, larg || 768, alt || 160); tx.anisotropy = 8; descartar.push(tx);
  const m = new THREE.MeshBasicMaterial({ map: tx, toneMapped: false }); descartar.push(m);
  const pl = new THREE.Mesh(G3.placa, m); pl.scale.set(w, h, 1); pl.position.set(x, y, z); pl.rotation.y = giro || 0; g.add(pl); return pl;
}
function V_pedra() { return CAMPO.matPedraCampus || (CAMPO.matPedraCampus = pisoNoturno(new THREE.MeshStandardMaterial({ color: 0xd6d3cc, roughness: 0.7 }))); }
function materiaisDoCampus() {
  if (CAMPO.matsCampus) return CAMPO.matsCampus;
  return (CAMPO.matsCampus = {
    metal: mat(0xb4bac2, { roughness: 0.5, metalness: 0.12 }), branco: mat(0xf2f4f7, { roughness: 0.55 }), grafite: mat(0x23282f, { roughness: 0.4, metalness: 0.4 }),
    concreto: mat(0xbfbcb5, { roughness: 0.85 }), asfalto: mat(0x4d545f, { roughness: 0.92 }), terra: mat(0xb89a6a, { roughness: 1 }), agua: mat(0x4f8fd6, { roughness: 0.1, metalness: 0.3 }),
    vidroQ: vidroComJanelas(10, 3, 0x4a6a8e, '#ffdcaa', 0.8, 0.9), vidroAz: vidroComJanelas(8, 12, 0x2f5f92, '#e3f2ff', 0.55, 0.7),
    hospital: vidroComJanelas(12, 6, 0xeef1f5, '#cfe6ff', 0.5, 0.55), escritorio: vidroComJanelas(10, 5, 0xdfe3e8, '#ffe9c4', 0.55, 0.6),
    flores: [mat(0x9b6bd6, { roughness: 0.8 }), mat(0xe887b5, { roughness: 0.8 }), mat(0xf2d33a, { roughness: 0.8 }), mat(0xf07a5a, { roughness: 0.8 })]
  });
}
// Ferramentas comuns a todos os campi
function ferramentasDoCampus(H, il, D, g) {
  const T = THREE, M = materiaisDoCampus(), c = il.cores, desc = il.descartar, sorte = sorteio(D.id + 'campus');
  const C = {
    T, M, H, il, D, g, c, desc, sorte, luz: luzMat(c.destaque, 1.3),
    // piso em camadas: nivel 0 = base, 1 e 2 = por cima (cada um numa altura, para não piscar)
    piso: (m, x0, x1, z0, z1, nivel) => H.bx(m, (x0 + x1) / 2, 0.004 + (nivel || 0) * 0.009, (z0 + z1) / 2, x1 - x0, 0.02, z1 - z0, 0, false),
    // prédio: corpo, platibanda e o filete aceso no alto da fachada da frente
    predio: (x0, x1, z0, z1, h, m, o) => {
      const op = o || {}, w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (m && m.emissiveMap) { const corpo = new T.Mesh(G3.caixa, m); corpo.scale.set(w, h, d); corpo.position.set(cx, 0, cz); corpo.castShadow = corpo.receiveShadow = true; g.add(corpo); } else H.bx(m, cx, 0, cz, w, h, d);
      if (op.platibanda !== false) H.bx(op.topo || 0x8f979f, cx, h, cz, w + 0.2, 0.2, d + 0.2);
      if (op.filete !== false) H.bx(C.luz, cx, h - 0.05, z1 + 0.11, w + 0.2, 0.05, 0.04, 0, false);
      return { x0, x1, z0, z1, h, cx, cz };
    },
    telhado: (B) => { il.campusTelhado = { x0: B.x0, x1: B.x1, z0: B.z0, z1: B.z1, h: B.h + 0.2 }; },
    faixa: (B, texto, y) => {   // faixa escura com a logo e o nome na fachada da frente
      const yy = y == null ? B.h - 1.0 : y, w = B.x1 - B.x0;
      H.bx(0x1b2028, B.cx, yy - 0.45, B.z1 + 0.06, w * 0.96, 1.0, 0.12); H.bx(C.luz, B.cx, yy - 0.47, B.z1 + 0.13, w * 0.96, 0.05, 0.03, 0, false);
      placaLogo(g, il, D, Math.min(2.4, w * 0.25), 0.62, B.x0 + Math.min(1.7, w * 0.18), yy + 0.05, B.z1 + 0.14);
      placaTexto(g, [texto], '#1b2028', '#ffffff', Math.min(4.6, w * 0.45), 0.46, B.cx + w * 0.16, yy + 0.05, B.z1 + 0.14, 0, 900, 96, desc);
    },
    // telão na fachada: centro (x, y, z), largura w, virado para (sen giro, cos giro)
    telao: (x, y, z, w, giro) => {
      const h = w * 9 / 16, gr = new T.Group(); gr.position.set(x, y, z); gr.rotation.y = giro || 0; g.add(gr);
      caixa(gr, w + 0.5, h + 0.5, 0.25, M.grafite, 0, -h / 2 - 0.25, -0.16);
      il.telaoCampus = { grupo: gr, w, h };
    },
    carros: (x0, x1, z, frente) => {   // fileira de carros estacionados (frente: +1 olha para +z)
      const cores = [0xf2f3f5, 0x1c1f26, 0x9aa3ad, 0x5a6b82, 0x8c1d26, 0xc9ced6, 0x2f4d6e];
      for (let x = x0 + 0.5; x <= x1 - 0.4; x += 1.05) { H.pintura(0xf4f6f9, x - 0.52, z, 0.05, 1.5); if (sorte() < 0.22) continue; H.veiculo('carro', x, z, frente > 0 ? -Math.PI / 2 : Math.PI / 2, 1.0, cores[Math.floor(sorte() * cores.length)], 0x2b3446); }
    },
    estacionamento: (x0, x1, z0, z1) => {   // asfalto + duas fileiras de vagas viradas para o corredor
      C.piso(M.asfalto, x0, x1, z0, z1, 1);
      if (z1 - z0 >= 4.6) { C.carros(x0, x1, z0 + 0.8, 1); C.carros(x0, x1, z1 - 0.8, -1); } else C.carros(x0, x1, (z0 + z1) / 2, 1);
    },
    arvore: (x, z, k) => { const e = k || 1; H.cil(0x7a5a3c, x, 0, z, 0.07 * e, 0.6 * e); H.bola(0x4f9a5e, x, 0.95 * e, z, 0.5 * e, 0.55 * e, 0.5 * e); H.bola(0x3f8a52, x + 0.22 * e, 1.15 * e, z + 0.1 * e, 0.32 * e, 0.34 * e, 0.32 * e); },
    canteiro: (x, z, w, d) => { H.bx(0x3f7a4c, x, 0, z, w, 0.28, d); const n = Math.max(2, Math.floor(w / 0.38)); for (let k = 0; k < n; k++) H.bola(M.flores[k % 4], x - w / 2 + 0.2 + k * (w - 0.4) / (n - 1), 0.36, z + (k % 2 ? 0.1 : -0.1) * d, 0.16, 0.13, 0.16); },
    banco: (x, z, rot) => { H.bx(0x9a6a42, x, 0, z, Math.abs(Math.sin(rot)) > 0.5 ? 0.42 : 1.2, 0.4, Math.abs(Math.sin(rot)) > 0.5 ? 1.2 : 0.42); },
    mesas: (x, z, guarda) => { H.cil(0xf4f6fa, x, 0, z, 0.36, 0.6); if (guarda) { H.cil(0x2b3446, x, 0.6, z, 0.025, 0.7); H.cone(c.destaque, x, 1.2, z, 0.8, 0.3); } [0, 2.1, 4.2].forEach((a) => { const px = x + Math.cos(a) * 0.72, pz = z + Math.sin(a) * 0.72; H.cil(0x9a6a42, px, 0, pz, 0.12, 0.4); H.p(px, pz, Math.atan2(-(z - pz), x - px), 'cafe', { dur: 16 }); }); },
    marquise: (x, z, w, d, h) => { H.bx(0x2b3038, x, h || 2.0, z, w, 0.12, d); [-1, 1].forEach((s) => H.cil(0x2b3038, x + s * (w / 2 - 0.2), 0, z + d / 2 - 0.2, 0.05, h || 2.0)); },
    paletes: (x, z) => { H.bx(0x8a6a48, x, 0, z, 0.5, 0.08, 0.5); H.bx(0xc9a36a, x, 0.08, z, 0.46, 0.42, 0.46); },
    gente: (lista) => lista.forEach(([x, z, r, a]) => H.p(x, z, r, a, { dur: 14 }))
  };
  return C;
}
function campusPadrao(H, il, D, g) {
  const C = ferramentasDoCampus(H, il, D, g);
  il.campusVerticais = null; il.telaoCampus = null; il.campusTelhado = null;
  (CAMPUS_LAYOUT[D.cena] || CAMPUS_LAYOUT.servicos)(C);
  // Frente comum: canteiros floridos dos dois lados do portão (o corredor do portão fica livre)
  [[-7.2, 9.35, 8.6], [7.6, 9.35, 6.8]].forEach(([x, z, w]) => C.canteiro(x, z, w, 0.55));
}
const CAMPUS_LAYOUT = {
  // ---------- Distribuição: CD grande com 7 docas, administrativo de vidro, refeitório, pátio de manobra ----------
  distribuicao(C) {
    const { H, M, il } = C;
    C.piso(M.asfalto, -4.8, 11.6, -3.4, 6.3, 0);
    const CD = C.predio(-6.4, 11.6, -9.6, -3.4, 4.2, M.metal); C.telhado(CD); C.faixa(CD, CAMPUS_DO_SEGMENTO.distribuicao, 3.55);
    [-1, 1].forEach((s) => H.bx(luzMat(0xbfe0ff, 0.35), CD.cx + s * 4, CD.h + 0.02, CD.cz - 1.6, 4.2, 0.08, 1.2, 0, false));
    H.bx(0x2b3038, CD.cx, 2.1, CD.z1 + 0.95, CD.x1 - CD.x0 - 0.4, 0.1, 1.8);
    for (let k = 0; k < 7; k++) {
      const x = -5.0 + k * 2.4;
      H.bx(0xd9dde2, x, 0.02, CD.z1 + 0.02, 1.7, 1.85, 0.06); for (let y = 0.3; y < 1.8; y += 0.3) H.bx(0xb8bec6, x, y, CD.z1 + 0.06, 1.7, 0.02, 0.02, 0, false);
      [-0.95, 0.95].forEach((d) => H.bx(0xf0b429, x + d, 0, CD.z1 + 0.25, 0.14, 0.5, 0.3));
      H.bx(luzMat(k % 3 ? 0x6fdc8c : 0xff6b5a, 1.2), x + 0.7, 1.95, CD.z1 + 0.09, 0.12, 0.08, 0.04, 0, false);
      placaTexto(C.g, ['D0' + (k + 1)], '#1b2028', '#ffffff', 0.62, 0.3, x, 1.8, CD.z1 + 0.15, 0, 160, 80, C.desc);
      H.pintura(0xf0b429, x - 1.15, CD.z1 + 1.8, 0.06, 3.4); if (k === 6) H.pintura(0xf0b429, x + 1.15, CD.z1 + 1.8, 0.06, 3.4);
      if (k % 2 === 1) H.veiculo(k === 5 ? 'van' : 'carreta', x, CD.z1 + (k === 5 ? 1.2 : 1.95), -Math.PI / 2, 1.05);
    }
    H.porta(-5.0, CD.z1 + 0.9); H.porta(2.2, CD.z1 + 0.9);
    C.telao(CD.x1 - 3.0, CD.h + 0.25 + 2.7 / 2 + 0.05, CD.z1 - 0.12, 4.8, 0);
    // Administrativo (frente, à esquerda) e o refeitório (fundo, à esquerda), com estacionamento entre eles
    const AD = C.predio(-12.0, -5.4, 1.6, 7.8, 3.2, M.vidroQ); H.bx(0x8f979f, AD.cx, 1.55, AD.cz, 6.7, 0.08, 6.3); C.faixa(AD, 'ADMINISTRATIVO', 2.9);
    C.marquise(AD.cx, AD.z1 + 0.7, 3.2, 1.4); H.bx(CAMPO.vida.grama, AD.cx - 1, AD.h + 0.2, AD.cz - 0.6, 3.6, 0.06, 4, 0, false); H.porta(AD.cx, AD.z1 + 0.5);
    const RF = C.predio(-12.0, -7.0, -9.6, -4.6, 2.6, M.escritorio); placaTexto(C.g, ['REFEITÓRIO'], '#1b2028', '#ffffff', 2.2, 0.36, RF.cx, 2.25, RF.z1 + 0.12, 0, 512, 96, C.desc);
    C.estacionamento(-12.0, -5.6, -3.8, 1.0);
    il.campusVerticais = [[AD.x1 + 0.06, AD.cz, Math.PI / 2], [CD.x0 - 0.06, CD.cz, -Math.PI / 2]];
    // Pátio: área de separação (paletes), empilhadeiras, fila de caminhões e a balança na entrada
    H.pintura(0xf0b429, -1.0, 1.6, 4.6, 0.06); H.pintura(0xf0b429, -1.0, 4.2, 4.6, 0.06); H.pintura(0xf0b429, -3.3, 2.9, 0.06, 2.6); H.pintura(0xf0b429, 1.3, 2.9, 0.06, 2.6);
    [[-2.6, 2.3], [-1.9, 2.3], [-1.2, 2.3], [-2.6, 3.4], [-1.2, 3.4], [0.3, 2.6]].forEach(([x, z]) => C.paletes(x, z));
    H.veiculo('empilhadeira', 2.6, 1.6, 0.5, 1.0); H.veiculo('empilhadeira', -0.2, -0.4, -0.8, 1.0);
    H.veiculo('carreta', 8.6, 4.6, 0, 1.05); H.veiculo('carreta', 8.6, 2.6, 0, 1.05);
    H.pintura(0x9aa2ad, 0, 7.6, 2.6, 1.6);
    C.gente([[-0.4, -1.4, Math.PI / 2, 'carregar'], [4.6, -1.2, Math.PI / 2, 'tablet'], [7.0, -1.4, Math.PI, 'operar'], [-2.0, 1.0, 0, 'carregar'], [0.8, 3.8, Math.PI, 'olhar'], [6.0, 3.6, 0, 'tablet'], [AD.cx - 0.6, AD.z1 + 1.6, -Math.PI / 2, 'conversar'], [AD.cx + 0.2, AD.z1 + 1.6, 1.8, 'conversar']]);
  },
  // ---------- Indústria: galpão de produção com telhado em dentes de serra, chaminé, tanques e expedição ----------
  industria(C) {
    const { H, M } = C;
    C.piso(M.concreto, -11.8, 11.6, -1.4, 6.3, 0);
    const F = C.predio(-11.8, 3.8, -9.6, -1.4, 3.4, M.metal); C.faixa(F, CAMPUS_DO_SEGMENTO.industria, 2.9);
    for (let x = F.x0 + 1.6; x < F.x1; x += 3.1) { H.bx(0x9aa2ad, x, F.h + 0.2, F.cz, 1.5, 1.1, F.z1 - F.z0 - 0.4); H.bx(luzMat(0xbfe0ff, 0.45), x + 0.78, F.h + 0.2, F.cz, 0.05, 1.05, F.z1 - F.z0 - 0.6, 0, false); }
    [-9.0, -5.2, -1.4].forEach((x) => { H.bx(0xd9dde2, x, 0.02, F.z1 + 0.02, 2.2, 2.2, 0.06); for (let y = 0.3; y < 2.2; y += 0.3) H.bx(0xb8bec6, x, y, F.z1 + 0.06, 2.2, 0.02, 0.02, 0, false); H.porta(x, F.z1 + 0.6); });
    H.veiculo('caminhao', -5.2, F.z1 + 1.7, -Math.PI / 2, 1.05); H.veiculo('carreta', -1.4, F.z1 + 2.1, -Math.PI / 2, 1.05);
    const ES = C.predio(5.0, 11.6, -9.6, -5.2, 3.6, M.vidroQ); C.telhado(ES); C.faixa(ES, 'ESCRITÓRIO', 3.3);
    C.telao(ES.cx, 1.0 + 3.6 * 9 / 32, ES.z1 + 0.14, 3.6, 0);
    H.cil(0xc9ced6, 4.4, 0, -9.0, 0.45, 9.0); H.cil(0xff6b5a, 4.4, 8.4, -9.0, 0.47, 0.3); H.fumaca(4.4, 9.0, -9.0, 1.2);
    [5.8, 8.0, 10.2].forEach((x) => { H.cil(0xd5dbe3, x, 0, -3.2, 0.85, 3.2); H.cil(0xb4bcc8, x, 3.2, -3.2, 0.87, 0.12); H.viga(0x9aa2ad, [x, 2.8, -3.2], [x, 2.8, -5.2], 0.1); });
    H.viga(0x9aa2ad, [3.8, 2.6, -3.2], [10.2, 2.6, -3.2], 0.12);
    // Expedição: contêineres empilhados, paletes e a esteira saindo do galpão
    [[-10.6, 1.2], [-8.0, 1.2], [-10.6, 2.4], [-8.0, 2.4]].forEach(([x, z], k) => { H.bx([0x2f5ea8, 0xc94b3a, 0x2f8f83, 0xf0a33a][k], x, 0, z, 2.4, 1.0, 1.0); if (k < 2) H.bx([0xc94b3a, 0x2f5ea8][k], x, 1.0, z, 2.4, 1.0, 1.0); });
    H.viga(0x2b3446, [2.6, 1.2, -1.4], [2.6, 0.8, 2.4], 0.5, 0.15); [[3.4, 1.0], [3.4, 1.7], [-4.0, 1.4], [-3.3, 1.4]].forEach(([x, z]) => C.paletes(x, z));
    H.veiculo('empilhadeira', -1.6, 1.8, 0.4, 1.0);
    C.estacionamento(4.4, 11.6, 2.6, 6.3);
    C.gente([[-9.0, 0.6, Math.PI / 2, 'operar'], [-5.2, 0.4, Math.PI / 2, 'carregar'], [-1.4, 0.5, Math.PI / 2, 'tablet'], [4.0, 0.2, 0, 'operar'], [6.9, -1.6, Math.PI / 2, 'olhar'], [-6.4, 3.4, 0, 'carregar'], [0.4, 4.0, Math.PI, 'conversar'], [1.2, 4.0, 0, 'conversar']]);
  },
  // ---------- Saúde: hospital alto, pronto-socorro com ambulâncias, clínica com heliponto, jardim e estacionamento ----------
  saude(C) {
    const { H, M } = C;
    const HO = C.predio(-5.8, 5.8, -9.6, -4.6, 7.2, M.hospital, { topo: 0xdfe3e8 }); C.telhado(HO); C.faixa(HO, CAMPUS_DO_SEGMENTO.saude, 6.4);
    H.bx(0xd8262f, HO.cx + 4.6, 6.9, HO.z1 + 0.2, 0.3, 1.0, 0.12); H.bx(0xd8262f, HO.cx + 4.6, 7.25, HO.z1 + 0.2, 1.0, 0.3, 0.12);   // cruz
    C.marquise(HO.cx, HO.z1 + 1.0, 4.4, 2.0, 2.2); H.bx(luzMat(0xbcd8ff, 0.5), HO.cx, 0.05, HO.z1 + 0.06, 3.4, 2.0, 0.06, 0, false); H.porta(HO.cx, HO.z1 + 0.6);
    const PS = C.predio(-12.0, -6.4, -9.6, -2.4, 3.2, M.hospital, { topo: 0xdfe3e8 });
    H.bx(0xd8262f, PS.cx, 2.4, PS.z1 + 1.6, 5.4, 0.16, 3.2); [PS.x0 + 0.3, PS.x1 - 0.3].forEach((x) => H.cil(0xf4f6fa, x, 0, PS.z1 + 3.0, 0.08, 2.4));
    placaTexto(C.g, ['PRONTO-SOCORRO'], '#d8262f', '#ffffff', 3.4, 0.5, PS.cx, 2.9, PS.z1 + 0.13, 0, 640, 96, C.desc); H.porta(PS.cx, PS.z1 + 0.6);
    H.veiculo('ambulancia', PS.cx - 1.3, PS.z1 + 1.7, -Math.PI / 2, 1.1); H.veiculo('ambulancia', PS.cx + 1.3, PS.z1 + 1.7, -Math.PI / 2, 1.1);
    const CL = C.predio(6.4, 11.6, -9.6, -1.8, 4.2, M.vidroQ); placaTexto(C.g, ['CLÍNICA · CONSULTÓRIOS'], '#1b2028', '#ffffff', 3.8, 0.42, CL.cx, 3.8, CL.z1 + 0.13, 0, 768, 96, C.desc);
    C.telao(CL.cx, 0.9 + 4.4 * 9 / 32, CL.z1 + 0.14, 4.4, 0); H.porta(CL.x0 - 0.3, -3.0);
    // heliponto no teto da clínica
    H.cil(0x4a515d, CL.cx, CL.h + 0.2, CL.cz, 1.9, 0.05); H.bx(0xffffff, CL.cx - 0.5, CL.h + 0.26, CL.cz, 0.18, 0.02, 1.4, 0, false); H.bx(0xffffff, CL.cx + 0.5, CL.h + 0.26, CL.cz, 0.18, 0.02, 1.4, 0, false); H.bx(0xffffff, CL.cx, CL.h + 0.26, CL.cz, 1.0, 0.02, 0.18, 0, false);
    // Retorno de embarque na frente do hospital, com a rotatória ajardinada
    C.piso(M.asfalto, -5.8, 5.8, -4.6, 0.6, 0); H.cil(0x3f7a4c, 0, 0, -1.6, 1.2, 0.3); C.arvore(0, -1.6, 1.0);
    H.veiculo('carro', -3.6, -0.6, 0, 1.0, 0xf2f3f5); H.veiculo('ambulancia', 3.6, -0.6, Math.PI, 1.0);
    // Jardim terapêutico (direita) e estacionamento (esquerda)
    C.piso(CAMPO.vida.grama, 2.4, 11.6, 0.9, 8.8, 1); C.piso(V_pedra(), 2.4, 11.6, 3.9, 4.9, 2); C.piso(V_pedra(), 6.5, 7.5, 0.9, 8.8, 2);
    H.cil(0xd9d3c7, 7.0, 0, 4.4, 1.1, 0.32); H.cil(M.agua, 7.0, 0, 4.4, 0.95, 0.34); H.cil(0xf4f6fa, 7.0, 0.34, 4.4, 0.12, 0.8);
    [[4.2, 2.2], [9.8, 2.2], [4.2, 7.0], [9.8, 7.0], [11.0, 4.4]].forEach(([x, z]) => C.arvore(x, z, 1.0));
    [[4.6, 3.5, 0], [9.4, 3.5, 0], [4.6, 5.3, Math.PI], [9.4, 5.3, Math.PI]].forEach(([x, z, r]) => { C.banco(x, z, r); H.p(x, z + (r ? 0.35 : -0.35), r ? Math.PI / 2 : -Math.PI / 2, 'sentar', { dur: 16 }); });
    C.canteiro(4.4, 8.2, 3.0, 0.6); C.canteiro(9.6, 8.2, 3.0, 0.6);
    C.estacionamento(-12.0, -2.4, 1.2, 6.6);
    C.gente([[-2.0, -0.4, Math.PI / 2, 'olhar'], [1.6, -3.0, Math.PI / 2, 'conversar'], [2.4, -3.0, -1.4, 'conversar'], [PS.cx, PS.z1 + 0.9, Math.PI / 2, 'tablet'], [5.6, 6.0, 0, 'olhar'], [8.6, 6.4, Math.PI, 'olhar']]);
  },
  // ---------- Tecnologia: torre de vidro, cubo de inovação, data center, praça com arquibancada e coworking ----------
  tecnologia(C) {
    const { H, M } = C;
    C.piso(V_pedra(), -11.8, 11.6, -3.6, 6.3, 0);
    const TO = C.predio(-11.8, -5.0, -9.6, -3.6, 9.6, M.vidroAz, { topo: 0x2b3038 }); C.faixa(TO, CAMPUS_DO_SEGMENTO.tecnologia, 9.0);
    H.bx(0x2b3038, TO.cx, TO.h + 0.2, TO.cz, 3.0, 0.8, 2.6); H.bx(C.luz, TO.cx, TO.h + 1.0, TO.cz, 3.1, 0.06, 2.7, 0, false);
    C.telao(TO.cx, 1.2 + 5.6 * 9 / 32, TO.z1 + 0.14, 5.6, 0); H.porta(TO.cx, TO.z1 + 0.5);
    const LB = C.predio(-3.8, 3.8, -9.6, -4.2, 4.6, M.vidroQ); C.telhado(LB); placaTexto(C.g, ['LAB DE INOVAÇÃO'], '#1b2028', '#ffffff', 3.4, 0.44, LB.cx, 4.1, LB.z1 + 0.13, 0, 640, 96, C.desc);
    [LB.x0, LB.x1].forEach((x) => H.bx(C.luz, x, 0, LB.z1 + 0.1, 0.12, 4.6, 0.12, 0, false)); H.porta(LB.cx, LB.z1 + 0.5);
    const DC = C.predio(5.0, 11.6, -9.6, -5.0, 2.6, 0x1b2028); placaTexto(C.g, ['DATA CENTER'], '#1b2028', '#38d6f5', 2.6, 0.4, DC.cx, 2.1, DC.z1 + 0.13, 0, 512, 96, C.desc);
    for (let x = DC.x0 + 0.9; x < DC.x1 - 0.4; x += 1.4) { H.cil(0x9aa2ad, x, DC.h + 0.2, DC.cz - 0.8, 0.5, 0.4); H.cil(0x9aa2ad, x, DC.h + 0.2, DC.cz + 0.9, 0.5, 0.4); }
    for (let x = DC.x0 + 0.4; x < DC.x1; x += 0.6) H.bx(luzMat(0x38d6f5, 1.2), x, 0.4, DC.z1 + 0.06, 0.05, 1.6, 0.03, 0, false);
    // Arquibancada de frente para a torre, coworking coberto, gramados e árvores
    for (let k = 0; k < 3; k++) H.bx(0xd9d3c7, -6.0, 0, -2.6 + k * 0.7, 5.0, 0.3 + k * 0.3, 0.7);
    for (let k = 0; k < 4; k++) H.p(-7.6 + k * 1.1, -0.9, Math.PI / 2, 'olhar', { dur: 16 });
    C.marquise(7.6, -0.6, 6.8, 4.4, 2.3); for (let z = -2.6; z <= 1.4; z += 0.5) H.bx(0x2b3038, 7.6, 2.4, z, 6.8, 0.06, 0.08);
    C.mesas(5.8, -0.8, false); C.mesas(9.2, -0.8, false);
    C.piso(CAMPO.vida.grama, -11.8, -3.0, 1.6, 6.0, 1); C.piso(CAMPO.vida.grama, 3.0, 11.6, 2.8, 6.0, 1);
    [[-10.4, 3.8], [-7.6, 3.8], [-4.6, 3.8], [4.6, 4.4], [7.4, 4.4], [10.2, 4.4]].forEach(([x, z]) => C.arvore(x, z, 1.05));
    for (let k = 0; k < 6; k++) H.bx(0x2b3446, -2.4 + k * 0.35, 0, 2.2, 0.04, 0.5, 0.6);   // bicicletário
    C.gente([[-1.0, -2.6, Math.PI / 2, 'conversar'], [-0.2, -2.6, -1.4, 'conversar'], [0.6, 0.4, 0, 'tablet'], [-3.0, 0.6, Math.PI / 2, 'olhar'], [8.6, -3.0, Math.PI / 2, 'olhar']]);
  },
  // ---------- Varejo: supermercado com fachada de vidro, estacionamento grande, docas laterais e quiosque ----------
  varejo(C) {
    const { H, M } = C;
    const SU = C.predio(-11.8, 6.6, -9.6, -2.8, 3.8, M.branco); C.telhado(SU); C.faixa(SU, CAMPUS_DO_SEGMENTO.varejo, 3.4);
    H.bx(luzMat(0xbcd8ff, 0.45), SU.cx - 2, 0.05, SU.z1 + 0.06, 12.0, 2.2, 0.06, 0, false); C.marquise(SU.cx - 2, SU.z1 + 0.9, 6.0, 1.8, 2.4); H.porta(SU.cx - 2, SU.z1 + 0.5);
    C.telao(SU.x1 - 2.6, 0.8 + 4.0 * 9 / 32, SU.z1 + 0.14, 4.0, 0);
    const DO = C.predio(7.2, 11.6, -9.6, -4.6, 3.2, M.metal); H.bx(0xd9dde2, DO.cx, 0.02, DO.z1 + 0.02, 2.4, 2.0, 0.06); H.veiculo('caminhao', DO.cx, DO.z1 + 1.7, -Math.PI / 2, 1.05); H.veiculo('van', 10.6, -2.0, Math.PI / 2, 1.0);
    C.piso(M.asfalto, 6.8, 11.6, -4.6, -0.6, 0);
    // Estacionamento da frente (dos dois lados do corredor do portão), carrinhos e ilhas com árvore
    C.estacionamento(-11.8, -2.2, -2.2, 3.2); C.estacionamento(-11.8, -2.2, 3.6, 8.4); C.estacionamento(2.2, 6.6, -2.2, 3.2);
    C.piso(M.asfalto, -2.2, 2.2, -2.2, 6.0, 1);
    [[-7.0, 3.4], [4.4, 3.4]].forEach(([x, z]) => { H.bx(0x3f7a4c, x, 0, z, 4.0, 0.25, 0.4); C.arvore(x - 1.2, z, 0.8); C.arvore(x + 1.2, z, 0.8); });
    for (let k = 0; k < 5; k++) H.bx(0x9aa2ad, -1.6 + k * 0.22, 0, -2.0, 0.18, 0.55, 0.4);   // carrinhos
    const QU = C.predio(6.8, 11.6, 3.4, 7.6, 2.6, M.vidroQ); placaTexto(C.g, ['FARMÁCIA · CAFÉ'], '#1b2028', '#ffffff', 2.8, 0.4, QU.cx, 2.25, QU.z1 + 0.13, 0, 640, 96, C.desc);
    C.mesas(8.0, 0.8, true); C.mesas(10.4, 0.8, true);
    C.gente([[-3.4, -2.2, Math.PI / 2, 'olhar'], [-2.0, 0.6, 0, 'carregar'], [0.4, 0.8, Math.PI, 'olhar'], [9.0, -1.2, Math.PI / 2, 'carregar'], [-6.0, -2.0, Math.PI / 2, 'conversar'], [-5.2, -2.0, -1.4, 'conversar']]);
  },
  // ---------- Serviços: dois prédios de escritório em L, pátio-jardim com espelho d'água e café ----------
  servicos(C) {
    const { H, M } = C;
    const A = C.predio(-11.8, -3.6, -9.6, -3.6, 6.2, M.vidroQ); C.faixa(A, CAMPUS_DO_SEGMENTO.servicos, 5.6); H.porta(A.cx, A.z1 + 0.5);
    const B = C.predio(-2.4, 11.6, -9.6, -5.4, 4.6, M.escritorio); C.telhado(B); C.faixa(B, 'ATENDIMENTO', 4.1); H.porta(B.cx, B.z1 + 0.5);
    C.telao(B.cx + 3.0, 0.9 + 4.4 * 9 / 32, B.z1 + 0.14, 4.4, 0);
    H.bx(M.vidroQ, -3.0, 3.2, -6.6, 1.4, 0.9, 1.4); C.marquise(A.cx, A.z1 + 0.9, 3.6, 1.8);
    C.piso(V_pedra(), -11.8, 11.6, -5.4, 1.6, 0); C.piso(CAMPO.vida.grama, -2.0, 11.6, -4.6, 0.8, 1);
    C.piso(M.agua, 0.2, 9.4, -2.6, -1.4, 2);
    [[0.6, -3.6], [4.0, -3.6], [7.4, -3.6], [10.6, -3.6], [10.6, 0.2]].forEach(([x, z]) => C.arvore(x, z, 1.0));
    C.marquise(-7.6, -1.0, 6.4, 3.8, 2.3); C.mesas(-9.2, -1.0, false); C.mesas(-6.0, -1.0, false);
    C.estacionamento(-11.8, -2.4, 2.2, 8.4); C.estacionamento(2.4, 11.6, 2.2, 6.8);
    C.gente([[1.6, 0.2, 0, 'conversar'], [2.4, 0.2, Math.PI, 'conversar'], [5.6, 0.2, 0, 'olhar'], [A.cx, A.z1 + 1.8, Math.PI / 2, 'tablet'], [8.0, -5.0, Math.PI / 2, 'conversar'], [8.8, -5.0, -1.4, 'conversar']]);
  },
  // ---------- Agro: bateria de silos, armazém, terreiro de secagem, balança, caminhões graneleiros e lavoura ----------
  agro(C) {
    const { H, M } = C;
    [[-10.4, -8.2], [-7.4, -8.2], [-10.4, -5.2], [-7.4, -5.2]].forEach(([x, z]) => { H.cil(0xd9dde2, x, 0, z, 1.3, 6.2); H.cone(0xb4bcc8, x, 6.2, z, 1.32, 1.0); for (let y = 1; y < 6; y += 1.2) H.cil(0xc4cad3, x, y, z, 1.32, 0.06); });
    H.bx(0x9aa2ad, -5.6, 0, -6.7, 0.9, 8.4, 0.9); H.viga(0x9aa2ad, [-5.6, 8.0, -6.7], [-10.4, 7.0, -8.2], 0.15); H.viga(0x9aa2ad, [-5.6, 8.0, -6.7], [-7.4, 7.0, -5.2], 0.15);
    const AR = C.predio(-4.4, 7.4, -9.6, -3.8, 4.2, M.metal); C.telhado(AR); C.faixa(AR, CAMPUS_DO_SEGMENTO.agro, 3.6);
    H.bx(0xd9dde2, AR.cx - 2, 0.02, AR.z1 + 0.02, 2.4, 2.2, 0.06); H.porta(AR.cx - 2, AR.z1 + 0.6);
    const ES = C.predio(8.0, 11.6, -9.6, -5.0, 3.0, M.vidroQ); C.telao(AR.cx + 3.0, 0.7 + 4.0 * 9 / 32, AR.z1 + 0.14, 4.0, 0);
    placaTexto(C.g, ['ESCRITÓRIO'], '#1b2028', '#ffffff', 2.0, 0.34, ES.cx, 2.6, ES.z1 + 0.12, 0, 512, 96, C.desc);
    // Terreiro de secagem com montes de grão e o trator
    C.piso(M.terra, -11.8, -2.0, -2.6, 5.6, 0); for (let z = -2.0; z < 5.4; z += 0.8) H.pintura(0x9c7f52, -6.9, z, 9.4, 0.05);
    [[-9.6, -0.6], [-6.6, 1.4], [-4.0, 3.6]].forEach(([x, z]) => H.cone(0x6b4a2e, x, 0.02, z, 1.0, 0.55));
    H.veiculo('trator', -7.8, 3.6, 0.3, 1.1);
    // Pátio da balança e caminhões graneleiros
    C.piso(M.concreto, -2.0, 11.6, -3.8, 2.4, 0); H.pintura(0x9aa2ad, 3.0, -0.8, 4.2, 1.6);
    H.veiculo('graneleiro', 3.0, -0.8, 0, 1.05); H.veiculo('graneleiro', 8.4, 0.6, Math.PI, 1.05);
    // Lavoura de exemplo (fileiras) e o estacionamento
    C.piso(M.terra, 2.6, 11.6, 2.8, 8.8, 1); for (let z = 3.2; z < 8.6; z += 0.6) for (let x = 3.0; x < 11.4; x += 0.45) H.bola(0x3f8a52, x, 0.18, z, 0.18, 0.22, 0.18);
    C.estacionamento(-11.8, -2.4, 5.9, 8.8);
    C.gente([[-8.8, 0.6, 0, 'varrer'], [-5.4, 2.6, Math.PI, 'varrer'], [3.0, 1.0, Math.PI / 2, 'tablet'], [6.0, -2.6, Math.PI / 2, 'olhar'], [-3.0, -3.0, Math.PI / 2, 'operar'], [5.0, 3.4, 0, 'agachar']]);
  },
  // ---------- Construção: torre administrativa, showroom de vidro e o canteiro com prédio em obra e grua ----------
  construcao(C) {
    const { H, M } = C;
    const TA = C.predio(-11.8, -5.6, -9.6, -3.4, 6.4, M.escritorio); C.telhado(TA); C.faixa(TA, 'ADMINISTRATIVO', 5.8);
    C.telao(TA.cx, 1.0 + 4.6 * 9 / 32, TA.z1 + 0.14, 4.6, 0); H.porta(TA.cx, TA.z1 + 0.5);
    const SH = C.predio(-11.8, -3.4, 1.4, 7.8, 3.2, M.vidroQ); C.faixa(SH, 'SHOWROOM', 2.9); C.marquise(SH.cx, SH.z1 + 0.8, 3.6, 1.6); H.porta(SH.cx, SH.z1 + 0.5);
    C.piso(V_pedra(), -11.8, -3.4, -3.4, 1.4, 0); C.mesas(-9.6, -1.0, true); C.mesas(-6.4, -1.0, true);
    // Canteiro: tapume, prédio em estrutura (pilares e lajes), grua, materiais, betoneira e escavadeira
    C.piso(M.terra, -2.6, 11.6, -9.6, 1.0, 0);
    for (let x = 0; x <= 8.01; x += 2.0) for (let z = -8.6; z <= -4.59; z += 2.0) H.bx(0xbfbcb5, x, 0, z, 0.3, 6.6, 0.3);
    [0, 2.2, 4.4, 6.6].forEach((y) => H.bx(0xd2cfc8, 4.0, y, -6.6, 8.6, 0.2, 4.6));
    H.bx(0x4fa36a, 4.0, 4.4, -4.2, 8.8, 2.2, 0.05);   // tela verde do andar de cima
    H.bx(0xf0b429, 10.4, 0, -8.6, 0.5, 10.0, 0.5); H.bx(0xf0b429, 6.4, 10.0, -8.6, 9.0, 0.35, 0.4); H.bx(0x2b3446, 10.9, 9.8, -8.6, 1.2, 0.8, 1.0); H.bx(0x9aa2ad, 3.4, 9.0, -8.6, 0.05, 1.0, 0.05);
    [[-1.4, -2.0], [-1.4, -0.4], [1.0, -0.6]].forEach(([x, z]) => { H.bx(0xb08a5c, x, 0, z, 1.2, 0.3, 0.9); H.bx(0x9aa2ad, x, 0.3, z, 1.0, 0.2, 0.8); });
    H.veiculo('betoneira', 4.6, -1.6, 0, 1.1); H.veiculo('escavadeira', 8.6, -1.4, 2.6, 1.1);
    H.bx(0xf0b429, 10.0, 0, 0.0, 2.4, 1.1, 1.0); placaTexto(C.g, ['OBRA'], '#f0b429', '#1b2028', 1.2, 0.34, 10.0, 0.7, 0.51, 0, 256, 96, C.desc);
    [-2.6, 11.6].forEach((x) => H.bx(0xf4f6fa, x, 0, -4.3, 0.06, 1.6, 10.6));
    [[-2.6, 1.6], [4.2, 11.6]].forEach(([a0, a1]) => { H.bx(0xf4f6fa, (a0 + a1) / 2, 0, 1.0, a1 - a0, 1.6, 0.06); H.bx(0xf07a22, (a0 + a1) / 2, 1.35, 1.03, a1 - a0, 0.18, 0.04, 0, false); });   // tapume com a entrada da obra
    C.estacionamento(1.6, 11.6, 2.0, 7.0);
    C.gente([[0, -3.6, Math.PI / 2, 'martelar'], [2.0, -3.6, Math.PI / 2, 'carregar'], [6.0, -3.4, Math.PI / 2, 'martelar'], [-0.8, -1.2, 0, 'carregar'], [3.4, -0.4, Math.PI, 'tablet'], [SH.cx, SH.z1 + 1.6, -Math.PI / 2, 'conversar'], [SH.cx + 0.8, SH.z1 + 1.6, 1.8, 'conversar']]);
  }
};

/* ---------- Real Forte Consulting City: a ilha flutuando no espaço ----------
   A cidade inteira vira uma ilha que flutua no meio do espaço:
   - por baixo: rocha com cristais acesos, trepadeiras penduradas, dois anéis de luz em volta,
     propulsores nos cantos e cachoeiras que caem da borda e somem no vazio;
   - na borda: a faixa com o nome gravado REAL FORTE · CONSULTING CITY (dos quatro lados), passeio
     com guarda-corpo de vidro, postes e um anel de árvores;
   - as avenidas de entrada viram pontes que terminam em portais (é por eles que os veículos
     chegam e vão embora);
   - em volta: ilhotas flutuantes e um cinturão de asteroides;
   - no céu (sempre ao fundo, acompanha a câmera): estrelas, nebulosas, um planeta gigante com anel,
     um planeta azul com atmosfera, uma lua, uma estação espacial e estrelas cadentes;
   - no centro da Praça das Conexões: o holograma gigante da torre da Real Forte (hologramaDaTorre). */
const ILHA = { x0: -134, x1: 134, z0: -128, z1: 140, raio: 20, esp: 7 };
function texturaCanvas(w, h, desenhar) { const c = document.createElement('canvas'); c.width = w; c.height = h; desenhar(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t; }
// Contorno da ilha (retângulo de cantos arredondados), no plano x/z
function formaDaIlha() {
  const I = ILHA, r = I.raio, f = new THREE.Shape();
  f.moveTo(I.x0 + r, I.z0); f.lineTo(I.x1 - r, I.z0); f.quadraticCurveTo(I.x1, I.z0, I.x1, I.z0 + r); f.lineTo(I.x1, I.z1 - r); f.quadraticCurveTo(I.x1, I.z1, I.x1 - r, I.z1);
  f.lineTo(I.x0 + r, I.z1); f.quadraticCurveTo(I.x0, I.z1, I.x0, I.z1 - r); f.lineTo(I.x0, I.z0 + r); f.quadraticCurveTo(I.x0, I.z0, I.x0 + r, I.z0);
  return f;
}
// Pontos do contorno puxados "d" para dentro da ilha (fechado: o último repete o primeiro)
function contornoParaDentro(n, d, y) {
  const pts = formaDaIlha().getSpacedPoints(n), out = [];
  if (pts[0].distanceTo(pts[pts.length - 1]) < 0.01) pts.pop();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length], tx = b.x - a.x, tz = b.y - a.y, L = Math.hypot(tx, tz) || 1;
    out.push(new THREE.Vector3(pts[i].x - (tz / L) * d, y, pts[i].y + (tx / L) * d));   // a normal (-tz, tx) aponta para dentro
  }
  out.push(out[0].clone());
  return out;
}
// O ponto (x, z) cai dentro da ilha, com uma margem da borda?
function dentroDaIlha(x, z, margem) {
  const I = ILHA, r = I.raio, m = margem || 0;
  if (x < I.x0 + m || x > I.x1 - m || z < I.z0 + m || z > I.z1 - m) return false;
  const cx = Math.min(Math.max(x, I.x0 + r), I.x1 - r), cz = Math.min(Math.max(z, I.z0 + r), I.z1 - r);
  return Math.hypot(x - cx, z - cz) <= r - m;
}
// Parede fina que acompanha uma linha de pontos (guarda-corpo de vidro)
function paredeAoLongo(pts, y0, y1) {
  const pos = [], idx = [];
  pts.forEach((p, i) => { pos.push(p.x, y0, p.z, p.x, y1, p.z); if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); } });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals(); return geo;
}
// Raio da rocha por baixo: em cima acompanha o desenho quadrado da ilha; descendo, fica redonda e afina
function raioDaRocha(ang, h) {
  const c = Math.abs(Math.cos(ang)), s = Math.abs(Math.sin(ang)), quadrado = 1 / Math.pow(Math.pow(c, 4) + Math.pow(s, 4), 0.25);
  const forma = quadrado + (1 - quadrado) * Math.min(1, h * 2.2);
  return 128 * forma * (1 - h * 0.93);
}
function montarEspaco() {
  const T = THREE, P = PLANO, MP = P.mats, g = new T.Group(); g.name = 'espaco'; CAMPO.cena.add(g); CAMPO.espacoGrupo = g; CAMPO.espaco = true;
  CAMPO.cena.background = new T.Color(0x02040b);
  if (CAMPO.luzes && CAMPO.luzes.chao) CAMPO.luzes.chao.visible = false;
  const I = ILHA, cx = (I.x0 + I.x1) / 2, cz = (I.z0 + I.z1) / 2, forma = formaDaIlha();
  // ---- Laje da ilha: gramado em cima, borda de metal escuro ----
  const geoLaje = new T.ExtrudeGeometry(forma, { depth: I.esp, bevelEnabled: false, curveSegments: 12 }).rotateX(Math.PI / 2);   // topo em y = 0, desce até -esp
  const topo = pisoNoturno(new T.MeshStandardMaterial({ color: 0x475f33, roughness: 0.95 }));
  pisoRealista(topo, { escala: 1, manchas: 0.42 });   // gramado com manchas (acabamento de cinema)
  const lado = new T.MeshStandardMaterial({ color: 0x262d39, roughness: 0.4, metalness: 0.55, envMap: CAMPO.ambiente, envMapIntensity: 0.8 });   // usado nas pontes
  const penhasco = materialDeRocha({ topo: 0, altura: 100 });   // a lateral da ilha é terra e rocha, não metal
  const laje = new T.Mesh(geoLaje, [topo, penhasco]); laje.position.y = -0.03; laje.receiveShadow = true; g.add(laje);
  // contornos acesos (alto e baixo da borda)
  const contorno = (y, cor, esp, forca) => { const tubo = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(contornoParaDentro(260, -0.02, y), true), 520, esp, 6, true), luzMat(cor, forca)); g.add(tubo); };
  contorno(-0.3, COR3D.laranja, 0.07, 1.3);   /* um filete fino de luz na beira (o resto da borda é rocha) */
  // ---- O nome gravado na borda, dos quatro lados (fora das pontes e das cachoeiras) ----
  const texNome = texturaCanvas(4096, 256, (q, w, h) => {
    q.fillStyle = '#121822'; q.fillRect(0, 0, w, h);
    q.fillStyle = '#ff8a3d'; q.fillRect(0, 10, w, 6); q.fillRect(0, h - 16, w, 6);
    // marca: quadrado laranja com o R
    const lx = w * 0.17; q.strokeStyle = '#ff8a3d'; q.lineWidth = 10; q.strokeRect(lx, h * 0.2, h * 0.6, h * 0.6);
    q.fillStyle = '#ff8a3d'; q.font = '900 130px Arial, sans-serif'; q.textAlign = 'center'; q.textBaseline = 'middle'; q.fillText('R', lx + h * 0.3, h * 0.53);
    q.textAlign = 'left'; q.fillStyle = '#ffffff'; q.font = '800 150px Arial, sans-serif'; const x1 = lx + h * 0.6 + 70; q.fillText('REAL FORTE', x1, h * 0.53);
    const x2 = x1 + q.measureText('REAL FORTE').width + 60; q.fillStyle = '#ff8a3d'; q.beginPath(); q.arc(x2, h * 0.5, 14, 0, Math.PI * 2); q.fill();
    q.fillStyle = '#ffc89e'; q.font = '500 110px Arial, sans-serif'; q.fillText('CONSULTING CITY', x2 + 60, h * 0.55);
    // traços de circuito nas pontas
    q.strokeStyle = 'rgba(56,214,245,0.8)'; q.lineWidth = 5; [[20, lx - 40], [w - lx + 40, w - 20]].forEach(([a, b]) => { q.beginPath(); q.moveTo(a, h * 0.5); q.lineTo(b, h * 0.5); q.stroke(); for (let x = a; x < b; x += 90) { q.beginPath(); q.arc(x, h * 0.5, 9, 0, Math.PI * 2); q.stroke(); } });
  });
  texNome.anisotropy = 8;
  const mNome = new T.MeshBasicMaterial({ map: texNome, toneMapped: false });
  const placaW = 80, placaH = 5;
  [[-60, I.z1 + 0.05, 0], [60, I.z0 - 0.05, Math.PI], [I.x1 + 0.05, -50, Math.PI / 2], [I.x0 - 0.05, -50, -Math.PI / 2]].forEach(([x, z, rot]) => {
    const pl = new T.Mesh(G3.placa, mNome); pl.scale.set(placaW, placaH, 1); pl.position.set(x, -I.esp / 2 - 0.1, z); pl.rotation.y = rot; g.add(pl);
  });
  // ---- Rocha por baixo (ilha flutuante), com cores de terra que escurecem para baixo ----
  const geoR = geometriaDeRocha();   // alta resolução, com saliências, sulcos e camadas (acabamento de cinema)
  const matRocha = materialDeRocha({ topo: 47.5, altura: 95 });
  const rocha = new T.Mesh(geoR, matRocha); rocha.scale.set(128, 95, 128); rocha.position.set(cx, -I.esp - 95 / 2 + 0.6, cz); rocha.receiveShadow = true; g.add(rocha);
  estalactites(g, cx, cz, materialDeRocha({ topo: -I.esp, altura: 95, relevo: 0.6 }), -I.esp);
  // cristais acesos encravados na rocha (ciano e lilás)
  { const s1 = sorteio('cristais-rf'), m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), sc = new T.Vector3(), p = new T.Vector3(), geoC = new T.OctahedronGeometry(1, 0);
    const im = new T.InstancedMesh(geoC, luzMat(0x38d6f5, 1.25), 34), im2 = new T.InstancedMesh(geoC, luzMat(0xb478ff, 1.1), 10);
    const colocar = (mesh, k) => { const h = 0.05 + s1() * 0.85, a = s1() * Math.PI * 2, raio = raioDaRocha(a, h); p.set(cx + Math.cos(a) * raio, -I.esp - h * 95, cz + Math.sin(a) * raio); e.set(s1() - 0.5, a, (s1() - 0.5) * 1.4); q.setFromEuler(e); const t = 0.5 + s1() * 1.3; sc.set(t * 0.45, t * 1.6, t * 0.45); mesh.setMatrixAt(k, m4.compose(p, q, sc)); };
    for (let k = 0; k < 34; k++) colocar(im, k); for (let k = 0; k < 10; k++) colocar(im2, k); g.add(im, im2); }
  // trepadeiras penduradas da borda
  { const s2 = sorteio('vinhas-rf'), pts = contornoParaDentro(420, 0.6, -I.esp + 0.2).filter((_, k) => sorteio('vinha' + k)() < 0.35), im = new T.InstancedMesh(G3.cone, mat(0x283d22, { roughness: 0.95 }), pts.length), m4 = new T.Matrix4(), q = new T.Quaternion().setFromEuler(new T.Euler(Math.PI, 0, 0));
    pts.forEach((pp, k) => { const h = 1.5 + Math.pow(s2(), 2.2) * 16; im.setMatrixAt(k, m4.compose(pp, q, new T.Vector3(0.12 + s2() * 0.22, h * 0.7, 0.12 + s2() * 0.22))); }); g.add(im); }
  // ---- Anéis de luz em volta da ilha (por baixo da borda) ----
  const anel = new T.Mesh(new T.TorusGeometry(176, 0.32, 10, 260), luzMat(COR3D.laranja, 1.25)); anel.rotation.x = Math.PI / 2; anel.position.set(cx, -I.esp - 14, cz); g.add(anel);
  const anel2 = new T.Mesh(new T.TorusGeometry(184, 0.16, 8, 260), luzMat(0x38d6f5, 1.2)); anel2.rotation.x = Math.PI / 2; anel2.position.set(cx, -I.esp - 18, cz); g.add(anel2);
  { const K = novoLote(), mm = mat(0x3a414c, { roughness: 0.4, metalness: 0.7 });   // braços que seguram o anel
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + Math.PI / 8, r0 = raioDaRocha(a, 0.15), x = cx + Math.cos(a) * (r0 + 176) / 2, z = cz + Math.sin(a) * (r0 + 176) / 2; K.add(G3.caixaC, mm, x, -I.esp - 14, z, 176 - r0 + 2, 0.7, 0.9, 0, -a, 0, false); }
    K.montar(g, []); }
  // ---- Propulsores: quatro nos cantos e um grande na ponta da rocha ----
  const chamas = [], geoChama = new T.ConeGeometry(1, 1, 24, 1, true).rotateX(Math.PI).translate(0, -0.5, 0);   // boca larga em cima, ponta para baixo
  const r45 = I.raio * (1 - Math.SQRT1_2);
  [[I.x0 + r45 + 10, I.z0 + r45 + 10], [I.x1 - r45 - 10, I.z0 + r45 + 10], [I.x0 + r45 + 10, I.z1 - r45 - 10], [I.x1 - r45 - 10, I.z1 - r45 - 10], [cx, cz]].forEach(([x, z], k) => {
    const grande = k === 4, e = grande ? 9 : 4.5, y0 = grande ? -I.esp - 96 : -I.esp - 5;
    const base = new T.Mesh(G3.cil, mat(0x3a414c, { roughness: 0.4, metalness: 0.7 })); base.scale.set(e, grande ? 8 : 5, e); base.position.set(x, y0, z); g.add(base);
    const ar = new T.Mesh(new T.TorusGeometry(e * 1.08, 0.45, 8, 40), luzMat(COR3D.laranja, 1.8)); ar.rotation.x = Math.PI / 2; ar.position.set(x, y0 - 0.2, z); g.add(ar);
    const chama = new T.Mesh(geoChama, new T.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }));
    chama.scale.set(e * 0.85, grande ? 42 : 20, e * 0.85); chama.position.set(x, y0, z); g.add(chama);
    const miolo = new T.Mesh(geoChama, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, blending: T.AdditiveBlending, depthWrite: false, fog: false }));
    miolo.scale.set(e * 0.4, grande ? 18 : 9, e * 0.4); miolo.position.set(x, y0, z); g.add(miolo);
    chamas.push({ chama, miolo, alto: grande ? 42 : 20 });
  });
  // ---- Cachoeiras caindo da borda e sumindo no espaço ----
  const texAgua = texturaCanvas(128, 512, (q, w, h) => {
    for (let x = 0; x < w; x += 2) { q.fillStyle = `rgba(220,240,255,${0.25 + Math.random() * 0.6})`; q.fillRect(x, 0, 1 + Math.random() * 2, h); }
  });
  texAgua.wrapS = T.RepeatWrapping; texAgua.wrapT = T.RepeatWrapping;
  // degradê que apaga a água embaixo (a cachoeira some no espaço): vai num segundo mapa, que não corre
  const texSome = texturaCanvas(8, 256, (q, w, h) => { const gr = q.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#000'); gr.addColorStop(0.45, '#333'); gr.addColorStop(1, '#fff'); q.fillStyle = gr; q.fillRect(0, 0, w, h); });
  const brilhoTex = texturaCanvas(256, 256, (q, w) => { const gr = q.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); q.fillStyle = gr; q.fillRect(0, 0, w, w); });
  const cachoeiras = [];
  [[75, I.z1, 0], [-85, I.z0, Math.PI], [I.x1, 90, Math.PI / 2], [I.x0, 95, -Math.PI / 2], [I.x1, -105, Math.PI / 2]].forEach(([x, z, rot], k) => {
    const tx = texAgua.clone(); tx.needsUpdate = true; tx.repeat.set(1, 0.6);
    const m = new T.MeshBasicMaterial({ map: tx, alphaMap: texSome, transparent: true, opacity: 0.9, depthWrite: false, side: T.DoubleSide, fog: false, toneMapped: false });
    const w = 5 + (k % 2) * 3, h = 80, ox = Math.sin(rot), oz = Math.cos(rot);
    const cq = new T.Mesh(G3.placa, m); cq.scale.set(w, h, 1); cq.rotation.y = rot; cq.position.set(x + ox * 1.4, -h / 2 + 0.1, z + oz * 1.4); g.add(cq); cachoeiras.push(tx);
    const nevoa = new T.Sprite(new T.SpriteMaterial({ map: brilhoTex, color: 0xcfeaff, transparent: true, opacity: 0.35, depthWrite: false, fog: false })); nevoa.scale.set(w * 3, w * 2, 1); nevoa.position.set(x + ox * 2, -I.esp - 6, z + oz * 2); g.add(nevoa);
    // canal de água que corre no gramado até a borda
    const canal = new T.Mesh(G3.caixa, MP.agua); canal.scale.set(w, 0.06, 6); canal.rotation.y = rot; canal.position.set(x - ox * 2.6, -0.02, z - oz * 2.6); g.add(canal);
  });
  // ---- Passeio da borda: pedra, faixa de luz, guarda-corpo de vidro, postes e o anel de árvores ----
  { const K = novoLote(), s3 = sorteio('borda-rf'), pedra = V_pedra();
    const passeio = new T.Mesh(faixaNoChao(contornoParaDentro(240, 0, 0), [1.0, 0.005], [4.6, 0.005]), pedra); passeio.receiveShadow = true; g.add(passeio);
    g.add(new T.Mesh(faixaNoChao(contornoParaDentro(240, 0, 0), [4.6, 0.012], [4.8, 0.012]), luzMat(0x38d6f5, 1.2)));
    const vidro = new T.MeshStandardMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.4, depthWrite: false, side: T.DoubleSide });
    const linhaVidro = contornoParaDentro(240, 0.6, 0);
    g.add(new T.Mesh(paredeAoLongo(linhaVidro, 0, 1.0), vidro));
    g.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(linhaVidro.slice(0, -1).map((v) => new T.Vector3(v.x, 1.02, v.z)), true), 600, 0.05, 6, true), mat(0xdfe3e8, { metalness: 0.6, roughness: 0.3 })));
    contornoParaDentro(70, 5.6, 0).slice(0, -1).forEach((p) => { K.add(G3.cil, MP.navy, p.x, 0, p.z, 0.06, 2.8, 0.06); K.add(G3.bola, MP.lampadaQuente, p.x, 2.8, p.z, 0.18, 0.18, 0.18, 0, 0, 0, false); });
    const livre = (x, z) => dentroDaIlha(x, z, 7) && !(x > -102 && x < 102 && z > -96 && z < 108) && !P.ruas.some(([a, b, c, d]) => x > a - 3 && x < b + 3 && z > c - 3 && z < d + 3);
    for (let k = 0; k < 1700; k++) {
      const x = I.x0 + s3() * (I.x1 - I.x0), z = I.z0 + s3() * (I.z1 - I.z0); if (!livre(x, z)) continue;
      const e = 0.9 + s3() * 1.0; K.add(G3.cil, MP.tronco, x, 0, z, 0.08 * e, 0.8 * e, 0.08 * e); K.add(G3.copa, s3() < 0.5 ? MP.copa : MP.copa2, x, 1.25 * e, z, 0.7 * e, 0.85 * e, 0.7 * e, 0, k, 0);
      if (s3() < 0.2) K.add(G3.bola, s3() < 0.4 ? MP.laranjaFraco : MP.cianoFraco, x + 1.2, 0.3, z + 0.7, 0.3, 0.3, 0.3, 0, 0, 0, false);   // flores acesas
    }
    K.montar(g, []);
  }
  // ---- Pontes de entrada terminando em portais ----
  const portais = [];
  P.entradas.forEach((e) => {
    const [fx, fz] = e.fora, emX = Math.abs(fx) > 140;
    const grupo = new T.Group(); grupo.position.set(fx, 0, fz); grupo.rotation.y = emX ? Math.PI / 2 : 0; g.add(grupo);
    const ar = new T.Mesh(new T.TorusGeometry(5.2, 0.34, 12, 72), luzMat(0x38d6f5, 1.9)); ar.position.y = 5.3; grupo.add(ar);
    const ar2 = new T.Mesh(new T.TorusGeometry(5.9, 0.14, 8, 72, Math.PI * 1.6), luzMat(COR3D.laranja, 1.7)); ar2.position.y = 5.3; grupo.add(ar2);
    const veu = new T.Mesh(new T.CircleGeometry(5.0, 48), new T.MeshBasicMaterial({ color: 0x5fb8ff, transparent: true, opacity: 0.25, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false })); veu.position.y = 5.3; grupo.add(veu);
    const brilho = new T.Sprite(new T.SpriteMaterial({ map: brilhoTex, color: 0x5fb8ff, transparent: true, opacity: 0.5, blending: T.AdditiveBlending, depthWrite: false, fog: false })); brilho.scale.set(16, 16, 1); brilho.position.y = 5.3; grupo.add(brilho);
    portais.push({ ar, ar2, veu });
    // a ponte por baixo do trecho que sai da ilha, com filete laranja dos dois lados
    const borda = emX ? (fx > 0 ? I.x1 : I.x0) : (fz > 0 ? I.z1 : I.z0), ponta = emX ? fx : fz, L = Math.abs(ponta - borda) + 3, meio = (ponta + borda) / 2;
    const viga = new T.Mesh(G3.caixa, lado); viga.scale.set(emX ? L : 5.4, 1.4, emX ? 5.4 : L); viga.position.set(emX ? meio : fx, -1.45, emX ? fz : meio); g.add(viga);
    [-1, 1].forEach((sd) => { const l = new T.Mesh(G3.caixa, luzMat(COR3D.laranja, 1.5)); l.scale.set(emX ? L : 0.1, 0.1, emX ? 0.1 : L); l.position.set(emX ? meio : fx + sd * 2.75, -0.1, emX ? fz + sd * 2.75 : meio); g.add(l); });
  });
  // ---- Ilhotas flutuantes e o cinturão de asteroides ----
  const ilhotas = [];
  { const s4 = sorteio('ilhotas-rf');
    for (let k = 0; k < 8; k++) {
      const gg = new T.Group(), a = k / 8 * Math.PI * 2 + 0.3, rr = 205 + s4() * 45; gg.position.set(Math.cos(a) * rr, -10 + s4() * 34, cz + Math.sin(a) * rr); g.add(gg);
      const e = 5 + s4() * 7, ro = new T.Mesh(geoR, matRocha); ro.scale.set(e / 1.2, e * 1.5, e / 1.2); ro.position.y = -e * 0.75; gg.add(ro);
      const tp = new T.Mesh(G3.cil, mat(0x7fae6a, { roughness: 0.9 })); tp.scale.set(e * 0.8, 0.3, e * 0.8); tp.position.y = -0.3; gg.add(tp);
      if (k % 2) { const tr = new T.Mesh(G3.cil, MP.tronco); tr.scale.set(0.3, 3, 0.3); gg.add(tr); const cp = new T.Mesh(G3.copa, MP.copa); cp.scale.set(2.4, 2.6, 2.4); cp.position.y = 4; gg.add(cp); }
      else { const cr = new T.Mesh(new T.OctahedronGeometry(1, 0), luzMat(k % 4 ? 0x38d6f5 : 0xb478ff, 1.7)); cr.scale.set(1.2, 3.4, 1.2); cr.position.y = 3; gg.add(cr); }
      ilhotas.push({ gg, y0: gg.position.y, f: s4() * 6 });
    }
    const n = 480, im = new T.InstancedMesh(geometriaDePedra(), materialDeRocha({ topo: 0, altura: 30, relevo: 0.5 }), n), m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler();
    for (let k = 0; k < n; k++) { const a = s4() * Math.PI * 2, rr = 265 + s4() * 80, sc = 0.6 + s4() ** 3 * 6; e.set(s4() * 3, s4() * 3, s4() * 3); q.setFromEuler(e); im.setMatrixAt(k, m4.compose(new T.Vector3(Math.cos(a) * rr, -45 + (s4() - 0.5) * 30, Math.sin(a) * rr), q, new T.Vector3(sc, sc * (0.6 + s4() * 0.6), sc))); }
    const cinturao = new T.Group(); cinturao.position.z = cz; cinturao.add(im); g.add(cinturao); CAMPO.cinturao = cinturao;
  }
  // ---- Luz de baixo (azulada) para a rocha e o fundo das peças não ficarem pretos ----
  const luzBaixo = new T.DirectionalLight(0xa9bddb, 0.85); luzBaixo.position.set(-40, -120, 60); CAMPO.cena.add(luzBaixo);
  // ---- Céu do espaço: acompanha a câmera e fica sempre ao fundo ----
  const ceu = new T.Group(); CAMPO.cena.add(ceu); CAMPO.ceuEspaco = ceu;
  const fundo = (m) => { m.depthWrite = false; m.fog = false; return m; };
  { const n = 6500, pos = new Float32Array(n * 3), cor = new Float32Array(n * 3), s5 = sorteio('estrelas-rf'), c = new T.Color();
    for (let k = 0; k < n; k++) {
      let u = s5() * 2 - 1; const a = s5() * Math.PI * 2; if (k % 3 === 0) u *= 0.12;   // um terço das estrelas na faixa da via láctea
      const sq = Math.sqrt(1 - u * u), v = new T.Vector3(Math.cos(a) * sq, u, Math.sin(a) * sq).applyAxisAngle(new T.Vector3(1, 0, 0), 0.5).multiplyScalar(560);
      if (v.y < -0.2 * 560) v.y = -v.y;   /* abaixo do horizonte fica o planeta: a estrela vai para o céu */
      pos.set([v.x, v.y, v.z], k * 3);
      c.setHSL(0.55 + s5() * 0.12, 0.45, 0.72 + s5() * 0.28); if (s5() < 0.1) c.setHSL(0.08, 0.8, 0.82); cor.set([c.r, c.g, c.b], k * 3);
    }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('color', new T.BufferAttribute(cor, 3));
    const est = new T.Points(geo, fundo(new T.PointsMaterial({ size: 1.7, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.95 }))); est.renderOrder = -10; ceu.add(est);
    const p2 = new Float32Array(320 * 3); for (let k = 0; k < 320; k++) { const u = s5() * 1.2 - 0.2, a = s5() * Math.PI * 2, sq = Math.sqrt(1 - u * u); p2.set([Math.cos(a) * sq * 555, u * 555, Math.sin(a) * sq * 555], k * 3); }
    const geo2 = new T.BufferGeometry(); geo2.setAttribute('position', new T.BufferAttribute(p2, 3));
    const grandes = new T.Points(geo2, fundo(new T.PointsMaterial({ size: 3.4, sizeAttenuation: false, color: 0xffffff, transparent: true, opacity: 0.9 }))); grandes.renderOrder = -10; ceu.add(grandes); CAMPO.estrelasGrandes = grandes; }
  // nebulosas coloridas
  [[0x6a3cff, -300, 220, -380, 560, 0.3], [0xff5fa8, 380, 160, -320, 460, 0.22], [0x2fb8ff, 60, -160, 500, 640, 0.2], [0xff9a3d, -420, -60, 280, 440, 0.16], [0x7a5cff, 200, 360, 300, 520, 0.22], [0x38d6f5, -150, -300, -200, 600, 0.18]].forEach(([cor, x, y, z, s, op]) => {
    if (y < 0) return;   /* embaixo agora é o planeta */
    const sp = new T.Sprite(fundo(new T.SpriteMaterial({ map: brilhoTex, color: cor, transparent: true, opacity: op * 0.35, blending: T.AdditiveBlending }))); sp.scale.set(s, s * 0.6, 1); sp.position.set(x, y, z).setLength(540); sp.renderOrder = -9; ceu.add(sp); });
  // planeta gigante com anel
  const texGas = texturaCanvas(512, 256, (q, w, h) => { for (let y = 0; y < h; y++) { const t = y / h, b = Math.sin(t * 40) * 0.5 + Math.sin(t * 13 + 1) * 0.5; q.fillStyle = `hsl(${26 + b * 10}, ${55 + b * 15}%, ${46 + b * 14}%)`; q.fillRect(0, y, w, 1); } q.fillStyle = 'rgba(170,60,30,0.6)'; q.beginPath(); q.ellipse(w * 0.62, h * 0.62, 40, 16, 0, 0, Math.PI * 2); q.fill(); });
  const gigante = new T.Group(); gigante.position.set(-330, 160, -380).setLength(470); ceu.add(gigante);
  const pg = new T.Mesh(new T.SphereGeometry(80, 64, 32), new T.MeshStandardMaterial({ map: texGas, roughness: 0.9, fog: false, emissive: 0x2a1406, emissiveIntensity: 0.6 })); gigante.add(pg);
  const texAnel = texturaCanvas(512, 8, (q, w) => { for (let x = 0; x < w; x++) { const a = (0.15 + 0.6 * Math.abs(Math.sin(x * 0.09))) * (x > 60 ? 1 : 0); q.fillStyle = `rgba(230,200,160,${a})`; q.fillRect(x, 0, 1, 8); } });
  const anelG = new T.Mesh(new T.RingGeometry(105, 165, 128, 1), new T.MeshBasicMaterial({ map: texAnel, transparent: true, side: T.DoubleSide, toneMapped: false, fog: false, depthWrite: false }));
  { const uv = anelG.geometry.attributes.uv, pos = anelG.geometry.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, (Math.hypot(pos.getX(i), pos.getY(i)) - 105) / 60, 0.5); }
  anelG.rotation.set(Math.PI / 2 - 0.35, 0.25, 0); gigante.add(anelG); CAMPO.planetaGigante = pg;
  // planeta azul com atmosfera e uma lua
  const texAzul = texturaCanvas(512, 256, (q, w, h) => { q.fillStyle = '#1d5fa8'; q.fillRect(0, 0, w, h); const s6 = sorteio('azul-rf'); for (let k = 0; k < 60; k++) { q.fillStyle = `rgba(${60 + s6() * 40},${140 + s6() * 40},${80 + s6() * 30},0.85)`; q.beginPath(); q.ellipse(s6() * w, h * 0.2 + s6() * h * 0.6, 10 + s6() * 40, 6 + s6() * 20, s6() * 3, 0, Math.PI * 2); q.fill(); } for (let k = 0; k < 80; k++) { q.fillStyle = 'rgba(255,255,255,0.45)'; q.fillRect(s6() * w, s6() * h, 20 + s6() * 60, 2 + s6() * 4); } });
  const azul = new T.Group(); azul.position.set(360, -40, 320).setLength(480); ceu.add(azul);
  const pa = new T.Mesh(new T.SphereGeometry(55, 64, 32), new T.MeshStandardMaterial({ map: texAzul, roughness: 0.7, fog: false, emissive: 0x0a2244, emissiveIntensity: 0.5 })); azul.add(pa); CAMPO.planetaAzul = pa;
  const atm = new T.Sprite(fundo(new T.SpriteMaterial({ map: brilhoTex, color: 0x5fb8ff, transparent: true, opacity: 0.6, blending: T.AdditiveBlending }))); atm.scale.set(175, 175, 1); azul.add(atm);
  const lua = new T.Mesh(new T.SphereGeometry(13, 32, 16), new T.MeshStandardMaterial({ color: 0xbab6ae, roughness: 1, fog: false, emissive: 0x222222 })); lua.position.set(300, 140, 400).setLength(500); ceu.add(lua);
  azul.visible = false;   /* o planeta azul agora é o grande, lá embaixo (shader do céu) */
  montarCeuDeCinema(ceu);
  nuvensDaIlha(g, cx, cz);
  // estação espacial em anel (gira devagar)
  const estacao = new T.Group(); estacao.position.set(240, 260, -330).setLength(500); ceu.add(estacao);
  { const mm = new T.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.4, metalness: 0.6, fog: false }); estacao.add(new T.Mesh(new T.TorusGeometry(24, 2.0, 10, 64), mm));
    for (let k = 0; k < 4; k++) { const sp = new T.Mesh(G3.caixaC, mm); sp.scale.set(48, 0.8, 0.8); sp.rotation.z = k * Math.PI / 4; estacao.add(sp); }
    estacao.add(new T.Mesh(new T.SphereGeometry(5, 24, 12), mm));
    const painel = new T.MeshStandardMaterial({ color: 0x1d3a7a, roughness: 0.3, metalness: 0.6, emissive: 0x0d1d44, fog: false }); [-1, 1].forEach((s) => { const pn = new T.Mesh(G3.caixaC, painel); pn.scale.set(16, 0.3, 7); pn.position.set(0, 0, s * 12); pn.rotation.x = Math.PI / 2; estacao.add(pn); });
    for (let k = 0; k < 12; k++) { const l = new T.Mesh(new T.SphereGeometry(0.9, 8, 6), fundo(luzMat(k % 2 ? 0x38d6f5 : COR3D.laranja, 2).clone())); const a = k / 12 * Math.PI * 2; l.position.set(Math.cos(a) * 24, Math.sin(a) * 24, 2.2); estacao.add(l); }
    estacao.rotation.set(0.9, 0.4, 0); CAMPO.estacaoEspacial = estacao; }
  // estrela cadente (uma só, reaproveitada)
  const cadente = new T.Mesh(G3.cilDeitado, fundo(new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: T.AdditiveBlending }))); cadente.scale.set(40, 0.35, 0.35); ceu.add(cadente);
  filetesDasRuas(g);
  CAMPO.espacoAnim = { chamas, cachoeiras, portais, ilhotas, anel, anel2, cadente, proxCadente: 4 };
}
// Holograma gigante da torre da Real Forte flutuando sobre o espelho d'água da Praça das Conexões
function hologramaDaTorre(g, x, z) {
  const T = THREE, H = new T.Group(); H.position.set(x, 4.4, z); g.add(H);
  const ciano = 0x5fe0ff, aditivo = { transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false };
  const linhaM = new T.LineBasicMaterial(Object.assign({ color: ciano, opacity: 0.75 }, aditivo));
  const faceM = new T.MeshBasicMaterial(Object.assign({ color: 0x1f7fc0, opacity: 0.05, side: T.DoubleSide }, aditivo));
  const laranjaM = new T.MeshBasicMaterial(Object.assign({ color: 0xff9a52, opacity: 0.7 }, aditivo));
  const ALT = 15, L = 3.0;
  const peca = (geo) => { H.add(new T.Mesh(geo, faceM)); H.add(new T.LineSegments(new T.EdgesGeometry(geo), linhaM)); };
  // pódio, corpo da torre, coroa e antena (como a sede de verdade)
  peca(new T.BoxGeometry(L * 1.7, 1.4, L * 1.7).translate(0, 0.7, 0));
  peca(new T.BoxGeometry(L, ALT, L).translate(0, ALT / 2, 0));
  peca(new T.BoxGeometry(L * 0.75, 1.6, L * 0.75).translate(0, ALT + 0.8, 0));
  const ant = new T.Mesh(G3.cil, laranjaM); ant.scale.set(0.06, 3.2, 0.06); ant.position.y = ALT + 1.6; H.add(ant);
  const pontaAnt = new T.Mesh(G3.bola, laranjaM); pontaAnt.scale.setScalar(0.22); pontaAnt.position.y = ALT + 4.8; H.add(pontaAnt);
  // anéis laranja a cada andar e linhas de janela nas quatro faces
  const anelAndar = new T.EdgesGeometry(new T.BoxGeometry(L + 0.12, 0.02, L + 0.12)), linhaLaranja = new T.LineBasicMaterial(Object.assign({ color: 0xff9a52, opacity: 0.9 }, aditivo));   /* só o contorno: placa cheia somada vira branco */
  for (let y = 2.4; y < ALT; y += 1.2) { const an = new T.LineSegments(anelAndar, linhaLaranja); an.position.y = y; H.add(an); }
  const jan = []; for (let k = -2; k <= 2; k++) { const a = k * 0.5; [[a, L / 2 + 0.01], [a, -L / 2 - 0.01]].forEach(([u, v]) => { jan.push(u, 1.6, v, u, ALT - 0.3, v, v, 1.6, u, v, ALT - 0.3, u); }); }
  const gj = new T.BufferGeometry(); gj.setAttribute('position', new T.Float32BufferAttribute(jan, 3)); H.add(new T.LineSegments(gj, new T.LineBasicMaterial(Object.assign({ color: ciano, opacity: 0.35 }, aditivo))));
  // logo no alto, nas quatro faces
  if (typeof LOGO !== 'undefined' && LOGO.claro) {
    const tl = new T.TextureLoader().load(LOGO.claro); tl.encoding = T.sRGBEncoding; const ml = new T.MeshBasicMaterial(Object.assign({ map: tl, opacity: 1 }, aditivo));
    const pw = L * 0.9, ph = pw / (LOGO.proporcao || 3.6);
    [0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach((r) => { const pl = new T.Mesh(G3.placa, ml); pl.scale.set(pw, ph, 1); pl.position.set(Math.sin(r) * (L / 2 + 0.04), ALT - 1.0, Math.cos(r) * (L / 2 + 0.04)); pl.rotation.y = r; H.add(pl); });
  }
  // varredura (plano que sobe), partículas em volta, halos e o feixe do projetor
  const varre = new T.Mesh(new T.PlaneGeometry(L + 0.9, L + 0.9).rotateX(-Math.PI / 2), new T.MeshBasicMaterial(Object.assign({ color: ciano, opacity: 0.18, side: T.DoubleSide }, aditivo))); H.add(varre);
  const nP = 320, pp = new Float32Array(nP * 3), s = sorteio('holo-rf'); for (let k = 0; k < nP; k++) { const a = s() * Math.PI * 2, rr = 2.8 + s() * 1.8; pp.set([Math.cos(a) * rr, s() * (ALT + 3), Math.sin(a) * rr], k * 3); }
  const gp = new T.BufferGeometry(); gp.setAttribute('position', new T.BufferAttribute(pp, 3)); const part = new T.Points(gp, new T.PointsMaterial(Object.assign({ color: 0x9fefff, size: 0.14, opacity: 0.85 }, aditivo))); H.add(part);
  const feixe = new T.Mesh(new T.CylinderGeometry(3.0, 0.9, 4.0, 40, 1, true).translate(0, -2.0, 0), new T.MeshBasicMaterial(Object.assign({ color: 0x2fa8e0, opacity: 0.09, side: T.DoubleSide }, aditivo))); H.add(feixe);
  const halo = new T.Mesh(new T.TorusGeometry(3.8, 0.06, 8, 90), laranjaM); halo.rotation.x = Math.PI / 2; H.add(halo);
  const halo2 = new T.Mesh(new T.TorusGeometry(4.4, 0.04, 8, 90, Math.PI * 1.5), new T.MeshBasicMaterial(Object.assign({ color: ciano, opacity: 0.8 }, aditivo))); halo2.rotation.x = Math.PI / 2; halo2.position.y = 0.4; H.add(halo2);
  const brilho = new T.Sprite(new T.SpriteMaterial(Object.assign({ map: texturaCanvas(128, 128, (q, w) => { const gr = q.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); q.fillStyle = gr; q.fillRect(0, 0, w, w); }), color: ciano, opacity: 0.1 }, aditivo))); brilho.scale.set(14, 24, 1); brilho.position.y = ALT / 2; H.add(brilho);
  // projetor fixo no meio do espelho d'água (não gira com a torre)
  const proj = new T.Group(); proj.position.set(x, PLANO.ALT + 0.34, z); g.add(proj);
  const disco = new T.Mesh(G3.cil, mat(0x2a313c, { metalness: 0.7, roughness: 0.3 })); disco.scale.set(1.5, 0.25, 1.5); proj.add(disco);
  const lente = new T.Mesh(G3.cil, luzMat(ciano, 2)); lente.scale.set(1.0, 0.27, 1.0); proj.add(lente);
  return { H, varre, part, halo, halo2, faceM, linhaM, ALT, y0: 4.4 };
}
function passoEspaco(t) {
  const A = CAMPO.espacoAnim; if (!A) return;
  if (CAMPO.ceuEspaco && CAMPO.camera) CAMPO.ceuEspaco.position.copy(CAMPO.camera.position);
  passoCeuDeCinema(t); passoNuvensDaIlha(t);
  if (CAMPO.luzes && CAMPO.luzes.chao && CAMPO.luzes.chao.visible) CAMPO.luzes.chao.visible = false;   /* no espaço não há chão embaixo da ilha */
  A.chamas.forEach((c, k) => { const s = 1 + Math.sin(t * 9 + k) * 0.06 + Math.sin(t * 23 + k * 2) * 0.04; c.chama.scale.y = c.alto * s; c.miolo.scale.y = c.alto * 0.45 * (2 - s); c.chama.material.opacity = 0.45 + Math.sin(t * 13 + k) * 0.08; });
  A.cachoeiras.forEach((tx, k) => { tx.offset.y = (t * (0.5 + k * 0.05)) % 1; });
  A.portais.forEach((p, k) => { p.ar.rotation.z = t * 0.6 + k; p.ar2.rotation.z = -t * 0.45 + k; p.veu.material.opacity = 0.18 + Math.sin(t * 2 + k) * 0.08; });
  A.ilhotas.forEach((i) => { i.gg.position.y = i.y0 + Math.sin(t * 0.4 + i.f) * 2.2; i.gg.rotation.y = t * 0.05 + i.f; });
  A.anel.rotation.z = t * 0.02; A.anel2.rotation.z = -t * 0.03;
  if (CAMPO.cinturao) CAMPO.cinturao.rotation.y = t * 0.004;
  if (CAMPO.planetaGigante) CAMPO.planetaGigante.rotation.y = t * 0.01;
  if (CAMPO.planetaAzul) CAMPO.planetaAzul.rotation.y = t * 0.02;
  if (CAMPO.estacaoEspacial) CAMPO.estacaoEspacial.rotation.z = t * 0.05;
  if (CAMPO.estrelasGrandes) CAMPO.estrelasGrandes.material.opacity = 0.7 + Math.sin(t * 1.7) * 0.2;
  // estrela cadente de vez em quando
  const c = A.cadente;
  if (t > A.proxCadente) {
    A.proxCadente = t + 6 + Math.random() * 10; A.cadIni = t; const a = Math.random() * Math.PI * 2;
    A.cadPos = new THREE.Vector3(Math.cos(a) * 380, 160 + Math.random() * 180, Math.sin(a) * 380); A.cadDir = new THREE.Vector3(-Math.sin(a), -0.35, Math.cos(a)).normalize();
    c.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), A.cadDir);
  }
  if (A.cadIni != null) { const u = (t - A.cadIni) / 1.2; if (u < 1) { c.position.copy(A.cadPos).addScaledVector(A.cadDir, u * 260); c.material.opacity = Math.sin(u * Math.PI) * 0.9; } else c.material.opacity = 0; }
  // holograma da torre: gira, flutua, varre e pisca de leve
  const Hg = PLANO.holograma; if (Hg) {
    Hg.H.rotation.y = t * 0.25; Hg.H.position.y = Hg.y0 + Math.sin(t * 0.8) * 0.35;
    Hg.varre.position.y = (t * 3) % Hg.ALT; Hg.part.rotation.y = -t * 0.4; Hg.halo.position.y = (Math.sin(t * 0.6) * 0.5 + 0.5) * Hg.ALT; Hg.halo2.rotation.z = t * 0.8;
    const fl = 0.92 + Math.sin(t * 31) * 0.04 + (Math.sin(t * 3.7) > 0.985 ? -0.35 : 0); Hg.linhaM.opacity = 0.75 * fl; Hg.faceM.opacity = 0.05 * fl;
  }
}
// Ruas mais vivas: filetes de LED nas bordas de todas as ruas (ciano) e nas avenidas de entrada (laranja)
function filetesDasRuas(g) {
  const K = novoLote(), c1 = luzMat(0x38d6f5, 0.9).clone(), c2 = luzMat(COR3D.laranja, 1.1).clone();
  CAMPO.matsFiletes = [[c1, 0.9], [c2, 1.1]];   // de dia quase apagados; acendem à noite (acabamento de cinema)
  PLANO.ruas.forEach(([x0, x1, z0, z1]) => {
    const w = x1 - x0, d = z1 - z0, entrada = Math.max(Math.abs(x0), Math.abs(x1)) > 104 || Math.max(Math.abs(z0), Math.abs(z1)) > 106, m = entrada ? c2 : c1;
    if (w > d) [z0 + 0.12, z1 - 0.12].forEach((z) => K.add(G3.caixa, m, (x0 + x1) / 2, 0.012, z, w, 0.004, 0.07, 0, 0, 0, false));
    else [x0 + 0.12, x1 - 0.12].forEach((x) => K.add(G3.caixa, m, x, 0.012, (z0 + z1) / 2, 0.07, 0.004, d, 0, 0, 0, false));
  });
  K.montar(g, []);
}

/* ---------- Quadro a quadro do mundo ---------- */
function passoMundo(t, dt) {
  const W = CAMPO.mundo, A = CAMPO.atividade == null ? 1 : CAMPO.atividade;
  if (W) W.porIlha.forEach((objs, id) => objs.forEach((o) => { o.visible = !CAMPO.ap || CAMPO.ap.id === id; }));
  const M = CAMPO.multidao;
  if (M) passoMultidao(M, t, dt);
  if (CAMPO.passoCobertura) CAMPO.passoCobertura(t, dt);
  passoVida(t, dt); passoPlano(t, dt); passoTransito(t, dt);
  // Portas automáticas da sede: abrem quando alguém chega perto
  if (M && CAMPO.portasSede) CAMPO.portasSede.forEach((p) => {
    const perto = M.agentes.some((a) => a.visivel && Math.abs(a.x - p.c[0]) < 1.9 && Math.abs(a.z - p.c[1]) < 1.9);
    p.ab += ((perto ? 1 : 0) - p.ab) * Math.min(1, dt * 5);
    p.folhas.forEach((f, i) => { const s = i ? 1 : -1, d = s * (p.base + p.ab * p.curso); if (p.eixo === 'x') f.position.x = p.c[0] + d; else f.position.z = p.c[1] + d; });
  });
  // Portões das cidades: abertos de dia; à noite fecham e fica só a passagem de pedestre
  CAMPO.ilhas.forEach((il) => {
    if (!il.folhasPortao) return;
    il.aberturaPortao = il.aberturaPortao == null ? 1 : il.aberturaPortao;
    il.aberturaPortao += ((A > 0.5 ? 1 : 0) - il.aberturaPortao) * Math.min(1, dt * 1.5);
    il.folhasPortao.forEach((f, i) => { const s = i ? 1 : -1; f.position.x = s * (PORTAO / 2 + 0.5 + (PORTAO + 0.15 - 0.5) * il.aberturaPortao); });
  });
  // Gente fixa do hall (recepção e baristas): mexe os braços de leve
  ((CAMPO.sedePontos && CAMPO.sedePontos.fixos) || []).forEach((p, i) => { const b = p.userData.bracos; b[0].rotation.z = 0.25 + Math.sin(t * 1.3 + i) * 0.2; b[1].rotation.z = 0.5 + Math.max(0, Math.sin(t * 0.9 + i * 2)) * 0.6; });
  // Telões: os números a cada 6 s; a onda da RF Intelligence a cada 0,25 s
  const telaNoite = noiteAgora() > 0.5; if (telaNoite !== CAMPO.telaNoite) { CAMPO.telaNoite = telaNoite; CAMPO.proxGrafico = 0; }   // virou dia/noite: redesenha
  if (!CAMPO.proxGrafico || t > CAMPO.proxGrafico || CAMPO.apGrafico !== (CAMPO.ap && CAMPO.ap.id)) { CAMPO.proxGrafico = t + 6; CAMPO.apGrafico = CAMPO.ap && CAMPO.ap.id; desenharGraficos(t, false); CAMPO.proxOnda = t + 0.25; }
  else if (t > (CAMPO.proxOnda || 0)) { CAMPO.proxOnda = t + 0.25; desenharGraficos(t, true); }
  (CAMPO.barrasMesa || []).forEach((b, i) => { const v = (CAMPO.valoresMesa || [])[i] || 0.08; b.scale.y = v * (0.92 + Math.sin(t * 2 + i) * 0.08); });
}

function descartarIlha(il) {
  CAMPO.cena.remove(il.grupo); CAMPO.cena.remove(il.poca);
  if (il.rotuloPonte) il.rotuloPonte.remove();
  il.grupo.traverse((o) => { if (o.isSprite) o.material.dispose(); });
  il.descartar.forEach((x) => x && x.dispose && x.dispose());
  if (il.plaquinha) il.plaquinha.remove();
}

/* ---------- Plaquinhas (o nome, a logo e os números de cada empresa, em HTML) ---------- */
function criarPlaquinha(D) {
  const a = document.createElement('a');
  a.className = 'pq'; a.href = '#e-' + D.id; a.dataset.ilha = D.id;
  a.style.setProperty('--saude', COR_SAUDE_CSS[D.saude]);
  const logo = D.logo ? `<span class="pq-logo"><img src="${esc(D.logo)}" alt=""></span>` : `<span class="pq-logo sem">${esc(iniciaisDe(D.nome))}</span>`;
  // Anel da nota em SVG: se desenha quando a plaquinha aparece
  const volta = 2 * Math.PI * 16, pct = D.nota == null ? 0 : D.nota / 100;
  const anel = `<span class="pq-anel" title="Nota do check-up"><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" class="pq-anel-fundo"/><circle cx="20" cy="20" r="16" class="pq-anel-cor" style="--volta:${volta.toFixed(1)};--cheio:${(volta * pct).toFixed(1)}"/></svg><b>${D.nota == null ? '–' : D.nota}</b></span>`;
  const linhaSetor = (s) => `<span class="pq-setor"><i style="background:${COR_SAUDE_CSS[s.d.saude]}"></i>${esc(s.nome)}<b>${s.d.nota == null ? '–' : s.d.nota}</b></span>`;
  const numeros = [plural(D.totalSetores, 'setor', 'setores'), plural(D.gargalos, 'gargalo aberto', 'gargalos abertos'), D.oportunidades ? plural(D.oportunidades, 'oportunidade', 'oportunidades') : '', D.horas ? `${fmtHoras(D.horas)} h/mês devolvidas` : ''].filter(Boolean).join(' · ');
  a.innerHTML = `<span class="pq-scan" aria-hidden="true"></span>
    <span class="pq-linha">${logo}<span class="pq-txt"><b>${esc(D.nome)}</b><small>${esc([D.segmento, D.cidade].filter(Boolean).join(' · ') || 'Sem segmento')}</small></span>${anel}</span>
    <span class="pq-mais"><span class="pq-saude">${esc(SAUDE[D.saude].nome)}</span>${D.setores.length ? `<span class="pq-setores">${D.setores.slice(0, 6).map(linhaSetor).join('')}${D.totalSetores > 6 ? `<span class="pq-setor resto">e mais ${D.totalSetores - 6}</span>` : ''}</span>` : '<span class="pq-vazio">Nenhum setor cadastrado ainda</span>'}<span class="pq-num">${esc(numeros)}</span><span class="pq-abrir">Abrir empresa ${icone('seta')}</span></span>`;
  CAMPO.rotulos.appendChild(a);
  return a;
}

/* ---------- Cena: chão, torre da Real Forte, luzes ---------- */
function montarCena() {
  const T = THREE;
  if (T.ColorManagement) T.ColorManagement.legacyMode = false;
  geometrias();
  const pequeno = telaPequena();
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pequeno ? 1.6 : 2));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  CAMPO.renderer = renderer;
  CAMPO.texBrilho = texturaBrilho();
  { const cv = document.createElement('canvas'); cv.width = 256; cv.height = 16; const g = cv.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 256, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,.25)'); gr.addColorStop(0.82, 'rgba(255,255,255,1)'); gr.addColorStop(0.9, 'rgba(255,255,255,.2)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 16);
    CAMPO.texFluxo = new T.CanvasTexture(cv); CAMPO.texFluxo.wrapS = T.RepeatWrapping; CAMPO.texFluxo.wrapT = T.ClampToEdgeWrapping; }
  CAMPO.matSetor = fachadaDe('setor').mat; CAMPO.matSetor.emissiveIntensity = 0.35;
  CAMPO.matAndar = new T.MeshStandardMaterial({ color: 0x2fbf71, emissive: 0x2fbf71, emissiveIntensity: 0.55, roughness: 0.3, transparent: true, opacity: 0.92, toneMapped: false });
  CAMPO.efeitos = [];
  // Feixe de luz que marca o setor da vez no modo apresentação
  CAMPO.feixe = new T.Mesh(new T.CylinderGeometry(0.62, 0.62, 1, 32, 1, true).translate(0, 0.5, 0), new T.MeshBasicMaterial({ color: 0xffd7a8, transparent: true, opacity: 0.2, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
  CAMPO.feixe.scale.set(1.6, 16, 1.6); CAMPO.feixe.visible = false;

  const cena = new T.Scene(); CAMPO.cena = cena; cena.add(CAMPO.feixe);
  cena.fog = new T.Fog(0xe6eef7, 110, 300);
  const camera = new T.PerspectiveCamera(38, 1, 0.2, 800); CAMPO.camera = camera;

  // Luzes: céu frio, sol quente com sombra, e o laranja da torre
  const hemi = new T.HemisphereLight(0xcfe0ff, 0x0b1729, 0.9); cena.add(hemi);
  const sol = new T.DirectionalLight(0xfff0dc, 1.6); sol.position.set(45, 80, 35); sol.castShadow = true;
  sol.shadow.mapSize.set(pequeno ? 1024 : 2048, pequeno ? 1024 : 2048);
  Object.assign(sol.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 10, far: 220 }); sol.shadow.bias = -0.0004; sol.shadow.normalBias = 0.03;
  cena.add(sol);
  const contra = new T.DirectionalLight(0x7aa2ff, 0.45); contra.position.set(-50, 30, -40); cena.add(contra);
  const luzTorre = new T.PointLight(0xff8a3d, 1.4, 40, 2); luzTorre.position.set(0, 26, 0); cena.add(luzTorre);
  CAMPO.luzesPendentes = { hemi, sol, contra };

  /* Piso branco liso. A cor muda com a hora: branco de manhã, vai escurecendo à tarde, cinza no fim do dia e grafite à noite. */
  // Reflexo do céu no piso (um mapa de ambiente desenhado: azul em cima, claro no horizonte)
  let ambiente = null;
  try { ambiente = ambienteDoEspaco(renderer); } catch (x) { ambiente = null; }   /* céu escuro em cima, o planeta claro embaixo */
  CAMPO.ambiente = ambiente;
  const chao = new T.Mesh(new T.PlaneGeometry(2400, 2400), new T.MeshStandardMaterial({ color: 0xf3f6fa, roughness: 0.5, metalness: 0.02, envMap: ambiente, envMapIntensity: 0.3 }));
  chao.rotation.x = -Math.PI / 2; chao.receiveShadow = true; cena.add(chao);
  CAMPO.luzes = Object.assign(CAMPO.luzesPendentes, { chao });

  /* ---------- Sede da Real Forte ----------
     Cores só da Real Forte (azul-marinho, laranja, branco e vidro). Térreo: um hall grande de vidro com
     telhado de vidro (de cima dá para ver o movimento lá dentro): recepção com a parede da logo, café com
     balcão, baristas, fila e mesas; lounge com sofás; central de dados com telões de gráficos e totens;
     mesa de projeção no meio; sala de reunião de vidro; arena da RF Intelligence com arquibancada;
     elevadores no núcleo da torre. Na frente, uma praça com bancos, canteiros e postes.
     A torre sobe do núcleo e, no alto, a cobertura de vidro com a equipe (careca, dois de cabelo preto
     e um loiro) trabalhando e com a rotina deles. */
  const torre = new T.Group(); cena.add(torre); CAMPO.torre = torre;
  const FH = 0.15, HH = 3.0, X0 = -10, X1 = 10, Z0 = -3.5, Z1 = 10.5;   // piso do hall, altura, limites
  const TOPO_HALL = FH + HH;
  const PISO = FH;
  CAMPO.pisoSede = FH; CAMPO.topoPlaca = FH; CAMPO.ladoSede = 10;
  const navy = COR3D.navy, navy2 = 0x1f3a68, laranja = COR3D.laranja;
  const obst = [], alturas = [], portas = [];
  CAMPO.sedeNav = { obst, alturas, portas, area: { x0: X0 + 0.5, x1: X1 - 0.5, z0: Z0 + 0.5, z1: Z1 - 0.5 } };
  const bloqueio = (x0, x1, z0, z1) => obst.push([x0, x1, z0, z1]);
  const lote = novoLote();
  const L = (geo, m, x, y, z, sx, sy, sz, ry, sombra) => lote.add(geo, m, x, y, z, sx, sy, sz, 0, ry || 0, 0, sombra);
  // Piso do hall: pedra clara com borda azul-marinho e um anel laranja em volta da recepção
  const pedra = new T.MeshStandardMaterial({ color: 0xeef1f5, roughness: 0.35, metalness: 0.05, envMap: CAMPO.ambiente, envMapIntensity: 0.35 });   // o hall fica claro à noite (luz acesa por dentro)
  const piso = new T.Mesh(G3.caixa, pedra); piso.scale.set(X1 - X0, FH, Z1 - Z0); piso.position.set(0, 0, (Z0 + Z1) / 2); piso.receiveShadow = true; torre.add(piso);
  alturas.push([X0, X1, Z0, Z1, FH]);
  [[0, Z1 - 0.06, X1 - X0, 0.12], [0, Z0 + 0.06, X1 - X0, 0.12], [X0 + 0.06, (Z0 + Z1) / 2, 0.12, Z1 - Z0], [X1 - 0.06, (Z0 + Z1) / 2, 0.12, Z1 - Z0]].forEach(([x, z, w, d]) => L(G3.caixa, mat(navy), x, FH, z, w, 0.006, d, 0, false));
  const anel = new T.Mesh(new T.RingGeometry(2.6, 2.72, 64), luzMat(laranja, 0.9)); anel.rotation.x = -Math.PI / 2; anel.position.set(0, FH + 0.006, 5.6); torre.add(anel);
  // Paredes de vidro com montantes azul-marinho; abertura das portas (frente e laterais)
  const vidro = new T.MeshStandardMaterial({ color: 0xbcd6f2, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.5, depthWrite: false, side: T.DoubleSide, envMap: CAMPO.ambiente, envMapIntensity: 0.8 });
  const painelVidro = (x, z, w, d) => { const m = new T.Mesh(G3.caixa, vidro); m.scale.set(w, HH, d); m.position.set(x, FH, z); torre.add(m); };
  const PORTA_F = [-1.5, 1.5], PORTA_L = [-0.4, 2.0];
  painelVidro((X0 + PORTA_F[0]) / 2, Z1, PORTA_F[0] - X0, 0.06); painelVidro((PORTA_F[1] + X1) / 2, Z1, X1 - PORTA_F[1], 0.06);
  painelVidro(0, Z0, X1 - X0, 0.06);
  [X0, X1].forEach((x) => { painelVidro(x, (Z0 + PORTA_L[0]) / 2, 0.06, PORTA_L[0] - Z0); painelVidro(x, (PORTA_L[1] + Z1) / 2, 0.06, Z1 - PORTA_L[1]); });
  bloqueio(X0 - 0.1, PORTA_F[0], Z1 - 0.1, Z1 + 0.1); bloqueio(PORTA_F[1], X1 + 0.1, Z1 - 0.1, Z1 + 0.1); bloqueio(X0 - 0.1, X1 + 0.1, Z0 - 0.1, Z0 + 0.1);
  [X0, X1].forEach((x) => { bloqueio(x - 0.1, x + 0.1, Z0, PORTA_L[0]); bloqueio(x - 0.1, x + 0.1, PORTA_L[1], Z1); });
  for (let x = X0; x <= X1 + 0.01; x += 2) { if (x > PORTA_F[0] - 0.1 && x < PORTA_F[1] + 0.1) continue; L(G3.caixa, mat(navy), x, FH, Z1, 0.1, HH, 0.12); L(G3.caixa, mat(navy), x, FH, Z0, 0.1, HH, 0.12); }
  for (let z = Z0; z <= Z1 + 0.01; z += 2) { if (z > PORTA_L[0] - 0.1 && z < PORTA_L[1] + 0.1) continue; L(G3.caixa, mat(navy), X0, FH, z, 0.12, HH, 0.1); L(G3.caixa, mat(navy), X1, FH, z, 0.12, HH, 0.1); }
  // Portas automáticas (abrem quando alguém chega perto)
  const folha = luzMat(0xbfe0ff, 0.22);
  CAMPO.portasSede = [
    { c: [0, Z1], eixo: 'x', folhas: [-1, 1].map((s) => caixa(torre, 1.45, 2.3, 0.05, folha, s * 0.74, FH, Z1)), base: 0.74, curso: 1.3, ab: 0 },
    ...[X0, X1].map((x) => ({ c: [x, (PORTA_L[0] + PORTA_L[1]) / 2], eixo: 'z', folhas: [-1, 1].map((s) => caixa(torre, 0.05, 2.3, 1.15, folha, x, FH, 0.8 + s * 0.6)), base: 0.6, curso: 1.05, ab: 0 }))
  ];
  caixa(torre, PORTA_F[1] - PORTA_F[0] + 0.4, 0.12, 1.4, navy, 0, FH + 2.45, Z1 + 0.6);   // marquise
  caixa(torre, 3.2, 0.04, 1.2, luzMat(laranja, 1.2), 0, FH + 2.44, Z1 + 0.6).castShadow = false;
  // Telhado de vidro com vigas e LED laranja na borda
  const vidroTeto = new T.MeshStandardMaterial({ color: 0xd6e6f7, transparent: true, opacity: 0.14, roughness: 0.05, metalness: 0.4, depthWrite: false, side: T.DoubleSide });
  const teto = new T.Mesh(G3.caixa, vidroTeto); teto.scale.set(X1 - X0, 0.06, Z1 - Z0); teto.position.set(0, TOPO_HALL, (Z0 + Z1) / 2); torre.add(teto);
  for (let x = X0; x <= X1 + 0.01; x += 5) L(G3.caixa, mat(navy), x, TOPO_HALL, (Z0 + Z1) / 2, 0.07, 0.1, Z1 - Z0);   // vigas leves: de cima se vê o hall
  for (let z = Z0; z <= Z1 + 0.01; z += 3.5) L(G3.caixa, mat(navy), 0, TOPO_HALL, z, X1 - X0, 0.1, 0.07);
  [[0, Z1, X1 - X0 + 0.1, 0.08], [0, Z0, X1 - X0 + 0.1, 0.08], [X0, (Z0 + Z1) / 2, 0.08, Z1 - Z0], [X1, (Z0 + Z1) / 2, 0.08, Z1 - Z0]].forEach(([x, z, w, d]) => L(G3.caixa, luzMat(laranja, 1.4), x, TOPO_HALL + 0.16, z, w, 0.06, d, 0, false));
  // Núcleo da torre (dentro do hall): revestido de azul-marinho, com a logo na frente e os elevadores dos lados
  const NUC = 3.0;
  caixa(torre, NUC * 2, HH, NUC * 2, mat(navy, { roughness: 0.4, metalness: 0.3 }), 0, FH, 0);
  bloqueio(-NUC, NUC, -NUC, NUC);
  if (typeof LOGO !== 'undefined' && LOGO.claro) {
    const texLogo = new T.TextureLoader().load(LOGO.claro); texLogo.encoding = T.sRGBEncoding; texLogo.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const matLogo = new T.MeshBasicMaterial({ map: texLogo, transparent: true, toneMapped: false, depthWrite: false });
    const pl = new T.Mesh(G3.placa, matLogo); pl.scale.set(4.2, 4.2 / LOGO.proporcao, 1); pl.position.set(0, FH + 1.95, NUC + 0.02); torre.add(pl);
    const pFora = new T.Mesh(G3.placa, matLogo); pFora.scale.set(2.6, 2.6 / LOGO.proporcao, 1); pFora.position.set(0, FH + 2.75, Z1 + 1.31); torre.add(pFora);   // na marquise
  }
  caixa(torre, 4.4, 0.04, 0.04, luzMat(laranja, 1.4), 0, FH + 1.05, NUC + 0.02).castShadow = false;
  const elevadores = [];
  [-1, 1].forEach((s) => {
    caixa(torre, 0.04, 2.3, 1.1, mat(0xc4ccd8, { metalness: 0.8, roughness: 0.25 }), s * (NUC + 0.01), FH, 0.9);
    caixa(torre, 0.05, 0.08, 0.3, luzMat(laranja, 1.4), s * (NUC + 0.02), FH + 2.45, 0.9).castShadow = false;
    elevadores.push(ponto(s * (NUC + 0.45), 0.9, s > 0 ? Math.PI : 0, 'olhar'));
  });
  // Recepção
  caixa(torre, 3.4, 0.95, 0.6, 0xf4f6fa, 0, FH, 4.6); caixa(torre, 3.5, 0.05, 0.66, laranja, 0, FH + 0.95, 4.6); caixa(torre, 3.42, 0.05, 0.62, luzMat(laranja, 1.2), 0, FH + 0.1, 4.92).castShadow = false;
  bloqueio(-1.75, 1.75, 4.25, 4.95);
  const fixos = [];   // gente que fica no lugar (recepção, baristas)
  [-0.8, 0.8].forEach((x, i) => { const p = novaPessoa(Object.assign(uniformeRealForte([0x3a2a1e, 0x1b1b1f][i], PELES[i * 2]), { escala: 1.3 })); p.position.set(x, FH, 3.85); p.rotation.y = -Math.PI / 2; torre.add(p); fixos.push(p); });
  // Café (direita, na frente)
  caixa(torre, 4.4, 1.0, 0.6, 0x1f3a68, 7.2, FH, 9.2); caixa(torre, 4.5, 0.05, 0.66, 0xf4f6fa, 7.2, FH + 1.0, 9.2); caixa(torre, 4.42, 0.05, 0.62, luzMat(laranja, 1.2), 7.2, FH + 0.12, 8.88).castShadow = false;
  bloqueio(4.95, 9.45, 8.85, 9.55);
  [5.6, 7.0, 8.4].forEach((x) => { caixa(torre, 0.34, 0.36, 0.3, 0x2b3446, x, FH + 1.05, 9.3); caixa(torre, 0.22, 0.05, 0.05, luzMat(laranja, 1.3), x, FH + 1.3, 9.14).castShadow = false; });
  [6.3, 8.1].forEach((x, i) => { const p = novaPessoa(Object.assign(uniformeRealForte([0xe8c66a, 0x1b1b1f][i], PELES[i + 1]), { escala: 1.3 })); p.position.set(x, FH, 9.95); p.rotation.y = Math.PI / 2; torre.add(p); fixos.push(p); });
  const menu = (() => { const c = telaDe(512, 160, (g) => { g.fillStyle = '#0f2342'; g.fillRect(0, 0, 512, 160); g.fillStyle = '#ff9a52'; g.font = 'bold 40px sans-serif'; g.fillText('CAFÉ REAL FORTE', 24, 62); g.fillStyle = '#dbe4f2'; g.font = '26px sans-serif'; g.fillText('Espresso · Cappuccino · Chá · Água', 24, 118); }); const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t; })();
  const pMenu = new T.Mesh(G3.placa, new T.MeshBasicMaterial({ map: menu, toneMapped: false })); pMenu.scale.set(3.2, 1.0, 1); pMenu.position.set(7.2, FH + 2.35, 10.42); pMenu.rotation.y = Math.PI; torre.add(pMenu);
  const fila = [5.6, 6.5, 7.4, 8.3].map((x) => ponto(x, 8.35, -Math.PI / 2, 'olhar'));
  const mesas = [];
  [[5.0, 4.6], [7.0, 4.6], [9.0, 4.6], [5.0, 6.7], [7.0, 6.7], [9.0, 6.7]].forEach(([x, z]) => {
    cilindro(torre, 0.04, 0.72, 0x8a96a8, x, FH, z); cilindro(torre, 0.36, 0.04, 0xf4f6fa, x, FH + 0.72, z);
    bloqueio(x - 0.32, x + 0.32, z - 0.32, z + 0.32);
    [0, 2.1, 4.2].forEach((a) => { const cx = x + Math.cos(a) * 0.62, cz = z + Math.sin(a) * 0.62; cilindro(torre, 0.15, 0.4, navy2, cx, FH, cz); mesas.push(ponto(cx, cz, Math.atan2(-(z - cz), x - cx), 'sentar', { dur: 18 })); });
  });
  // Lounge (esquerda, na frente): dois conjuntos de sofás e mesinha de centro sobre um tapete
  const sofas = [];
  [[-6.8, 5.0], [-6.8, 8.2]].forEach(([x, z]) => {
    caixa(torre, 3.4, 0.01, 2.4, mat(0x2b3a57, { roughness: 1 }), x, FH, z).castShadow = false;
    caixa(torre, 0.9, 0.36, 0.5, 0xf4f6fa, x, FH, z); bloqueio(x - 0.5, x + 0.5, z - 0.3, z + 0.3);
    [[-1, 0], [1, 0]].forEach(([s]) => {
      caixa(torre, 2.0, 0.4, 0.62, navy2, x, FH, z + s * 0.95); caixa(torre, 2.0, 0.42, 0.16, navy2, x, FH + 0.38, z + s * 1.24);
      bloqueio(x - 1.05, x + 1.05, z + s * 1.12, z + s * 1.34);   // só o encosto; o assento dá para sentar
      [-0.6, 0, 0.6].forEach((dx) => sofas.push(ponto(x + dx, z + s * 0.78, s > 0 ? Math.PI / 2 : -Math.PI / 2, 'sentar', { dur: 20 })));
    });
  });
  // Central de dados (esquerda, ao fundo): telões de gráficos na parede e dois totens
  const telas = [];
  CAMPO.graficosSede = [];
  const telao = (x, y, z, w, h, ry, tipo) => {
    const W = w >= h ? 640 : 360, c = document.createElement('canvas'); c.width = W; c.height = Math.round(W * h / w);   // na proporção da tela (os totens são em pé)
    const tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding;
    const m = new T.MeshBasicMaterial({ map: tex, toneMapped: false });
    const moldura = caixa(torre, w + 0.14, h + 0.14, 0.08, mat(0x0b1220, { metalness: 0.4 }), x, y - (h + 0.14) / 2, z); moldura.rotation.y = ry;
    const p = new T.Mesh(G3.placa, m); p.scale.set(w, h, 1); p.position.set(x + Math.sin(ry) * 0.05, y, z + Math.cos(ry) * 0.05); p.rotation.y = ry; torre.add(p);
    CAMPO.graficosSede.push({ c, g: c.getContext('2d'), tex, tipo });
  };
  telao(-7.8, FH + 1.9, Z0 + 0.12, 3.0, 1.7, 0, 'etapas'); telao(-4.6, FH + 1.9, Z0 + 0.12, 2.4, 1.35, 0, 'saude');
  [-7.8, -4.6].forEach((x) => { telas.push(ponto(x - 0.5, Z0 + 2.4, Math.PI / 2, 'olhar', { dur: 12 })); telas.push(ponto(x + 0.5, Z0 + 2.6, Math.PI / 2, 'olhar', { dur: 12 })); });
  [[-5.2, 1.6], [-8.6, 1.6]].forEach(([x, z], i) => {
    caixa(torre, 0.5, 1.5, 0.12, mat(navy, { metalness: 0.3 }), x, FH, z); bloqueio(x - 0.3, x + 0.3, z - 0.12, z + 0.12);
    telao(x, FH + 1.05, z + 0.07, 0.42, 0.75, 0, i ? 'horas' : 'entregas');
    telas.push(ponto(x, z + 0.7, Math.PI / 2, 'olhar', { dur: 10 }));
  });
  // Sala de reunião de vidro (esquerda, no meio), com porta voltada para o hall
  // Arena da RF Intelligence (direita, ao fundo): telão no fundo e arquibancada de três degraus
  telao(6.6, FH + 1.95, Z0 + 0.12, 5.0, 2.6, 0, 'rfi');
  const arena = [];
  [[0.6, 0.2], [1.4, 0.4], [2.2, 0.6]].forEach(([z, h]) => {
    caixa(torre, 5.4, h, 0.8, mat(0xdfe4eb, { roughness: 0.7 }), 6.6, FH, z); caixa(torre, 5.4, 0.03, 0.06, luzMat(laranja, 1.1), 6.6, FH + h, z - 0.38).castShadow = false;
    alturas.push([3.9, 9.3, z - 0.4, z + 0.4, FH + h]);
    for (let x = 4.4; x <= 8.9; x += 0.75) arena.push(ponto(x, z, Math.PI / 2, 'sentar', { dur: 22, y: FH + h }));
  });
  // Mesa de projeção no meio do hall: barras de luz subindo e descendo com os números
  caixa(torre, 2.6, 0.85, 1.4, navy2, 0, FH, 7.4); caixa(torre, 2.64, 0.04, 1.44, mat(0x16305a, { roughness: 0.25, metalness: 0.4 }), 0, FH + 0.85, 7.4).castShadow = false;   // tampo escuro: a luz fica nas barras
  [[0, 6.69, 2.64, 0.03], [0, 8.11, 2.64, 0.03], [-1.31, 7.4, 0.03, 1.44], [1.31, 7.4, 0.03, 1.44]].forEach(([x, z, w, d]) => caixa(torre, w, 0.02, d, luzMat(0x38d6f5, 1.1), x, FH + 0.89, z).castShadow = false);
  bloqueio(-1.4, 1.4, 6.6, 8.2);
  CAMPO.barrasMesa = [];
  for (let i = 0; i < 8; i++) { const b = caixa(torre, 0.18, 1, 0.18, luzMat(i % 2 ? laranja : 0x38d6f5, 1.4), -0.95 + i * 0.27, FH + 0.89, 7.4); b.castShadow = false; CAMPO.barrasMesa.push(b); }
  const empe = [];
  [[-1.9, 7.4, 0], [1.9, 7.4, Math.PI], [0, 8.6, Math.PI / 2], [-0.8, 6.2, -Math.PI / 2], [0.8, 6.2, -Math.PI / 2]].forEach(([x, z, r]) => empe.push(ponto(x, z, r, 'olhar', { dur: 9 })));
  [[-3.6, 6.0, 0.6], [3.6, 6.0, 2.5], [-2.6, 9.6, -1.2], [2.6, 9.6, -2.0]].forEach(([x, z, r]) => empe.push(ponto(x, z, r, 'olhar', { dur: 10 })));
  // Plantas e luminárias
  [[-9.3, 9.8], [9.3, 9.8], [-9.3, -2.8], [-3.6, 9.9], [3.6, 9.9], [-3.5, -2.9], [3.5, -2.9]].forEach(([x, z]) => {
    cilindro(torre, 0.32, 0.55, 0xf4f6fa, x, FH, z); peca(torre, G3.copa, mat(0x3f8a52, { roughness: 0.85 }), 0.42, 0.62, 0.42, x, FH + 1.0, z);
    bloqueio(x - 0.4, x + 0.4, z - 0.4, z + 0.4);
  });
  CAMPO.luzesHall = [];
  [[-6, 2.5], [0, 6.5], [6, 2.5], [-6, 7.5], [6, 7.5]].forEach(([x, z]) => {
    caixa(torre, 0.02, 0.6, 0.02, 0x2b3446, x, TOPO_HALL - 0.6, z); const l = peca(torre, G3.cil, luzMat(0xffe3b0, 1.2), 0.22, 0.06, 0.22, x, TOPO_HALL - 0.66, z); l.castShadow = false;
    CAMPO.luzesHall.push(brilho(torre, 0xffd9a0, 1.6, x, TOPO_HALL - 0.75, z, 0.4));
  });
  const luzA = new T.PointLight(0xffe2b8, 0.9, 16, 2); luzA.position.set(-4, TOPO_HALL - 0.5, 5); torre.add(luzA);
  const luzB = new T.PointLight(0xffe2b8, 0.9, 16, 2); luzB.position.set(5, TOPO_HALL - 0.5, 5); torre.add(luzB);
  CAMPO.luzesInternasSede = [luzA, luzB];
  // ---------- Praça na frente ----------
  const pracaM = pisoNoturno(new T.MeshStandardMaterial({ color: 0xe4e8ee, roughness: 0.8 }));
  caixa(torre, 26, 0.02, 9, pracaM, 0, 0, Z1 + 5.2).castShadow = false;
  [[-11, 13.2], [-6.5, 15.8], [6.5, 15.8], [11, 13.2]].forEach(([x, z]) => {
    caixa(torre, 2.4, 0.4, 1.0, 0xf4f6fa, x, 0, z); peca(torre, G3.copa, mat(0x4f9a5e, { roughness: 0.85 }), 0.9, 0.7, 0.4, x, 0.75, z);
    bloqueio(x - 1.25, x + 1.25, z - 0.55, z + 0.55);
  });
  const bancosPraca = [];
  [[-8.5, 12.4], [8.5, 12.4], [-3.4, 15.2], [3.4, 15.2]].forEach(([x, z]) => { caixa(torre, 1.4, 0.05, 0.42, 0x9a6a42, x, 0.36, z); caixa(torre, 0.06, 0.36, 0.38, 0x2b3446, x - 0.6, 0, z); caixa(torre, 0.06, 0.36, 0.38, 0x2b3446, x + 0.6, 0, z); [-0.35, 0.35].forEach((dx) => bancosPraca.push(ponto(x + dx, z, Math.PI / 2, 'sentar', { dur: 14 }))); });
  CAMPO.postesSede = [];
  [[-12.5, 11.5], [-4.5, 11.6], [4.5, 11.6], [12.5, 11.5], [-12, 17], [12, 17], [0, 17.6]].forEach(([x, z]) => {
    cilindro(torre, 0.05, 2.4, 0x2b3446, x, 0, z); peca(torre, G3.cil, luzMat(0xffe3b0, 1.3), 0.14, 0.08, 0.14, x, 2.4, z).castShadow = false;
    CAMPO.postesSede.push(brilho(torre, 0xffd28a, 1.5, x, 2.42, z, 0)); bloqueio(x - 0.12, x + 0.12, z - 0.12, z + 0.12);
  });
  lote.montar(torre, []);
  CAMPO.sedePontos = { fila, mesas: mesas.concat(bancosPraca), sofas, telas, arena, reuniao: [], empe, elevadores, fixos };
  montarOutdoor(torre);   // outdoor com o vídeo da Real Forte
  // ---------- Torre ----------
  const T0 = TOPO_HALL, LT = 5.0, HT = 24.0;   // torre alta: continua sendo o marco da cidade
  const janelasTorre = texturaJanelas(8, 64, 0.62, '#ffd9a8');
  janelasTorre.tex.wrapS = janelasTorre.tex.wrapT = T.RepeatWrapping;
  const vidroTorre = new T.MeshStandardMaterial({ color: 0x0c0f14, roughness: 0.16, metalness: 0.65, emissive: 0xffffff, emissiveMap: janelasTorre.tex, emissiveIntensity: 0.85, envMap: CAMPO.ambiente, envMapIntensity: 0.6 });
  CAMPO.janelasTorre = janelasTorre; (CAMPO.matsTorre = CAMPO.matsTorre || []).push([vidroTorre, 0.85]);
  peca(torre, G3.caixa, vidroTorre, LT, HT, LT, 0, T0, 0);
  caixa(torre, NUC * 2 + 0.2, 0.3, NUC * 2 + 0.2, 0x101318, 0, T0, 0);                  // base da torre no telhado
  for (let k = -2; k <= 2; k++) [[k * 1.0, LT / 2 + 0.04], [k * 1.0, -LT / 2 - 0.04]].forEach(([x, z]) => caixa(torre, 0.08, HT, 0.1, 0x0b0d11, x, T0, z));   // aletas verticais
  for (let k = -2; k <= 2; k++) [[LT / 2 + 0.04, k * 1.0], [-LT / 2 - 0.04, k * 1.0]].forEach(([x, z]) => caixa(torre, 0.1, HT, 0.08, 0x0b0d11, x, T0, z));
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => caixa(torre, 0.09, HT, 0.09, luzMat(laranja, 1.5), a * (LT / 2 + 0.05), T0, b * (LT / 2 + 0.05)).castShadow = false);
  [3, 6, 9, 12, 15, 18, 21].forEach((y) => caixa(torre, LT + 0.12, 0.06, LT + 0.12, luzMat(laranja, 0.9), 0, T0 + y, 0).castShadow = false);
  caixa(torre, LT + 0.3, 0.18, LT + 0.3, 0x101318, 0, T0 + HT, 0);
  // Cobertura de vidro com a equipe
  const Y0 = T0 + HT + 0.18, LC = 4.4;
  CAMPO.alturaCobertura = Y0;
  const vidroCob = new T.MeshStandardMaterial({ color: 0xcfe4ff, transparent: true, opacity: 0.13, roughness: 0.05, metalness: 0.4, depthWrite: false, side: T.DoubleSide });
  peca(torre, G3.caixa, vidroCob, LC, 2.2, LC, 0, Y0, 0).castShadow = false;
  caixa(torre, LC - 0.04, 0.05, LC - 0.04, 0xe9eef5, 0, Y0, 0);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => { caixa(torre, 0.08, 2.2, 0.08, navy, a * LC / 2, Y0, b * LC / 2); caixa(torre, 0.06, 2.2, 0.06, luzMat(laranja, 1.5), a * (LC / 2 + 0.05), Y0, b * (LC / 2 + 0.05)).castShadow = false; });
  const luzCob = new T.PointLight(0xffe7c2, 0.8, 7, 2); luzCob.position.set(0, Y0 + 1.9, 0); torre.add(luzCob);
  caixa(torre, LC + 0.5, 0.36, LC + 0.5, 0x101318, 0, Y0 + 2.2, 0);
  [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([a, b]) => caixa(torre, 0.78, 0.7, 0.78, 0x101318, a * 1.7, Y0 + 2.56, b * 1.7));
  const yAntena = Y0 + 2.56 + 0.7;
  cilindro(torre, 0.06, 1.8, 0xb8c2d4, 0, yAntena - 0.2, 0);
  CAMPO.yFarol = yAntena + 1.7; CAMPO.yHolo = yAntena + 3.0; CAMPO.topoTorre = Y0 + 2.56;
  const DESKS = [[-0.95, -0.95], [0.95, -0.95], [-0.95, 0.65], [0.95, 0.65]];
  CAMPO.telas = [];
  DESKS.forEach(([x, z]) => {
    caixa(torre, 0.8, 0.04, 0.48, 0xf4f6fa, x, Y0 + 0.4, z);
    [[-0.36, -0.2], [0.36, -0.2], [-0.36, 0.2], [0.36, 0.2]].forEach(([a, b]) => caixa(torre, 0.03, 0.4, 0.03, 0x8a96a8, x + a, Y0, z + b));
    const tela = new T.MeshStandardMaterial({ color: 0x0b1a33, emissive: 0x5fb8ff, emissiveIntensity: 1.2, toneMapped: false }); CAMPO.telas.push(tela);
    caixa(torre, 0.46, 0.28, 0.025, 0x1a2233, x, Y0 + 0.52, z - 0.17);
    peca(torre, G3.placa, tela, 0.42, 0.24, 1, x, Y0 + 0.66, z - 0.155).castShadow = false;
    caixa(torre, 0.3, 0.015, 0.1, 0x2b3446, x, Y0 + 0.44, z + 0.04);
    caixa(torre, 0.3, 0.04, 0.28, 0x2b3446, x, Y0 + 0.27, z + 0.45); caixa(torre, 0.3, 0.3, 0.04, 0x2b3446, x, Y0 + 0.29, z + 0.6);
  });
  caixa(torre, 0.24, 0.52, 0.22, 0x2b3446, -1.85, Y0, -1.85); caixa(torre, 0.18, 0.06, 0.04, luzMat(laranja, 1.2), -1.85, Y0 + 0.36, -1.73);
  cilindro(torre, 0.03, 0.38, 0x8a96a8, 1.55, Y0, -1.6); cilindro(torre, 0.2, 0.03, 0xf4f6fa, 1.55, Y0 + 0.38, -1.6);
  cilindro(torre, 0.13, 0.24, 0xd5dce6, 1.85, Y0, 1.85); peca(torre, G3.bola, mat(0x3f8a52), 0.18, 0.3, 0.18, 1.85, Y0 + 0.44, 1.85);
  const EQUIPE = [{ cabelo: 'careca', pele: PELES[1] }, { cabelo: 0x1b1b1f, pele: PELES[0] }, { cabelo: 0x1b1b1f, pele: PELES[3] }, { cabelo: 0xe8c66a, pele: PELES[4] }];
  const ROTAS = { cafe: [[-1.6, -1.7], [-1.62, -1.42]], reuniao: [[1.25, -1.62], [1.85, -1.55]], janela: [[0, 1.72], [-0.8, 1.72]] };
  const ocupado = new Set(), LADO = 1.68, FRENTE = 1.72, MEIO = 0.03;
  CAMPO.equipeCobertura = EQUIPE.map((o, i) => {
    const p = novaPessoa(Object.assign(uniformeRealForte(o.cabelo, o.pele), { escala: 1.25 }));
    const [x, z] = DESKS[i], sz = z + 0.42;
    p.position.set(x, Y0 + 0.07, sz); p.rotation.y = Math.PI / 2; sentar(p, true); torre.add(p);
    return { p, x, sz, linha: z < 0 ? MEIO : FRENTE, estado: 'trabalhando', espera: 8 + i * 6 + Math.random() * 10, s: 0, rota: null, vaga: null };
  });
  const tmpC = new T.Vector3();
  function rotaDaCobertura(m, alvo, k) {
    const destino = ROTAS[alvo][k], lado = alvo === 'cafe' ? -LADO : alvo === 'reuniao' ? LADO : Math.sign(m.x) * LADO;
    const pts = [[m.x, m.sz], [m.x, m.linha]];
    if (alvo === 'janela') { if (m.linha < 1) pts.push([lado, m.linha], [lado, FRENTE]); pts.push([destino[0], FRENTE]); }
    else { pts.push([lado, m.linha], [lado, -1.6], destino); }
    return caminho(pts.map(([a, b]) => new T.Vector3(a, Y0 + 0.07, b)));
  }
  CAMPO.passoCobertura = (t, dt) => {
    const A = CAMPO.atividade == null ? 1 : CAMPO.atividade;
    CAMPO.equipeCobertura.forEach((m, i) => {
      const p = m.p;
      p.visible = i < 2 || A > 0.5;   // à noite fica só metade da equipe
      if (m.estado === 'trabalhando') {
        p.userData.bracos.forEach((b, j) => { b.rotation.z = 1.1 + Math.sin(t * 12 + i + j * 1.7) * 0.06; });
        m.espera -= dt;
        if (m.espera <= 0) {
          const opcoes = ['cafe', 'reuniao', 'janela'].map((a) => [a, [0, 1].find((k) => !ocupado.has(a + k))]).filter(([, k]) => k != null);
          if (!opcoes.length) { m.espera = 5; return; }
          const [alvo, k] = opcoes[Math.floor(Math.random() * opcoes.length)];
          m.vaga = alvo + k; ocupado.add(m.vaga); m.alvo = alvo;
          m.rota = rotaDaCobertura(m, alvo, k); m.s = 0; m.estado = 'indo'; levantar(p);
        }
      } else if (m.estado === 'indo' || m.estado === 'voltando') {
        m.s += (m.estado === 'indo' ? 1 : -1) * dt * 0.55;
        const fim = m.estado === 'indo' ? m.s >= m.rota.total : m.s <= 0;
        const ang = m.rota.pos(m.s, tmpC); p.position.copy(tmpC); p.position.y += passo(p, t, true, i);
        p.rotation.y = m.estado === 'voltando' ? ang + Math.PI : ang;
        if (fim) {
          if (m.estado === 'indo') { m.estado = 'parado'; m.espera = 7 + Math.random() * 6; passo(p, t, false); }
          else { m.estado = 'trabalhando'; ocupado.delete(m.vaga); m.espera = 18 + Math.random() * 22; p.position.set(m.x, Y0 + 0.07, m.sz); p.rotation.y = Math.PI / 2; sentar(p, true); }
        }
      } else if (m.estado === 'parado') {
        const b = p.userData.bracos[1];
        b.rotation.z = m.alvo === 'cafe' ? 1.4 + Math.sin(t * 1.5) * 0.3 : m.alvo === 'reuniao' ? 0.4 + Math.abs(Math.sin(t * 2.2 + i)) * 0.6 : 0;
        p.rotation.y = m.alvo === 'janela' ? -Math.PI / 2 : m.alvo === 'cafe' ? Math.PI / 2 + Math.PI / 4 : (m.vaga.endsWith('0') ? 0 : Math.PI);
        m.espera -= dt; if (m.espera <= 0) { m.estado = 'voltando'; m.s = m.rota.total; p.userData.bracos[1].rotation.z = 0; }
      }
    });
  };
  CAMPO.anelTorre = new T.Mesh(new T.TorusGeometry(3.9, 0.05, 8, 96), luzMat(laranja, 1.6)); CAMPO.anelTorre.rotation.x = Math.PI / 2; CAMPO.anelTorre.position.y = 7.5; torre.add(CAMPO.anelTorre);
  CAMPO.farol = brilho(torre, 0xff8a3d, 3.4, 0, CAMPO.yFarol, 0, 0.9);
  CAMPO.brilhoCoroa = brilho(torre, 0xffb067, 10, 0, Y0 + 2.6, 0, 0.16);
  const pocaTorre = new T.Mesh(new T.PlaneGeometry(40, 40), new T.MeshBasicMaterial({ map: CAMPO.texBrilho, color: 0xff8a3d, transparent: true, opacity: 0.12, blending: T.AdditiveBlending, depthWrite: false }));
  pocaTorre.rotation.x = -Math.PI / 2; pocaTorre.position.set(0, 0.05, 3.5); cena.add(pocaTorre);
  // A cidade planejada em volta da sede (ruas, centros, praças, estações e lotes)
  montarPlano(); estiloDaCidade();
  CAMPO.alvoTorre = new T.Mesh(G3.caixa, new T.MeshBasicMaterial({ visible: false })); CAMPO.alvoTorre.scale.set(6.4, CAMPO.topoTorre + 3, 6.4); cena.add(CAMPO.alvoTorre);   // para aproximar na torre com a rodinha

  // Poeira de luz no ar
  const qtd = pequeno ? 160 : 380, pos = new Float32Array(qtd * 3);
  for (let i = 0; i < qtd; i++) { const r = 8 + Math.random() * 130, a = Math.random() * Math.PI * 2; pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = Math.random() * 30; pos[i * 3 + 2] = Math.sin(a) * r; }
  const geoP = new T.BufferGeometry(); geoP.setAttribute('position', new T.BufferAttribute(pos, 3));
  CAMPO.poeira = new T.Points(geoP, new T.PointsMaterial({ color: 0x9cc4ff, size: 0.22, transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending }));
  cena.add(CAMPO.poeira);
  /* Holograma discreto da logo acima da antena: gira devagar, com linhas de varredura e um feixe
     saindo da antena. A antena solta anéis de pulso, como um sinal de rádio. */
  if (typeof LOGO !== 'undefined' && LOGO.claro) {
    const texHolo = new T.TextureLoader().load(LOGO.claro); texHolo.encoding = T.sRGBEncoding;
    const linhas = new T.CanvasTexture(telaDe(8, 64, (g) => { for (let y = 0; y < 64; y += 4) { g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(0, y, 8, 1.5); } }));
    linhas.wrapS = linhas.wrapT = T.RepeatWrapping; linhas.repeat.set(1, 3); CAMPO.linhasHolo = linhas;
    const largH = 2.6, altH = largH / LOGO.proporcao;
    const holo = new T.Group(); holo.position.set(0, CAMPO.yHolo, 0); torre.add(holo); CAMPO.holo = holo;
    const matHolo = new T.MeshBasicMaterial({ map: texHolo, color: 0xa8dcff, transparent: true, opacity: 0.6, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false });
    const matLinhas = new T.MeshBasicMaterial({ map: linhas, color: 0x7fc8ff, transparent: true, opacity: 0.18, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false });
    [matHolo, matLinhas].forEach((m) => { const p = new T.Mesh(G3.placa, m); p.scale.set(largH, altH, 1); holo.add(p); });
    CAMPO.matHolo = matHolo;
    const feixe = new T.Mesh(new T.CylinderGeometry(largH * 0.55, 0.06, 1.2, 32, 1, true).translate(0, 0.6, 0), new T.MeshBasicMaterial({ map: CAMPO.texFluxo, color: 0x7fc8ff, transparent: true, opacity: 0.12, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    feixe.position.y = CAMPO.yFarol; feixe.scale.y = (CAMPO.yHolo - CAMPO.yFarol) / 1.2; torre.add(feixe);
  }
  CAMPO.pulsosAntena = [0, 1, 2].map(() => {
    const m = new T.Mesh(new T.RingGeometry(0.9, 1, 48), new T.MeshBasicMaterial({ color: 0xff9a52, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = CAMPO.yFarol; torre.add(m); return m;
  });
  // Nuvens leves no alto, longe das empresas (nunca em cima delas)
  const texNuvem = new T.CanvasTexture(telaDe(256, 128, (g) => {
    [[70, 74, 46], [128, 60, 58], [186, 76, 44], [104, 84, 40], [156, 86, 42]].forEach(([x, y, r]) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
    });
  }));
  CAMPO.nuvens = [];
  for (let i = 0; i < (pequeno ? 10 : 18); i++) {
    const s = new T.Sprite(new T.SpriteMaterial({ map: texNuvem, color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false }));
    const larg = 30 + Math.random() * 26; s.scale.set(larg, larg * 0.38, 1);
    s.userData = { r: 90 + Math.random() * 80, a: Math.random() * Math.PI * 2, v: (0.003 + Math.random() * 0.004) * (Math.random() < 0.5 ? 1 : -1), y: 26 + Math.random() * 16, base: 0.28 + Math.random() * 0.16 };
    cena.add(s); CAMPO.nuvens.push(s);
  }
}

/* ---------- Palco: o elemento que guarda o desenho e as plaquinhas (fica vivo entre as telas) ---------- */
function criarPalco() {
  const palco = document.createElement('div'); palco.className = 'campo-palco';
  palco.appendChild(CAMPO.renderer.domElement);
  CAMPO.rotulos = document.createElement('div'); CAMPO.rotulos.className = 'campo-rotulos'; palco.appendChild(CAMPO.rotulos);
  const rotuloTorre = document.createElement('div'); rotuloTorre.className = 'pq-torre'; rotuloTorre.innerHTML = '<b>Real Forte Lab</b>'; CAMPO.rotulos.appendChild(rotuloTorre); CAMPO.rotuloTorre = rotuloTorre;
  CAMPO.el = palco;
  new ResizeObserver(() => ajustarTamanho()).observe(palco);
  ligarControles(palco);
}
function ajustarTamanho() {
  const w = CAMPO.el.clientWidth, h = CAMPO.el.clientHeight; if (!w || !h) return;
  CAMPO.renderer.setSize(w, h, false); CAMPO.camera.aspect = w / h; CAMPO.camera.updateProjectionMatrix();
  CAMPO.largura = w; CAMPO.altura = h;
}

/* ---------- Câmera de mapa ----------
   Arrastar (botão esquerdo ou um dedo): move a cidade, como num mapa (o ponto agarrado fica embaixo do mouse).
   Botão direito, Shift, Ctrl ou o botão do meio: gira e inclina.
   Rodinha ou pinça: aproxima no ponto do mouse, do alto da cidade inteira até rente à porta da torre.
   Dois dedos girando: gira a cidade. Dois cliques: chega perto do ponto.
   Botões na tela: + e −, girar para os dois lados e "Torre RF". Só a apresentação gira sozinha. */
const CAM = { theta: 0.42, phi: 0.95, raio: 110, raioAlvo: 110, alvo: null, vTheta: 0, vPhi: 0, vx: 0, vz: 0, parada: 0, anim: null, ancora: null };
const PHI_MIN = 0.08, RAIO_MIN = 3.5, RAIO_MAX = 380;
// De perto dá para olhar quase na horizontal; de longe a câmera fica mais de cima
const phiMaxDe = (raio) => (CAMPO.espaco && raio > 90 ? Math.min(1.9, 1.25 + (raio - 90) / 80 * 0.65) : raio < 18 ? 1.47 : raio < 70 ? 1.47 - (raio - 18) / 52 * 0.22 : 1.25);   /* no espaço, de longe, a câmera desce até ver a ilha por baixo */
function visaoGeral() {
  let x0 = -57, x1 = 57, z0 = -51, z1 = 63;   // a sede e os centros sempre aparecem
  CAMPO.ilhas.forEach((il) => { if (!il.posicionada) return; const r = 15; x0 = Math.min(x0, il.pos.x - r); x1 = Math.max(x1, il.pos.x + r); z0 = Math.min(z0, il.pos.z - r); z1 = Math.max(z1, il.pos.z + r); });
  const proporcao = CAMPO.largura && CAMPO.altura ? CAMPO.largura / CAMPO.altura : 1.6;
  // Distância para caber a largura (campo de visão de 38°) e a profundidade (a câmera olha inclinada)
  const raio = Math.min(RAIO_MAX, Math.max(110, (x1 - x0) / (2 * 0.344 * proporcao) * 1.1, (z1 - z0) * 1.08));
  return { alvo: new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2 + raio * 0.14), raio, theta: 0.42, phi: 0.8 };   // um pouco para a frente: a legenda não cobre a primeira fila de empresas
}
function visaoDaIlha(il) { return { alvo: il.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), raio: CAMPO.largura / CAMPO.altura < 1 ? 46 : 31, theta: il.grupo.rotation.y + 0.22, phi: 0.92 }; }
function visaoDaTorre() { return { alvo: new THREE.Vector3(0, 13, 3), raio: CAMPO.largura / CAMPO.altura < 1 ? 70 : 52, theta: CAM.theta, phi: 1.2 }; }
// O alvo da câmera não sai da cidade
function limiteDoAlvo() {
  CAM.alvo.x = Math.max(-135, Math.min(135, CAM.alvo.x)); CAM.alvo.z = Math.max(-130, Math.min(140, CAM.alvo.z)); CAM.alvo.y = Math.max(0, Math.min(34, CAM.alvo.y));
}
function animarCamera(para, duracao, depois) {
  CAM.ancora = null; CAM.vx = CAM.vz = CAM.vTheta = CAM.vPhi = 0;
  const de = { alvo: CAM.alvo.clone(), raio: CAM.raio, theta: CAM.theta, phi: CAM.phi };
  let dt = para.theta - de.theta; dt = Math.atan2(Math.sin(dt), Math.cos(dt));   // gira pelo caminho mais curto
  CAM.anim = { de, para: Object.assign({}, para, { theta: de.theta + dt }), t0: performance.now(), duracao, depois };
}
// Põe a câmera no lugar já (usado durante o arrasto, para o ponto agarrado não escorregar)
function atualizarCamera() {
  const c = CAMPO.camera, sp = Math.sin(CAM.phi);
  c.position.set(CAM.alvo.x + CAM.raio * sp * Math.sin(CAM.theta), CAM.alvo.y + CAM.raio * Math.cos(CAM.phi), CAM.alvo.z + CAM.raio * sp * Math.cos(CAM.theta));
  c.lookAt(CAM.alvo); c.updateMatrixWorld();
  /* Precisão de profundidade: o plano de corte da frente acompanha a distância. Com ele fixo bem perto
     da câmera, de longe o piso e as peças finas (faixas, calçadas, tampos) "brigam" e ficam piscando. */
  const perto = Math.min(5, Math.max(0.15, CAM.raio * 0.04)), longe = Math.max(CAMPO.espaco ? 1400 : 600, CAM.raio * 6);
  if (Math.abs(c.near - perto) > perto * 0.05 || c.far !== longe) { c.near = perto; c.far = longe; c.updateProjectionMatrix(); }
  sombraSegueCamera();
  // Névoa que acompanha a distância: de perto a cidade fica nítida; de longe, os bairros de fora e as
  // montanhas somem aos poucos no ar (profundidade de cidade grande)
  const nv = CAMPO.cena && CAMPO.cena.fog; if (nv) { if (CAMPO.espaco) { nv.near = 2000; nv.far = 4000; } else { nv.near = 70 + CAM.raio * 0.85; nv.far = 320 + CAM.raio * 1.7; } }
}
/* Sombra do sol que acompanha a câmera: de perto cobre uma área pequena (sombra nítida); de longe,
   a cidade toda. O centro anda em passos do tamanho de um pixel do mapa de sombra, para a sombra
   não tremer quando a câmera desliza. */
function sombraSegueCamera() {
  const L = CAMPO.luzes; if (!L || !L.sol) return;
  const sol = L.sol, sc = sol.shadow.camera, p = CAMPO.luzDoCeu, T = THREE;
  const S = CAMPO.tmpSombra || (CAMPO.tmpSombra = { d: new T.Vector3(), u: new T.Vector3(), v: new T.Vector3(), c: new T.Vector3(), y: new T.Vector3(0, 1, 0) });
  const meia = Math.max(28, Math.min(118, CAM.raio * 0.8));
  S.d.set(p ? p.sol[2] : 45, p ? p.sol[3] : 80, p ? p.sol[4] : 35).normalize();
  S.u.crossVectors(S.y, S.d).normalize(); S.v.crossVectors(S.d, S.u).normalize();
  const px = (2 * meia) / sol.shadow.mapSize.x, a = Math.round(CAM.alvo.dot(S.u) / px) * px, b = Math.round(CAM.alvo.dot(S.v) / px) * px;
  S.c.copy(S.u).multiplyScalar(a).addScaledVector(S.v, b);
  // volta para o chão (y = 0) ao longo da direção do sol
  S.c.addScaledVector(S.d, -S.c.y / S.d.y);
  sol.position.copy(S.c).addScaledVector(S.d, 140); sol.target.position.copy(S.c); sol.target.updateMatrixWorld();
  if (sc.right !== meia || sc.far !== 300) { Object.assign(sc, { left: -meia, right: meia, top: meia, bottom: -meia, near: 5, far: 300 }); sc.updateProjectionMatrix(); }
}
function passoCamera(dt) {
  const agora = performance.now();
  if (CAM.anim) {
    const a = CAM.anim; const p = Math.min(1, (agora - a.t0) / a.duracao); const s = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    CAM.alvo.lerpVectors(a.de.alvo, a.para.alvo, s); CAM.raio = CAM.raioAlvo = a.de.raio + (a.para.raio - a.de.raio) * s;
    CAM.theta = a.de.theta + (a.para.theta - a.de.theta) * s; CAM.phi = a.de.phi + (a.para.phi - a.de.phi) * s;
    if (p >= 1) { CAM.anim = null; if (a.depois) a.depois(); }
  } else {
    if (!CAM.arrastando) {
      // Inércia: depois de soltar, a cidade ainda desliza um pouco
      CAM.alvo.x += CAM.vx; CAM.alvo.z += CAM.vz; CAM.theta += CAM.vTheta; CAM.phi += CAM.vPhi;
      const atrito = Math.pow(0.86, dt * 60); CAM.vx *= atrito; CAM.vz *= atrito; CAM.vTheta *= atrito; CAM.vPhi *= atrito;
      if (CAMPO.ap && !CAMPO.ap.pausado && !movimentoReduzido()) CAM.theta += 0.025 * dt;
    }
    // Aproximar suave, mantendo parado na tela o ponto que estava embaixo do mouse
    const antes = CAM.raio; CAM.raio += (CAM.raioAlvo - CAM.raio) * Math.min(1, dt * 9);
    if (CAM.ancora && antes > 0) {
      const k = CAM.raio / antes, A = CAM.ancora;
      CAM.alvo.set(A.x + (CAM.alvo.x - A.x) * k, A.y + (CAM.alvo.y - A.y) * k, A.z + (CAM.alvo.z - A.z) * k);
      if (Math.abs(CAM.raioAlvo - CAM.raio) < 0.02) CAM.ancora = null;
    }
    if (CAM.raio > 80 && CAM.alvo.y > 0 && !CAM.ancora) CAM.alvo.y = Math.max(0, CAM.alvo.y - dt * 8);   // de longe, o alvo volta para o chão
    CAM.phi = Math.min(phiMaxDe(CAM.raio), Math.max(PHI_MIN, CAM.phi));
    limiteDoAlvo();
  }
  // A névoa acompanha a distância (de longe, a cidade toda continua nítida)
  const nevoa = CAMPO.cena.fog; nevoa.near = Math.max(130, CAM.raio * 1.3); nevoa.far = Math.max(330, CAM.raio * 3);
  atualizarCamera();
}
function ligarControles(palco) {
  const tela = CAMPO.renderer.domElement; const toques = new Map();
  let inicio = null, modo = '', pinca = null, agarrado = null;
  const ray = new THREE.Raycaster(), ponto = new THREE.Vector2();
  const raioDaTela = (cx, cy) => { const r = tela.getBoundingClientRect(); ponto.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); ray.setFromCamera(ponto, CAMPO.camera); return ray; };
  const ilhaNoPonto = (cx, cy) => { const hit = raioDaTela(cx, cy).intersectObjects([...CAMPO.ilhas.values()].map((il) => il.alvo), false)[0]; return hit ? hit.object.userData.ilha : ''; };
  const centroNoPonto = (cx, cy) => { if (CAMPO.ap) return ''; const hit = raioDaTela(cx, cy).intersectObjects(PLANO.alvos, false)[0]; return hit && CENTROS[hit.object.userData.centro] ? hit.object.userData.centro : ''; };
  // Ponto embaixo do mouse: o prédio alto que ele toca (torre e centros) ou o chão (num plano na altura pedida)
  const plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), noChao = new THREE.Vector3();
  const pontoNoPlano = (cx, cy, y) => { plano.constant = -(y || 0); const r = raioDaTela(cx, cy); return r.ray.intersectPlane(plano, noChao) ? noChao.clone() : null; };
  const pontoAlvo = (cx, cy) => {
    const r = raioDaTela(cx, cy); const altos = PLANO.alvos.concat(CAMPO.alvoTorre ? [CAMPO.alvoTorre] : []);
    const hit = r.intersectObjects(altos, false)[0]; if (hit && hit.distance < CAM.raio * 2.5) return hit.point.clone();
    const p = pontoNoPlano(cx, cy, 0); if (!p || p.distanceTo(CAMPO.camera.position) > CAM.raio * 4) return null; return p;
  };
  const girar = (dx, dy) => { CAM.vTheta = -dx * 0.006; CAM.vPhi = -dy * 0.004; CAM.theta += CAM.vTheta; CAM.phi = Math.min(phiMaxDe(CAM.raio), Math.max(PHI_MIN, CAM.phi + CAM.vPhi)); atualizarCamera(); };
  // Arrastar o mapa: o ponto agarrado continua embaixo do dedo/mouse
  const arrastarPara = (cx, cy) => {
    if (!agarrado) return; const p = pontoNoPlano(cx, cy, agarrado.y); if (!p) return;
    let dx = agarrado.x - p.x, dz = agarrado.z - p.z; const lim = Math.max(2, CAM.raio * 0.15), d = Math.hypot(dx, dz); if (d > lim) { dx *= lim / d; dz *= lim / d; }
    CAM.alvo.x += dx; CAM.alvo.z += dz; limiteDoAlvo(); CAM.vx = dx * 0.6; CAM.vz = dz * 0.6; atualizarCamera();
  };
  const zoom = (fator, cx, cy) => {
    const novo = Math.min(RAIO_MAX, Math.max(RAIO_MIN, CAM.raioAlvo * fator)); if (novo === CAM.raioAlvo) return;
    CAM.anim = null; CAM.raioAlvo = novo;
    if (cx != null) { const p = pontoAlvo(cx, cy); if (p) CAM.ancora = p; } else CAM.ancora = null;
  };
  CAMPO.zoomCampo = zoom;
  tela.addEventListener('contextmenu', (ev) => ev.preventDefault());
  tela.addEventListener('pointerdown', (ev) => {
    tela.setPointerCapture(ev.pointerId); toques.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    CAM.parada = performance.now(); if (CAM.anim && !CAM.anim.depois) CAM.anim = null; CAM.vx = CAM.vz = CAM.vTheta = CAM.vPhi = 0;
    if (toques.size === 1) {
      inicio = { x: ev.clientX, y: ev.clientY, t: performance.now(), tipo: ev.pointerType };
      modo = (ev.button === 2 || ev.button === 1 || ev.shiftKey || ev.ctrlKey || ev.altKey) ? 'girar' : 'mover';
      const p = pontoNoPlano(ev.clientX, ev.clientY, CAM.alvo.y); agarrado = p;
    }
    if (toques.size === 2) {
      const [a, b] = [...toques.values()];
      pinca = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      agarrado = pontoNoPlano(pinca.mx, pinca.my, CAM.alvo.y); modo = 'pinca'; CAM.arrastando = true;
    }
  });
  tela.addEventListener('pointermove', (ev) => {
    if (!toques.has(ev.pointerId)) {   // só passando o mouse: acha a empresa ou o centro embaixo
      if (ev.pointerType === 'mouse') {
        const id = ilhaNoPonto(ev.clientX, ev.clientY), c = id ? '' : centroNoPonto(ev.clientX, ev.clientY);
        if (id !== CAMPO.hover || c !== CAMPO.hoverCentro) { CAMPO.hover = id; CAMPO.hoverCentro = c; tela.style.cursor = id || c ? 'pointer' : 'grab'; }
      }
      return;
    }
    const antes = toques.get(ev.pointerId); const dx = ev.clientX - antes.x, dy = ev.clientY - antes.y;
    toques.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }); CAM.parada = performance.now();
    if (modo === 'pinca' && toques.size === 2) {
      const [a, b] = [...toques.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (pinca && pinca.d && d) { CAM.raio = CAM.raioAlvo = Math.min(RAIO_MAX, Math.max(RAIO_MIN, CAM.raio * pinca.d / d)); CAM.theta -= Math.atan2(Math.sin(ang - pinca.ang), Math.cos(ang - pinca.ang)); atualizarCamera(); }
      arrastarPara(mx, my); pinca = { d, ang, mx, my }; return;
    }
    if (inicio && Math.hypot(ev.clientX - inicio.x, ev.clientY - inicio.y) > 5) CAM.arrastando = true;
    if (!CAM.arrastando) return;
    tela.style.cursor = 'grabbing';
    if (modo === 'girar') girar(dx, dy); else arrastarPara(ev.clientX, ev.clientY);
  });
  const soltar = (ev) => {
    const foiToque = inicio && !CAM.arrastando && toques.size === 1 && performance.now() - inicio.t < 600 && modo !== 'pinca';
    toques.delete(ev.pointerId);
    if (toques.size === 1 && modo === 'pinca') { const [o] = [...toques.values()]; agarrado = pontoNoPlano(o.x, o.y, CAM.alvo.y); modo = 'mover'; pinca = null; inicio = null; return; }
    if (toques.size === 0) { CAM.arrastando = false; agarrado = null; pinca = null; tela.style.cursor = CAMPO.hover || CAMPO.hoverCentro ? 'pointer' : 'grab'; }
    if (!foiToque) return;
    const id = ilhaNoPonto(ev.clientX, ev.clientY);
    if (!id) { CAMPO.escolhida = ''; const c = centroNoPonto(ev.clientX, ev.clientY); if (c) abrirCentro(c); return; }
    if (inicio.tipo !== 'mouse' && CAMPO.escolhida !== id) {   // no toque: o primeiro toque escolhe, o segundo abre
      CAMPO.escolhida = id; const il = CAMPO.ilhas.get(id);
      if (il) animarCamera(Object.assign(visaoDaIlha(il), { raio: Math.max(visaoDaIlha(il).raio * 1.6, 30) }), 700);
      return;
    }
    abrirIlha(id);
  };
  tela.addEventListener('pointerup', soltar); tela.addEventListener('pointercancel', (ev) => { toques.delete(ev.pointerId); if (!toques.size) { CAM.arrastando = false; agarrado = null; } });
  tela.addEventListener('pointerleave', () => { CAMPO.mouseNoCampo = false; if (!toques.size) { CAMPO.hover = ''; CAMPO.hoverCentro = ''; } });
  tela.addEventListener('pointerenter', () => { CAMPO.mouseNoCampo = true; });
  tela.addEventListener('wheel', (ev) => { ev.preventDefault(); CAM.parada = performance.now(); zoom(Math.exp(Math.max(-60, Math.min(60, ev.deltaY)) * (ev.ctrlKey ? 0.01 : 0.0022)), ev.clientX, ev.clientY); }, { passive: false });
  // Dois cliques: chega perto do ponto (no prédio, se clicou num)
  tela.addEventListener('dblclick', (ev) => {
    const p = pontoAlvo(ev.clientX, ev.clientY); if (!p) return;
    animarCamera({ alvo: p, raio: Math.max(RAIO_MIN * 2.5, CAM.raio * 0.4), theta: CAM.theta, phi: Math.min(phiMaxDe(CAM.raio * 0.4), CAM.phi + 0.1) }, 650);
  });
  // Plaquinha: passar por cima levanta a ilha; clicar voa e abre
  CAMPO.rotulos.addEventListener('mouseover', (ev) => { const a = ev.target.closest('.pq'); CAMPO.hoverPlaca = a ? a.dataset.ilha : ''; });
  CAMPO.rotulos.addEventListener('mouseout', (ev) => { if (!ev.relatedTarget || !ev.relatedTarget.closest || !ev.relatedTarget.closest('.pq')) CAMPO.hoverPlaca = ''; });
  CAMPO.rotulos.addEventListener('click', (ev) => { const a = ev.target.closest('.pq'); if (!a) return; ev.preventDefault(); abrirIlha(a.dataset.ilha); });
  // Botões na tela: aproximar, afastar, girar e ir até a torre
  const botoes = document.createElement('div'); botoes.className = 'campo-zoom';
  botoes.innerHTML = '<button data-z="+" title="Aproximar" aria-label="Aproximar">+</button><button data-z="-" title="Afastar" aria-label="Afastar">−</button><button data-z="ge" title="Girar para a esquerda" aria-label="Girar para a esquerda">⟲</button><button data-z="gd" title="Girar para a direita" aria-label="Girar para a direita">⟳</button><button class="txt" data-z="torre" title="Ir até a torre Real Forte">Torre RF</button>';
  botoes.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return; const z = b.dataset.z; CAM.parada = performance.now();
    if (z === '+') zoom(0.6); else if (z === '-') zoom(1.6);
    else if (z === 'ge' || z === 'gd') animarCamera({ alvo: CAM.alvo.clone(), raio: CAM.raio, theta: CAM.theta + (z === 'ge' ? -Math.PI / 4 : Math.PI / 4), phi: CAM.phi }, 450);
    else if (z === 'torre') animarCamera(visaoDaTorre(), 900);
  });
  palco.appendChild(botoes); CAMPO.botoesCamera = botoes;
  // Rótulo do centro (aparece ao passar o mouse)
  CAMPO.rotuloCentro = document.createElement('div'); CAMPO.rotuloCentro.className = 'rotulo-centro'; CAMPO.rotuloCentro.style.display = 'none'; CAMPO.rotulos.appendChild(CAMPO.rotuloCentro);
  window.addEventListener('hashchange', () => { if (CAMPO.cartaoCentro) CAMPO.cartaoCentro.hidden = true; });
}

function abrirIlha(id) {
  const il = CAMPO.ilhas.get(id); if (!il) return;
  CAMPO.voltarDe = id;
  if (movimentoReduzido()) { location.hash = 'e-' + id; return; }
  CAMPO.escolhida = id;
  animarCamera(visaoDaIlha(il), 750, () => {
    // A página da empresa vai abrir num círculo que nasce do ponto da ilha na tela
    const v = il.pos.clone().add(new THREE.Vector3(0, 1.5, 0)).project(CAMPO.camera); const r = CAMPO.renderer.domElement.getBoundingClientRect();
    UI.origemTransicao = { x: Math.round(r.left + (v.x + 1) / 2 * r.width), y: Math.round(r.top + (1 - v.y) / 2 * r.height), t: performance.now() };
    location.hash = 'e-' + id;
  });
}
function recentrarCampo() { CAMPO.escolhida = ''; animarCamera(visaoGeral(), 900); }

/* ---------- Atualizar ilhas a partir dos dados do painel ---------- */
function atualizarIlhas() {
  const empresas = empresasAtivas().slice().sort((a, b) => String(a.criadoEm || '').localeCompare(String(b.criadoEm || '')) || String(a.id).localeCompare(String(b.id)));
  const vistas = new Set(); let mudou = false;
  empresas.forEach((e) => {
    const D = dadosDaIlha(e); const assinatura = JSON.stringify(D); vistas.add(e.id);
    const atual = CAMPO.ilhas.get(e.id);
    if (atual && atual.assinatura === assinatura) return;
    if (atual) descartarIlha(atual);
    const il = montarIlha(D); il.assinatura = assinatura; CAMPO.ilhas.set(e.id, il); mudou = true;
  });
  [...CAMPO.ilhas.keys()].forEach((id) => { if (!vistas.has(id)) { descartarIlha(CAMPO.ilhas.get(id)); CAMPO.ilhas.delete(id); mudou = true; } });
  // Cada empresa no seu lote do plano diretor (a primeira cadastrada no lote da frente)
  const lista = empresas.map((e) => CAMPO.ilhas.get(e.id));
  const chave = lista.map((il) => il.id).join('|');
  lista.forEach((il, i) => {
    const L = loteDaEmpresa(i); il.lote = L;
    if (!il.posicionada || il.pos.x !== L.cx || il.pos.z !== L.cz || il.grupo.rotation.y !== L.giro) { posicionarIlha(il, L.cx, L.cz, L.giro); mudou = true; }
  });
  if (CAMPO.lotesOcupados !== lista.length) { CAMPO.lotesOcupados = lista.length; mudou = true; }
  if (mudou || !CAMPO.mundo) montarMundo(lista);
  if (CAMPO.chave !== chave) { CAMPO.chave = chave; if (!CAM.anim && CAMPO.iniciado && CAMPO.rodando) animarCamera(visaoGeral(), 900); }
}

/* ---------- Quadro a quadro ---------- */
function quadro(agora) {
  if (!CAMPO.rodando) return;
  CAMPO.raf = requestAnimationFrame(quadro);
  const dt = Math.min(0.05, ((agora - (CAMPO.ultimo || agora)) / 1000) || 0.016); CAMPO.ultimo = agora;
  const parado = movimentoReduzido();
  if (!parado) CAMPO.t += dt;
  const t = CAMPO.t;
  passoCamera(dt);
  const ativa = CAMPO.ap ? '' : (CAMPO.hover || CAMPO.hoverPlaca || CAMPO.escolhida || CAMPO.festejando);
  CAMPO.ilhas.forEach((il) => {
    const mostrar = !CAMPO.ap || CAMPO.ap.id === il.id;   // na apresentação, só a ilha do cliente
    il.grupo.visible = mostrar; il.poca.visible = false;   // sem o brilho embaixo (era o que dava cara de maquete)
    il.rotuloPonte.style.display = 'none';
    if (!mostrar) return;
    il.matAro.emissiveIntensity = (ativa === il.id ? 1.6 : 0.75) + Math.sin(t * 2 + il.fase) * 0.25;
    const corAro = CAMPO.festejando === il.id && Math.sin(t * 6) > 0 ? 0x2fbf71 : COR_SAUDE[il.dados.saude];
    il.matAro.color.setHex(corAro); il.matAro.emissive.setHex(corAro);
    il.poca.material.opacity = ativa === il.id ? 0.26 : 0.12;
    const acesa = ativa === il.id;
    il.matFluxo.opacity = acesa ? 1 : 0.75;
    il.texFluxo.offset.x -= dt * il.velFluxo * (acesa ? 2 : 1);
    if (acesa && !CAMPO.ap && il.pontoEstacao) { il.rotuloPonte.style.display = ''; const m = il.pontoEstacao; colocarRotulo(il.rotuloPonte, m.x, m.y + 2.2, m.z, 40); il.rotuloPonte.style.zIndex = '1500'; }
    il.animados.forEach((f) => f(t, dt));
  });
  passoMundo(t, parado ? 0 : dt);
  CAMPO.anelTorre.rotation.z = t * 0.6; CAMPO.anelTorre.position.y = 7.5 + Math.sin(t * 1.2) * 1.2;
  CAMPO.brilhoCoroa.material.opacity = 0.14 + Math.sin(t * 1.3) * 0.05;
  // As telas da equipe da cobertura piscando de leve
  (CAMPO.telas || []).forEach((m, i) => { m.emissiveIntensity = 1.05 + Math.sin(t * 3 + i * 2) * 0.15; });
  if (!CAMPO.proximaJanela || t > CAMPO.proximaJanela) { CAMPO.proximaJanela = t + 3; if (CAMPO.janelasTorre) CAMPO.janelasTorre.redesenhar(); }
  CAMPO.farol.material.opacity = 0.65 + Math.sin(t * 2.5) * 0.3;
  // Holograma girando, varredura correndo e pulsos saindo da antena
  if (CAMPO.holo) { CAMPO.holo.rotation.y = t * 0.35; CAMPO.holo.position.y = CAMPO.yHolo + Math.sin(t * 1.1) * 0.12; CAMPO.linhasHolo.offset.y = -t * 0.25; CAMPO.matHolo.opacity = 0.52 + Math.sin(t * 7) * 0.03 + (Math.sin(t * 0.9) > 0.97 ? -0.25 : 0); }
  (CAMPO.pulsosAntena || []).forEach((m, i) => { const k = (t * 0.45 + i / 3) % 1; m.scale.setScalar(0.25 + k * 3.4); m.material.opacity = 0.55 * (1 - k) * (1 - k); });
  (CAMPO.nuvens || []).forEach((s) => { const u = s.userData; u.a += u.v * (dt || 0.016); s.position.set(Math.cos(u.a) * u.r, u.y, Math.sin(u.a) * u.r); });
  CAMPO.poeira.rotation.y = t * 0.01;
  passoEfeitos(dt); passoApresentacao(dt, t); passoCeu(dt);
  renderizarCinema();   // desenho com o acabamento de cinema (ou direto, se o aparelho não suportar)
  posicionarRotulos(ativa);
}
const _p = { v: null };
// Prende um elemento HTML num ponto do 3D (some quando o ponto sai da tela ou fica atrás da câmera)
function colocarRotulo(el, x, y, z, base) {
  if (!_p.v) _p.v = new THREE.Vector3();
  const v = _p.v, w = CAMPO.largura, h = CAMPO.altura, cam = CAMPO.camera;
  v.set(x, y, z); const dist = cam.position.distanceTo(v); v.project(cam);
  if (v.z > 1 || v.x < -1.3 || v.x > 1.3) { el.style.visibility = 'hidden'; return; }
  el.style.visibility = 'visible';
  const s = Math.min(1.08, Math.max(CAMPO.largura < 500 ? 0.6 : 0.72, (base || 46) / dist));
  el.style.transform = `translate3d(${((v.x + 1) / 2 * w).toFixed(1)}px, ${((1 - v.y) / 2 * h).toFixed(1)}px, 0) translate(-50%, -100%) scale(${s.toFixed(3)})`;
  el.style.zIndex = String(1000 - Math.round(dist));
}
function posicionarRotulos(ativa) {
  CAMPO.ilhas.forEach((il) => {
    il.plaquinha.style.display = CAMPO.ap ? 'none' : '';
    if (CAMPO.ap) return;
    colocarRotulo(il.plaquinha, il.grupo.position.x, il.grupo.position.y + 7.2, il.grupo.position.z);
    il.plaquinha.classList.toggle('aberta', ativa === il.id);
  });
  const rc = CAMPO.rotuloCentro;
  if (rc) { const c = !CAMPO.ap && CAMPO.hoverCentro; if (c && CENTROS[c]) { const tp = PLANO.topoCentro[c]; if (rc.dataset.c !== c) { rc.dataset.c = c; rc.textContent = CENTROS[c].nome + ' · clique para abrir'; } rc.style.display = ''; colocarRotulo(rc, tp.x, tp.y + 1.2, tp.z, 70); } else rc.style.display = 'none'; }
  if (CAMPO.botoesCamera) CAMPO.botoesCamera.style.display = CAMPO.ap ? 'none' : '';
  if (CAMPO.ap && CAMPO.cartaoCentro) CAMPO.cartaoCentro.hidden = true;
  CAMPO.rotuloTorre.style.display = CAMPO.ap ? 'none' : '';
  // Com o holograma da logo no alto, o rótulo em texto sai (seria repetido)
  if (CAMPO.holo) CAMPO.rotuloTorre.style.display = 'none';
  else if (!CAMPO.ap) colocarRotulo(CAMPO.rotuloTorre, 0, CAMPO.topoTorre + 2.6, 0, 60);
}

/* ---------- Efeitos: fogos, textos que sobem e pequenas animações com hora para acabar ---------- */
function fogos(pos, quantidade) {
  const T = THREE, n = quantidade || 90;
  const posicoes = new Float32Array(n * 3), cores = new Float32Array(n * 3), vel = [];
  const paleta = [new T.Color(0x2fbf71), new T.Color(0xffa257), new T.Color(0xffe08a), new T.Color(0x7fd3ff)];
  for (let i = 0; i < n; i++) {
    posicoes.set([pos.x, pos.y, pos.z], i * 3);
    const c = paleta[i % paleta.length]; cores.set([c.r, c.g, c.b], i * 3);
    const a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1), v = 3 + Math.random() * 3.5;
    vel.push(new T.Vector3(Math.sin(b) * Math.cos(a) * v, Math.abs(Math.cos(b)) * v + 2, Math.sin(b) * Math.sin(a) * v));
  }
  const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(posicoes, 3)); geo.setAttribute('color', new T.BufferAttribute(cores, 3));
  const matP = new T.PointsMaterial({ size: 0.55, map: CAMPO.texBrilho, vertexColors: true, transparent: true, opacity: 1, depthWrite: false, blending: T.AdditiveBlending });
  const pts = new T.Points(geo, matP); CAMPO.cena.add(pts);
  CAMPO.efeitos.push({ t: 0, dur: 2.4, passo: (t, dt) => {
    const arr = geo.attributes.position.array;
    vel.forEach((v, i) => { v.y -= 5.5 * dt; v.multiplyScalar(Math.pow(0.985, dt * 60)); arr[i * 3] += v.x * dt; arr[i * 3 + 1] += v.y * dt; arr[i * 3 + 2] += v.z * dt; });
    geo.attributes.position.needsUpdate = true; matP.opacity = Math.max(0, 1 - t / 2.4);
  }, fim: () => { CAMPO.cena.remove(pts); geo.dispose(); matP.dispose(); } });
}
function textoQueSobe(html, pos, dur) {
  const el = document.createElement('div'); el.className = 'festa-campo'; el.innerHTML = html; CAMPO.rotulos.appendChild(el);
  const p = pos.clone(), total = dur || 4;
  CAMPO.efeitos.push({ t: 0, dur: total, passo: (t) => {
    colocarRotulo(el, p.x, p.y + Math.min(t, 1.2) * 0.7, p.z, 30);
    el.style.opacity = String(t < 0.3 ? t / 0.3 : t > total - 0.8 ? Math.max(0, (total - t) / 0.8) : 1);
  }, fim: () => el.remove() });
}
const depoisDe = (segundos, fn) => CAMPO.efeitos.push({ t: 0, dur: segundos, passo: null, fim: fn });
function passoEfeitos(dt) {
  for (let i = CAMPO.efeitos.length - 1; i >= 0; i--) {
    const e = CAMPO.efeitos[i]; e.t += dt;
    if (e.passo) e.passo(Math.min(e.t, e.dur), dt);
    if (e.t >= e.dur) { CAMPO.efeitos.splice(i, 1); if (e.fim) e.fim(); }
  }
}

/* ---------- Dia e noite ----------
   O céu do campo segue o relógio do aparelho: dia (7h às 16h30), entardecer (16h30 às 18h30
   e 5h30 às 7h) e noite. À noite as janelas acendem e os postes ligam. O botão de hora no
   rodapé do campo troca na mão (dia, entardecer, noite) e volta para o automático. */
const PERIODOS = {
  dia: { nome: 'Dia', ceu: ['#5d8fd8', '#a8c8ee', '#f4e6d4'], nevoa: 0xe6e4df, chao: 0xb3bea9, circuito: 0, linha: 0x7fa3d6, linhaOp: 0.35, hemi: [0xdfe8ff, 0x8a9bb5, 0.55], sol: [0xfff3e2, 3.1, 70, 62, 48], contra: 0.22, exposicao: 0.9, janelas: 0.35, postes: 0, poeira: 0.12, radar: 0.05 },
  entardecer: { nome: 'Entardecer', ceu: ['#2e3f78', '#a05a78', '#f2a46a'], nevoa: 0xe0b49a, chao: 0x8f8f86, circuito: 0.35, linha: 0xc78a8a, linhaOp: 0.3, hemi: [0xffc9a0, 0x2a2f52, 0.6], sol: [0xff9a50, 2.5, 95, 22, 10], contra: 0.3, exposicao: 1.0, janelas: 1.0, postes: 0.6, poeira: 0.35, radar: 0.09 },
  noite: { nome: 'Noite', ceu: ['#1a3460', '#101f38', '#151c2a'], nevoa: 0x161d2b, chao: 0x2c323e, circuito: 0.6, linha: 0x2a5590, linhaOp: 0.55, hemi: [0xcfe0ff, 0x0b1729, 0.9], sol: [0xdfe6ff, 1.35, 45, 80, 35], contra: 0.45, exposicao: 1.08, janelas: 1.5, postes: 1, poeira: 0.55, radar: 0.12 }
};
const ORDEM_PERIODOS = ['', 'dia', 'entardecer', 'noite'];   // '' = automático, pelo relógio
function periodoPeloRelogio(d) {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 7 && h < 16.5) return 'dia';
  if ((h >= 16.5 && h < 18.5) || (h >= 5.5 && h < 7)) return 'entardecer';
  return 'noite';
}
function periodoAtual() { return CAMPO.horaManual || periodoPeloRelogio(new Date()); }
// Mistura dois períodos (t de 0 a 1), para a troca ser suave
function misturarPeriodos(a, b, t) {
  const C = (x, y) => new THREE.Color(x).lerp(new THREE.Color(y), t);
  const n = (x, y) => x + (y - x) * t;
  return {
    ceu: a.ceu.map((c, i) => '#' + C(c, b.ceu[i]).getHexString()), nevoa: C(a.nevoa, b.nevoa), chao: C(a.chao, b.chao), linha: C(a.linha, b.linha), linhaOp: n(a.linhaOp, b.linhaOp),
    hemi: [C(a.hemi[0], b.hemi[0]), C(a.hemi[1], b.hemi[1]), n(a.hemi[2], b.hemi[2])], sol: [C(a.sol[0], b.sol[0]), n(a.sol[1], b.sol[1]), n(a.sol[2], b.sol[2]), n(a.sol[3], b.sol[3]), n(a.sol[4], b.sol[4])],
    circuito: n(a.circuito, b.circuito), contra: n(a.contra, b.contra), exposicao: n(a.exposicao, b.exposicao), janelas: n(a.janelas, b.janelas), postes: n(a.postes, b.postes), poeira: n(a.poeira, b.poeira), radar: n(a.radar, b.radar)
  };
}
// Pisos que escurecem à noite (calçada, grama, caminhos, hall e praça): a cor de dia fica guardada
function pisoNoturno(m) { (CAMPO.pisosNoite = CAMPO.pisosNoite || []).push([m, m.color.getHex()]); return m; }
const COR_NOITE = { piso: 0x4a5466, grama: 0x2f4a3a };
function aplicarCeu(p) {
  const L = CAMPO.luzes; if (!L) return;
  if (!CAMPO.tmpCor) CAMPO.tmpCor = new THREE.Color();
  (CAMPO.pisosNoite || []).forEach(([m, base]) => { m.color.setHex(base).lerp(CAMPO.tmpCor.setHex(m === CAMPO.vida.grama ? COR_NOITE.grama : COR_NOITE.piso), p.postes * 0.78); });
  CAMPO.el.style.background = `radial-gradient(120% 80% at 50% 0%, ${p.ceu[0]} 0%, ${p.ceu[1]} 48%, ${p.ceu[2]} 100%)`;
  CAMPO.cena.fog.color.copy(p.nevoa); L.chao.material.color.copy(p.chao);
  CAMPO.corChao = p.chao.clone();
  L.hemi.color.copy(p.hemi[0]); L.hemi.groundColor.copy(p.hemi[1]); L.hemi.intensity = p.hemi[2];
  L.sol.color.copy(p.sol[0]); L.sol.intensity = p.sol[1]; L.sol.position.set(p.sol[2], p.sol[3], p.sol[4]);
  L.contra.intensity = p.contra; CAMPO.renderer.toneMappingExposure = p.exposicao;
  CAMPO.matSetor.emissiveIntensity = 0.35 * p.janelas;
  (CAMPO.matsTorre || []).forEach(([m, base]) => { m.emissiveIntensity = base * Math.max(0.35, p.janelas * 0.75); });
  CAMPO.poeira.material.opacity = p.poeira;
  (CAMPO.nuvens || []).forEach((s) => { s.material.opacity = s.userData.base * Math.max(0.35, 1.25 - p.janelas * 0.55); s.material.color.set(0xffffff).lerp(p.nevoa, 0.35); });
  CAMPO.luzDoCeu = p;
  try { sombraSegueCamera(); } catch (e) { /* câmera ainda não pronta */ }
}
// Chamado a cada quadro: troca de período com uma transição de 2,5 s
const fachadaComum = (m) => Object.values(CAMPO.fachadas || {}).some((f) => f.mat === m);
function passoCeu(dt) {
  const alvo = periodoAtual();
  if (!CAMPO.ceu) { CAMPO.ceu = { de: alvo, para: alvo, t: 1 }; aplicarCeu(misturarPeriodos(PERIODOS[alvo], PERIODOS[alvo], 1)); }
  const c = CAMPO.ceu;
  if (c.para !== alvo) { c.de = c.t >= 1 ? c.para : c.de; c.para = alvo; c.t = 0; c.t0 = performance.now(); }
  if (c.t < 1) { c.t = Math.min(1, (performance.now() - c.t0) / 2500); aplicarCeu(misturarPeriodos(PERIODOS[c.de], PERIODOS[c.para], c.t)); }
  const p = CAMPO.luzDoCeu;
  // De dia, no automático: o piso começa branco de manhã e vai ganhando um tom mais fundo à tarde
  if (!CAMPO.horaManual && periodoAtual() === 'dia' && CAMPO.corChao && CAMPO.ceu && CAMPO.ceu.t >= 1) {
    const h = new Date().getHours() + new Date().getMinutes() / 60, k = Math.max(0, Math.min(1, (h - 8) / 8.5));
    CAMPO.luzes.chao.material.color.copy(CAMPO.corChao).lerp(new THREE.Color(0xc4cbd5), k);
  }
  CAMPO.atividade = 1 - 0.78 * p.postes;   // 1 de dia, ~0,2 à noite: quem passa do limiar vai para casa (fica o turno da noite)
  (CAMPO.luzesHall || []).forEach((s) => { s.material.opacity = 0.35 + p.postes * 0.6; });
  (CAMPO.luzesInternasSede || []).forEach((l) => { l.intensity = 0.9 + p.postes * 1.5; });
  (CAMPO.postesSede || []).forEach((s) => { s.material.opacity = p.postes * 0.95; s.visible = p.postes > 0.02; });
  CAMPO.ilhas.forEach((il) => {
    const turno = turnoDe(il), apaga = 1 - p.postes * (1 - (0.25 + 0.75 * turno));   // cidade que descansa: menos janela acesa
    il.postes.forEach((s) => { s.material.opacity = p.postes * 0.9 * (0.5 + 0.5 * turno); s.visible = p.postes > 0.02; });
    if (il.matPocaLuz) { il.matPocaLuz.opacity = p.postes * 0.5; (il.pocasLuz || []).forEach((m) => { m.visible = p.postes > 0.02; }); }
    // Fachadas iguais em várias cidades (o mesmo material) ficam como estão; as próprias da cidade seguem o turno
    il.matsJanela.forEach(([m, base]) => { m.emissiveIntensity = base * p.janelas * (fachadaComum(m) ? 1 : apaga); });
  });
  // Rótulo do botão de hora (no rodapé do campo)
  const chip = document.getElementById('ch-hora');
  if (chip) {
    const agora = new Date(); const hhmm = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const texto = CAMPO.horaManual ? PERIODOS[CAMPO.horaManual].nome : `${PERIODOS[alvo].nome} · ${hhmm}`;
    if (chip.dataset.texto !== texto) { chip.dataset.texto = texto; chip.querySelector('span:last-child').textContent = texto; }
  }
}
function trocarHoraDoCampo() {
  const i = ORDEM_PERIODOS.indexOf(CAMPO.horaManual || '');
  CAMPO.horaManual = ORDEM_PERIODOS[(i + 1) % ORDEM_PERIODOS.length];
  const chip = document.getElementById('ch-hora'); if (chip) chip.dataset.texto = '';
}
/* ---------- Comemoração: quando um gargalo é resolvido, a ilha da empresa comemora no Início ----------
   O painel chama comemorarNoCampo ao marcar "Resolvido". Na próxima vez que o Início abre, a câmera vai
   até o prédio do setor, o andar verde novo sobe, saem fogos e as horas devolvidas aparecem no alto. */
function comemorarNoCampo(gargaloId, texto) {
  const g = gargaloPorId(gargaloId); if (!g) return;
  CAMPO.festa = { empresaId: g.empresaId, setorId: g.setorId, gargaloId, texto: texto || '' };
}
function executarFesta() {
  const f = CAMPO.festa; CAMPO.festa = null;
  const il = f && CAMPO.ilhas.get(f.empresaId); if (!il) return;
  const st = il.setores.get(f.setorId);
  const g = gargaloPorId(f.gargaloId); const h = g ? horasLivres(g) : null; const setor = setorPorId(f.setorId);
  const texto = f.texto || (h ? `+${fmtHoras(h)} h/mês devolvidas` : (g && ehOport(g) ? 'Oportunidade entregue!' : 'Gargalo resolvido!'));
  const novo = st && st.andares.length ? st.andares[st.andares.length - 1] : null;
  if (novo) { novo.scale.y = 0.001; st.topo.position.y = st.topoY - 0.3; }
  const base = st ? pontoDoSetor(il, st) : il.pos.clone();
  const topoMundo = () => base.clone().setY(il.grupo.position.y + (st ? (st.topoY * st.esc + (st.lift || 0)) : 3) + 0.6);
  CAMPO.festejando = il.id;
  const vista = { alvo: base.clone().setY(il.pos.y + (st ? (st.topoY * st.esc + (st.lift || 0)) + 0.6 : 2)), raio: CAMPO.largura / CAMPO.altura < 1 ? 21 : 15, theta: il.grupo.rotation.y + 0.2, phi: 1.08 };
  animarCamera(vista, movimentoReduzido() ? 10 : 1500, () => {
    if (novo) CAMPO.efeitos.push({ t: 0, dur: 1, passo: (t) => { const s = 1 - Math.pow(1 - t, 3); novo.scale.y = 0.24 * Math.max(0.001, s); st.topo.position.y = st.topoY - 0.3 * (1 - s); } });
    if (!movimentoReduzido()) {
      fogos(topoMundo());
      depoisDe(0.45, () => fogos(topoMundo().add(new THREE.Vector3(0.6, 0.5, 0)), 70));
      depoisDe(0.9, () => fogos(topoMundo().add(new THREE.Vector3(-0.5, 0.8, 0.3)), 70));
    }
    const detalhe = setor ? `<small>${esc(setor.nome)}${g ? ' · ' + esc(g.titulo) : ''}</small>` : '';
    textoQueSobe(`<b>${esc(texto)}</b>${detalhe}`, topoMundo(), 4.6);
    depoisDe(5, () => { CAMPO.festejando = ''; if (!CAMPO.ap) animarCamera(visaoGeral(), 1600); });
  });
}

/* ---------- Modo apresentação (para a reunião com o dono do cliente) ----------
   Tela cheia, só a cidade dessa empresa (as outras somem, com a gente delas: nada de outro cliente aparece),
   e a câmera faz um tour sozinha: abertura, a empresa, cada setor (do mais crítico para o mais
   saudável) e, no fim, as horas devolvidas. Espaço pausa, setas trocam o passo, Esc sai. */
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
// Onde fica o prédio de um setor no mundo (a cidade gira para o portão olhar para a sede)
function pontoDoSetor(il, st) { il.grupo.updateMatrixWorld(true); return new THREE.Vector3(st.x, 0, st.z).applyMatrix4(il.grupo.matrixWorld); }
function passosDaApresentacao(id) {
  const ck = checkupDa(id);
  const ilha = () => CAMPO.ilhas.get(id);
  const centro = () => ilha().pos.clone(), giro = () => ilha().grupo.rotation.y;
  const passos = [
    { tipo: 'abertura', dur: 6500, vista: () => ({ alvo: centro().add(V3(0, 1, 0)), raio: 44, theta: giro() + 0.75, phi: 0.9 }) },
    { tipo: 'empresa', dur: 9000, vista: () => ({ alvo: centro().add(V3(0, 1.0, 0)), raio: 31, theta: giro() + 0.12, phi: 0.98 }) }
  ];
  const nota = (x) => (x.d.nota == null ? 101 : x.d.nota);
  const ordem = ck.setores.slice().sort((a, b) => ORDEM_SAUDE[a.d.saude] - ORDEM_SAUDE[b.d.saude] || nota(a) - nota(b)).slice(0, 12);
  ordem.forEach(({ s }, k) => passos.push({ tipo: 'setor', setorId: s.id, n: k + 1, total: ordem.length, dur: 8500, vista: () => {
    const st = ilha().setores.get(s.id) || { x: 0, z: 0, topoY: 2, esc: 1 }; const p = pontoDoSetor(ilha(), st);
    return { alvo: p.setY(p.y + Math.max(1.2, (st.topoY * st.esc + (st.lift || 0)) * 0.55)), raio: 12.5, theta: giro() + 0.3, phi: 1.05 };
  } }));
  passos.push({ tipo: 'final', dur: 12000, vista: () => ({ alvo: centro().add(V3(0, 2, 0)), raio: 48, theta: giro() + 0.9, phi: 0.82 }) });
  return passos;
}
// Anel com a nota (para as legendas grandes da apresentação)
function anelApresentacao(nota, cor, tam) {
  const r = 44, volta = 2 * Math.PI * r, pct = nota == null ? 0 : nota / 100;
  return `<svg class="ap-anel" width="${tam}" height="${tam}" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="${r}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="7"/>`
    + `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${cor}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(volta * pct).toFixed(1)} ${volta.toFixed(1)}" transform="rotate(-90 50 50)" style="filter:drop-shadow(0 0 6px ${cor})"/>`
    + `<text x="50" y="58" text-anchor="middle" font-size="26" font-weight="600" fill="#fff" font-family="IBM Plex Mono, monospace">${nota == null ? '–' : nota}</text></svg>`;
}
function barrasEixos(eixos) {
  const linha = (k) => { const v = eixos[k]; return `<div class="ap-eixo"><span>${esc(EIXOS[k])}</span><span class="ap-trilho"><i style="width:${v == null ? 0 : v}%"></i></span><b>${v == null ? '–' : v}</b></div>`; };
  return `<div class="ap-eixos">${Object.keys(EIXOS).map(linha).join('')}</div>`;
}
function legendaDoPasso(p, id) {
  const e = empresaPorId(id) || {}; const ck = checkupDa(id);
  const abertos = (lista) => lista.filter((g) => situacaoDe(g) !== 'Resolvido');
  if (p.tipo === 'abertura') {
    const quando = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
    const quem = nomeConsultor() ? ' · ' + esc(nomeConsultor()) : '';
    return `<div class="ap-card ap-abertura"><img class="ap-logo" src="${LOGO.claro}" alt="Real Forte Consultoria"><p class="ap-olho">Diagnóstico de processos</p>`
      + `<h2 class="ap-titulo">${esc(e.nome || '')}</h2><p class="ap-sub">${esc([e.segmento, e.cidade].filter(Boolean).join(' · '))}</p><p class="ap-pe">${esc(quando)}${quem}</p></div>`;
  }
  if (p.tipo === 'empresa') {
    const saude = saudeDaEmpresa(ck.setores); const garg = gargalosDa(id); const ops = itensDa(id).filter(ehOport);
    return `<div class="ap-card"><p class="ap-olho">Check-up da empresa</p><div class="ap-linha">${anelApresentacao(ck.nota, COR_SAUDE_CSS[saude], 118)}`
      + `<div><h2 class="ap-titulo menor">${esc(e.nome || '')}</h2><span class="ap-chip" style="--c:${COR_SAUDE_CSS[saude]}">${esc(SAUDE[saude].nome)}</span></div></div>`
      + barrasEixos(ck.eixos)
      + `<div class="ap-numeros"><span><b>${ck.setores.length}</b>${ck.setores.length === 1 ? 'setor' : 'setores'}</span><span><b>${abertos(garg).length}</b>gargalos abertos</span>`
      + `<span><b>${abertos(ops).length}</b>oportunidades</span><span><b>${contagem(garg)['Resolvido']}</b>resolvidos</span></div></div>`;
  }
  if (p.tipo === 'setor') {
    const s = setorPorId(p.setorId) || {}; const d = diagnosticoDe(s); const cor = COR_SAUDE_CSS[d.saude];
    const gs = abertos(gargalosDo(s.id)); const ops = abertos(oportunidadesDo(s.id));
    const feitos = itensDo(s.id).filter((g) => situacaoDe(g) === 'Resolvido'); const h = somaHoras(itensDo(s.id));
    const lista = (itens, classe) => itens.slice(0, 3).map((g) => `<li class="${classe}">${esc(g.titulo)}</li>`).join('') + (itens.length > 3 ? `<li class="mais">e mais ${itens.length - 3}</li>` : '');
    const semDiag = d.nota == null ? '<p class="ap-sub">Diagnóstico ainda não feito</p>' : '';
    const colunas = (gs.length ? `<div><b class="ap-rot r">Onde trava</b><ul>${lista(gs, 'g')}</ul></div>` : '') + (ops.length ? `<div><b class="ap-rot o">Oportunidades</b><ul>${lista(ops, 'o')}</ul></div>` : '');
    const entregues = feitos.length ? `<p class="ap-feito">${icone('ok')}${plural(feitos.length, 'melhoria entregue', 'melhorias entregues')}${h ? ' · ' + fmtHoras(h) + ' h/mês devolvidas' : ''}</p>` : '';
    return `<div class="ap-card"><p class="ap-olho">Setor ${p.n} de ${p.total}</p><div class="ap-linha">${anelApresentacao(d.nota, cor, 104)}`
      + `<div><h2 class="ap-titulo menor">${esc(s.nome || '')}</h2><span class="ap-chip" style="--c:${cor}">${esc(SAUDE[d.saude].nome)}</span>${semDiag}</div></div>`
      + (d.nota == null ? '' : barrasEixos(d.eixos))
      + (colunas ? `<div class="ap-cols">${colunas}</div>` : '') + entregues + '</div>';
  }
  const todos = itensDa(id); const horas = somaHoras(todos); const resolvidos = todos.filter((g) => situacaoDe(g) === 'Resolvido').length;
  const garg = gargalosDa(id);
  const meio = horas
    ? `<p class="ap-olho">Resultado até aqui</p><h2 class="ap-grande"><b data-ap-contar="${horas}">0</b><small>horas por mês</small></h2>`
      + `<p class="ap-sub">devolvidas à equipe da ${esc(e.nome || 'empresa')}, em ${plural(resolvidos, 'melhoria entregue', 'melhorias entregues')}. São ${fmtHoras(horas * 12)} horas em um ano.</p>`
    : `<p class="ap-olho">O mapa do diagnóstico</p><h2 class="ap-grande"><b data-ap-contar="${garg.length}">0</b><small>${garg.length === 1 ? 'gargalo mapeado' : 'gargalos mapeados'}</small></h2>`
      + `<p class="ap-sub">${plural(emAndamento(garg), 'melhoria em andamento', 'melhorias em andamento')} · ${plural(contagem(garg)['Resolvido'], 'resolvido', 'resolvidos')}. Cada gargalo resolvido vira horas devolvidas à equipe.</p>`;
  return `<div class="ap-card ap-final"><img class="ap-logo" src="${LOGO.claro}" alt="Real Forte Consultoria">${meio}`
    + `<div class="ap-fim"><button class="ap-botao" data-ap="repetir">${icone('voltar')}Ver de novo</button><button class="ap-botao primario" data-ap="sair">Encerrar</button></div></div>`;
}
function criarCamadaApresentacao() {
  const el = document.createElement('div'); el.className = 'ap-camada';
  el.innerHTML = `<div class="ap-progresso"><i></i></div><div class="ap-legenda"></div>`
    + `<div class="ap-controles"><button data-ap="ant" aria-label="Passo anterior">${icone('voltar')}</button><button data-ap="pausa" aria-label="Pausar">${icone('parar')}</button>`
    + `<button data-ap="prox" aria-label="Próximo passo">${icone('seta')}</button><span class="ap-pontos"></span><button data-ap="sair" class="ap-sair">Sair</button></div>`;
  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-ap]'); if (!b || !CAMPO.ap) return;
    const ap = CAMPO.ap, k = b.dataset.ap;
    if (k === 'ant') irParaPasso(ap.i - 1);
    else if (k === 'prox') irParaPasso(ap.i + 1);
    else if (k === 'pausa') pausarApresentacao(!ap.pausado);
    else if (k === 'repetir') irParaPasso(0);
    else if (k === 'sair') sairDaApresentacao();
  });
  CAMPO.el.appendChild(el); CAMPO.apEl = el;
  document.addEventListener('keydown', (ev) => {
    if (!CAMPO.ap || !CAMPO.rodando) return;
    if (ev.key === ' ') { ev.preventDefault(); pausarApresentacao(!CAMPO.ap.pausado); }
    else if (ev.key === 'ArrowRight') irParaPasso(CAMPO.ap.i + 1);
    else if (ev.key === 'ArrowLeft') irParaPasso(CAMPO.ap.i - 1);
    else if (ev.key === 'Escape') sairDaApresentacao();
  });
}
function iniciarApresentacao(id) {
  if (!CAMPO.ilhas.get(id)) return;
  if (!CAMPO.apEl) criarCamadaApresentacao();
  CAMPO.ap = { id, passos: passosDaApresentacao(id), i: -1, tempo: 0, pausado: false };
  CAMPO.apEl.classList.add('ligada'); CAMPO.escolhida = ''; CAMPO.hover = ''; CAMPO.festejando = '';
  CAMPO.rotulos.querySelectorAll('.festa-campo').forEach((x) => { x.style.display = 'none'; });
  try { if (document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); } catch (x) { /* sem tela cheia: a apresentação ocupa a janela */ }
  irParaPasso(0);
}
function irParaPasso(i) {
  const ap = CAMPO.ap; if (!ap) return;
  ap.i = Math.max(0, Math.min(ap.passos.length - 1, i)); ap.tempo = 0;
  const p = ap.passos[ap.i];
  animarCamera(ajustarVistaComLegenda(p.vista()), movimentoReduzido() ? 10 : 2400);
  const leg = CAMPO.apEl.querySelector('.ap-legenda');
  leg.classList.remove('entra'); leg.innerHTML = legendaDoPasso(p, ap.id); void leg.offsetWidth; leg.classList.add('entra');
  CAMPO.apEl.querySelector('.ap-pontos').innerHTML = ap.passos.map((x, k) => `<i class="${k === ap.i ? 'atual' : k < ap.i ? 'feito' : ''}"></i>`).join('');
  CAMPO.apEl.classList.toggle('no-fim', p.tipo === 'final');
  if (p.tipo === 'final') {
    // Contador subindo e fogos sobre a ilha
    const alvo = leg.querySelector('[data-ap-contar]');
    if (alvo) {
      const fim = Number(alvo.dataset.apContar); const t0 = performance.now();
      const passo = (agora) => { const k = Math.min(1, (agora - t0) / 1800); alvo.textContent = fmtHoras(fim * (1 - Math.pow(1 - k, 3))); if (k < 1 && alvo.isConnected) requestAnimationFrame(passo); };
      requestAnimationFrame(passo);
    }
    const il = CAMPO.ilhas.get(ap.id);
    if (il && !movimentoReduzido() && somaHoras(itensDa(ap.id))) {
      const pos = il.pos.clone().add(V3(0, 6, 0));
      depoisDe(1.6, () => fogos(pos, 110)); depoisDe(2.1, () => fogos(pos.clone().add(V3(2, 1, 1)), 80)); depoisDe(2.6, () => fogos(pos.clone().add(V3(-2, 1.5, -1)), 80));
    }
  }
  pausarApresentacao(p.tipo === 'final');
}
// A legenda ocupa um lado da tela: a câmera mira de lado para a ilha ficar na parte livre
function ajustarVistaComLegenda(v) {
  const proporcao = CAMPO.largura / CAMPO.altura;
  if (proporcao >= 1.1) { const k = v.raio * 0.22; v.alvo.x -= Math.cos(v.theta) * k; v.alvo.z += Math.sin(v.theta) * k; }
  else if (proporcao < 1) { v.raio *= 1.45; v.alvo.y -= v.raio * 0.2; }
  return v;
}
function pausarApresentacao(pausar) {
  const ap = CAMPO.ap; if (!ap) return;
  ap.pausado = pausar;
  const b = CAMPO.apEl.querySelector('[data-ap="pausa"]');
  if (b) { b.innerHTML = icone(pausar ? 'seta' : 'parar'); b.setAttribute('aria-label', pausar ? 'Continuar' : 'Pausar'); b.classList.toggle('pausado', pausar); }
}
function sairDaApresentacao() { const id = CAMPO.ap && CAMPO.ap.id; pararApresentacao(); location.hash = id ? 'e-' + id : 'inicio'; }
function pararApresentacao() {
  if (!CAMPO.ap) return;
  CAMPO.ap = null; CAMPO.feixe.visible = false;
  if (CAMPO.apEl) CAMPO.apEl.classList.remove('ligada', 'no-fim');
  try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); } catch (x) { /* nada */ }
}
function passoApresentacao(dt, t) {
  const ap = CAMPO.ap; if (!ap) return;
  const p = ap.passos[ap.i];
  if (!ap.pausado && !CAM.anim) { ap.tempo += dt * 1000; if (ap.tempo >= p.dur) irParaPasso(ap.i + 1); }
  const barra = CAMPO.apEl.querySelector('.ap-progresso i');
  if (barra) barra.style.width = `${((ap.i + Math.min(1, ap.tempo / p.dur)) / ap.passos.length * 100).toFixed(2)}%`;
  // Feixe de luz no setor da vez e o brilho dele pulsando
  const il = CAMPO.ilhas.get(ap.id); const st = il && p.setorId ? il.setores.get(p.setorId) : null;
  CAMPO.feixe.visible = !!st;
  if (st) {
    const ps = pontoDoSetor(il, st); CAMPO.feixe.position.set(ps.x, il.grupo.position.y, ps.z);
    CAMPO.feixe.material.opacity = 0.16 + Math.sin(t * 3) * 0.06;
    const k = 1.5 + (Math.sin(t * 4) + 1) * 0.6; st.halo.scale.set(k, k, 1);
  }
}

/* ---------- Ligar e desligar (chamado pelo render da tela) ---------- */
function montarCampo(lugar) {
  if (!campoDisponivel()) return;
  try {
    if (!CAMPO.iniciado) { montarCena(); criarPalco(); CAM.alvo = new THREE.Vector3(0, 2, 0); CAMPO.iniciado = true; }
    if (CAMPO.el.parentNode !== lugar) lugar.prepend(CAMPO.el);
    ajustarTamanho();
    const voltando = !CAMPO.rodando;
    const apresentar = lugar.dataset.apresentar || '';
    atualizarIlhas();
    if (apresentar) {
      if (!CAMPO.ap || CAMPO.ap.id !== apresentar) {
        if (voltando) {
          const geral = visaoGeral(); CAM.alvo.copy(geral.alvo); CAM.raio = CAM.raioAlvo = geral.raio; CAM.theta = geral.theta; CAM.phi = geral.phi;
          CAMPO.jaAbriu = true; CAMPO.rodando = true; CAMPO.ultimo = 0; CAMPO.raf = requestAnimationFrame(quadro);
        }
        iniciarApresentacao(apresentar);
      }
      return;
    }
    if (CAMPO.ap) pararApresentacao();
    if (voltando) {
      // Voltando de uma empresa: começa perto da ilha dela e se afasta até a visão geral
      const il = CAMPO.voltarDe && CAMPO.ilhas.get(CAMPO.voltarDe);
      const geral = visaoGeral();
      if (il && !movimentoReduzido()) { const perto = visaoDaIlha(il); CAM.alvo.copy(perto.alvo); CAM.raio = CAM.raioAlvo = perto.raio; CAM.theta = perto.theta; CAM.phi = perto.phi; animarCamera(geral, 1300); }
      else if (!CAMPO.jaAbriu && !movimentoReduzido()) { CAM.alvo.copy(geral.alvo); CAM.raio = CAM.raioAlvo = geral.raio * 1.5; CAM.theta = geral.theta - 0.9; CAM.phi = 0.75; animarCamera(geral, 1800); }
      else { CAM.alvo.copy(geral.alvo); CAM.raio = CAM.raioAlvo = geral.raio; CAM.theta = geral.theta; CAM.phi = geral.phi; }
      CAMPO.voltarDe = ''; CAMPO.escolhida = ''; CAMPO.hover = ''; CAMPO.hoverPlaca = ''; CAMPO.jaAbriu = true;
      CAMPO.rodando = true; CAMPO.ultimo = 0; CAMPO.raf = requestAnimationFrame(quadro);
    }
    if (CAMPO.festa && CAMPO.ilhas.get(CAMPO.festa.empresaId)) executarFesta();
  } catch (x) {
    console.warn('Campo 3D indisponível:', x); CAMPO.disponivel = false; pararCampo();
    if (typeof render === 'function') setTimeout(() => render(true), 0);
  }
}
function pararCampo() {
  if (CAMPO.ap) pararApresentacao();
  if (!CAMPO.rodando) return;
  CAMPO.rodando = false; cancelAnimationFrame(CAMPO.raf);
}
/* =====================================================================
   ACABAMENTO DE CINEMA (painel principal 3D)
   Só muda o visual. Nada do que o painel mostra, calcula ou guarda muda aqui.
   - Pós-processamento próprio (sem biblioteca nova): brilho das luzes (bloom), cor de cinema,
     vinheta, granulação de filme e uma leve aberração da lente nas bordas.
   - Céu do espaço num shader só: via láctea, nebulosas, o sol e o planeta lá embaixo
     (continentes, oceano com o reflexo do sol, nuvens, a faixa azul da atmosfera na borda e as
     luzes das cidades no lado da noite).
   - Rocha da ilha em alta resolução: camadas de sedimento, sulcos de erosão, relevo fino,
     estalactites e musgo nas saliências.
   - Nuvens de verdade em volta e por baixo da ilha.
   - Copas de árvore irregulares, com variação de cor (nada de "pirulito").
   Se o aparelho não tiver WebGL2 (ou não puder desenhar em cor de alta precisão), o painel desenha
   direto na tela, como antes, só sem o pós-processamento.
===================================================================== */

// Ruído em GLSL (valor 3D + soma de oitavas), usado pelo céu, pela rocha e pelo planeta
const GLSL_RUIDO = `
float rfH3(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float rfR3(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(rfH3(i), rfH3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(rfH3(i + vec3(0.0, 1.0, 0.0)), rfH3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(rfH3(i + vec3(0.0, 0.0, 1.0)), rfH3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(rfH3(i + vec3(0.0, 1.0, 1.0)), rfH3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float rfFbm(vec3 p, int oitavas) {
  float soma = 0.0, amp = 0.5, total = 0.0;
  for (int i = 0; i < 9; i++) { if (i >= oitavas) break; soma += amp * rfR3(p); total += amp; p = p * 2.03 + vec3(1.7, 9.2, 4.3); amp *= 0.5; }
  return soma / total;
}
`;

// O mesmo ruído em JavaScript (para dar forma à rocha, às copas e às nuvens)
function ruido3(x, y, z) {
  const h = (a, b, c) => { let px = (a * 0.3183099 + 0.71) % 1, py = (b * 0.3183099 + 0.113) % 1, pz = (c * 0.3183099 + 0.419) % 1; if (px < 0) px += 1; if (py < 0) py += 1; if (pz < 0) pz += 1; px *= 17; py *= 17; pz *= 17; const v = px * py * pz * (px + py + pz); return v - Math.floor(v); };
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const m = (a, b, t) => a + (b - a) * t;
  return m(m(m(h(ix, iy, iz), h(ix + 1, iy, iz), fx), m(h(ix, iy + 1, iz), h(ix + 1, iy + 1, iz), fx), fy),
           m(m(h(ix, iy, iz + 1), h(ix + 1, iy, iz + 1), fx), m(h(ix, iy + 1, iz + 1), h(ix + 1, iy + 1, iz + 1), fx), fy), fz);
}
function fbm3(x, y, z, oitavas) {
  let soma = 0, amp = 0.5, total = 0;
  for (let i = 0; i < oitavas; i++) { soma += amp * ruido3(x, y, z); total += amp; x = x * 2.03 + 1.7; y = y * 2.03 + 9.2; z = z * 2.03 + 4.3; amp *= 0.5; }
  return soma / total;
}

/* ---------- 1. Pós-processamento ----------
   A cena é desenhada numa imagem de alta precisão (com antisserrilhado). Dela sai o brilho das
   luzes (só o que passa do branco: LEDs, telões, sol, propulsores), espalhado em 6 tamanhos.
   Depois junta tudo na tela com a correção de cor. */
const CINEMA = { ligado: null, largura: 0, altura: 0, niveis: [] };
const CINEMA_AJUSTE = {
  limiar: 0.92,        // a partir de quanto a luz começa a brilhar em volta
  joelho: 0.35,        // transição suave do brilho
  forcaBrilho: 0.42,   // quanto do brilho volta para a imagem
  vinheta: 0.32,       // escurecimento das bordas
  grao: 0.022,         // granulação de filme
  aberracao: 0.0022,   // separação de cor nas bordas (lente)
  sombraContato: 0.9,  // força da sombra de contato (oclusão de ambiente): cantos, pés de prédio, embaixo de carro
  verSombraContato: false,  // true mostra só a sombra de contato, em preto e branco (para conferir)
  nevoa: 0.22          // névoa de distância: quanto o fundo clareia (dá escala de cidade grande)
};
const VERT_TELA = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
function prepararCinema() {
  const T = THREE, r = CAMPO.renderer;
  CINEMA.ligado = false;
  try {
    if (!r.capabilities.isWebGL2) return;
    if (!r.extensions.has('EXT_color_buffer_float') && !r.extensions.has('EXT_color_buffer_half_float')) return;
    const base = { type: T.HalfFloatType, format: T.RGBAFormat, minFilter: T.LinearFilter, magFilter: T.LinearFilter, stencilBuffer: false };
    CINEMA.cena = new T.WebGLRenderTarget(4, 4, Object.assign({ samples: 4, depthBuffer: true }, base));
    CINEMA.cena.depthTexture = new T.DepthTexture(4, 4, T.UnsignedIntType);
    const baseAO = { type: T.UnsignedByteType, format: T.RGBAFormat, minFilter: T.LinearFilter, magFilter: T.LinearFilter, depthBuffer: false, stencilBuffer: false };
    CINEMA.ao = new T.WebGLRenderTarget(4, 4, baseAO); CINEMA.aoLimpo = new T.WebGLRenderTarget(4, 4, baseAO);
    for (let i = 0; i < 6; i++) CINEMA.niveis.push(new T.WebGLRenderTarget(4, 4, Object.assign({ depthBuffer: false }, base)));
    CINEMA.quad = new T.Mesh(new T.PlaneGeometry(2, 2), null); CINEMA.quad.frustumCulled = false;
    CINEMA.cenaQuad = new T.Scene(); CINEMA.cenaQuad.add(CINEMA.quad);
    CINEMA.camQuad = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const sh = (frag, uniforms, extra) => new T.ShaderMaterial(Object.assign({ vertexShader: VERT_TELA, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false }, extra || {}));
    // Separa o que é luz forte (com transição suave) e já reduz pela metade
    CINEMA.matLimiar = sh(`uniform sampler2D tFonte; uniform vec2 uPasso; uniform float uLimiar, uJoelho; varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tFonte, vUv + uPasso * vec2(-0.5, -0.5)).rgb + texture2D(tFonte, vUv + uPasso * vec2(0.5, -0.5)).rgb
               + texture2D(tFonte, vUv + uPasso * vec2(-0.5, 0.5)).rgb + texture2D(tFonte, vUv + uPasso * vec2(0.5, 0.5)).rgb;
        c = min(c * 0.25, vec3(30.0));
        float b = max(c.r, max(c.g, c.b));
        float s = clamp(b - uLimiar + uJoelho, 0.0, 2.0 * uJoelho); s = s * s / (4.0 * uJoelho + 1e-4);
        gl_FragColor = vec4(c * max(s, b - uLimiar) / max(b, 1e-4), 1.0);
      }`, { tFonte: { value: null }, uPasso: { value: new T.Vector2() }, uLimiar: { value: CINEMA_AJUSTE.limiar }, uJoelho: { value: CINEMA_AJUSTE.joelho } });
    // Descer (metade do tamanho) e subir (espalhando) — filtro "dual" de 5 e 8 amostras
    CINEMA.matDesce = sh(`uniform sampler2D tFonte; uniform vec2 uPasso; varying vec2 vUv;
      void main() { vec3 s = texture2D(tFonte, vUv).rgb * 4.0;
        s += texture2D(tFonte, vUv - uPasso).rgb + texture2D(tFonte, vUv + uPasso).rgb + texture2D(tFonte, vUv + vec2(uPasso.x, -uPasso.y)).rgb + texture2D(tFonte, vUv - vec2(uPasso.x, -uPasso.y)).rgb;
        gl_FragColor = vec4(s / 8.0, 1.0); }`, { tFonte: { value: null }, uPasso: { value: new T.Vector2() } });
    CINEMA.matSobe = sh(`uniform sampler2D tFonte; uniform vec2 uPasso; uniform float uPeso; varying vec2 vUv;
      void main() { vec2 h = uPasso; vec3 s = texture2D(tFonte, vUv + vec2(-h.x * 2.0, 0.0)).rgb + texture2D(tFonte, vUv + vec2(h.x * 2.0, 0.0)).rgb
          + texture2D(tFonte, vUv + vec2(0.0, h.y * 2.0)).rgb + texture2D(tFonte, vUv + vec2(0.0, -h.y * 2.0)).rgb
          + (texture2D(tFonte, vUv + vec2(-h.x, h.y)).rgb + texture2D(tFonte, vUv + vec2(h.x, h.y)).rgb + texture2D(tFonte, vUv + vec2(h.x, -h.y)).rgb + texture2D(tFonte, vUv + vec2(-h.x, -h.y)).rgb) * 2.0;
        gl_FragColor = vec4(s / 12.0 * uPeso, 1.0); }`, { tFonte: { value: null }, uPasso: { value: new T.Vector2() }, uPeso: { value: 1 } },
      { transparent: true, blending: T.AdditiveBlending });
    // Junta tudo na tela: brilho, lente, cor de cinema, vinheta, grão e a conversão para a tela (sRGB)
    CINEMA.matFinal = sh(`uniform sampler2D tCena, tBrilho, tAO, tProf; uniform float uForcaAO, uVerAO, uLonge, uNevoaIni, uNevoaDens, uNevoaMax; uniform vec3 uCorNevoa; uniform vec2 uRes; uniform float uForca, uVinheta, uGrao, uAberracao, uTempo; varying vec2 vUv;
      float rfGrao(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      vec3 rfOmbro(vec3 c) { vec3 a = max(c - 0.82, 0.0); return min(c, 0.82) + 0.18 * (1.0 - exp(-a / 0.18)); }
      vec3 rfSrgb(vec3 c) { c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
      void main() {
        vec2 d = vUv - 0.5; float r2 = dot(d, d);
        vec2 desvio = d * r2 * uAberracao * 4.0;
        vec3 c = vec3(texture2D(tCena, vUv - desvio).r, texture2D(tCena, vUv).g, texture2D(tCena, vUv + desvio).b);
        vec3 b = texture2D(tBrilho, vUv).rgb;
        float ao = texture2D(tAO, vUv).r;
        c *= mix(1.0, ao, uForcaAO);
        float pz = texture2D(tProf, vUv).x;
        if (pz < 0.99999) { float dist = exp2(pz * log2(uLonge + 1.0)) - 1.0; c = mix(c, uCorNevoa, (1.0 - exp(-max(dist - uNevoaIni, 0.0) * uNevoaDens)) * uNevoaMax); }
        c += b * uForca;
        if (uVerAO > 0.5) c = vec3(ao * 0.8);
        c = rfOmbro(c);
        vec3 s = rfSrgb(c);
        float lum = dot(s, vec3(0.2126, 0.7152, 0.0722));
        // sombras levemente azul-petróleo, luzes levemente quentes (o "teal and orange" de cinema, bem contido)
        s += vec3(-0.012, 0.004, 0.018) * (1.0 - smoothstep(0.0, 0.45, lum)) + vec3(0.018, 0.008, -0.014) * smoothstep(0.55, 1.0, lum);
        s = mix(s, s * s * (3.0 - 2.0 * s), 0.16);
        s = mix(vec3(dot(s, vec3(0.2126, 0.7152, 0.0722))), s, 1.07);
        float v = smoothstep(0.92, 0.28, length(d * vec2(1.0, 0.82)));
        s *= mix(1.0 - uVinheta, 1.0, v);
        s += (rfGrao(vUv * uRes + fract(uTempo) * 61.0) - 0.5) * uGrao;
        gl_FragColor = vec4(clamp(s, 0.0, 1.0), 1.0);
      }`, { tCena: { value: null }, tBrilho: { value: null }, tAO: { value: null }, uForcaAO: { value: 0 }, uVerAO: { value: 0 }, tProf: { value: null }, uLonge: { value: 1000 }, uNevoaIni: { value: 100 }, uNevoaDens: { value: 0.003 }, uNevoaMax: { value: 0 }, uCorNevoa: { value: new T.Color() }, uRes: { value: new T.Vector2() }, uForca: { value: CINEMA_AJUSTE.forcaBrilho }, uVinheta: { value: CINEMA_AJUSTE.vinheta }, uGrao: { value: CINEMA_AJUSTE.grao }, uAberracao: { value: CINEMA_AJUSTE.aberracao }, uTempo: { value: 0 } });
    /* Sombra de contato (oclusão de ambiente, no estilo "Alchemy"): para cada ponto, olha 12 vizinhos na
       tela; se a geometria em volta "fecha" o ponto (canto, pé de parede), ele recebe menos luz do céu.
       A profundidade vem do buffer logarítmico: distância = (longe + 1) ^ profundidade - 1. */
    const GLSL_POS = `uniform sampler2D tProf; uniform float uLonge, uP0, uP1;
      float rfDist(vec2 uv) { return exp2(texture2D(tProf, uv).x * log2(uLonge + 1.0)) - 1.0; }
      vec3 rfPos(vec2 uv) { float w = rfDist(uv); vec2 ndc = uv * 2.0 - 1.0; return vec3(ndc.x / uP0 * w, ndc.y / uP1 * w, -w); }`;
    CINEMA.matAO = sh(`${GLSL_POS} uniform vec2 uPasso; uniform float uRaio, uForcaAO; varying vec2 vUv;
      void main() {
        if (texture2D(tProf, vUv).x >= 0.99999) { gl_FragColor = vec4(1.0); return; }
        vec3 p = rfPos(vUv);
        vec3 pr = rfPos(vUv + vec2(uPasso.x, 0.0)), pl = rfPos(vUv - vec2(uPasso.x, 0.0)), pu = rfPos(vUv + vec2(0.0, uPasso.y)), pd = rfPos(vUv - vec2(0.0, uPasso.y));
        vec3 dx = abs(pr.z - p.z) < abs(p.z - pl.z) ? pr - p : p - pl;
        vec3 dy = abs(pu.z - p.z) < abs(p.z - pd.z) ? pu - p : p - pd;
        vec3 n = normalize(cross(dx, dy));
        float raioTela = uRaio * uP1 * 0.5 / max(-p.z, 0.01);
        float giro = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
        float soma = 0.0;
        for (int i = 0; i < 12; i++) {
          float fi = float(i), r = sqrt((fi + 0.5) / 12.0), a = giro + fi * 2.3999632;
          vec2 uv = vUv + vec2(cos(a), sin(a)) * r * raioTela * vec2(uP0 / uP1, 1.0);
          vec3 v = rfPos(uv) - p;
          float d2 = dot(v, v);
          soma += max(0.0, dot(v, n) - 0.0002 * -p.z) / (d2 + 0.02 * uRaio * uRaio) * smoothstep(uRaio * 2.2, uRaio * 0.8, sqrt(d2));
        }
        float ao = clamp(1.0 - soma * uRaio * 4.0 * uForcaAO / 12.0, 0.0, 1.0);
        gl_FragColor = vec4(vec3(ao * ao), 1.0);
      }`, { tProf: { value: null }, uLonge: { value: 1000 }, uP0: { value: 1 }, uP1: { value: 1 }, uPasso: { value: new T.Vector2() }, uRaio: { value: 1 }, uForcaAO: { value: 1 } });
    // Alisa a sombra de contato sem passar por cima das bordas dos objetos (respeita a profundidade)
    CINEMA.matAOLimpa = sh(`${GLSL_POS} uniform sampler2D tAO; uniform vec2 uPasso; varying vec2 vUv;
      void main() {
        float w0 = rfDist(vUv), soma = 0.0, peso = 0.0;
        for (int x = -2; x <= 2; x++) for (int y = -2; y <= 2; y++) {
          vec2 uv = vUv + vec2(float(x), float(y)) * uPasso;
          float w = 1.0 / (1.0 + abs(rfDist(uv) - w0) / max(w0 * 0.02, 0.05));
          soma += texture2D(tAO, uv).r * w; peso += w;
        }
        gl_FragColor = vec4(vec3(soma / peso), 1.0);
      }`, { tProf: { value: null }, tAO: { value: null }, uLonge: { value: 1000 }, uP0: { value: 1 }, uP1: { value: 1 }, uPasso: { value: new T.Vector2() } });
    CINEMA.ligado = true;
  } catch (x) { console.warn('Pós-processamento indisponível, desenhando direto:', x); CINEMA.ligado = false; }
}
// Desenha um quadro de tela cheia com o material m na imagem "destino" (null = a tela)
function passeDeTela(m, destino, limpar) {
  const r = CAMPO.renderer; CINEMA.quad.material = m;
  const auto = r.autoClear; r.autoClear = limpar !== false;
  r.setRenderTarget(destino); r.render(CINEMA.cenaQuad, CINEMA.camQuad);
  r.autoClear = auto;
}
function renderizarCinema() {
  const r = CAMPO.renderer;
  if (CINEMA.ligado === null) prepararCinema();
  if (!CINEMA.ligado) { r.render(CAMPO.cena, CAMPO.camera); return; }
  const tam = CINEMA.tmp || (CINEMA.tmp = new THREE.Vector2()); r.getDrawingBufferSize(tam);
  const w = Math.max(4, tam.x), h = Math.max(4, tam.y);
  if (w !== CINEMA.largura || h !== CINEMA.altura) {
    CINEMA.largura = w; CINEMA.altura = h; CINEMA.cena.setSize(w, h);
    CINEMA.ao.setSize(Math.max(2, Math.round(w / 2)), Math.max(2, Math.round(h / 2))); CINEMA.aoLimpo.setSize(Math.max(2, Math.round(w / 2)), Math.max(2, Math.round(h / 2)));
    CINEMA.niveis.forEach((n, i) => n.setSize(Math.max(2, Math.round(w / Math.pow(2, i + 1))), Math.max(2, Math.round(h / Math.pow(2, i + 1)))));
  }
  try {
    r.setRenderTarget(CINEMA.cena); r.render(CAMPO.cena, CAMPO.camera);
    const N = CINEMA.niveis;
    CINEMA.matLimiar.uniforms.tFonte.value = CINEMA.cena.texture; CINEMA.matLimiar.uniforms.uPasso.value.set(1 / w, 1 / h);
    passeDeTela(CINEMA.matLimiar, N[0]);
    for (let i = 1; i < N.length; i++) { CINEMA.matDesce.uniforms.tFonte.value = N[i - 1].texture; CINEMA.matDesce.uniforms.uPasso.value.set(1 / N[i - 1].width, 1 / N[i - 1].height); passeDeTela(CINEMA.matDesce, N[i]); }
    for (let i = N.length - 2; i >= 0; i--) { CINEMA.matSobe.uniforms.tFonte.value = N[i + 1].texture; CINEMA.matSobe.uniforms.uPasso.value.set(0.5 / N[i + 1].width, 0.5 / N[i + 1].height); CINEMA.matSobe.uniforms.uPeso.value = 1; passeDeTela(CINEMA.matSobe, N[i], false); }
    // sombra de contato: o raio acompanha a distância da câmera (de longe, cantos maiores)
    const cam = CAMPO.camera, pe = cam.projectionMatrix.elements, raioAO = Math.max(0.3, Math.min(2.6, CAM.raio * 0.012));
    [CINEMA.matAO, CINEMA.matAOLimpa].forEach((m) => { const u = m.uniforms; u.tProf.value = CINEMA.cena.depthTexture; u.uLonge.value = cam.far; u.uP0.value = pe[0]; u.uP1.value = pe[5]; u.uPasso.value.set(2 / w, 2 / h); });
    CINEMA.matAO.uniforms.uRaio.value = raioAO; CINEMA.matAO.uniforms.uForcaAO.value = 1;
    passeDeTela(CINEMA.matAO, CINEMA.ao);
    CINEMA.matAOLimpa.uniforms.tAO.value = CINEMA.ao.texture; passeDeTela(CINEMA.matAOLimpa, CINEMA.aoLimpo);
    const F = CINEMA.matFinal.uniforms;
    F.tAO.value = CINEMA.aoLimpo.texture; F.uForcaAO.value = CINEMA_AJUSTE.sombraContato; F.uVerAO.value = CINEMA_AJUSTE.verSombraContato ? 1 : 0;
    // névoa de distância: começa um pouco antes do alvo da câmera e chega no máximo bem depois; de noite fica azul-escura
    const luzC = CAMPO.luzDoCeu, noiteC = luzC ? luzC.postes : 0;
    F.tProf.value = CINEMA.cena.depthTexture; F.uLonge.value = cam.far; F.uNevoaIni.value = CAM.raio * 0.55; F.uNevoaDens.value = 1 / (CAM.raio * 2.2 + 40);
    F.uNevoaMax.value = CINEMA_AJUSTE.nevoa; F.uCorNevoa.value.setRGB(0.42, 0.52, 0.7).multiplyScalar(1 - noiteC * 0.9);
    F.tCena.value = CINEMA.cena.texture; F.tBrilho.value = N[0].texture; F.uRes.value.set(w, h); F.uTempo.value = movimentoReduzido() ? 0 : CAMPO.t;
    F.uForca.value = CINEMA_AJUSTE.forcaBrilho / N.length * 2.2;
    passeDeTela(CINEMA.matFinal, null);
  } catch (x) {
    console.warn('Pós-processamento falhou, voltando ao desenho direto:', x);
    CINEMA.ligado = false; r.setRenderTarget(null); r.render(CAMPO.cena, CAMPO.camera);
  }
}

/* ---------- 2. Céu do espaço e o planeta lá embaixo ----------
   Uma esfera que acompanha a câmera. Para cada direção do olhar, o shader vê se ela bate no planeta
   (uma esfera grande abaixo da ilha: o horizonte dele fica uns 27° abaixo do olhar reto) ou se vai
   para o céu. O que é pesado (via láctea, nebulosas, continentes e nuvens do planeta) é desenhado
   UMA vez só, no início, em imagens guardadas na placa de vídeo; a cada quadro só se consulta. */
const GLSL_RUIDO2 = `
float rfH2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float rfR2p(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  vec2 a = mod(i, per), b = mod(i + 1.0, per);
  return mix(mix(rfH2(a), rfH2(vec2(b.x, a.y)), f.x), mix(rfH2(vec2(a.x, b.y)), rfH2(b), f.x), f.y);
}
float rfFbm2p(vec2 uv, float per, int oitavas) {
  float soma = 0.0, amp = 0.5, total = 0.0;
  for (int i = 0; i < 10; i++) { if (i >= oitavas) break; soma += amp * rfR2p(uv * per + float(i) * 17.0, per); total += amp; per *= 2.0; amp *= 0.5; }
  return soma / total;
}
`;
// Imagem do fundo do céu (projeção "mapa-múndi"): via láctea com poeira e nebulosas
const CEU_ASSAR_FUNDO = `varying vec2 vUv;
${GLSL_RUIDO}
void main() {
  float lon = (vUv.x - 0.5) * 6.2831853, lat = (vUv.y - 0.5) * 3.1415927;
  vec3 d = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
  vec3 cor = vec3(0.0012, 0.0018, 0.0042);
  vec3 nb = normalize(vec3(0.32, 0.86, -0.4));
  float l = dot(d, nb);
  float faixa = exp(-l * l / 0.022) + 0.35 * exp(-l * l / 0.12);
  float nuv = rfFbm(d * 3.2 + 7.0, 7);
  float poeira = smoothstep(0.42, 0.72, rfFbm(d * 7.0 + 3.0, 6)) * exp(-l * l / 0.006);
  float centro = pow(max(dot(d, normalize(vec3(-0.75, 0.2, -0.62))), 0.0), 6.0);
  cor += faixa * (0.010 + 0.034 * nuv * nuv) * mix(vec3(0.62, 0.7, 1.0), vec3(1.0, 0.82, 0.62), centro) * (1.0 - 0.85 * poeira);
  cor += centro * faixa * 0.03 * vec3(1.0, 0.78, 0.55) * (1.0 - poeira);
  float n1 = rfFbm(d * 2.1 + 11.0, 6), n2 = rfFbm(d * 3.7 - 5.0, 6);
  cor += vec3(0.035, 0.010, 0.040) * pow(smoothstep(0.52, 0.86, n1), 2.0);
  cor += vec3(0.006, 0.020, 0.036) * pow(smoothstep(0.55, 0.9, n2), 2.0);
  // poeira de estrelas bem fina, que não dá para ver uma por uma
  cor += faixa * 0.02 * pow(rfFbm(d * 60.0, 3), 4.0);
  gl_FragColor = vec4(cor, 1.0);
}`;
// Superfície do planeta (se repete sem emenda): cor do chão e do mar; no alfa, onde é terra
const CEU_ASSAR_PLANETA = `varying vec2 vUv;
${GLSL_RUIDO2}
void main() {
  vec2 uv = vUv;
  float alt = rfFbm2p(uv, 6.0, 10) + 0.35 * (rfFbm2p(uv + 0.37, 2.0, 3) - 0.5);
  float terra = smoothstep(0.515, 0.53, alt);
  float raso = smoothstep(0.43, 0.515, alt);
  vec3 oceano = mix(vec3(0.004, 0.014, 0.040), vec3(0.010, 0.055, 0.085), raso);
  float clima = rfFbm2p(uv + 0.11, 4.0, 6);
  vec3 solo = mix(vec3(0.030, 0.058, 0.022), vec3(0.150, 0.112, 0.062), smoothstep(0.38, 0.66, clima));
  solo = mix(solo, vec3(0.085, 0.075, 0.06), smoothstep(0.6, 0.72, alt));
  solo = mix(solo, vec3(0.55, 0.57, 0.6), smoothstep(0.7, 0.76, alt));
  solo *= 0.7 + 0.6 * rfFbm2p(uv + 0.23, 48.0, 5);
  gl_FragColor = vec4(mix(oceano, solo, terra), terra);
}`;
// Nuvens do planeta (se repetem sem emenda): no vermelho a cobertura
const CEU_ASSAR_NUVENS = `varying vec2 vUv;
${GLSL_RUIDO2}
void main() {
  float nv = rfFbm2p(vUv, 5.0, 9);
  float fiapos = rfFbm2p(vUv + 0.5, 24.0, 4);
  float nuvem = smoothstep(0.5, 0.76, nv + (fiapos - 0.5) * 0.18);
  gl_FragColor = vec4(nuvem, fiapos, 0.0, 1.0);
}`;
const CEU_FRAG = `
uniform sampler2D tFundo, tPlaneta, tNuvens; uniform vec2 uDeriva;
uniform vec3 uSol, uSolPlaneta; uniform float uForcaSol, uNoite;
varying vec3 vDir;
${GLSL_RUIDO2}
float rfH3(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
const float RP = 0.94;    // raio do planeta (a distância até o centro é 1): horizonte ~20° abaixo do olhar reto
const float RA = 0.9525;  // topo da atmosfera
vec3 rfEstrelas(vec3 d, float escala, float limite, float brilho) {
  vec3 p = d * escala, i = floor(p), f = fract(p);
  float h = rfH3(i);
  vec3 alvo = vec3(rfH3(i + 1.7), rfH3(i + 3.1), rfH3(i + 5.3)) * 0.8 + 0.1;
  float px = max(length(fwidth(p)), 1e-4);
  float pt = smoothstep(px * 1.5, 0.0, length(f - alvo)) * step(limite, h);
  return mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.86, 0.7), rfH3(i + 9.1)) * pt * brilho * (0.35 + 0.65 * pow(rfH3(i + 7.7), 3.0));
}
void main() {
  vec3 d = normalize(vDir);
  vec3 C = vec3(0.0, -1.0, 0.0);
  float b = -d.y, m2 = 1.0 - b * b;
  vec3 cor; float noPlaneta = 0.0;
  vec3 sp = normalize(uSolPlaneta);
  if (b > 0.0 && m2 < RP * RP) {
    noPlaneta = 1.0;
    float t = b - sqrt(RP * RP - m2);
    vec3 n = normalize(d * t - C);
    vec2 uv = n.xz * 1.45 + 0.5;
    vec4 pl = texture2D(tPlaneta, uv + uDeriva * 0.35);
    vec4 plFino = texture2D(tPlaneta, uv * 7.0 + 0.31 + uDeriva * 2.45);   // a mesma imagem bem menor: detalhe de perto
    pl.rgb *= 0.72 + 0.56 * plFino.a * pl.a + (1.0 - pl.a) * 0.28;
    vec2 nn = texture2D(tNuvens, uv * 0.9 + uDeriva).rg;
    nn.r *= 0.75 + 0.5 * texture2D(tNuvens, uv * 5.3 + uDeriva * 5.0 + 0.17).g;
    // detalhe fino de perto (some de longe, sem chuvisco)
    vec2 pd = uv * 5200.0; float px = length(fwidth(pd));
    float det = (rfR2p(pd, 1e6) * 0.6 + rfR2p(pd * 3.1, 1e6) * 0.4 - 0.5) * (1.0 - smoothstep(0.3, 1.2, px));
    vec3 sup = pl.rgb * (1.0 + det * 0.5 * (0.3 + pl.a));
    float terra = pl.a, nuvem = nn.r * (0.78 + 0.22 * nn.g);
    float lam = dot(n, sp), dif = max(lam, 0.0);
    vec3 luz = mix(vec3(1.0, 0.42, 0.18), vec3(1.0, 0.97, 0.93), smoothstep(0.0, 0.3, lam)) * uForcaSol;
    cor = sup * dif * luz * 2.4;
    vec3 rf = reflect(d, n);
    float mar = pow(max(dot(rf, sp), 0.0), 90.0) * 2.2 + pow(max(dot(rf, sp), 0.0), 12.0) * 0.12;
    cor += luz * mar * (1.0 - terra) * (1.0 - nuvem) * smoothstep(-0.05, 0.1, lam);
    cor = mix(cor, vec3(0.92, 0.94, 0.97) * (dif * 2.0 * luz + 0.003), nuvem * 0.95);
    // luzes das cidades no lado escuro
    float cid = terra * (1.0 - nuvem) * pow(smoothstep(0.55, 0.85, rfR2p(uv * 900.0, 1e6) * 0.6 + rfR2p(uv * 140.0, 1e6) * 0.4), 3.0);
    cor += vec3(1.0, 0.62, 0.28) * cid * 0.25 * smoothstep(0.05, -0.15, lam);
    // atmosfera: cobre a superfície perto do horizonte (azul do lado do sol, laranja no limite da noite)
    float cosv = max(dot(n, -d), 0.0), nevoa = pow(1.0 - cosv, 2.4);
    vec3 corAtm = mix(vec3(0.10, 0.28, 0.75), vec3(0.95, 0.45, 0.2), pow(1.0 - smoothstep(-0.1, 0.4, lam), 2.0) * smoothstep(-0.35, 0.0, lam));
    cor = mix(cor, corAtm * (smoothstep(-0.25, 0.35, lam) * 0.55 * uForcaSol + 0.003), clamp(nevoa * 0.92 + 0.05, 0.0, 1.0));
  } else {
    vec2 eq = vec2(atan(d.z, d.x) / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.1415927 + 0.5);
    cor = texture2D(tFundo, eq).rgb;
    cor += rfEstrelas(d, 150.0, 0.975, 0.8) + rfEstrelas(d, 340.0, 0.965, 0.38);
    if (b > 0.0) {   // o fio azul da atmosfera, rente ao planeta
      float hAt = (sqrt(m2) - RP) / (RA - RP);
      if (hAt < 1.0) {
        vec3 pc = normalize(d * b - C); float ls = dot(pc, sp);
        float luzA = smoothstep(-0.35, 0.3, ls);
        float por = pow(1.0 - smoothstep(-0.12, 0.35, ls), 2.0) * smoothstep(-0.45, -0.05, ls);
        float dens = exp(-hAt * 4.2) * (1.0 - smoothstep(0.85, 1.0, hAt));
        vec3 corA = mix(vec3(0.16, 0.42, 1.0), vec3(1.0, 0.5, 0.22), por);
        cor = cor * (1.0 - dens * 0.9) + corA * dens * (luzA * 1.4 * uForcaSol + 0.01);
      }
    }
  }
  // o sol: disco forte (passa do branco e ganha brilho no pós) e o halo em volta
  float cs = max(dot(d, normalize(uSol)), 0.0);
  float disco = smoothstep(0.99995, 0.99999, cs) * (1.0 - noPlaneta);
  float halo = pow(cs, 1400.0) * 1.6 + pow(cs, 120.0) * 0.12 + pow(cs, 14.0) * 0.025;
  cor += vec3(1.0, 0.93, 0.82) * (disco * 90.0 + halo * (1.0 - noPlaneta * 0.6)) * uForcaSol * (1.0 - uNoite);
  gl_FragColor = vec4(cor, 1.0);
}`;
// Desenha uma vez o shader "frag" numa imagem de w x h guardada na placa de vídeo
function assarTextura(frag, w, h, mipmaps) {
  const T = THREE, r = CAMPO.renderer;
  const rt = new T.WebGLRenderTarget(w, h, { type: r.capabilities.isWebGL2 ? T.HalfFloatType : T.UnsignedByteType, depthBuffer: false, stencilBuffer: false, minFilter: mipmaps ? T.LinearMipmapLinearFilter : T.LinearFilter, magFilter: T.LinearFilter, generateMipmaps: !!mipmaps, wrapS: T.RepeatWrapping, wrapT: T.RepeatWrapping });
  rt.texture.anisotropy = Math.min(8, r.capabilities.getMaxAnisotropy());
  const m = new T.ShaderMaterial({ vertexShader: VERT_TELA, fragmentShader: frag, depthTest: false, depthWrite: false, toneMapped: false });
  const q = new T.Mesh(new T.PlaneGeometry(2, 2), m); q.frustumCulled = false; const cena = new T.Scene(); cena.add(q);
  const antes = r.getRenderTarget(); r.setRenderTarget(rt); r.render(cena, new T.OrthographicCamera(-1, 1, 1, -1, 0, 1)); r.setRenderTarget(antes);
  m.dispose(); q.geometry.dispose();
  return rt.texture;
}
function montarCeuDeCinema(ceu) {
  const T = THREE, pequeno = telaPequena();
  const m = new T.ShaderMaterial({
    vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: CEU_FRAG,
    uniforms: {
      tFundo: { value: assarTextura(CEU_ASSAR_FUNDO, pequeno ? 1024 : 2048, pequeno ? 512 : 1024, false) },
      tPlaneta: { value: assarTextura(CEU_ASSAR_PLANETA, pequeno ? 1024 : 2048, pequeno ? 1024 : 2048, true) },
      tNuvens: { value: assarTextura(CEU_ASSAR_NUVENS, 1024, 1024, true) },
      uDeriva: { value: new T.Vector2() }, uSol: { value: new T.Vector3(0.6, 0.5, 0.4) }, uSolPlaneta: { value: new T.Vector3(0.6, 0.5, 0.4) }, uForcaSol: { value: 1 }, uNoite: { value: 0 }
    },
    side: T.BackSide, depthWrite: false, depthTest: false, toneMapped: false, fog: false
  });
  m.extensions = { derivatives: true };
  const esfera = new T.Mesh(new T.SphereGeometry(600, 64, 32), m); esfera.renderOrder = -20; esfera.frustumCulled = false;
  ceu.add(esfera); CAMPO.ceuCinema = m;
}
// Liga o céu à hora do painel: o sol muda de lugar, à noite o planeta fica no escuro e as cidades acendem
function passoCeuDeCinema(t) {
  const m = CAMPO.ceuCinema, p = CAMPO.luzDoCeu; if (!m || !p) return;
  const U = m.uniforms, noite = p.postes || 0;
  U.uSol.value.set(p.sol[2], p.sol[3], p.sol[4]).normalize();
  // à noite a "luz do sol" da cena é a lua: o planeta fica de costas para o sol
  U.uSolPlaneta.value.copy(U.uSol.value).lerp(CINEMA.tmpNoite || (CINEMA.tmpNoite = new THREE.Vector3(0.25, -0.9, -0.35).normalize()), Math.min(1, noite * 1.1)).normalize();
  U.uForcaSol.value = 1 - noite * 0.55; U.uNoite.value = noite;
  (CAMPO.matsFiletes || []).forEach(([mf, base]) => { mf.emissiveIntensity = base * (0.12 + 0.88 * noite); });
  U.uDeriva.value.set(t * 0.00016, t * 0.00005);   // o planeta e as nuvens andam devagar lá embaixo
}

/* ---------- 3. Mapa de ambiente do espaço (o que vidro, água e metal refletem) ----------
   Em cima, o céu quase preto; no horizonte, o fio azul da atmosfera; embaixo, o planeta claro. */
function ambienteDoEspaco(renderer) {
  const T = THREE;
  const c = telaDe(1024, 512, (g, w, h) => {
    const hz = h * 0.585;
    let gr = g.createLinearGradient(0, 0, 0, hz); gr.addColorStop(0, '#020308'); gr.addColorStop(0.7, '#070c18'); gr.addColorStop(0.94, '#1b3766'); gr.addColorStop(1, '#6fa6e8');
    g.fillStyle = gr; g.fillRect(0, 0, w, hz);
    gr = g.createLinearGradient(0, hz, 0, h); gr.addColorStop(0, '#b8d4f2'); gr.addColorStop(0.08, '#5d8cc4'); gr.addColorStop(0.5, '#2f5d91'); gr.addColorStop(1, '#244a77');
    g.fillStyle = gr; g.fillRect(0, hz, w, h - hz);
    // nuvens do planeta
    const s = sorteio('ambiente-rf');
    for (let k = 0; k < 260; k++) { const y = hz + 6 + s() * (h - hz), r = 6 + s() * 34 * (y - hz) / (h - hz); g.fillStyle = `rgba(235,242,250,${0.18 + s() * 0.35})`; g.beginPath(); g.ellipse(s() * w, y, r * 2.2, r * 0.6, 0, 0, Math.PI * 2); g.fill(); }
    // o sol (ponto forte no céu)
    const sg = g.createRadialGradient(w * 0.62, h * 0.3, 0, w * 0.62, h * 0.3, 60); sg.addColorStop(0, 'rgba(255,250,235,1)'); sg.addColorStop(1, 'rgba(255,250,235,0)'); g.fillStyle = sg; g.fillRect(0, 0, w, h);
  });
  const eq = new T.CanvasTexture(c); eq.mapping = T.EquirectangularReflectionMapping; eq.encoding = T.sRGBEncoding;
  const pm = new T.PMREMGenerator(renderer); const tex = pm.fromEquirectangular(eq).texture; pm.dispose(); eq.dispose();
  return tex;
}

/* ---------- 4. Rocha da ilha ----------
   Material: as cores vêm de camadas de sedimento (arenito em cima, rocha cinza no meio, basalto
   escuro embaixo), com variação fina, musgo nas saliências de cima e um relevo que não depende de
   textura (calculado no shader). */
function materialDeRocha(op) {
  const T = THREE, o = Object.assign({ topo: 47, altura: 95, relevo: 1 }, op || {});
  const m = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, envMap: CAMPO.ambiente, envMapIntensity: 0.55 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTopo = { value: o.topo }; sh.uniforms.uAltura = { value: o.altura }; sh.uniforms.uRelevo = { value: o.relevo };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRf;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  vec4 rfP = vec4(position, 1.0);
  #ifdef USE_INSTANCING
  rfP = instanceMatrix * rfP;
  vRf = rfP.xyz;
  #else
  vRf = position * vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
  #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vRf; uniform float uTopo, uAltura, uRelevo;
float rfCamadaG, rfFinoG, rfProfG, rfPerto, rfPertoC;   // calculados na cor e reaproveitados no relevo
${GLSL_RUIDO}
float rfCamadas(vec3 p) { return sin(p.y * 0.85 + rfFbm(vec3(p.x * 0.012, p.y * 0.05, p.z * 0.012), 3) * 10.0) * 0.5 + 0.5; }
vec3 rfPerturbar(vec3 pos, vec3 n, vec2 dH, float fd) {
  vec3 sx = dFdx(pos), sy = dFdy(pos), r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1) * fd; vec3 g = sign(det) * (dH.x * r1 + dH.y * r2);
  return normalize(abs(det) * n - g);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  {
    float prof = clamp((uTopo - vRf.y) / uAltura, 0.0, 1.0);
    // de longe o detalhe fino some aos poucos (senão vira chuvisco): px = tamanho do pixel na rocha
    float px = length(fwidth(vRf));
    rfPerto = 1.0 - smoothstep(0.8, 3.0, px);
    rfPertoC = 1.0 - smoothstep(1.5, 4.5, px);
    float camada = mix(0.5, rfCamadas(vRf), rfPertoC);
    float fino = mix(0.5, rfFbm(vRf * 0.45, 4), rfPerto);
    float grande = rfFbm(vRf * 0.04, 2);
    rfCamadaG = camada; rfFinoG = fino; rfProfG = prof;
    vec3 arenito = vec3(0.47, 0.37, 0.27), cinza = vec3(0.33, 0.31, 0.29), basalto = vec3(0.15, 0.14, 0.15);
    vec3 cor = mix(arenito, cinza, smoothstep(0.08, 0.45, prof + (grande - 0.5) * 0.3));
    cor = mix(cor, basalto, smoothstep(0.45, 0.95, prof + (grande - 0.5) * 0.3));
    cor *= 0.78 + 0.32 * camada + (fino - 0.5) * 0.55;
    cor = mix(cor, cor * vec3(0.85, 0.72, 0.6), smoothstep(0.55, 0.75, rfFbm(vRf * 0.09 + 3.0, 2)) * 0.6);   // manchas de ferrugem
    diffuseColor.rgb = cor;
  }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    float hb = (rfFinoG * 1.1 + rfR3(vRf * 2.2) * 0.2) * rfPerto + rfCamadaG * 0.35 * rfPertoC;
    normal = rfPerturbar(-vViewPosition, normal, vec2(dFdx(hb), dFdy(hb)) * 1.6 * uRelevo, faceDirection);
    vec3 nMundo = inverseTransformDirection(normal, viewMatrix);
    float musgo = smoothstep(0.35, 0.8, nMundo.y) * (1.0 - smoothstep(0.0, 0.5, rfProfG)) * smoothstep(0.35, 0.65, rfFbm(vRf * 0.3 + 11.0, 2));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.24, 0.09) * (0.8 + 0.4 * rfFinoG), musgo);
  }`);
  };
  m.customProgramCacheKey = () => 'rochaRF';
  return m;
}
// Forma da rocha: em cima segue o desenho da ilha; descendo, fica redonda, cheia de saliências e sulcos
function geometriaDeRocha() {
  const T = THREE, geo = new T.CylinderGeometry(1, 1, 1, 220, 90, false);
  const pos = geo.attributes.position, v = new T.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const ang = Math.atan2(v.z, v.x), h = 0.5 - v.y, plano = Math.hypot(v.x, v.z) > 0.01, dx = Math.cos(ang), dz = Math.sin(ang);
    if (plano) {
      let r = raioDaRocha(ang, h) / 128;
      if (h > 0.015) {
        const lumps = fbm3(dx * 2.4 + 5, h * 3.2, dz * 2.4 + 5, 5) - 0.5;          // saliências grandes
        const sulcos = fbm3(dx * 11 + 2, h * 1.1, dz * 11 + 2, 3) - 0.5;          // sulcos de erosão (compridos, de cima para baixo)
        const degraus = Math.sin(h * 46 + lumps * 8) * 0.012;                      // degraus das camadas
        r *= 1 + (lumps * 0.34 + sulcos * 0.2) * (0.22 + h * 0.9) + degraus * (1 - h);
        r = Math.max(r, 0.02);
      }
      v.x = dx * r; v.z = dz * r;
      if (h > 0.015 && h < 0.995) v.y += (fbm3(dx * 4 + 1, h * 6, dz * 4 + 1, 3) - 0.5) * 0.05;
    }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}
// Estalactites penduradas na parte de baixo da rocha
function estalactites(g, cx, cz, matRocha, topoY) {
  const T = THREE, s = sorteio('estalactites-rf'), n = 70;
  const geo = new T.ConeGeometry(1, 1, 10, 6).rotateX(Math.PI).translate(0, -0.5, 0);   // ponta para baixo, base no y = 0
  { const p = geo.attributes.position, v = new T.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = 0.82 + 0.36 * ruido3(v.x * 3, v.y * 4, v.z * 3); p.setXYZ(i, v.x * k, v.y, v.z * k); } geo.computeVertexNormals(); }
  const im = new T.InstancedMesh(geo, matRocha, n), m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), p = new T.Vector3(), sc = new T.Vector3();
  for (let k = 0; k < n; k++) {
    const h = 0.35 + s() * 0.55, a = s() * Math.PI * 2, r = raioDaRocha(a, h) * 0.86;
    p.set(cx + Math.cos(a) * r, topoY - h * 95 + 2, cz + Math.sin(a) * r);
    e.set((s() - 0.5) * 0.25, s() * 6, (s() - 0.5) * 0.25); q.setFromEuler(e);
    const L = 6 + s() * 26 * (1.2 - h), lg = 1.4 + s() * 3.2;
    im.setMatrixAt(k, m4.compose(p, q, sc.set(lg, L, lg)));
  }
  im.castShadow = false; im.receiveShadow = true; g.add(im);
}

/* ---------- 5. Nuvens de verdade ----------
   Textura desenhada com ruído (borda irregular, miolo mais denso, embaixo um pouco mais escura,
   como nuvem iluminada de cima). Ficam em volta e por baixo da ilha, nunca em cima das empresas. */
function texturaDeNuvem(semente) {
  const T = THREE, N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N), s = sorteio('nuvem-' + semente), ox = s() * 50, oz = s() * 50;
  // algumas "bolhas" que formam o desenho geral da nuvem
  const bolhas = []; for (let k = 0; k < 7; k++) bolhas.push([0.25 + s() * 0.5, 0.38 + s() * 0.3, 0.14 + s() * 0.16]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    let forma = 0; bolhas.forEach(([bx, by, br]) => { const d = Math.hypot((u - bx) / 1.3, v - by) / br; forma = Math.max(forma, 1 - d); });
    const r = fbm3(u * 6 + ox, v * 6 + oz, semente * 3.1, 5);
    let a = Math.max(0, Math.min(1, (forma * 1.25 + (r - 0.5) * 1.3 - 0.05) * 1.6));
    a *= Math.max(0, Math.min(1, (1 - Math.hypot(u - 0.5, (v - 0.5) * 1.15) * 2) * 3));
    const luz = 0.7 + 0.3 * Math.max(0, Math.min(1, 1.2 - v * 1.3)) + (r - 0.5) * 0.25;
    const k = (y * N + x) * 4, cor = Math.max(0, Math.min(255, luz * 255));
    img.data[k] = cor; img.data[k + 1] = cor; img.data[k + 2] = Math.min(255, cor * 1.03); img.data[k + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t;
}
function nuvensDaIlha(g, cx, cz) {
  const T = THREE, s = sorteio('nuvens-ilha-rf'), texs = [1, 2, 3, 4].map(texturaDeNuvem), lista = [];
  const pequeno = telaPequena();
  const nova = (x, y, z, larg, op, k) => {
    const sp = new T.Sprite(new T.SpriteMaterial({ map: texs[k % texs.length], color: 0xffffff, transparent: true, opacity: op, depthWrite: false, fog: false }));
    sp.scale.set(larg, larg * (0.42 + s() * 0.2), 1); sp.position.set(x, y, z); g.add(sp);
    lista.push({ sp, base: op, x0: x, z0: z, f: s() * 6, v: 0.15 + s() * 0.25 });
  };
  // anel de nuvens logo abaixo da borda
  for (let k = 0; k < (pequeno ? 26 : 48); k++) { const a = s() * Math.PI * 2, r = 158 + s() * 75; nova(cx + Math.cos(a) * r, -18 - s() * 55, cz + Math.sin(a) * r, 70 + s() * 80, 0.55 + s() * 0.35, k); }
  // camada mais funda, grande, por baixo da rocha
  for (let k = 0; k < (pequeno ? 8 : 14); k++) { const a = s() * Math.PI * 2, r = 90 + s() * 160; nova(cx + Math.cos(a) * r, -105 - s() * 60, cz + Math.sin(a) * r, 130 + s() * 120, 0.35 + s() * 0.3, k + 1); }
  CAMPO.nuvensIlha = lista;
}
function passoNuvensDaIlha(t) {
  const L = CAMPO.nuvensIlha, p = CAMPO.luzDoCeu; if (!L) return;
  (CAMPO.nuvens || []).forEach((n) => { n.visible = false; });   /* as nuvens antigas, altas em cima da cidade, saem: agora as nuvens ficam em volta e embaixo da ilha */
  const noite = p ? p.postes : 0, tarde = p && p.sol ? Math.max(0, 1 - p.sol[3] / 40) * (1 - noite) : 0;
  const cor = CINEMA.corNuvem || (CINEMA.corNuvem = new THREE.Color());
  cor.setRGB(1, 1, 1).lerp(CINEMA.corTarde || (CINEMA.corTarde = new THREE.Color(1.0, 0.68, 0.5)), tarde * 0.8).lerp(CINEMA.corNoiteN || (CINEMA.corNoiteN = new THREE.Color(0.16, 0.2, 0.3)), noite * 0.85);
  L.forEach((n) => { n.sp.material.color.copy(cor); n.sp.material.opacity = n.base * (1 - noite * 0.35); n.sp.position.x = n.x0 + Math.sin(t * 0.02 * n.v + n.f) * 6; n.sp.position.z = n.z0 + Math.cos(t * 0.017 * n.v + n.f) * 6; });
}

/* ---------- 6. Árvores ----------
   Copa irregular (vários "tufos" e não uma bola lisa) e cor que varia de árvore para árvore. */
function copaIrregular() {
  const T = THREE, geo = new T.IcosahedronGeometry(1, 3), p = geo.attributes.position, v = new T.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + (fbm3(v.x * 1.6 + 3, v.y * 1.6 + 3, v.z * 1.6 + 3, 3) - 0.5) * 0.7 + (ruido3(v.x * 5, v.y * 5, v.z * 5) - 0.5) * 0.14;
    v.multiplyScalar(k); if (v.y < -0.35) v.y = -0.35 + (v.y + 0.35) * 0.45;   // embaixo mais reto, como copa de verdade
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}
// Variação de cor por árvore (e por arbusto) nos lotes de peças repetidas
function variarCorDasCopas(im) {
  if (!im.material || !im.material.userData || !im.material.userData.variarCor || !im.count) return;
  const s = sorteio('copas-' + im.count), c = new THREE.Color();
  for (let i = 0; i < im.count; i++) { const k = 0.78 + s() * 0.4; c.setRGB(k * (0.92 + s() * 0.16), k, k * (0.85 + s() * 0.2)); im.setColorAt(i, c); }
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
}

/* ---------- 7. Pedaços de rocha (asteroides) com cara de pedra ---------- */
function geometriaDePedra() {
  const T = THREE, geo = new T.IcosahedronGeometry(1, 2), p = geo.attributes.position, v = new T.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = 0.72 + fbm3(v.x * 1.8 + 7, v.y * 1.8 + 7, v.z * 1.8 + 7, 4) * 0.62; p.setXYZ(i, v.x * k, v.y * k * 0.85, v.z * k); }
  geo.computeVertexNormals();
  return geo;
}
</script>
