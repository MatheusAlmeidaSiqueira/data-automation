"""Visualizações Plotly reutilizáveis do dashboard WeatherFlow."""

import pandas as pd
import plotly.graph_objects as go

NAVY = "#0F2744"
BLUE = "#2563EB"
SKY = "#38BDF8"
CYAN = "#0891B2"
AMBER = "#F59E0B"
GRID = "#E8EEF6"
MUTED = "#64748B"


def _finish_chart(figure: go.Figure, *, height: int = 390) -> go.Figure:
    """Aplica o mesmo padrão visual a todos os gráficos."""

    figure.update_layout(
        height=height,
        margin={"l": 16, "r": 16, "t": 24, "b": 16},
        paper_bgcolor="#FFFFFF",
        plot_bgcolor="#FFFFFF",
        font={"family": "Inter, Arial, sans-serif", "color": NAVY, "size": 13},
        hovermode="x unified",
        hoverlabel={"bgcolor": NAVY, "font_color": "#FFFFFF"},
        legend={"orientation": "h", "yanchor": "bottom", "y": 1.02, "xanchor": "left", "x": 0},
        xaxis={"showgrid": False, "linecolor": GRID, "tickfont": {"color": MUTED}, "hoverformat": "%d/%m %H:%M"},
        yaxis={"gridcolor": GRID, "gridwidth": 1, "zeroline": False, "tickfont": {"color": MUTED}},
    )
    return figure


def temperature_range_figure(daily_data: pd.DataFrame) -> go.Figure:
    """Mostra a faixa diária de temperatura e a média prevista."""

    figure = go.Figure()
    figure.add_trace(go.Scatter(x=daily_data["date"], y=daily_data["max_temperature_c"], name="Máxima", mode="lines+markers", line={"color": AMBER, "width": 2}, marker={"size": 6}, hovertemplate="Máxima: %{y:.1f} °C<extra></extra>"))
    figure.add_trace(go.Scatter(x=daily_data["date"], y=daily_data["min_temperature_c"], name="Mínima", mode="lines", line={"color": SKY, "width": 1}, fill="tonexty", fillcolor="rgba(56, 189, 248, 0.15)", hovertemplate="Mínima: %{y:.1f} °C<extra></extra>"))
    figure.add_trace(go.Scatter(x=daily_data["date"], y=daily_data["avg_temperature_c"], name="Média", mode="lines+markers", line={"color": BLUE, "width": 3}, marker={"size": 7, "color": "#FFFFFF", "line": {"color": BLUE, "width": 2}}, hovertemplate="Média: %{y:.1f} °C<extra></extra>"))
    figure.update_yaxes(title="Temperatura (°C)")
    return _finish_chart(figure, height=410)


def hourly_temperature_figure(hourly_data: pd.DataFrame) -> go.Figure:
    """Mostra a evolução horária da temperatura."""

    figure = go.Figure(go.Scatter(x=hourly_data["datetime"], y=hourly_data["temperature_c"], name="Temperatura", mode="lines", line={"color": BLUE, "width": 3, "shape": "spline"}, fill="tozeroy", fillcolor="rgba(37, 99, 235, 0.07)", hovertemplate="%{y:.1f} °C<extra></extra>"))
    figure.update_yaxes(title="°C", rangemode="tozero")
    return _finish_chart(figure)


def rain_probability_figure(hourly_data: pd.DataFrame) -> go.Figure:
    """Mostra a probabilidade de chuva por hora."""

    figure = go.Figure(go.Bar(x=hourly_data["datetime"], y=hourly_data["rain_probability_pct"], name="Probabilidade", marker={"color": hourly_data["rain_probability_pct"], "colorscale": [[0, "#DBEAFE"], [1, BLUE]]}, hovertemplate="%{y:.0f}%<extra></extra>"))
    figure.update_yaxes(title="Probabilidade (%)", range=[0, 100])
    return _finish_chart(figure, height=360)


def indicator_figure(hourly_data: pd.DataFrame, *, column: str, name: str, unit: str, color: str = CYAN) -> go.Figure:
    """Cria uma série horária para um indicador operacional."""

    figure = go.Figure(go.Scatter(x=hourly_data["datetime"], y=hourly_data[column], name=name, mode="lines", line={"color": color, "width": 2.5, "shape": "spline"}, hovertemplate=f"%{{y:.1f}} {unit}<extra></extra>"))
    figure.update_yaxes(title=unit)
    return _finish_chart(figure, height=340)
