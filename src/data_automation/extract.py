import requests

from data_automation.config import (
    API_URL,
    FORECAST_DAYS,
    HOURLY_FIELDS,
    LATITUDE,
    LONGITUDE,
    TIMEZONE,
)


def fetch_weather_data() -> dict:
    """Busca os dados meteorológicos na API Open-Meteo."""

    parameters = {
        "latitude": LATITUDE,
        "longitude": LONGITUDE,
        "hourly": ",".join(HOURLY_FIELDS),
        "timezone": TIMEZONE,
        "forecast_days": FORECAST_DAYS,
    }

    response = requests.get(
        API_URL,
        params=parameters,
        timeout=20,
    )

    response.raise_for_status()

    return response.json()
