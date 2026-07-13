"""
Etapa 3 do diagnóstico: pysus.sinan é uma função de nível superior.
Inspeciona sua assinatura/docstring e tenta uma chamada pequena e controlada.
"""
import inspect
import pysus

sig = inspect.signature(pysus.sinan)
doc = inspect.getdoc(pysus.sinan) or "(sem docstring)"
print(f"[INFO] assinatura: pysus.sinan{sig}")
print(f"[INFO] docstring:\n{doc}")

print("\n[INFO] Tentando chamada pequena: pysus.sinan(disease='dengue', year=2023)...")
try:
    result = pysus.sinan(disease="dengue", year=2023)
    print(f"[INFO] tipo do retorno: {type(result)}")
    print(f"[INFO] repr (truncado): {repr(result)[:2000]}")
except Exception as exc:
    print(f"[ERRO] {type(exc).__name__}: {exc}")
