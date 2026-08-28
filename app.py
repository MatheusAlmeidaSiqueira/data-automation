"""Dashboard analítico do pipeline meteorológico WeatherFlow."""

from datetime import datetime
from html import escape
from pathlib import Path
import sys

import pandas as pd
import streamlit as st

PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from data_automation.pipeline import run_pipeline  # noqa: E402
from data_automation.visualization import (  # noqa: E402
    AMBER,
    hourly_temperature_figure,
    indicator_figure,
    rain_probability_figure,
    temperature_range_figure,
)

CHART_CONFIG = {"displayModeBar": False, "responsive": True}

st.set_page_config(page_title="WeatherFlow Analytics | Guarulhos", page_icon="⛅", layout="wide", initial_sidebar_state="expanded")

st.markdown(
    """
    <style>
        :root { --navy: #0f2744; --blue: #2563eb; --muted: #64748b; }
        .stApp { background: #f4f7fb; color: var(--navy); }
        .block-container { max-width: 1440px; padding-top: 1.5rem; padding-bottom: 2rem; }
        [data-testid="stSidebar"] { background: #0b1729; }
        [data-testid="stSidebar"] * { color: #e8eef7; }
        [data-testid="stSidebar"] .stButton button { background: #2563eb; border: 0; color: white; font-weight: 700; }
        .hero { background: linear-gradient(125deg, #0b1f38 0%, #123d68 68%, #0c7194 100%); border-radius: 20px; padding: 28px 32px; color: white; box-shadow: 0 14px 35px rgba(15, 39, 68, .16); margin-bottom: 20px; }
        .hero-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
        .eyebrow { color: #7dd3fc; font-size: .76rem; font-weight: 800; letter-spacing: .13em; text-transform: uppercase; }
        .hero h1 { margin: 5px 0; font-size: clamp(2rem, 4vw, 3rem); letter-spacing: -.04em; }
        .hero p { margin: 0; color: #cbd8e8; font-size: 1rem; }
        .live-badge { white-space: nowrap; background: rgba(16, 185, 129, .15); border: 1px solid rgba(110, 231, 183, .4); color: #a7f3d0; border-radius: 99px; padding: 8px 13px; font-weight: 700; font-size: .8rem; }
        .section-kicker { color: #2563eb; font-size: .75rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 2px; }
        .section-title { color: #0f2744; font-size: 1.35rem; font-weight: 800; margin: 0 0 4px; }
        .section-copy { color: #64748b; font-size: .91rem; margin: 0 0 14px; }
        .kpi-card { background: white; border: 1px solid #e3eaf3; border-radius: 16px; padding: 18px 20px; min-height: 122px; box-shadow: 0 7px 22px rgba(15, 39, 68, .055); }
        .kpi-label { color: #64748b; font-size: .78rem; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
        .kpi-value { color: #0f2744; font-size: 1.85rem; font-weight: 800; letter-spacing: -.04em; margin: 7px 0 2px; }
        .kpi-detail { color: #64748b; font-size: .78rem; }
        .insight-card { background: #eef5ff; border-left: 4px solid #2563eb; color: #27415f; border-radius: 10px; padding: 13px 16px; margin-bottom: 14px; }
        .quality-card { background: white; border: 1px solid #dce6f1; border-radius: 14px; padding: 16px; }
        .quality-number { color: #0f2744; font-size: 1.5rem; font-weight: 800; }
        .quality-label { color: #64748b; font-size: .78rem; }
        .pipeline { background: #0f2744; color: white; border-radius: 14px; padding: 18px; text-align: center; font-weight: 700; }
        .pipeline span { color: #7dd3fc; padding: 0 8px; }
        .stTabs [data-baseweb="tab-list"] { gap: 28px; border-bottom: 1px solid #dce5ef; }
        .stTabs [data-baseweb="tab"] { color: #53657a; font-weight: 700; padding-left: 0; padding-right: 0; }
        .stTabs [aria-selected="true"] { color: #2563eb !important; }
        [data-testid="stDataFrame"] { border: 1px solid #e3eaf3; border-radius: 12px; overflow: hidden; }
        .footer { color: #7b8ba0; text-align: center; padding-top: 24px; font-size: .82rem; }
        @media (max-width: 720px) { .hero-row { display: block; } .live-badge { display: inline-block; margin-top: 16px; } }
    </style>
    """,
    unsafe_allow_html=True,
)


@st.cache_data(ttl=900, show_spinner=False)
def load_dashboard_data():
    """Executa o pipeline e mantém os dados em cache por quinze minutos."""
    return run_pipeline()


def section_header(kicker: str, title: str, copy: str) -> None:
    st.markdown(f'<div class="section-kicker">{escape(kicker)}</div><div class="section-title">{escape(title)}</div><div class="section-copy">{escape(copy)}</div>', unsafe_allow_html=True)


def kpi_card(label: str, value: str, detail: str) -> None:
    st.markdown(f'<div class="kpi-card"><div class="kpi-label">{escape(label)}</div><div class="kpi-value">{escape(value)}</div><div class="kpi-detail">{escape(detail)}</div></div>', unsafe_allow_html=True)


st.markdown(
    """
    <div class="hero"><div class="hero-row"><div>
        <div class="eyebrow">Data product • Previsão de 7 dias</div>
        <h1>WeatherFlow Analytics</h1>
        <p>Dados meteorológicos de Guarulhos transformados em informação para decisão.</p>
    </div><div class="live-badge">● DADOS ATUALIZADOS</div></div></div>
    """,
    unsafe_allow_html=True,
)

with st.sidebar:
    st.title("WeatherFlow")
    st.caption("Painel de controle")
    st.divider()
    st.markdown("**Fonte dos dados**")
    st.caption("Open-Meteo API · atualização em cache a cada 15 minutos")
    if st.button("Atualizar dados agora", width="stretch"):
        st.cache_data.clear()
        st.rerun()

try:
    with st.spinner("Atualizando o pipeline meteorológico..."):
        hourly_data, daily_data, csv_path, excel_path = load_dashboard_data()
except Exception as error:
    st.error("Os dados não puderam ser atualizados. Verifique a conexão e tente novamente.")
    with st.expander("Detalhes técnicos para diagnóstico"):
        st.code(f"{type(error).__name__}: {error}")
    st.stop()

minimum_date = hourly_data["date"].min()
maximum_date = hourly_data["date"].max()

with st.sidebar:
    st.divider()
    selected_period = st.date_input("Período analisado", value=(minimum_date, maximum_date), min_value=minimum_date, max_value=maximum_date, format="DD/MM/YYYY")
    st.caption(f"Base completa: {len(hourly_data)} registros horários")

if isinstance(selected_period, tuple) and len(selected_period) == 2:
    start_date, end_date = selected_period
else:
    start_date = end_date = selected_period

filtered_data = hourly_data[hourly_data["date"].between(start_date, end_date)].copy()
filtered_daily = daily_data[daily_data["date"].between(start_date, end_date)].copy()

if filtered_data.empty:
    st.warning("Não há registros para o período selecionado.")
    st.stop()

current = filtered_data.iloc[0]
updated_at = datetime.now().strftime("%d/%m/%Y às %H:%M")

section_header("Monitoramento", "Condições no início do período", f"Referência: {current['datetime']:%d/%m/%Y às %H:%M} · painel atualizado em {updated_at}")
kpis = st.columns(4)
with kpis[0]:
    kpi_card("Temperatura", f"{current['temperature_c']:.1f} °C", "Previsão horária")
with kpis[1]:
    kpi_card("Umidade relativa", f"{current['humidity_pct']:.0f}%", "Percentual do ar")
with kpis[2]:
    kpi_card("Chance de chuva", f"{current['rain_probability_pct']:.0f}%", "Probabilidade estimada")
with kpis[3]:
    kpi_card("Velocidade do vento", f"{current['wind_speed_kmh']:.1f} km/h", "Medição a 10 metros")

st.write("")
overview_tab, indicators_tab, data_tab = st.tabs(["Visão executiva", "Análise operacional", "Dados e metodologia"])

with overview_tab:
    section_header("Tendência", "Faixa térmica prevista", "Comparação entre temperaturas mínima, média e máxima por dia.")
    st.plotly_chart(temperature_range_figure(filtered_daily), width="stretch", config=CHART_CONFIG)

    hottest = filtered_daily.loc[filtered_daily["max_temperature_c"].idxmax()]
    rain_peak = filtered_data.loc[filtered_data["rain_probability_pct"].idxmax()]
    st.markdown(f'<div class="insight-card"><strong>Leitura rápida:</strong> a maior temperatura prevista é <strong>{hottest["max_temperature_c"]:.1f} °C</strong> em {pd.Timestamp(hottest["date"]):%d/%m}. O pico de probabilidade de chuva chega a <strong>{rain_peak["rain_probability_pct"]:.0f}%</strong> em {rain_peak["datetime"]:%d/%m às %H:%M}.</div>', unsafe_allow_html=True)

    hourly_left, rain_right = st.columns([1.2, 1])
    with hourly_left:
        section_header("Detalhamento", "Temperatura por hora", "Variação ao longo do período selecionado.")
        st.plotly_chart(hourly_temperature_figure(filtered_data), width="stretch", config=CHART_CONFIG)
    with rain_right:
        section_header("Risco", "Probabilidade de chuva", "Distribuição horária entre 0% e 100%.")
        st.plotly_chart(rain_probability_figure(filtered_data), width="stretch", config=CHART_CONFIG)

with indicators_tab:
    humidity_col, wind_col = st.columns(2)
    with humidity_col:
        section_header("Atmosfera", "Umidade relativa", "Comportamento percentual da umidade do ar.")
        st.plotly_chart(indicator_figure(filtered_data, column="humidity_pct", name="Umidade", unit="%"), width="stretch", config=CHART_CONFIG)
    with wind_col:
        section_header("Condições", "Velocidade do vento", "Evolução prevista em quilômetros por hora.")
        st.plotly_chart(indicator_figure(filtered_data, column="wind_speed_kmh", name="Vento", unit="km/h", color=AMBER), width="stretch", config=CHART_CONFIG)

    section_header("Consolidação", "Resumo diário", "Indicadores agregados usados na análise executiva.")
    display_daily = filtered_daily.rename(columns={"date": "Data", "city": "Cidade", "min_temperature_c": "Mín. (°C)", "avg_temperature_c": "Média (°C)", "max_temperature_c": "Máx. (°C)", "avg_humidity_pct": "Umidade média (%)", "max_rain_probability_pct": "Chuva máx. (%)", "max_wind_speed_kmh": "Vento máx. (km/h)"})
    st.dataframe(display_daily, width="stretch", hide_index=True)

with data_tab:
    section_header("Governança", "Qualidade dos dados", "Validações aplicadas após extração e transformação.")
    empty_values = int(hourly_data.isna().sum().sum())
    duplicate_values = int(hourly_data.duplicated(subset=["datetime"]).sum())
    quality_values = [(f"{len(hourly_data)}", "registros processados"), (f"{empty_values}", "valores ausentes"), (f"{duplicate_values}", "horários duplicados"), (f"{len(daily_data)}", "dias consolidados")]
    for column, (value, label) in zip(st.columns(4), quality_values, strict=True):
        with column:
            st.markdown(f'<div class="quality-card"><div class="quality-number">{value}</div><div class="quality-label">{label}</div></div>', unsafe_allow_html=True)

    st.write("")
    section_header("Arquitetura", "Pipeline de ponta a ponta", "Fluxo modular que torna o processo testável e reutilizável.")
    st.markdown('<div class="pipeline">Open-Meteo API <span>→</span> Extract <span>→</span> Transform + Validate <span>→</span> CSV / Excel <span>→</span> Dashboard</div>', unsafe_allow_html=True)

    with st.expander("Visualizar dados tratados"):
        display_hourly = filtered_data.rename(columns={"datetime": "Data e hora", "city": "Cidade", "temperature_c": "Temperatura (°C)", "humidity_pct": "Umidade (%)", "rain_probability_pct": "Chuva (%)", "wind_speed_kmh": "Vento (km/h)", "date": "Data", "hour": "Hora"})
        st.dataframe(display_hourly, width="stretch", hide_index=True)

    section_header("Exportação", "Baixe os resultados", "Arquivos gerados pelo mesmo pipeline que alimenta o dashboard.")
    download_csv, download_excel = st.columns(2)
    with download_csv:
        st.download_button("Baixar base tratada (.csv)", data=Path(csv_path).read_bytes(), file_name="weather_data.csv", mime="text/csv", width="stretch")
    with download_excel:
        st.download_button("Baixar relatório executivo (.xlsx)", data=Path(excel_path).read_bytes(), file_name="weather_report.xlsx", mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", width="stretch")

st.markdown('<div class="footer">Desenvolvido por Matheus Almeida Siqueira · Python · Pandas · Streamlit · Plotly · Open-Meteo</div>', unsafe_allow_html=True)
