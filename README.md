# Data Automation — Weather Report

Pipeline ETL em Python que coleta a previsão meteorológica de Guarulhos pela
API Open-Meteo, limpa e valida 168 registros horários e gera relatórios em CSV
e Excel.

## Funcionalidades

- Extração de sete dias de previsão horária por API REST.
- Conversão de datas e campos numéricos com Pandas.
- Remoção de registros inválidos e duplicados.
- Tratamento de valores ausentes por interpolação.
- Resumo diário com temperaturas mínima, média e máxima.
- Indicadores de umidade, chuva e vento.
- Planilha Excel formatada com duas abas e gráfico de temperatura.
- Testes automatizados com Pytest.

## Tecnologias

Python 3.11, Requests, Pandas, OpenPyXL e Pytest.

## Estrutura

```text
data-automation/
├── data/
│   ├── raw/
│   └── processed/
├── src/data_automation/
│   ├── config.py
│   ├── extract.py
│   ├── transform.py
│   ├── load.py
│   ├── pipeline.py
│   └── __main__.py
├── tests/
├── requirements.txt
└── README.md
```

## Como executar

No Windows, dentro da pasta do projeto:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
set PYTHONPATH=src
python -m data_automation
```

Os arquivos serão criados em `data/processed/`:

- `weather_data.csv`: dados horários tratados.
- `weather_report.xlsx`: dados horários, resumo diário e gráfico.

## Testes

```bash
set PYTHONPATH=src
pytest -v
```

## Resultado esperado

O pipeline processa 168 registros (24 horas × 7 dias), verifica valores vazios
e duplicados e cria um resumo de sete dias. A quantidade pode variar caso a API
altere o período solicitado ou descarte algum registro inválido.

## Autor

Matheus Almeida Siqueira — [GitHub](https://github.com/MatheusAlmeidaSiqueira)
