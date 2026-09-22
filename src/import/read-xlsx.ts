import ExcelJS from "exceljs";
import type { Currency } from "../domain/types.js";
import { roundMoney, type ConsumptionRow } from "./consumption.js";

function asDate(value: ExcelJS.CellValue): string {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const text = String(value ?? "").trim();
  const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  throw new Error(`Unreadable submission date: ${text}`);
}

export async function readConsumptionWorkbook(path: string): Promise<ConsumptionRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const sheet = workbook.getWorksheet("Consumption per PO");
  if (!sheet) throw new Error("Consumption per PO sheet is missing");
  const rows: ConsumptionRow[] = [];
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    const poNumber = String(row.getCell(1).value ?? "").trim();
    if (!poNumber) return;
    const currency = String(row.getCell(5).value ?? "").trim() as Currency;
    rows.push({
      poNumber,
      supplier: String(row.getCell(2).value ?? "").trim(),
      description: String(row.getCell(3).value ?? "").trim(),
      invoiceAmount: roundMoney(Number(row.getCell(4).value)),
      currency,
      submissionDate: asDate(row.getCell(7).value),
    });
  });
  return rows;
}
