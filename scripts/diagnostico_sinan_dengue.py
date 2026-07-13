"""
Etapa 1 do diagnóstico: apenas introspecciona o pacote pysus instalado para
descobrir a API real (a versão instalada é muito mais nova que a documentação
encontrada, que descrevia uma API antiga baseada em função `sinan()`).

Não baixa nenhum dado ainda. Só imprime a estrutura do pacote.
"""
import pysus

print(f"[INFO] pysus.__version__ = {getattr(pysus, '__version__', '?')}")
print(f"[INFO] pysus.__file__ = {pysus.__file__}")
print(f"[INFO] dir(pysus) = {[n for n in dir(pysus) if not n.startswith('_')]}")

import pkgutil

print("\n[INFO] Submódulos de pysus:")
for mod in pkgutil.walk_packages(pysus.__path__, prefix="pysus."):
    print(" -", mod.name)
