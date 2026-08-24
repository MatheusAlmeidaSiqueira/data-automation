"""Orquestração do pipeline meteorológico."""

from pathlib import Path

import pandas as pd

from data_automation.config import CITY
from data_automation.extract import fetch_weather_data
from data_automation.load import export_weather_data
from data_automation.transform import create_daily_summary, transform_weather_data


def run_pipeline() -> tuple[pd.DataFrame, pd.DataFrame, Path, Path]:
    """Executa extração, transformação, sumarização e exportação dos dados."""

    weather_data = fetch_weather_data()
    hourly_dataframe = transform_weather_data(weather_data=weather_data, city=CITY)
    daily_dataframe = create_daily_summary(hourly_dataframe)
    csv_path, excel_path = export_weather_data(
        hourly_dataframe=hourly_dataframe,
        daily_dataframe=daily_dataframe,
    )

    return hourly_dataframe, daily_dataframe, csv_path, excel_path
