# EpiBrasil

Painel epidemiológico estático para GitHub Pages.

## Dados processados

O arquivo `data/indicadores_municipio_ano.csv` foi gerado a partir de exports CSV do TABNET/SINAN enviados pelo usuário.

Formato:

```csv
doenca,doenca_nome,cod_mun6,municipio,uf,ano,casos
```

## Incidência

A versão atual mostra casos absolutos. Para calcular incidência, adicione ao CSV:

```csv
populacao,incidencia_100mil
```

ou envie uma tabela de população municipal por ano para junção.

## GitHub Pages

Configurar em:

```text
Settings > Pages > Deploy from a branch > main > /root
```
