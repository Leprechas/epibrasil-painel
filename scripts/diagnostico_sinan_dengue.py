"""
Etapa 5 do diagnóstico: compara agregações por ID_MN_RESI (residência) vs
ID_MUNICIP (notificação) e por CLASSI_FIN, contra o baseline conhecido do
CSV atual (data/doencas/deng.csv): total de 1.644.960 casos de dengue em 2023.
"""
import pysus

BASELINE_2023 = 1644960

print("[INFO] Chamando pysus.sinan(disease='DENG', year=2023, as_dataframe=True)...")
df = pysus.sinan(disease="DENG", year=2023, as_dataframe=True)
print(f"[INFO] linhas totais: {len(df)}")

for col in ["ID_MN_RESI", "ID_MUNICIP", "MUNICIPIO", "COMUNINF"]:
    if col in df.columns:
        nn = df[col].notna().sum()
        print(f"\n[INFO] {col}: não-nulos={nn}, únicos={df[col].nunique()}")
        print(f"[INFO] {col} amostra de valores: {df[col].dropna().unique()[:10]}")
    else:
        print(f"\n[AVISO] coluna {col} não existe no DataFrame")

if "CLASSI_FIN" in df.columns:
    print(f"\n[INFO] CLASSI_FIN value_counts:\n{df['CLASSI_FIN'].value_counts(dropna=False)}")

if "NU_ANO" in df.columns:
    print(f"\n[INFO] NU_ANO value_counts:\n{df['NU_ANO'].value_counts(dropna=False)}")

print(f"\n[INFO] BASELINE conhecido (CSV atual, ano 2023): {BASELINE_2023}")
print(f"[INFO] total de linhas brutas (sem filtro): {len(df)}")

for col in ["ID_MN_RESI", "ID_MUNICIP"]:
    if col in df.columns:
        total = df[col].notna().sum()
        diff = total - BASELINE_2023
        pct = 100 * diff / BASELINE_2023
        print(f"[INFO] contagem por {col} (sem filtro CLASSI_FIN): {total} (diff={diff:+d}, {pct:+.1f}%)")

if "CLASSI_FIN" in df.columns:
    # CLASSI_FIN típico do SINAN: 5=Descartado, 10/11/12=Dengue (clássica/com sinais/grave), 13=Chikungunya, etc.
    # Testamos excluindo descartados (5) e nulos, e também mantendo tudo, para ver o que bate com o baseline.
    for desc, mask in [
        ("todos", df["CLASSI_FIN"].notna() | df["CLASSI_FIN"].isna()),
        ("excluindo CLASSI_FIN==5 (descartado)", df["CLASSI_FIN"] != 5),
        ("excluindo CLASSI_FIN==5.0", df["CLASSI_FIN"] != 5.0),
    ]:
        sub = df[mask]
        for col in ["ID_MN_RESI", "ID_MUNICIP"]:
            if col in sub.columns:
                total = sub[col].notna().sum()
                diff = total - BASELINE_2023
                pct = 100 * diff / BASELINE_2023 if BASELINE_2023 else 0
                print(f"[INFO] {desc} | contagem por {col}: {total} (diff={diff:+d}, {pct:+.1f}%)")
