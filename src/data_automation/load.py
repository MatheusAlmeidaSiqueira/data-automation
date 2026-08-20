from pathlib import Path

import pandas as pd
from openpyxl.chart import LineChart, Reference
from openpyxl.styles import Font, PatternFill

OUTPUT_DIRECTORY = Path("data/processed")


def export_weather_data(
    dataframe: pd.DataFrame,
) -> tuple[Path, Path]:
    """Exporta os dados processados para CSV e Excel."""

    OUTPUT_DIRECTORY.mkdir(
        parents=True,
        exist_ok=True,
    )

    csv_path = OUTPUT_DIRECTORY / "weather_data.csv"
    excel_path = OUTPUT_DIRECTORY / "weather_report.xlsx"

    dataframe.to_csv(
        csv_path,
        index=False,
        encoding="utf-8-sig",
    )

    with pd.ExcelWriter(
        excel_path,
        engine="openpyxl",
    ) as writer:
        dataframe.to_excel(
            writer,
            sheet_name="Weather Data",
            index=False,
        )

        worksheet = writer.book["Weather Data"]

        worksheet.freeze_panes = "A2"
        worksheet.auto_filter.ref = worksheet.dimensions

        header_fill = PatternFill(
            fill_type="solid",
            fgColor="1F4E78",
        )

        header_font = Font(
            bold=True,
            color="FFFFFF",
        )

        for cell in worksheet[1]:
            cell.fill = header_fill
            cell.font = header_font

        for column_cells in worksheet.columns:
            largest_value = max(len(str(cell.value or "")) for cell in column_cells)

            column_letter = column_cells[0].column_letter

            worksheet.column_dimensions[column_letter].width = min(
                largest_value + 2, 30
            )

        chart = LineChart()
        chart.title = "Previsão de temperatura"
        chart.y_axis.title = "Temperatura (°C)"
        chart.x_axis.title = "Data e hora"
        chart.height = 8
        chart.width = 16

        temperature_data = Reference(
            worksheet,
            min_col=3,
            min_row=1,
            max_row=worksheet.max_row,
        )

        datetime_data = Reference(
            worksheet,
            min_col=1,
            min_row=2,
            max_row=worksheet.max_row,
        )

        chart.add_data(
            temperature_data,
            titles_from_data=True,
        )

        chart.set_categories(datetime_data)

        worksheet.add_chart(chart, "J2")

    return csv_path, excel_path
