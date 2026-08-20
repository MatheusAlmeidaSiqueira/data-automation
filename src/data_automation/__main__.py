from data_automation.config import CITY
from data_automation.extract import fetch_weather_data
from data_automation.load import export_weather_data
from data_automation.transform import transform_weather_data


def main() -> None:
    print(f"Buscando dados meteorológicos de {CITY}...")

    weather_data = fetch_weather_data()

    print("Transformando e limpando os dados...")

    dataframe = transform_weather_data(
        weather_data=weather_data,
        city=CITY,
    )

    print("Gerando arquivos CSV e Excel...")

    csv_path, excel_path = export_weather_data(dataframe)

    print("\nProcessamento concluído com sucesso!")
    print(f"Quantidade de registros: {len(dataframe)}")
    print(f"Valores vazios: {dataframe.isna().sum().sum()}")
    print(f"Registros duplicados: {dataframe.duplicated().sum()}")

    print("\nPrimeiros cinco registros:")
    print(dataframe.head())

    print("\nArquivos gerados:")
    print(f"CSV: {csv_path.resolve()}")
    print(f"Excel: {excel_path.resolve()}")


if __name__ == "__main__":
    main()
