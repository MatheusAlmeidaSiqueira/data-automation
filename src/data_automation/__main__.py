from data_automation.config import CITY
from data_automation.extract import fetch_weather_data


def main() -> None:
    print(f"Buscando dados meteorológicos de {CITY}...")

    weather_data = fetch_weather_data()

    latitude = weather_data["latitude"]
    longitude = weather_data["longitude"]
    hourly_data = weather_data["hourly"]

    print("Consulta realizada com sucesso!")
    print(f"Latitude retornada: {latitude}")
    print(f"Longitude retornada: {longitude}")
    print(f"Quantidade de horários: {len(hourly_data['time'])}")

    print("\nPrimeiro registro:")
    print(f"Data e hora: {hourly_data['time'][0]}")
    print(f"Temperatura: {hourly_data['temperature_2m'][0]} °C")
    print(f"Umidade: {hourly_data['relative_humidity_2m'][0]}%")
    print(
        "Probabilidade de chuva: "
        f"{hourly_data['precipitation_probability'][0]}%"
    )
    print(f"Velocidade do vento: {hourly_data['wind_speed_10m'][0]} km/h")


if __name__ == "__main__":
    main()
