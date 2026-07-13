from pathlib import Path
import argparse
import csv
import re
import time
import requests


SIDRA_URL = "https://apisidra.ibge.gov.br/values/t/6579/n6/all/p/{ano}/v/9324"


def limpar_populacao(valor):
    if valor is None:
        return None

    valor = str(valor).strip()

    if valor in {"", "-", "...", "X"}:
        return None

    valor = valor.replace(".", "").replace(",", ".")

    try:
        return int(float(valor))
    except ValueError:
        return None


def extrair_codigo_municipio(row):
    """
    Usa o campo "D1C" (Município (Código)), confirmado como o formato real
    retornado pelo endpoint em lote do SIDRA (values/t/.../n6/all/...). Se essa
    chave não existir (ex.: resposta de outro formato), cai para uma busca
    heurística por qualquer valor de 7 dígitos, excluindo explicitamente os
    campos de valor ("V"/"Valor") — a população de cidades entre 1 e 10
    milhões de habitantes também tem 7 dígitos e pode ser confundida com o
    código do município.
    """
    direto = str(row.get("D1C", "")).strip()
    if re.fullmatch(r"\d{7}", direto):
        return direto, direto[:6]

    candidatos = []
    for key, value in row.items():
        if key in ("V", "Valor"):
            continue
        value = str(value).strip()
        if re.fullmatch(r"\d{7}", value):
            candidatos.append(value)

    if not candidatos:
        return None, None

    cod_mun7 = candidatos[0]
    cod_mun6 = cod_mun7[:6]
    return cod_mun7, cod_mun6


def extrair_nome_municipio(row, cod_mun7):
    """
    Usa o campo "D1N" (Município), confirmado como o formato real do SIDRA.
    Faz fallback para a busca pela chave irmã do campo onde o código foi
    encontrado (formato genérico DxC/DxN) caso a chave direta não exista.
    """
    direto = str(row.get("D1N", "")).strip()
    if direto:
        return direto

    for key, value in row.items():
        if str(value).strip() == str(cod_mun7):
            nome_key = key[:-1] + "N"
            return str(row.get(nome_key, "")).strip()

    return ""


def baixar_ano(ano, tentativas=3, pausa=1.5):
    url = SIDRA_URL.format(ano=ano)

    for tentativa in range(1, tentativas + 1):
        print(f"[GET] {ano} tentativa {tentativa}: {url}")

        try:
            response = requests.get(url, timeout=180)
        except requests.RequestException as exc:
            print(f"[AVISO] Falha de conexão em {ano}: {exc}")
            time.sleep(pausa)
            continue

        if response.status_code != 200:
            print(f"[AVISO] Ano {ano} indisponível ou erro HTTP {response.status_code}.")
            return []

        try:
            data = response.json()
        except ValueError:
            print(f"[AVISO] Resposta inválida em {ano}.")
            return []

        if not data or len(data) <= 1:
            print(f"[AVISO] Ano {ano} sem dados.")
            return []

        registros = []

        for row in data[1:]:
            cod_mun7, cod_mun6 = extrair_codigo_municipio(row)

            if not cod_mun6:
                continue

            populacao = limpar_populacao(row.get("V"))

            if populacao is None:
                continue

            municipio = extrair_nome_municipio(row, cod_mun7)

            registros.append({
                "cod_mun6": cod_mun6,
                "ano": ano,
                "populacao": populacao,
                "municipio_ibge": municipio,
            })

        print(f"[OK] {ano}: {len(registros)} municípios")
        return registros

    print(f"[ERRO] Não foi possível baixar {ano}.")
    return []


def main():
    parser = argparse.ArgumentParser(
        description="Baixa população municipal do IBGE/SIDRA e gera data/populacao_municipio_ano.csv."
    )
    parser.add_argument("--start-year", type=int, default=2000)
    parser.add_argument("--end-year", type=int, default=2025)
    parser.add_argument("--out", type=str, default="data/populacao_municipio_ano.csv")
    args = parser.parse_args()

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    todos = []

    for ano in range(args.start_year, args.end_year + 1):
        registros = baixar_ano(ano)
        todos.extend(registros)
        time.sleep(0.4)

    if not todos:
        raise RuntimeError("Nenhum dado de população foi baixado.")

    # Remove duplicatas por segurança.
    dedup = {}
    for r in todos:
        dedup[(r["cod_mun6"], r["ano"])] = r

    todos = sorted(dedup.values(), key=lambda x: (x["cod_mun6"], x["ano"]))

    with out_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["cod_mun6", "ano", "populacao", "municipio_ibge"]
        )
        writer.writeheader()
        writer.writerows(todos)

    municipios = len(set(r["cod_mun6"] for r in todos))
    anos = sorted(set(r["ano"] for r in todos))

    print()
    print(f"[SALVO] {out_path}")
    print(f"[LINHAS] {len(todos)}")
    print(f"[MUNICÍPIOS] {municipios}")
    print(f"[ANOS] {anos[0]}-{anos[-1]}")


if __name__ == "__main__":
    main()
