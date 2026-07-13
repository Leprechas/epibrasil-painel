"""
Etapa 2 do diagnóstico: introspecciona o objeto pysus.sinan (API nova, versão
2.6.5) para descobrir os métodos disponíveis e suas assinaturas, antes de
tentar baixar qualquer dado.
"""
import inspect
import pysus

print(f"[INFO] type(pysus.sinan) = {type(pysus.sinan)}")
print(f"[INFO] dir(pysus.sinan) = {[n for n in dir(pysus.sinan) if not n.startswith('_')]}")

for name in dir(pysus.sinan):
    if name.startswith("_"):
        continue
    attr = getattr(pysus.sinan, name)
    if callable(attr):
        try:
            sig = inspect.signature(attr)
        except (TypeError, ValueError):
            sig = "?"
        doc = (inspect.getdoc(attr) or "").split("\n")[0]
        print(f"\n[MÉTODO] {name}{sig}\n  doc: {doc}")
    else:
        print(f"\n[ATRIBUTO] {name} = {attr!r}")
