"""
Script de diagnóstico: baixa uma pequena amostra de dados de Dengue via PySUS
e imprime a estrutura real (colunas, tipos, valores de exemplo) para confirmar
o formato antes de escrever a lógica de agregação definitiva.

Não escreve nenhum CSV do painel. Apenas para investigação.
"""
from pysus.online_data.SINAN import sinan


def main():
    print("[INFO] Baixando amostra de Dengue (ano 2023) via PySUS...")
    df = sinan(disease="dengue", year=2023, as_dataframe=True)

    print(f"[INFO] Linhas: {len(df)}")
    print(f"[INFO] Colunas ({len(df.columns)}): {list(df.columns)}")

    candidatos_municipio = [c for c in df.columns if "MUNI" in c.upper() or "MUN_" in c.upper()]
    candidatos_ano = [c for c in df.columns if "ANO" in c.upper() or c.upper().startswith("DT_")]

    print(f"[INFO] Colunas candidatas a município: {candidatos_municipio}")
    print(f"[INFO] Colunas candidatas a ano/data: {candidatos_ano}")

    print("\n[INFO] Amostra de 5 linhas (colunas relevantes):")
    cols_relevantes = list(dict.fromkeys(candidatos_municipio + candidatos_ano))
    if cols_relevantes:
        print(df[cols_relevantes].head(5).to_string())

    for col in candidatos_municipio:
        print(f"\n[INFO] {col}: {df[col].dropna().unique()[:10]}")


if __name__ == "__main__":
    main()
