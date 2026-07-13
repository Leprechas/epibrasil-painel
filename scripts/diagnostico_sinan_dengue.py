"""
Etapa 7 do diagnóstico: o dedup por linha inteira só removeu 1758 de
3.291.912 linhas — não é duplicação exata. O total continua ~2x o baseline
mesmo após dedup. Hipótese: pysus baixa 2 arquivos para o mesmo ano (visto
no log "Downloading sinan: 2/2 files") — provavelmente uma base "final" e
uma "preliminar" do mesmo período, com o mesmo caso aparecendo nas duas mas
com campos como DT_DIGITA/CLASSI_FIN diferentes. Aqui inspecionamos os
nomes dos arquivos/grupos baixados e o campo NU_NOTIFIC (que a etapa 6 não
encontrou nas colunas) para achar a granularidade real de "1 caso = 1 linha".
"""
import pysus

BASELINE_2023 = 1644960

print("[INFO] Chamando pysus.sinan(disease='DENG', year=2023) SEM as_dataframe (para ver os arquivos)...")
paths = pysus.sinan(disease="DENG", year=2023)
print(f"[INFO] tipo: {type(paths)}, conteúdo: {paths}")

print("\n[INFO] Chamando novamente com as_dataframe=True...")
df = pysus.sinan(disease="DENG", year=2023, as_dataframe=True)
print(f"[INFO] linhas totais: {len(df)}")

# Procura qualquer coluna que possa ser identificador único de notificação
candidatos_id = [c for c in df.columns if "NOTIF" in c.upper() or c.upper() in ("NU_NOTIFIC", "CODIGO", "ID")]
print(f"[INFO] candidatos a identificador de notificação: {candidatos_id}")

# Se existir alguma coluna de "fonte"/arquivo/grupo, ela ajuda a diferenciar as 2 bases
candidatos_fonte = [c for c in df.columns if any(k in c.upper() for k in ("VERS", "FONTE", "BASE", "TPUFCOD", "TP_SISTEMA", "MIGRADO"))]
print(f"[INFO] candidatos a coluna de origem/versão: {candidatos_fonte}")
for c in candidatos_fonte:
    print(f"[INFO] {c} value_counts:\n{df[c].value_counts(dropna=False)}")

# DT_DIGITA (data de digitação) pode revelar 2 grupos de datas de processamento distintos
if "DT_DIGITA" in df.columns:
    print(f"\n[INFO] DT_DIGITA describe:\n{df['DT_DIGITA'].describe()}")
    print(f"[INFO] DT_DIGITA amostra: {df['DT_DIGITA'].dropna().unique()[:5]}")

# Testa se agrupar por (ID_MN_RESI, DT_SIN_PRI, ANO_NASC, CS_SEXO) reduz para perto do baseline
chave = [c for c in ["ID_MN_RESI", "DT_SIN_PRI", "ANO_NASC", "CS_SEXO", "DT_NOTIFIC"] if c in df.columns]
print(f"\n[INFO] chave candidata para 1 caso = 1 linha: {chave}")
if chave:
    dedup_chave = df.drop_duplicates(subset=chave)
    total = len(dedup_chave)
    diff = total - BASELINE_2023
    pct = 100 * diff / BASELINE_2023
    print(f"[INFO] linhas após dedup por {chave}: {total} (diff={diff:+d}, {pct:+.2f}%)")
