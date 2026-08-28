import pandas as pd

from data_automation.visualization import hourly_temperature_figure, indicator_figure, rain_probability_figure, temperature_range_figure


def sample_hourly_data():
    return pd.DataFrame({"datetime": pd.date_range("2026-08-27", periods=3, freq="h"), "temperature_c": [18.0, 19.5, 21.0], "humidity_pct": [80.0, 75.0, 70.0], "rain_probability_pct": [10.0, 30.0, 20.0], "wind_speed_kmh": [4.0, 6.0, 5.0]})


def test_hourly_figures_have_one_trace():
    data = sample_hourly_data()
    assert len(hourly_temperature_figure(data).data) == 1
    assert len(rain_probability_figure(data).data) == 1
    assert len(indicator_figure(data, column="humidity_pct", name="Umidade", unit="%").data) == 1


def test_temperature_range_has_minimum_average_and_maximum():
    daily = pd.DataFrame({"date": pd.to_datetime(["2026-08-27", "2026-08-28"]), "min_temperature_c": [14.0, 15.0], "avg_temperature_c": [19.0, 20.0], "max_temperature_c": [24.0, 25.0]})
    figure = temperature_range_figure(daily)
    assert len(figure.data) == 3
    assert {trace.name for trace in figure.data} == {"Mínima", "Média", "Máxima"}
