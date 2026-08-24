from data_automation.config import CITY
from data_automation.pipeline import run_pipeline


def main() -> None:
    print(f"Buscando dados meteorológicos de {CITY}...")

    print("Transformando, validando e resumindo os dados...")
    print("Gerando arquivos CSV e Excel...")

    dataframe, daily_dataframe, csv_path, excel_path = run_pipeline()

    print("\nProcessamento concluído com sucesso!")
    print(f"Quantidade de registros: {len(dataframe)}")
    print(f"Valores vazios: {dataframe.isna().sum().sum()}")
    print(f"Registros duplicados: {dataframe.duplicated().sum()}")
    print(f"Dias resumidos: {len(daily_dataframe)}")

    print("\nPrimeiros cinco registros:")
    print(dataframe.head())

    print("\nArquivos gerados:")
    print(f"CSV: {csv_path.resolve()}")
    print(f"Excel: {excel_path.resolve()}")


if __name__ == "__main__":
    main()
