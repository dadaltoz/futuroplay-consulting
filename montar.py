"""Junta as partes de src/ no arquivo único do painel (dist/real-forte-sistema.html) e confere o resultado.

Uso:  python3 montar.py
- Ordem: topo (HTML e CSS) + meio + campo (3D, cidades) + galáxia + app (telas, dados, IA).
- Depois de juntar, confere a sintaxe de cada <script> com o node e procura nome declarado duas vezes.
- Imprime "build ok" quando está tudo certo; qualquer erro para o processo com a mensagem."""
import collections, pathlib, re, subprocess, sys, tempfile
RAIZ = pathlib.Path(__file__).parent
SRC, SAIDA = RAIZ / 'src', RAIZ / 'dist' / 'real-forte-sistema.html'
ler = lambda n: (SRC / n).read_text(encoding='utf-8').rstrip('\n')
meio = ler('parte-meio.html'); assert meio.startswith('<script>') and meio.endswith('</script>')
SAIDA.parent.mkdir(exist_ok=True)
SAIDA.write_text('\n\n'.join([ler('parte-topo.html'), meio, ler('parte-campo.js'), ler('parte-galaxia.js'), ler('parte-app.js')]) + '\n', encoding='utf-8')
html = SAIDA.read_text(encoding='utf-8')
for k, sc in enumerate(re.findall(r'<script(?![^>]*src)[^>]*>(.*?)</script>', html, re.S)):
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as t: t.write(sc)
    r = subprocess.run(['node', '-e', "new Function(require('fs').readFileSync(process.argv[1],'utf8'))", t.name], capture_output=True, text=True)
    if r.returncode: print(f'ERRO de sintaxe no script {k}:\n{r.stderr[:600]}'); sys.exit(1)
src = ler('parte-campo.js') + ler('parte-app.js')
c = collections.Counter(a or b for a, b in re.findall(r'^(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=)', src, re.M))
dup = [k for k, v in c.items() if v > 1]
if dup: print('ERRO: nome declarado duas vezes:', dup); sys.exit(1)
print('build ok ->', SAIDA.relative_to(RAIZ))
