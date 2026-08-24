import pandas as pd
import pytest

from data_automation.transform import create_daily_summary, transform_weather_data


def sample_weather_data() -> dict:
    return {
        "hourly": {
            "time": ["2026-08-24T00:00", "2026-08-24T01:00", "2026-08-25T00:00"],
            "temperature_2m": [18.0, 20.0, 22.0],
            "relative_humidity_2m": [80, 70, 60],
            "precipitation_probability": [10, 20, 30],
            "wind_speed_10m": [5.0, 7.0, 9.0],
        }
    }


def test_transform_weather_data_creates_clean_dataframe() -> None:
    dataframe = transform_weather_data(sample_weather_data(), "Guarulhos")

    assert len(dataframe) == 3
    assert dataframe.isna().sum().sum() == 0
    assert dataframe.duplicated(subset=["datetime"]).sum() == 0
    assert dataframe["city"].unique().tolist() == ["Guarulhos"]
    assert pd.api.types.is_datetime64_any_dtype(dataframe["datetime"])


def test_transform_rejects_response_without_hourly_data() -> None:
    with pytest.raises(ValueError, match="hourly"):
        transform_weather_data({}, "Guarulhos")


def test_create_daily_summary_groups_records_by_date() -> None:
    dataframe = transform_weather_data(sample_weather_data(), "Guarulhos")
    summary = create_daily_summary(dataframe)

    assert len(summary) == 2
    assert summary.loc[0, "min_temperature_c"] == 18.0
    assert summary.loc[0, "avg_temperature_c"] == 19.0
    assert summary.loc[0, "max_temperature_c"] == 20.0
