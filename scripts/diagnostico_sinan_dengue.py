"""
Etapa 4 do diagnóstico: usa o código de doença correto ("DENG") e investiga
os kwargs aceitos para obter um DataFrame diretamente.
"""
import inspect
import pysus

# Inspeciona _fetch_data (para onde os **kwargs são encaminhados) se acessível
try:
    from pysus.api._impl import databases as _dbs
    print(f"[INFO] módulo databases: {[n for n in dir(_dbs) if 'fetch' in n.lower()]}")
except Exception as exc:
    print(f"[AVISO] não consegui inspecionar databases: {exc}")

print("\n[INFO] Chamando pysus.sinan(disease='DENG', year=2023, as_dataframe=True)...")
try:
    df = pysus.sinan(disease="DENG", year=2023, as_dataframe=True)
    print(f"[INFO] tipo do retorno: {type(df)}")
    if hasattr(df, "columns"):
        print(f"[INFO] linhas: {len(df)}")
        print(f"[INFO] colunas ({len(df.columns)}): {list(df.columns)}")
        candidatos_municipio = [c for c in df.columns if "MUNI" in c.upper()]
        candidatos_ano = [c for c in df.columns if "ANO" in c.upper() or c.upper().startswith("DT_")]
        print(f"[INFO] candidatos a município: {candidatos_municipio}")
        print(f"[INFO] candidatos a ano/data: {candidatos_ano}")
        cols = list(dict.fromkeys(candidatos_municipio + candidatos_ano))
        if cols:
            print(df[cols].head(8).to_string())
        for col in candidatos_municipio:
            print(f"\n[INFO] valores únicos de {col} (amostra): {df[col].dropna().unique()[:10]}")
    else:
        print(f"[INFO] repr (truncado): {repr(df)[:1500]}")
except Exception as exc:
    print(f"[ERRO] {type(exc).__name__}: {exc}")
    import traceback
    traceback.print_exc()
