/* =====================================================================
   FEEDBACK DO LUCAS · página do Google que recebe as respostas
   Real Forte Lab

   O QUE FAZ
   - Mostra o formulário (arquivo Formulario.html) para as pessoas dos setores por onde o Lucas passou.
   - Cada resposta vira uma linha na planilha "Feedback do Lucas" (no Drive da conta que instalou).
   - Não manda e-mail: o Lucas abre a planilha, copia as linhas e cola no Real Forte Lab.

   COMO O LINK SABE O QUE PERGUNTAR
   O Real Forte Lab (tela "Feedback do Lucas") monta o link assim:
     <endereço desta página>?s=<setor 1>|<setor 2>&c=<critério 1>|<critério 2>&m=anonima (ou identificada)
   Setores, critérios e se a resposta é anônima são declarados pelo Lucas lá no Real Forte Lab.
   Nada de regra mora neste arquivo. Faltando algum pedaço, a página avisa e não deixa enviar.

   COMO INSTALAR (uma vez, uns 5 minutos)
   1. script.google.com > Novo projeto. Nome: "Feedback do Lucas".
   2. Cole este arquivo no Código.gs. Crie um arquivo HTML chamado Formulario e cole o Formulario.html.
   3. Rode a função instalar() pelo editor (ela pede as autorizações e cria a planilha).
   4. Implantar > Nova implantação > Tipo: App da Web. Executar como: Eu. Quem pode acessar: Qualquer pessoa.
   5. Copie o endereço que termina em /exec e cole no Real Forte Lab, em Feedback do Lucas > Configuração.

   PARA ATUALIZAR DEPOIS
   Implantar > Gerenciar implantações > lápis > Versão: Nova versão > Implantar (o endereço não muda).
   ===================================================================== */

const NOME_PLANILHA = 'Feedback do Lucas';
const NOME_ABA = 'Respostas';
// Ordem das colunas da planilha. O Real Forte Lab lê por estes nomes quando você cola as linhas.
const COLUNAS = ['codigo', 'recebido_em', 'setor', 'notas', 'o_que_funcionou', 'o_que_podia_melhorar', 'nome', 'envio'];
const MODOS = ['anonima', 'identificada'];
const SEIS_HORAS = 6 * 60 * 60;   // quanto tempo o Google lembra de um envio (para não duplicar)

// Abre a página quando alguém entra no link
function doGet(e) {
  const p = (e && e.parameter) || {};
  const setores = lista(p.s, 20);
  const criterios = lista(p.c, 15);
  const modo = MODOS.indexOf(p.m) >= 0 ? p.m : '';
  // O que falta no link (o Lucas ainda não declarou, ou o link foi cortado)
  const falta = [];
  if (!setores.length) falta.push('a lista de setores');
  if (!criterios.length) falta.push('a lista de critérios');
  if (!modo) falta.push('se a resposta é anônima ou identificada');
  const pagina = HtmlService.createTemplateFromFile('Formulario');
  pagina.setoresJson = paraScript(setores);
  pagina.criteriosJson = paraScript(criterios);
  pagina.modoJson = paraScript(modo);
  pagina.faltaJson = paraScript(falta);
  return pagina.evaluate()
    .setTitle('Feedback do Lucas · Real Forte')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Chamada pelo formulário quando a pessoa aperta "Enviar resposta"
function enviarResposta(dados) {
  const d = dados || {};
  const envio = String(d.envio || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
  if (envio.length < 12) throw new Error('Recarregue a página e tente de novo.');
  const modo = MODOS.indexOf(d.modo) >= 0 ? d.modo : '';
  if (!modo) throw new Error('Este link está incompleto. Peça um link novo ao Lucas.');
  const resposta = {
    codigo: 'F-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase(),
    recebido_em: Utilities.formatDate(new Date(), 'America/Sao_Paulo', "yyyy-MM-dd'T'HH:mm:ss"),
    setor: limpar(d.setor, 60),
    notas: '',
    o_que_funcionou: limpar(d.funcionou, 1500, true),
    o_que_podia_melhorar: limpar(d.melhorar, 1500, true),
    nome: modo === 'identificada' ? limpar(d.nome, 80) : '',   // anônima: o nome nem é guardado
    envio: envio
  };
  if (!resposta.setor) throw new Error('Escolha o seu setor.');
  if (modo === 'identificada' && !resposta.nome) throw new Error('Escreva o seu nome.');
  // Notas: só de 1 a 5, uma por critério. Fica "Critério: nota | Critério: nota".
  const notas = (d.notas || []).slice(0, 15).map((n) => ({ criterio: limpar(String(n && n.criterio).replace(/[|:]/g, '/'), 60), nota: Number(n && n.nota) }));
  if (!notas.length) throw new Error('Dê uma nota de 1 a 5 em cada critério.');
  notas.forEach((n) => { if (!n.criterio || !(n.nota >= 1 && n.nota <= 5 && Math.round(n.nota) === n.nota)) throw new Error('Dê uma nota de 1 a 5 em cada critério.'); });
  resposta.notas = notas.map((n) => n.criterio + ': ' + n.nota).join(' | ');

  // Uma gravação por vez; o mesmo envio repetido (clique duplo, internet que caiu) devolve o mesmo código
  const memoria = CacheService.getScriptCache();
  const trava = LockService.getScriptLock();
  trava.waitLock(10000);
  try {
    const feito = memoria.get('feito:' + envio);
    if (feito) return feito;
    abaDasRespostas().appendRow(COLUNAS.map((c) => seguroParaPlanilha(resposta[c])));
    memoria.put('feito:' + envio, resposta.codigo, SEIS_HORAS);
  } finally {
    trava.releaseLock();
  }
  return resposta.codigo;
}

// Rode esta função uma vez, pelo editor, logo depois de colar o código (ela pede as autorizações)
function instalar() {
  const aba = abaDasRespostas();
  MailApp.sendEmail({
    to: Session.getEffectiveUser().getEmail(),
    subject: 'Feedback do Lucas · instalação concluída',
    body: 'Tudo certo. As respostas vão chegar na planilha:\n' + aba.getParent().getUrl()
      + '\n\nPara ver os resultados: copie as linhas da planilha e cole no Real Forte Lab, em Feedback do Lucas > Trazer respostas.'
  });
  Logger.log('Planilha: ' + aba.getParent().getUrl());
}

/* ---------- Ajudantes ---------- */

// Acha a planilha (ou cria na primeira vez) e devolve a aba das respostas
function abaDasRespostas() {
  const props = PropertiesService.getScriptProperties();
  let planilha = null;
  const id = props.getProperty('PLANILHA_ID');
  if (id) { try { planilha = SpreadsheetApp.openById(id); } catch (erro) { planilha = null; } }
  if (!planilha) {
    planilha = SpreadsheetApp.create(NOME_PLANILHA);
    props.setProperty('PLANILHA_ID', planilha.getId());
  }
  let aba = planilha.getSheetByName(NOME_ABA);
  if (!aba) {
    aba = planilha.getSheets()[0];
    aba.setName(NOME_ABA);
    aba.getRange(1, 1, 1, COLUNAS.length).setValues([COLUNAS]).setFontWeight('bold');
    aba.setFrozenRows(1);
  }
  return aba;
}

// Lista do link ("A|B|C") limpa, sem repetidos, com tamanho máximo
function lista(valor, maximo) {
  const vistos = {}, saida = [];
  String(valor || '').split('|').forEach((x) => {
    const t = limpar(x, 60), chave = t.toLowerCase();
    if (t && !vistos[chave]) { vistos[chave] = true; saida.push(t); }
  });
  return saida.slice(0, maximo);
}

// Transforma o valor em texto JavaScript seguro para colar dentro de <script>
function paraScript(valor) {
  return JSON.stringify(valor).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

// Tira espaços sobrando e corta no tamanho máximo. "quebras" mantém as linhas do texto.
function limpar(valor, maximo, quebras) {
  let t = String(valor == null ? '' : valor);
  t = quebras ? t.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n') : t.replace(/\s+/g, ' ');
  return t.trim().slice(0, maximo);
}

// Texto que começa com = + - @ viraria fórmula na planilha; o apóstrofo impede isso
function seguroParaPlanilha(valor) {
  const t = String(valor == null ? '' : valor);
  return /^[=+\-@]/.test(t) ? "'" + t : t;
}
