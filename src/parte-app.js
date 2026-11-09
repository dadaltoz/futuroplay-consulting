<script>
'use strict';
/* Link da ferramenta no cartão da biblioteca */
(() => { const st = document.createElement('style'); st.textContent = `.bib-ferramenta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:10px}.bib-ferramenta .meta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}.bib-link-editar{display:flex;flex-direction:column;gap:6px;margin-top:12px}.bib-link-editar .rotulo{font-family:var(--mono,monospace);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3,#6b7280)}.bib-link-editar input{font:inherit;padding:9px 11px;border-radius:10px;border:1px solid var(--line);background:var(--surface-2);color:var(--ink);width:100%}`; document.head.appendChild(st); })();
/* Etiquetas de arquivo na anotação (mesmo visual da etiqueta de áudio) */
(() => { const st = document.createElement('style'); st.textContent = `
.arquivo-novo,.arquivo-nota{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:var(--surface-2);border:1px solid var(--line);border-radius:12px;padding:6px 8px 6px 12px;color:var(--accent-ink);max-width:100%}
.arquivo-nota{align-self:flex-start;margin-top:6px}
.arquivo-novo .arq-nome,.arquivo-nota .arq-nome{font-weight:600;color:var(--ink);min-width:0;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.arquivo-novo select{font:inherit;font-size:13px;padding:4px 6px;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:var(--ink)}`; document.head.appendChild(st); })();

/* =====================================================================
   Real Forte Lab
   Painel de trabalho do diagnóstico de processos.

   Três telas, um lugar para cada coisa, nenhuma janela em cima da outra:
   - Início: as horas devolvidas às equipes e as empresas.
   - Empresa: os setores, o PDF do diagnóstico e o questionário a distância.
   - Setor: o que eu vi (anotações) e os gargalos. É o único lugar dos
     gargalos. Cada gargalo abre no próprio cartão, com etapa, proposta,
     prompt para o Claude, PowerPoint e horas.

   Os dados ficam no armazenamento do próprio sistema (capacidade "db").
   Coleções: empresas, setores, diario (o que eu vi), gargalos,
   conversas (antigas, só para limpeza e cópia) e config/geral.
   Cópia de segurança: Ajustes > Baixar cópia de tudo.
   ===================================================================== */

/* ---------- 1. Constantes ---------- */
const SITUACOES = ['Aberto', 'Proposta pronta', 'Apresentado', 'Em execução', 'Resolvido'];
const CLASSE = { 'Aberto': 's-aberto', 'Proposta pronta': 's-proposta', 'Apresentado': 's-apresentado', 'Em execução': 's-execucao', 'Resolvido': 's-resolvido' };
const COLECOES = ['empresas', 'setores', 'diario', 'gargalos', 'conversas', 'materiais', 'biblioteca', 'sinais'];
const QUESTIONARIO_URL = 'https://claude.ai/artifact/SkdjbZ5wJURYiG8xGubEdS';

/* ---------- 2. Estado ---------- */
const S = {
  empresas: [], setores: [], diario: [], gargalos: [], conversas: [], materiais: [], biblioteca: [], sinais: [], config: {},
  recebidos: new Set(), carregado: false,
  modo: 'conectando',   // 'nuvem' = salvando no armazenamento; 'local' = nada fica salvo
  podeEditar: true, erroBanco: ''
};
// Estado da tela (não é salvo)
const UI = { aberto: '', editandoNota: '', sugestoes: null, gerandoPPT: '', ocupado: false, pendente: false, animar: true, festa: null, verArquivadas: false, diagAberto: '', rascunho: {}, anexosNovos: [], lendoFoto: false, guardando: false, iaCtx: {}, chat: [], iaPensando: false, bibBusca: '', bibTipo: '', bibAberto: '', setorAtual: '' };
let db = null, ia = null, downloads = null, assets = null;
const urlsSessao = {};   // endereço das fotos e áudios enviados nesta visita (os antigos usam /_blob/<id>)
let sugestoesIA = [], controleIA = null, apresentacaoAtual = null;

/* ---------- 3. Utilidades ---------- */
const $ = (seletor, raiz) => (raiz || document).querySelector(seletor);
function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function novoId(prefixo) { return prefixo + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function hojeISO() { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
const agoraISO = () => new Date().toISOString();
function dataBR(iso) { if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso || ''; const [a, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${a}`; }
function plural(n, um, varios) { return `${n} ${n === 1 ? um : varios}`; }
function esperar(ms) { return new Promise((r) => setTimeout(r, ms)); }
const normal = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
// Lê número digitado do jeito brasileiro ("1,5" ou "1.234,5"); vazio vira null
function numero(v) {
  let t = String(v == null ? '' : v).trim(); if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t); return Number.isFinite(n) ? n : null;
}
const fmtHoras = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
// Horas por mês que deixaram de ser gastas no gargalo: antes − depois (os dois combinados com o setor)
function horasLivres(g) {
  const a = numero(g.horasAntes), d = numero(g.horasDepois);
  if (a == null || d == null || a < d) return null;
  return a - d;
}
const somaHoras = (lista) => lista.reduce((t, g) => t + (horasLivres(g) || 0), 0);
function relativo(iso) {
  const d = new Date(iso); if (!iso || isNaN(d)) return '';
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  const dias = Math.floor(s / 86400);
  if (dias === 1) return 'ontem';
  if (dias < 30) return `há ${dias} dias`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
}

const ICONES = {
  sinal: '<path d="M12 13v8"/><circle cx="12" cy="10" r="2"/><path d="M8.5 13.5a5 5 0 0 1 0-7M15.5 6.5a5 5 0 0 1 0 7M5.6 16.4a9 9 0 0 1 0-12.8M18.4 3.6a9 9 0 0 1 0 12.8"/>',
  pessoa: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  lapis: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>',
  lixo: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
  pdf: '<path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6"/>',
  copiar: '<path d="M9 9h11v11H9zM5 15H4V4h11v1"/>',
  ia: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  prompt: '<path d="M4 5h16v11H9l-5 4zM8 9l2 2-2 2M12 13h4"/>',
  seta: '<path d="M9 5l7 7-7 7"/>',
  voltar: '<path d="M15 5l-7 7 7 7"/>',
  baixar: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  subir: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  alerta: '<path d="M12 4l9 16H3zM12 10v4M12 17.2v.3"/>',
  ok: '<path d="M5 12.5l4.2 4.2L19 7"/>',
  parar: '<path d="M7 7h10v10H7z"/>',
  info: '<path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.3"/>',
  fora: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
  slides: '<path d="M3 4h18v12H3zM8 20h8M12 16v4M7 8h6M7 11h10"/>',
  busca: '<path d="M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM16 16l5 5"/>',
  casa: '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>',
  ajustes: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/>',
  mic: '<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"/>',
  relogio: '<path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2"/>',
  quadro: '<path d="M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v13h-4z"/>',
  grade: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
  documento: '<path d="M7 3h7l5 5v13H7zM14 3v5h5"/>',
  celular: '<path d="M8 2h8a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM11 18h2"/>',
  desce: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  arquivo: '<path d="M4 5h16v4H4zM6 9v10h12V9M10 13h4"/>',
  clipe: '<path d="M20 11.5l-8.2 8.2a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"/>',
  predio: '<path d="M4 20V6l7-3v17M11 20V9l9 3v8M2 20h20M7 9h1M7 13h1M15 14h1"/>'
};
function icone(nome) { return `<span class="ic"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[nome] || ''}</svg></span>`; }
/* Logo da Real Forte, num lugar só. claro = azul trocado por branco (para fundo azul-marinho);
   escuro = a original (para fundo claro). Usada na barra lateral, na barra do celular e no PowerPoint. */
const LOGO = { claro: 'data:image/png;base64,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', escuro: 'data:image/png;base64,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', proporcao: 300 / 82 };
document.documentElement.style.setProperty('--logo-claro', `url(${LOGO.claro})`);
const TORRE = '<svg class="torre" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 2.5h2.6v2.3h2.8V2.5h3.2v2.3h2.8V2.5H19v5l-1.7 2.1H6.7L5 7.5z"/><path d="M8.2 10.8h7.6v5.6H8.2z"/><path d="M7 17.4h10l1.2 1.6H5.8z"/><path d="M4.6 19.9h14.8v1.6H4.6z"/></svg>';

// Anel de progresso (porcentagem resolvida)
function anel(pct, tam, traco) {
  tam = tam || 18; traco = traco || 3;
  const r = (tam - traco) / 2, c = 2 * Math.PI * r, meio = tam / 2;
  const valor = pct > 0 ? `<circle class="valor" cx="${meio}" cy="${meio}" r="${r}" fill="none" stroke-width="${traco}" stroke-linecap="round" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - Math.min(pct, 100) / 100)).toFixed(2)}" transform="rotate(-90 ${meio} ${meio})"/>` : '';
  return `<svg class="anel" width="${tam}" height="${tam}" viewBox="0 0 ${tam} ${tam}" aria-hidden="true"><circle class="trilho" cx="${meio}" cy="${meio}" r="${r}" fill="none" stroke-width="${traco}"/>${valor}</svg>`;
}
const anelRotulo = (pct, tam) => `<span class="anel-rotulo" title="${pct}% resolvido">${anel(pct, tam, 4)}<span>${pct}%</span></span>`;

let temporizadorToast = null, elToast = null;
const TEM_POPOVER = typeof HTMLElement !== 'undefined' && HTMLElement.prototype.hasOwnProperty('popover');
// O aviso mora dentro do painel aberto de cima (senão o painel o cobre e o botão Desfazer não responde)
function lugarDoToast() { return ['dlg'].map((id) => document.getElementById(id)).find((d) => d && d.open) || document.body; }
function mostrarToast(el) {
  const lugar = lugarDoToast();
  if (el.parentNode !== lugar) lugar.appendChild(el);
  if (TEM_POPOVER) { try { if (el.matches(':popover-open')) el.hidePopover(); el.showPopover(); } catch (_) { /* segue como aviso comum */ } }
  el.hidden = false;
}
function esconderToast() {
  const el = elToast; if (!el) return;
  el.hidden = true;
  if (TEM_POPOVER) { try { el.hidePopover(); } catch (_) { /* já estava fechado */ } }
}
// Aviso rápido no rodapé; "acao" opcional vira um botão (ex.: Desfazer)
function toast(mensagem, tipo, acao) {
  if (!elToast) { elToast = document.createElement('div'); elToast.id = 'toast'; elToast.setAttribute('role', 'status'); if (TEM_POPOVER) elToast.popover = 'manual'; }
  const el = elToast;
  el.className = 'toast' + (tipo === 'erro' ? ' erro' : '');
  el.innerHTML = `<span>${esc(mensagem)}</span>${acao ? `<button type="button" id="toast-acao">${esc(acao.rotulo)}</button>` : ''}`;
  mostrarToast(el);
  if (acao) el.querySelector('#toast-acao').onclick = () => { esconderToast(); acao.fn(); };
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(esconderToast, acao ? 6000 : 3800);
}
// Quando um painel fecha com o aviso dentro, o aviso passa para o que ficou aberto
['dlg'].forEach((id) => document.getElementById(id).addEventListener('close', () => {
  const el = elToast;
  if (el && !el.hidden && el.parentNode && el.parentNode.id === id) setTimeout(() => mostrarToast(el), 0);
}));

/* ---------- 4. Consultas ---------- */
const empresaPorId = (id) => S.empresas.find((e) => e.id === id);
const setorPorId = (id) => S.setores.find((s) => s.id === id);
const gargaloPorId = (id) => S.gargalos.find((g) => g.id === id);
const setoresDa = (empresaId) => S.setores.filter((s) => s.empresaId === empresaId).sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
// Gargalo atrapalha o setor. Oportunidade é o "poderia ter" que o setor pede: não atrapalha, mas dá para entregar.
// Os dois ficam na mesma coleção; o campo "tipo" diz qual é (sem "tipo" = gargalo).
const ehOport = (g) => g.tipo === 'oportunidade';
const ordemItens = (a, b) => SITUACOES.indexOf(situacaoDe(a)) - SITUACOES.indexOf(situacaoDe(b)) || String(a.titulo).localeCompare(String(b.titulo));
const itensDa = (empresaId) => S.gargalos.filter((g) => g.empresaId === empresaId);
const itensDo = (setorId) => S.gargalos.filter((g) => g.setorId === setorId).sort(ordemItens);
const oportunidadesDo = (setorId) => itensDo(setorId).filter(ehOport);
const gargalosDa = (empresaId) => itensDa(empresaId).filter((g) => !ehOport(g));
const gargalosDo = (setorId) => itensDo(setorId).filter((g) => !ehOport(g));
const notasDo = (setorId) => S.diario.filter((n) => n.setorId === setorId).sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
const empresasOrdenadas = () => [...S.empresas].sort((a, b) => (a.exemplo ? 1 : 0) - (b.exemplo ? 1 : 0) || String(a.nome).localeCompare(String(b.nome)));
const empresasAtivas = () => empresasOrdenadas().filter((e) => e.arquivada !== 'sim');
const situacaoDe = (g) => SITUACOES.includes(g.situacao) ? g.situacao : 'Aberto';
const temTexto = (v) => !!String(v || '').trim();
const temProposta = (g) => temTexto(g.proposta);
const nomeFrente = () => S.config.frente || 'Real Forte Lab';
const nomeConsultor = () => S.config.consultor || '';
const primeiroNome = () => String(S.config.consultor || '').trim().split(/\s+/)[0] || '';
function saudacao() { const h = new Date().getHours(); return h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; }
function contagem(lista) { const c = {}; SITUACOES.forEach((s) => { c[s] = 0; }); lista.forEach((g) => { c[situacaoDe(g)]++; }); return c; }
const pctResolvido = (lista) => lista.length ? Math.round(contagem(lista)['Resolvido'] / lista.length * 100) : 0;
const quandoMexeu = (g) => (Array.isArray(g.movimentos) && g.movimentos[0] && g.movimentos[0].em) || g.atualizadoEm || '';
function ultimoMovimento(lista) { return lista.map(quandoMexeu).filter(Boolean).sort().pop() || ''; }


/* ---------- 5. Armazenamento ---------- */
function usar(nome) {
  try { return Promise.resolve(window.claude.use(nome)).catch(() => null); }
  catch (_) { return Promise.resolve(null); }
}

// Barra lateral recolhida: lembrada só neste navegador (se o navegador não deixar guardar, abre normal)
function aplicarLadoRecolhido() { document.getElementById('app').classList.toggle('lado-recolhido', !!UI.ladoRecolhido); }
try { UI.ladoRecolhido = localStorage.getItem('rf-lado-recolhido') === 'sim'; } catch (_) { UI.ladoRecolhido = false; }
async function iniciar() {
  aplicarLadoRecolhido();
  render();
  if (!(window.claude && typeof window.claude.use === 'function')) { entrarModoLocal(); return; }
  usar('sample').then((s) => { ia = s; agendarRender(); });
  usar('downloads').then((d) => { downloads = d; agendarRender(); });
  usar('assets').then((a) => { assets = a; agendarRender(); });
  usar('user').then(async (u) => {
    if (!u) return;
    try { if ((await u.can('data.write')) === false) { S.podeEditar = false; agendarRender(); } } catch (_) { /* sem resposta: a gravação decide */ }
  });
  db = await usar('db');
  if (!db) { entrarModoLocal(); return; }
  S.modo = 'nuvem';
  COLECOES.forEach((colecao) => {
    db.collection(colecao).onSnapshot((snap) => {
      S[colecao] = snap.docs.map((d) => Object.assign({}, d.data(), { id: d.id }));
      S.recebidos.add(colecao); conferirCarga(); agendarRender();
    }, erroDoBanco);
  });
  db.doc('config/geral').onSnapshot((snap) => {
    S.config = snap.exists ? Object.assign({}, snap.data()) : {};
    S.recebidos.add('config'); conferirCarga(); agendarRender();
  }, erroDoBanco);
  setTimeout(() => { if (!S.carregado) { S.carregado = true; agendarRender(); } }, 12000);
}
function entrarModoLocal() { S.modo = 'local'; S.carregado = true; agendarRender(); }
function conferirCarga() { if (!S.carregado && S.recebidos.size >= COLECOES.length + 1) S.carregado = true; }
function erroDoBanco(erro) { S.erroBanco = (erro && erro.code) || 'desconhecido'; agendarRender(); }
function corpoLimpo(dados) { const c = JSON.parse(JSON.stringify(dados)); delete c.id; return c; }

function traduzirErro(e) {
  const codigo = e && e.code;
  if (codigo === 'invalid_argument') { S.podeEditar = false; agendarRender(); return new Error('Não deu para salvar. Seu acesso a este sistema parece ser só de leitura.'); }
  if (codigo === 'quota_exceeded') return new Error('O armazenamento encheu. Baixe uma cópia em Ajustes e apague empresas antigas.');
  if (codigo === 'resource_exhausted') return new Error('Muitas gravações seguidas. Espere alguns segundos e tente de novo.');
  return new Error('Não deu para salvar agora. Tente de novo em instantes.');
}

async function gravar(colecao, id, dados) {
  const corpo = corpoLimpo(dados);
  if (S.modo !== 'nuvem') {
    if (colecao === 'config') S.config = corpo;
    else { const lista = S[colecao]; const i = lista.findIndex((x) => x.id === id); const item = Object.assign({}, corpo, { id }); if (i >= 0) lista[i] = item; else lista.push(item); }
    agendarRender(); return;
  }
  // Atualiza a lista local na hora: a próxima gravação já parte do valor novo, sem esperar o armazenamento responder
  if (colecao === 'config') S.config = corpo;
  else { const lista = S[colecao]; const i = lista.findIndex((x) => x.id === id); const item = Object.assign({}, corpo, { id }); if (i >= 0) lista[i] = item; else lista.push(item); }
  const ref = colecao === 'config' ? db.doc('config/geral') : db.collection(colecao).doc(id);
  try { await ref.set(corpo); }
  catch (e) {
    if (e && e.code === 'unavailable') { await esperar(500 + Math.random() * 700); try { await ref.set(corpo); return; } catch (e2) { throw traduzirErro(e2); } }
    throw traduzirErro(e);
  }
}
async function apagarRegistro(colecao, id) {
  if (S.modo !== 'nuvem') { S[colecao] = S[colecao].filter((x) => x.id !== id); agendarRender(); return; }
  try { await db.collection(colecao).doc(id).delete(); } catch (e) { throw traduzirErro(e); }
}

// Salva mudanças num gargalo e, se houver texto, registra no histórico dele
function salvarGargalo(g, mudancas, textoMovimento) {
  const atual = gargaloPorId(g.id) || g;
  const agora = agoraISO();
  const novo = Object.assign({}, atual, mudancas, { atualizadoEm: agora });
  if (textoMovimento) novo.movimentos = [{ em: agora, texto: textoMovimento }].concat(Array.isArray(atual.movimentos) ? atual.movimentos : []).slice(0, 15);
  return gravar('gargalos', g.id, novo);
}
// Muda a situação de um gargalo, com opção de desfazer no aviso
async function mudarSituacao(id, nova, opcoes) {
  opcoes = opcoes || {};
  const g = gargaloPorId(id); if (!g) return false;
  const antiga = situacaoDe(g);
  if (antiga === nova) return false;
  const anterior = JSON.parse(JSON.stringify(g));
  try {
    await salvarGargalo(g, { situacao: nova }, `Passou de ${antiga} para ${nova}`);
    toast(opcoes.mensagem || `“${g.titulo}” foi para ${nova}.`, '', { rotulo: 'Desfazer', fn: () => gravar('gargalos', anterior.id, anterior).catch((x) => toast(x.message, 'erro')) });
    return true;
  } catch (x) { toast(x.message, 'erro'); return false; }
}

/* ---------- 6. Navegação ---------- */
function rotaAtual() {
  const h = decodeURIComponent((location.hash || '').slice(1));
  if (h === 'passeio' || h === 'passeio-empresas') return { v: 'passeio', privado: h === 'passeio' };   // passeio pela cidade (só a Real Forte, ou com as empresas)
  if (h.startsWith('ap-')) return { v: 'apresentar', id: h.slice(3) };
  if (h.startsWith('ck-')) return { v: 'checkup', id: h.slice(3) };
  if (h.startsWith('q-')) return { v: 'questionario', id: h.slice(2) };
  if (h.startsWith('e-')) return { v: 'empresa', id: h.slice(2) };
  if (h.startsWith('sv-')) return { v: 'setor', id: h.slice(3), aba: 'vi' };
  if (h.startsWith('sg-')) return { v: 'setor', id: h.slice(3), aba: 'gargalos' };
  if (h.startsWith('so-')) return { v: 'setor', id: h.slice(3), aba: 'oport' };
  if (h.startsWith('s-')) return { v: 'setor', id: h.slice(2), aba: 'diag' };
  if (h === 'ia-materiais') return { v: 'ia', aba: 'materiais' };
  if (h.startsWith('ia-g-')) return { v: 'ia', gargalo: h.slice(5) };
  if (h.startsWith('ia-s-')) return { v: 'ia', setor: h.slice(5) };
  if (h === 'ia') return { v: 'ia' };
  if (h === 'biblioteca') return { v: 'biblioteca' };
  if (h === 'sinais') return { v: 'sinais' };
  if (h === 'ajustes') return { v: 'ajustes' };
  return { v: 'inicio' };
}
// Empresa da tela atual (para marcar na barra lateral)
function empresaDaRota(r) {
  if (['empresa', 'checkup', 'questionario', 'apresentar'].includes(r.v)) return r.id;
  if (r.v === 'setor') return (setorPorId(r.id) || {}).empresaId || '';
  return '';
}
window.addEventListener('hashchange', () => {
  if (dlg.open) dlg.close();
  if (rotaAtual().v !== 'ia') pararVoz();
  $('#app').classList.remove('menu-aberto');
  const r = rotaAtual();
  UI.aberto = ''; UI.editandoNota = ''; UI.animar = true;
  // Trocar de aba dentro do mesmo setor não perde a foto ou o áudio que ainda não foi guardado
  if (r.v !== 'setor' || r.id !== UI.setorAtual) { UI.anexosNovos = []; UI.sugestoes = null; }
  UI.setorAtual = r.v === 'setor' ? r.id : '';
  UI.iaRota = '';
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  trocarDeTela(r, () => { render(true); window.scrollTo(0, 0); });
});
/* Transição entre telas
   - trocar de aba na mesma empresa ou no mesmo setor: a tela desliza de leve;
   - ir para outra tela (pelo menu, por um botão ou pelo comando de voz): a tela some com desfoque e a nova sobe;
   - entrar numa empresa pela ilha do campo: a página da empresa abre num círculo que nasce da ilha.
   Usa as transições do próprio navegador; onde não houver, a tela nova só aparece suave. */
const familiaDaRota = (r) => r.v === 'setor' ? 's:' + r.id : ['empresa', 'checkup', 'questionario'].includes(r.v) ? 'e:' + r.id : r.v === 'ia' ? 'ia' : r.v;
function trocarDeTela(r, fazer) {
  const antes = UI.rotaAnterior || { v: '' }; UI.rotaAnterior = r;
  const reduzido = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const origem = UI.origemTransicao && performance.now() - UI.origemTransicao.t < 2500 ? UI.origemTransicao : null; UI.origemTransicao = null;
  const tipo = origem ? 'circulo' : familiaDaRota(antes) === familiaDaRota(r) ? 'aba' : 'pagina';
  const raiz = document.documentElement;
  if (reduzido || ['apresentar', 'passeio'].includes(r.v) || ['apresentar', 'passeio'].includes(antes.v)) { fazer(); return; }
  if (!document.startViewTransition) { fazer(); const m = $('#principal .miolo'); if (m) { m.classList.add('entra-' + tipo); } return; }
  if (origem) { raiz.style.setProperty('--vt-x', origem.x + 'px'); raiz.style.setProperty('--vt-y', origem.y + 'px'); }
  raiz.classList.add('vt-' + tipo);
  try {
    const tr = document.startViewTransition(() => fazer());
    tr.finished.finally(() => raiz.classList.remove('vt-aba', 'vt-pagina', 'vt-circulo'));
  } catch (x) { raiz.classList.remove('vt-' + tipo); fazer(); }
}
let renderAgendado = false;
function agendarRender() {
  if (renderAgendado) return;
  renderAgendado = true;
  (window.requestAnimationFrame || setTimeout)(() => { renderAgendado = false; render(); });
}
// Enquanto você digita num campo da tela, ela não é redesenhada (para não perder o que está escrito).
// Redesenha quando você sai do campo.
function digitando() {
  const a = document.activeElement;
  return !!(a && $('#principal').contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName));
}
document.addEventListener('focusout', () => { setTimeout(() => { if (UI.pendente && !digitando() && !UI.ocupado) agendarRender(); }, 0); });

/* ---------- 7. Telas ---------- */
// Vindo de um gargalo ou setor, a RF Intelligence já abre com esse contexto (uma vez por endereço,
// e só depois que os dados chegaram, para funcionar também ao abrir o painel direto nesse endereço)
function contextoDaRota(r) {
  if (r.v !== 'ia' || UI.iaRota === location.hash) return;
  const g = r.gargalo && gargaloPorId(r.gargalo); const s = r.setor && setorPorId(r.setor);
  if (g) UI.iaCtx = { empresaId: g.empresaId, setorId: g.setorId, gargaloId: g.id };
  else if (s) UI.iaCtx = { empresaId: s.empresaId, setorId: s.id, gargaloId: '' };
  else if (r.gargalo || r.setor) return;
  UI.iaRota = location.hash;
}
function render(forcar) {
  const rota = rotaAtual();
  contextoDaRota(rota);
  document.body.classList.toggle('so-leitura', !S.podeEditar);
  document.body.classList.toggle('apresentando', (rota.v === 'apresentar' || rota.v === 'passeio') && S.carregado && campoDisponivel());
  renderLado(rota);
  if (!forcar && S.carregado && (UI.ocupado || digitando())) { UI.pendente = true; return; }
  UI.pendente = false;
  let html;
  if (!S.carregado) html = telaCarregando();
  else if (rota.v === 'empresa') html = telaEmpresa(rota.id);
  else if (rota.v === 'checkup') html = telaCheckup(rota.id);
  else if (rota.v === 'questionario') html = telaQuestionario(rota.id);
  else if (rota.v === 'setor') html = telaSetor(rota.id, rota.aba);
  else if (rota.v === 'ia') html = telaIA(rota);
  else if (rota.v === 'apresentar') html = telaApresentacao(rota.id);
  else if (rota.v === 'passeio') html = telaPasseio(rota.privado);
  else if (rota.v === 'biblioteca') html = telaBiblioteca();
  else if (rota.v === 'sinais') html = telaSinais();
  else if (rota.v === 'ajustes') html = telaAjustes();
  else html = telaInicio();
  $('#principal').innerHTML = `<div class="miolo">${avisos()}${html}</div>`;
  document.querySelectorAll('#principal textarea[data-crescer]').forEach(crescer);
  const lugarCampo = document.getElementById('campo-lugar');
  if (lugarCampo) montarCampo(lugarCampo); else pararCampo();
  const lugarGalaxia = document.getElementById('galaxia-lugar');
  if (lugarGalaxia) { const todos = itensBiblioteca(); montarGalaxia(lugarGalaxia, todos, listaDaBiblioteca(todos)); } else pararGalaxia();
  if (CMD.botao) CMD.botao.hidden = rota.v === 'apresentar' || rota.v === 'passeio';
  iniciarCanos();
  if (S.carregado && UI.animar) { UI.animar = false; animarNumeros(); }
  if (UI.festa) { const f = UI.festa; UI.festa = null; soltarFesta(f.id, f.texto); }
}

// Os números grandes sobem de zero quando a tela abre
function animarNumeros() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.querySelectorAll('[data-contar]').forEach((el) => {
    const alvo = Number(el.dataset.contar); if (!alvo) return;
    const inicio = performance.now(), duracao = 900;
    const passo = (agora) => {
      const p = Math.min(1, (agora - inicio) / duracao), suave = 1 - Math.pow(1 - p, 3);
      el.textContent = fmtHoras(alvo * suave);
      if (p < 1) requestAnimationFrame(passo); else el.textContent = fmtHoras(alvo);
    };
    requestAnimationFrame(passo);
  });
}
// Confete e o número de horas em cima do cartão do gargalo resolvido
function soltarFesta(id, texto) {
  const card = document.getElementById('g-' + id); if (!card) return;
  const cores = ['var(--accent)', 'var(--accent-2)', 'var(--st-resolvido)', 'var(--st-apresentado)', 'var(--st-execucao)'];
  const pecas = Array.from({ length: 26 }, (_, i) => `<i style="left:${(i * 37) % 100}%;background:${cores[i % cores.length]};animation-delay:${(i % 7) * 70}ms"></i>`).join('');
  card.insertAdjacentHTML('beforeend', `<div class="festa" aria-hidden="true">${pecas}<b>${esc(texto)}</b></div>`);
  setTimeout(() => { const f = card.querySelector('.festa'); if (f) f.remove(); }, 2600);
}
// Campo de texto que cresce junto com o que está escrito
function crescer(area) { area.style.height = 'auto'; area.style.height = Math.max(area.scrollHeight + 2, 42) + 'px'; }

function renderLado(rota) {
  const ativas = empresasAtivas();
  const arquivadas = empresasOrdenadas().filter((e) => e.arquivada === 'sim');
  const atual = empresaDaRota(rota);
  const item = (e) => { const n = checkupDa(e.id).nota; return `<a class="lado-link ${atual === e.id ? 'ativo' : ''}" href="#e-${esc(e.id)}" ${atual === e.id ? 'aria-current="page"' : ''}>${anel(n == null ? 0 : n, 18, 3)}<span class="nome">${esc(e.nome)}</span>${n != null ? `<span class="lado-nota">${n}</span>` : ''}</a>`; };
  const link = (v, href, ic, nome) => `<a class="lado-link ${rota.v === v ? 'ativo' : ''}" href="${href}" title="${nome}">${icone(ic)}<span class="nome">${nome}</span></a>`;
  const nome = nomeConsultor();
  $('#lado').innerHTML = `
    <div class="lado-topo"><a class="marca" href="#inicio" aria-label="Real Forte Consultoria, início"><span class="logo" role="img" aria-label="Real Forte Consultoria"></span><span class="marca-sub">${esc(nomeFrente().replace(/^Real Forte\s*/i, '') || nomeFrente())}</span></a>
      <button class="lado-recolher" data-acao="recolherLado" aria-label="${UI.ladoRecolhido ? 'Abrir a barra lateral' : 'Recolher a barra lateral'}" title="${UI.ladoRecolhido ? 'Abrir a barra' : 'Recolher a barra'}"><span class="ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${UI.ladoRecolhido ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'}"/></svg></span></button></div>
    <nav class="lado-sec">${link('inicio', '#inicio', 'casa', 'Início')}</nav>
    <nav class="lado-sec" aria-label="Empresas">
      <div class="lado-titulo"><span>Empresas</span><button class="so-editor" data-acao="novaEmpresa" aria-label="Nova empresa" title="Nova empresa">${icone('mais')}</button></div>
      ${ativas.map(item).join('') || '<p class="lado-vazio">Nenhuma empresa ainda.</p>'}
      ${arquivadas.length ? `<button class="lado-link" data-acao="verArquivadas">${icone('arquivo')}<span class="nome">Arquivadas (${arquivadas.length})</span></button>${UI.verArquivadas ? arquivadas.map(item).join('') : ''}` : ''}
    </nav>
    <nav class="lado-sec" aria-label="Real Forte">
      <div class="lado-titulo"><span>Real Forte</span></div>
      ${link('ia', '#ia', 'ia', 'RF Intelligence')}
      ${link('biblioteca', '#biblioteca', 'documento', 'Biblioteca de soluções')}
      ${link('sinais', '#sinais', 'sinal', 'RF Sinais').replace('</span></a>', `</span>${sinaisNovos() ? `<span class="lado-badge" aria-label="${plural(sinaisNovos(), 'sinal novo', 'sinais novos')}">${sinaisNovos()}</span>` : ''}</a>`)}
    </nav>
    <div class="lado-rodape">
      ${link('ajustes', '#ajustes', 'ajustes', 'Ajustes')}
      ${nome ? `<div class="lado-usuario"><span class="avatar">${esc(nome.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase())}</span><span>${esc(nome)}</span></div>` : ''}
    </div>`;
}
function avisos() {
  const lista = [];
  if (S.modo === 'local') lista.push(`<div class="aviso">${icone('alerta')}<div><b>Nada do que você fizer aqui fica salvo.</b> Esta visualização não tem acesso ao armazenamento. Abra o sistema pelo Claude, com a sua conta.</div></div>`);
  if (S.erroBanco) lista.push(`<div class="aviso">${icone('alerta')}<div><b>O armazenamento parou de responder.</b> Recarregue a página. Se continuar, baixe uma cópia em Ajustes.</div></div>`);
  if (!S.podeEditar) lista.push(`<div class="aviso info">${icone('info')}<div><b>Modo leitura.</b> Dá para navegar, copiar os prompts e baixar o PDF. Para editar, peça acesso de edição a quem compartilhou.</div></div>`);
  return lista.join('');
}
function telaCarregando() {
  return `<header class="cab"><div><p class="olho">Real Forte Consultoria</p><h1>Abrindo o painel…</h1></div></header><div class="esqueleto" style="height:200px"></div><div class="grade-empresas">${'<div class="esqueleto"></div>'.repeat(3)}</div>`;
}

const nomeEtapa = (g, s) => ehOport(g) && s === 'Resolvido' ? 'Entregue' : s;
const pill = (g) => `<span class="pill ${CLASSE[situacaoDe(g)]}">${esc(nomeEtapa(g, situacaoDe(g)))}</span>`;
// Barra com a quantidade de gargalos em cada etapa
function barraEtapas(c, total, extra) {
  if (!total) return `<div class="barra-etapas estatica ${extra || ''}"></div>`;
  return `<div class="barra-etapas estatica ${extra || ''}" role="img" aria-label="Gargalos por etapa">${SITUACOES.filter((s) => c[s]).map((s) => `<span class="seg ${CLASSE[s]}" style="flex:${c[s]}" title="${esc(s)}: ${c[s]}"></span>`).join('')}</div>`;
}
const legenda = (c) => `<div class="legenda-etapas">${SITUACOES.map((s) => `<span class="item ${CLASSE[s]}"><i></i>${esc(s)} <b>${c[s]}</b></span>`).join('')}</div>`;

/* ---------- Check-up Empresarial: diagnóstico padronizado por setor ----------
   Cada tipo de setor tem 10 critérios de boa prática, cada um ligado a um destes quatro eixos:
   Processo, Informação e sistemas, Pessoas, Controle e indicadores.
   O consultor responde Sim (vale 100), Em parte (vale 50) ou Não (vale 0) e pode anotar a evidência.
   Nota do setor = média das respostas (0 a 100). Nota da empresa = média das notas dos setores avaliados.
   Situação do setor: algum "Não" = Crítico; algum "Em parte" = Atenção; todos "Sim" = Saudável.
   Os critérios são o padrão da Real Forte: os sócios revisam e ajustam aqui. */
const EIXOS = { P: 'Processo', I: 'Informação e sistemas', G: 'Pessoas', C: 'Controle e indicadores' };
const VALOR_RESPOSTA = { sim: 100, parte: 50, nao: 0 };
// Cada critério: [eixo, texto]. A ordem não muda (as respostas já guardadas usam a posição).
const DIAGNOSTICOS = {
  comercial: { nome: 'Comercial e vendas', criterios: [
    ['P', 'Os pedidos chegam por um canal só, sem misturar WhatsApp, telefone e e-mail?'],
    ['I', 'O pedido entra no sistema sem ser digitado duas vezes?'],
    ['C', 'Preço e desconto seguem uma tabela que todos usam?'],
    ['C', 'O pedido é conferido antes de ir para o faturamento?'],
    ['I', 'Dá para saber quanto cada vendedor vendeu sem montar planilha na mão?'],
    ['G', 'A carteira de clientes está registrada, e não só na cabeça do vendedor?'],
    ['C', 'A meta de cada vendedor é acompanhada durante o mês, e não só no fechamento?'],
    ['I', 'O vendedor sabe o estoque disponível na hora de vender?'],
    ['P', 'O caminho da venda, do contato ao pedido, é o mesmo para todos?'],
    ['G', 'Vendedor novo aprende com um roteiro, e não só acompanhando alguém?']] },
  financeiro: { nome: 'Financeiro', criterios: [
    ['P', 'A conciliação bancária é feita sem copiar linha por linha?'],
    ['I', 'Contas a pagar e a receber ficam num lugar só e atualizado?'],
    ['P', 'O fechamento do mês sai sem retrabalho?'],
    ['C', 'Os relatórios que o financeiro monta são usados por alguém?'],
    ['C', 'Os pagamentos têm aprovação clara de quem pode liberar?'],
    ['I', 'A inadimplência é acompanhada por uma lista que se atualiza sozinha?'],
    ['C', 'O fluxo de caixa dos próximos 30 dias é conhecido?'],
    ['G', 'Mais de uma pessoa sabe fazer as rotinas do financeiro?'],
    ['I', 'As despesas são lançadas com categoria e centro de custo?'],
    ['P', 'A cobrança dos atrasados segue uma rotina com datas definidas?']] },
  faturamento: { nome: 'Faturamento e fiscal', criterios: [
    ['I', 'A nota é emitida sem redigitar o pedido?'],
    ['C', 'Os dados fiscais dos produtos (NCM, tributação) estão conferidos?'],
    ['P', 'O faturamento sai no mesmo dia em que o pedido é liberado?'],
    ['C', 'Os erros de nota (cancelamento, carta de correção) são acompanhados?'],
    ['G', 'Mais de uma pessoa sabe faturar?'],
    ['P', 'Boleto e cobrança saem junto com a nota, sem passo manual?'],
    ['I', 'Quando um pedido trava, o faturamento sabe o motivo?'],
    ['C', 'As obrigações fiscais do mês seguem um calendário?'],
    ['P', 'Pedido e nota são conferidos antes de emitir?'],
    ['P', 'As devoluções geram a nota de entrada sem atraso?']] },
  compras: { nome: 'Compras', criterios: [
    ['P', 'As compras partem de uma necessidade registrada, como estoque mínimo ou pedido?'],
    ['I', 'As cotações são comparadas num lugar só?'],
    ['C', 'O pedido de compra é aprovado por quem pode?'],
    ['C', 'O recebimento confere o que chegou com o que foi pedido?'],
    ['C', 'Os prazos dos fornecedores são acompanhados?'],
    ['I', 'O histórico de preço de cada item é fácil de consultar?'],
    ['P', 'Os itens principais têm mais de um fornecedor?'],
    ['G', 'Compras conversa com o comercial sobre o que vai ser vendido?'],
    ['P', 'Compra de urgência é exceção, e não a regra?'],
    ['G', 'Mais de uma pessoa sabe comprar os itens principais?']] },
  logistica: { nome: 'Logística, estoque e entregas', criterios: [
    ['C', 'O estoque do sistema bate com o estoque físico?'],
    ['P', 'Os produtos têm endereço definido e estão no lugar certo?'],
    ['P', 'A carga é conferida antes de sair, sem depender de papel?'],
    ['G', 'A rota das entregas segue um método, e não só a experiência de uma pessoa?'],
    ['I', 'Devoluções e avarias são registradas com o motivo?'],
    ['I', 'Dá para saber o que foi entregue no dia sem ligar para o motorista?'],
    ['C', 'O inventário é feito com frequência combinada, e não só quando falta produto?'],
    ['P', 'Produto com validade próxima é separado e sai primeiro?'],
    ['G', 'Conferentes e separadores seguem um padrão escrito?'],
    ['C', 'Os erros de separação são contados e acompanhados pela equipe?']] },
  producao: { nome: 'Produção', criterios: [
    ['P', 'A produção do dia parte de um planejamento escrito?'],
    ['I', 'A ficha técnica de cada produto está atualizada?'],
    ['C', 'As paradas de máquina são registradas com o motivo?'],
    ['C', 'O desperdício (perda, refugo) é medido?'],
    ['G', 'Os operadores seguem um padrão de trabalho escrito?'],
    ['P', 'A matéria-prima chega antes de faltar?'],
    ['C', 'A qualidade é conferida durante o processo, e não só no fim?'],
    ['P', 'A manutenção preventiva segue um calendário?'],
    ['I', 'O apontamento da produção é feito sem papel e sem redigitação?'],
    ['G', 'Mais de uma pessoa sabe operar cada etapa crítica?']] },
  rh: { nome: 'RH e departamento pessoal', criterios: [
    ['P', 'Ponto e horas extras fecham sem conferência manual demorada?'],
    ['P', 'A admissão segue um passo a passo com checklist?'],
    ['I', 'Férias e afastamentos estão num calendário que todos veem?'],
    ['C', 'A avaliação das pessoas segue critérios definidos?'],
    ['G', 'Os treinamentos de cada função estão registrados?'],
    ['P', 'Os pedidos dos funcionários (documentos, dúvidas) chegam por um canal só?'],
    ['P', 'O desligamento segue um passo a passo?'],
    ['C', 'O RH sabe quantas pessoas faltam ou saem por mês?'],
    ['I', 'Os dados dos funcionários ficam num lugar só, e não em várias planilhas?'],
    ['G', 'Cada função tem escrito o que faz e a quem responde?']] },
  atendimento: { nome: 'Atendimento e pós-venda', criterios: [
    ['P', 'As reclamações chegam por um canal registrado?'],
    ['C', 'Cada reclamação tem um responsável e um prazo?'],
    ['I', 'Dá para ver o histórico de um cliente sem perguntar a várias pessoas?'],
    ['P', 'As respostas mais comuns estão prontas e padronizadas?'],
    ['C', 'O motivo das reclamações é contado e analisado?'],
    ['G', 'O atendimento resolve sem depender sempre de outro setor?'],
    ['P', 'O cliente recebe retorno quando o problema é resolvido?'],
    ['G', 'Os atendentes têm treinamento sobre produtos e regras de troca?'],
    ['C', 'A satisfação do cliente é medida de alguma forma?'],
    ['I', 'As regras de troca e devolução estão escritas e claras?']] },
  marketing: { nome: 'Marketing', criterios: [
    ['P', 'O marketing tem um calendário de ações?'],
    ['I', 'Dá para saber de onde vêm os clientes novos?'],
    ['C', 'As ações são avaliadas depois: o que funcionou e o que não funcionou?'],
    ['I', 'Fotos, catálogo e tabela ficam num lugar só e atualizados?'],
    ['G', 'O comercial participa do que o marketing vai divulgar?'],
    ['C', 'Existe orçamento definido para as ações?'],
    ['I', 'Redes sociais e site estão com as informações corretas?'],
    ['I', 'Os contatos de clientes e interessados ficam registrados?'],
    ['P', 'Existe um padrão visual da marca que todos seguem?'],
    ['G', 'Mais de uma pessoa sabe publicar e responder nos canais?']] },
  ti: { nome: 'TI e sistemas', criterios: [
    ['C', 'Os dados importantes têm cópia de segurança testada?'],
    ['C', 'Cada pessoa tem o próprio acesso aos sistemas?'],
    ['I', 'Os sistemas conversam entre si, sem exportar e importar na mão?'],
    ['P', 'Os pedidos de suporte têm um canal e ficam registrados?'],
    ['P', 'O acesso de quem sai da empresa é retirado no mesmo dia?'],
    ['I', 'Existe uma lista dos sistemas e de quem responde por cada um?'],
    ['I', 'As planilhas críticas têm dono e ficam num lugar seguro?'],
    ['G', 'Mais de uma pessoa sabe resolver os problemas mais comuns?'],
    ['C', 'Os equipamentos têm manutenção e controle de inventário?'],
    ['G', 'As pessoas sabem usar os recursos que o sistema já tem?']] },
  gestao: { nome: 'Gestão e diretoria', criterios: [
    ['C', 'A empresa tem metas do ano escritas e conhecidas pelos líderes?'],
    ['C', 'Os números principais (venda, margem, caixa) são vistos toda semana?'],
    ['P', 'As reuniões têm pauta, decisões registradas e responsável?'],
    ['G', 'Cada setor sabe a quem responde e o que entrega?'],
    ['G', 'As decisões não dependem só do dono para tudo?'],
    ['I', 'Os indicadores saem sem alguém montar planilha na mão?'],
    ['P', 'Os projetos de melhoria têm responsável e prazo?'],
    ['I', 'A empresa conhece a margem de cada produto ou cliente?'],
    ['G', 'Os líderes recebem retorno sobre o próprio desempenho?'],
    ['C', 'Existe plano para os riscos principais: pessoa-chave, cliente grande, fornecedor único?']] },
  geral: { nome: 'Administrativo ou outro setor', criterios: [
    ['P', 'As tarefas do dia a dia têm um passo a passo escrito?'],
    ['I', 'A informação é digitada uma vez só?'],
    ['G', 'Se uma pessoa faltar, outra consegue fazer o trabalho?'],
    ['C', 'Os relatórios do setor são usados por alguém?'],
    ['P', 'O setor trabalha sem ficar parado esperando outro setor?'],
    ['C', 'Os erros são registrados e corrigidos na origem?'],
    ['G', 'O setor sabe quais são as três tarefas mais importantes dele?'],
    ['I', 'Os arquivos do setor ficam num lugar que todos acham?'],
    ['C', 'O setor tem um número que mostra se o mês foi bom?'],
    ['P', 'Os pedidos que chegam ao setor têm prazo de resposta combinado?']] }
};
const TIPOS_SETOR = Object.keys(DIAGNOSTICOS);
const SAUDE = {
  critico: { nome: 'Crítico', classe: 's-critico' }, atencao: { nome: 'Atenção', classe: 's-execucao' },
  saudavel: { nome: 'Saudável', classe: 's-resolvido' }, andamento: { nome: 'Em diagnóstico', classe: 's-aberto' },
  sem: { nome: 'Sem diagnóstico', classe: 's-aberto' }
};
const ORDEM_SAUDE = { critico: 0, atencao: 1, andamento: 2, sem: 3, saudavel: 4 };
// Tipo do setor: o que você escolheu no diagnóstico, ou um palpite pelo nome
function tipoDoSetor(s) {
  if (s.tipo && DIAGNOSTICOS[s.tipo]) return s.tipo;
  const n = normal(s.nome);
  if (/fatur|fiscal|nota fiscal/.test(n)) return 'faturamento';
  if (/financ|contab|tesour|cobranc/.test(n)) return 'financeiro';
  if (/compra|suprim/.test(n)) return 'compras';
  if (/comerc|vend/.test(n)) return 'comercial';
  if (/logist|estoq|expedi|armaz|entreg|frota|transp|deposito/.test(n)) return 'logistica';
  if (/produc|fabric|industr|manutenc/.test(n)) return 'producao';
  if (/\brh\b|recursos humanos|pessoal|\bdp\b/.test(n)) return 'rh';
  if (/atendim|sac|pos-venda|pos venda|suporte ao cliente/.test(n)) return 'atendimento';
  if (/marketing|mkt|comunicac/.test(n)) return 'marketing';
  if (/\bti\b|tecnolog|sistema|informatica/.test(n)) return 'ti';
  if (/diretor|gestao|gerencia geral|socio/.test(n)) return 'gestao';
  return 'geral';
}
const media = (lista) => lista.length ? Math.round(lista.reduce((a, b) => a + b, 0) / lista.length) : null;
function diagnosticoDe(s) {
  const tipo = tipoDoSetor(s);
  const resp = (s.diagnostico && s.diagnostico.respostas) || {};
  const itens = DIAGNOSTICOS[tipo].criterios.map(([eixo, texto], i) => { const id = `${tipo}${i + 1}`; const r = resp[id] || {}; return { id, eixo, texto, r: r.r || '', ev: r.ev || '' }; });
  const respondidos = itens.filter((x) => x.r);
  const criticos = itens.filter((x) => x.r === 'nao'), atencao = itens.filter((x) => x.r === 'parte');
  const saude = !respondidos.length ? 'sem' : criticos.length ? 'critico' : atencao.length ? 'atencao' : respondidos.length === itens.length ? 'saudavel' : 'andamento';
  const eixos = {};
  Object.keys(EIXOS).forEach((k) => { eixos[k] = media(respondidos.filter((x) => x.eixo === k).map((x) => VALOR_RESPOSTA[x.r])); });
  return { tipo, nomeTipo: DIAGNOSTICOS[tipo].nome, itens, respondidas: respondidos.length, total: itens.length, criticos, atencao, saude, nota: media(respondidos.map((x) => VALOR_RESPOSTA[x.r])), eixos };
}
// Check-up da empresa: nota geral, notas por eixo e as maiores oportunidades (o que não está atendido)
function checkupDa(empresaId) {
  const setores = setoresDa(empresaId).map((s) => ({ s, d: diagnosticoDe(s) }));
  const avaliados = setores.filter((x) => x.d.nota != null);
  const eixos = {};
  Object.keys(EIXOS).forEach((k) => { eixos[k] = media(avaliados.map((x) => x.d.eixos[k]).filter((v) => v != null)); });
  const oportunidades = [];
  avaliados.forEach(({ s, d }) => d.itens.filter((x) => x.r === 'nao' || x.r === 'parte').forEach((x) => oportunidades.push({ s, d, x })));
  oportunidades.sort((a, b) => (a.x.r === 'nao' ? 0 : 1) - (b.x.r === 'nao' ? 0 : 1) || a.d.nota - b.d.nota);
  return { setores, avaliados, nota: media(avaliados.map((x) => x.d.nota)), eixos, oportunidades, respondidos: avaliados.reduce((t, x) => t + x.d.respondidas, 0) };
}
const emAndamento = (gs) => gs.filter((g) => ['Apresentado', 'Em execução'].includes(situacaoDe(g))).length;
const srcAnexo = (id) => urlsSessao[id] || '/_blob/' + id;
// Classe de cor da nota (segue a situação do setor)
const classeNota = (d) => SAUDE[d.saude].classe;
// Anel com a nota de 0 a 100
function anelNota(nota, tam, classe) {
  const n = nota == null ? 0 : nota;
  return `<span class="anel-nota ${classe || ''}" style="--tam:${tam}px">${anel(n, tam, Math.max(4, Math.round(tam / 11)))}<b>${nota == null ? '–' : nota}</b></span>`;
}
const barraNota = (nota, classe) => `<span class="barra-nota ${classe || ''}"><i style="width:${nota == null ? 0 : nota}%"></i></span>`;
// Abas de uma página (cada aba é um endereço próprio, então o Voltar do navegador funciona)
function abas(lista, atual) {
  return `<nav class="abas" aria-label="Seções">${lista.map(([id, rotulo, href, conta]) => `<a class="aba ${id === atual ? 'ativa' : ''}" href="${href}" ${id === atual ? 'aria-current="page"' : ''}>${esc(rotulo)}${conta != null && conta !== '' ? `<span class="conta">${esc(conta)}</span>` : ''}</a>`).join('')}</nav>`;
}

/* ----- Início: as horas devolvidas e as empresas ----- */
function telaInicio() {
  const ativas = empresasAtivas();
  const nome = primeiroNome();
  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const garg = S.gargalos.filter((g) => ativas.some((e) => e.id === g.empresaId));
  const horas = somaHoras(garg);
  const resolvidos = contagem(garg)['Resolvido'];   // gargalos resolvidos e oportunidades entregues
  const cab = `<header class="cab"><div><p class="olho">${esc(hoje.charAt(0).toUpperCase() + hoje.slice(1))}</p><h1>${saudacao()}${nome ? ', ' + esc(nome) : ''}</h1><p class="sub">${ativas.length ? `${plural(ativas.length, 'empresa', 'empresas')} em diagnóstico.` : 'Cadastre a primeira empresa para começar.'}</p></div>
    <div class="acoes so-editor"><button class="btn primario" data-acao="novaEmpresa">${icone('mais')}Nova empresa</button></div></header>`;
  if (campoDisponivel()) return telaCampo(ativas, hoje, nome, horas, resolvidos);
  if (!ativas.length) return cab + `<div class="vazio"><h3>Seu painel começa com a primeira empresa</h3><p>Cadastre a empresa e os setores. Em cada setor você escreve o que viu, e a IA transforma em gargalos.</p><button class="btn primario so-editor" data-acao="novaEmpresa">${icone('mais')}Cadastrar a primeira empresa</button></div>`;
  const hero = `<section class="hero">
    <div class="hero-num"><span class="rotulo">Horas devolvidas às equipes</span>
      <span class="grande"><b data-contar="${horas}">${fmtHoras(horas)}</b><small>horas por mês</small></span>
      <span class="hero-sub">${horas ? `São ${fmtHoras(horas * 12)} horas em um ano, em ${plural(resolvidos, 'melhoria entregue', 'melhorias entregues')}.` : 'Quando você resolver um gargalo e anotar as horas de antes e de depois, o número aparece aqui.'}</span></div>
    ${TORRE.replace('class="torre"', 'class="hero-torre"')}
  </section>`;
  return cab + hero + `<section class="bloco"><div class="bloco-cab"><h2>Empresas <span class="conta">${ativas.length}</span></h2></div>
    <div class="grade-empresas">${ativas.map(cartaoEmpresa).join('')}<button class="nova-empresa so-editor" data-acao="novaEmpresa">${icone('mais')}Nova empresa</button></div></section>`;
}
// Início com o campo 3D: o desenho entra no lugar marcado (ver montarCampo); aqui vai só o que fica por cima
function telaCampo(ativas, hoje, nome, horas, resolvidos) {
  const legenda = [['saudavel', 'Saudável'], ['atencao', 'Atenção'], ['critico', 'Crítico'], ['andamento', 'Em diagnóstico'], ['sem', 'Sem diagnóstico']]
    .map(([k, t]) => `<span><i style="background:${COR_SAUDE_CSS[k]}"></i>${t}</span>`).join('');
  return `<section class="campo3d" id="campo-lugar" aria-label="Campo das empresas">
    <div class="campo-hud">
      <div class="ch-topo">
        <div class="ch-titulo"><p class="olho">${esc(hoje.charAt(0).toUpperCase() + hoje.slice(1))}</p><h1>${saudacao()}${nome ? ', ' + esc(nome) : ''}</h1>
          <p class="sub">${ativas.length ? `${plural(ativas.length, 'empresa', 'empresas')} em diagnóstico` : 'Cadastre a primeira empresa para ela aparecer no campo'}</p></div>
        <div class="ch-acoes">${horas ? `<span class="ch-chip" title="${esc(`${fmtHoras(horas * 12)} horas por ano, em ${plural(resolvidos, 'melhoria entregue', 'melhorias entregues')}`)}"><b data-contar="${horas}">${fmtHoras(horas)}</b> h/mês devolvidas</span>` : ''}<details class="ch-apresentar"><summary class="btn">${icone('slides')}Apresentar</summary><div class="ch-lista"><span class="ch-lista-tit">Passeio pela cidade</span><a href="#passeio">Só a Real Forte <small>para visitante ou cliente</small></a>${ativas.length ? `<a href="#passeio-empresas">Com as empresas <small>para a equipe</small></a><span class="ch-lista-tit">Tour em tela cheia de uma empresa</span>${ativas.map((x) => `<a href="#ap-${esc(x.id)}">${esc(x.nome)}</a>`).join('')}` : ''}</div></details><button class="btn primario so-editor" data-acao="novaEmpresa">${icone('mais')}Nova empresa</button></div>
      </div>
      ${ativas.length ? '' : `<div class="ch-vazio"><h3>O campo começa com a primeira empresa</h3><p>Cada empresa vira uma ilha com a cena do segmento dela, a logo e um prédio por setor.</p><button class="btn primario so-editor" data-acao="novaEmpresa">${icone('mais')}Cadastrar a primeira empresa</button></div>`}
      <div class="ch-rodape">
        <div class="ch-legenda" aria-label="Legenda"><span class="ch-leg-tit">Topo do prédio = saúde do setor · altura = nota · andar verde = melhoria entregue</span>${legenda}<span><i class="losango" style="background:${COR_SAUDE_CSS.critico}"></i>Gargalo aberto</span><span><i class="losango" style="background:#38bdf8"></i>Oportunidade</span></div>
        <div class="ch-dica"><span class="so-mouse">Arraste para mover · botão direito gira · role para aproximar · clique na empresa ou no centro</span><span class="so-toque">Arraste para mover · pinça aproxima e gira · toque duas vezes para abrir</span><button class="btn peq" id="ch-hora" data-acao="campoHora" title="Céu do campo: automático pelo relógio, ou dia, entardecer e noite">${icone('relogio')}<span>Automático</span></button><button class="btn peq" data-acao="campoRecentrar">${icone('grade')}Recentrar</button></div>
      </div>
    </div>
  </section>`;
}
// Passeio pela cidade em tela cheia (o passeio é feito pelo campo 3D)
function telaPasseio(privado) {
  if (!campoDisponivel()) return `<a class="voltar" href="#inicio">${icone('voltar')}Início</a><div class="aviso">${icone('alerta')}<div>O passeio pela cidade precisa de 3D, e este aparelho não tem. Abra o painel num computador.</div></div>`;
  return `<section class="campo3d apresentando" id="campo-lugar" data-passeio="${privado ? 'real' : 'empresas'}" aria-label="Passeio pela cidade da Real Forte"></section>`;
}
// Modo apresentação: o campo em tela cheia só com a ilha da empresa (o tour é feito pelo campo 3D)
function telaApresentacao(id) {
  const e = empresaPorId(id);
  if (!e) return naoAchou('Empresa não encontrada', '#inicio', 'Início');
  if (!campoDisponivel()) return `<a class="voltar" href="#e-${esc(id)}">${icone('voltar')}${esc(e.nome)}</a><div class="aviso">${icone('alerta')}<div>O modo apresentação precisa de 3D, e este aparelho não tem. Abra o painel num computador.</div></div>`;
  return `<section class="campo3d apresentando" id="campo-lugar" data-apresentar="${esc(id)}" aria-label="Apresentação do diagnóstico de ${esc(e.nome)}"></section>`;
}
function cartaoEmpresa(e) {
  const garg = gargalosDa(e.id); const c = contagem(garg); const h = somaHoras(itensDa(e.id)); const ck = checkupDa(e.id);
  return `<a class="cartao-empresa" href="#e-${esc(e.id)}">
    <div class="ce-topo"><div><p class="ce-nome">${esc(e.nome)}${e.exemplo ? '<span class="tag exemplo">Exemplo</span>' : ''}</p><p class="meta">${esc([e.segmento, e.cidade].filter(Boolean).join(' · ') || 'Sem segmento')}</p></div>${anelNota(ck.nota, 50, ck.nota == null ? '' : 'neutro')}</div>
    ${barraEtapas(c, garg.length)}
    <div class="ce-numeros"><span><b>${ck.nota == null ? '–' : ck.nota}</b>nota do check-up</span><span><b>${garg.length}</b>gargalos</span><span class="horas"><b>${h ? fmtHoras(h) : '–'}</b>h/mês devolvidas</span></div>
  </a>`;
}

/* ----- Empresa: três abas (Visão geral, Check-up, Questionário) ----- */
function cabEmpresa(e, aba) {
  const ck = checkupDa(e.id);
  return `<a class="voltar" href="#inicio">${icone('voltar')}Início</a>
    <header class="cab"><div><p class="olho">Empresa${e.exemplo ? ' <span class="tag exemplo">Exemplo</span>' : ''}${e.arquivada === 'sim' ? ' <span class="tag">Arquivada</span>' : ''}</p><h1 class="${logoDe(e) ? 'com-logo' : ''}">${logoDe(e) ? `<img class="logo-empresa" src="${esc(logoDe(e))}" alt="">` : ''}${esc(e.nome)}</h1><p class="sub">${esc([e.segmento, e.cidade, e.contato].filter(Boolean).join(' · '))}</p></div>
      <div class="acoes">${campoDisponivel() ? `<a class="btn acento" href="#ap-${esc(e.id)}" title="Tour em tela cheia para mostrar ao dono da empresa">${icone('slides')}Apresentar</a>` : ''}<button class="btn" data-acao="gerarPDF" data-id="${esc(e.id)}" id="botao-pdf" ${downloads ? '' : 'disabled'} title="${downloads ? 'Diagnóstico interno em PDF, para o sócio' : 'Funciona com o sistema aberto no Claude'}">${icone('pdf')}PDF do diagnóstico</button><button class="btn primario so-editor" data-acao="editarEmpresa" data-id="${esc(e.id)}">${icone('lapis')}Editar</button></div></header>
    ${abas([['geral', 'Visão geral', `#e-${e.id}`], ['checkup', 'Check-up', `#ck-${e.id}`, ck.nota != null ? ck.nota : ''], ['questionario', 'Questionário', `#q-${e.id}`]], aba)}`;
}
function telaEmpresa(id) {
  const e = empresaPorId(id);
  if (!e) return naoAchou('Empresa');
  const garg = gargalosDa(e.id); const c = contagem(garg); const h = somaHoras(itensDa(e.id)); const ck = checkupDa(e.id);
  const resumo = `<section class="resumo-tres">
    <a class="kpi kpi-link" href="#ck-${esc(e.id)}"><span class="rotulo">Nota do check-up</span><div class="kpi-linha">${anelNota(ck.nota, 58, ck.nota == null ? '' : 'neutro')}<span class="kpi-nota">${ck.nota == null ? 'Faça o diagnóstico dos setores para ter a nota' : `${plural(ck.avaliados.length, 'setor avaliado', 'setores avaliados')} de ${ck.setores.length}`}</span></div></a>
    <div class="kpi horas-destaque"><span class="rotulo">Horas devolvidas</span><span class="kpi-num"><span data-contar="${h}">${fmtHoras(h)}</span><small>h/mês</small></span><span class="kpi-nota">${h ? `${fmtHoras(h * 12)} horas em um ano` : 'Aparece quando você resolver um gargalo e anotar as horas'}</span></div>
    <div class="kpi"><span class="rotulo">Gargalos resolvidos</span><div class="kpi-linha"><span class="kpi-num">${c['Resolvido']}<small>de ${garg.length}</small></span>${anelRotulo(pctResolvido(garg), 46, pctResolvido(garg) + '% resolvido')}</div>${barraEtapas(c, garg.length, 'fina')}</div>
  </section>`;
  const diags = ck.setores.slice().sort((a, b) => ORDEM_SAUDE[a.d.saude] - ORDEM_SAUDE[b.d.saude] || (a.d.nota == null ? 101 : a.d.nota) - (b.d.nota == null ? 101 : b.d.nota) || String(a.s.nome).localeCompare(String(b.s.nome)));
  const cartoes = diags.map(({ s, d }) => {
    const gs = gargalosDo(s.id); const ops = oportunidadesDo(s.id); const hs = somaHoras(itensDo(s.id));
    const leitura = d.saude === 'sem' ? 'Diagnóstico ainda não feito' : d.saude === 'saudavel' ? 'Todos os critérios atendidos'
      : [d.criticos.length ? plural(d.criticos.length, 'ponto crítico', 'pontos críticos') : '', d.atencao.length ? plural(d.atencao.length, 'ponto de atenção', 'pontos de atenção') : '', d.saude === 'andamento' ? `${d.respondidas} de ${d.total} respondidos` : ''].filter(Boolean).join(' · ');
    return `<a class="cartao-setor com-saude ${SAUDE[d.saude].classe}" href="#s-${esc(s.id)}">
      <div class="cs-topo"><div><h3>${esc(s.nome)}</h3><p class="meta">${esc(d.nomeTipo)}</p></div>${anelNota(d.nota, 50, classeNota(d))}</div>
      <p class="cs-diag"><span class="pill">${SAUDE[d.saude].nome}</span> ${esc(leitura)}</p>
      <div class="cs-numeros"><span><b>${gs.length}</b> ${gs.length === 1 ? 'gargalo' : 'gargalos'}</span><span><b>${ops.length}</b> ${ops.length === 1 ? 'oportunidade' : 'oportunidades'}</span><span><b>${emAndamento(gs.concat(ops))}</b> em andamento</span>${hs ? `<span class="cs-horas"><b>${fmtHoras(hs)}</b> h/mês devolvidas</span>` : ''}</div>
    </a>`;
  }).join('');
  const conta = (k) => diags.filter((x) => x.d.saude === k).length;
  const resumoSaude = [['critico', 'crítico', 'críticos'], ['atencao', 'em atenção', 'em atenção'], ['saudavel', 'saudável', 'saudáveis'], ['andamento', 'em diagnóstico', 'em diagnóstico'], ['sem', 'sem diagnóstico', 'sem diagnóstico']]
    .filter(([k]) => conta(k)).map(([k, um, varios]) => `<span class="item ${SAUDE[k].classe}"><i></i>${plural(conta(k), um, varios)}</span>`).join('');
  const exemplo = e.exemplo ? `<div class="aviso info">${icone('info')}<div>Esta é uma empresa de exemplo, só para mostrar o painel funcionando. <button class="btn peq perigo so-editor" data-acao="apagarEmpresa" data-id="${esc(e.id)}" style="margin-left:6px">${icone('lixo')}Apagar o exemplo</button></div></div>` : '';
  return cabEmpresa(e, 'geral') + resumo + `<section class="bloco"><div class="bloco-cab"><h2>Saúde dos setores</h2><div class="legenda-etapas">${resumoSaude}</div></div>
    <div class="grade-setores">${cartoes}<button class="novo-setor so-editor" data-acao="novoSetor" data-id="${esc(e.id)}">${icone('mais')}Novo setor</button></div></section>` + exemplo;
}
// Check-up Empresarial: o mapa que o cliente recebe
function telaCheckup(id) {
  const e = empresaPorId(id);
  if (!e) return naoAchou('Empresa');
  const ck = checkupDa(e.id);
  if (!ck.setores.length) return cabEmpresa(e, 'checkup') + `<div class="vazio"><h3>Cadastre os setores primeiro</h3><p>O check-up dá uma nota de 0 a 100 para cada setor, a partir de critérios padronizados da Real Forte.</p><button class="btn primario so-editor" data-acao="novoSetor" data-id="${esc(e.id)}">${icone('mais')}Novo setor</button></div>`;
  const topo = `<section class="checkup-topo">
    <div class="ck-nota">${anelNota(ck.nota, 120, 'claro')}<div><span class="rotulo">Check-up Empresarial Real Forte</span><h2>${ck.nota == null ? 'Ainda sem nota' : `Nota geral ${ck.nota} de 100`}</h2>
      <p>${ck.nota == null ? 'Responda o diagnóstico de pelo menos um setor para ter a nota.' : `${plural(ck.avaliados.length, 'setor avaliado', 'setores avaliados')} de ${ck.setores.length} · ${plural(ck.respondidos, 'critério respondido', 'critérios respondidos')} · ${plural(ck.oportunidades.length, 'ponto para melhorar', 'pontos para melhorar')}`}</p></div></div>
    <button class="btn acento" data-acao="pdfCheckup" data-id="${esc(e.id)}" id="botao-checkup" ${downloads && ck.nota != null ? '' : 'disabled'}>${icone('pdf')}Baixar check-up para o cliente</button>
  </section>`;
  const ordenados = ck.setores.slice().sort((a, b) => (a.d.nota == null ? 101 : a.d.nota) - (b.d.nota == null ? 101 : b.d.nota));
  const mapa = `<section class="bloco"><div class="bloco-cab"><h2>Mapa por setor</h2><span class="meta">Do que mais precisa de atenção para o que está melhor</span></div>
    <div class="painel mapa-notas">${ordenados.map(({ s, d }) => `<a class="mn-linha ${classeNota(d)}" href="#s-${esc(s.id)}"><span class="mn-nome"><b>${esc(s.nome)}</b><span class="meta">${esc(d.nomeTipo)}</span></span>${barraNota(d.nota)}<b class="mn-num">${d.nota == null ? '–' : d.nota}</b><span class="pill">${SAUDE[d.saude].nome}</span></a>`).join('')}</div></section>`;
  const eixos = `<section class="bloco"><div class="bloco-cab"><h2>Notas por eixo</h2><span class="meta">Média de todos os setores avaliados</span></div>
    <div class="eixos">${Object.entries(EIXOS).map(([k, nome]) => `<div class="eixo"><span>${esc(nome)}</span>${barraNota(ck.eixos[k], 'neutro')}<b>${ck.eixos[k] == null ? '–' : ck.eixos[k]}</b></div>`).join('')}</div></section>`;
  const oport = `<section class="bloco"><div class="bloco-cab"><h2>Onde melhorar primeiro</h2><span class="meta">Critérios não atendidos, começando pelos críticos</span></div>
    ${ck.oportunidades.length ? `<ol class="oportunidades">${ck.oportunidades.slice(0, 12).map(({ s, x }) => `<li class="${x.r === 'nao' ? 's-critico' : 's-execucao'}"><a href="#s-${esc(s.id)}"><span class="pill">${x.r === 'nao' ? 'Crítico' : 'Atenção'}</span><span class="op-txt"><b>${esc(x.texto)}</b><span class="meta">${esc(s.nome)} · ${esc(EIXOS[x.eixo])}${x.ev ? ' · ' + esc(x.ev) : ''}</span></span></a></li>`).join('')}</ol>` : '<p class="vazio-mini">Nenhum critério não atendido até agora.</p>'}</section>`;
  const como = `<p class="meta como-ler">Como a nota é calculada: cada critério respondido vale 100 (Sim), 50 (Em parte) ou 0 (Não). A nota do setor é a média dos critérios, e a nota geral é a média dos setores avaliados. Um setor fica Crítico quando algum critério não é atendido.</p>`;
  return cabEmpresa(e, 'checkup') + topo + `<div class="duas-iguais">${mapa}${eixos}</div>` + oport + como;
}
function telaQuestionario(id) {
  const e = empresaPorId(id);
  if (!e) return naoAchou('Empresa');
  const setores = setoresDa(e.id);
  const corpo = setores.length ? `<section class="painel remoto"><div style="display:flex;gap:12px;align-items:flex-start">${icone('celular')}<div><h3>Questionário a distância</h3><p class="meta">Quando não der para visitar: copie o convite do setor e mande no WhatsApp. A pessoa responde pelo celular, a resposta chega no seu WhatsApp e você cola aqui. Ela entra em “O que eu vi” do setor.</p></div></div>
      ${numeroWhats() ? '' : `<div class="aviso" style="width:100%">${icone('alerta')}<div>Cadastre seu WhatsApp em <a href="#ajustes">Ajustes</a> para as respostas voltarem direto para você.</div></div>`}
      <div class="q-lista">${setores.map((s) => `<div class="q-linha"><b>${esc(s.nome)}</b><button class="btn peq" data-acao="copiarConviteQ" data-id="${esc(s.id)}">${icone('copiar')}Copiar convite</button></div>`).join('')}</div>
      <div class="q-acoes so-editor"><button class="btn primario" data-acao="colarRespostas" data-id="${esc(e.id)}">${icone('mais')}Colar respostas recebidas</button></div></section>`
    : `<div class="vazio"><h3>Cadastre os setores primeiro</h3><p>Cada setor ganha um convite próprio para o questionário.</p></div>`;
  return cabEmpresa(e, 'questionario') + corpo;
}
const naoAchou = (o) => `<a class="voltar" href="#inicio">${icone('voltar')}Início</a><div class="vazio"><h3>${o} não encontrad${o === 'Empresa' ? 'a' : 'o'}</h3><p>Pode ter sido apagad${o === 'Empresa' ? 'a' : 'o'}.</p></div>`;

/* ----- Setor: três abas (Diagnóstico, O que eu vi, Gargalos) ----- */
function cabSetor(s, e, aba) {
  const d = diagnosticoDe(s); const garg = gargalosDo(s.id); const ops = oportunidadesDo(s.id);
  return `<a class="voltar" href="#e-${esc(e.id)}">${icone('voltar')}${esc(e.nome)}</a>
    <header class="cab"><div class="cab-setor">${anelNota(d.nota, 64, classeNota(d))}<div><p class="olho">Setor · ${esc(e.nome)}</p><h1>${esc(s.nome)}</h1><p class="sub"><span class="pill ${SAUDE[d.saude].classe}">${SAUDE[d.saude].nome}</span> ${esc(s.responsavel ? 'Responsável: ' + s.responsavel : 'Sem responsável cadastrado')}</p></div></div>
      <div class="acoes so-editor"><button class="btn" data-acao="editarSetor" data-id="${esc(s.id)}">${icone('lapis')}Editar setor</button></div></header>
    ${abas([['diag', 'Diagnóstico', `#s-${s.id}`, d.nota != null ? d.nota : ''], ['vi', 'O que eu vi', `#sv-${s.id}`, notasDo(s.id).length], ['gargalos', 'Gargalos', `#sg-${s.id}`, garg.length], ['oport', 'Oportunidades', `#so-${s.id}`, ops.length]], aba)}`;
}
function telaSetor(id, aba) {
  const s = setorPorId(id); const e = s && empresaPorId(s.empresaId);
  if (!s || !e) return naoAchou('Setor');
  if (aba === 'vi') return cabSetor(s, e, 'vi') + abaVi(s);
  if (aba === 'gargalos') return cabSetor(s, e, 'gargalos') + abaGargalos(s);
  if (aba === 'oport') return cabSetor(s, e, 'oport') + abaOportunidades(s);
  return cabSetor(s, e, 'diag') + abaDiagnostico(s);
}
function abaDiagnostico(s) {
  const d = diagnosticoDe(s);
  const trava = S.podeEditar ? '' : 'disabled';
  const problemas = d.criticos.concat(d.atencao);
  const resumo = `<section class="saude ${SAUDE[d.saude].classe}">
    <div class="saude-cab"><div class="saude-titulo"><span class="rotulo">Resultado do diagnóstico</span><span class="saude-status"><i></i>${SAUDE[d.saude].nome}${d.nota != null ? ` · nota ${d.nota}` : ''}</span>
      <span class="meta">${d.respondidas} de ${d.total} critérios respondidos · Sim vale 100, Em parte 50, Não 0</span></div>
      ${ia && problemas.length ? `<a class="btn" href="#ia-s-${esc(s.id)}">${icone('ia')}Perguntar à RF Intelligence</a>` : ''}</div>
    <div class="eixos">${Object.entries(EIXOS).map(([k, nome]) => `<div class="eixo"><span>${esc(nome)}</span>${barraNota(d.eixos[k], 'neutro')}<b>${d.eixos[k] == null ? '–' : d.eixos[k]}</b></div>`).join('')}</div>
  </section>`;
  const grupos = Object.entries(EIXOS).map(([k, nome]) => {
    const itens = d.itens.filter((x) => x.eixo === k); if (!itens.length) return '';
    return `<section class="grupo-criterios"><h3>${esc(nome)}</h3>${itens.map((x) => `<div class="pergunta ${x.r ? 'r-' + x.r : ''}"><span class="pergunta-n">${d.itens.indexOf(x) + 1}</span><div class="pergunta-corpo"><p>${esc(x.texto)}</p>
      <div class="respostas" role="group" aria-label="Resposta">${[['sim', 'Sim'], ['parte', 'Em parte'], ['nao', 'Não']].map(([v, rot]) => `<button class="resp resp-${v}" data-acao="responder" data-id="${esc(s.id)}" data-pergunta="${x.id}" data-valor="${v}" aria-pressed="${x.r === v}" ${trava}>${rot}</button>`).join('')}</div>
      ${x.r && x.r !== 'sim' ? `<input class="evidencia" data-evidencia="${x.id}" data-id="${esc(s.id)}" value="${esc(x.ev)}" placeholder="O que você viu? (opcional)" aria-label="Evidência" ${S.podeEditar ? '' : 'readonly'}>` : ''}</div></div>`).join('')}</section>`;
  }).join('');
  return resumo + `<div class="diag-topo"><label for="tipo-setor">Critérios de</label><select id="tipo-setor" data-id="${esc(s.id)}" ${trava}>${TIPOS_SETOR.map((k) => `<option value="${k}" ${k === d.tipo ? 'selected' : ''}>${esc(DIAGNOSTICOS[k].nome)}</option>`).join('')}</select><span class="meta">Responda o que der na visita. Dá para voltar depois.</span></div>
    <div class="grupos">${grupos}</div>`;
}
function abaVi(s) {
  const notas = notasDo(s.id); const d = diagnosticoDe(s);
  const anexosNovos = UI.anexosNovos.length ? `<div class="anexos-novos">${UI.anexosNovos.map((a, i) => a.tipo === 'arquivo'
    ? `<span class="arquivo-novo">${icone('clipe')}<span class="arq-nome" title="${esc(a.nome)}">${esc(a.nome)}</span><span class="meta">${esc(tamanhoLegivel(a.tamanho))}</span><select data-pedido-arquivo="${i}" aria-label="O que fazer com este arquivo">${PEDIDOS_ARQUIVO.map(([k, t]) => `<option value="${k}" ${k === (a.pedido || '') ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select><button type="button" class="icone-btn" data-acao="tirarAnexo" data-id="${i}" aria-label="Tirar arquivo">${icone('x')}</button></span>`
    : a.tipo === 'foto'
    ? `<span class="foto"><img src="${esc(a.preview)}" alt=""><button type="button" data-acao="tirarAnexo" data-id="${i}" aria-label="Tirar foto">×</button></span>`
    : `<span class="audio-novo">${icone('mic')}<audio controls preload="metadata" src="${esc(a.preview)}"></audio><button type="button" class="icone-btn" data-acao="tirarAnexo" data-id="${i}" aria-label="Tirar áudio">${icone('x')}</button></span>`).join('')}</div>` : '';
  const compositor = `<div class="compositor so-editor"><textarea id="nova-nota" data-setor="${esc(s.id)}" rows="3" aria-label="O que você viu" placeholder="Escreva, tire uma foto, grave um áudio ou anexe um arquivo (a planilha que o setor usa, por exemplo). Dá para falar pelo microfone do teclado.">${esc(UI.rascunho[s.id] || '')}</textarea>
    ${anexosNovos}
    <div class="compositor-rodape"><span class="comp-botoes">${assets ? `<label class="btn peq" for="anexo-foto">${icone('camera')}Foto</label><input type="file" id="anexo-foto" accept="image/*" capture="environment" hidden data-anexo="foto"><label class="btn peq" for="anexo-audio">${icone('mic')}Áudio</label><input type="file" id="anexo-audio" accept="audio/*" capture hidden data-anexo="audio"><label class="btn peq" for="anexo-arquivo">${icone('clipe')}Arquivo</label><input type="file" id="anexo-arquivo" accept="${ACEITA_ARQUIVO}" multiple hidden data-anexo="arquivo">` : ''}${UI.lendoFoto ? '<span class="meta"><span class="girando"></span> A IA está olhando a foto…</span>' : ''}</span>
      <button class="btn peq primario" data-acao="salvarNota" data-id="${esc(s.id)}" ${UI.guardando ? 'disabled' : ''}>${UI.guardando ? '<span class="girando"></span>Guardando…' : icone('ok') + 'Guardar'}</button></div></div>`;
  const temDiag = d.criticos.length + d.atencao.length > 0;
  const transformar = ia && (notas.length || temTexto((UI.rascunho || {})[s.id])) ? `<button class="btn acento so-editor" data-acao="transformar" data-id="${esc(s.id)}" ${UI.sugestoes && UI.sugestoes.estado === 'lendo' ? 'disabled' : ''}>${icone('ia')}Transformar em gargalos e oportunidades</button>` : '';
  const listaNotas = notas.length ? `<div class="notas">${notas.map(notaHTML).join('')}</div>` : '<p class="vazio-mini">Nenhuma anotação ainda. Escreva acima, tire uma foto, grave um áudio ou anexe um arquivo.</p>';
  return `<div class="coluna-unica">${compositor}${transformar}${sugestoesHTML(s)}${listaNotas}</div>`;
}
function abaGargalos(s) {
  const garg = gargalosDo(s.id); const h = somaHoras(garg);
  const ind = (n, texto, classe) => `<div class="ind ${classe || ''}"><b>${n}</b><span>${texto}</span></div>`;
  const listaG = garg.length ? garg.map(cardG).join('') : `<p class="vazio-mini">Nenhum gargalo ainda. Escreva um acima e aperte Enter, ou use “Transformar em gargalos” na aba O que eu vi.</p>`;
  return `<div class="coluna-unica">
    <div class="indicadores tres">${ind(emAndamento(garg), 'melhorias em andamento')}${ind(contagem(garg)['Resolvido'], 'gargalos resolvidos')}${ind(h ? fmtHoras(h) : '–', 'h/mês devolvidas', h ? 's-resolvido' : '')}</div>
    <div class="linha-acoes"><form class="novo-g so-editor" data-form="novoGargalo" data-id="${esc(s.id)}">${icone('mais')}<input id="novo-gargalo" autocomplete="off" placeholder="Novo gargalo: escreva e aperte Enter" aria-label="Novo gargalo"><button class="btn peq">Criar</button></form>${garg.length ? `<button class="btn" data-acao="copiarPromptSetor" data-id="${esc(s.id)}">${icone('prompt')}Prompt do setor</button>` : ''}</div>
    ${canoHTML(s)}
    <div class="lista-gargalos">${listaG}</div></div>`;
}

function abaOportunidades(s) {
  const ops = oportunidadesDo(s.id); const h = somaHoras(ops);
  const ind = (n, texto, classe) => `<div class="ind ${classe || ''}"><b>${n}</b><span>${texto}</span></div>`;
  const lista = ops.length ? ops.map(cardG).join('') : `<p class="vazio-mini">Quando alguém do setor disser “poderia ter um painel de…”, “seria bom se…”, anote aqui. Não é problema: é melhoria que dá para entregar.</p>`;
  return `<div class="coluna-unica">
    <div class="indicadores tres">${ind(ops.length - contagem(ops)['Resolvido'], 'oportunidades abertas')}${ind(contagem(ops)['Resolvido'], 'oportunidades entregues')}${ind(h ? fmtHoras(h) : '–', 'h/mês devolvidas', h ? 's-resolvido' : '')}</div>
    <form class="novo-g so-editor" data-form="novoGargalo" data-tipo="oportunidade" data-id="${esc(s.id)}">${icone('mais')}<input id="novo-gargalo" autocomplete="off" placeholder="Nova oportunidade: o que o setor disse que poderia ter" aria-label="Nova oportunidade"><button class="btn peq">Criar</button></form>
    <div class="lista-gargalos">${lista}</div></div>`;
}

function notaHTML(n) {
  const anexos = Array.isArray(n.anexos) ? n.anexos : [];
  const fotos = anexos.filter((a) => a.tipo === 'foto'), audios = anexos.filter((a) => a.tipo === 'audio'), arquivos = anexos.filter((a) => a.tipo === 'arquivo');
  const midia = `${fotos.length ? `<div class="fotos">${fotos.map((a) => `<button class="foto" data-acao="verFoto" data-id="${esc(a.id)}" aria-label="Ver foto"><img src="${esc(srcAnexo(a.id))}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}${audios.map((a) => `<div class="audio-nota">${icone('mic')}<audio controls preload="none" src="${esc(srcAnexo(a.id))}"></audio></div>`).join('')}${arquivos.map((a) => `<div class="arquivo-nota">${icone('clipe')}<span class="arq-nome" title="${esc(a.nome)}">${esc(a.nome || 'arquivo')}</span><span class="meta">${esc(tamanhoLegivel(a.tamanho))}</span>${a.pedido ? `<span class="tag">${esc(textoPedido(a.pedido))}</span>` : ''}<button type="button" class="btn peq" data-acao="baixarAnexo" data-id="${esc(a.id)}" ${downloads ? '' : 'disabled'} title="${downloads ? 'Baixar o arquivo original' : 'Funciona com o painel aberto no Claude'}">${icone('baixar')}Baixar</button></div>`).join('')}`;
  if (UI.editandoNota === n.id) return `<article class="nota"><textarea id="editar-nota" data-crescer aria-label="Editar anotação">${esc(n.texto)}</textarea>${midia}
    <div class="nota-edicao"><button class="btn peq perigo" data-acao="excluirNota" data-id="${esc(n.id)}">${icone('lixo')}Excluir</button><button class="btn peq" data-acao="cancelarNota">Cancelar</button><button class="btn peq primario" data-acao="guardarNota" data-id="${esc(n.id)}">${icone('ok')}Guardar</button></div></article>`;
  return `<article class="nota"><div class="nota-cab"><span class="nota-data">${esc(dataBR(n.data))}${n.origem === 'questionario' ? '<span class="tag">Questionário</span>' : ''}</span><button class="icone-btn so-editor" data-acao="editarNota" data-id="${esc(n.id)}" aria-label="Editar anotação">${icone('lapis')}</button></div>${temTexto(n.texto) ? `<p class="nota-texto">${esc(n.texto)}</p>` : ''}${midia}</article>`;
}
// Sugestões da IA aparecem na própria tela, logo abaixo do botão
function sugestoesHTML(s) {
  const sg = UI.sugestoes;
  if (!sg || sg.setorId !== s.id) return '';
  let corpo;
  if (sg.estado === 'lendo') corpo = '<div class="pensando"><i></i><span>Lendo o que você viu…</span></div>';
  else if (sg.estado === 'erro') corpo = `<p class="erro-form">${esc(sg.erro)}</p>`;
  else if (!sg.lista.length) corpo = '<p class="meta">A IA não encontrou nada novo nessas anotações.</p>';
  else corpo = sg.lista.map((x, i) => `<div class="sugestao"><span class="tag ${x.tipo === 'oportunidade' ? 'oport' : ''}">${x.tipo === 'oportunidade' ? 'Oportunidade' : 'Gargalo'}</span><h3>${esc(x.titulo)}</h3>${x.observacao ? `<p><b>${x.tipo === 'oportunidade' ? 'O que o setor pediu.' : 'O que foi visto.'}</b> ${esc(x.observacao)}</p>` : ''}${x.proposta ? `<p><b>Proposta.</b> ${esc(x.proposta)}</p>` : ''}
      <div class="sugestao-rodape"><span></span>${x.adicionado ? `<span class="pill s-resolvido">Adicionado</span>` : `<button class="btn peq primario" data-acao="adicionarSugestao" data-id="${i}">${icone('mais')}Adicionar</button>`}</div></div>`).join('');
  const faltam = sg.estado === 'pronto' && sg.lista.some((x) => !x.adicionado);
  return `<div class="sugestoes"><div class="sugestoes-cab"><b>${sg.estado === 'pronto' ? `A IA achou ${plural(sg.lista.filter((x) => x.tipo !== 'oportunidade').length, 'gargalo', 'gargalos')} e ${plural(sg.lista.filter((x) => x.tipo === 'oportunidade').length, 'oportunidade', 'oportunidades')}` : 'Lendo com a IA'}</b><span class="acoes">${faltam ? `<button class="btn peq primario" data-acao="adicionarTodas">Adicionar todos</button>` : ''}<button class="btn peq fantasma" data-acao="fecharSugestoes">Fechar</button></span></div>${corpo}</div>`;
}

// Cartão do gargalo: fechado mostra o título e a etapa; aberto mostra tudo, no próprio lugar
function cardG(g) {
  const st = situacaoDe(g), idx = SITUACOES.indexOf(st), aberto = UI.aberto === g.id, h = horasLivres(g);
  const so = S.podeEditar ? '' : 'readonly'; const op = ehOport(g);
  const topo = `<button class="g-topo" data-acao="abrirG" data-id="${esc(g.id)}" aria-expanded="${aberto}"><span class="g-titulo">${esc(g.titulo)}</span><span class="g-meta">${h ? `<span class="selo-horas">${icone('desce')}${fmtHoras(h)} h/mês</span>` : ''}${pill(g)}</span><span class="g-seta">${icone('seta')}</span>
    <span class="trilha-mini" aria-hidden="true">${SITUACOES.map((x, i) => `<i class="${i <= idx ? 'on' : ''}"></i>`).join('')}</span></button>`;
  if (!aberto) return `<article class="g-card ${CLASSE[st]} ${op ? 'oport' : ''}" id="g-${esc(g.id)}">${topo}</article>`;
  const gerando = UI.gerandoPPT === g.id;
  const corpo = `<div class="g-corpo">
    <div class="trilha" role="group" aria-label="Etapa do gargalo">${SITUACOES.map((x, i) => `<button class="passo-t ${CLASSE[x]} ${i < idx ? 'feito' : i === idx ? 'atual' : ''}" data-acao="etapa" data-id="${esc(g.id)}" data-situacao="${esc(x)}" ${S.podeEditar ? '' : 'disabled'} aria-pressed="${i === idx}"><i>${i < idx ? icone('ok') : i + 1}</i><span>${esc(nomeEtapa(g, x))}</span></button>`).join('')}</div>
    <label class="g-campo"><span class="rotulo">${op ? 'Oportunidade' : 'Gargalo'}</span><input class="titulo" data-salvar="titulo" data-id="${esc(g.id)}" value="${esc(g.titulo)}" ${so}></label>
    <label class="g-campo"><span class="rotulo">${op ? 'O que o setor pediu' : 'O que eu vi'}</span><textarea data-salvar="observacao" data-id="${esc(g.id)}" data-crescer rows="2" placeholder="${op ? 'O que disseram que poderia ter, e para que serviria' : 'Como é feito hoje, onde trava, onde dá erro'}" ${so}>${esc(g.observacao || '')}</textarea></label>
    <div class="g-campo"><div class="campo-linha"><label class="rotulo" for="proposta-${esc(g.id)}">${op ? 'O que vou entregar' : 'O que vou propor'}</label>${ia ? `<button class="btn peq ia so-editor" data-acao="sugerirProposta" data-id="${esc(g.id)}" id="ia-${esc(g.id)}">${icone('ia')}${temProposta(g) ? 'Reescrever com IA' : 'Sugerir com IA'}</button>` : ''}</div>
      <textarea id="proposta-${esc(g.id)}" data-salvar="proposta" data-id="${esc(g.id)}" data-crescer rows="2" placeholder="A solução que você vai levar ao setor" ${so}>${esc(g.proposta || '')}</textarea></div>
    ${st === 'Resolvido' ? horasHTML(g) : ''}
    <div class="g-acoes"><button class="btn primario" data-acao="copiarPrompt" data-id="${esc(g.id)}">${icone('prompt')}Copiar prompt para o Claude</button>
      <button class="btn" data-acao="baixarPPT" data-id="${esc(g.id)}" ${downloads && !gerando ? '' : 'disabled'} title="${downloads ? 'Seis slides simples da proposta, para mandar ao setor' : 'Funciona com o painel aberto no Claude'}">${gerando ? '<span class="girando"></span>Montando os slides…' : icone('slides') + 'Baixar PowerPoint'}</button>
      ${ia ? `<a class="btn" href="#ia-g-${esc(g.id)}">${icone('ia')}Perguntar à RF Intelligence</a>` : ''}
      <span class="dir so-editor"><button class="btn peq fantasma perigo" data-acao="excluirG" data-id="${esc(g.id)}">${icone('lixo')}Excluir</button></span></div>
  </div>`;
  return `<article class="g-card aberto ${CLASSE[st]} ${op ? 'oport' : ''}" id="g-${esc(g.id)}">${topo}${corpo}</article>`;
}
function horasHTML(g) {
  const h = horasLivres(g);
  return `<div class="horas-inline so-editor"><span class="rotulo">Horas por mês que o setor gastava e gasta agora</span>
    <div class="linha"><div class="horas-campos"><label for="h-antes">Antes<input id="h-antes" inputmode="decimal" value="${esc(g.horasAntes || '')}" placeholder="Ex.: 40"></label><label for="h-depois">Depois<input id="h-depois" inputmode="decimal" value="${esc(g.horasDepois || '')}" placeholder="Ex.: 8"></label></div>
      <button class="btn primario" data-acao="salvarHoras" data-id="${esc(g.id)}">${icone('ok')}Salvar</button></div>
    <div class="horas-resultado" id="h-res">${resultadoHoras(numero(g.horasAntes), numero(g.horasDepois), h)}</div>
  </div>`;
}
function resultadoHoras(a, d) {
  if (a != null && d != null && a >= d) return `<b>${fmtHoras(a - d)} h/mês</b><span>a menos para o setor · ${fmtHoras((a - d) * 12)} h em um ano</span>`;
  return '<span>Combine os dois números com o responsável do setor. Se a tarefa acabou, o depois é 0.</span>';
}

/* ----- Ajustes ----- */
function telaAjustes() {
  return `<a class="voltar" href="#inicio">${icone('voltar')}Início</a>
  <header class="cab"><div><p class="olho">${esc(nomeFrente())}</p><h1>Ajustes</h1><p class="sub">Seus dados, a cópia de segurança e como o painel funciona.</p></div>
    <div class="acoes so-editor"><button class="btn primario" data-acao="editarAjustes">${icone('lapis')}Editar</button></div></header>
  <div class="duas-iguais">
    <section class="painel"><div class="painel-corpo"><h2>Geral</h2><dl class="dados">
      <dt>Consultor</dt><dd>${esc(nomeConsultor() || 'Não informado')}</dd>
      <dt>Seu WhatsApp</dt><dd>${S.config.whatsapp ? esc(S.config.whatsapp) : '<span class="meta">Não cadastrado. Sem ele, as respostas do questionário não voltam direto para você.</span>'}</dd>
      <dt>Nome da frente</dt><dd>${esc(nomeFrente())} <span class="meta">(provisório, decisão dos sócios)</span></dd>
      <dt>Armazenamento</dt><dd>${S.modo === 'nuvem' ? 'Conectado. Tudo é salvo na hora.' : 'Sem armazenamento nesta visualização.'}</dd>
      <dt>Registros</dt><dd>${S.empresas.length} empresas · ${S.setores.length} setores · ${S.diario.length} anotações · ${S.gargalos.length} gargalos</dd></dl></div></section>
    <section class="painel"><div class="painel-corpo"><h2>Cópia de segurança</h2><p class="meta" style="margin-bottom:14px">Um arquivo com tudo: empresas, setores, anotações, gargalos e ajustes. Baixe toda sexta e guarde no seu Drive.</p>
      <div class="acoes"><button class="btn" data-acao="baixarBackup" ${downloads ? '' : 'disabled'}>${icone('baixar')}Baixar cópia de tudo</button><button class="btn so-editor" data-acao="restaurarBackup">${icone('subir')}Restaurar de uma cópia</button></div>
      ${downloads ? '' : '<p class="meta" style="margin-top:10px">Baixar arquivos funciona com o painel aberto no Claude.</p>'}</div></section>
  </div>
  <section class="painel"><div class="painel-corpo"><h2>Sobre o painel</h2><dl class="dados">
    <dt>O que faz</dt><dd>Organiza o diagnóstico: o Check-up Empresarial (nota de 0 a 100 por setor), o que você viu (texto, foto, áudio e arquivo, como a planilha que o setor quer automatizar), os gargalos (o que atrapalha), as oportunidades (o que o setor disse que poderia ter), a RF Intelligence e a Biblioteca de soluções.</dd>
    <dt>O que colocar</dt><dd>O que você viu nas visitas (ou as respostas do questionário), do jeito que você fala.</dd>
    <dt>De onde sai isso</dt><dd>Das visitas aos setores, do questionário que a equipe do cliente responde e dos arquivos que a área mostra.</dd>
    <dt>O que devolve</dt><dd>O check-up em PDF para o cliente, o PDF do diagnóstico para o sócio, os gargalos e as oportunidades com proposta, o prompt para o Claude, o PowerPoint para o setor e as horas devolvidas.</dd>
    <dt>Quem responde pela regra</dt><dd>A proposta é sua. As horas de antes e de depois são do responsável do setor no cliente. Os critérios do check-up, o peso das respostas e os materiais da RF Intelligence são da Real Forte: os sócios revisam.</dd>
    <dt>Quando der erro</dt><dd>Se nada salvar, abra o painel pelo Claude com a sua conta. Se algo sumir, restaure a última cópia aqui em Ajustes.</dd>
  </dl></div></section>`;
}

/* ---------- 10. Prompts para o Claude (montados a partir do que foi registrado) ---------- */
const REGRAS_DE_TRABALHO = `COMO EU QUERO QUE VOCÊ TRABALHE
1. Comece pela especificação, antes de qualquer código: o que entra (o arquivo que o setor exporta ou cola, com os nomes das colunas), o que sai, e o que a ferramenta faz quando falta dado.
2. Liste as perguntas que preciso levar ao responsável do setor antes de construir, dizendo para quem é cada uma.
3. Nenhuma regra de negócio dentro do código. Percentual, prazo, limite e meta viram campo em branco, com o nome de quem declara.
4. A solução precisa ser simples de manter: arquivo único que abre no navegador, sem login, sem banco de dados e sem depender do sistema do cliente. Trabalha sobre o arquivo que a área exporta.
5. Tudo em português, com as palavras que o setor já usa, e com uma explicação curta na própria tela de como usar.
6. No fim, escreva um texto curto de proposta para eu apresentar ao cliente: o problema, a solução e o que muda no dia a dia do setor.

Se a melhor saída não for uma ferramenta (mudar o processo ou cortar a tarefa), me diga isso antes de construir qualquer coisa.`;

function contextoEmpresa(e, s) {
  const empresa = e.nome + (e.segmento ? ` (${e.segmento}` + (e.cidade ? `, ${e.cidade}` : '') + ')' : e.cidade ? ` (${e.cidade})` : '');
  return `Sou consultor da Real Forte Consultoria e estou fazendo o diagnóstico de processos da empresa ${empresa}. Preciso da sua ajuda para construir a solução que vou propor ao setor ${s.nome}${s.responsavel ? ` (responsável: ${s.responsavel})` : ''}.`;
}
function promptDoGargalo(g) {
  const s = setorPorId(g.setorId) || { nome: 'sem setor' };
  const e = empresaPorId(g.empresaId) || { nome: '' };
  const partes = [
    contextoEmpresa(e, s),
    ehOport(g) ? `A OPORTUNIDADE (não é um problema: é algo que o setor pediu e que dá para entregar)\n${g.titulo}` : `O GARGALO\n${g.titulo}`,
    `${ehOport(g) ? 'O QUE O SETOR PEDIU' : 'O QUE EU OBSERVEI'}\n${g.observacao || 'Sem descrição.'}`,
    `O QUE EU QUERO PROPOR\n${temProposta(g) ? g.proposta : 'Ainda não defini. Antes de construir, me sugira a solução mais simples e me explique por quê.'}`
  ];
  partes.push(REGRAS_DE_TRABALHO);
  return partes.join('\n\n');
}
function promptDoSetor(s) {
  const e = empresaPorId(s.empresaId) || { nome: '' };
  const garg = gargalosDo(s.id);
  const notas = notasDo(s.id).slice().reverse();
  const blocos = garg.map((g, i) => `${i + 1}. ${g.titulo}\nO que eu observei: ${g.observacao || 'Sem descrição.'}\nO que eu quero propor: ${temProposta(g) ? g.proposta : 'Ainda não defini.'}`);
  const partes = [
    contextoEmpresa(e, s).replace('a solução que vou propor', 'as soluções que vou propor'),
    `OS GARGALOS DO SETOR\n${blocos.join('\n\n')}`
  ];
  if (notas.length) partes.push(`MINHAS ANOTAÇÕES DA VISITA\n${notas.map((n) => `${dataBR(n.data)}: ${n.texto}`).join('\n')}`);
  partes.push('ANTES DE TUDO\nDiga em que ordem eu devo atacar esses gargalos e se dá para resolver mais de um com a mesma ferramenta. Depois siga as regras abaixo para a primeira solução.');
  partes.push(REGRAS_DE_TRABALHO);
  return partes.join('\n\n');
}
function abrirPrompt(titulo, subtitulo, texto) {
  dlg.className = 'dlg largo';
  dlg.innerHTML = `<div class="dlg-form">
    <div class="dlg-cab"><div><h2 id="dlg-titulo">${esc(titulo)}</h2><p>${esc(subtitulo)}</p></div><button type="button" class="icone-btn" data-fechar aria-label="Fechar">${icone('x')}</button></div>
    <div class="dlg-corpo"><div class="campo largo"><div class="campo-linha"><label for="f-prompt">Prompt</label><span class="meta">Pode ajustar antes de copiar</span></div><textarea id="f-prompt" class="prompt" spellcheck="false">${esc(texto)}</textarea></div></div>
    <div class="dlg-rodape"><a class="btn" href="https://claude.ai/new" target="_blank" rel="noopener">${icone('fora')}Abrir o Claude</a><div class="dir"><button type="button" class="btn" data-fechar>Fechar</button><button type="button" class="btn primario" id="botao-copiar-prompt">${icone('copiar')}Copiar prompt</button></div></div>
  </div>`;
  $('#botao-copiar-prompt').addEventListener('click', () => copiarTexto($('#f-prompt').value, 'Prompt copiado. Cole numa conversa nova do Claude.', true));
  dlg.showModal();
}
async function copiarTexto(texto, mensagem, dentroDaJanela) {
  try { await navigator.clipboard.writeText(texto); toast(mensagem); }
  catch (_) {
    if (dentroDaJanela && $('#f-prompt')) { const area = $('#f-prompt'); area.focus(); area.select(); toast('Texto selecionado. Use copiar do seu aparelho.'); return; }
    abrirPrompt('Copie o texto', 'O texto já está selecionado. Use copiar do seu aparelho.', texto);
    const area = $('#f-prompt'); area.focus(); area.select();
  }
}

/* ---------- Cano do setor (aba Gargalos) ----------
   As tarefas do setor são bolinhas de luz correndo por um cano, da entrada até a entrega.
   Cada gargalo é um registro no cano, na ordem em que foi encontrado:
   - vermelho (aberto, proposta pronta ou apresentado): trava, as bolinhas se acumulam antes dele;
   - amarelo (em execução): passa devagar;
   - verde (resolvido): passa livre.
   Quando um gargalo vira "Resolvido", o registro solta um brilho verde e o fluxo volta a correr.
   É uma figura para o dono entender o problema; não mede nada. */
const CANO = { estado: new Map() };
const FLUXO_CANO = { trava: 0.06, melhora: 0.38, livre: 1 };
const estadoNoCano = (g) => { const s = situacaoDe(g); return s === 'Resolvido' ? 'livre' : s === 'Em execução' ? 'melhora' : 'trava'; };
function canoHTML(s) {
  const garg = gargalosDo(s.id).slice().sort((a, b) => String(a.criadoEm || '').localeCompare(String(b.criadoEm || '')) || String(a.id).localeCompare(String(b.id))).slice(0, 6);
  if (!garg.length) return '';
  const n = garg.length;
  const rotulos = garg.map((g, i) => {
    const est = estadoNoCano(g);
    const nome = { trava: 'travando', melhora: 'melhorando', livre: 'liberado' }[est];
    return `<span class="cano-rot ${est}" style="left:${((i + 1) / (n + 1) * 100).toFixed(2)}%"><b>${esc(String(g.titulo).length > 34 ? String(g.titulo).slice(0, 32) + '…' : g.titulo)}</b><i>${nome}</i></span>`;
  }).join('');
  const travando = garg.filter((g) => estadoNoCano(g) === 'trava').length;
  const resumo = travando ? `${plural(travando, 'ponto travando', 'pontos travando')} o fluxo do setor` : 'O fluxo do setor está correndo';
  return `<section class="cano" data-setor="${esc(s.id)}" data-gargalos="${esc(garg.map((g) => g.id + ':' + estadoNoCano(g)).join('|'))}" aria-label="${esc(resumo)}">
    <div class="cano-topo"><span class="rotulo">O fluxo do setor</span><span class="cano-resumo ${travando ? 'trava' : 'livre'}">${esc(resumo)}</span></div>
    <div class="cano-palco"><canvas></canvas><span class="cano-ponta e">Chega</span><span class="cano-ponta s">Sai pronto</span></div>
    <div class="cano-rotulos">${rotulos}</div>
  </section>`;
}
// Liga cada cano que está na tela (o estado das bolinhas continua de uma tela para outra)
function iniciarCanos() {
  document.querySelectorAll('.cano').forEach((el) => {
    if (el.dataset.ligado) return; el.dataset.ligado = '1';
    const setorId = el.dataset.setor;
    const nos = el.dataset.gargalos.split('|').filter(Boolean).map((x) => { const [id, est] = x.split(':'); return { id, est }; });
    let st = CANO.estado.get(setorId);
    if (!st) { st = { bolinhas: [], ultimo: 0, antes: {}, brilhos: [] }; CANO.estado.set(setorId, st); }
    // Registro que acabou de virar "livre": brilho verde
    nos.forEach((n, i) => { if (st.antes[n.id] && st.antes[n.id] !== 'livre' && n.est === 'livre') st.brilhos.push({ i, t: 0 }); st.antes[n.id] = n.est; });
    const tela = el.querySelector('canvas'); const ctx = tela.getContext('2d');
    const parado = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let W = 0, H = 0;
    const medir = () => { const r = tela.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1); W = r.width; H = r.height; tela.width = Math.round(W * dpr); tela.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    medir();
    const xNo = (i) => W * (i + 1) / (nos.length + 1);
    const ZONA = 26, VEL = 78, FOLGA = 8;
    const passo = (dt) => {
      // Entra uma tarefa nova de tempos em tempos, se tiver espaço na entrada
      st.ultimo += dt;
      const ultima = st.bolinhas[st.bolinhas.length - 1];
      if (st.ultimo > 0.22 && (!ultima || ultima.x > FOLGA + 2) && st.bolinhas.length < 220) { st.bolinhas.push({ x: 0, y: (Math.random() - 0.5) * 6, v: VEL }); st.ultimo = 0; }
      // Anda da frente para trás: ninguém passa a bolinha da frente
      for (let k = 0; k < st.bolinhas.length; k++) {
        const b = st.bolinhas[k];
        let fator = 1, perto = null;
        nos.forEach((n, i) => { const d = b.x - xNo(i); if (d > -ZONA && d < ZONA * 0.6) { fator = Math.min(fator, FLUXO_CANO[n.est]); perto = n.est; } });
        b.cor = perto === 'trava' ? 1 : perto === 'melhora' ? 0.5 : 0;
        const alvo = VEL * fator * (0.85 + Math.random() * 0.3);
        b.v += (alvo - b.v) * Math.min(1, dt * 6);
        let nx = b.x + b.v * dt;
        const frente = st.bolinhas[k - 1];
        if (frente && nx > frente.x - FOLGA) nx = Math.max(b.x, frente.x - FOLGA);
        b.x = nx;
      }
      st.bolinhas = st.bolinhas.filter((b) => b.x < W + 10);
      st.brilhos.forEach((x) => { x.t += dt; }); st.brilhos = st.brilhos.filter((x) => x.t < 1.6);
    };
    const desenhar = (t) => {
      ctx.clearRect(0, 0, W, H);
      const y = H * 0.5, esp = 22;
      // O cano
      const g = ctx.createLinearGradient(0, y - esp / 2, 0, y + esp / 2);
      g.addColorStop(0, '#34527f'); g.addColorStop(0.45, '#1a2f53'); g.addColorStop(1, '#2c4a76');
      ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(4, y - esp / 2, W - 8, esp, esp / 2); ctx.fill();
      ctx.strokeStyle = 'rgba(160,190,240,.35)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(10, y - esp / 2 + 3, W - 20, 2);
      // As tarefas
      st.bolinhas.forEach((b) => {
        const cor = b.cor > 0.8 ? '255,120,100' : b.cor > 0.3 ? '255,200,90' : '140,200,255';
        ctx.shadowColor = `rgba(${cor},.9)`; ctx.shadowBlur = 8; ctx.fillStyle = `rgb(${cor})`;
        ctx.beginPath(); ctx.arc(b.x, y + b.y * 0.6, 3.1, 0, Math.PI * 2); ctx.fill();
      });
      ctx.shadowBlur = 0;
      // Os registros (gargalos)
      nos.forEach((n, i) => {
        const x = xNo(i); const cor = n.est === 'trava' ? '#f0523f' : n.est === 'melhora' ? '#f0b429' : '#2fbf71';
        const pulso = n.est === 'trava' ? 1 + Math.sin(t * 4 + i) * 0.12 : 1;
        ctx.save(); ctx.translate(x, y);
        ctx.shadowColor = cor; ctx.shadowBlur = n.est === 'livre' ? 10 : 18;
        ctx.fillStyle = '#0d1b33'; ctx.strokeStyle = cor; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, 17 * pulso, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.shadowBlur = 0; ctx.strokeStyle = cor; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
        if (n.est === 'trava') { ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(6, 6); ctx.moveTo(6, -6); ctx.lineTo(-6, 6); ctx.stroke(); }
        else if (n.est === 'melhora') { ctx.beginPath(); ctx.arc(0, 0, 7, -Math.PI / 2, Math.PI); ctx.stroke(); }
        else { ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-2, 4.5); ctx.lineTo(6.5, -5); ctx.stroke(); }
        ctx.restore();
      });
      // Brilho de quando desentope
      st.brilhos.forEach((b) => { const x = xNo(b.i); const k = b.t / 1.6; ctx.strokeStyle = `rgba(47,191,113,${(1 - k).toFixed(3)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 18 + k * 60, 0, Math.PI * 2); ctx.stroke(); });
    };
    if (parado) { for (let k = 0; k < 400; k++) passo(1 / 30); desenhar(0); return; }
    let anterior = 0;
    const quadroCano = (agora) => {
      if (!el.isConnected) return;   // a tela mudou: este cano para (o estado fica guardado)
      const dt = Math.min(0.05, anterior ? (agora - anterior) / 1000 : 0.016); anterior = agora;
      if (tela.getBoundingClientRect().width !== W) medir();
      passo(dt); desenhar(agora / 1000);
      requestAnimationFrame(quadroCano);
    };
    requestAnimationFrame(quadroCano);
  });
}

/* ---------- RF Intelligence por voz ----------
   Microfone: usa o reconhecimento de voz do navegador (nem todo aparelho ou aplicativo libera;
   quando não libera, o painel avisa e sugere o ditado do teclado). A resposta pode ser lida em voz alta.
   O orbe mostra o estado: ouvindo (azul), pensando (laranja girando), falando (verde pulsando). */
const Reconhecimento = window.SpeechRecognition || window.webkitSpeechRecognition;
let reconhecedor = null;
function vozDisponivel() { return !!Reconhecimento; }
function mostrarVoz(estado, texto) {
  UI.voz = estado ? Object.assign(UI.voz || {}, { estado, texto: texto == null ? (UI.voz && UI.voz.texto) || '' : texto }) : null;
  const painel = document.getElementById('voz-painel');
  if (!painel) return;
  painel.hidden = !UI.voz;
  if (!UI.voz) return;
  painel.querySelector('.orbe').className = 'orbe ' + UI.voz.estado;
  painel.querySelector('.voz-estado').textContent = { ouvindo: 'Ouvindo…', pensando: 'Pensando…', falando: 'Falando' }[UI.voz.estado] || '';
  painel.querySelector('.voz-texto').textContent = UI.voz.texto || (UI.voz.estado === 'ouvindo' ? 'Pode falar a sua pergunta.' : '');
}
/* Modo ditado: quando a página não pode usar o microfone (no Claude, por exemplo), o orbe fica ouvindo
   a caixa de pergunta. Você dita pelo ditado do aparelho (no Mac: Control duas vezes ou a tecla do
   microfone) e, quando para de falar, a pergunta vai sozinha e a resposta é falada. */
let vigiaDitado = null;
const PAUSA_DITADO = 2200;   // tempo sem texto novo para considerar que você terminou de falar
function modoDitado(suaVez) {
  if (!suaVez) pararFala();
  UI.conversaVoz = true;
  UI.voz = { estado: 'ouvindo', texto: '', ditado: true };
  const noMac = /Mac/i.test(navigator.platform || navigator.userAgent) && !('ontouchend' in document);
  mostrarVoz('ouvindo', suaVez ? (noMac ? 'Sua vez. Se o ditado desligou, aperte Control duas vezes.' : 'Sua vez. Toque no microfone do teclado para responder.') : (noMac ? 'Aperte Control duas vezes (o ditado do Mac) e fale. Quando você parar, eu respondo.' : 'Toque no microfone do teclado e fale. Quando você parar, eu respondo.'));
  const caixa = $('#ia-pergunta'); if (caixa) { caixa.value = ''; caixa.focus(); }
}
function ditadoMudou(caixa) {
  if (!UI.voz || !UI.voz.ditado || UI.voz.estado !== 'ouvindo') return;
  const texto = caixa.value.trim();
  const el = document.querySelector('#voz-painel .voz-texto'); if (el) el.textContent = texto || 'Pode falar.';
  clearTimeout(vigiaDitado);
  if (!texto) return;
  vigiaDitado = setTimeout(() => {
    if (!UI.voz || !UI.voz.ditado || UI.voz.estado !== 'ouvindo') return;
    const pergunta = ($('#ia-pergunta') || {}).value || texto;
    UI.voz = { estado: 'pensando', texto: pergunta.trim(), porVoz: true };
    perguntarIA(pergunta.trim());
  }, PAUSA_DITADO);
}
function ouvirPergunta() {
  if (UI.iaPensando) return;
  if (!vozDisponivel() || UI.vozBloqueada) { modoDitado(); return; }
  pararFala();
  try {
    reconhecedor = new Reconhecimento(); reconhecedor.lang = 'pt-BR'; reconhecedor.interimResults = true; reconhecedor.continuous = false;
    let final = '';
    // Se o aparelho não responder em alguns segundos (alguns aplicativos fingem que ouvem), desiste e avisa
    let ouviuAlgo = false;
    const vigia = setTimeout(() => { if (!ouviuAlgo && reconhecedor && !(UI.voz && UI.voz.ditado)) { try { reconhecedor.abort(); } catch (x) { /* nada */ } reconhecedor = null; mostrarVoz(null); toast('O microfone não respondeu aqui. Toque na caixa de pergunta e use o microfone do teclado.'); } }, 9000);
    reconhecedor.onresult = (ev) => {
      ouviuAlgo = true;
      let parcial = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) { const r = ev.results[i]; if (r.isFinal) final += r[0].transcript; else parcial += r[0].transcript; }
      mostrarVoz('ouvindo', (final + ' ' + parcial).trim());
    };
    reconhecedor.onerror = (ev) => {
      const msg = { 'not-allowed': 'O microfone não foi liberado. Libere o microfone para esta página, ou use o ditado do teclado.', 'service-not-allowed': 'Este aplicativo não libera o reconhecimento de voz. Use o ditado do teclado.', network: 'O reconhecimento de voz não está disponível aqui. Use o ditado do teclado.', 'no-speech': 'Não ouvi nada. Toque no microfone e fale de novo.', 'audio-capture': 'Não achei um microfone neste aparelho.' }[ev.error];
      final = '';
      // Microfone bloqueado (como dentro do Claude): passa para o modo ditado, sem erro na tela
      if (['not-allowed', 'service-not-allowed', 'network'].includes(ev.error)) { UI.vozBloqueada = true; reconhecedor = null; modoDitado(); return; }
      if (msg) toast(msg, ev.error === 'no-speech' ? '' : 'erro');
      mostrarVoz(null);
    };
    reconhecedor.onend = () => {
      clearTimeout(vigia); reconhecedor = null;
      if (UI.voz && UI.voz.ditado) return;   // já passou para o modo ditado
      const pergunta = final.trim();
      if (!pergunta) { if (UI.voz && UI.voz.estado === 'ouvindo') mostrarVoz(null); return; }
      UI.voz = { estado: 'pensando', texto: pergunta, porVoz: true };
      perguntarIA(pergunta);
    };
    mostrarVoz('ouvindo', '');
    reconhecedor.start();
  } catch (x) { mostrarVoz(null); toast('Não deu para usar o microfone aqui. Use o ditado do teclado.', 'erro'); }
}
// Texto falado: sem marcações, sem gráfico e sem tabela
function textoParaFala(texto) {
  return textoLimpo(texto).split('\n').map((l) => l.trim().replace(/^[-•]\s+/, '').replace(/^\d+[.)]\s+/, '')).filter((l) => l && !/^\|/.test(l) && !/:\s.*\d.*;/.test(l)).join('. ').replace(/\s+/g, ' ').replace(/([.!?:])\./g, '$1').trim();
}
/* Fala em voz alta, de um jeito que não trava:
   - o texto vai em pedaços (frase por frase): alguns navegadores cortam falas longas no meio;
   - enquanto fala, um "cutucão" a cada 10 s evita que o navegador pause sozinho;
   - se a fala não começar em 2,5 s, cancela e tenta de novo com a voz padrão do aparelho. */
let falaAtual = 0;
function falarTexto(texto, ao) {
  ao = ao || {};
  if (!window.speechSynthesis || !texto) { if (ao.fim) ao.fim(); return; }
  const id = ++falaAtual;
  try { speechSynthesis.cancel(); } catch (x) { /* nada */ }
  const pedacos = String(texto).match(/[^.!?;]+[.!?;]*|[.!?;]+/g) || [texto];
  const juntos = []; pedacos.forEach((p) => { const s = p.trim(); if (!s) return; if (juntos.length && (juntos[juntos.length - 1] + ' ' + s).length < 180) juntos[juntos.length - 1] += ' ' + s; else juntos.push(s); });
  let i = 0, comecou = false, tentouDeNovo = false, cutucao = null;
  const terminar = () => { clearInterval(cutucao); if (id === falaAtual && ao.fim) ao.fim(); };
  const proximo = (semVoz) => {
    if (id !== falaAtual) return;
    if (i >= juntos.length) { terminar(); return; }
    const f = new SpeechSynthesisUtterance(juntos[i]); f.lang = 'pt-BR'; f.rate = 1.04;
    const v = semVoz ? null : vozEscolhida(); if (v) f.voice = v;
    f.onstart = () => { if (!comecou) { comecou = true; if (ao.comecou) ao.comecou(); } };
    f.onboundary = () => { if (ao.bateu) ao.bateu(); };
    f.onend = () => { i++; proximo(semVoz); };
    f.onerror = (ev) => { if (ev && (ev.error === 'interrupted' || ev.error === 'canceled')) return; i++; proximo(semVoz); };
    try { speechSynthesis.resume(); } catch (x) { /* nada */ }
    speechSynthesis.speak(f);
  };
  setTimeout(() => {
    proximo(false);
    cutucao = setInterval(() => { try { if (speechSynthesis.speaking) { speechSynthesis.pause(); speechSynthesis.resume(); } } catch (x) { /* nada */ } }, 10000);
    // Não começou? A voz escolhida pode estar com problema: tenta com a padrão
    setTimeout(() => { if (id === falaAtual && !comecou && !tentouDeNovo) { tentouDeNovo = true; try { speechSynthesis.cancel(); } catch (x) { /* nada */ } i = 0; proximo(true); } }, 2500);
  }, 150);
}
function falar(texto) {
  if (!window.speechSynthesis || !texto) { mostrarVoz(null); return; }
  falarTexto(textoParaFala(texto), {
    comecou: () => mostrarVoz('falando', 'Toque no orbe para parar.'),
    bateu: () => { const o = document.querySelector('#voz-painel .orbe'); if (o) { o.classList.remove('bate'); void o.offsetWidth; o.classList.add('bate'); } },
    // Na conversa por voz, quando ela termina de falar, volta a ouvir você (até você tocar em Parar)
    fim: () => { if (UI.conversaVoz) modoDitado(true); else mostrarVoz(null); }
  });
}
// Vozes em português do aparelho. As "locais" (instaladas no aparelho) vêm primeiro: algumas vozes
// de internet aparecem na lista, mas ficam mudas dentro de aplicativos como o do Claude.
function vozesEmPortugues() {
  if (!window.speechSynthesis) return [];
  const todas = speechSynthesis.getVoices().filter((v) => /^pt/i.test(v.lang));
  const nota = (v) => (v.localService ? 0 : 10) + (/pt[-_]BR/i.test(v.lang) ? 0 : 5) + (/Luciana|Francisca|Thalita|Melhorad|Enhanced|Premium/i.test(v.name) ? 0 : 2);
  return todas.sort((a, b) => nota(a) - nota(b));
}
function vozEscolhida() {
  const lista = vozesEmPortugues(); if (!lista.length) return null;
  let nome = UI.vozNome; if (!nome) { try { nome = localStorage.getItem('rf-voz') || ''; } catch (x) { nome = ''; } }
  return lista.find((v) => v.name === nome) || lista[0];
}
function seletorDeVoz() {
  const lista = vozesEmPortugues(); if (lista.length < 2) return '';
  const atual = vozEscolhida();
  return `<label class="ia-falar">Voz <select id="ia-voz-nome">${lista.map((v) => `<option value="${esc(v.name)}" ${atual && atual.name === v.name ? 'selected' : ''}>${esc(v.name.replace(/\s*\(.*\)\s*$/, ''))}${v.localService ? '' : ' (internet)'}</option>`).join('')}</select></label>`;
}
try { if (window.speechSynthesis && speechSynthesis.addEventListener) speechSynthesis.addEventListener('voiceschanged', () => { if (rotaAtual().v === 'ia' && !UI.voz) render(); }); } catch (x) { /* sem lista de vozes */ }
function pararFala() { falaAtual++; try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (x) { /* nada */ } }
function pararVoz() { clearTimeout(vigiaDitado); UI.conversaVoz = false; if (reconhecedor) { try { reconhecedor.abort(); } catch (x) { /* nada */ } reconhecedor = null; } pararFala(); mostrarVoz(null); }
function painelVozHTML() {
  return `<div class="voz-painel" id="voz-painel" ${UI.voz ? '' : 'hidden'}><button type="button" class="orbe-botao" data-acao="vozParar" aria-label="Parar"><span class="orbe ${UI.voz ? UI.voz.estado : ''}"><i></i><i></i><i></i></span></button>`
    + `<div class="voz-txt"><b class="voz-estado">${UI.voz ? esc({ ouvindo: 'Ouvindo…', pensando: 'Pensando…', falando: 'Falando' }[UI.voz.estado] || '') : ''}</b><p class="voz-texto">${UI.voz ? esc(UI.voz.texto || '') : ''}</p></div><button type="button" class="btn peq fantasma" data-acao="vozParar">Parar</button></div>`;
}

/* ---------- Comando de voz do painel ----------
   Um botão fixo (ou Ctrl/⌘ + K) abre a barra de comando. Você fala (pelo ditado do aparelho)
   ou escreve, e o painel entende sozinho, sem IA, comandos como:
   "mostra a Elson's" · "abrir a Elson's" · "setor logística" · "gargalos do comercial"
   "apresentar a Elson's" · "quais setores estão críticos?" · "qual a nota da Elson's?"
   "biblioteca" · "início" · "visão geral" · "deixa de noite" / "dia" / "entardecer".
   O que não for comando vira pergunta para a RF Intelligence, que responde falando. */
const normalCmd = (s) => normal(s).replace(/['’`´]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const PARADAS_CMD = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'ltda', 'me', 'sa', 'eireli', 'produtos', 'alimenticios', 'comercio', 'industria', 'servicos', 'empresa', 'grupo', 'setor', 'the']);
const palavrasDoNome = (nome) => normalCmd(nome).split(' ').filter((p) => p.length >= 3 && !PARADAS_CMD.has(p));
function nomeBate(texto, nome) {
  const ps = palavrasDoNome(nome); if (!ps.length) return 0;
  const t = ' ' + texto + ' ';
  return ps.reduce((n, p) => n + (t.includes(' ' + p + ' ') || t.includes(' ' + p.slice(0, Math.max(4, p.length - 1))) ? p.length : 0), 0);
}
function acharEmpresa(texto) {
  let melhor = null, nota = 0;
  empresasAtivas().forEach((e) => { const n = nomeBate(texto, e.nome); if (n > nota) { nota = n; melhor = e; } });
  return melhor;
}
function acharSetor(texto, empresaId) {
  let melhor = null, nota = 0;
  S.setores.filter((s) => !empresaId || s.empresaId === empresaId).forEach((s) => { const n = nomeBate(texto, s.nome); if (n > nota) { nota = n; melhor = s; } });
  return melhor;
}
const nomeCurto = (e) => String(e.nome || '').replace(/\s+(Produtos|Ltda|LTDA|S\/A|SA|ME|Eireli).*$/i, '').trim() || e.nome;
function irPara(hash) { if (location.hash.slice(1) === hash) render(true); else location.hash = hash; }
// Entende o texto e devolve { fala, fazer() }. Comando que não é navegação vira pergunta para a IA.
function interpretarComando(bruto) {
  const t = normalCmd(bruto);
  const atual = empresaDaRota(rotaAtual());
  const e = acharEmpresa(t) || null;
  const empresa = e || empresaPorId(atual);
  const rotaAgora = rotaAtual();
  const setorDaTela = rotaAgora.v === 'setor' ? setorPorId(rotaAgora.id) : null;
  const s = acharSetor(t, e ? e.id : (atual || '')) || (/(esse|este|desse|deste|nesse|neste) setor|aqui/.test(t) || (setorDaTela && /^(transforma|pior|gargal|oportunid|o que eu vi|diagnost|apresent)/.test(t)) ? setorDaTela : null);
  if (!t) return null;
  // No setor: transformar o que você viu em gargalos, e o pior critério do diagnóstico
  const sAqui = s || setorDaTela;
  if (/transforma/.test(t) && sAqui) return { fala: `Lendo as anotações de ${sAqui.nome}.`, fazer: () => { irPara('sv-' + sAqui.id); setTimeout(() => transformarEmGargalos(sAqui.id), 500); } };
  if (/pior crit|mais fraco|onde (mais )?trava|pior ponto/.test(t) && sAqui) {
    const d = diagnosticoDe(sAqui); const x = d.criticos[0] || d.atencao[0];
    return { fala: x ? `O ponto mais fraco de ${sAqui.nome} é: ${x.texto}. Resposta: ${x.r === 'nao' ? 'não' : 'em parte'}.` : `${sAqui.nome} não tem critério reprovado no diagnóstico.`, fazer: () => irPara('s-' + sAqui.id) };
  }
  if (/^(fechar|cancelar|nada|deixa pra la)$/.test(t)) return { fala: '', fazer: () => {} };
  if (/recentr|visao geral|ver todas|todas as empresas|ver tudo/.test(t)) return { fala: 'Visão geral do campo.', fazer: () => { irPara('inicio'); setTimeout(() => { if (typeof recentrarCampo === 'function' && CAMPO.iniciado) recentrarCampo(); }, 300); } };
  if (/(deixa|muda|coloca|modo|fica|quero)\b.*\b(noite|dia|entardecer|por do sol|automatico)|^(noite|dia|entardecer|por do sol)$/.test(t)) {
    const p = /noite/.test(t) ? 'noite' : /entardecer|por do sol/.test(t) ? 'entardecer' : /automatico/.test(t) ? '' : 'dia';
    return { fala: p ? `Pronto, ${PERIODOS[p].nome.toLowerCase()} no campo.` : 'O céu volta a seguir o relógio.', fazer: () => { CAMPO.horaManual = p; irPara('inicio'); } };
  }
  if (/apresent/.test(t)) {
    if (!empresa) return { fala: 'Qual empresa você quer apresentar?', ficar: true, fazer: () => {} };
    return { fala: `Começando a apresentação da ${nomeCurto(empresa)}.`, fazer: () => irPara('ap-' + empresa.id) };
  }
  if (/critic|vermelh|pior(es)?\b|preocup|pegando fogo/.test(t) && !/^(abr|mostr)/.test(t)) {
    const lista = [];
    (e ? [e] : empresasAtivas()).forEach((x) => checkupDa(x.id).setores.forEach(({ s: st, d }) => { if (d.saude === 'critico') lista.push({ st, x }); }));
    if (!lista.length) return { fala: e ? `A ${nomeCurto(e)} não tem setor crítico agora.` : 'Nenhum setor crítico agora.', fazer: () => {} };
    const nomes = lista.slice(0, 4).map(({ st, x }) => e || empresasAtivas().length === 1 ? st.nome : `${st.nome} da ${nomeCurto(x)}`);
    const fala = `${lista.length === 1 ? 'Tem um setor crítico' : `Tem ${lista.length} setores críticos`}: ${nomes.join(', ').replace(/, ([^,]*)$/, ' e $1')}.`;
    return { fala, fazer: () => mostrarIlha(lista[0].x.id) };
  }
  if (/\bnota\b|check ?up|como (esta|ta)\b/.test(t) && !s) {
    if (!empresa) return { fala: 'De qual empresa?', ficar: true, fazer: () => {} };
    const ck = checkupDa(empresa.id);
    const fala = ck.nota == null ? `A ${nomeCurto(empresa)} ainda não tem nota do check-up.` : `A nota do check-up da ${nomeCurto(empresa)} é ${ck.nota}.`;
    return { fala, fazer: () => irPara('ck-' + empresa.id) };
  }
  if (/biblioteca|galaxia|solucoes/.test(t)) {
    const busca = (t.match(/(?:busca|procura|procurar|buscar)\s+(?:por\s+)?(.+)$/) || [])[1] || '';
    return { fala: busca ? `Procurando ${busca} na biblioteca.` : 'Abrindo a biblioteca de soluções.', fazer: () => { UI.bibBusca = busca; irPara('biblioteca'); } };
  }
  if (/^(ir pro |ir para o |volta(r)? (pro|para o|ao) )?(inicio|tela inicial|campo|home|comeco)$/.test(t)) return { fala: '', fazer: () => irPara('inicio') };
  if (/(ajustes|configurac)/.test(t)) return { fala: '', fazer: () => irPara('ajustes') };
  const ehPergunta = /\?|^(por que|porque|como|o que|qual|quais|quanto|me (de|da|fala|explica|apresent|ajud)|sugere|sugira|ideias?|me ajuda)/.test(t) || t.split(' ').length > 7;
  if (s && !ehPergunta) {
    const aba = /gargal/.test(t) ? 'sg-' : /oportunid/.test(t) ? 'so-' : /(o que eu vi|anotac|visita|foto|audio)/.test(t) ? 'sv-' : 's-';
    const emp = empresaPorId(s.empresaId) || {};
    return { fala: `Abrindo ${s.nome} da ${nomeCurto(emp)}.`, fazer: () => irPara(aba + s.id) };
  }
  if (e && !ehPergunta) {
    if (/(mostr|onde|cade|ilha|ver a|ver o)/.test(t) && campoDisponivel()) return { fala: `Aqui está a ${nomeCurto(e)}.`, fazer: () => mostrarIlha(e.id) };
    return { fala: `Abrindo a ${nomeCurto(e)}.`, fazer: () => irPara('e-' + e.id) };
  }
  // Pergunta: vai para a RF Intelligence, já com a empresa e o setor do contexto, e a resposta vem falada
  return { fala: '', fazer: () => {
    UI.iaCtx = { empresaId: (s && s.empresaId) || (empresa && empresa.id) || '', setorId: s ? s.id : '', gargaloId: '' };
    UI.iaRota = location.hash || '#ia';
    UI.voz = { estado: 'pensando', texto: bruto, porVoz: true };
    irPara('ia');
    setTimeout(() => perguntarIA(bruto), 120);
  } };
}
// No Início, a câmera voa até a ilha e abre a plaquinha dela
function mostrarIlha(id) {
  if (!campoDisponivel()) { irPara('e-' + id); return; }
  const voar = () => { const il = CAMPO.ilhas && CAMPO.ilhas.get(id); if (!il) return; CAMPO.escolhida = id; animarCamera(Object.assign(visaoDaIlha(il), { raio: visaoDaIlha(il).raio * 1.9, phi: 0.92 }), 1400); };
  if (rotaAtual().v !== 'inicio') { location.hash = 'inicio'; setTimeout(voar, 700); } else voar();
}
// Fala curta do comando (não mexe no orbe da RF Intelligence)
function dizer(texto) { if (texto) falarTexto(texto); }
const CMD = { aberto: false, digitou: 0, vigia: null };
// Sugestões da barra de comando: mudam conforme a tela em que você está
function exemplosDoComando() {
  const r = rotaAtual(); const emp = empresasAtivas(); const e = empresaPorId(empresaDaRota(r)) || emp[0];
  const nome = e ? nomeCurto(e) : '';
  if (r.v === 'setor') { const s = setorPorId(r.id) || {}; return ['Transformar o que eu vi em gargalos', 'Qual o pior critério?', `Gargalos de ${s.nome || 'esse setor'}`, 'Me dá ideias para esse setor', 'Apresentar essa empresa', 'Voltar ao início']; }
  if (['empresa', 'checkup', 'questionario'].includes(r.v)) { const st = e ? setoresDa(e.id) : []; return [`Qual a nota da ${nome}?`, st[0] ? `Setor ${st[0].nome}` : 'Quais setores estão críticos?', 'Quais setores estão críticos?', 'Apresentar essa empresa', `Me prepara para a reunião com a ${nome}`, 'Visão geral']; }
  if (r.v === 'ia') return ['Ver em números', 'Causas prováveis desse gargalo', 'Abrir a biblioteca', 'Voltar ao início'];
  if (r.v === 'biblioteca') return ['Procura conferência', 'Procura planilha', 'Voltar ao início', 'Quais setores estão críticos?'];
  return [nome ? `Mostra a ${nome}` : 'Visão geral', 'Quais setores estão críticos?', nome ? `Apresentar a ${nome}` : 'Apresentar', 'Deixa de noite', 'Biblioteca', 'Me dá ideias para o pior gargalo'];
}
function criarComando() {
  const botao = document.createElement('button'); botao.className = 'cmd-botao'; botao.type = 'button'; botao.title = 'Comando de voz (Ctrl + K)'; botao.setAttribute('aria-label', 'Comando de voz');
  botao.innerHTML = `<span class="orbe mini"><i></i><i></i><i></i></span>`;
  botao.addEventListener('click', () => (CMD.aberto ? fecharComando() : abrirComando()));
  const barra = document.createElement('div'); barra.className = 'cmd-barra'; barra.hidden = true;
  const noMac = /Mac/i.test(navigator.platform || navigator.userAgent) && !('ontouchend' in document);
  barra.innerHTML = `<div class="cmd-caixa"><span class="orbe" id="cmd-orbe"><i></i><i></i><i></i></span>
      <div class="cmd-meio"><span class="cmd-estado" id="cmd-estado">${noMac ? 'Aperte Control duas vezes e fale, ou escreva' : 'Toque no microfone do teclado e fale, ou escreva'}</span>
        <input id="cmd-texto" autocomplete="off" placeholder="Ex.: mostra a Elson's · setor logística · quais setores estão críticos?" aria-label="Comando"></div>
      <button type="button" class="cmd-fechar" aria-label="Fechar">${icone('x')}</button></div>
    <div class="cmd-exemplos"></div>`;
  document.body.append(botao, barra);
  CMD.botao = botao; CMD.barra = barra; CMD.texto = barra.querySelector('#cmd-texto');
  barra.querySelector('.cmd-fechar').addEventListener('click', fecharComando);
  barra.addEventListener('click', (ev) => { const b = ev.target.closest('[data-cmd]'); if (b) executarComando(b.dataset.cmd); });
  CMD.texto.addEventListener('keydown', (ev) => {
    CMD.digitou = performance.now();
    if (ev.key === 'Enter') { ev.preventDefault(); executarComando(CMD.texto.value); }
    if (ev.key === 'Escape') { ev.preventDefault(); fecharComando(); }
  });
  // Texto que chega sem tecla apertada é o ditado: quando a fala para, o comando roda sozinho
  CMD.texto.addEventListener('input', () => {
    clearTimeout(CMD.vigia);
    if (performance.now() - CMD.digitou < 500 || !CMD.texto.value.trim()) return;
    estadoComando('ouvindo', CMD.texto.value);
    CMD.vigia = setTimeout(() => executarComando(CMD.texto.value), 1700);
  });
  document.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'k' || ev.key === 'K')) { ev.preventDefault(); CMD.aberto ? fecharComando() : abrirComando(); }
  });
}
function estadoComando(estado, texto) {
  const o = document.getElementById('cmd-orbe'); if (o) o.className = 'orbe ' + (estado || '');
  const el = document.getElementById('cmd-estado'); if (el && texto != null) el.textContent = texto;
}
function abrirComando() {
  if (!CMD.barra) return;
  CMD.aberto = true; CMD.barra.hidden = false; CMD.botao.classList.add('ligado');
  CMD.texto.value = ''; estadoComando('ouvindo', null); setTimeout(() => CMD.texto.focus(), 30);
  CMD.barra.querySelector('.cmd-exemplos').innerHTML = exemplosDoComando().map((x) => `<button type="button" data-cmd="${esc(x)}">${esc(x)}</button>`).join('');
}
function fecharComando() {
  if (!CMD.barra) return;
  clearTimeout(CMD.vigia); CMD.aberto = false; CMD.barra.hidden = true; CMD.botao.classList.remove('ligado');
  const noMac = /Mac/i.test(navigator.platform || navigator.userAgent) && !('ontouchend' in document);
  estadoComando('', noMac ? 'Aperte Control duas vezes e fale, ou escreva' : 'Toque no microfone do teclado e fale, ou escreva');
}
function executarComando(texto) {
  clearTimeout(CMD.vigia);
  const r = interpretarComando(texto || '');
  if (!r) return;
  estadoComando('pensando', r.fala || 'Entendido.');
  try { r.fazer(); } catch (x) { console.warn(x); }
  if (r.fala) dizer(r.fala);
  if (r.ficar) { CMD.texto.value = ''; estadoComando('ouvindo', r.fala); setTimeout(() => CMD.texto.focus(), 30); return; }
  setTimeout(fecharComando, r.fala ? 1400 : 300);
}

/* ---------- 11. Formulários ---------- */
const dlg = $('#dlg');
dlg.addEventListener('close', () => { if (controleIA) { controleIA.abort(); controleIA = null; } dlg.className = 'dlg'; });
dlg.addEventListener('click', (ev) => { if (ev.target === dlg) dlg.close(); });

function htmlCampo(c) {
  const id = 'f-' + c.id;
  const ajuda = c.ajuda ? `<span class="ajuda">${c.ajuda}</span>` : '';
  const largo = c.largo ? ' largo' : '';
  const valor = c.valor == null ? '' : c.valor;
  if (c.tipo === 'area') return `<div class="campo largo"><div class="campo-linha"><label for="${id}">${esc(c.rotulo)}</label>${c.botao || ''}</div><textarea id="${id}" rows="${c.linhas || 4}" placeholder="${esc(c.exemplo || '')}">${esc(valor)}</textarea>${ajuda}</div>`;
  if (c.tipo === 'escolha') return `<div class="campo${largo}"><label for="${id}">${esc(c.rotulo)}</label><select id="${id}">${c.vazio !== false ? `<option value="">${esc(c.vazio || 'Nenhuma')}</option>` : ''}${c.opcoes.map((o) => { const v = typeof o === 'object' ? o.v : o; const t = typeof o === 'object' ? o.t : o; return `<option value="${esc(v)}" ${String(v) === String(valor) ? 'selected' : ''}>${esc(t)}</option>`; }).join('')}</select>${ajuda}</div>`;
  if (c.tipo === 'logo') return `<div class="campo largo"><span class="rotulo-campo">${esc(c.rotulo)}</span><div class="logo-campo"><span class="logo-previa" id="f-logo-previa">${c.valor ? `<img src="${esc(c.valor)}" alt="Logo atual">` : '<span>Sem logo</span>'}</span><label class="btn peq" for="f-logo-arquivo">${icone('camera')}Escolher imagem</label><input type="file" id="f-logo-arquivo" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden><button type="button" class="btn peq fantasma" id="f-logo-tirar" ${c.valor ? '' : 'hidden'}>Tirar</button></div>${ajuda}</div>`;
  const tipoInput = c.tipo === 'data' ? 'date' : 'text';
  return `<div class="campo${largo}"><label for="${id}">${esc(c.rotulo)}</label><input type="${tipoInput}" id="${id}" value="${esc(valor)}" placeholder="${esc(c.exemplo || '')}">${ajuda}</div>`;
}
function lerCampos(campos) { const v = {}; campos.forEach((c) => { const el = dlg.querySelector('#f-' + c.id); v[c.id] = el ? el.value.trim() : ''; }); return v; }

function abrirFormulario({ titulo, subtitulo, campos, rotuloSalvar, aoSalvar, aoExcluir, rotuloExcluir, aoAbrir }) {
  dlg.className = 'dlg';
  dlg.innerHTML = `<form class="dlg-form" id="dlg-form" novalidate>
    <div class="dlg-cab"><div><h2 id="dlg-titulo">${esc(titulo)}</h2>${subtitulo ? `<p>${esc(subtitulo)}</p>` : ''}</div><button type="button" class="icone-btn" data-fechar aria-label="Fechar">${icone('x')}</button></div>
    <div class="dlg-corpo">${campos.map(htmlCampo).join('')}<p class="erro-form" id="erro-form" hidden></p></div>
    <div class="dlg-rodape">${aoExcluir ? `<button type="button" class="btn perigo" id="botao-excluir">${icone('lixo')}${esc(rotuloExcluir || 'Excluir')}</button>` : ''}<div class="dir"><button type="button" class="btn" data-fechar>Cancelar</button><button type="submit" class="btn primario" id="botao-salvar">${esc(rotuloSalvar || 'Salvar')}</button></div></div>
  </form>`;
  const erro = $('#erro-form');
  $('#dlg-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const valores = lerCampos(campos);
    const faltando = campos.filter((c) => c.obrigatorio && !valores[c.id]);
    if (faltando.length) { erro.textContent = 'Preencha: ' + faltando.map((c) => c.rotulo).join(', ') + '.'; erro.hidden = false; return; }
    const botao = $('#botao-salvar'); botao.disabled = true; botao.textContent = 'Salvando…';
    try { await aoSalvar(valores); if (dlg.open) dlg.close(); toast('Salvo.'); }
    catch (x) { erro.textContent = x.message || 'Não deu para salvar.'; erro.hidden = false; botao.disabled = false; botao.textContent = rotuloSalvar || 'Salvar'; }
  });
  if (aoExcluir) {
    $('#botao-excluir').addEventListener('click', () => {
      const b = $('#botao-excluir');
      if (b.dataset.confirmar !== '1') { b.dataset.confirmar = '1'; b.classList.add('cheio'); b.innerHTML = icone('lixo') + 'Confirmar exclusão'; return; }
      b.disabled = true;
      Promise.resolve(aoExcluir()).then(() => { if (dlg.open) dlg.close(); toast('Excluído.'); }).catch((x) => { erro.textContent = x.message || 'Não deu para excluir.'; erro.hidden = false; b.disabled = false; });
    });
  }
  dlg.showModal();
  if (aoAbrir) aoAbrir();
  const primeiro = dlg.querySelector('input[type=text], textarea, select');
  if (primeiro) setTimeout(() => primeiro.focus(), 30);
}

// Logo: guardada dentro do próprio cadastro da empresa, como imagem pequena (PNG, mantém o fundo
// transparente). Assim ela aparece em qualquer aparelho, sem depender de outro arquivo.
const logoDe = (e) => (e && (e.logo || (e.logoId ? srcAnexo(e.logoId) : ''))) || '';
function prepararLogo(arquivo) {
  return new Promise((ok, falha) => {
    const img = new Image(); const url = URL.createObjectURL(arquivo);
    img.onload = () => {
      const w0 = img.width || 600, h0 = img.height || 200;
      const gerar = (lado) => {
        const k = Math.min(1, lado / Math.max(w0, h0));
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/png');
      };
      let dados = gerar(480); if (dados.length > 150000) dados = gerar(300); if (dados.length > 150000) dados = gerar(200);
      URL.revokeObjectURL(url); ok(dados);
    };
    img.onerror = () => { URL.revokeObjectURL(url); falha(new Error('logo')); };
    img.src = url;
  });
}
function formEmpresa(e) {
  const nova = !e; const dados = e || {};
  let logoNova = null, tirarLogo = false;
  abrirFormulario({
    titulo: nova ? 'Nova empresa' : 'Editar empresa', subtitulo: nova ? 'Os dados da conversa com o dono.' : dados.nome,
    campos: [
      { id: 'nome', rotulo: 'Nome da empresa', valor: dados.nome, obrigatorio: true, largo: true },
      { id: 'segmento', rotulo: 'Segmento', valor: dados.segmento, exemplo: 'Ex.: distribuição de alimentos' },
      { id: 'cidade', rotulo: 'Cidade', valor: dados.cidade, exemplo: 'Ex.: Vitória/ES' },
      { id: 'contato', rotulo: 'Contato principal', valor: dados.contato, exemplo: 'Nome e telefone' },
    ].concat([{ id: 'logo', tipo: 'logo', rotulo: 'Logo da empresa', valor: logoDe(dados), ajuda: 'Aparece estampada na ilha da empresa, no campo do Início. PNG com fundo transparente fica melhor.' }]).concat([
      { id: 'inicio', rotulo: 'Início do diagnóstico', tipo: 'data', valor: dados.inicio || (nova ? hojeISO() : '') },
      { id: 'observacoes', rotulo: 'Observações', tipo: 'area', valor: dados.observacoes, linhas: 3 }
    ]).concat(nova ? [] : [{ id: 'arquivada', rotulo: 'Situação da empresa', tipo: 'escolha', opcoes: [{ v: '', t: 'Ativa' }, { v: 'sim', t: 'Arquivada (sai da tela inicial)' }], valor: dados.arquivada || '', vazio: false, largo: true }]),
    rotuloSalvar: nova ? 'Cadastrar empresa' : 'Salvar',
    aoAbrir: () => {
      const entrada = $('#f-logo-arquivo'); if (!entrada) return;
      const previa = $('#f-logo-previa'), tirar = $('#f-logo-tirar');
      entrada.addEventListener('change', async () => {
        const arq = entrada.files && entrada.files[0]; if (!arq) return;
        try { logoNova = await prepararLogo(arq); tirarLogo = false; previa.innerHTML = `<img src="${logoNova}" alt="Logo nova">`; tirar.hidden = false; }
        catch (x) { toast('Não deu para ler essa imagem. Tente um PNG ou JPG.', 'erro'); }
      });
      tirar.addEventListener('click', () => { logoNova = null; tirarLogo = true; previa.innerHTML = '<span>Sem logo</span>'; tirar.hidden = true; entrada.value = ''; });
    },
    aoSalvar: async (v) => {
      const id = nova ? novoId('e') : e.id;
      delete v.logo;
      if (logoNova) { v.logo = logoNova; v.logoId = ''; }
      else if (tirarLogo) { v.logo = ''; v.logoId = ''; }
      await gravar('empresas', id, Object.assign({}, nova ? { criadoEm: hojeISO() } : e, v));
      if (nova) location.hash = 'e-' + id;
    },
    aoExcluir: nova ? null : () => apagarEmpresaInteira(e.id), rotuloExcluir: 'Excluir empresa'
  });
}
async function apagarEmpresaInteira(id) {
  for (const col of ['conversas', 'gargalos', 'diario', 'setores']) for (const item of S[col].filter((x) => x.empresaId === id)) await apagarRegistro(col, item.id);
  await apagarRegistro('empresas', id);
  location.hash = 'inicio';
}
function formSetor(s, empresaId) {
  const e = empresaPorId(s ? s.empresaId : empresaId); if (!e) return;
  const dados = s || {};
  abrirFormulario({
    titulo: s ? 'Editar setor' : 'Novo setor', subtitulo: e.nome,
    campos: [
      { id: 'nome', rotulo: 'Nome do setor', valor: dados.nome, obrigatorio: true, exemplo: 'Ex.: Comercial' },
      { id: 'responsavel', rotulo: 'Responsável', valor: dados.responsavel, exemplo: 'Nome ou cargo' }
    ],
    aoSalvar: async (v) => { const id = s ? s.id : novoId('s'); await gravar('setores', id, Object.assign({}, dados, v, { empresaId: e.id })); if (!s) location.hash = 's-' + id; },
    aoExcluir: s ? async () => {
      if (itensDo(s.id).length || notasDo(s.id).length) throw new Error('Este setor tem anotações, gargalos ou oportunidades. Exclua-os antes de excluir o setor.');
      for (const m of S.conversas.filter((x) => x.setorId === s.id)) await apagarRegistro('conversas', m.id);
      await apagarRegistro('setores', s.id); location.hash = 'e-' + e.id;
    } : null, rotuloExcluir: 'Excluir setor'
  });
}
function formAjustes() {
  const c = S.config;
  abrirFormulario({
    titulo: 'Editar ajustes',
    campos: [
      { id: 'consultor', rotulo: 'Consultor responsável', valor: c.consultor, largo: true, ajuda: 'Aparece na saudação, no PDF e na assinatura.' },
      { id: 'whatsapp', rotulo: 'Seu WhatsApp, com DDD', valor: c.whatsapp, largo: true, exemplo: 'Ex.: 27 99999-9999', ajuda: 'As respostas do questionário remoto voltam para este número.' },
      { id: 'frente', rotulo: 'Nome da frente', valor: c.frente || nomeFrente(), largo: true, ajuda: '<b>Decisão dos sócios.</b> Aparece no menu e no PDF.' }
    ],
    aoSalvar: (v) => gravar('config', 'geral', Object.assign({}, c, v))
  });
}

/* ---------- 12. IA ---------- */
function mensagemErroIA(x) {
  const c = x && x.code;
  if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(c)) { ia = null; agendarRender(); return 'A IA não está liberada nesta visualização.'; }
  if (c === 'rate_limited') return 'Muitos pedidos seguidos ou limite de uso atingido. Espere um pouco e tente de novo.';
  if (c === 'session_expired') return 'Sua sessão expirou. Entre de novo no Claude.';
  if (c === 'invalid_json') return 'A resposta veio fora do formato esperado. Tente de novo.';
  if (c === 'prompt_too_large') return 'Tem anotação demais para mandar de uma vez. Tente com menos texto.';
  if (c === 'refused') return 'A IA não respondeu a este pedido.';
  return 'Não deu certo agora. Tente de novo em instantes.';
}
// Anotações do setor, da mais antiga para a mais nova, mais o texto que está na caixa e ainda não foi guardado
function anotacoesParaTransformar(s) {
  const comArquivos = (n) => [n.texto].concat((Array.isArray(n.anexos) ? n.anexos : []).filter((a) => a.tipo === 'arquivo').map((a) => `Arquivo anexado: ${a.nome}${a.pedido ? ` (pedido: ${textoPedido(a.pedido).toLowerCase()})` : ''}`)).filter(temTexto).join('\n');
  const lista = notasDo(s.id).slice().reverse().map((n) => ({ data: dataBR(n.data), texto: comArquivos(n) })).filter((n) => temTexto(n.texto));
  const caixa = document.getElementById('nova-nota');
  const rascunho = String((caixa && caixa.value) || (UI.rascunho || {})[s.id] || '').trim();
  if (rascunho) lista.push({ data: 'agora (ainda não guardada)', texto: rascunho });
  return lista;
}
function promptTransformar(s) {
  const e = empresaPorId(s.empresaId) || {};
  const dados = {
    empresa: e.nome, segmento: e.segmento || '', setor: s.nome,
    // A fonte é o que o consultor escreveu (inclusive o que está na caixa e ainda não foi guardado)
    anotacoes: anotacoesParaTransformar(s),
    // O diagnóstico só ajuda a entender; não vira gargalo sozinho
    apoio_do_diagnostico: diagnosticoDe(s).itens.filter((x) => x.r && x.r !== 'sim').map((x) => ({ pergunta: x.texto, resposta: x.r === 'nao' ? 'Não' : 'Em parte', o_que_foi_visto: x.ev })),
    gargalos_que_ja_existem: itensDo(s.id).map((g) => g.titulo)
  };
  return `Você é consultor da Real Forte Consultoria fazendo o diagnóstico de processos de uma empresa.
Abaixo estão as anotações de campo do consultor sobre o setor ${s.nome}. Transforme AS ANOTAÇÕES em gargalos e oportunidades.

Regras:
- A fonte é só "anotacoes". Cada gargalo ou oportunidade tem de sair de algo que está escrito nelas.
- "apoio_do_diagnostico" serve só para entender melhor o que foi anotado. Nunca crie um item só a partir dele.
- Um gargalo é algo que trava, se repete, gera erro ou toma tempo da equipe. Junte o que for o mesmo problema.
- Não invente números, nomes, sistemas ou fatos.
- Não repita o que já está em "gargalos_que_ja_existem".
- "titulo": curto, com as palavras do setor, até 8 palavras.
- "observacao": o que foi visto, fiel às anotações, em 1 a 3 frases.
- "proposta": o que o consultor pode propor, em 1 a 2 frases. Prefira soluções simples sobre planilhas, arquivos que o setor exporta, páginas simples ou IA, sem depender do sistema do cliente. Se a saída for mudar o processo ou cortar a tarefa, diga isso.
- "tipo": "gargalo" quando algo atrapalha, trava ou gera erro; "oportunidade" quando a pessoa disse que "poderia ter" ou "seria bom ter" algo (um painel, um relatório, um aviso) que não resolve um problema, mas ajudaria.
- Português do Brasil, frases curtas, sem jargão e sem inglês.

Responda só com um array JSON, neste formato:
[{"tipo":"gargalo","titulo":"...","observacao":"...","proposta":"..."}]

DADOS:
${JSON.stringify(dados, null, 1)}`;
}
function promptProposta(g) {
  const s = setorPorId(g.setorId) || {};
  const e = empresaPorId(g.empresaId) || {};
  const dados = {
    empresa: e.nome, segmento: e.segmento || '', setor: s.nome, [ehOport(g) ? 'oportunidade' : 'gargalo']: g.titulo, [ehOport(g) ? 'o_que_o_setor_pediu' : 'o_que_foi_observado']: g.observacao || '',
    outras_anotacoes_do_setor: notasDo(g.setorId).map((n) => n.texto)
  };
  return `Você é consultor da Real Forte Consultoria. Escreva, em 1 a 3 frases, ${ehOport(g) ? 'o que entregar ao setor para atender a oportunidade abaixo (não é um problema: é algo que o setor disse que poderia ter)' : 'o que propor ao cliente para resolver o gargalo abaixo'}.
Regras: use só o que está nos dados; prefira soluções simples sobre planilhas, arquivos que o setor exporta, páginas simples ou IA, sem depender do sistema do cliente; se a melhor saída for mudar o processo ou cortar a tarefa, diga isso; não invente números; português do Brasil, frases curtas, sem jargão e sem inglês.
Responda só com o texto da proposta.

DADOS:
${JSON.stringify(dados, null, 1)}`;
}
// Escreve a proposta dentro de um campo de texto, aparecendo enquanto a IA escreve
async function escreverPropostaComIA(g, area, botao) {
  if (!ia || !area) return;
  if (controleIA) { controleIA.abort(); return; }
  if (!temTexto(g.titulo)) { toast(ehOport(g) ? 'Escreva a oportunidade antes de pedir a proposta.' : 'Escreva o gargalo antes de pedir a proposta.'); return; }
  const anterior = area.value;
  controleIA = new AbortController();
  const rotulo = botao.innerHTML;
  botao.innerHTML = icone('parar') + 'Parar';
  area.value = 'Pensando…';
  try {
    const { text } = await ia(promptProposta(g), { signal: controleIA.signal, onText: ({ text }) => { area.value = text; } });
    area.value = text.trim();
  } catch (x) {
    area.value = x && x.text ? x.text : anterior;
    if (!(x && x.code === 'cancelled')) toast(mensagemErroIA(x), 'erro');
  } finally { controleIA = null; if (botao.isConnected) botao.innerHTML = rotulo; }
}
/* ---------- 13. PowerPoint da proposta ---------- */
// Versão sem IA: usa só o que está registrado no gargalo
function conteudoBasico(g) {
  const frases = (x) => String(x || '').split(/(?<=[.!?])\s+|\n+/).map((f) => f.trim()).filter(Boolean);
  const maiuscula = (f) => f.charAt(0).toUpperCase() + f.slice(1);
  const hoje = frases(g.observacao).map(maiuscula), prop = frases(g.proposta).map(maiuscula);
  return {
    titulo: g.titulo,
    frase_dor: hoje[0] || g.titulo,
    dores: (hoje.length > 1 ? hoje.slice(1, 4) : hoje).slice(0, 3),
    // Com mais de uma frase na proposta, cada frase vira um passo (sem título; o slide se ajusta)
    frase_melhoria: prop.length > 1 ? 'O que vamos entregar' : (prop[0] || ''),
    passos: prop.length > 1 ? prop.slice(0, 3).map((texto) => ({ titulo: '', texto })) : [],
    deixa_de_fazer: [], ganha: [],
    comparacao: [{ hoje: hoje[0] || g.titulo, depois: prop[0] || '' }],
    precisamos: ['O ok do responsável do setor', 'Os arquivos que o setor usa hoje'], pedido: 'Podemos seguir com essa melhoria?'
  };
}
// Garante que cada campo do conteúdo existe e tem o tipo certo, qualquer que seja a resposta da IA
function normalizarConteudo(c, g) {
  const base = conteudoBasico(g);
  const txt = (v, padrao) => (typeof v === 'string' && v.trim()) ? v.trim() : padrao;
  const lista = (v) => Array.isArray(v) ? v.map((x) => String(x || '').trim()).filter(Boolean) : [];
  const o = c && typeof c === 'object' ? c : {};
  const passos = Array.isArray(o.passos) ? o.passos.filter((p) => p && (p.titulo || p.texto)).map((p) => ({ titulo: String(p.titulo || '').trim(), texto: String(p.texto || '').trim() })) : [];
  const comparacao = Array.isArray(o.comparacao) ? o.comparacao.filter((p) => p && (p.hoje || p.depois)).map((p) => ({ hoje: String(p.hoje || '').trim(), depois: String(p.depois || '').trim() })) : [];
  return {
    titulo: txt(o.titulo, base.titulo), frase_dor: txt(o.frase_dor, base.frase_dor), dores: lista(o.dores).length ? lista(o.dores) : base.dores,
    frase_melhoria: txt(o.frase_melhoria, base.frase_melhoria), passos: passos.length ? passos : base.passos,
    deixa_de_fazer: lista(o.deixa_de_fazer), ganha: lista(o.ganha), comparacao: comparacao.length ? comparacao : base.comparacao,
    precisamos: lista(o.precisamos).length ? lista(o.precisamos) : base.precisamos, pedido: txt(o.pedido, base.pedido)
  };
}
function promptApresentacao(g) {
  const s = setorPorId(g.setorId) || {};
  const e = empresaPorId(g.empresaId) || {};
  const dados = { empresa: e.nome, segmento: e.segmento || '', setor: s.nome, responsavel: s.responsavel || '', [ehOport(g) ? 'oportunidade' : 'gargalo']: g.titulo, [ehOport(g) ? 'o_que_o_setor_pediu' : 'o_que_foi_observado']: g.observacao || '', proposta: g.proposta || '', anotacoes_do_setor: notasDo(g.setorId).map((n) => n.texto) };
  const avisoOport = ehOport(g) ? '\nIsto é uma oportunidade, não um problema: o setor disse que poderia ter isso. Em "frase_dor" e "dores", conte como é hoje sem essa melhoria e o que o setor pediu, sem inventar problema.' : '';
  return `Você vai preparar o conteúdo de uma apresentação curta, no formato de demo, para propor uma melhoria a um setor de uma empresa cliente da Real Forte Consultoria. Quem vai ler trabalha no setor: linguagem bem simples, sem jargão e sem inglês, frases curtas.
Regras: use só o que está nos dados. Não invente números, prazos, valores, nomes de pessoas ou sistemas. A melhoria é a da "proposta"; explique como o setor vai usar no dia a dia.${avisoOport}

Responda só com um objeto JSON neste formato:
{"titulo":"nome curto da melhoria, até 6 palavras",
"frase_dor":"a dor de hoje em uma frase de até 14 palavras",
"dores":["3 itens curtos do que acontece hoje, até 12 palavras cada"],
"frase_melhoria":"o que a melhoria faz, em uma frase de até 16 palavras",
"passos":[{"titulo":"até 4 palavras","texto":"até 16 palavras"}],
"deixa_de_fazer":["3 ou 4 coisas que o setor para de fazer, até 10 palavras cada"],
"ganha":["3 ou 4 ganhos no dia a dia, sem números, até 10 palavras cada"],
"comparacao":[{"hoje":"até 12 palavras","depois":"até 12 palavras"}],
"precisamos":["2 ou 3 coisas que precisamos do setor para começar"],
"pedido":"uma frase convidando o setor a aprovar, até 12 palavras"}
"passos" e "comparacao" têm exatamente 3 itens cada.

DADOS:
${JSON.stringify(dados, null, 1)}`;
}
function dadosApresentacao(g, c) {
  const s = setorPorId(g.setorId) || { nome: '' };
  const e = empresaPorId(g.empresaId) || { nome: '' };
  return { empresa: e.nome, setor: s.nome, consultor: nomeConsultor(), data: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }), c, logo: LOGO, oportunidade: ehOport(g) };
}
/* ---------- 14. Questionário remoto ----------
   A página do questionário é separada do painel (o cliente nunca vê o painel).
   O link leva a empresa, o setor e o WhatsApp do consultor depois do #, em base32
   (só letras e números). A página do questionário lê o mesmo formato. */
const ALFABETO_B32 = 'abcdefghijklmnopqrstuvwxyz234567';
function b32codificar(texto) {
  let valor = 0, bits = 0, saida = '';
  for (const b of new TextEncoder().encode(texto)) {
    valor = (valor << 8) | b; bits += 8;
    while (bits >= 5) { saida += ALFABETO_B32[(valor >> (bits - 5)) & 31]; bits -= 5; }
    valor &= (1 << bits) - 1;
  }
  if (bits > 0) saida += ALFABETO_B32[(valor << (5 - bits)) & 31];
  return saida;
}
// Número do WhatsApp do consultor só com dígitos e com o 55 do Brasil
function numeroWhats() {
  let n = String(S.config.whatsapp || '').replace(/\D/g, '');
  if (!n) return '';
  if (n.length <= 11) n = '55' + n;
  return n;
}
const semBarra = (t) => String(t || '').replace(/\|/g, '/').trim();
function linkQuestionario(e, s) { return `${QUESTIONARIO_URL}#q${b32codificar(['1', semBarra(e.nome), semBarra(s ? s.nome : ''), numeroWhats(), semBarra(primeiroNome())].join('|'))}`; }
function convite(e, s) {
  const quem = primeiroNome() ? `Sou o ${primeiroNome()}, da Real Forte Consultoria.` : 'Somos da Real Forte Consultoria.';
  return `Oi, pessoal${s ? ' do ' + s.nome : ''}! ${quem} Estamos ajudando a ${e.nome} a tirar trabalho repetitivo da rotina. Vocês podem responder este questionário rápido? Leva uns 5 minutos, não tem resposta certa e dá para fazer pelo celular:\n${linkQuestionario(e, s)}\n\nObrigado!`;
}
// As mesmas perguntas em texto, para quem prefere responder direto no WhatsApp ou por e-mail
function perguntasEmTexto(e, s) {
  return [`*Questionário Real Forte · ${e.nome}${s ? ' · ' + s.nome : ''}*`, 'Responda do seu jeito, frases curtas bastam.', '',
    '1. Seu nome e sua função. Há quanto tempo está nela?',
    '2. Quais são as 3 tarefas que você mais repete no dia? Para cada uma:',
    '   a) Com que frequência? (várias vezes ao dia, uma vez por dia, algumas vezes por semana, uma vez por mês)',
    '   b) Quanto tempo leva cada vez?',
    '   c) De onde vem a informação? (sistema, planilha, WhatsApp, e-mail, papel, outra pessoa)',
    '   d) Você digita de novo algo que já existe em outro lugar?',
    '   e) Já deu erro? O que aconteceu?',
    '3. O que você fica esperando de outro setor para conseguir trabalhar?',
    '4. Se você faltar uma semana, que tarefa ninguém sabe fazer?',
    '5. Tem algum relatório ou planilha que você faz e acha que ninguém usa?',
    '6. Se ganhasse um ajudante por 1 hora por dia, o que daria para ele fazer?'].join('\n');
}
// Alvo dos botões: um setor, ou "geral:<empresa>" para o link sem setor
function alvoQuestionario(id) {
  if (String(id).startsWith('geral:')) { const e = empresaPorId(id.slice(6)); return e ? { e, s: null } : null; }
  const s = setorPorId(id); const e = s && empresaPorId(s.empresaId);
  return e ? { e, s } : null;
}
// Lê as respostas coladas: procura "Empresa:", "Setor:" e "Quem respondeu:" no texto
function lerRespostas(texto) {
  const pega = (rotulo) => { const m = String(texto).match(new RegExp('^\\s*\\*?' + rotulo + ':\\s*(.+)$', 'mi')); return m ? m[1].replace(/\*/g, '').trim() : ''; };
  return { setor: pega('Setor'), quem: pega('Quem respondeu'), empresa: pega('Empresa') };
}
function abrirColarRespostas(empresaId) {
  const e = empresaPorId(empresaId); if (!e) return;
  const setores = setoresDa(e.id);
  dlg.className = 'dlg largo';
  dlg.innerHTML = `<form class="dlg-form" id="form-colar" novalidate>
    <div class="dlg-cab"><div><h2 id="dlg-titulo">Colar respostas recebidas</h2><p>${esc(e.nome)} · cole a mensagem que chegou no seu WhatsApp. O painel reconhece o setor sozinho.</p></div><button type="button" class="icone-btn" data-fechar aria-label="Fechar">${icone('x')}</button></div>
    <div class="dlg-corpo">
      <div class="campo largo"><label for="f-respostas">Respostas</label><textarea id="f-respostas" rows="11" placeholder="Cole aqui a mensagem que começa com “Questionário Real Forte”"></textarea></div>
      <div class="campo"><label for="f-setor-destino">Setor</label><select id="f-setor-destino"><option value="">Escolha o setor</option>${setores.map((s) => `<option value="${esc(s.id)}">${esc(s.nome)}</option>`).join('')}<option value="novo">Criar setor novo</option></select></div>
      <div class="campo" id="campo-novo-setor" hidden><label for="f-novo-setor">Nome do setor novo</label><input type="text" id="f-novo-setor"></div>
      <div class="previa-colar" id="previa-colar" hidden></div>
      <p class="erro-form" id="erro-form" hidden></p>
    </div>
    <div class="dlg-rodape"><div class="dir"><button type="button" class="btn" data-fechar>Cancelar</button><button type="submit" class="btn primario" id="botao-salvar">Guardar no setor</button></div></div>
  </form>`;
  const area = $('#f-respostas'), escolha = $('#f-setor-destino'), novo = $('#f-novo-setor'), campoNovo = $('#campo-novo-setor'), previa = $('#previa-colar');
  function atualizar(automatico) {
    const r = lerRespostas(area.value);
    if (automatico && r.setor) {
      const achado = setores.find((s) => normal(s.nome) === normal(r.setor));
      if (achado) escolha.value = achado.id; else { escolha.value = 'novo'; novo.value = r.setor; }
    }
    campoNovo.hidden = escolha.value !== 'novo';
    const destino = escolha.value === 'novo' ? (novo.value.trim() ? novo.value.trim() + ' (setor novo)' : 'setor novo') : (setorPorId(escolha.value) || {}).nome;
    previa.hidden = !area.value.trim();
    previa.innerHTML = `<span><b>Vai entrar em:</b> ${esc(destino || 'escolha o setor')}</span>${r.quem ? `<span><b>Quem respondeu:</b> ${esc(r.quem)}</span>` : ''}${r.empresa && normal(r.empresa) !== normal(e.nome) ? `<span class="meta">A mensagem diz “${esc(r.empresa)}”. Confira se é desta empresa.</span>` : ''}`;
  }
  area.addEventListener('input', () => atualizar(true));
  escolha.addEventListener('change', () => atualizar(false));
  novo.addEventListener('input', () => atualizar(false));
  $('#form-colar').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const erro = $('#erro-form');
    const texto = area.value.replace(/\*/g, '').trim();
    if (!texto) { erro.textContent = 'Cole as respostas antes de guardar.'; erro.hidden = false; return; }
    let setorId = escolha.value;
    if (!setorId || (setorId === 'novo' && !novo.value.trim())) { erro.textContent = 'Escolha o setor ou escreva o nome do setor novo.'; erro.hidden = false; return; }
    const botao = $('#botao-salvar'); botao.disabled = true; botao.textContent = 'Guardando…';
    try {
      if (setorId === 'novo') { setorId = novoId('s'); await gravar('setores', setorId, { empresaId: e.id, nome: novo.value.trim(), responsavel: '' }); }
      await gravar('diario', novoId('d'), { empresaId: e.id, setorId, data: hojeISO(), texto, origem: 'questionario' });
      dlg.close();
      toast('Respostas guardadas. No setor, use “Transformar”.');
      location.hash = 's-' + setorId;
    } catch (x) { erro.textContent = x.message; erro.hidden = false; botao.disabled = false; botao.textContent = 'Guardar no setor'; }
  });
  if (!dlg.open) dlg.showModal();
  setTimeout(() => area.focus(), 30);
}

/* ---------- RF Sinais ----------
   Os setores das empresas mandam "algo está travando" por uma página do Google (fora do Claude).
   A página grava numa planilha e avisa por e-mail. Aqui você traz os sinais (colando as linhas
   da planilha, o arquivo baixado ou o próprio e-mail) e decide: vira gargalo ou arquiva.
   Quem decide o que vira gargalo é o consultor responsável pela empresa; o painel não decide nada sozinho. */
const COLUNAS_SINAIS = ['codigo', 'recebido_em', 'empresa_id', 'empresa', 'setor', 'o_que_trava', 'frequencia', 'quanto_atrapalha', 'nome', 'contato'];
const CODIGO_SINAL = /^S-[0-9A-F]{8}$/i;
const ENDERECO_SINAIS = /^https:\/\/script\.google\.com\/(a\/[^/\s]+\/)?macros\/s\/[\w-]+\/exec$/;
const ESTADOS_SINAL = [['novo', 'Novos'], ['gargalo', 'Viraram gargalo'], ['arquivado', 'Arquivados']];

const sinaisNovos = () => S.sinais.filter((x) => (x.estado || 'novo') === 'novo').length;
const empresaDoSinal = (x) => empresaPorId(x.empresaId) || S.empresas.find((e) => normal(e.nome) === normal(x.empresa));

// Link de cada empresa: endereço da página + código, nome e setores da empresa
function linkSinais(e) {
  const base = S.config.sinaisUrl; if (!base || !e) return '';
  const setores = setoresDa(e.id).map((s) => String(s.nome || '').replace(/\|/g, '/')).filter(Boolean).slice(0, 15);
  return `${base}?e=${encodeURIComponent(e.id)}&n=${encodeURIComponent(e.nome || '')}${setores.length ? '&s=' + encodeURIComponent(setores.join('|')) : ''}`;
}
function conviteSinais(e) {
  return `Olá! Aqui é da Real Forte. Criamos um canal rápido para o time da ${e.nome} avisar quando algo travar no setor:\n${linkSinais(e)}\n\nLeva menos de um minuto e o nome é opcional. Se puder, deixe fixado no grupo do setor.`;
}

/* Lê o que você colou ou subiu:
   - linhas copiadas da planilha (separadas por tabulação);
   - o arquivo .csv baixado da planilha;
   - o texto do e-mail (a linha que começa com RF-SINAL). */
function lerTabela(texto, sep) {
  const linhas = []; let linha = [], campo = '', aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (aspas) { if (ch === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false; } else campo += ch; }
    else if (ch === '"' && campo === '') aspas = true;
    else if (ch === sep) { linha.push(campo); campo = ''; }
    else if (ch === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else campo += ch;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}
function lerSinais(bruto) {
  const texto = String(bruto || '').replace(/\r\n?/g, '\n');
  const achados = new Map();
  const guardar = (o) => {
    const codigo = String(o.codigo || '').trim().toUpperCase();
    if (!CODIGO_SINAL.test(codigo) || achados.has(codigo)) return;
    achados.set(codigo, {
      id: codigo, codigo, recebidoEm: String(o.recebido_em || '').trim(), empresaId: String(o.empresa_id || '').trim(), empresa: String(o.empresa || '').trim(),
      setor: String(o.setor || '').trim(), texto: String(o.o_que_trava || '').trim(), frequencia: String(o.frequencia || '').trim(),
      atrapalha: String(o.quanto_atrapalha || '').trim(), nome: String(o.nome || '').trim(), contato: String(o.contato || '').trim()
    });
  };
  // Do e-mail
  (texto.match(/RF-SINAL (\{.*\})/g) || []).forEach((l) => { try { guardar(JSON.parse(l.slice(9))); } catch (_) { /* linha cortada: ignora */ } });
  // Da planilha (colada ou arquivo)
  const sep = texto.includes('\t') ? '\t' : ',';
  let ordem = COLUNAS_SINAIS;
  lerTabela(texto, sep).forEach((cel) => {
    const limpo = cel.map((c) => String(c).replace(/^'/, '').trim());
    if (limpo[0] === 'codigo') { ordem = limpo; return; }
    const o = {}; ordem.forEach((k, i) => { o[k] = limpo[i]; }); guardar(o);
  });
  return [...achados.values()];
}

/* ---------- Tela ---------- */
function telaSinais() {
  const url = S.config.sinaisUrl;
  const ativas = empresasAtivas();
  const filtro = UI.sinaisFiltro || 'novo';
  const todos = S.sinais.slice().sort((a, b) => String(b.recebidoEm).localeCompare(String(a.recebidoEm)));
  const conta = (k) => todos.filter((x) => (x.estado || 'novo') === k).length;
  const lista = todos.filter((x) => (x.estado || 'novo') === filtro);
  const cab = `<header class="cab"><div><p class="olho">${esc(nomeFrente())}</p><h1>RF Sinais</h1><p class="sub">O que os setores das empresas mandam pelo link. Você decide o que vira gargalo.</p></div>
    <div class="acoes so-editor"><button class="btn primario" data-acao="sinaisBuscar">${icone('sinal')}Buscar sinais</button></div></header>`;
  // Primeiro uso: falta o endereço da página do Google
  const ligar = `<section class="painel sinais-ligar"><div class="painel-corpo">
      <h2>Ligar o RF Sinais</h2>
      <ol class="sinais-passos">
        <li>Instale a página do Google seguindo o passo a passo que a Real Forte guardou (leva uns 5 minutos).</li>
        <li>No fim, o Google mostra um endereço que termina em <b>/exec</b>. Cole aqui embaixo.</li>
        <li>Pronto: cada empresa ganha o próprio link para mandar ao time.</li>
      </ol>
      <div class="sinais-url so-editor"><input type="url" id="sinais-url" placeholder="https://script.google.com/macros/s/…/exec" aria-label="Endereço da página RF Sinais" value="${esc(url || '')}"><button class="btn primario" data-acao="sinaisGuardarUrl">Guardar endereço</button></div>
    </div></section>`;
  const links = `<section class="painel"><div class="painel-corpo">
      <div class="sinais-cab"><h2>Links das empresas</h2><button class="btn peq so-editor" data-acao="sinaisTrocarUrl">${icone('lapis')}Trocar endereço</button></div>
      ${UI.sinaisTrocandoUrl ? `<div class="sinais-url so-editor"><input type="url" id="sinais-url" aria-label="Endereço da página RF Sinais" value="${esc(url)}"><button class="btn primario" data-acao="sinaisGuardarUrl">Guardar</button></div>` : ''}
      ${ativas.length ? `<div class="sinais-links">${ativas.map((e) => `<div class="sinais-link"><span class="nome">${esc(e.nome)}</span><span class="meta">${plural(setoresDa(e.id).length, 'setor', 'setores')} no link</span>
        <span class="botoes"><button class="btn peq" data-acao="sinaisConvite" data-id="${esc(e.id)}">${icone('copiar')}Copiar convite</button><button class="btn peq" data-acao="sinaisLink" data-id="${esc(e.id)}">${icone('copiar')}Só o link</button></span></div>`).join('')}</div>`
        : '<p class="vazio-mini">Cadastre uma empresa para ter o link dela.</p>'}
    </div></section>`;
  const filtros = `<div class="filtros" role="group" aria-label="Filtrar sinais">${ESTADOS_SINAL.map(([k, n]) => `<button class="chip" data-acao="sinaisFiltro" data-id="${k}" aria-pressed="${filtro === k}">${n} <span class="meta">${conta(k)}</span></button>`).join('')}</div>`;
  const vazio = filtro === 'novo'
    ? `<div class="vazio"><h3>Nenhum sinal novo</h3><p>${todos.length ? 'Tudo o que chegou já foi decidido.' : 'Mande o convite de uma empresa. Quando chegar o e-mail “RF Sinais”, use <b>Buscar sinais</b>.'}</p></div>`
    : '<p class="vazio-mini">Nada por aqui.</p>';
  const como = `<section class="painel como-funciona"><div class="painel-corpo"><h2>Como funciona</h2><dl>
      <dt>O que faz</dt><dd>Recebe o que os setores das empresas contam que está travando e deixa você transformar em gargalo.</dd>
      <dt>O que colar</dt><dd>As linhas da planilha “RF Sinais”, o arquivo .csv baixado dela ou o próprio e-mail do aviso.</dd>
      <dt>De onde sai</dt><dd>Da página do Google que o setor preenche pelo link da empresa. Ela grava na planilha e manda o e-mail.</dd>
      <dt>O que devolve</dt><dd>Um cartão por sinal. “Virar gargalo” já cria o gargalo no setor certo, com o texto em “o que eu vi”.</dd>
      <dt>Quem responde pela regra</dt><dd>O que vira gargalo é decisão do consultor responsável pela empresa.</dd>
      <dt>Quando der erro</dt><dd>Se nada for reconhecido, confira se a primeira coluna copiada é o código (começa com S-). Se o link não abrir, refaça a implantação no Google e guarde o endereço novo.</dd>
    </dl></div></section>`;
  return cab + (url ? links : ligar) + filtros
    + (lista.length ? `<div class="sinais-lista">${lista.map(cartaoSinal).join('')}</div>` : vazio) + como;
}
function cartaoSinal(x) {
  const e = empresaDoSinal(x); const estado = x.estado || 'novo';
  const nivel = { Muito: 'alto', 'Médio': 'medio', Pouco: 'baixo' }[x.atrapalha] || '';
  const g = x.gargaloId && gargaloPorId(x.gargaloId);
  const quando = x.recebidoEm ? `${relativo(x.recebidoEm)} · ${dataBR(String(x.recebidoEm).slice(0, 10))}` : '';
  return `<article class="sinal-card ${estado}">
    <div class="sinal-topo"><span class="tag">${esc(e ? e.nome : x.empresa || 'Empresa não informada')}</span><span class="meta">${esc(x.setor || 'Setor não informado')}${quando ? ' · ' + esc(quando) : ''}</span>${nivel ? `<span class="sinal-nivel ${nivel}">Atrapalha ${esc(x.atrapalha.toLowerCase())}</span>` : ''}</div>
    <p class="sinal-texto">${esc(x.texto)}</p>
    <p class="sinal-meta">${x.frequencia ? `<span>${icone('relogio')}${esc(x.frequencia)}</span>` : ''}<span>${icone('pessoa')}${esc(x.nome || 'Anônimo')}${x.contato ? ' · ' + esc(x.contato) : ''}</span><span class="meta">${esc(x.codigo)}</span></p>
    ${!e ? '<p class="sinal-aviso">A empresa deste sinal não está no painel. Ao virar gargalo, escolha a empresa.</p>' : ''}
    <div class="sinal-acoes so-editor">
      ${estado === 'novo' ? `<button class="btn primario peq" data-acao="sinalVirar" data-id="${esc(x.id)}">${icone('seta')}Virar gargalo</button><button class="btn peq" data-acao="sinalArquivar" data-id="${esc(x.id)}">${icone('arquivo')}Arquivar</button>` : ''}
      ${estado === 'gargalo' && g ? `<a class="btn peq" href="#sg-${esc(g.setorId)}">${icone('seta')}Ver gargalo</a>` : ''}
      ${estado !== 'novo' ? `<button class="btn peq" data-acao="sinalReabrir" data-id="${esc(x.id)}">Voltar para novos</button>` : ''}
    </div>
  </article>`;
}

/* ---------- Buscar sinais ---------- */
function abrirBuscarSinais() {
  dlg.className = 'dlg largo';
  dlg.innerHTML = `<form class="dlg-form" id="form-sinais" novalidate>
    <div class="dlg-cab"><div><h2 id="dlg-titulo">Buscar sinais</h2><p>Na planilha “RF Sinais”, selecione as linhas (pode ser tudo, com o cabeçalho), copie e cole aqui. Também vale o arquivo .csv ou o texto do e-mail.</p></div><button type="button" class="icone-btn" data-fechar aria-label="Fechar">${icone('x')}</button></div>
    <div class="dlg-corpo">
      <div class="campo largo"><label for="f-sinais">Linhas da planilha ou e-mail</label><textarea id="f-sinais" rows="9" placeholder="Cole aqui. Os sinais que já estão no painel não entram de novo."></textarea></div>
      <div class="campo largo"><label class="btn peq" for="f-sinais-arq">${icone('documento')}Subir arquivo .csv</label><input type="file" id="f-sinais-arq" accept=".csv,.tsv,.txt,text/csv" hidden></div>
      <div class="previa-colar" id="previa-sinais" hidden></div>
      <p class="erro-form" id="erro-form" hidden></p>
    </div>
    <div class="dlg-rodape"><div class="dir"><button type="button" class="btn" data-fechar>Cancelar</button><button type="submit" class="btn primario" id="botao-salvar" disabled>Trazer sinais</button></div></div>
  </form>`;
  const area = $('#f-sinais'), previa = $('#previa-sinais'), botao = $('#botao-salvar');
  let novos = [];
  function atualizar() {
    const lidos = lerSinais(area.value);
    const ja = new Set(S.sinais.map((x) => x.id));
    novos = lidos.filter((x) => !ja.has(x.id));
    previa.hidden = !area.value.trim();
    previa.innerHTML = lidos.length
      ? `<span><b>${plural(novos.length, 'sinal novo', 'sinais novos')}</b></span>${lidos.length - novos.length ? `<span class="meta">${plural(lidos.length - novos.length, 'já estava', 'já estavam')} no painel</span>` : ''}`
      : '<span>Nenhum sinal reconhecido ainda. A primeira coluna deve ser o código (começa com S-).</span>';
    botao.disabled = !novos.length;
    botao.textContent = novos.length ? `Trazer ${plural(novos.length, 'sinal', 'sinais')}` : 'Trazer sinais';
  }
  area.addEventListener('input', atualizar);
  $('#f-sinais-arq').addEventListener('change', async (ev) => {
    const arq = ev.target.files && ev.target.files[0]; if (!arq) return;
    try { area.value = await arq.text(); atualizar(); } catch (_) { toast('Não deu para ler esse arquivo.', 'erro'); }
  });
  $('#form-sinais').addEventListener('submit', async (ev) => {
    ev.preventDefault(); if (!novos.length) return;
    botao.disabled = true; botao.textContent = 'Trazendo…';
    try {
      const agora = agoraISO();
      for (const x of novos) await gravar('sinais', x.id, Object.assign({}, x, { estado: 'novo', entrouEm: agora }));
      dlg.close(); UI.sinaisFiltro = 'novo';
      toast(`${plural(novos.length, 'sinal novo chegou', 'sinais novos chegaram')} no painel.`); render(true);
    } catch (x) { const erro = $('#erro-form'); erro.textContent = x.message; erro.hidden = false; botao.disabled = false; botao.textContent = 'Trazer sinais'; }
  });
  if (!dlg.open) dlg.showModal();
  setTimeout(() => area.focus(), 30);
}

/* ---------- Virar gargalo ---------- */
function abrirVirarGargalo(id) {
  const x = S.sinais.find((s) => s.id === id); if (!x) return;
  const ativas = empresasAtivas(); if (!ativas.length) { toast('Cadastre a empresa antes de virar gargalo.'); return; }
  const e0 = empresaDoSinal(x) || ativas[0];
  const titulo0 = (String(x.texto).split(/(?<=[.!?])\s|\n/)[0] || '').slice(0, 90);
  const rodape = `RF Sinais · ${x.nome || 'anônimo'}${x.frequencia ? ' · ' + x.frequencia.toLowerCase() : ''}${x.atrapalha ? ' · atrapalha ' + x.atrapalha.toLowerCase() : ''}${x.recebidoEm ? ' · ' + dataBR(String(x.recebidoEm).slice(0, 10)) : ''}`;
  dlg.className = 'dlg largo';
  dlg.innerHTML = `<form class="dlg-form" id="form-virar" novalidate>
    <div class="dlg-cab"><div><h2 id="dlg-titulo">Virar gargalo</h2><p>Confira o título e o setor. O texto do sinal entra em “o que eu vi”.</p></div><button type="button" class="icone-btn" data-fechar aria-label="Fechar">${icone('x')}</button></div>
    <div class="dlg-corpo">
      <div class="campo largo"><label for="f-titulo">Título do gargalo</label><input type="text" id="f-titulo" value="${esc(titulo0)}"></div>
      <div class="campo"><label for="f-empresa">Empresa</label><select id="f-empresa">${ativas.map((e) => `<option value="${esc(e.id)}" ${e.id === e0.id ? 'selected' : ''}>${esc(e.nome)}</option>`).join('')}</select></div>
      <div class="campo"><label for="f-setor-destino">Setor</label><select id="f-setor-destino"></select></div>
      <div class="campo largo" id="campo-novo-setor" hidden><label for="f-novo-setor">Nome do setor novo</label><input type="text" id="f-novo-setor" value="${esc(x.setor)}"></div>
      <div class="campo largo"><label for="f-obs">O que eu vi</label><textarea id="f-obs" rows="6">${esc(x.texto + '\n\n(' + rodape + ')')}</textarea></div>
      <p class="erro-form" id="erro-form" hidden></p>
    </div>
    <div class="dlg-rodape"><div class="dir"><button type="button" class="btn" data-fechar>Cancelar</button><button type="submit" class="btn primario" id="botao-salvar">Criar gargalo</button></div></div>
  </form>`;
  const empresa = $('#f-empresa'), setor = $('#f-setor-destino'), campoNovo = $('#campo-novo-setor');
  function preencherSetores() {
    const lista = setoresDa(empresa.value);
    const achado = lista.find((s) => normal(s.nome) === normal(x.setor));
    setor.innerHTML = lista.map((s) => `<option value="${esc(s.id)}" ${achado && achado.id === s.id ? 'selected' : ''}>${esc(s.nome)}</option>`).join('') + `<option value="novo" ${achado ? '' : 'selected'}>Criar setor novo</option>`;
    campoNovo.hidden = setor.value !== 'novo';
  }
  preencherSetores();
  empresa.addEventListener('change', preencherSetores);
  setor.addEventListener('change', () => { campoNovo.hidden = setor.value !== 'novo'; });
  $('#form-virar').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const erro = $('#erro-form'), botao = $('#botao-salvar');
    const titulo = $('#f-titulo').value.trim(), novoNome = $('#f-novo-setor').value.trim();
    if (!titulo) { erro.textContent = 'Escreva o título do gargalo.'; erro.hidden = false; return; }
    if (setor.value === 'novo' && !novoNome) { erro.textContent = 'Escreva o nome do setor novo.'; erro.hidden = false; return; }
    botao.disabled = true; botao.textContent = 'Criando…';
    try {
      let setorId = setor.value;
      if (setorId === 'novo') { setorId = novoId('s'); await gravar('setores', setorId, { empresaId: empresa.value, nome: novoNome, responsavel: '' }); }
      const gid = novoId('g'), agora = agoraISO();
      await gravar('gargalos', gid, { empresaId: empresa.value, setorId, titulo, observacao: $('#f-obs').value.trim(), proposta: '', situacao: 'Aberto', origemSinal: x.codigo, criadoEm: agora, atualizadoEm: agora, movimentos: [{ em: agora, texto: 'Chegou pelo RF Sinais' }] });
      await gravar('sinais', x.id, Object.assign({}, x, { estado: 'gargalo', gargaloId: gid, decididoEm: agora }));
      dlg.close();
      toast('Gargalo criado a partir do sinal.', '', { rotulo: 'Ver', fn: () => { location.hash = 'sg-' + setorId; } });
      render(true);
    } catch (falha) { erro.textContent = falha.message; erro.hidden = false; botao.disabled = false; botao.textContent = 'Criar gargalo'; }
  });
  if (!dlg.open) dlg.showModal();
  setTimeout(() => $('#f-titulo').focus(), 30);
}
async function mudarEstadoSinal(id, estado, mensagem) {
  const x = S.sinais.find((s) => s.id === id); if (!x) return;
  const anterior = Object.assign({}, x);
  try {
    await gravar('sinais', id, Object.assign({}, x, { estado, decididoEm: agoraISO() }));
    toast(mensagem, '', { rotulo: 'Desfazer', fn: () => gravar('sinais', id, anterior).catch((f) => toast(f.message, 'erro')) });
    render(true);
  } catch (f) { toast(f.message, 'erro'); }
}
async function guardarEnderecoSinais() {
  const campo = $('#sinais-url'); const url = String(campo && campo.value || '').trim();
  if (!ENDERECO_SINAIS.test(url)) { toast('Esse endereço não parece o da página do Google. Ele começa com https://script.google.com e termina em /exec.', 'erro'); if (campo) campo.focus(); return; }
  try { await gravar('config', 'geral', Object.assign({}, S.config, { sinaisUrl: url })); UI.sinaisTrocandoUrl = false; toast('Endereço guardado. Agora cada empresa tem o próprio link.'); render(true); }
  catch (f) { toast(f.message, 'erro'); }
}

/* ---------- 15. PDF e cópia de segurança ---------- */
function dadosRelatorio(e) {
  const setores = setoresDa(e.id);
  const garg = gargalosDa(e.id);
  const c = contagem(garg);
  return {
    frente: nomeFrente(), consultor: nomeConsultor(),
    empresa: { nome: e.nome || '', segmento: e.segmento || '', cidade: e.cidade || '', contato: e.contato || '' },
    dataTexto: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
    etapaTexto: `${c['Resolvido']} de ${garg.length} gargalos resolvidos`,
    numeros: { setores: setores.length, gargalos: garg.length, propostas: garg.filter(temProposta).length },
    setores: setores.map((s) => ({
      nome: s.nome || '', responsavel: s.responsavel || '',
      notas: notasDo(s.id).slice().reverse().map((n) => ({ data: dataBR(n.data), texto: n.texto || '' })),
      gargalos: gargalosDo(s.id).map((g) => ({ titulo: g.titulo || '', situacao: situacaoDe(g), observacao: g.observacao || '', proposta: String(g.proposta || '').trim() }))
    }))
  };
}
function nomeArquivo(texto) { return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, ' ').slice(0, 80) || 'Empresa'; }
async function gerarPDF(empresaId) {
  const e = empresaPorId(empresaId); if (!e) return;
  if (!downloads) { toast('Baixar o PDF funciona com o painel aberto no Claude.', 'erro'); return; }
  const Construtor = window.jspdf && window.jspdf.jsPDF;
  if (!Construtor || !Construtor.API || typeof Construtor.API.autoTable !== 'function') { toast('O gerador de PDF não carregou. Confira a internet e recarregue a página.', 'erro'); return; }
  const botao = $('#botao-pdf');
  if (botao) { botao.disabled = true; botao.innerHTML = icone('pdf') + 'Gerando…'; }
  try {
    const arquivo = montarPDF(Construtor, dadosRelatorio(e)).output('blob');
    const r = await downloads.save({ filename: `Diagnostico Operacional - ${nomeArquivo(e.nome)} - ${hojeISO()}.pdf`, data: arquivo });
    if (r && r.status === 'saved') toast('PDF salvo. É só mandar para o sócio.');
  } catch (x) {
    const c = x && x.code;
    if (c === 'declined') toast('Download cancelado.');
    else if (c === 'rate_limited') toast('Já tem um download esperando confirmação.');
    else toast('Não deu para gerar o PDF agora.', 'erro');
  } finally {
    const b = $('#botao-pdf'); if (b) { b.disabled = !downloads; b.innerHTML = icone('pdf') + 'Gerar PDF'; }
  }
}
async function baixarBackup() {
  if (!downloads) return;
  const copia = { sistema: 'Real Forte Lab', versao: 3, exportadoEm: new Date().toISOString(), config: S.config };
  COLECOES.forEach((c) => { copia[c] = S[c]; });
  try { const r = await downloads.save({ filename: `real-forte-copia-${hojeISO()}.json`, data: JSON.stringify(copia, null, 2) }); if (r && r.status === 'saved') toast('Cópia salva. Guarde no seu Drive.'); }
  catch (x) { toast(x && x.code === 'declined' ? 'Download cancelado.' : 'Não deu para baixar a cópia agora.', x && x.code === 'declined' ? '' : 'erro'); }
}
$('#arquivo-backup').addEventListener('change', async (ev) => {
  const arquivo = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!arquivo) return;
  let copia;
  try { copia = JSON.parse(await arquivo.text()); } catch (_) { toast('Este arquivo não é uma cópia válida do painel.', 'erro'); return; }
  if (!copia || !Array.isArray(copia.empresas)) { toast('Este arquivo não é uma cópia do painel da Real Forte.', 'erro'); return; }
  dlg.className = 'dlg';
  dlg.innerHTML = `<div class="dlg-form"><div class="dlg-cab"><div><h2 id="dlg-titulo">Restaurar cópia</h2><p>Cópia de ${esc(dataBR(String(copia.exportadoEm || '').slice(0, 10)))}: ${esc(COLECOES.map((c) => `${(copia[c] || []).length} ${c}`).join(', '))}.</p></div><button type="button" class="icone-btn" data-fechar aria-label="Fechar">${icone('x')}</button></div>
    <div class="dlg-corpo"><p style="grid-column:1/-1">Os registros da cópia substituem os de mesmo código. O que existe hoje e não está na cópia continua no painel.</p><p class="erro-form" id="erro-form" hidden></p></div>
    <div class="dlg-rodape"><div class="dir"><button type="button" class="btn" data-fechar>Cancelar</button><button type="button" class="btn primario" id="botao-restaurar">${icone('subir')}Restaurar</button></div></div></div>`;
  dlg.showModal();
  $('#botao-restaurar').addEventListener('click', async () => {
    const b = $('#botao-restaurar'); b.disabled = true;
    try {
      let feitos = 0;
      if (copia.config && typeof copia.config === 'object') await gravar('config', 'geral', copia.config);
      for (const c of COLECOES) for (const item of (copia[c] || [])) if (item && item.id) { await gravar(c, String(item.id), item); feitos++; b.textContent = `Restaurando… ${feitos}`; }
      dlg.close(); toast(`Cópia restaurada: ${feitos} registros.`);
    } catch (x) { const er = $('#erro-form'); er.textContent = x.message; er.hidden = false; b.disabled = false; b.textContent = 'Tentar de novo'; }
  });
});

/* ---------- Biblioteca de soluções ----------
   Junta duas coisas: os casos resolvidos de todas as empresas (entram sozinhos quando o gargalo
   fica "Resolvido") e as metodologias que você cadastra ou salva da RF Intelligence (coleção "biblioteca").
   Fica só no painel: o cliente nunca vê. */
const linkValido = (u) => (/^https?:\/\/\S+$/i.test(String(u || '').trim()) ? String(u).trim() : '');
function itensBiblioteca() {
  const casos = S.gargalos.filter((g) => situacaoDe(g) === 'Resolvido').map((g) => {
    const s = setorPorId(g.setorId) || {}; const e = empresaPorId(g.empresaId) || {};
    return { id: 'caso:' + g.id, gargaloId: g.id, origem: ehOport(g) ? 'entrega' : 'caso', titulo: g.titulo, tipo: s.nome ? tipoDoSetor(s) : 'geral', problema: g.observacao || '', solucao: g.proposta || '', link: linkValido(g.linkFerramenta), horas: horasLivres(g), empresa: e.nome || '', setor: s.nome || '', em: g.atualizadoEm || '' };
  });
  const proprias = S.biblioteca.map((b) => ({ id: b.id, origem: b.origem === 'intelligence' ? 'intelligence' : 'metodologia', titulo: b.titulo || 'Sem título', tipo: DIAGNOSTICOS[b.tipo] ? b.tipo : 'geral', problema: b.problema || '', solucao: b.solucao || '', link: linkValido(b.link), horas: numero(b.horas), empresa: '', setor: '', em: b.criadoEm || '' }));
  return proprias.concat(casos).sort((a, b) => String(b.em).localeCompare(String(a.em)));
}
const ORIGEM_BIB = { caso: 'Caso resolvido', entrega: 'Oportunidade entregue', metodologia: 'Metodologia', intelligence: 'Da RF Intelligence' };
// Palavras de um texto, para achar o que é parecido (sem acento, só palavras com 4 letras ou mais)
const palavras = (t) => new Set(normal(t).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((p) => p.length >= 4));
function parecidos(texto, lista, campos, tipo, quantos) {
  const alvo = palavras(texto);
  return lista.map((it) => { const ps = palavras(campos.map((c) => it[c]).join(' ')); let n = 0; ps.forEach((p) => { if (alvo.has(p)) n++; }); return { it, n: n + (tipo && it.tipo === tipo ? 2 : 0) }; })
    .filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, quantos).map((x) => x.it);
}
// O que aparece com a busca e o filtro de agora (a lista e a galáxia usam o mesmo)
function listaDaBiblioteca(todos) {
  const q = normal(UI.bibBusca || '');
  return todos.filter((x) => (!UI.bibTipo || x.tipo === UI.bibTipo) && (!q || normal([x.titulo, x.problema, x.solucao, x.empresa, x.setor].join(' ')).includes(q)));
}
function telaBiblioteca() {
  const todos = itensBiblioteca();
  const q = normal(UI.bibBusca || '');
  const tiposPresentes = TIPOS_SETOR.filter((k) => todos.some((x) => x.tipo === k));
  const lista = listaDaBiblioteca(todos);
  const cab = `<header class="cab"><div><p class="olho">Real Forte</p><h1>Biblioteca de soluções</h1><p class="sub">O que já funcionou, para reaproveitar. Os casos resolvidos entram sozinhos; as metodologias você cadastra.</p></div>
    <div class="acoes so-editor"><button class="btn primario" data-acao="novaSolucao">${icone('mais')}Nova metodologia</button></div></header>`;
  const filtros = `<div class="barra-ferramentas"><div class="filtros" role="group" aria-label="Filtrar por tipo de setor"><button class="chip" data-acao="bibTipo" data-id="" aria-pressed="${!UI.bibTipo}">Todos <span class="meta">${todos.length}</span></button>${tiposPresentes.map((k) => `<button class="chip" data-acao="bibTipo" data-id="${k}" aria-pressed="${UI.bibTipo === k}">${esc(DIAGNOSTICOS[k].nome)}</button>`).join('')}</div>
    <label class="busca-quadro">${icone('busca')}<input id="busca-bib" type="search" placeholder="Buscar na biblioteca" value="${esc(UI.bibBusca || '')}" aria-label="Buscar na biblioteca"></label></div>`;
  if (!todos.length) return cab + `<div class="vazio"><h3>A biblioteca começa com o primeiro gargalo resolvido</h3><p>Quando um gargalo fica “Resolvido”, ele entra aqui com o problema, a solução e as horas devolvidas. Você também pode cadastrar metodologias da Real Forte.</p></div>`;
  const legenda = [['caso', 'Caso resolvido'], ['entrega', 'Oportunidade entregue'], ['metodologia', 'Metodologia'], ['intelligence', 'Da RF Intelligence']].map(([k, n]) => `<span><i style="background:${COR_ORIGEM_CSS[k]}"></i>${n}</span>`).join('');
  const galaxia = campoDisponivel() ? `<section class="galaxia" id="galaxia-lugar" aria-label="Galáxia de soluções"><div class="galaxia-legenda">${legenda}<span class="gl-nota">estrela maior = mais horas devolvidas · linha = soluções parecidas</span></div></section>` : '';
  return cab + filtros + galaxia + (lista.length ? `<div class="bib-lista">${lista.map(cartaoBib).join('')}</div>` : '<p class="vazio-mini">Nada encontrado com esse filtro.</p>');
}
function cartaoBib(x) {
  const aberto = UI.bibAberto === x.id;
  const resumo = (t, n) => { const s = String(t || '').trim(); return s.length > n && !aberto ? s.slice(0, n - 1) + '…' : s; };
  return `<article class="bib-card ${aberto ? 'aberto' : ''}">
    <button class="bib-topo" data-acao="abrirBib" data-id="${esc(x.id)}" aria-expanded="${aberto}"><span class="tag ${x.origem === 'caso' || x.origem === 'entrega' ? 'caso' : ''}">${ORIGEM_BIB[x.origem]}</span><span class="meta">${esc(DIAGNOSTICOS[x.tipo].nome)}${x.empresa ? ' · ' + esc(x.empresa) : ''}</span>${x.horas ? `<span class="selo-horas">${icone('desce')}${fmtHoras(x.horas)} h/mês</span>` : ''}
      <h3>${esc(x.titulo)}</h3></button>
    ${x.problema ? `<p><b>Problema.</b> ${esc(resumo(x.problema, 160))}</p>` : ''}
    ${x.solucao ? `<p><b>Solução.</b> ${esc(resumo(x.solucao, 200))}</p>` : ''}
    ${x.link ? `<div class="bib-ferramenta"><a class="btn peq acento" href="${esc(x.link)}" target="_blank" rel="noopener" title="${esc(x.link)}">${icone('fora')}Abrir a ferramenta</a><span class="meta">${esc(x.link.replace(/^https?:\/\//i, '').slice(0, 48))}</span></div>` : ''}
    ${aberto ? `<label class="bib-link-editar so-editor"><span class="rotulo">Link da ferramenta feita</span><input type="url" data-bib-link="${esc(x.id)}" value="${esc(x.link || '')}" placeholder="https://… a página, planilha ou painel entregue (salva ao sair do campo)"></label>` : ''}
    ${aberto ? `<div class="bib-acoes"><button class="btn peq" data-acao="copiarBib" data-id="${esc(x.id)}">${icone('copiar')}Copiar</button>${ia ? `<button class="btn peq" data-acao="perguntarBib" data-id="${esc(x.id)}">${icone('ia')}Perguntar à RF Intelligence</button>` : ''}${x.origem === 'caso' || x.origem === 'entrega' ? `<a class="btn peq fantasma" href="#${x.origem === 'entrega' ? 'so' : 'sg'}-${esc((gargaloPorId(x.gargaloId) || {}).setorId || '')}">${x.origem === 'entrega' ? 'Ver a oportunidade' : 'Ver o gargalo'}</a>` : `<span class="dir so-editor"><button class="btn peq fantasma" data-acao="editarSolucao" data-id="${esc(x.id)}">${icone('lapis')}Editar</button></span>`}</div>` : ''}
  </article>`;
}
function formSolucao(b) {
  const dados = b || {};
  abrirFormulario({
    titulo: b ? 'Editar metodologia' : 'Nova metodologia', subtitulo: 'Fica na biblioteca da Real Forte, para reaproveitar em outros clientes.',
    campos: [
      { id: 'titulo', rotulo: 'Nome', valor: dados.titulo, obrigatorio: true, largo: true, exemplo: 'Ex.: Conferência de carga no celular' },
      { id: 'tipo', rotulo: 'Tipo de setor', tipo: 'escolha', opcoes: TIPOS_SETOR.map((k) => ({ v: k, t: DIAGNOSTICOS[k].nome })), valor: dados.tipo || 'geral', vazio: false, largo: true },
      { id: 'problema', rotulo: 'Que problema resolve', tipo: 'area', valor: dados.problema, linhas: 3 },
      { id: 'solucao', rotulo: 'Como resolver', tipo: 'area', valor: dados.solucao, linhas: 6, obrigatorio: true }
    ],
    rotuloSalvar: b ? 'Salvar' : 'Guardar na biblioteca',
    aoSalvar: (v) => { if (v.link && !linkValido(v.link)) throw new Error('O link precisa começar com https://'); return gravar('biblioteca', b ? b.id : novoId('b'), Object.assign({}, dados, v, { origem: dados.origem || 'metodologia', criadoEm: dados.criadoEm || agoraISO() })); },
    aoExcluir: b ? () => apagarRegistro('biblioteca', b.id) : null, rotuloExcluir: 'Excluir'
  });
}

/* ---------- RF Intelligence ----------
   Assistente dos consultores. Não é treinada à parte: a cada pergunta ela recebe o método da Real Forte,
   os materiais autorizados (que você cadastra), as soluções parecidas da biblioteca e o contexto que você
   escolheu (empresa, setor, gargalo). Tudo o que ela diz é sugestão: só vira proposta ou entra na
   biblioteca quando você clica. A conversa não fica salva. */
const METODO_REAL_FORTE = `MÉTODO DA REAL FORTE
- A Real Forte trabalha como "médicos de empresas": primeiro o diagnóstico, depois o tratamento.
- O check-up avalia cada setor em quatro eixos: Processo, Informação e sistemas, Pessoas, Controle e indicadores.
- Antes de propor ferramenta, ver se dá para cortar a tarefa ou mudar o processo. Não se automatiza desperdício.
- A solução preferida é simples: planilha, arquivo que o setor já exporta, página simples ou IA, sem depender do sistema do cliente.
- A regra de negócio (percentual, prazo, limite, meta) é de quem responde pela área no cliente. A Real Forte constrói e pergunta.
- O resultado se mede em horas devolvidas ao setor: antes e depois, com o número dito pelo próprio setor.`;
const ACOES_IA = {
  causas: { rotulo: 'Causas prováveis', texto: 'Quais são as causas prováveis? Liste de 3 a 5, da mais provável para a menos provável. Para cada uma, diga em que dado ela se apoia e o que eu pergunto, e para quem, para confirmar.' },
  intervencoes: { rotulo: 'Sugerir intervenções', texto: 'Que intervenções você sugere? Comece pelo que corta ou simplifica a tarefa, depois o que automatiza. Para cada uma: o que fazer, o esforço (baixo, médio ou alto) e o que muda no dia a dia do setor.' },
  numeros: { rotulo: 'Ver em números', texto: 'Mostre a situação em números: um gráfico com os números registrados que mais importam para este contexto e, abaixo, os 3 pontos que mais pesam.' },
  solucoes: { rotulo: 'Soluções já usadas', texto: 'Quais soluções da biblioteca da Real Forte servem aqui? Diga por que cada uma serve e o que adaptar. Se nenhuma servir, diga isso com clareza.' }
};
function contextoIA() {
  const c = UI.iaCtx || {};
  const e = empresaPorId(c.empresaId); const s = setorPorId(c.setorId); const g = gargaloPorId(c.gargaloId);
  return { e: e && (!s || s.empresaId === e.id) ? e : null, s: s && e && s.empresaId === e.id ? s : null, g: g && s && g.setorId === s.id ? g : null };
}
// Trechos dos materiais autorizados mais ligados à pergunta (cabe no pedido sem estourar)
function trechosMateriais(alvo, limite) {
  const pedacos = [];
  S.materiais.forEach((m) => String(m.texto || '').split(/\n\s*\n/).forEach((p) => { const t = p.trim(); if (t) pedacos.push({ titulo: m.titulo || 'Material', texto: t.slice(0, 1500) }); }));
  const escolhidos = parecidos(alvo, pedacos, ['titulo', 'texto'], '', 40);
  const saida = []; let total = 0;
  for (const p of (escolhidos.length ? escolhidos : pedacos.slice(0, 8))) { if (total + p.texto.length > limite) break; saida.push(p); total += p.texto.length; }
  return saida;
}
// Números registrados no painel que a IA pode mostrar em gráfico. Ela não pode usar nenhum outro.
function numerosParaIA(e, s) {
  const n = {};
  if (e) {
    const ck = checkupDa(e.id);
    if (ck.nota != null) n.nota_geral_do_checkup = ck.nota;
    if (ck.avaliados.length) n.nota_do_checkup_por_setor = ck.avaliados.map(({ s: x, d }) => [x.nome, d.nota]);
    const eixos = Object.entries(ck.eixos).filter(([, v]) => v != null).map(([k, v]) => [EIXOS[k], v]);
    if (eixos.length) n.nota_da_empresa_por_eixo = eixos;
    const setores = setoresDa(e.id);
    if (setores.length) n.gargalos_e_oportunidades_por_setor = setores.map((x) => [x.nome, gargalosDo(x.id).length, oportunidadesDo(x.id).length]);
    const horas = itensDa(e.id).map((g) => [g.titulo, numero(g.horasAntes), numero(g.horasDepois)]).filter((x) => x[1] != null && x[2] != null);
    if (horas.length) n.horas_por_mes_antes_e_depois = horas;
  }
  if (s) {
    const d = diagnosticoDe(s);
    const eixos = Object.entries(d.eixos).filter(([, v]) => v != null).map(([k, v]) => [EIXOS[k], v]);
    if (eixos.length) n['nota_de_' + s.nome + '_por_eixo'] = eixos;
    if (d.respondidas) n['respostas_de_' + s.nome] = [['Sim', d.respondidas - d.criticos.length - d.atencao.length], ['Em parte', d.atencao.length], ['Não', d.criticos.length]];
  }
  return n;
}
// Palavras que mostram que o consultor quer ver números. Sem elas, a resposta não traz nota, check-up nem gráfico.
const PEDE_NUMEROS = /n[uú]mero|nota|check-?up|gr[aá]fico|hora|quant[oa]s?\b|compar|ranking|eixo|percent|%|pontua|m[eé]dia|indicador|resultado/i;
// Na conversa por voz a resposta é falada: nada de listas, símbolos ou gráfico, e tom de conversa
function formatoDeVoz() {
  const nome = primeiroNome();
  return `CONVERSA POR VOZ: o consultor${nome ? ' (' + nome + ')' : ''} está falando com você, e a sua resposta vai ser lida em voz alta.
- Responda como uma consultora conversando com um colega: natural, simpática e direta. Pode começar com "Claro!", "Boa tarde${nome ? ', ' + nome : ''}!" (se ele cumprimentou) ou "Boa pergunta.".
- Responda só o que ele pediu. Cumprimento recebe cumprimento, em uma frase.
- Frases curtas, faladas. Sem listas, sem hífens, sem asteriscos, sem títulos, sem tabela e sem gráfico. Se tiver várias ideias, diga "primeiro", "segundo" e "terceiro".
- No máximo umas 90 palavras. Se o assunto pedir mais, dê o principal e pergunte se ele quer que você detalhe.
- Quando fizer sentido, termine com uma pergunta curta para continuar a conversa.
- Português do Brasil, sem jargão e sem inglês.`;
}
/* Resumo do que existe no painel, com datas, para a IA responder perguntas como
   "qual foi a última oportunidade entregue?" ou "o que entrou na biblioteca esta semana?".
   Sem empresa escolhida, vale para todas; com empresa, só para ela. */
const dataCurta = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? dataBR(String(iso).slice(0, 10)) : '');
function resumoDoPainel(e) {
  const itens = (e ? itensDa(e.id) : S.gargalos).slice()
    .sort((a, b) => String(quandoMexeu(b)).localeCompare(String(quandoMexeu(a)))).slice(0, 30)
    .map((g) => ({ titulo: g.titulo, tipo: ehOport(g) ? 'oportunidade' : 'gargalo', empresa: (empresaPorId(g.empresaId) || {}).nome || '', setor: (setorPorId(g.setorId) || {}).nome || '', etapa: situacaoDe(g), criado_em: dataCurta(g.criadoEm), ultima_mudanca: dataCurta(quandoMexeu(g)) }));
  const biblioteca = itensBiblioteca().filter((x) => !e || !x.empresa || x.empresa === e.nome).slice(0, 30)
    .map((x) => ({ titulo: x.titulo, origem: ORIGEM_BIB[x.origem], empresa: x.empresa, setor: x.setor, data: dataCurta(x.em), horas_devolvidas_por_mes: x.horas }));
  return { gargalos_e_oportunidades_do_mais_recente_ao_mais_antigo: itens, biblioteca_do_mais_recente_ao_mais_antigo: biblioteca };
}
function montarPedidoIA(pergunta, voz) {
  const { e, s, g } = contextoIA();
  const d = s ? diagnosticoDe(s) : null;
  const alvo = [pergunta, g && g.titulo, g && g.observacao, s && s.nome, d && d.criticos.concat(d.atencao).map((x) => x.texto).join(' ')].filter(Boolean).join(' ');
  const contexto = {};
  if (e) contexto.empresa = { nome: e.nome, segmento: e.segmento || '', cidade: e.cidade || '' };
  if (s) contexto.setor = { nome: s.nome, tipo: d.nomeTipo, nota_do_checkup: d.nota, situacao: SAUDE[d.saude].nome, criterios_nao_atendidos: d.criticos.concat(d.atencao).map((x) => ({ criterio: x.texto, resposta: x.r === 'nao' ? 'Não' : 'Em parte', eixo: EIXOS[x.eixo], evidencia: x.ev })), anotacoes: notasDo(s.id).slice(0, 6).map((n) => n.texto).filter(Boolean), gargalos: gargalosDo(s.id).map((x) => `${x.titulo} (${situacaoDe(x)})`), oportunidades: oportunidadesDo(s.id).map((x) => `${x.titulo} (${nomeEtapa(x, situacaoDe(x))})`) };
  if (g) contexto[ehOport(g) ? 'oportunidade' : 'gargalo'] = { titulo: g.titulo, o_que_foi_visto: g.observacao || '', proposta_atual: g.proposta || '', etapa: situacaoDe(g) };
  const pedeNumeros = PEDE_NUMEROS.test(pergunta);
  const numeros = pedeNumeros ? numerosParaIA(e, s) : {};
  if (!pedeNumeros && contexto.setor) delete contexto.setor.nota_do_checkup;
  const biblioteca = parecidos(alvo, itensBiblioteca(), ['titulo', 'problema', 'solucao'], d ? d.tipo : '', 6).map((x) => ({ titulo: x.titulo, tipo: DIAGNOSTICOS[x.tipo].nome, problema: x.problema, solucao: x.solucao, horas_devolvidas_por_mes: x.horas }));
  const materiais = trechosMateriais(alvo, 14000);
  const historico = (UI.chat || []).slice(0, -1).slice(-8).map((m) => `${m.papel === 'voce' ? 'CONSULTOR' : 'RF INTELLIGENCE'}: ${m.pergunta || textoLimpo(m.texto)}`).join('\n\n');
  let pedido = `Você é a RF Intelligence, a assistente dos consultores da Real Forte Consultoria.
Regras:
- Use o método e os materiais da Real Forte abaixo. Quando usar uma solução da biblioteca, diga o título dela.
- Não invente números, nomes, sistemas ou fatos. Se faltar informação, diga o que perguntar e para quem.
- Perguntas sobre o que já existe no painel (a última, a mais recente, quais, quantas, o que entrou na biblioteca) se respondem pelo RESUMO DO PAINEL: as listas vêm da mais recente para a mais antiga, com data. "Feita" ou "entregue" quer dizer na etapa Resolvido (na biblioteca, origem "Oportunidade entregue" ou "Caso resolvido"). Se não tiver lá, diga que não há registro.
- Tudo o que você diz é sugestão: o consultor valida antes de usar.

REGRA PRINCIPAL: responda só o que foi perguntado, do tamanho que a pergunta pede.
- Cumprimento ou conversa ("olá", "tudo bem?", "obrigado"): responda em uma frase curta e simpática, sem dados, sem check-up, sem lista e sem gráfico.
- Pergunta simples: uma ou duas frases, sem blocos.
- O contexto, o diagnóstico, a biblioteca e os materiais abaixo são para consulta. Só traga deles o que a pergunta pede. Nunca mostre nota, check-up, gargalos ou números que não foram pedidos.
- Pedido de análise, causas, intervenções ou plano: aí sim use o formato abaixo.

FORMATO PARA ANÁLISE (o consultor lê rápido, muitas vezes no celular):
- Primeira linha: "## " e a resposta direta, em até 20 palavras.
- Depois, de 1 a 3 blocos. Cada bloco começa com "### " e um título curto, seguido de itens com "- ". No máximo 5 itens por bloco, cada um com até 20 palavras. Passos em ordem usam "1.", "2.", "3.".
- Comece o item com "Fato:" quando estiver nos dados, "Provável:" quando for hipótese. Use **negrito** só no essencial.
- O que confirmar vai numa linha "> Pergunte a <quem>: <pergunta>". No máximo duas, e só se precisar.
- Para comparar 2 a 4 opções em mais de um critério, use uma tabela: "| Opção | Esforço | O que muda |".
${pedeNumeros ? `- Gráfico: o consultor pediu números. Mostre num gráfico só os números que respondem à pergunta, tirados de NÚMEROS REGISTRADOS, em linhas próprias, exatamente assim:
\`\`\`grafico
{"tipo":"barras","titulo":"Nota do check-up por setor","unidade":"pontos","maximo":100,"dados":[["Logística",62],["Comercial",71]]}
\`\`\`
  Para horas antes e depois: {"tipo":"antes_depois","titulo":"Horas por mês","unidade":"h","dados":[["Conferência da carga",40,8]]}
  Não estime nem arredonde. Notas vão com "maximo":100. No máximo um gráfico, com até 8 itens. Se o número pedido não estiver registrado, diga que ainda não há esse número.
` : `- Não faça gráfico e não cite notas ou números do check-up: o consultor não pediu números.
`}- Português do Brasil, frases curtas, sem jargão e sem inglês. Sem introdução, sem repetir a pergunta e sem frase de encerramento.

${METODO_REAL_FORTE}

MATERIAIS AUTORIZADOS DA REAL FORTE:
${materiais.length ? materiais.map((m) => `[${m.titulo}] ${m.texto}`).join('\n\n') : '(nenhum material cadastrado)'}

SOLUÇÕES PARECIDAS NA BIBLIOTECA:
${biblioteca.length ? JSON.stringify(biblioteca, null, 1) : '(nenhuma parecida)'}

RESUMO DO PAINEL${e ? ' (só ' + e.nome + ')' : ' (todas as empresas)'}:
${JSON.stringify(resumoDoPainel(e))}

CONTEXTO ESCOLHIDO PELO CONSULTOR:
${Object.keys(contexto).length ? JSON.stringify(contexto, null, 1) : '(nenhum: pergunta geral)'}${pedeNumeros ? `\n\nNÚMEROS REGISTRADOS (os únicos que podem ir para um gráfico):\n${Object.keys(numeros).length ? JSON.stringify(numeros) : '(nenhum)'}` : ''}
${historico ? `\nCONVERSA ATÉ AQUI:\n${historico}\n` : ''}
PERGUNTA DO CONSULTOR:
${pergunta}`;
  // Por voz, as regras de formato escrito dão lugar às da conversa falada
  if (voz) { const a = pedido.indexOf('REGRA PRINCIPAL'), b = pedido.indexOf('MÉTODO DA REAL FORTE'); if (a > 0 && b > a) pedido = pedido.slice(0, a) + formatoDeVoz() + '\n\n' + pedido.slice(b); }
  return pedido;
}
/* Desenho da resposta da RF Intelligence
   A IA escreve num formato simples (as regras estão no pedido acima) e aqui ele vira tela:
   "## " resposta direta · "### " título de bloco · "- " item · "1." passo · "> " o que confirmar ·
   "| a | b |" tabela · bloco ```grafico {json}``` vira gráfico de barras. Todo texto é escapado antes. */
const negritos = (x) => esc(x).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const ETIQUETAS_IA = { 'fato': 'r-fato', 'provável': 'r-provavel', 'provavel': 'r-provavel', 'atenção': 'r-atencao' };
function itemIA(x) {
  const m = x.match(/^(Fato|Provável|Provavel|Atenção):\s*/i);
  if (!m) return negritos(x);
  return `<span class="r-tag ${ETIQUETAS_IA[m[1].toLowerCase()]}">${esc(m[1])}</span>${negritos(x.slice(m[0].length))}`;
}
const numeroBR = (v) => (Math.round(v * 10) / 10).toLocaleString('pt-BR');
function graficoIA(bruto) {
  let g; try { g = JSON.parse(bruto); } catch (x) { return ''; }
  if (!g || !Array.isArray(g.dados) || !g.dados.length) return '';
  const un = String(g.unidade || '').trim(); const comUn = (v) => numeroBR(v) + (un ? ' ' + esc(un) : '');
  const titulo = g.titulo ? `<span class="gr-titulo">${esc(g.titulo)}</span>` : '';
  if (g.tipo === 'antes_depois') {
    const itens = g.dados.slice(0, 8).map((d) => ({ rot: String(d[0] || ''), a: Number(d[1]), b: Number(d[2]) })).filter((x) => isFinite(x.a) && isFinite(x.b));
    if (!itens.length) return '';
    const max = Math.max(...itens.map((x) => Math.max(x.a, x.b))) || 1;
    const larg = (v) => Math.max(1.5, v / max * 100).toFixed(1) + '%';
    return `<figure class="grafico">${titulo}<span class="gr-legenda"><i class="antes"></i>Antes<i class="depois"></i>Depois</span>
      ${itens.map((x) => `<div class="gr-par"><span class="gr-rot">${esc(x.rot)}</span>
        <div class="gr-linha"><span class="gr-trilho"><i class="antes" style="width:${larg(x.a)}"></i></span><b>${comUn(x.a)}</b></div>
        <div class="gr-linha"><span class="gr-trilho"><i class="depois" style="width:${larg(x.b)}"></i></span><b>${comUn(x.b)}</b>${x.a > x.b ? `<em>−${comUn(x.a - x.b)}</em>` : ''}</div></div>`).join('')}</figure>`;
  }
  const itens = g.dados.slice(0, 10).map((d) => ({ rot: String(d[0] || ''), v: Number(d[1]) })).filter((x) => isFinite(x.v));
  if (!itens.length) return '';
  const max = Number(g.maximo) > 0 ? Number(g.maximo) : (Math.max(...itens.map((x) => x.v)) || 1);
  const topo = Math.max(...itens.map((x) => x.v)); const fundo = Math.min(...itens.map((x) => x.v));
  return `<figure class="grafico">${titulo}${itens.map((x) => `<div class="gr-linha cheia"><span class="gr-rot">${esc(x.rot)}</span><span class="gr-trilho"><i class="${itens.length > 1 && x.v === fundo && fundo !== topo ? 'menor' : ''}" style="width:${Math.max(1.5, Math.min(100, x.v / max * 100)).toFixed(1)}%"></i></span><b>${comUn(x.v)}</b></div>`).join('')}</figure>`;
}
function respostaIA(texto, aoVivo) {
  const linhas = String(texto || '').replace(/\r/g, '').split('\n');
  const saida = []; let lista = null, tabela = null;
  const fechar = () => {
    if (lista) { saida.push(`<${lista.tag} class="r-lista">${lista.itens.map((x) => `<li>${itemIA(x)}</li>`).join('')}</${lista.tag}>`); lista = null; }
    if (tabela) { const [cab, ...corpo] = tabela; saida.push(`<div class="r-tabela"><table><thead><tr>${cab.map((c) => `<th>${negritos(c)}</th>`).join('')}</tr></thead><tbody>${corpo.map((l) => `<tr>${l.map((c) => `<td>${negritos(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`); tabela = null; }
  };
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i].trim();
    if (/^```\s*grafico/i.test(l)) {
      fechar(); const fim = linhas.findIndex((x, j) => j > i && x.trim().startsWith('```'));
      if (fim < 0) { if (aoVivo) saida.push('<figure class="grafico montando"><span class="girando"></span> Montando o gráfico…</figure>'); break; }
      saida.push(graficoIA(linhas.slice(i + 1, fim).join('\n'))); i = fim; continue;
    }
    if (/^```/.test(l)) continue;
    if (!l) { fechar(); continue; }
    let m;
    if ((m = l.match(/^\|(.+)\|$/))) {
      if (lista) fechar();
      const celulas = m[1].split('|').map((c) => c.trim());
      if (celulas.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      (tabela = tabela || []).push(celulas); continue;
    }
    if (tabela) fechar();
    if ((m = l.match(/^#{1,2}\s+(.*)/)) && !/^###/.test(l)) { fechar(); saida.push(`<p class="r-direta">${negritos(m[1])}</p>`); continue; }
    if ((m = l.match(/^#{3,}\s+(.*)/))) { fechar(); saida.push(`<h4 class="r-titulo">${negritos(m[1])}</h4>`); continue; }
    if ((m = l.match(/^>\s*(.*)/))) { fechar(); saida.push(`<div class="r-confirmar">${icone('alerta')}<span>${negritos(m[1])}</span></div>`); continue; }
    if ((m = l.match(/^[-*•]\s+(.*)/))) { if (lista && lista.tag !== 'ul') fechar(); (lista = lista || { tag: 'ul', itens: [] }).itens.push(m[1]); continue; }
    if ((m = l.match(/^\d+[.)]\s+(.*)/))) { if (lista && lista.tag !== 'ol') fechar(); (lista = lista || { tag: 'ol', itens: [] }).itens.push(m[1]); continue; }
    fechar(); saida.push(`<p>${itemIA(l)}</p>`);
  }
  fechar();
  return saida.join('');
}
// Versão em texto corrido, para copiar, usar na proposta ou guardar na biblioteca
function textoLimpo(texto) {
  return String(texto || '').replace(/```\s*grafico\s*\n([\s\S]*?)```/gi, (_, j) => {
    try { const g = JSON.parse(j); const un = g.unidade ? ' ' + g.unidade : ''; return `${g.titulo || 'Números'}: ` + g.dados.map((d) => g.tipo === 'antes_depois' ? `${d[0]} ${numeroBR(d[1])}${un} → ${numeroBR(d[2])}${un}` : `${d[0]} ${numeroBR(d[1])}${un}`).join('; ') + '.'; } catch (x) { return ''; }
  }).replace(/^#{1,6}\s+/gm, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/^>\s*/gm, '').replace(/^\|?\s*:?-{2,}[^\n]*\n?/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}
async function perguntarIA(pergunta, rotulo) {
  const texto = String(pergunta || '').trim();
  if (!texto || !ia || UI.iaPensando) return;
  UI.chat = (UI.chat || []).concat([{ papel: 'voce', texto: rotulo || texto, pergunta: texto }]);
  UI.iaPensando = true; UI.iaRascunho = ''; UI.ocupado = true; render(true);
  if (UI.voz && UI.voz.porVoz) mostrarVoz('pensando', texto);
  const balao = () => document.getElementById('ia-resposta-viva');
  if (controleIA) controleIA.abort();
  controleIA = new AbortController();
  try {
    // Redesenha a resposta enquanto ela chega, no máximo uma vez por quadro de tela
    let ultimo = '', quadro = 0;
    const aoChegar = ({ text: parcial }) => { ultimo = parcial; if (quadro) return; quadro = requestAnimationFrame(() => { quadro = 0; const b = balao(); if (b) b.innerHTML = respostaIA(ultimo, true); }); };
    const { text } = await ia(montarPedidoIA(texto, !!(UI.voz && UI.voz.porVoz)), { signal: controleIA.signal, onText: aoChegar });
    UI.chat.push({ papel: 'ia', texto: String(text).trim() });
  } catch (x) {
    if (x && x.text) UI.chat.push({ papel: 'ia', texto: String(x.text).trim() });
    if (!(x && x.code === 'cancelled')) toast(mensagemErroIA(x), 'erro');
  } finally {
    controleIA = null; UI.iaPensando = false; UI.ocupado = false; render(true);
    const fim = document.querySelector('.chat .msg:last-child'); if (fim) fim.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    // Pergunta feita por voz (ou com "ler em voz alta" ligado): a resposta é falada
    const ultima = UI.chat[UI.chat.length - 1];
    if (ultima && ultima.papel === 'ia' && ((UI.voz && UI.voz.porVoz) || UI.iaFalar)) falar(ultima.texto); else mostrarVoz(null);
  }
}
function telaIA(rota) {
  const aba = rota.aba || 'conversa';
  const cab = `<header class="cab"><div><p class="olho">Real Forte Lab</p><h1>RF Intelligence</h1><p class="sub">Causas, intervenções e soluções já usadas, com gráfico quando houver números. Usa o método da Real Forte, os materiais e a biblioteca. Tudo é sugestão: você valida.</p></div></header>
    ${abas([['conversa', 'Conversa', '#ia'], ['materiais', 'Materiais autorizados', '#ia-materiais', S.materiais.length]], aba)}`;
  if (!ia) return cab + `<div class="aviso">${icone('alerta')}<div>A RF Intelligence funciona com o painel aberto no Claude, com a sua conta.</div></div>`;
  if (aba === 'materiais') return cab + telaMateriais();
  const { e, s, g } = contextoIA();
  const empresas = empresasAtivas();
  const setores = e ? setoresDa(e.id) : [];
  const gargalos = s ? itensDo(s.id) : [];
  const ctx = `<section class="painel ia-ctx"><span class="rotulo">Sobre o que é a conversa</span>
    <div class="ia-selects">
      <label>Empresa<select id="ia-empresa"><option value="">Pergunta geral</option>${empresas.map((x) => `<option value="${esc(x.id)}" ${e && e.id === x.id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label>
      <label>Setor<select id="ia-setor" ${e ? '' : 'disabled'}><option value="">Todos os setores</option>${setores.map((x) => `<option value="${esc(x.id)}" ${s && s.id === x.id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label>
      <label>Gargalo ou oportunidade<select id="ia-gargalo" ${s ? '' : 'disabled'}><option value="">Nenhum em especial</option>${gargalos.map((x) => `<option value="${esc(x.id)}" ${g && g.id === x.id ? 'selected' : ''}>${ehOport(x) ? 'Oportunidade: ' : ''}${esc(x.titulo)}</option>`).join('')}</select></label>
    </div>
    <div class="ia-rapidas">${Object.entries(ACOES_IA).map(([k, a]) => `<button class="btn" data-acao="iaRapida" data-id="${k}" ${UI.iaPensando ? 'disabled' : ''}>${icone('ia')}${esc(a.rotulo)}</button>`).join('')}</div>
    <p class="meta">Ela vai usar: o método da Real Forte · ${plural(S.materiais.length, 'material autorizado', 'materiais autorizados')} · ${plural(itensBiblioteca().length, 'solução da biblioteca', 'soluções da biblioteca')}${s ? ' · o diagnóstico e as anotações de ' + esc(s.nome) : ''}.</p>
  </section>`;
  const msgs = (UI.chat || []).map((m, i) => m.papel === 'voce'
    ? `<div class="msg voce"><p>${esc(m.texto)}</p></div>`
    : `<div class="msg ia"><span class="rotulo">RF Intelligence · sugestão para você validar</span><div class="resposta">${respostaIA(m.texto)}</div>
        <div class="msg-acoes">${window.speechSynthesis ? `<button class="btn peq" data-acao="iaOuvir" data-id="${i}">${icone('mic')}Ouvir</button>` : ''}<button class="btn peq" data-acao="iaCopiar" data-id="${i}">${icone('copiar')}Copiar</button>${g ? `<button class="btn peq so-editor" data-acao="iaProposta" data-id="${i}">${icone('documento')}Usar na proposta</button>` : ''}<button class="btn peq so-editor" data-acao="iaBiblioteca" data-id="${i}">${icone('mais')}Salvar na biblioteca</button></div></div>`).join('');
  const pensando = UI.iaPensando ? `<div class="msg ia"><span class="rotulo">RF Intelligence</span><div class="resposta" id="ia-resposta-viva"><p><span class="girando"></span> Pensando…</p></div></div>` : '';
  const chat = `<section class="chat">${msgs || pensando ? msgs + pensando : '<p class="vazio-mini">Escolha o contexto acima e use um dos atalhos, ou escreva sua pergunta.</p>'}</section>`;
  const caixa = `<form class="ia-caixa" data-form="perguntaIA">${painelVozHTML()}<textarea id="ia-pergunta" rows="2" placeholder="Pergunte à RF Intelligence. Ex.: por que o estoque não bate com o sistema?" aria-label="Sua pergunta"></textarea>
    <div class="ia-caixa-rodape"><div class="ia-rodape-esq">${(UI.chat || []).length ? '<button type="button" class="btn peq fantasma" data-acao="iaLimpar">Nova conversa</button>' : ''}${window.speechSynthesis ? `<label class="ia-falar"><input type="checkbox" id="ia-falar" ${UI.iaFalar ? 'checked' : ''}><span>Ler respostas em voz alta</span></label>` : ''}${seletorDeVoz()}</div>
      <div class="ia-rodape-dir"><button type="button" class="btn ia-mic" data-acao="iaVoz" ${UI.iaPensando ? 'disabled' : ''} aria-label="Perguntar falando" title="Perguntar falando">${icone('mic')}</button><button class="btn primario" ${UI.iaPensando ? 'disabled' : ''}>${icone('seta')}Perguntar</button></div></div></form>`;
  return cab + ctx + chat + caixa;
}
function telaMateriais() {
  const lista = S.materiais.slice().sort((a, b) => String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')));
  return `<section class="painel"><div class="painel-corpo mat-form so-editor"><h2>Novo material</h2><p class="meta">Metodologias, roteiros, apresentações e padrões de diagnóstico que a Real Forte autoriza a RF Intelligence a usar. Cole o texto ou escolha um arquivo .txt ou .md.</p>
      <div class="campo"><label for="mat-titulo">Título</label><input type="text" id="mat-titulo" placeholder="Ex.: Roteiro de visita ao estoque"></div>
      <div class="campo"><div class="campo-linha"><label for="mat-texto">Conteúdo</label><label class="btn peq" for="mat-arquivo">${icone('subir')}Escolher arquivo</label><input type="file" id="mat-arquivo" accept=".txt,.md,text/plain,text/markdown" hidden></div><textarea id="mat-texto" rows="8" placeholder="Cole aqui o texto do material"></textarea></div>
      <div class="acoes"><button class="btn primario" data-acao="salvarMaterial">${icone('ok')}Guardar material</button></div></div></section>
    <section class="bloco"><div class="bloco-cab"><h2>Materiais autorizados <span class="conta">${lista.length}</span></h2></div>
      ${lista.length ? `<div class="notas">${lista.map((m) => `<article class="nota"><div class="nota-cab"><b>${esc(m.titulo || 'Sem título')}</b><span class="dir"><span class="meta">${fmtHoras(String(m.texto || '').length / 1000)} mil caracteres</span><button class="btn peq fantasma perigo so-editor" data-acao="excluirMaterial" data-id="${esc(m.id)}">${icone('lixo')}Excluir</button></span></div><p class="nota-texto mat-trecho">${esc(String(m.texto || '').slice(0, 280))}${String(m.texto || '').length > 280 ? '…' : ''}</p></article>`).join('')}</div>` : '<p class="vazio-mini">Nenhum material ainda. Sem materiais, a RF Intelligence usa o método da Real Forte e a biblioteca.</p>'}
    </section>`;
}

/* ---------- PDF do Check-up para o cliente ---------- */
function dadosCheckup(e) {
  const ck = checkupDa(e.id);
  return {
    frente: nomeFrente(), consultor: nomeConsultor(), empresa: e.nome || '', segmento: [e.segmento, e.cidade].filter(Boolean).join(' · '),
    data: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
    nota: ck.nota, eixos: Object.entries(EIXOS).map(([k, nome]) => ({ nome, nota: ck.eixos[k] })),
    setores: ck.setores.slice().sort((a, b) => (a.d.nota == null ? 101 : a.d.nota) - (b.d.nota == null ? 101 : b.d.nota)).map(({ s, d }) => ({ nome: s.nome, tipo: d.nomeTipo, nota: d.nota, situacao: SAUDE[d.saude].nome, saude: d.saude, respondidas: d.respondidas, total: d.total, eixos: Object.keys(EIXOS).map((k) => d.eixos[k]) })),
    oportunidades: ck.oportunidades.slice(0, 15).map(({ s, x }) => ({ setor: s.nome, criterio: x.texto, critico: x.r === 'nao', eixo: EIXOS[x.eixo], evidencia: x.ev }))
  };
}
function montarPDFCheckup(JsPDF, D) {
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const L = 210, A = 297, M = 18, U = L - 2 * M, BAIXO = A - M - 8;
  const COR = { navy: [15, 35, 66], laranja: [217, 104, 26], tinta: [14, 26, 44], cinza: [90, 101, 119], claro: [169, 183, 206], linha: [225, 229, 235], fundo: [244, 246, 249], branco: [255, 255, 255], critico: [185, 54, 44], atencao: [176, 120, 18], saudavel: [28, 127, 82], sem: [140, 150, 168] };
  const corSaude = (k) => COR[k === 'critico' ? 'critico' : k === 'atencao' ? 'atencao' : k === 'saudavel' ? 'saudavel' : 'sem'];
  const T = limparTextoPDF;
  const cor = (c) => doc.setTextColor(c[0], c[1], c[2]);
  const fundo = (c) => doc.setFillColor(c[0], c[1], c[2]);
  const traco = (c) => doc.setDrawColor(c[0], c[1], c[2]);
  const fonte = (f, e, t) => { doc.setFont(f, e); doc.setFontSize(t); };
  let y = 0;
  const garantir = (h) => { if (y + h > BAIXO) { doc.addPage(); y = M + 6; } };
  function secao(etiqueta, nome) {
    garantir(26); y += 4;
    fonte('helvetica', 'bold', 7.5); cor(COR.laranja); doc.text(T(etiqueta).toUpperCase(), M, y, { charSpace: 0.7 });
    y += 7; fonte('times', 'bold', 16); cor(COR.navy); doc.text(T(nome), M, y);
    y += 3.5; traco(COR.linha); doc.setLineWidth(0.3); doc.line(M, y, L - M, y); y += 7;
  }
  // Capa: faixa azul com a nota geral
  fundo(COR.navy); doc.rect(0, 0, L, 74, 'F'); fundo(COR.laranja); doc.rect(0, 74, L, 1.6, 'F');
  fonte('helvetica', 'bold', 9); cor(COR.branco); doc.text('REAL FORTE', M, 18, { charSpace: 1.4 });
  fonte('helvetica', 'normal', 8.5); cor(COR.claro); doc.text(T(D.frente), M, 23.5);
  fonte('helvetica', 'normal', 8.5); doc.text(T(D.data), L - M, 18, { align: 'right' });
  fonte('times', 'bold', 26); cor(COR.branco); doc.text('Check-up Empresarial', M, 42);
  fonte('helvetica', 'bold', 12); cor(COR.laranja); doc.text(T(D.empresa), M, 51);
  if (D.segmento) { fonte('helvetica', 'normal', 9.5); cor(COR.claro); doc.text(T(D.segmento), M, 57.5); }
  // círculo da nota
  const cx = L - M - 22, cy = 44;
  fundo([24, 48, 86]); doc.circle(cx, cy, 20, 'F');
  fonte('times', 'bold', 26); cor(COR.branco); doc.text(D.nota == null ? '-' : String(D.nota), cx, cy + 3, { align: 'center' });
  fonte('helvetica', 'normal', 7.5); cor(COR.claro); doc.text('NOTA GERAL DE 0 A 100', cx, cy + 10, { align: 'center' });
  y = 88;
  fonte('helvetica', 'normal', 10); cor(COR.tinta);
  doc.splitTextToSize(T('Este check-up avalia cada setor com critérios padronizados da Real Forte, em quatro eixos: Processo, Informação e sistemas, Pessoas, Controle e indicadores. A nota mostra onde a empresa está bem e onde melhorar primeiro.'), U).forEach((l) => { doc.text(l, M, y); y += 5; });
  // Mapa por setor
  secao('Mapa da empresa', 'Nota por setor');
  D.setores.forEach((s) => {
    garantir(13);
    fonte('helvetica', 'bold', 10); cor(COR.tinta); doc.text(T(s.nome), M, y + 4);
    fonte('helvetica', 'normal', 7.5); cor(COR.cinza); doc.text(T(`${s.tipo} · ${s.respondidas} de ${s.total} critérios`), M, y + 8.5);
    const bx = M + 66, bw = U - 66 - 38;
    fundo(COR.fundo); doc.roundedRect(bx, y + 1.5, bw, 4.5, 2, 2, 'F');
    if (s.nota) { fundo(corSaude(s.saude)); doc.roundedRect(bx, y + 1.5, Math.max(4, bw * s.nota / 100), 4.5, 2, 2, 'F'); }
    fonte('times', 'bold', 13); cor(corSaude(s.saude)); doc.text(s.nota == null ? '-' : String(s.nota), L - M - 24, y + 5.5, { align: 'right' });
    fonte('helvetica', 'bold', 8); doc.text(T(s.situacao), L - M, y + 5, { align: 'right' });
    y += 13;
  });
  // Eixos
  secao('Visão por eixo', 'Média dos setores avaliados');
  const largEixo = (U - 9) / 4;
  garantir(26);
  D.eixos.forEach((ex, i) => {
    const x = M + i * (largEixo + 3);
    fundo(COR.fundo); doc.roundedRect(x, y, largEixo, 22, 2, 2, 'F');
    fonte('times', 'bold', 18); cor(COR.navy); doc.text(ex.nota == null ? '-' : String(ex.nota), x + 5, y + 10);
    fonte('helvetica', 'normal', 8); cor(COR.cinza); doc.splitTextToSize(T(ex.nome), largEixo - 8).forEach((l, k) => doc.text(l, x + 5, y + 15.5 + k * 3.6));
  });
  y += 28;
  // Oportunidades
  secao('Onde melhorar primeiro', 'Critérios que ainda não estão atendidos');
  if (!D.oportunidades.length) { fonte('helvetica', 'normal', 10); cor(COR.cinza); doc.text('Nenhum critério não atendido nos setores avaliados.', M, y); y += 6; }
  D.oportunidades.forEach((o, i) => {
    const linhas = doc.splitTextToSize(T(o.criterio), U - 30);
    const extra = o.evidencia ? doc.splitTextToSize(T('O que foi visto: ' + o.evidencia), U - 30) : [];
    const h = 6 + linhas.length * 4.6 + extra.length * 4 + 3;
    garantir(h);
    fundo(o.critico ? COR.critico : COR.atencao); doc.roundedRect(M, y, 20, 5.5, 1.5, 1.5, 'F');
    fonte('helvetica', 'bold', 7); cor(COR.branco); doc.text(o.critico ? 'CRÍTICO' : 'ATENÇÃO', M + 10, y + 3.8, { align: 'center' });
    fonte('helvetica', 'bold', 9.5); cor(COR.tinta); linhas.forEach((l, k) => doc.text(l, M + 26, y + 4 + k * 4.6));
    let yy = y + 4 + linhas.length * 4.6;
    fonte('helvetica', 'normal', 8); cor(COR.cinza); doc.text(T(`${o.setor} · ${o.eixo}`), M + 26, yy); yy += 4;
    extra.forEach((l) => { doc.text(l, M + 26, yy); yy += 4; });
    y = yy + 3;
  });
  // Como ler
  secao('Como ler', 'Como a nota é calculada');
  fonte('helvetica', 'normal', 9.5); cor(COR.tinta);
  doc.splitTextToSize(T('Cada critério respondido vale 100 (atendido), 50 (atendido em parte) ou 0 (não atendido). A nota do setor é a média dos critérios respondidos, e a nota geral é a média dos setores avaliados. Um setor fica Crítico quando algum critério não é atendido, e em Atenção quando algum é atendido só em parte.'), U).forEach((l) => { garantir(5); doc.text(l, M, y); y += 5; });
  // Rodapé em todas as páginas
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p); fonte('helvetica', 'normal', 7.5); cor(COR.cinza);
    doc.text(T(`Real Forte Consultoria · Check-up Empresarial · ${D.empresa}`), M, A - 10);
    doc.text(`Página ${p} de ${paginas}`, L - M, A - 10, { align: 'right' });
  }
  return doc;
}
async function gerarPDFCheckup(empresaId) {
  const e = empresaPorId(empresaId); if (!e) return;
  if (!downloads) { toast('Baixar o PDF funciona com o painel aberto no Claude.', 'erro'); return; }
  const Construtor = window.jspdf && window.jspdf.jsPDF;
  if (!Construtor) { toast('O gerador de PDF não carregou. Confira a internet e recarregue a página.', 'erro'); return; }
  const botao = $('#botao-checkup'); if (botao) { botao.disabled = true; botao.innerHTML = '<span class="girando"></span>Gerando…'; }
  try {
    const arquivo = montarPDFCheckup(Construtor, dadosCheckup(e)).output('blob');
    const r = await downloads.save({ filename: `Check-up Empresarial - ${nomeArquivo(e.nome)} - ${hojeISO()}.pdf`, data: arquivo });
    if (r && r.status === 'saved') toast('Check-up salvo. É só mandar para o cliente.');
  } catch (x) {
    const c = x && x.code;
    toast(c === 'declined' ? 'Download cancelado.' : c === 'rate_limited' ? 'Já tem um download esperando confirmação.' : 'Não deu para gerar o PDF agora.', c === 'declined' ? '' : 'erro');
  } finally { const b = $('#botao-checkup'); if (b) { b.disabled = !downloads; b.innerHTML = icone('pdf') + 'Baixar check-up para o cliente'; } }
}

/* ---------- 16. Ações na própria tela ---------- */
// Foto: reduzida para guardar leve (lado maior até 1400 px, JPEG)
function reduzirFoto(arquivo) {
  return new Promise((ok, falha) => {
    const img = new Image(); const url = URL.createObjectURL(arquivo);
    img.onload = () => {
      const k = Math.min(1, 1400 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob((blob) => {
        if (!blob) { falha(new Error('foto')); return; }
        const leitor = new FileReader(); leitor.onload = () => ok({ blob, dataUrl: leitor.result }); leitor.onerror = falha; leitor.readAsDataURL(blob);
      }, 'image/jpeg', 0.78);
    };
    img.onerror = () => { URL.revokeObjectURL(url); falha(new Error('foto')); };
    img.src = url;
  });
}
function promptFoto(s) {
  return `Você é consultor da Real Forte Consultoria fazendo o diagnóstico de processos do setor ${s.nome}. A imagem é uma foto tirada na visita: pode ser o estoque, um papel, um caderno, um quadro ou a tela de uma planilha ou sistema.
Descreva em 1 a 3 frases curtas o problema que a foto mostra sobre como o trabalho é feito hoje (desorganização, coisa preenchida à mão, informação repetida, risco de erro).
Use só o que dá para ver. Não invente números nem nomes. Português do Brasil, frases curtas, sem jargão.
Responda só com o texto.`;
}
// Áudio: o armazenamento aceita o formato do gravador do celular (m4a/mp4) e webm
function tipoDoAudio(arq) {
  const tipo = String(arq.type || '').toLowerCase(), nome = String(arq.name || '').toLowerCase();
  if (/mp4|m4a|aac/.test(tipo) || /\.(m4a|mp4|aac)$/.test(nome)) return 'video/mp4';
  if (/webm/.test(tipo) || /\.webm$/.test(nome)) return 'video/webm';
  return '';
}
/* ---------- Arquivo na anotação (planilha, PDF, documento) ----------
   O cofre de arquivos do painel só aceita alguns formatos (foto, áudio, PDF, texto). Para guardar uma
   planilha do jeito que ela é (com fórmulas, abas e formatação), o arquivo vai dentro de um "envelope"
   de texto: um .json com o nome, o tipo e o conteúdo em base64. Cada envelope cabe no máximo 20 MB e o
   base64 cresce cerca de 1/3, então o arquivo é cortado em partes de 14 MB (um envelope por parte).
   No Baixar, o painel junta as partes e devolve o arquivo original, idêntico. */
const ACEITA_ARQUIVO = '.xlsx,.xlsm,.xls,.ods,.csv,.pdf,.docx,.doc,.pptx,.ppt,.txt,.json,.xml';
const LIMITE_ARQUIVO = 100 * 1024 * 1024, PARTE_ARQUIVO = 14 * 1024 * 1024, MAX_ARQUIVOS = 10;   /* por arquivo, por parte, por anotação */
// O que a pessoa quer que aconteça com o arquivo (vai junto para a IA quando transformar em gargalos)
const PEDIDOS_ARQUIVO = [['', 'O que fazer com ele?'], ['automatizar', 'Automatizar'], ['ferramenta', 'Virar ferramenta nova'], ['consulta', 'Só para consulta']];
const textoPedido = (k) => (PEDIDOS_ARQUIVO.find(([c]) => c === k) || ['', ''])[1];
const tamanhoLegivel = (n) => !n ? '' : n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';
function lerComoBase64(arq) {
  return new Promise((ok, falha) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => falha(r.error); r.readAsDataURL(arq); });
}
async function anexarArquivos(lista, s) {
  for (const arq of lista) {
    if (UI.anexosNovos.filter((a) => a.tipo === 'arquivo').length >= MAX_ARQUIVOS) { toast(`Até ${MAX_ARQUIVOS} arquivos por anotação. Guarde esta e anexe o resto em outra.`); break; }
    await anexarArquivo(arq, s);
  }
  render(true);
}
async function anexarArquivo(arq, s) {
  if (arq.size > LIMITE_ARQUIVO) { toast(`${arq.name}: grande demais. O limite é 100 MB por arquivo.`, 'erro'); return; }
  UI.anexosNovos.push({ tipo: 'arquivo', blob: arq, nome: arq.name || 'arquivo', tamanho: arq.size, tipoOriginal: arq.type || '', pedido: '' });
  // Planilha em texto (.csv): as colunas vão para a anotação, para a IA saber do que se trata
  if (/\.csv$/i.test(arq.name || '') && arq.size < 2 * 1024 * 1024) {
    try {
      const linha = (await arq.text()).split(/\r?\n/).find((l) => l.trim()) || '';
      if (linha) { const atual = String(UI.rascunho[s.id] || '').replace(/\s+$/, ''); UI.rascunho[s.id] = (atual ? atual + '\n\n' : '') + `Arquivo ${arq.name}: colunas ${linha.slice(0, 300)}`; }
    } catch (_) { /* sem as colunas, o arquivo vai do mesmo jeito */ }
  }
}
// Guarda um arquivo em partes (envelopes de até 14 MB de arquivo cada); devolve o registro da anotação
async function guardarArquivo(a, aviso) {
  const total = Math.max(1, Math.ceil(a.blob.size / PARTE_ARQUIVO)), partes = [];
  try {
    for (let k = 0; k < total; k++) {
      if (aviso) aviso(k + 1, total);
      const base64 = await lerComoBase64(a.blob.slice(k * PARTE_ARQUIVO, (k + 1) * PARTE_ARQUIVO));
      const env = JSON.stringify({ formato: 'rf-arquivo-2', nome: a.nome, tipo: a.tipoOriginal || 'application/octet-stream', tamanho: a.tamanho, parte: k + 1, total, base64 });
      const r = await assets.upload(new Blob([env], { type: 'application/json' }), { type: 'application/json' });
      urlsSessao[r.id] = r.url; partes.push(r.id);
    }
  } catch (x) { partes.forEach((id) => assets.delete(id).catch(() => {})); throw x; }   /* se uma parte falhar, não sobra arquivo pela metade */
  return { id: partes[0], partes, tipo: 'arquivo', nome: a.nome, tamanho: a.tamanho || 0, tipoOriginal: a.tipoOriginal || '', pedido: a.pedido || '' };
}
// Baixar: abre o envelope e entrega o arquivo original
async function baixarAnexo(id) {
  if (!downloads) { toast('Baixar arquivos funciona com o painel aberto no Claude.', 'erro'); return; }
  try {
    const reg = S.diario.reduce((achou, n) => achou || (Array.isArray(n.anexos) ? n.anexos.find((a) => a.id === id) : null), null);
    const ids = reg && Array.isArray(reg.partes) && reg.partes.length ? reg.partes : [id];
    let nome = 'arquivo', tipo = 'application/octet-stream'; const pedacos = [];
    for (const pid of ids) {
      const env = await (await fetch(srcAnexo(pid))).json(); nome = env.nome || nome; tipo = env.tipo || tipo;
      const bin = atob(env.base64 || ''), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      pedacos.push(bytes);
    }
    await downloads.save({ filename: nome, data: new Blob(pedacos, { type: tipo }) });
  } catch (x) { if (!(x && /cancel|declin|denied/i.test(String(x.code || x.message)))) toast('Não deu para baixar o arquivo agora.', 'erro'); }
}
async function anexar(input) {
  const varios = input.files ? [...input.files] : [], arq = varios[0]; input.value = '';   /* arquivo aceita vários de uma vez */
  const s = setorPorId(rotaAtual().id);
  if (!arq || !s) return;
  if (input.dataset.anexo === 'foto') {
    if (UI.anexosNovos.filter((a) => a.tipo === 'foto').length >= 4) { toast('Até 4 fotos por anotação.'); return; }
    let foto;
    try { foto = await reduzirFoto(arq); } catch (_) { toast('Não deu para abrir essa foto.', 'erro'); return; }
    UI.anexosNovos.push({ tipo: 'foto', blob: foto.blob, preview: foto.dataUrl, type: 'image/jpeg' });
    render(true);
    // A IA olha a foto e escreve no texto o que viu (você pode mudar antes de guardar)
    const lim = ia ? await ia.limits().catch(() => null) : null;
    if (!lim || !lim.images) return;
    UI.lendoFoto = true; render(true);
    try {
      const { text } = await ia(promptFoto(s), { images: [foto.blob] });
      const atual = String(UI.rascunho[s.id] || '').replace(/\s+$/, '');
      UI.rascunho[s.id] = (atual ? atual + '\n\n' : '') + 'Foto: ' + String(text).trim();
    } catch (x) { if (!(x && x.code === 'cancelled')) toast(mensagemErroIA(x), 'erro'); }
    finally { UI.lendoFoto = false; render(true); }
    return;
  }
  if (input.dataset.anexo === 'arquivo') { await anexarArquivos(varios, s); return; }
  const tipo = tipoDoAudio(arq);
  if (!tipo) { toast('Esse formato de áudio o painel não guarda. Grave pelo gravador do celular (arquivo .m4a).', 'erro'); return; }
  if (arq.size > 20 * 1024 * 1024) { toast('Áudio grande demais. O limite é 20 MB.', 'erro'); return; }
  UI.anexosNovos.push({ tipo: 'audio', blob: arq, preview: URL.createObjectURL(arq), type: tipo, nome: arq.name || '' });
  render(true);
}
function erroAnexo(x) {
  const c = x && x.code;
  if (c === 'too_large') return 'Arquivo grande demais para guardar.';
  if (c === 'unsupported_type') return 'Esse tipo de arquivo o painel não guarda.';
  if (c === 'quota_or_state') return 'O espaço para fotos, áudios e arquivos encheu.';
  if (c === 'rate_limited') return 'Muitos envios seguidos. Espere um pouco e tente de novo.';
  if (c === 'not_granted' || c === 'capability_disabled' || c === 'capability_removed') return 'Guardar fotos e áudios não está liberado nesta visualização.';
  return (x && x.message && !c) ? x.message : 'Não deu para guardar agora. Tente de novo.';
}
function verFoto(id) {
  dlg.className = 'dlg largo';
  dlg.innerHTML = `<div class="dlg-form"><div class="dlg-cab"><div><h2 id="dlg-titulo">Foto da visita</h2></div><button type="button" class="icone-btn" data-fechar aria-label="Fechar">${icone('x')}</button></div><div class="dlg-corpo"><img class="foto-grande" src="${esc(srcAnexo(id))}" alt="Foto tirada no setor" style="grid-column:1/-1"></div></div>`;
  dlg.showModal();
}

// Transformar o que eu vi em gargalos: a IA devolve as sugestões, que aparecem abaixo do botão
async function transformarEmGargalos(setorId) {
  const s = setorPorId(setorId); if (!s || !ia) return;
  if (!anotacoesParaTransformar(s).length) { toast('Escreva o que você viu antes de transformar.'); return; }
  if (controleIA) controleIA.abort();
  controleIA = new AbortController();
  UI.sugestoes = { setorId: s.id, estado: 'lendo', lista: [] }; render(true);
  try {
    const resposta = await ia.json(promptTransformar(s), { signal: controleIA.signal });
    const lista = Array.isArray(resposta) ? resposta : (resposta && Array.isArray(resposta.gargalos) ? resposta.gargalos : []);
    UI.sugestoes = { setorId: s.id, estado: 'pronto', lista: lista.filter((x) => x && typeof x === 'object' && x.titulo).slice(0, 8) };
  } catch (x) {
    UI.sugestoes = x && x.code === 'cancelled' ? null : { setorId: s.id, estado: 'erro', lista: [], erro: mensagemErroIA(x) };
  } finally { controleIA = null; render(); }
}
async function adicionarSugestao(indice, silencioso) {
  const sg = UI.sugestoes; const x = sg && sg.lista[Number(indice)]; const s = sg && setorPorId(sg.setorId);
  if (!x || !s || x.adicionado) return;
  const agora = agoraISO();
  try {
    const op = x.tipo === 'oportunidade';
    await gravar('gargalos', novoId('g'), Object.assign({ empresaId: s.empresaId, setorId: s.id, titulo: String(x.titulo), observacao: String(x.observacao || ''), proposta: String(x.proposta || ''), situacao: temTexto(x.proposta) ? 'Proposta pronta' : 'Aberto', origemIA: true, criadoEm: agora, atualizadoEm: agora, movimentos: [{ em: agora, texto: 'Encontrado pela IA nas anotações' }] }, op ? { tipo: 'oportunidade' } : {}));
    x.adicionado = true;
    if (!silencioso) { toast(op ? 'Oportunidade adicionada.' : 'Gargalo adicionado.', '', { rotulo: 'Ver', fn: () => { location.hash = (op ? 'so-' : 'sg-') + s.id; } }); render(); }
  } catch (erro) { toast(erro.message, 'erro'); }
}

// Proposta escrita pela IA dentro do próprio campo; ao terminar, fica salva
async function sugerirPropostaInline(id) {
  const g = gargaloPorId(id); const area = $('#proposta-' + id); const botao = $('#ia-' + id);
  if (!g || !area || !botao || !ia) return;
  if (controleIA) { controleIA.abort(); return; }
  const antes = area.value;
  UI.ocupado = true;
  try { await escreverPropostaComIA(Object.assign({}, g, { titulo: g.titulo }), area, botao); }
  finally { UI.ocupado = false; }
  const nova = area.value.trim();
  if (nova && nova !== 'Pensando…' && nova !== antes.trim()) {
    try { await salvarGargalo(gargaloPorId(id) || g, { proposta: nova }, 'Proposta escrita com a IA'); toast('Proposta salva.'); } catch (x) { toast(x.message, 'erro'); }
  }
  render(true);
}

// PowerPoint direto do cartão: a IA monta o conteúdo (uma vez por proposta) e o arquivo baixa
async function baixarPPT(id) {
  const g = gargaloPorId(id); if (!g || UI.gerandoPPT) return;
  if (!downloads) { toast('Baixar o PowerPoint funciona com o painel aberto no Claude.', 'erro'); return; }
  if (!window.PptxGenJS) { toast('O gerador de PowerPoint não carregou. Confira a internet e recarregue a página.', 'erro'); return; }
  UI.gerandoPPT = id; render(true);
  try {
    const propostaAtual = String(g.proposta || '');
    let c = g.apresentacao && g.apresentacaoDe === propostaAtual ? normalizarConteudo(g.apresentacao, g) : null;
    if (!c && ia) {
      try {
        // Uma segunda tentativa se a primeira resposta da IA vier quebrada
        let bruto;
        try { bruto = await ia.json(promptApresentacao(g)); } catch (x) { if (x && (x.code === 'cancelled' || x.code === 'not_granted' || x.code === 'rate_limited')) throw x; bruto = await ia.json(promptApresentacao(g)); }
        c = normalizarConteudo(bruto, g);
        await gravar('gargalos', g.id, Object.assign({}, gargaloPorId(g.id) || g, { apresentacao: c, apresentacaoDe: propostaAtual }));
      } catch (x) { if (!(x && x.code === 'cancelled')) toast(mensagemErroIA(x) + ' Os slides vão só com o que está escrito.', 'erro'); c = null; }
    }
    if (!c) c = normalizarConteudo(conteudoBasico(g), g);
    const arquivo = await montarPPT(window.PptxGenJS, dadosApresentacao(g, c)).write({ outputType: 'blob' });
    const r = await downloads.save({ filename: `Proposta - ${nomeArquivo(c.titulo)} - ${nomeArquivo((setorPorId(g.setorId) || {}).nome || '')}.pptx`, data: arquivo });
    if (r && r.status === 'saved') toast('PowerPoint salvo. Depois de mandar ao setor, marque “Apresentado”.');
  } catch (x) {
    const code = x && x.code;
    if (code === 'declined') toast('Download cancelado.');
    else if (code === 'rate_limited') toast('Já tem um download esperando confirmação.');
    else toast('Não deu para gerar o PowerPoint agora.', 'erro');
  } finally { UI.gerandoPPT = ''; render(true); }
}

// Copia o prompt e oferece abrir o Claude
async function copiarPrompt(texto) {
  try { await navigator.clipboard.writeText(texto); toast('Prompt copiado. Cole numa conversa nova do Claude.', '', { rotulo: 'Abrir o Claude', fn: () => window.open('https://claude.ai/new', '_blank', 'noopener') }); }
  catch (_) { abrirPrompt('Copie o prompt', 'Selecione o texto e use copiar do seu aparelho.', texto); const area = $('#f-prompt'); if (area) { area.focus(); area.select(); } }
}

const ACOES = {
  abrirMenu: () => $('#app').classList.add('menu-aberto'),
  fecharMenu: () => $('#app').classList.remove('menu-aberto'),
  verArquivadas: () => { UI.verArquivadas = !UI.verArquivadas; render(); },
  novaEmpresa: () => formEmpresa(null),
  campoRecentrar: () => recentrarCampo(),
  campoHora: () => trocarHoraDoCampo(),
  editarEmpresa: (id) => formEmpresa(empresaPorId(id)),
  apagarEmpresa: (id) => {
    const e = empresaPorId(id); if (!e) return;
    dlg.className = 'dlg';
    dlg.innerHTML = `<div class="dlg-form"><div class="dlg-cab"><div><h2 id="dlg-titulo">Apagar ${esc(e.nome)}?</h2><p>Some junto com os setores, anotações e gargalos dela. Não dá para desfazer.</p></div><button type="button" class="icone-btn" data-fechar aria-label="Fechar">${icone('x')}</button></div>
      <div class="dlg-corpo"><p class="erro-form" id="erro-form" hidden></p></div>
      <div class="dlg-rodape"><div class="dir"><button type="button" class="btn" data-fechar>Cancelar</button><button type="button" class="btn perigo cheio" id="botao-apagar">${icone('lixo')}Apagar</button></div></div></div>`;
    dlg.showModal();
    $('#botao-apagar').addEventListener('click', async () => {
      $('#botao-apagar').disabled = true;
      try { await apagarEmpresaInteira(id); if (dlg.open) dlg.close(); toast('Empresa apagada.'); } catch (x) { const er = $('#erro-form'); er.textContent = x.message; er.hidden = false; }
    });
  },
  novoSetor: (empresaId) => formSetor(null, empresaId),
  editarSetor: (id) => formSetor(setorPorId(id)),
  // O que eu vi
  salvarNota: async (setorId) => {
    const s = setorPorId(setorId); if (!s || UI.guardando) return;
    const texto = String(UI.rascunho[s.id] || '').trim(); const novos = UI.anexosNovos.slice();
    if (!texto && !novos.length) { const a = $('#nova-nota'); if (a) a.focus(); toast('Escreva, tire uma foto, grave um áudio ou anexe um arquivo antes de guardar.'); return; }
    if (novos.length && !assets) { toast('Guardar fotos, áudios e arquivos funciona com o painel aberto no Claude.', 'erro'); return; }
    UI.guardando = true; render(true);
    try {
      const anexos = [];
      for (const a of novos) { if (a.tipo === 'arquivo') { anexos.push(await guardarArquivo(a, (k, n) => { const b = document.querySelector('[data-acao="salvarNota"]'); if (b) b.innerHTML = `<span class="girando"></span>Guardando ${esc(a.nome)}${n > 1 ? ` (${k}/${n})` : ''}…`; })); continue; } const r = await assets.upload(a.blob, { type: a.type }); urlsSessao[r.id] = r.url; anexos.push({ id: r.id, tipo: a.tipo, nome: a.nome || '' }); }
      await gravar('diario', novoId('d'), { empresaId: s.empresaId, setorId: s.id, data: hojeISO(), texto, anexos });
      UI.rascunho[s.id] = ''; UI.anexosNovos = [];
      toast('Anotação guardada.');
    } catch (x) { toast(erroAnexo(x), 'erro'); }
    finally { UI.guardando = false; render(true); }
  },
  tirarAnexo: (i) => { UI.anexosNovos.splice(Number(i), 1); render(true); },
  baixarAnexo: (id) => baixarAnexo(id),
  verFoto: (id) => verFoto(id),
  // Diagnóstico do setor
  // Check-up, biblioteca e RF Intelligence
  pdfCheckup: (id) => gerarPDFCheckup(id),
  novaSolucao: () => formSolucao(null),
  editarSolucao: (id) => formSolucao(S.biblioteca.find((b) => b.id === id)),
  abrirBib: (id) => { UI.bibAberto = UI.bibAberto === id ? '' : id; render(true); },
  bibTipo: (k) => { UI.bibTipo = k || ''; render(true); },
  copiarBib: (id) => { const x = itensBiblioteca().find((i) => i.id === id); if (x) copiarTexto(`${x.titulo}\n\nProblema: ${x.problema}\n\nSolução: ${x.solucao}${x.link ? `\n\nFerramenta: ${x.link}` : ''}`, 'Copiado.'); },
  perguntarBib: (id) => {
    const x = itensBiblioteca().find((i) => i.id === id); if (!x) return;
    location.hash = 'ia';
    setTimeout(() => perguntarIA(`Como eu adapto esta solução da biblioteca para o contexto escolhido? Solução: "${x.titulo}". Problema: ${x.problema}. Como foi resolvido: ${x.solucao}`, `Como adaptar “${x.titulo}”?`), 60);
  },
  iaRapida: (k) => { const a = ACOES_IA[k]; if (a) perguntarIA(a.texto, a.rotulo); },
  iaLimpar: () => { if (controleIA) controleIA.abort(); pararVoz(); UI.chat = []; render(true); },
  iaVoz: () => ouvirPergunta(),
  vozParar: () => pararVoz(),
  iaOuvir: (i) => { const m = UI.chat[Number(i)]; if (m) falar(m.texto); },
  iaCopiar: (i) => { const m = UI.chat[Number(i)]; if (m) copiarTexto(textoLimpo(m.texto), 'Resposta copiada.'); },
  iaProposta: async (i) => {
    const m = UI.chat[Number(i)]; const { g } = contextoIA(); if (!m || !g) return;
    const anterior = g.proposta || '';
    try {
      await salvarGargalo(g, { proposta: textoLimpo(m.texto) }, 'Proposta escrita com a RF Intelligence');
      toast(`Proposta de “${g.titulo}” atualizada.`, '', { rotulo: 'Desfazer', fn: () => salvarGargalo(gargaloPorId(g.id) || g, { proposta: anterior }, '').catch((x) => toast(x.message, 'erro')) });
    } catch (x) { toast(x.message, 'erro'); }
  },
  iaBiblioteca: async (i) => {
    const m = UI.chat[Number(i)]; if (!m) return;
    const { s, g } = contextoIA(); const pergunta = (UI.chat[Number(i) - 1] || {}).texto || '';
    try {
      await gravar('biblioteca', novoId('b'), { titulo: g ? g.titulo : pergunta.slice(0, 80) || 'Sugestão da RF Intelligence', tipo: s ? tipoDoSetor(s) : 'geral', problema: g ? (g.observacao || g.titulo) : pergunta, solucao: textoLimpo(m.texto), origem: 'intelligence', criadoEm: agoraISO() });
      toast('Salvo na biblioteca.', '', { rotulo: 'Ver', fn: () => { location.hash = 'biblioteca'; } });
    } catch (x) { toast(x.message, 'erro'); }
  },
  salvarMaterial: async () => {
    const titulo = $('#mat-titulo').value.trim(), texto = $('#mat-texto').value.trim();
    if (!texto) { toast('Cole o texto do material antes de guardar.'); return; }
    // O armazenamento guarda até 256 KB por registro: material muito grande é dividido em partes
    const partes = []; for (let i = 0; i < texto.length; i += 60000) partes.push(texto.slice(i, i + 60000));
    try {
      for (let i = 0; i < partes.length; i++) await gravar('materiais', novoId('m'), { titulo: (titulo || 'Material') + (partes.length > 1 ? ` (parte ${i + 1} de ${partes.length})` : ''), texto: partes[i], criadoEm: agoraISO() });
      toast(partes.length > 1 ? `Material guardado em ${partes.length} partes.` : 'Material guardado.'); render(true);
    } catch (x) { toast(x.message, 'erro'); }
  },
  excluirMaterial: async (id, botao) => {
    if (botao.dataset.confirmar !== '1') { botao.dataset.confirmar = '1'; botao.classList.add('cheio'); botao.innerHTML = icone('lixo') + 'Confirmar'; return; }
    try { await apagarRegistro('materiais', id); toast('Material excluído.'); render(true); } catch (x) { toast(x.message, 'erro'); }
  },
  responder: async (id, botao) => {
    const s = setorPorId(id); if (!s) return;
    const pergunta = botao.dataset.pergunta, valor = botao.dataset.valor;
    const diag = Object.assign({ respostas: {} }, s.diagnostico || {}); const respostas = Object.assign({}, diag.respostas);
    const atual = respostas[pergunta] || {};
    respostas[pergunta] = Object.assign({}, atual, { r: atual.r === valor ? '' : valor });
    try { await gravar('setores', s.id, Object.assign({}, s, { tipo: tipoDoSetor(s), diagnostico: { respostas, atualizadoEm: agoraISO() } })); render(true); }
    catch (x) { toast(x.message, 'erro'); }
  },
  editarNota: (id) => { UI.editandoNota = id; render(true); const a = $('#editar-nota'); if (a) { a.focus(); a.setSelectionRange(a.value.length, a.value.length); } },
  cancelarNota: () => { UI.editandoNota = ''; render(true); },
  guardarNota: async (id) => {
    const n = S.diario.find((x) => x.id === id); const a = $('#editar-nota'); if (!n || !a) return;
    if (!a.value.trim() && !(Array.isArray(n.anexos) && n.anexos.length)) { toast('A anotação ficou vazia. Para apagar, use Excluir.'); return; }
    try { await gravar('diario', id, Object.assign({}, n, { texto: a.value.trim() })); UI.editandoNota = ''; a.blur(); toast('Anotação guardada.'); render(true); }
    catch (x) { toast(x.message, 'erro'); }
  },
  excluirNota: async (id, botao) => {
    if (botao.dataset.confirmar !== '1') { botao.dataset.confirmar = '1'; botao.classList.add('cheio'); botao.innerHTML = icone('lixo') + 'Confirmar'; return; }
    const n = S.diario.find((x) => x.id === id);
    try {
      await apagarRegistro('diario', id); UI.editandoNota = ''; toast('Anotação excluída.'); render(true);
      // Apaga também as fotos e áudios dela (se falhar, só sobra o arquivo guardado)
      if (assets && n && Array.isArray(n.anexos)) for (const a of n.anexos) for (const id of (Array.isArray(a.partes) && a.partes.length ? a.partes : [a.id])) assets.delete(id).catch(() => {});
    } catch (x) { toast(x.message, 'erro'); }
  },
  transformar: (id) => transformarEmGargalos(id),
  adicionarSugestao: (i) => adicionarSugestao(i),
  adicionarTodas: async () => { const sg = UI.sugestoes; if (!sg) return; for (let i = 0; i < sg.lista.length; i++) if (!sg.lista[i].adicionado) await adicionarSugestao(i, true); toast('Gargalos adicionados.'); render(); },
  fecharSugestoes: () => { if (controleIA) controleIA.abort(); UI.sugestoes = null; render(true); },
  // Gargalos
  abrirG: (id) => {
    UI.aberto = UI.aberto === id ? '' : id; render(true);
    const card = document.getElementById('g-' + id);
    if (UI.aberto && card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },
  etapa: async (id, botao) => {
    const nova = botao.dataset.situacao;
    const resolveu = nova === 'Resolvido' && campoDisponivel();
    const moveu = await mudarSituacao(id, nova, { mensagem: resolveu ? `${nomeEtapa(gargaloPorId(id) || {}, nova)}! A ilha da empresa vai comemorar no Início.` : `Etapa: ${nomeEtapa(gargaloPorId(id) || {}, nova)}.` });
    if (moveu && resolveu) comemorarNoCampo(id);
    if (moveu) { render(true); if (nova === 'Resolvido') { const el = $('#h-antes'); if (el) el.focus(); } }
  },
  salvarHoras: async (id) => {
    const g = gargaloPorId(id); if (!g) return;
    const antes = $('#h-antes').value.trim(), depois = $('#h-depois').value.trim();
    const a = numero(antes), d = numero(depois);
    if ((antes && a == null) || (depois && d == null)) { toast('Use só números nas horas, por exemplo 40 ou 7,5.', 'erro'); return; }
    if (a != null && d != null && d > a) { toast('O depois ficou maior que o antes. Confira os números.', 'erro'); return; }
    try {
      await salvarGargalo(g, { horasAntes: antes, horasDepois: depois }, a != null && d != null ? `Horas registradas: ${fmtHoras(a)} h → ${fmtHoras(d)} h por mês` : '');
      if (a != null && d != null) { UI.festa = { id, texto: `+${fmtHoras(a - d)} h/mês devolvidas` }; if (situacaoDe(gargaloPorId(id) || g) === 'Resolvido' && campoDisponivel()) comemorarNoCampo(id, `+${fmtHoras(a - d)} h/mês devolvidas`); }
      render(true);
      toast(a != null && d != null ? `${fmtHoras(a - d)} h por mês devolvidas ao setor.` : 'Horas salvas.');
    } catch (x) { toast(x.message, 'erro'); }
  },
  sugerirProposta: (id) => sugerirPropostaInline(id),
  copiarPrompt: (id) => { const g = gargaloPorId(id); if (g) copiarPrompt(promptDoGargalo(g)); },
  copiarPromptSetor: (id) => { const s = setorPorId(id); if (s) copiarPrompt(promptDoSetor(s)); },
  baixarPPT: (id) => baixarPPT(id),
  excluirG: async (id, botao) => {
    if (botao.dataset.confirmar !== '1') { botao.dataset.confirmar = '1'; botao.classList.add('cheio'); botao.innerHTML = icone('lixo') + 'Confirmar exclusão'; return; }
    try { await apagarRegistro('gargalos', id); UI.aberto = ''; toast(ehOport(gargaloPorId(id) || {}) ? 'Oportunidade excluída.' : 'Gargalo excluído.'); render(true); } catch (x) { toast(x.message, 'erro'); }
  },
  // Questionário, PDF e ajustes
  colarRespostas: (id) => abrirColarRespostas(id),
  copiarConviteQ: (id) => { const a = alvoQuestionario(id); if (a) copiarTexto(convite(a.e, a.s), 'Convite copiado. Cole no WhatsApp do setor.'); },
  editarAjustes: () => formAjustes(),
  gerarPDF: (id) => gerarPDF(id),
  baixarBackup: () => baixarBackup(),
  restaurarBackup: () => $('#arquivo-backup').click(),
  recolherLado: () => { UI.ladoRecolhido = !UI.ladoRecolhido; try { localStorage.setItem('rf-lado-recolhido', UI.ladoRecolhido ? 'sim' : 'nao'); } catch (_) { /* sem armazenamento: vale só agora */ } aplicarLadoRecolhido(); render(); },
  // RF Sinais
  sinaisBuscar: () => abrirBuscarSinais(),
  sinaisGuardarUrl: () => guardarEnderecoSinais(),
  sinaisTrocarUrl: () => { UI.sinaisTrocandoUrl = !UI.sinaisTrocandoUrl; render(true); },
  sinaisFiltro: (id) => { UI.sinaisFiltro = id; render(true); },
  sinaisConvite: (id) => { const e = empresaPorId(id); if (e) copiarTexto(conviteSinais(e), 'Convite copiado. É só colar no WhatsApp do responsável.'); },
  sinaisLink: (id) => { const e = empresaPorId(id); if (e) copiarTexto(linkSinais(e), 'Link copiado.'); },
  sinalVirar: (id) => abrirVirarGargalo(id),
  sinalArquivar: (id) => mudarEstadoSinal(id, 'arquivado', 'Sinal arquivado.'),
  sinalReabrir: (id) => mudarEstadoSinal(id, 'novo', 'O sinal voltou para os novos.')
};

/* ---------- 17. Cliques e teclado ---------- */
document.addEventListener('click', (ev) => {
  if (ev.target.closest('[data-fechar]')) { ev.preventDefault(); const d = ev.target.closest('dialog'); if (d) d.close(); return; }
  const alvo = ev.target.closest('[data-acao]');
  if (alvo && !alvo.disabled) {
    const acao = ACOES[alvo.dataset.acao];
    if (acao) { ev.preventDefault(); acao(alvo.dataset.id, alvo, ev); }
  }
});
// Novo gargalo: escreve o título e aperta Enter; ele já abre para completar
document.addEventListener('submit', (ev) => {
  const f = ev.target.closest('form[data-form="perguntaIA"]'); if (!f) return;
  ev.preventDefault();
  const campo = $('#ia-pergunta'); const texto = campo.value.trim(); if (!texto) { campo.focus(); return; }
  campo.value = ''; campo.blur(); perguntarIA(texto);
});
document.addEventListener('submit', async (ev) => {
  const form = ev.target.closest('form[data-form="novoGargalo"]'); if (!form) return;
  ev.preventDefault();
  const campo = $('#novo-gargalo'); const titulo = campo.value.trim(); const s = setorPorId(form.dataset.id);
  if (!titulo || !s) { campo.focus(); return; }
  const id = novoId('g'); const agora = agoraISO();
  try {
    const op = form.dataset.tipo === 'oportunidade';
    await gravar('gargalos', id, Object.assign({ empresaId: s.empresaId, setorId: s.id, titulo, observacao: '', proposta: '', situacao: 'Aberto', criadoEm: agora, atualizadoEm: agora, movimentos: [{ em: agora, texto: op ? 'Oportunidade cadastrada' : 'Gargalo cadastrado' }] }, op ? { tipo: 'oportunidade' } : {}));
    campo.value = ''; campo.blur(); UI.aberto = id; render(true);
    const obs = document.querySelector(`#g-${id} textarea[data-salvar="observacao"]`); if (obs) obs.focus();
  } catch (x) { toast(x.message, 'erro'); }
});
// Campos do gargalo salvam sozinhos quando você sai deles
document.addEventListener('change', async (ev) => {
  const el = ev.target;
  if (el.dataset && el.dataset.anexo) { anexar(el); return; }
  if (el.dataset && el.dataset.pedidoArquivo != null) { const x = UI.anexosNovos[Number(el.dataset.pedidoArquivo)]; if (x) x.pedido = el.value; return; }
  if (el.id === 'ia-voz-nome') { UI.vozNome = el.value; try { localStorage.setItem('rf-voz', el.value); } catch (x) { /* sem memória do navegador */ } falar('Oi! É assim que eu falo.'); return; }
  if (el.id === 'ia-falar') { UI.iaFalar = el.checked; if (!el.checked) pararFala(); return; }
  if (el.id === 'ia-empresa') { UI.iaCtx = { empresaId: el.value, setorId: '', gargaloId: '' }; render(true); return; }
  if (el.id === 'ia-setor') { UI.iaCtx = Object.assign({}, UI.iaCtx, { setorId: el.value, gargaloId: '' }); render(true); return; }
  if (el.id === 'ia-gargalo') { UI.iaCtx = Object.assign({}, UI.iaCtx, { gargaloId: el.value }); render(true); return; }
  if (el.id === 'mat-arquivo') {
    const arq = el.files && el.files[0]; el.value = ''; if (!arq) return;
    try { const texto = await arq.text(); $('#mat-texto').value = texto; if (!$('#mat-titulo').value.trim()) $('#mat-titulo').value = arq.name.replace(/\.[^.]+$/, ''); }
    catch (_) { toast('Não deu para ler esse arquivo.', 'erro'); }
    return;
  }
  if (el.id === 'tipo-setor') {
    const s = setorPorId(el.dataset.id); if (!s) return;
    try { await gravar('setores', s.id, Object.assign({}, s, { tipo: el.value })); render(true); } catch (x) { toast(x.message, 'erro'); }
    return;
  }
  if (el.dataset && el.dataset.evidencia) {
    const s = setorPorId(el.dataset.id); if (!s) return;
    const diag = Object.assign({ respostas: {} }, s.diagnostico || {}); const respostas = Object.assign({}, diag.respostas);
    respostas[el.dataset.evidencia] = Object.assign({}, respostas[el.dataset.evidencia] || {}, { ev: el.value.trim() });
    try { await gravar('setores', s.id, Object.assign({}, s, { diagnostico: { respostas, atualizadoEm: agoraISO() } })); toast('Salvo.'); } catch (x) { toast(x.message, 'erro'); }
    return;
  }
  if (!el.dataset || !el.dataset.salvar) return;
  const g = gargaloPorId(el.dataset.id); if (!g) return;
  const campo = el.dataset.salvar; const valor = el.value.trim();
  if (campo === 'titulo' && !valor) { el.value = g.titulo; toast('O gargalo precisa de um nome.'); return; }
  if (valor === String(g[campo] || '').trim()) return;
  try { await salvarGargalo(g, { [campo]: valor }, ''); toast('Salvo.'); } catch (x) { toast(x.message, 'erro'); }
});
// Link da ferramenta digitado no cartão da biblioteca
async function salvarLinkBib(id, valor) {
  if (valor && !linkValido(valor)) { toast('O link precisa começar com https://', 'erro'); return; }
  try {
    if (id.startsWith('caso:')) { const g = gargaloPorId(id.slice(5)); if (!g || valor === String(g.linkFerramenta || '')) return; await salvarGargalo(g, { linkFerramenta: valor }, ''); }
    else { const b = S.biblioteca.find((x) => x.id === id); if (!b || valor === String(b.link || '')) return; await gravar('biblioteca', b.id, Object.assign({}, b, { link: valor })); }
    toast(valor ? 'Link salvo.' : 'Link tirado.'); render(true);
  } catch (x) { toast(x.message, 'erro'); }
}
document.addEventListener('change', (ev) => { const el = ev.target; if (el.dataset && el.dataset.bibLink) salvarLinkBib(el.dataset.bibLink, el.value.trim()); });
document.addEventListener('keydown', (ev) => { const el = ev.target; if (ev.key === 'Enter' && el.dataset && el.dataset.bibLink) { ev.preventDefault(); el.blur(); } });
document.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.matches && el.matches('textarea[data-crescer], #editar-nota')) crescer(el);
  if (el.id === 'nova-nota') UI.rascunho[el.dataset.setor] = el.value;
  if (el.id === 'ia-pergunta') ditadoMudou(el);
  if (el.id === 'busca-bib') {
    UI.bibBusca = el.value; const pos = el.selectionStart; render(true);
    const novo = $('#busca-bib'); if (novo) { novo.focus(); try { novo.setSelectionRange(pos, pos); } catch (_) { /* sem seleção */ } }
  }
  if (el.id === 'h-antes' || el.id === 'h-depois') { const caixa = $('#h-res'); if (caixa) caixa.innerHTML = resultadoHoras(numero($('#h-antes').value), numero($('#h-depois').value)); }
});
document.addEventListener('keydown', (ev) => {
  // Ctrl+Enter guarda a anotação
  if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
    if (ev.target.id === 'nova-nota') { ev.preventDefault(); const b = document.querySelector('[data-acao="salvarNota"]'); if (b) b.click(); }
    if (ev.target.id === 'editar-nota') { ev.preventDefault(); const b = document.querySelector('[data-acao="guardarNota"]'); if (b) b.click(); }
    if (ev.target.id === 'ia-pergunta') { ev.preventDefault(); const f = ev.target.closest('form'); if (f) f.requestSubmit(); }
  }
  if (ev.key === 'Escape' && $('#app').classList.contains('menu-aberto')) $('#app').classList.remove('menu-aberto');
});

// Cartões com profundidade (só com mouse e sem "reduzir movimento"): inclinam de leve e o brilho segue o cursor
(() => {
  if (!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const SEL = '.cartao-setor, .cartao-empresa, .bib-card, .ind, .ce-card, .painel.ia-ctx';
  let atual = null;
  document.addEventListener('pointermove', (ev) => {
    const el = ev.target.closest && ev.target.closest(SEL);
    if (atual && atual !== el) { atual.classList.remove('com-tilt'); atual.style.removeProperty('--rx'); atual.style.removeProperty('--ry'); }
    atual = el; if (!el) return;
    const r = el.getBoundingClientRect(); const x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
    el.classList.add('com-tilt');
    el.style.setProperty('--rx', ((0.5 - y) * 5).toFixed(2) + 'deg'); el.style.setProperty('--ry', ((x - 0.5) * 6).toFixed(2) + 'deg');
    el.style.setProperty('--mx', (x * 100).toFixed(1) + '%'); el.style.setProperty('--my', (y * 100).toFixed(1) + '%');
  }, { passive: true });
})();
criarComando();
iniciar();
</script>
