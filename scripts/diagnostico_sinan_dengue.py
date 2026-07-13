"""
Etapa 6 do diagnóstico: a contagem bruta (3.291.912) é quase exatamente o
dobro do baseline do CSV atual para 2023 (1.644.960, razão 2.0012). O log
mostrou "Downloading sinan: 2/2 files" para um único ano — investigamos se
há duplicação de linhas (por exemplo, dois parquets concatenados sem
deduplicação) e, se sim, se removê-la aproxima o total do baseline.
"""
import pysus

BASELINE_2023 = 1644960

df = pysus.sinan(disease="DENG", year=2023, as_dataframe=True)
print(f"[INFO] linhas totais: {len(df)}")

dup_total = df.duplicated().sum()
print(f"[INFO] linhas totalmente duplicadas (todas as colunas): {dup_total}")

dedup_full = df.drop_duplicates()
print(f"[INFO] linhas após drop_duplicates (todas as colunas): {len(dedup_full)}")

id_cols = [c for c in ["NU_NOTIFIC", "DT_NOTIFIC", "ID_MUNICIP", "ID_MN_RESI", "SEM_NOT"] if c in df.columns]
print(f"[INFO] colunas identificadoras disponíveis: {id_cols}")
if "NU_NOTIFIC" in df.columns:
    print(f"[INFO] NU_NOTIFIC não-nulos: {df['NU_NOTIFIC'].notna().sum()}, únicos: {df['NU_NOTIFIC'].nunique()}")
    dup_by_notific = df.duplicated(subset=["NU_NOTIFIC", "ID_MUNICIP", "DT_NOTIFIC"]).sum()
    print(f"[INFO] duplicatas por (NU_NOTIFIC, ID_MUNICIP, DT_NOTIFIC): {dup_by_notific}")
    dedup_by_notific = df.drop_duplicates(subset=["NU_NOTIFIC", "ID_MUNICIP", "DT_NOTIFIC"])
    print(f"[INFO] linhas após dedup por (NU_NOTIFIC, ID_MUNICIP, DT_NOTIFIC): {len(dedup_by_notific)}")

for label, sub in [("dedup completo (todas colunas)", dedup_full)]:
    for col in ["ID_MN_RESI", "ID_MUNICIP"]:
        if col in sub.columns:
            total = sub[col].notna().sum()
            diff = total - BASELINE_2023
            pct = 100 * diff / BASELINE_2023
            print(f"[INFO] {label} | contagem por {col}: {total} (diff={diff:+d}, {pct:+.2f}%)")

if "NU_NOTIFIC" in df.columns:
    for col in ["ID_MN_RESI", "ID_MUNICIP"]:
        if col in dedup_by_notific.columns:
            total = dedup_by_notific[col].notna().sum()
            diff = total - BASELINE_2023
            pct = 100 * diff / BASELINE_2023
            print(f"[INFO] dedup por (NU_NOTIFIC,ID_MUNICIP,DT_NOTIFIC) | contagem por {col}: {total} (diff={diff:+d}, {pct:+.2f}%)")

# Amostra de uma possível duplicata para inspeção visual
if "NU_NOTIFIC" in df.columns:
    sample_dup = df[df.duplicated(subset=["NU_NOTIFIC", "ID_MUNICIP", "DT_NOTIFIC"], keep=False)]
    print(f"\n[INFO] total de linhas envolvidas em duplicatas (NU_NOTIFIC,ID_MUNICIP,DT_NOTIFIC): {len(sample_dup)}")
    if len(sample_dup) > 0:
        first_key = sample_dup[["NU_NOTIFIC", "ID_MUNICIP", "DT_NOTIFIC"]].iloc[0]
        mask = (
            (df["NU_NOTIFIC"] == first_key["NU_NOTIFIC"]) &
            (df["ID_MUNICIP"] == first_key["ID_MUNICIP"]) &
            (df["DT_NOTIFIC"] == first_key["DT_NOTIFIC"])
        )
        cols_show = [c for c in ["NU_NOTIFIC", "ID_MUNICIP", "ID_MN_RESI", "DT_NOTIFIC", "CLASSI_FIN", "DT_DIGITA"] if c in df.columns]
        print(df[mask][cols_show].to_string())
