import pandas as pd


REQUIRED_COLUMNS = [
    "time",
    "temperature_2m",
    "relative_humidity_2m",
    "precipitation_probability",
    "wind_speed_10m",
]


def transform_weather_data(weather_data: dict, city: str) -> pd.DataFrame:
    """Transforma os dados brutos da API em uma tabela limpa."""

    if "hourly" not in weather_data:
        raise ValueError("A resposta da API não possui o campo 'hourly'.")

    dataframe = pd.DataFrame(weather_data["hourly"])

    missing_columns = [
        column
        for column in REQUIRED_COLUMNS
        if column not in dataframe.columns
    ]

    if missing_columns:
        raise ValueError(
            f"Colunas obrigatórias ausentes: {missing_columns}"
        )

    dataframe = dataframe[REQUIRED_COLUMNS].copy()

    dataframe["time"] = pd.to_datetime(
        dataframe["time"],
        errors="coerce",
    )

    numeric_columns = [
        "temperature_2m",
        "relative_humidity_2m",
        "precipitation_probability",
        "wind_speed_10m",
    ]

    for column in numeric_columns:
        dataframe[column] = pd.to_numeric(
            dataframe[column],
            errors="coerce",
        )

    dataframe = dataframe.dropna(
        subset=["time", "temperature_2m"]
    )

    dataframe = dataframe.drop_duplicates(
        subset=["time"]
    )

    dataframe[numeric_columns] = dataframe[
        numeric_columns
    ].interpolate(limit_direction="both")

    dataframe = dataframe.rename(
        columns={
            "time": "datetime",
            "temperature_2m": "temperature_c",
            "relative_humidity_2m": "humidity_pct",
            "precipitation_probability": "rain_probability_pct",
            "wind_speed_10m": "wind_speed_kmh",
        }
    )

    dataframe.insert(1, "city", city)

    dataframe["date"] = dataframe["datetime"].dt.date
    dataframe["hour"] = dataframe["datetime"].dt.hour

    dataframe = dataframe.sort_values("datetime")
    dataframe = dataframe.reset_index(drop=True)

    return dataframe
