/* =====================================================================
   REALFORT SQUAD — o escritório dos agentes de IA (tela Início), em jeito de desenho animado

   O que aparece:
   - NA FRENTE: as sete mini salas dos agentes (Builder, Report, Sherlock, Fix, Scout, Data, Pixel),
     cada uma com a cara da função. A frente é aberta: dá para ver o robô trabalhando.
   - NO MEIO: a Central Atlas, com o telão que mostra o pedido da vez e quem foi chamado.
   - DOS LADOS: o lounge e o quiosque de café (onde o time descansa).
   - NO FUNDO: as casinhas das salas da empresa escolhida, uma por setor do painel, mais a Sala de
     reunião. A tela de cada sala mostra os números de verdade do setor.
   - Os robôs flutuam pela praça. Quando você fala (ou escreve) com o Atlas, todos param e olham
     para você. O Atlas escolhe quem resolve; o escolhido vai para a mini sala e põe o fone.
     Enquanto as ferramentas não estão ligadas, ele avisa que o pedido ficou anotado: nada é inventado.

   Arquivos desta parte (src/escritorio/, juntados em ordem pelo montar.py):
   00-simbolo   símbolo da Real Forte (imagem)
   01-base      estado, cores, agentes, tipos de sala, materiais e peças básicas
   02-texturas  tudo o que é desenhado em canvas (telas, placas, céu, balões)
   03-cenario   salão, Central Atlas, mini salas, lounge, café e as casinhas da empresa
   04-robos     o corpo de cada agente, o rosto digital, o fone e o propulsor
   05-vida      mapa de pisar, caminhos, rotinas livres, pedidos ao Atlas e animações
   06-camera    câmera, cliques, cartão do robô
   07-cinema    renderizador, reflexos, brilho das luzes, laço de quadros e a ligação com o painel

   Usa a biblioteca Three.js (carregada no topo da página). Sem ela, ou se o aparelho não tiver
   3D, a tela Início mostra os cartões de sempre. Nada aqui grava dados: o escritório só lê o painel.
   ===================================================================== */

const CAMPO = { iniciado: false, rodando: false, t: 0, empresaId: '', ap: null, festa: null };

// Cor da saúde do setor (a mesma do resto do painel)
const COR_SAUDE = { saudavel: 0x2fbf71, atencao: 0xf0b429, critico: 0xf0523f, andamento: 0x4d8ff0, sem: 0x8796ad };
const COR_SAUDE_CSS = { saudavel: '#2fbf71', atencao: '#f0b429', critico: '#f0523f', andamento: '#4d8ff0', sem: '#8796ad' };

// O escritório só aparece com a biblioteca carregada e com 3D disponível no aparelho
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

/* A logo é clara (feita para fundo escuro)? Mede o brilho médio dos pontos que aparecem (não
   transparentes). Logo clara vai em cartão azul-marinho; logo escura, em cartão branco.
   Também usada no PDF do relatório. */
function logoEhClara(img) {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 48; const q = c.getContext('2d'); q.drawImage(img, 0, 0, 48, 48);
    const d = q.getImageData(0, 0, 48, 48).data; let soma = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 128) continue; soma += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; n++; }
    if (n < 40) return false;
    // logo sem transparência (fundo pintado): olha só a borda para saber a cor do fundo
    const cheia = n > 48 * 48 * 0.9;
    if (cheia) { let b = 0, nb = 0; for (let k = 0; k < 48; k++) [[k, 0], [k, 47], [0, k], [47, k]].forEach(([x, y]) => { const i = (y * 48 + x) * 4; b += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; nb++; }); return b / nb < 0.35 ? 'fundoEscuro' : false; }
    return soma / n > 0.72;
  } catch (x) { return false; }
}
const corDoCartao = (img) => (img && img.clara === true ? '#0f2342' : img && img.clara === 'fundoEscuro' ? '#0b0e13' : '#ffffff');

/* ---------- Paleta do escritório: branco, grafite, cinza, laranja e metal ---------- */
const ESC = {
  branco: 0xf2f3f5, gelo: 0xe6e8ec, cinza: 0x9aa1ab, cinzaEscuro: 0x5b626c, grafite: 0x2b2f36, preto: 0x14171c,
  laranja: 0xff7a1a, laranjaLuz: 0xff8a2a, navy: 0x12324a, madeira: 0x9a6b45, madeiraClara: 0xc49a6c,
  couro: 0xd9702a, tecido: 0xd8d4cc, vidro: 0xcfe0ea, holo: 0x58c8ff, verdeFolha: 0x3d7a3a
};
const LARANJA_CSS = '#ff7a1a';

/* ---------- O time: o Atlas e os sete agentes ----------
   "faz" = o que cada um vai fazer quando as ferramentas forem ligadas (a lista do projeto).
   "ligado" = o que já funciona de verdade hoje. Por enquanto nada: o cartão diz isso com todas as letras. */
const AGENTES = [
  { id: 'atlas', nome: 'Atlas', papel: 'Coordenador geral', cor: 0xff7a1a, css: '#ff7a1a',
    jeito: 'Calmo, atento e direto. Fala com você e chama quem resolve.',
    faz: ['Conversar com você por voz ou texto', 'Entender o pedido e escolher os agentes', 'Dividir tarefas grandes', 'Acompanhar, revisar e pedir sua aprovação'] },
  { id: 'builder', nome: 'Builder', papel: 'Construtor', cor: 0xffbf1f, css: '#ffbf1f',
    jeito: 'Forte, prático e caprichoso. Gosta de ver a obra pronta.',
    faz: ['Criar empresas e setores no painel', 'Montar e reorganizar as salas', 'Configurar agentes novos'] },
  { id: 'report', nome: 'Report', papel: 'Especialista em documentos', cor: 0x3d8bff, css: '#3d8bff',
    jeito: 'Elegante e organizado. Não entrega nada fora do lugar.',
    faz: ['Relatórios e resumos executivos', 'PDF, Word, apresentações e planilhas', 'Prévia do arquivo antes de salvar'] },
  { id: 'sherlock', nome: 'Sherlock', papel: 'Investigador de gargalos', cor: 0x8e5bd6, css: '#8e5bd6',
    jeito: 'Curioso e desconfiado. Só conclui com evidência.',
    faz: ['Achar gargalos e desperdícios', 'Levantar causas prováveis', 'Organizar as evidências de cada conclusão'] },
  { id: 'fix', nome: 'Fix', papel: 'Executor de demandas', cor: 0x34c46a, css: '#34c46a',
    jeito: 'Ágil e mão na massa. Resolve e avisa.',
    faz: ['Abrir apps e sites no Mac', 'Organizar pastas e arquivos', 'Rodar automações autorizadas'] },
  { id: 'scout', nome: 'Scout', papel: 'Pesquisador', cor: 0x22b8a6, css: '#22b8a6',
    jeito: 'Rápido e atento ao que acontece lá fora.',
    faz: ['Pesquisar na internet', 'Fornecedores, concorrentes e preços', 'Sempre com a fonte'] },
  { id: 'data', nome: 'Data', papel: 'Analista', cor: 0x22d3ee, css: '#22d3ee',
    jeito: 'Preciso. Não arredonda o que não sabe.',
    faz: ['Ler planilhas e indicadores', 'Calcular produtividade e horas', 'Comparar antes e depois'] },
  { id: 'pixel', nome: 'Pixel', papel: 'Criativo', cor: 0xe0459b, css: '#e0459b',
    jeito: 'Descontraído e caprichoso com a aparência.',
    faz: ['Materiais visuais e campanhas', 'Melhorar a cara dos documentos', 'Imagens, quando houver ferramenta de imagem'] }
];
const agentePorId = (id) => AGENTES.find((a) => a.id === id);
/* Palavras que fazem o Atlas chamar cada agente (sem IA, na hora). Se nenhuma bater, o Atlas pergunta à
   IA quem chamar; sem IA, ele mesmo responde que não entendeu. */
const CHAMADO = {
  builder: /\b(cri[ae]r?|monta|constr|novo setor|nova sala|nova empresa|reorganiz|estrutura|departamento|novo agente)/,
  report: /(relat[oó]ri|pdf|documento|word|apresenta[cç][aã]o|slide|resumo|planilha nova|ata\b|consolid)/,
  sherlock: /(gargal|investig|causa|problema|desperd[ií]c|inconsist|por que|porque|perda|erro|trava|atras)/,
  fix: /\b(abr[ae]|abrir|spotify|youtube|site|pasta|arquivo|organiz|automa|script|execut|instala|liga|abre)/,
  scout: /(pesquis|procur|busca|fornecedor|concorren|pre[cç]o|mercado|not[ií]cia|novidade|internet|tend[eê]ncia)/,
  data: /(calcul|n[uú]mero|indicador|m[eé]dia|quant[oa]s?|horas|produtividade|proje[cç]|compar|planilha|percentual|soma|total)/,
  pixel: /(design|arte|imagem|post|campanha|logo|visual|identidade|criativ|banner|cor(es)?\b|layout|bonit)/
};

/* ---------- Tipos de sala da empresa ----------
   O nome do setor no painel decide a decoração. A primeira regra que bater vale; o resto vira escritório comum. */
const TIPOS_SALA = [
  ['financeiro', /financ|fiscal|cont[aá]b|tesour|cobran|faturam|custos/i, 'grafico'],
  ['marketing', /marketing|comunica|publicid|m[ií]dia|trade|marca/i, 'megafone'],
  ['comercial', /comerc|vend|neg[oó]c|cliente|represent/i, 'funil'],
  ['logistica', /log[ií]st|estoque|expedi|armaz|frota|transport|entreg|compra|suprim|recebim|almox/i, 'caminhao'],
  ['rh', /\brh\b|recursos humanos|pessoas|gente|\bdp\b|departamento pessoal|talent/i, 'pessoas'],
  ['operacoes', /opera|produ[cç]|f[aá]brica|manuten|qualidade|processo/i, 'engrenagem'],
  ['diretoria', /diretor|ger[eê]ncia|presid|s[oó]cio|administra|conselho/i, 'coroa'],
  ['tecnologia', /\bti\b|tecnolog|sistema|inform[aá]tica|dados|digital/i, 'chip'],
  ['atendimento', /atendim|\bsac\b|suporte|relacionam|p[oó]s.venda|ouvidoria/i, 'fone']
];
function tipoDeSala(nome) { const r = TIPOS_SALA.find(([, re]) => re.test(String(nome || ''))); return r ? r[0] : 'geral'; }
const iconeDaSala = (tipo) => (TIPOS_SALA.find(([k]) => k === tipo) || [0, 0, 'pasta'])[2];

const GRAU = Math.PI / 180;
const ESCALA_ROBO = 1.45;   // os robôs são um pouco maiores que a mobília (personagem em primeiro plano, como em desenho)

/* ---------- Materiais (guardados: o mesmo material serve a muitas peças) ----------
   Atenção: material guardado é compartilhado. Para mudar um só, faça .clone() antes. */
const MAT = new Map();
function guardado(chave, criar) { if (!MAT.has(chave)) MAT.set(chave, criar()); return MAT.get(chave); }
// Superfície comum: cor, aspereza (0 = espelho, 1 = fosco) e metal (0 a 1)
function padrao(cor, aspereza, metal, extra) {
  const a = aspereza == null ? 0.6 : aspereza, m = metal || 0;
  return guardado(`p:${cor}:${a}:${m}:${extra ? JSON.stringify(extra) : ''}`, () => new THREE.MeshStandardMaterial(Object.assign({ color: cor, roughness: a, metalness: m }, extra || {})));
}
// Casco brilhante dos robôs e dos móveis brancos (verniz por cima, como plástico de brinquedo bom)
function casco(cor, aspereza) {
  return guardado(`c:${cor}:${aspereza}`, () => new THREE.MeshPhysicalMaterial({ color: cor, roughness: aspereza == null ? 0.32 : aspereza, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12 }));
}
// Metal escovado (moldura das cápsulas, pés de móvel)
const metal = (cor, aspereza) => padrao(cor || 0xc9ced6, aspereza == null ? 0.32 : aspereza, 0.85);
// Luz: cor acima de 1 faz o brilho (bloom) aparecer em volta
function luz(cor, forca) {
  return guardado(`l:${cor}:${forca}`, () => { const m = new THREE.MeshBasicMaterial({ color: cor, fog: false }); m.color.multiplyScalar(forca == null ? 3 : forca); return m; });
}
// Vidro das salas: quase transparente, com reflexo
const vidro = (tom) => guardado('vidro:' + (tom || ''), () => new THREE.MeshPhysicalMaterial({ color: tom || 0xd8e6ee, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.11, envMapIntensity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
// Holograma: soma luz (fica bonito por cima de tudo), sem gravar profundidade
function holo(cor, opacidade, mapa) {
  return new THREE.MeshBasicMaterial({ color: cor || ESC.holo, map: mapa || null, transparent: true, opacity: opacidade == null ? 0.7 : opacidade, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
}

/* ---------- Peças básicas ---------- */
const GEO = {};
function geometrias() {
  const T = THREE;
  GEO.caixa = new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);            // base no y = 0
  GEO.cil = new T.CylinderGeometry(1, 1, 1, 28).translate(0, 0.5, 0);
  GEO.cil12 = new T.CylinderGeometry(1, 1, 1, 12).translate(0, 0.5, 0);
  GEO.cilX = new T.CylinderGeometry(1, 1, 1, 28).rotateZ(Math.PI / 2);    // deitado no eixo x, centrado (fone, rodinha)
  GEO.esfera = new T.SphereGeometry(1, 22, 14);
  GEO.esferaFina = new T.SphereGeometry(1, 40, 28);   // só para as cabeças dos robôs
  GEO.plano = new T.PlaneGeometry(1, 1);
  GEO.chao = new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  GEO.toro = new T.TorusGeometry(1, 0.04, 10, 72).rotateX(Math.PI / 2);   // anel deitado, tubo fino
  GEO.cone = new T.ConeGeometry(1, 1, 32).translate(0, 0.5, 0);
}
// Atalho: cria a peça, posiciona e escala (sempre as três escalas)
function peca(geo, material, x, y, z, sx, sy, sz, pai) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x || 0, y || 0, z || 0); m.scale.set(sx == null ? 1 : sx, sy == null ? 1 : sy, sz == null ? 1 : sz);
  m.castShadow = true; m.receiveShadow = true;
  if (pai) pai.add(m);
  return m;
}
/* Caixa de cantos arredondados (o acabamento que tira a cara de "maquete").
   Faz uma caixa com mais divisões perto das quinas e empurra cada ponto para a superfície arredondada. */
function caixaRedonda(w, h, d, r, s) {
  s = s || 2; r = Math.max(0.001, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
  const chave = ['cr', w, h, d, r, s].map((v) => (typeof v === 'number' ? v.toFixed(4) : v)).join(':');
  if (GEO[chave]) return GEO[chave];
  const N = 2 * s + 1, g = new THREE.BoxGeometry(1, 1, 1, N, N, N);
  const P = g.attributes.position, Nn = g.attributes.normal, v = new THREE.Vector3(), dentro = new THREE.Vector3();
  // cada coordenada da grade (0..N) vira: s passos na curva, um salto no meio reto, s passos na outra curva
  const mapa = (u, H) => { const k = Math.round((u + 0.5) * N); return k <= s ? -H + r * k / s : H - r + r * (k - s - 1) / s; };
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  for (let i = 0; i < P.count; i++) {
    v.set(mapa(P.getX(i), w / 2), mapa(P.getY(i), h / 2), mapa(P.getZ(i), d / 2));
    dentro.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
    v.sub(dentro); if (v.lengthSq() < 1e-12) v.set(0, 1, 0); v.normalize();
    Nn.setXYZ(i, v.x, v.y, v.z);
    P.setXYZ(i, dentro.x + v.x * r, dentro.y + v.y * r + h / 2, dentro.z + v.z * r);   // base no y = 0
  }
  P.needsUpdate = true; Nn.needsUpdate = true; g.computeBoundingSphere(); g.computeBoundingBox();
  GEO[chave] = g; return g;
}
// Atalho para caixa arredondada já posicionada (base no y dado)
const bloco = (w, h, d, r, material, x, y, z, pai) => peca(caixaRedonda(w, h, d, r), material, x, y, z, 1, 1, 1, pai);
// Perfil girado (corpo dos robôs, vasos, abajur): pontos [raio, altura]
function torneado(pontos, lados) {
  const chave = 'tor:' + JSON.stringify(pontos) + ':' + (lados || 40);
  if (!GEO[chave]) GEO[chave] = new THREE.LatheGeometry(pontos.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), lados || 28);
  return GEO[chave];
}
// Setor de anel (fatia de pizza oca) extrudado: piso das cápsulas, mesa em arco, degraus
function anelSetor(r0, r1, a0, a1, altura, curvas) {
  const chave = ['as', r0, r1, a0, a1, altura, curvas].map((v) => (typeof v === 'number' ? v.toFixed(4) : v)).join(':');
  if (GEO[chave]) return GEO[chave];
  const f = new THREE.Shape(), n = curvas || 48;
  // no plano da forma: x = sen(a)·r, y = -cos(a)·r; girando -90° no x, a forma deita no chão
  // (y da forma vira -z do mundo, então o ângulo a fica medido a partir do +z) e a espessura sobe
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; const p = [Math.sin(a) * r1, -Math.cos(a) * r1]; if (i) f.lineTo(p[0], p[1]); else f.moveTo(p[0], p[1]); }
  for (let i = n; i >= 0; i--) { const a = a0 + (a1 - a0) * i / n; f.lineTo(Math.sin(a) * r0, -Math.cos(a) * r0); }
  const g = new THREE.ExtrudeGeometry(f, { depth: altura, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  GEO[chave] = g; return g;
}
// Tubo seguindo pontos (filete de LED, cabos, arco das cápsulas)
function tuboPor(pontos, raio, fechado) {
  const curva = new THREE.CatmullRomCurve3(pontos.map(([x, y, z]) => new THREE.Vector3(x, y, z)), !!fechado, 'centripetal');
  return new THREE.TubeGeometry(curva, Math.max(16, pontos.length * 8), raio, 8, !!fechado);
}
// Sorteio que se repete igual (a mesma decoração toda vez que o escritório é montado)
function sorteio(semente) { let s = semente >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const suave = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const misturar = (a, b, t) => a + (b - a) * t;
const angDif = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
/* Junta várias geometrias (já posicionadas) numa só: menos desenhos por quadro, mesmo resultado.
   Todas viram "sem índice" e ganham uv zerado se não tiverem. */
function juntarGeometrias(lista) {
  const partes = lista.map((g) => (g.index ? g.toNonIndexed() : g));
  let total = 0; partes.forEach((g) => { total += g.attributes.position.count; });
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  let o = 0;
  partes.forEach((g) => {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array.subarray(0, n * 3), o * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array.subarray(0, n * 3), o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array.subarray(0, n * 2), o * 2);
    o += n;
  });
  const r = new THREE.BufferGeometry();
  r.setAttribute('position', new THREE.BufferAttribute(pos, 3)); r.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); r.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  r.computeBoundingSphere(); r.computeBoundingBox();
  return r;
}
/* Arco deitado (filete, corrimão, travessa) entre os ângulos a0 e a1, medidos a partir do +z indo para o +x
   (a mesma conta dos cilindros e do anelSetor). O toro nasce no plano XY começando no +x; deitado e girado,
   o começo cai no ângulo certo. */
function arcoDeitado(r, tubo, a0, a1, segs) {
  const chave = ['arco', r, tubo, a0, a1, segs].map((v) => (typeof v === 'number' ? v.toFixed(4) : v)).join(':');
  if (!GEO[chave]) GEO[chave] = new THREE.TorusGeometry(r, tubo, 6, segs || Math.max(16, Math.round((a1 - a0) * r * 4)), a1 - a0).rotateX(Math.PI / 2).rotateY(a1 - Math.PI / 2);
  return GEO[chave];
}
