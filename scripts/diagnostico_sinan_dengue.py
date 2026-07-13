"""
Etapa 8 do diagnóstico: a etapa 7 revelou que os "2 arquivos" baixados são
DENGBR23.parquet e DENGBR23.csv.parquet — a MESMA base de 2023 cacheada em
dois formatos. O as_dataframe=True do pysus concatena os dois (bug de
carregamento), duplicando quase todas as linhas. Aqui testamos ler
diretamente cada parquet isoladamente com pandas para confirmar qual deles
é a base "canônica" e se ela bate com o baseline do CSV atual (1.644.960
casos de dengue em 2023).
"""
import glob
import pandas as pd
import pysus

BASELINE_2023 = 1644960

# Garante que os arquivos já estão baixados/cacheados
paths = pysus.sinan(disease="DENG", year=2023)
print(f"[INFO] arquivos: {paths}")

for p in paths:
    try:
        d = pd.read_parquet(p)
        total_mn_resi = d["ID_MN_RESI"].notna().sum() if "ID_MN_RESI" in d.columns else None
        total_municip = d["ID_MUNICIP"].notna().sum() if "ID_MUNICIP" in d.columns else None
        print(f"\n[INFO] {p}")
        print(f"  linhas: {len(d)}, colunas: {len(d.columns)}")
        print(f"  ID_MN_RESI não-nulos: {total_mn_resi}")
        print(f"  ID_MUNICIP não-nulos: {total_municip}")
        if total_mn_resi:
            diff = total_mn_resi - BASELINE_2023
            pct = 100 * diff / BASELINE_2023
            print(f"  diff vs baseline (ID_MN_RESI): {diff:+d} ({pct:+.2f}%)")
    except Exception as exc:
        print(f"[ERRO] falha ao ler {p}: {type(exc).__name__}: {exc}")

# Também procura todos os parquets em cache para esse ano, caso haja mais candidatos
cached = glob.glob("/home/runner/pysus/downloads/**/*DENG*23*", recursive=True)
print(f"\n[INFO] todos os arquivos em cache relacionados a DENG 2023: {cached}")
