/* =====================================================================
   RF SINAIS · página do Google que recebe os sinais dos setores
   Real Forte Consultoria

   O QUE FAZ
   - Mostra um formulário com a cara da Real Forte (arquivo Formulario.html).
   - Cada resposta vira uma linha na planilha "RF Sinais" (no Drive da conta que instalou).
   - Se a pessoa anexar arquivos (até 3: foto, PDF ou planilha), eles vão para a pasta
     "RF Sinais — Anexos" no mesmo Drive, com o nome começando pelo código do sinal.
     Os arquivos sobem ANTES de gravar a linha: se algum falhar, nada é gravado.
   - Na mesma hora manda um e-mail para essa conta, com o assunto "RF Sinais · Empresa · Setor".

   COMO O LINK SABE A EMPRESA
   O painel da Real Forte monta um link para cada empresa, assim:
     <endereço desta página>?e=<código da empresa>&n=<nome da empresa>&s=<setor 1>|<setor 2>
   Aqui só lemos esses três pedaços. Nada de regra de negócio mora neste arquivo.

   QUEM VÊ OS ANEXOS
   A pasta nasce SEM compartilhamento: só a conta que instalou abre os arquivos.
   Quem decide com quem compartilhar (são fotos de dentro da empresa cliente) é o responsável
   pela Real Forte. Para compartilhar: no Drive, botão direito na pasta > Compartilhar.

   PARA ATUALIZAR (versão com anexos)
   1. Cole este arquivo e o Formulario.html por cima dos antigos e salve.
   2. Rode a função instalar() uma vez pelo editor: ela pede a permissão do Drive (nova).
   3. Implantar > Gerenciar implantações > lápis > Versão: Nova versão > Implantar.
   Assim o endereço continua o mesmo e os links que você já mandou seguem funcionando.
   ===================================================================== */

const NOME_PLANILHA = 'RF Sinais';
const NOME_ABA = 'Sinais';
const NOME_PASTA = 'RF Sinais — Anexos';
// Ordem das colunas da planilha. O painel lê nessa ordem quando você cola as linhas.
// "anexos" fica no fim: quem já colava as colunas antigas continua funcionando.
const COLUNAS = ['codigo', 'recebido_em', 'empresa_id', 'empresa', 'setor', 'o_que_trava', 'frequencia', 'quanto_atrapalha', 'nome', 'contato', 'anexos'];
const FREQUENCIAS = ['Todo dia', 'Toda semana', 'Às vezes'];
const IMPACTOS = ['Pouco', 'Médio', 'Muito'];

// Anexos: limites combinados com o Lucas (o formulário confere antes e aqui confere de novo)
const MAX_ANEXOS = 3;
const MAX_BYTES = 8 * 1024 * 1024;   // 8 MB por arquivo (a foto já chega reduzida)
// Tipos aceitos: foto, PDF e planilha. A chave é o fim do nome do arquivo.
const TIPOS_ACEITOS = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel',
  csv: 'text/csv', ods: 'application/vnd.oasis.opendocument.spreadsheet'
};
const SEIS_HORAS = 6 * 60 * 60;   // quanto tempo o Google lembra de um envio (para não duplicar)

// Abre a página quando alguém entra no link
function doGet(e) {
  const p = (e && e.parameter) || {};
  const pagina = HtmlService.createTemplateFromFile('Formulario');
  // Tudo que vai para dentro do <script> da página passa por paraScript (protege contra código no link)
  pagina.empresaIdJson = paraScript(limpar(p.e, 60));
  pagina.empresaNomeJson = paraScript(limpar(p.n, 80));
  // Lista de setores vinda do link, já protegida para ir dentro do <script> da página
  const setores = String(p.s || '').split('|').map((x) => limpar(x, 60)).filter(Boolean).slice(0, 15);
  pagina.setoresJson = paraScript(setores);
  pagina.frequenciasJson = JSON.stringify(FREQUENCIAS);
  pagina.impactosJson = JSON.stringify(IMPACTOS);
  pagina.anexosJson = JSON.stringify({ maximo: MAX_ANEXOS, bytes: MAX_BYTES, tipos: Object.keys(TIPOS_ACEITOS) });
  return pagina.evaluate()
    .setTitle('RF Sinais · Real Forte')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ---------- Envio em 3 passos (chamados pelo formulário, nesta ordem) ----------
   1. reservarSinal: separa o código do sinal (ainda não grava nada).
   2. subirAnexo: um arquivo por vez, já com o código no nome.
   3. enviarSinal: grava a linha e manda o e-mail.
   Se o passo 2 falhar, o formulário chama desfazerAnexos e nada fica gravado.
   "envio" é um código que a página cria quando abre: o mesmo envio repetido (clique duplo,
   internet que caiu e voltou) devolve o mesmo sinal, sem gravar outra linha. */

function reservarSinal(envio) {
  const id = limparEnvio(envio);
  const memoria = CacheService.getScriptCache();
  const trava = LockService.getScriptLock();   // dois cliques juntos não podem reservar dois códigos
  trava.waitLock(10000);
  try {
    const feito = memoria.get('feito:' + id);
    if (feito) return { codigo: feito, jaGravado: true };
    let codigo = memoria.get('reserva:' + id);
    if (!codigo) { codigo = novoCodigo(); memoria.put('reserva:' + id, codigo, SEIS_HORAS); }
    return { codigo: codigo, jaGravado: false };
  } finally {
    trava.releaseLock();
  }
}

function subirAnexo(envio, codigo, ordem, nome, tipo, base64) {
  const id = limparEnvio(envio);
  if (CacheService.getScriptCache().get('reserva:' + id) !== codigo) throw new Error('O envio expirou. Recarregue a página e tente de novo.');
  const ext = extensaoDe(nome);
  if (!TIPOS_ACEITOS[ext]) throw new Error('Esse tipo de arquivo não dá. Mande foto, PDF ou planilha.');
  const bytes = Utilities.base64Decode(String(base64 || ''));
  if (!bytes.length) throw new Error('O arquivo chegou vazio. Escolha de novo.');
  if (bytes.length > MAX_BYTES) throw new Error('Esse arquivo passou de 8 MB. Mande uma versão menor ou tire um print.');
  const n = Math.max(1, Math.min(MAX_ANEXOS, Number(ordem) || 1));
  const nomeFinal = codigo + ' · ' + n + ' · ' + nomeDeArquivo(nome);
  const arquivo = pastaDosAnexos().createFile(Utilities.newBlob(bytes, TIPOS_ACEITOS[ext], nomeFinal));
  return { id: arquivo.getId(), nome: nomeDeArquivo(nome) };
}

// Joga na lixeira os arquivos de um envio que não deu certo (só os da pasta e com o código do envio)
function desfazerAnexos(codigo, ids) {
  (ids || []).slice(0, MAX_ANEXOS).forEach((id) => {
    try {
      const arq = DriveApp.getFileById(String(id));
      if (estaNaPasta(arq) && arq.getName().indexOf(codigo + ' · ') === 0) arq.setTrashed(true);
    } catch (erro) { /* já não existe: nada a fazer */ }
  });
  return true;
}

// Chamada pelo formulário quando a pessoa aperta "Enviar sinal" (depois dos anexos, se tiver)
function enviarSinal(dados) {
  const d = dados || {};
  const id = d.envio ? limparEnvio(d.envio) : '';
  const memoria = CacheService.getScriptCache();
  if (id && memoria.get('feito:' + id)) return memoria.get('feito:' + id);   // o mesmo envio de novo: devolve o mesmo sinal
  // Página antiga (sem "envio") continua funcionando: gera o código na hora, como antes
  const codigo = id ? memoria.get('reserva:' + id) : novoCodigo();
  if (!codigo) throw new Error('O envio expirou. Recarregue a página e tente de novo.');
  const sinal = {
    codigo: codigo,
    recebido_em: Utilities.formatDate(new Date(), 'America/Sao_Paulo', "yyyy-MM-dd'T'HH:mm:ss"),
    empresa_id: limpar(d.empresaId, 60),
    empresa: limpar(d.empresaNome, 80) || 'Empresa não informada',
    setor: limpar(d.setor, 60),
    o_que_trava: limpar(d.texto, 1500, true),
    frequencia: FREQUENCIAS.indexOf(d.frequencia) >= 0 ? d.frequencia : '',
    quanto_atrapalha: IMPACTOS.indexOf(d.impacto) >= 0 ? d.impacto : '',
    nome: limpar(d.nome, 80),
    contato: limpar(d.contato, 80),
    anexos: ''
  };
  if (!sinal.setor) throw new Error('Escreva o seu setor.');
  if (sinal.o_que_trava.length < 5) throw new Error('Conte o que está travando.');
  // Os anexos são conferidos aqui (não confiamos no que a página manda): têm que estar na pasta e com o código
  const anexos = (d.anexos || []).slice(0, MAX_ANEXOS).map((a) => {
    const arq = DriveApp.getFileById(String(a && a.id));
    if (!estaNaPasta(arq) || arq.getName().indexOf(codigo + ' · ') !== 0) throw new Error('O anexo não subiu. Tente de novo ou envie sem anexo.');
    return { nome: nomeDeArquivo(a.nome || arq.getName()), url: arq.getUrl() };
  });
  sinal.anexos = anexos.map((a) => a.url + ' (' + a.nome + ')').join(' | ');

  // Uma gravação por vez, para duas pessoas enviando juntas não se atropelarem
  const trava = LockService.getScriptLock();
  trava.waitLock(10000);
  try {
    if (id && memoria.get('feito:' + id)) return memoria.get('feito:' + id);   // o mesmo envio de novo: não grava outra linha
    abaDosSinais().appendRow(COLUNAS.map((c) => seguroParaPlanilha(sinal[c])));
    if (id) { memoria.put('feito:' + id, codigo, SEIS_HORAS); memoria.remove('reserva:' + id); }
  } finally {
    trava.releaseLock();
  }
  avisarPorEmail(sinal, anexos);
  return sinal.codigo;
}

// Rode esta função uma vez, pelo editor, logo depois de colar o código (ela pede as autorizações)
function instalar() {
  const aba = abaDosSinais();
  const pasta = pastaDosAnexos();
  MailApp.sendEmail({
    to: Session.getEffectiveUser().getEmail(),
    subject: 'RF Sinais · instalação concluída',
    body: 'Tudo certo. Os sinais dos setores vão chegar neste e-mail e na planilha:\n' + aba.getParent().getUrl()
      + '\n\nOs anexos ficam na pasta "' + NOME_PASTA + '":\n' + pasta.getUrl()
      + '\n\nA pasta não está compartilhada com ninguém. Quem decide com quem compartilhar é o responsável pela Real Forte.'
  });
  Logger.log('Planilha: ' + aba.getParent().getUrl());
  Logger.log('Pasta dos anexos: ' + pasta.getUrl());
}

/* Arquivo sem sinal: se a pessoa fechou a página no meio do envio, o arquivo pode ter subido sem a
   linha ser gravada. Rode esta função pelo editor quando quiser: ela joga na lixeira os arquivos da
   pasta com mais de 1 dia cujo código não está na planilha. */
function limparAnexosSemSinal() {
  const aba = abaDosSinais();
  const ultima = aba.getLastRow();
  const codigos = {};
  if (ultima > 1) aba.getRange(2, 1, ultima - 1, 1).getValues().forEach((l) => { codigos[String(l[0]).replace(/^'/, '')] = true; });
  const umDia = Date.now() - 24 * 60 * 60 * 1000;
  const lista = pastaDosAnexos().getFiles();
  let apagados = 0;
  while (lista.hasNext()) {
    const arq = lista.next();
    const codigo = arq.getName().split(' · ')[0];
    if (!codigos[codigo] && arq.getDateCreated().getTime() < umDia) { arq.setTrashed(true); apagados++; }
  }
  Logger.log('Arquivos sem sinal jogados na lixeira: ' + apagados);
  return apagados;
}

/* ---------- Ajudantes ---------- */

// Acha a planilha (ou cria na primeira vez) e devolve a aba dos sinais
function abaDosSinais() {
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
  } else if (String(aba.getRange(1, COLUNAS.length).getValue()) !== 'anexos') {
    // Planilha da versão antiga: ganha o título da coluna nova no fim (as linhas antigas ficam como estão)
    aba.getRange(1, COLUNAS.length).setValue('anexos').setFontWeight('bold');
  }
  return aba;
}

// Acha a pasta dos anexos (ou cria na primeira vez, sem compartilhar com ninguém)
function pastaDosAnexos() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('PASTA_ID');
  if (id) { try { const p = DriveApp.getFolderById(id); if (!p.isTrashed()) return p; } catch (erro) { /* apagaram a pasta: cria outra */ } }
  const pasta = DriveApp.createFolder(NOME_PASTA);
  props.setProperty('PASTA_ID', pasta.getId());
  return pasta;
}

// O arquivo está mesmo na pasta dos anexos?
function estaNaPasta(arq) {
  const alvo = pastaDosAnexos().getId();
  const pais = arq.getParents();
  while (pais.hasNext()) { if (pais.next().getId() === alvo) return true; }
  return false;
}

// E-mail na hora. A última linha (RF-SINAL) é para o painel conseguir ler sozinho no futuro.
function avisarPorEmail(s, anexos) {
  const linhas = [
    'Novo sinal pelo RF Sinais',
    '',
    'Empresa: ' + s.empresa,
    'Setor: ' + s.setor,
    'O que está travando: ' + s.o_que_trava,
    'Com que frequência: ' + (s.frequencia || 'não informado'),
    'Quanto atrapalha: ' + (s.quanto_atrapalha || 'não informado'),
    'Quem mandou: ' + (s.nome || 'Anônimo') + (s.contato ? ' · ' + s.contato : ''),
    'Anexos: ' + (anexos.length ? '' : 'nenhum')
  ].concat(anexos.map((a) => '  - ' + a.nome + ': ' + a.url)).concat([
    'Código: ' + s.codigo,
    '',
    'Para levar ao painel: na planilha, copie as linhas novas e cole em RF Sinais > Buscar sinais.',
    '',
    'RF-SINAL ' + JSON.stringify(Object.assign({}, s, { anexos: anexos }))
  ]);
  MailApp.sendEmail({
    to: Session.getEffectiveUser().getEmail(),
    subject: 'RF Sinais · ' + s.empresa + ' · ' + s.setor,
    body: linhas.join('\n')
  });
}

// Código do sinal: S- e 8 letras/números (o painel reconhece esse formato)
function novoCodigo() { return 'S-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase(); }
// O código do envio vem da página: só letras e números, até 40
function limparEnvio(envio) {
  const t = String(envio || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
  if (t.length < 12) throw new Error('Recarregue a página e tente de novo.');
  return t;
}
// Fim do nome do arquivo, em minúsculas ("Foto.JPG" -> "jpg")
function extensaoDe(nome) { const m = String(nome || '').toLowerCase().match(/\.([a-z0-9]+)$/); return m ? m[1] : ''; }
// Nome de arquivo sem caracteres que atrapalham a célula da planilha ( | e parênteses )
function nomeDeArquivo(nome) { return limpar(String(nome || 'arquivo').replace(/[|()<>]/g, '-'), 80) || 'arquivo'; }

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
