/* Google de mentira para testar as páginas do Google (RF Sinais, Feedback) no navegador, sem conta.
   Imita só o que o Codigo.gs usa: planilha, Drive, e-mail, memória (cache), trava e google.script.run.
   Para forçar erro: window.__falhar = { subirAnexo: 2 } faz a 2ª chamada de subirAnexo falhar. */
(function () {
  const G = window.__google = { linhas: [], cabecalho: null, arquivos: [], emails: [], cache: new Map(), props: new Map(), chamadas: [] };
  let n = 0;
  const novoId = (p) => p + (++n).toString(36).padStart(6, '0');
  const iterador = (lista) => { let i = 0; return { hasNext: () => i < lista.length, next: () => lista[i++] }; };
  // Planilha: uma aba, linhas em memória
  const aba = {
    nome: 'Planilha1',
    setName(x) { this.nome = x; }, getParent() { return planilha; }, setFrozenRows() {},
    appendRow(l) { G.linhas.push(l.slice()); },
    getLastRow() { return G.linhas.length + (G.cabecalho ? 1 : 0); },
    getRange(r, c, nl, nc) {
      return {
        setValues(v) { if (r === 1) G.cabecalho = v[0].slice(); return this; }, setValue(v) { if (r === 1 && G.cabecalho) G.cabecalho[c - 1] = v; return this; },
        setFontWeight() { return this; }, getValue() { return r === 1 && G.cabecalho ? G.cabecalho[c - 1] || '' : ((G.linhas[r - 2] || [])[c - 1] || ''); },
        getValues() { const out = []; for (let i = 0; i < (nl || 1); i++) { const l = r === 1 ? G.cabecalho : G.linhas[r - 2 + i]; out.push((l || []).slice(c - 1, c - 1 + (nc || 1))); } return out; }
      };
    }
  };
  const planilha = { getId: () => 'planilha1', getUrl: () => 'https://docs.google.com/spreadsheets/d/planilha1', getSheetByName: (x) => (aba.nome === x ? aba : null), getSheets: () => [aba] };
  window.SpreadsheetApp = { create: () => planilha, openById: () => planilha };
  // Drive: pastas e arquivos em memória
  const pastas = new Map();
  function pasta(nome) {
    const p = { id: novoId('pasta'), nome, lixeira: false, getId() { return this.id; }, getUrl() { return 'https://drive.google.com/drive/folders/' + this.id; }, isTrashed() { return this.lixeira; },
      createFile(blob) { const a = arquivo(blob, p); G.arquivos.push(a); return a; },
      getFiles() { return iterador(G.arquivos.filter((a) => a.pai === p && !a.lixeira)); } };
    pastas.set(p.id, p); return p;
  }
  function arquivo(blob, pai) {
    return { id: novoId('arq'), nome: blob.name, tipo: blob.type, tamanho: blob.bytes.length, pai, lixeira: false, criado: new Date(),
      getId() { return this.id; }, getName() { return this.nome; }, getUrl() { return 'https://drive.google.com/file/d/' + this.id + '/view'; },
      getParents() { return iterador([this.pai]); }, setTrashed(v) { this.lixeira = v; }, getDateCreated() { return this.criado; } };
  }
  window.DriveApp = {
    createFolder: pasta,
    getFolderById(id) { const p = pastas.get(id); if (!p) throw new Error('pasta não existe'); return p; },
    getFileById(id) { const a = G.arquivos.find((x) => x.id === id); if (!a) throw new Error('arquivo não existe'); return a; }
  };
  window.Utilities = {
    getUuid: () => crypto.randomUUID(),
    formatDate: (d) => d.toISOString().slice(0, 19),
    base64Decode: (t) => { const b = atob(t); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; },
    newBlob: (bytes, type, name) => ({ bytes, type, name })
  };
  window.CacheService = { getScriptCache: () => ({ get: (k) => (G.cache.has(k) ? G.cache.get(k) : null), put: (k, v) => G.cache.set(k, v), remove: (k) => G.cache.delete(k) }) };
  window.PropertiesService = { getScriptProperties: () => ({ getProperty: (k) => (G.props.has(k) ? G.props.get(k) : null), setProperty: (k, v) => G.props.set(k, v) }) };
  window.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  window.MailApp = { sendEmail: (m) => G.emails.push(m) };
  window.Session = { getEffectiveUser: () => ({ getEmail: () => 'dono@exemplo.com' }) };
  window.Logger = { log: () => {} };
  // Página: guarda o que o doGet preencheu (o teste monta o HTML com esses valores)
  window.HtmlService = { createTemplateFromFile: (nome) => { const t = { arquivo: nome }; t.evaluate = () => { const r = { vars: t, setTitle() { return r; }, addMetaTag() { return r; } }; return r; }; return t; } };
  // google.script.run: chama a função do Codigo.gs depois de um tempinho (como a internet)
  const falhas = {};
  function corredor(ok, erro) {
    return new Proxy({}, {
      get(_, nome) {
        if ((window.__semFuncoes || []).includes(nome)) return undefined;   // simula Codigo.gs antigo publicado
        if (nome === 'withSuccessHandler') return (f) => corredor(f, erro);
        if (nome === 'withFailureHandler') return (f) => corredor(ok, f);
        return (...args) => {
          G.chamadas.push(nome);
          setTimeout(() => {
            falhas[nome] = (falhas[nome] || 0) + 1;
            const f = window.__falhar && window.__falhar[nome];
            if (f && falhas[nome] === f) { if (erro) erro(new Error('NetworkError: Connection failure due to HTTP 0')); return; }
            try { const r = window[nome](...JSON.parse(JSON.stringify(args))); if (ok) ok(r); } catch (e) { if (erro) erro(e); }
          }, 60);
        };
      }
    });
  }
  window.google = { script: { run: corredor(null, null) } };
})();
