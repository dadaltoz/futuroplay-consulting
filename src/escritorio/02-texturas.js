/* =====================================================================
   TEXTURAS — tudo o que é desenhado num canvas e vira imagem no 3D.
   Nenhuma tela decorativa leva número: número só aparece quando vem do painel
   (a tela grande de cada sala). Gráfico de enfeite é só forma.
   ===================================================================== */

const FONTE = '"Inter", "Segoe UI", system-ui, -apple-system, Arial, sans-serif';
function tela(w, h, desenhar) { const c = document.createElement('canvas'); c.width = w; c.height = h; desenhar(c.getContext('2d'), w, h); return c; }
function textura(c, repetir) {
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
  if (repetir) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repetir[0], repetir[1]); }
  return t;
}
const TEX = new Map();
const texGuardada = (chave, criar) => { if (!TEX.has(chave)) TEX.set(chave, criar()); return TEX.get(chave); };
function retanguloRedondo(q, x, y, w, h, r) { q.beginPath(); q.moveTo(x + r, y); q.arcTo(x + w, y, x + w, y + h, r); q.arcTo(x + w, y + h, x, y + h, r); q.arcTo(x, y + h, x, y, r); q.arcTo(x, y, x + w, y, r); q.closePath(); }

// O símbolo da Real Forte como imagem (carrega rápido: está dentro da página)
const IMG_SIMBOLO = (typeof Image !== 'undefined') ? Object.assign(new Image(), { src: SIMBOLO_RF }) : null;
// Desenha agora e de novo quando o símbolo terminar de carregar (a textura se atualiza sozinha)
function comSimbolo(t, redesenhar) {
  if (IMG_SIMBOLO && !(IMG_SIMBOLO.complete && IMG_SIMBOLO.naturalWidth)) IMG_SIMBOLO.addEventListener('load', () => { redesenhar(); t.needsUpdate = true; }, { once: true });
  return t;
}
const simboloPronto = () => IMG_SIMBOLO && IMG_SIMBOLO.complete && IMG_SIMBOLO.naturalWidth;

/* ---------- Pisos e paredes ---------- */
// Porcelanato claro em placas grandes (1,2 m), com veio bem leve
function texPiso() {
  return texGuardada('piso', () => textura(tela(1024, 1024, (q, W) => {
    q.fillStyle = '#b5afa7'; q.fillRect(0, 0, W, W);
    const s = sorteio(7);
    for (let i = 0; i < 9000; i++) { const v = 170 + s() * 30; q.fillStyle = `rgba(${v},${v - 3},${v - 8},${0.18 * s()})`; q.fillRect(s() * W, s() * W, 2, 2); }
    q.lineCap = 'round';
    for (let k = 0; k < 7; k++) {   // veios
      q.strokeStyle = `rgba(150,145,140,${0.05 + s() * 0.07})`; q.lineWidth = 1 + s() * 2.5; q.beginPath();
      let x = s() * W, y = s() * W; q.moveTo(x, y);
      for (let j = 0; j < 12; j++) { x += (s() - 0.3) * 120; y += (s() - 0.5) * 90; q.lineTo(x, y); }
      q.stroke();
    }
    q.fillStyle = 'rgba(120,114,108,.45)'; [0, W / 2].forEach((p) => { q.fillRect(p, 0, 3, W); q.fillRect(0, p, W, 3); });   // rejunte
  }), [1, 1]));
}
// Madeira em réguas (piso de sala, painel de parede)
function texMadeira(tom) {
  return texGuardada('madeira:' + tom, () => textura(tela(512, 512, (q, W) => {
    const base = tom === 'escura' ? [92, 62, 42] : tom === 'clara' ? [196, 158, 116] : [158, 112, 76];
    const s = sorteio(tom === 'escura' ? 11 : 13), n = 6;
    for (let i = 0; i < n; i++) {
      const v = (s() - 0.5) * 22; q.fillStyle = `rgb(${base[0] + v},${base[1] + v * 0.8},${base[2] + v * 0.6})`; q.fillRect(i * W / n, 0, W / n, W);
      for (let k = 0; k < 40; k++) { q.strokeStyle = `rgba(40,25,15,${0.04 + s() * 0.07})`; q.lineWidth = 1 + s() * 1.5; q.beginPath(); const x = i * W / n + s() * W / n; q.moveTo(x, 0); q.bezierCurveTo(x + (s() - 0.5) * 10, W * 0.3, x + (s() - 0.5) * 10, W * 0.7, x + (s() - 0.5) * 8, W); q.stroke(); }
      q.fillStyle = 'rgba(30,18,10,.35)'; q.fillRect(i * W / n, 0, 2, W);
    }
  })));
}
// Mármore branco com veio cinza (frente da mesa do Atlas, parede da diretoria)
function texMarmore() {
  return texGuardada('marmore', () => textura(tela(1024, 512, (q, W, H) => {
    q.fillStyle = '#efedea'; q.fillRect(0, 0, W, H);
    const s = sorteio(21); q.lineCap = 'round';
    for (let k = 0; k < 16; k++) {
      q.strokeStyle = `rgba(110,108,112,${0.08 + s() * 0.18})`; q.lineWidth = 0.6 + s() * 2.2; q.shadowColor = 'rgba(120,120,125,.35)'; q.shadowBlur = 6;
      q.beginPath(); let x = s() * W, y = -10; q.moveTo(x, y);
      while (y < H + 10) { x += (s() - 0.5) * 60; y += 20 + s() * 40; q.lineTo(x, y); }
      q.stroke();
    }
  })));
}
// Painel de tecido acústico / parede pintada com leve textura
function texParede(cor) {
  return texGuardada('parede:' + cor, () => textura(tela(256, 256, (q, W) => {
    q.fillStyle = cor; q.fillRect(0, 0, W, W); const s = sorteio(5);
    for (let i = 0; i < 2500; i++) { q.fillStyle = `rgba(${s() > 0.5 ? '255,255,255' : '0,0,0'},${0.03 * s()})`; q.fillRect(s() * W, s() * W, 2, 2); }
  }), [2, 2]));
}

/* ---------- Ícones dos selos (traço branco) ---------- */
function desenharIcone(q, tipo, x, y, s, cor) {
  q.save(); q.translate(x, y); q.strokeStyle = cor; q.fillStyle = cor; q.lineWidth = s * 0.085; q.lineCap = 'round'; q.lineJoin = 'round';
  const L = (pts, fechar) => { q.beginPath(); pts.forEach(([a, b], i) => (i ? q.lineTo(a * s, b * s) : q.moveTo(a * s, b * s))); if (fechar) q.closePath(); q.stroke(); };
  const C = (a, b, r, cheio) => { q.beginPath(); q.arc(a * s, b * s, r * s, 0, Math.PI * 2); if (cheio) q.fill(); else q.stroke(); };
  if (tipo === 'grafico') { [[-0.38, 0.12], [-0.12, -0.05], [0.14, -0.22], [0.4, 0.0]].forEach(([a, b]) => q.fillRect((a - 0.08) * s, b * s, 0.16 * s, (0.42 - b) * s)); L([[-0.48, 0.0], [-0.12, -0.3], [0.12, -0.18], [0.48, -0.48]]); L([[0.3, -0.48], [0.48, -0.48], [0.48, -0.3]]); }
  else if (tipo === 'megafone') { L([[-0.42, -0.12], [-0.1, -0.12], [0.38, -0.42], [0.38, 0.38], [-0.1, 0.1], [-0.42, 0.1]], true); L([[-0.28, 0.1], [-0.18, 0.42], [-0.04, 0.42], [-0.08, 0.12]]); }
  else if (tipo === 'funil') { L([[-0.45, -0.4], [0.45, -0.4], [0.1, 0.05], [0.1, 0.42], [-0.1, 0.32], [-0.1, 0.05]], true); L([[-0.3, -0.2], [0.3, -0.2]]); }
  else if (tipo === 'caminhao') { q.strokeRect(-0.48 * s, -0.3 * s, 0.56 * s, 0.5 * s); L([[0.08, -0.12], [0.3, -0.12], [0.46, 0.05], [0.46, 0.2], [0.08, 0.2]]); C(-0.28, 0.3, 0.1); C(0.28, 0.3, 0.1); }
  else if (tipo === 'pessoas') { C(-0.22, -0.2, 0.13); C(0.22, -0.2, 0.13); q.beginPath(); q.arc(-0.22 * s, 0.32 * s, 0.24 * s, Math.PI, 0); q.stroke(); q.beginPath(); q.arc(0.22 * s, 0.32 * s, 0.24 * s, Math.PI, 0); q.stroke(); }
  else if (tipo === 'engrenagem') { q.beginPath(); for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, r = (k % 3 === 0 ? 0.46 : 0.36) * s; q.lineTo(Math.cos(a) * r, Math.sin(a) * r); } q.closePath(); q.stroke(); C(0, 0, 0.14); }
  else if (tipo === 'coroa') { L([[-0.42, 0.25], [-0.42, -0.25], [-0.2, 0.0], [0, -0.35], [0.2, 0.0], [0.42, -0.25], [0.42, 0.25]], true); L([[-0.42, 0.38], [0.42, 0.38]]); }
  else if (tipo === 'chip') { q.strokeRect(-0.28 * s, -0.28 * s, 0.56 * s, 0.56 * s); q.strokeRect(-0.1 * s, -0.1 * s, 0.2 * s, 0.2 * s); [-0.14, 0, 0.14].forEach((p) => { L([[p, -0.28], [p, -0.44]]); L([[p, 0.28], [p, 0.44]]); L([[-0.28, p], [-0.44, p]]); L([[0.28, p], [0.44, p]]); }); }
  else if (tipo === 'fone') { q.beginPath(); q.arc(0, 0.05 * s, 0.36 * s, Math.PI, 0); q.stroke(); q.fillRect(-0.44 * s, 0.0, 0.16 * s, 0.32 * s); q.fillRect(0.28 * s, 0.0, 0.16 * s, 0.32 * s); L([[0.36, 0.32], [0.2, 0.44], [0.0, 0.44]]); }
  else if (tipo === 'reuniao') { q.beginPath(); q.ellipse(0, 0.05 * s, 0.3 * s, 0.17 * s, 0, 0, Math.PI * 2); q.stroke(); [[-0.42, 0.05], [0.42, 0.05], [0, -0.3], [0, 0.4], [-0.25, -0.22], [0.25, -0.22], [-0.25, 0.32], [0.25, 0.32]].forEach(([a, b]) => C(a, b, 0.055, true)); }
  else { L([[-0.42, -0.28], [-0.12, -0.28], [-0.02, -0.16], [0.42, -0.16], [0.42, 0.34], [-0.42, 0.34]], true); }   // pasta
  q.restore();
}
// Selo hexagonal: fundo azul-marinho da Real Forte, borda laranja acesa e o ícone (ou o símbolo da Real Forte)
function texSelo(icone) {
  return texGuardada('selo:' + icone, () => {
    const desenhar = (q, W) => {
      q.clearRect(0, 0, W, W);
      const hex = (r) => { q.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; q.lineTo(W / 2 + Math.cos(a) * r, W / 2 + Math.sin(a) * r); } q.closePath(); };
      q.save(); q.shadowColor = 'rgba(255,122,26,.9)'; q.shadowBlur = W * 0.05; hex(W * 0.45); q.fillStyle = LARANJA_CSS; q.fill(); q.restore();
      hex(W * 0.41); const g = q.createLinearGradient(0, 0, 0, W); g.addColorStop(0, '#1b4866'); g.addColorStop(1, '#0c2638'); q.fillStyle = g; q.fill();
      if (icone === 'rf') { if (simboloPronto()) q.drawImage(IMG_SIMBOLO, W * 0.2, W * 0.2, W * 0.6, W * 0.6); }
      else desenharIcone(q, icone, W / 2, W / 2, W * 0.42, '#ffffff');
    };
    const c = tela(512, 512, desenhar), t = textura(c);
    return icone === 'rf' ? comSimbolo(t, () => desenhar(c.getContext('2d'), 512)) : t;
  });
}
// Placa de LED: vidro escuro com o nome aceso e uma barrinha da cor do dono
function texPlaca(texto, corCss, sub) {
  return texGuardada(['placa', texto, corCss, sub].join('|'), () => textura(tela(1024, 256, (q, W, H) => {
    const g = q.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1d2128'); g.addColorStop(1, '#0c0e12'); q.fillStyle = g; q.fillRect(0, 0, W, H);
    q.fillStyle = 'rgba(255,255,255,.06)'; q.fillRect(0, 0, W, H * 0.45);
    const cor = corCss || LARANJA_CSS;
    q.save(); q.shadowColor = cor; q.shadowBlur = 24; q.fillStyle = cor; retanguloRedondo(q, W * 0.05, H * 0.3, H * 0.09, H * 0.4, H * 0.04); q.fill(); q.restore();
    q.textBaseline = 'middle'; q.fillStyle = '#ffffff'; let tam = H * (sub ? 0.36 : 0.44);
    const t = String(texto).toUpperCase(); q.font = `700 ${tam}px ${FONTE}`;
    const larg = W * 0.82; while (q.measureText(t).width > larg && tam > 20) { tam *= 0.93; q.font = `700 ${tam}px ${FONTE}`; }
    q.save(); q.shadowColor = 'rgba(255,255,255,.55)'; q.shadowBlur = 10; q.fillText(t, W * 0.12, sub ? H * 0.4 : H * 0.52); q.restore();
    if (sub) { q.fillStyle = cor; let t2 = H * 0.17; q.font = `500 ${t2}px ${FONTE}`; while (q.measureText(sub).width > larg && t2 > 12) { t2 *= 0.93; q.font = `500 ${t2}px ${FONTE}`; } q.fillText(sub, W * 0.12, H * 0.72); }
  })));
}

/* ---------- Telas de enfeite (sem número) ---------- */
function fundoTela(q, W, H, cor) {
  const g = q.createLinearGradient(0, 0, 0, H); g.addColorStop(0, cor || '#0e1a2b'); g.addColorStop(1, '#070b12'); q.fillStyle = g; q.fillRect(0, 0, W, H);
  q.strokeStyle = 'rgba(120,170,230,.08)'; q.lineWidth = 1; for (let x = 0; x < W; x += 32) { q.beginPath(); q.moveTo(x, 0); q.lineTo(x, H); q.stroke(); } for (let y = 0; y < H; y += 32) { q.beginPath(); q.moveTo(0, y); q.lineTo(W, y); q.stroke(); }
}
// tipo: barras, linhas, mapa, codigo, onda, planta, documento, radar, rede, funil, kanban, quadro, moodboard, ferramentas, cores
function texTela(tipo, corCss, semente) {
  return texGuardada(['tela', tipo, corCss, semente].join('|'), () => textura(tela(512, 320, (q, W, H) => desenharTela(q, W, H, tipo, corCss || '#4fd1ff', sorteio(semente || 3)))));
}
function desenharTela(q, W, H, tipo, cor, s) {
  q.lineCap = 'round'; q.lineJoin = 'round';
  if (tipo === 'documento') {
    q.fillStyle = '#e9edf3'; q.fillRect(0, 0, W, H); q.fillStyle = '#ffffff'; q.fillRect(W * 0.22, H * 0.06, W * 0.56, H * 0.94);
    q.fillStyle = cor; q.fillRect(W * 0.27, H * 0.13, W * 0.3, 10); q.fillStyle = '#c3ccd8';
    for (let i = 0; i < 9; i++) q.fillRect(W * 0.27, H * 0.24 + i * 22, W * (0.36 + s() * 0.1), 6);
    q.fillStyle = cor; q.globalAlpha = 0.6; [0.3, 0.5, 0.42, 0.62].forEach((h, i) => q.fillRect(W * 0.55 + i * 16, H * 0.82 - h * 60, 10, h * 60)); q.globalAlpha = 1;
    return;
  }
  if (tipo === 'planta') {
    q.fillStyle = '#123a6b'; q.fillRect(0, 0, W, H); q.strokeStyle = 'rgba(255,255,255,.12)'; q.lineWidth = 1;
    for (let x = 0; x < W; x += 16) { q.beginPath(); q.moveTo(x, 0); q.lineTo(x, H); q.stroke(); } for (let y = 0; y < H; y += 16) { q.beginPath(); q.moveTo(0, y); q.lineTo(W, y); q.stroke(); }
    q.strokeStyle = '#e8f1ff'; q.lineWidth = 3; q.strokeRect(60, 50, 390, 220); q.beginPath(); q.moveTo(200, 50); q.lineTo(200, 170); q.lineTo(60, 170); q.moveTo(300, 270); q.lineTo(300, 150); q.lineTo(450, 150); q.stroke();
    q.lineWidth = 1.5; q.setLineDash([6, 5]); q.beginPath(); q.arc(200, 170, 40, Math.PI, Math.PI * 1.5); q.stroke(); q.setLineDash([]);
    q.beginPath(); q.moveTo(60, 290); q.lineTo(450, 290); q.moveTo(60, 284); q.lineTo(60, 296); q.moveTo(450, 284); q.lineTo(450, 296); q.stroke();
    return;
  }
  if (tipo === 'quadro') {   // quadro de investigação: cortiça, fotos, bilhetes e linha vermelha
    q.fillStyle = '#a77c4f'; q.fillRect(0, 0, W, H); for (let i = 0; i < 3000; i++) { q.fillStyle = `rgba(${s() > 0.5 ? '60,35,15' : '230,200,160'},${0.15 * s()})`; q.fillRect(s() * W, s() * H, 2, 2); }
    const P = []; for (let i = 0; i < 7; i++) { const x = 40 + (i % 4) * 120 + s() * 30, y = 30 + Math.floor(i / 4) * 150 + s() * 40; P.push([x + 40, y + 8]);
      q.save(); q.translate(x + 40, y + 50); q.rotate((s() - 0.5) * 0.25); q.fillStyle = i % 3 === 2 ? '#f6e27a' : '#f4f1ea'; q.fillRect(-42, -45, 84, i % 3 === 2 ? 80 : 96);
      if (i % 3 !== 2) { q.fillStyle = '#5b6470'; q.fillRect(-34, -38, 68, 56); q.fillStyle = '#8a96a6'; q.beginPath(); q.arc(0, -16, 12, 0, 7); q.fill(); q.fillRect(-18, -2, 36, 20); }
      else { q.fillStyle = 'rgba(60,60,60,.5)'; for (let k = 0; k < 4; k++) q.fillRect(-32, -30 + k * 14, 50 + s() * 14, 4); }
      q.restore(); }
    q.strokeStyle = '#d0202a'; q.lineWidth = 2.5; q.beginPath(); [[0, 2], [2, 5], [5, 1], [1, 3], [3, 6], [6, 4], [4, 0]].forEach(([a, b]) => { q.moveTo(...P[a]); q.lineTo(...P[b]); }); q.stroke();
    P.forEach(([x, y]) => { q.fillStyle = '#e03030'; q.beginPath(); q.arc(x, y, 6, 0, 7); q.fill(); });
    return;
  }
  if (tipo === 'moodboard') {
    q.fillStyle = '#f3f0ea'; q.fillRect(0, 0, W, H); const cores = ['#ff7a1a', '#e0459b', '#22b8a6', '#3d8bff', '#ffbf1f', '#2b2f36', '#f6c9a8', '#9b6bd6'];
    for (let i = 0; i < 11; i++) { const w = 70 + s() * 60, h = 60 + s() * 60; q.save(); q.translate(30 + s() * (W - 110), 20 + s() * (H - 100)); q.rotate((s() - 0.5) * 0.2);
      q.fillStyle = '#fff'; q.fillRect(-4, -4, w + 8, h + 8); const g = q.createLinearGradient(0, 0, w, h); g.addColorStop(0, cores[i % 8]); g.addColorStop(1, cores[(i + 3) % 8]); q.fillStyle = g; q.fillRect(0, 0, w, h); q.restore(); }
    return;
  }
  if (tipo === 'ferramentas') {   // painel furado com as ferramentas penduradas
    q.fillStyle = '#5c6670'; q.fillRect(0, 0, W, H); q.fillStyle = 'rgba(0,0,0,.35)';
    for (let x = 12; x < W; x += 24) for (let y = 12; y < H; y += 24) { q.beginPath(); q.arc(x, y, 3, 0, 7); q.fill(); }
    q.lineWidth = 9; const fer = ['#d7dde3', '#34c46a', '#d7dde3', '#ffbf1f', '#d7dde3', '#e04a3a', '#d7dde3', '#34c46a'];
    fer.forEach((c, i) => { const x = 40 + i * 58, y = 50 + (i % 2) * 20; q.strokeStyle = c; q.fillStyle = c; q.beginPath(); q.moveTo(x, y); q.lineTo(x, y + 150 + (i % 3) * 30); q.stroke();
      if (i % 3 === 0) { q.beginPath(); q.arc(x, y, 18, Math.PI * 0.2, Math.PI * 1.8); q.lineWidth = 9; q.stroke(); } else if (i % 3 === 1) q.fillRect(x - 16, y - 12, 32, 26); else { q.beginPath(); q.moveTo(x - 14, y + 4); q.lineTo(x, y - 16); q.lineTo(x + 14, y + 4); q.fill(); } });
    return;
  }
  if (tipo === 'cores') {
    q.fillStyle = '#f4f2ee'; q.fillRect(0, 0, W, H);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) { q.fillStyle = `hsl(${i * 45 + j * 6},${70 - j * 8}%,${42 + j * 12}%)`; retanguloRedondo(q, 24 + i * 60, 22 + j * 72, 48, 60, 6); q.fill(); }
    return;
  }
  fundoTela(q, W, H);
  q.shadowColor = cor; q.shadowBlur = 10;
  if (tipo === 'barras') { for (let i = 0; i < 9; i++) { const h = (0.25 + s() * 0.6) * (H - 90); q.fillStyle = i === 6 ? LARANJA_CSS : cor; q.globalAlpha = 0.85; q.fillRect(40 + i * 50, H - 40 - h, 30, h); } q.globalAlpha = 1; q.fillStyle = 'rgba(255,255,255,.55)'; q.fillRect(40, 26, 150, 10); }
  else if (tipo === 'linhas') { [cor, LARANJA_CSS].forEach((c, k) => { q.strokeStyle = c; q.lineWidth = 3; q.beginPath(); let y = H * (0.6 - k * 0.15); for (let x = 30; x <= W - 30; x += 30) { y += (s() - 0.55) * 34; y = Math.max(60, Math.min(H - 40, y)); if (x === 30) q.moveTo(x, y); else q.lineTo(x, y); } q.stroke(); }); q.fillStyle = 'rgba(255,255,255,.55)'; q.fillRect(30, 26, 120, 10); }
  else if (tipo === 'mapa') { q.fillStyle = cor; [[0.2, 0.35, 0.12, 0.16], [0.28, 0.7, 0.06, 0.16], [0.5, 0.33, 0.08, 0.1], [0.53, 0.62, 0.07, 0.17], [0.7, 0.38, 0.16, 0.14], [0.8, 0.75, 0.06, 0.07]].forEach(([cx, cy, rx, ry]) => { for (let i = 0; i < 160; i++) { const a = s() * 7, r = Math.sqrt(s()); q.globalAlpha = 0.75; q.fillRect(W * (cx + Math.cos(a) * rx * r), H * (cy + Math.sin(a) * ry * r), 3, 3); } }); q.globalAlpha = 1; q.strokeStyle = LARANJA_CSS; q.lineWidth = 2; [[0.22, 0.38, 0.52, 0.6], [0.52, 0.34, 0.72, 0.4], [0.3, 0.7, 0.72, 0.4]].forEach(([a, b, c, d]) => { q.beginPath(); q.moveTo(W * a, H * b); q.quadraticCurveTo(W * (a + c) / 2, H * Math.min(b, d) - 60, W * c, H * d); q.stroke(); }); }
  else if (tipo === 'codigo') { const cs = [cor, '#c792ea', '#ffcb6b', '#a6e3a1', 'rgba(255,255,255,.6)']; for (let i = 0; i < 13; i++) { let x = 24 + (i % 4 ? 28 : 0) + (i % 3 === 2 ? 28 : 0); const y = 24 + i * 22; const n = 2 + Math.floor(s() * 4); for (let k = 0; k < n; k++) { const w = 24 + s() * 70; q.fillStyle = cs[Math.floor(s() * cs.length)]; q.fillRect(x, y, w, 8); x += w + 10; } } }
  else if (tipo === 'onda') { q.shadowBlur = 0; const g = q.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#1b1036'); g.addColorStop(1, '#0b1a33'); q.fillStyle = g; q.fillRect(0, 0, W, H); ['#ff7a1a', '#e0459b', '#8e5bd6', '#22d3ee'].forEach((c, k) => { q.strokeStyle = c; q.lineWidth = 10 - k * 1.5; q.globalAlpha = 0.85; q.beginPath(); for (let x = 0; x <= W; x += 8) { const y = H * 0.5 + Math.sin(x / 60 + k * 0.9) * (50 - k * 6) + Math.sin(x / 23 + k) * 8; if (x) q.lineTo(x, y); else q.moveTo(x, y); } q.stroke(); }); q.globalAlpha = 1; }
  else if (tipo === 'radar') { q.strokeStyle = cor; q.lineWidth = 2; q.globalAlpha = 0.7; [40, 80, 120].forEach((r) => { q.beginPath(); q.arc(W / 2, H / 2, r, 0, 7); q.stroke(); }); q.beginPath(); q.moveTo(W / 2 - 140, H / 2); q.lineTo(W / 2 + 140, H / 2); q.moveTo(W / 2, H / 2 - 140); q.lineTo(W / 2, H / 2 + 140); q.stroke(); q.globalAlpha = 0.35; q.fillStyle = cor; q.beginPath(); q.moveTo(W / 2, H / 2); q.arc(W / 2, H / 2, 125, -0.9, -0.1); q.fill(); q.globalAlpha = 1; q.fillStyle = LARANJA_CSS; [[60, -40], [-70, 30], [30, 70]].forEach(([a, b]) => { q.beginPath(); q.arc(W / 2 + a, H / 2 + b, 6, 0, 7); q.fill(); }); }
  else if (tipo === 'rede') { const P = []; for (let i = 0; i < 12; i++) P.push([40 + s() * (W - 80), 40 + s() * (H - 80)]); q.strokeStyle = cor; q.lineWidth = 1.5; q.globalAlpha = 0.6; P.forEach((a, i) => P.slice(i + 1).forEach((b) => { if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 170) { q.beginPath(); q.moveTo(...a); q.lineTo(...b); q.stroke(); } })); q.globalAlpha = 1; P.forEach(([x, y], i) => { q.fillStyle = i % 4 ? cor : LARANJA_CSS; q.beginPath(); q.arc(x, y, i % 4 ? 6 : 9, 0, 7); q.fill(); }); }
  else if (tipo === 'funil') { [0.86, 0.7, 0.54, 0.38, 0.24].forEach((w, i) => { q.fillStyle = i === 4 ? LARANJA_CSS : cor; q.globalAlpha = 0.9 - i * 0.12; q.beginPath(); q.moveTo(W / 2 - W * w / 2, 34 + i * 52); q.lineTo(W / 2 + W * w / 2, 34 + i * 52); q.lineTo(W / 2 + W * (w - 0.16) / 2, 80 + i * 52); q.lineTo(W / 2 - W * (w - 0.16) / 2, 80 + i * 52); q.fill(); }); q.globalAlpha = 1; }
  else if (tipo === 'kanban') { q.shadowBlur = 0; ['#2d3a4d', '#2d3a4d', '#2d3a4d', '#2d3a4d'].forEach((c, i) => { q.fillStyle = c; q.fillRect(16 + i * 124, 20, 112, H - 40); q.fillStyle = 'rgba(255,255,255,.5)'; q.fillRect(26 + i * 124, 32, 60, 8); const n = [4, 3, 2, 3][i]; for (let k = 0; k < n; k++) { q.fillStyle = ['#f6e27a', '#9ee6b4', '#ffb38a', '#a9c8ff'][(i + k) % 4]; q.fillRect(26 + i * 124, 56 + k * 58, 92, 46); } }); }
}

/* ---------- Céu do fim de tarde (visto pela fachada de vidro) ----------
   Fica num cilindro grande atrás da fachada. A câmera olha de cima para baixo, então o horizonte
   (o laranja do pôr do sol e a cidade ao longe) fica abaixo do piso: em 0,62 da altura do desenho. */
function texCeu() {
  return texGuardada('ceu', () => textura(tela(2048, 1024, (q, W, H) => {
    const g = q.createLinearGradient(0, 0, 0, H), hz = 0.62;
    g.addColorStop(0, '#141a3a'); g.addColorStop(0.25, '#2b2a5c'); g.addColorStop(0.42, '#5d4a86'); g.addColorStop(0.52, '#b06f93'); g.addColorStop(0.58, '#f09a76'); g.addColorStop(hz, '#ffcf9a'); g.addColorStop(hz + 0.04, '#3d3352'); g.addColorStop(1, '#141322');
    q.fillStyle = g; q.fillRect(0, 0, W, H);
    const s = sorteio(99);
    for (let i = 0; i < 300; i++) { q.fillStyle = `rgba(255,255,255,${0.15 + s() * 0.6})`; q.fillRect(s() * W, s() * H * 0.3, 1.5, 1.5); }
    const sol = q.createRadialGradient(W * 0.3, H * hz, 0, W * 0.3, H * hz, H * 0.25); sol.addColorStop(0, 'rgba(255,220,170,.9)'); sol.addColorStop(1, 'rgba(255,170,120,0)'); q.fillStyle = sol; q.fillRect(0, 0, W, H);
    // prédios ao longe, desfocados, com janelas acesas
    q.filter = 'blur(1.4px)';
    for (let x = 0; x < W;) { const w = 16 + s() * 40, h = 14 + Math.pow(s(), 2.2) * 150; q.fillStyle = `rgb(${46 + s() * 16},${40 + s() * 12},${70 + s() * 18})`; q.fillRect(x, H * hz - h, w, h + H * 0.08);
      q.fillStyle = 'rgba(255,200,130,.75)'; for (let k = 0; k < h / 5; k++) if (s() > 0.5) q.fillRect(x + 3 + s() * (w - 6), H * hz - h + 4 + s() * (h - 6), 2, 2); x += w + s() * 3; }
    q.filter = 'none';
  })));
}

/* ---------- Plantas e sombras ---------- */
// Folha comprida com nervura (a mesma para todas as plantas; a cor muda no material)
function texFolha() {
  return texGuardada('folha', () => { const t = textura(tela(128, 512, (q, W, H) => {
    q.clearRect(0, 0, W, H); const g = q.createLinearGradient(0, H, 0, 0); g.addColorStop(0, '#3f7a35'); g.addColorStop(1, '#7fbf55'); q.fillStyle = g;
    q.beginPath(); q.moveTo(W / 2, H); q.bezierCurveTo(-W * 0.05, H * 0.6, W * 0.1, H * 0.15, W / 2, 0); q.bezierCurveTo(W * 0.9, H * 0.15, W * 1.05, H * 0.6, W / 2, H); q.fill();
    q.strokeStyle = 'rgba(220,255,190,.55)'; q.lineWidth = 3; q.beginPath(); q.moveTo(W / 2, H); q.lineTo(W / 2, 8); q.stroke();
    q.lineWidth = 1.2; q.strokeStyle = 'rgba(210,250,180,.3)'; for (let y = 60; y < H - 30; y += 34) { q.beginPath(); q.moveTo(W / 2, y + 20); q.quadraticCurveTo(W * 0.3, y + 6, W * 0.16, y - 8); q.moveTo(W / 2, y + 20); q.quadraticCurveTo(W * 0.7, y + 6, W * 0.84, y - 8); q.stroke(); }
  })); return t; });
}
// Mancha de sombra macia (fica embaixo de móvel e robô: tira a cara de "flutuando")
function texSombra() {
  return texGuardada('sombra', () => { const t = new THREE.CanvasTexture(tela(128, 128, (q, W) => { const g = q.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(0.55, 'rgba(0,0,0,.22)'); g.addColorStop(1, 'rgba(0,0,0,0)'); q.fillStyle = g; q.fillRect(0, 0, W, W); })); return t; });
}
function sombraMacia(w, d, opacidade) {
  const chave = 'sombra:' + (opacidade == null ? 0.75 : opacidade);
  const material = guardado(chave, () => new THREE.MeshBasicMaterial({ map: texSombra(), transparent: true, opacity: opacidade == null ? 0.75 : opacidade, depthWrite: false }));
  const m = new THREE.Mesh(GEO.chao, material);
  m.scale.set(w, 1, d); m.renderOrder = 1; m.userData.sombra = true;
  return m;
}

const sombraNoChao = (w, d, opacidade) => { const m = sombraMacia(w, d, opacidade); m.position.y = 0.004; return m; };

/* ---------- Logo da empresa num cartão (sala de reunião) ---------- */
function texLogoEmpresa(src, nome) {
  const W = 1024, H = 576, c = tela(W, H, () => {}), t = textura(c);
  const desenhar = (img) => {
    const q = c.getContext('2d'); const fundo = img ? corDoCartao(img) : '#0f2342';
    q.fillStyle = fundo; q.fillRect(0, 0, W, H);
    if (img) { const k = Math.min(W * 0.62 / img.naturalWidth, H * 0.56 / img.naturalHeight); const w = img.naturalWidth * k, h = img.naturalHeight * k; q.drawImage(img, (W - w) / 2, (H - h) / 2 - 20, w, h); }
    q.fillStyle = fundo === '#ffffff' ? '#0f2342' : '#ffffff'; q.textAlign = 'center'; q.textBaseline = 'middle';
    let tam = img ? 40 : 84; q.font = `700 ${tam}px ${FONTE}`; while (q.measureText(nome).width > W * 0.86 && tam > 18) { tam *= 0.93; q.font = `700 ${tam}px ${FONTE}`; }
    q.fillText(nome, W / 2, img ? H * 0.86 : H / 2);
    q.fillStyle = LARANJA_CSS; q.fillRect(W / 2 - 60, img ? H * 0.93 : H * 0.62, 120, 6);
    t.needsUpdate = true;
  };
  desenhar(null);
  if (src) { const img = new Image(); img.onload = () => { try { img.clara = logoEhClara(img); desenhar(img); } catch (x) { /* fica o nome */ } }; img.src = src; }
  return t;
}

/* ---------- Balões de desenho animado (em cima da cabeça dos robôs) ----------
   tipo: conversa (três pontinhos), ideia (lâmpada), zzz, coracao, musica, cafe, estrela, atencao (!), duvida (?), fone */
function texBalao(tipo) {
  return texGuardada('balao:' + tipo, () => textura(tela(256, 256, (q, W) => {
    q.clearRect(0, 0, W, W);
    q.save(); q.shadowColor = 'rgba(0,0,0,.25)'; q.shadowBlur = 10; q.shadowOffsetY = 4;
    q.fillStyle = '#ffffff'; retanguloRedondo(q, 26, 20, W - 52, W - 82, 60); q.fill();
    q.beginPath(); q.moveTo(W / 2 - 22, W - 66); q.lineTo(W / 2, W - 30); q.lineTo(W / 2 + 22, W - 66); q.fill(); q.restore();
    const cx = W / 2, cy = (W - 62) / 2 + 10; q.lineCap = 'round'; q.lineJoin = 'round';
    if (tipo === 'conversa') { ['#ff7a1a', '#ffb27a', '#ff7a1a'].forEach((c, k) => { q.fillStyle = c; q.beginPath(); q.arc(cx - 46 + k * 46, cy, 15, 0, 7); q.fill(); }); }
    else if (tipo === 'ideia') { q.fillStyle = '#ffd23f'; q.beginPath(); q.arc(cx, cy - 12, 36, 0, 7); q.fill(); q.fillStyle = '#9aa3ad'; q.fillRect(cx - 18, cy + 22, 36, 22); q.strokeStyle = '#ffb000'; q.lineWidth = 6; [-1, 0, 1].forEach((k) => { q.beginPath(); q.moveTo(cx + k * 52, cy - 62 + Math.abs(k) * 14); q.lineTo(cx + k * 64, cy - 76 + Math.abs(k) * 14); q.stroke(); }); }
    else if (tipo === 'zzz') { q.fillStyle = '#6b7cff'; q.font = `900 64px ${FONTE}`; q.textAlign = 'center'; q.fillText('Z', cx - 30, cy + 26); q.font = `900 48px ${FONTE}`; q.fillText('z', cx + 14, cy + 6); q.font = `900 34px ${FONTE}`; q.fillText('z', cx + 44, cy - 16); }
    else if (tipo === 'coracao') { q.fillStyle = '#ff4f7a'; q.beginPath(); q.moveTo(cx, cy + 34); q.bezierCurveTo(cx - 70, cy - 10, cx - 30, cy - 62, cx, cy - 26); q.bezierCurveTo(cx + 30, cy - 62, cx + 70, cy - 10, cx, cy + 34); q.fill(); }
    else if (tipo === 'musica') { q.fillStyle = '#8e5bd6'; q.strokeStyle = '#8e5bd6'; q.lineWidth = 9; q.beginPath(); q.ellipse(cx - 26, cy + 24, 18, 13, -0.4, 0, 7); q.fill(); q.beginPath(); q.ellipse(cx + 30, cy + 12, 18, 13, -0.4, 0, 7); q.fill(); q.beginPath(); q.moveTo(cx - 12, cy + 22); q.lineTo(cx - 12, cy - 40); q.lineTo(cx + 44, cy - 52); q.lineTo(cx + 44, cy + 10); q.stroke(); }
    else if (tipo === 'cafe') { q.fillStyle = '#ff8a2a'; retanguloRedondo(q, cx - 36, cy - 12, 60, 52, 12); q.fill(); q.strokeStyle = '#ff8a2a'; q.lineWidth = 9; q.beginPath(); q.arc(cx + 30, cy + 12, 14, -1.4, 1.4); q.stroke(); q.strokeStyle = '#c9c9d2'; q.lineWidth = 6; [-16, 4].forEach((x) => { q.beginPath(); q.moveTo(cx + x, cy - 22); q.bezierCurveTo(cx + x - 10, cy - 38, cx + x + 10, cy - 46, cx + x, cy - 62); q.stroke(); }); }
    else if (tipo === 'estrela') { q.fillStyle = '#ffc21a'; q.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k / 10 * Math.PI * 2, r = k % 2 ? 22 : 52; q.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r + 4); } q.closePath(); q.fill(); }
    else if (tipo === 'atencao') { q.fillStyle = '#ff7a1a'; retanguloRedondo(q, cx - 13, cy - 54, 26, 74, 13); q.fill(); q.beginPath(); q.arc(cx, cy + 42, 15, 0, 7); q.fill(); }
    else if (tipo === 'duvida') { q.fillStyle = '#4a7be0'; q.font = `900 110px ${FONTE}`; q.textAlign = 'center'; q.fillText('?', cx, cy + 40); }
    else if (tipo === 'fone') { q.strokeStyle = '#2b2f36'; q.lineWidth = 12; q.beginPath(); q.arc(cx, cy + 8, 44, Math.PI, 0); q.stroke(); q.fillStyle = '#ff7a1a'; retanguloRedondo(q, cx - 60, cy + 2, 26, 46, 10); q.fill(); retanguloRedondo(q, cx + 34, cy + 2, 26, 46, 10); q.fill(); }
  })));
}
