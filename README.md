# EpiBrasil — Painel Epidemiológico Interativo

O **EpiBrasil** é um painel epidemiológico estático para visualização exploratória de doenças e agravos notificados no Brasil, com dados agregados por município, Unidade Federativa, ano e doença.

O projeto tem como objetivo facilitar a análise territorial e temporal de notificações, permitindo consultar séries históricas, rankings, mapas temáticos, incidência e distribuição municipal dos casos.

O projeto está em construção e é sujeito a bugs, erros e falhas!

## Acesso ao painel

O painel pode ser publicado via **GitHub Pages**.

URL esperada:

```text
https://leprechas.github.io/epibrasil-painel/
```

## Funcionalidades

O painel permite:

- selecionar uma doença ou agravo;
- selecionar um ou múltiplos anos;
- filtrar por Unidade Federativa;
- filtrar por município;
- visualizar casos no período selecionado;
- visualizar população-ano;
- calcular incidência por 100 mil habitantes;
- identificar municípios com notificações;
- gerar série histórica de casos;
- gerar ranking de UFs;
- gerar ranking municipal;
- visualizar mapa das UFs;
- visualizar mapa dos municípios;
- baixar CSV filtrado;
- baixar mapa das UFs;
- baixar mapa municipal;
- consultar fonte dos dados e metodologia diretamente no painel.

---

## Fontes dos dados

Os dados utilizados no painel são provenientes de bases públicas e agregadas.

### Casos

Os dados de casos foram obtidos a partir de exportações agregadas do **SINAN/DATASUS**, via TABNET, organizados por:

```text
doença, município, UF, ano e número de casos
```

### População

A população municipal por ano é obtida a partir do **IBGE/SIDRA**, sendo utilizada para o cálculo da população-ano e da incidência por 100 mil habitantes.

### Malhas territoriais

As malhas territoriais são utilizadas em formato GeoJSON:

```text
data/ufs.geojson
data/municipios.geojson
```

Esses arquivos permitem a construção dos mapas temáticos por Unidade Federativa e por município.

---

## Estrutura do repositório

```text
.
├── index.html
├── style.css
├── app.js
├── README.md
├── .nojekyll
├── data/
│   ├── manifest.json
│   ├── populacao_municipio_ano.csv
│   ├── ufs.geojson
│   ├── municipios.geojson
│   └── doencas/
│       ├── deng.csv
│       ├── tube.csv
│       ├── hans.csv
│       └── ...
├── scripts/
│   └── baixar_populacao_ibge.py
└── .github/
    └── workflows/
        └── baixar-populacao.yml
```

---

## Formato dos dados epidemiológicos

Os dados de doenças ficam armazenados na pasta:

```text
data/doencas/
```

Cada arquivo CSV corresponde a uma doença ou agravo.

Formato esperado:

```csv
doenca,doenca_nome,cod_mun6,municipio,uf,ano,casos
DENG,Dengue,355030,Sao Paulo,SP,2024,72287
```

Campos:

| Campo | Descrição |
|---|---|
| `doenca` | Código interno da doença |
| `doenca_nome` | Nome da doença ou agravo |
| `cod_mun6` | Código municipal de 6 dígitos |
| `municipio` | Nome do município |
| `uf` | Sigla da Unidade Federativa |
| `ano` | Ano de notificação |
| `casos` | Número de casos agregados |

---

## Manifesto das doenças

O arquivo:

```text
data/manifest.json
```

lista as doenças disponíveis no painel e informa qual arquivo CSV deve ser carregado para cada uma.

Essa estrutura evita carregar um único arquivo muito grande e melhora o desempenho do painel no GitHub Pages.

Exemplo simplificado:

```json
[
  {
    "codigo": "DENG",
    "doenca": "Dengue",
    "arquivo": "data/doencas/deng.csv"
  },
  {
    "codigo": "TUBE",
    "doenca": "Tuberculose",
    "arquivo": "data/doencas/tube.csv"
  }
]
```

---

## População municipal

O arquivo de população utilizado pelo painel é:

```text
data/populacao_municipio_ano.csv
```

Formato esperado:

```csv
cod_mun6,ano,populacao,municipio_ibge
355030,2024,11904961,São Paulo - SP
```

Campos:

| Campo | Descrição |
|---|---|
| `cod_mun6` | Código municipal de 6 dígitos |
| `ano` | Ano da estimativa populacional |
| `populacao` | População municipal estimada |
| `municipio_ibge` | Nome do município conforme IBGE |

---

## Cálculo da incidência

A incidência é calculada como:

```text
incidência = casos / população × 100.000
```

Para múltiplos anos selecionados, o painel utiliza:

```text
incidência no período = soma dos casos / soma da população-ano × 100.000
```

Assim, quando vários anos são selecionados, a população é tratada como **população-ano acumulada no período**.

---

## Interpolação populacional

Quando a população de determinado município-ano não está disponível diretamente, o painel tenta estimar a população por:

1. busca exata por código municipal e ano;
2. interpolação entre anos disponíveis;
3. extrapolação com base na tendência populacional recente;
4. busca alternativa por nome do município e UF.

Essa estratégia reduz lacunas em municípios com ausência de população em anos específicos, mas não substitui validação demográfica detalhada.

---

## Atualização da população

A população pode ser atualizada automaticamente por GitHub Actions.

Workflow:

```text
.github/workflows/baixar-populacao.yml
```

Para executar:

1. Acesse a aba **Actions** no GitHub.
2. Selecione **Baixar população municipal IBGE**.
3. Clique em **Run workflow**.
4. Informe o ano inicial e final.
5. Execute o workflow.

Exemplo recomendado:

```text
start_year: 2000
end_year: 2025
```

O workflow gera ou atualiza automaticamente:

```text
data/populacao_municipio_ano.csv
```

---

## Atualização local da população

Também é possível baixar a população localmente:

```bash
python -m pip install requests
python scripts/baixar_populacao_ibge.py --start-year 2000 --end-year 2025
```

O arquivo será salvo em:

```text
data/populacao_municipio_ano.csv
```

---

## Interpretação dos resultados

O EpiBrasil é uma ferramenta exploratória. Os resultados devem ser interpretados considerando:

- diferenças de cobertura da vigilância;
- atraso de notificação;
- revisão das bases oficiais;
- mudanças nos critérios de vigilância;
- variações na capacidade diagnóstica;
- diferenças territoriais e operacionais entre municípios e estados;
- instabilidade de taxas em municípios de pequena população;
- possíveis diferenças entre ano de notificação, ano de diagnóstico e ano epidemiológico, dependendo da base utilizada.

A incidência calculada pelo painel é útil para análise descritiva e comparação exploratória, mas não substitui análises epidemiológicas formais.

---

## Privacidade e segurança dos dados

O painel utiliza apenas dados agregados por município, ano e doença.

Não devem ser publicados:

- microdados identificáveis;
- nomes de pacientes;
- datas individuais de notificação;
- endereços;
- informações sensíveis individualizadas.

---

## Limitações

Atualmente, o painel depende de arquivos CSV e GeoJSON estáticos. Portanto:

- não há banco de dados backend;
- não há autenticação;
- não há atualização automática dos casos;
- a atualização dos dados depende da substituição dos arquivos na pasta `data/`;
- grandes arquivos GeoJSON podem impactar o tempo de carregamento inicial;
- mapas exportados podem depender do comportamento do navegador;
- municípios com alterações territoriais ou códigos divergentes podem exigir correção manual;
- a interpolação populacional é uma solução operacional e deve ser validada em análises formais.

---

## Natureza do projeto

Este projeto é um protótipo técnico-científico de painel epidemiológico estático, com foco em visualização, organização e exploração de dados públicos agregados de saúde.

O EpiBrasil pode ser expandido futuramente para incluir:

- novos indicadores epidemiológicos;
- comparação entre doenças;
- suavização de taxas;
- classificação cartográfica por quantis;
- exportação de gráficos;
- documentação metodológica ampliada;
- integração automatizada com fontes públicas;
- filtros por região de saúde, macrorregião ou bioma;
- análise de tendência temporal;
- alertas de valores extremos;
- séries históricas comparativas entre UFs e municípios.

---

## Aviso metodológico

O EpiBrasil não deve ser interpretado como sistema oficial de vigilância epidemiológica. O painel organiza e visualiza dados públicos agregados, mas a interpretação dos resultados exige conhecimento epidemiológico, avaliação da qualidade dos dados e consideração do contexto territorial e programático.

As informações apresentadas devem ser utilizadas para fins exploratórios, educacionais, científicos ou de apoio inicial à análise epidemiológica.
