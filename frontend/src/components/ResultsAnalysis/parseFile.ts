import Papa from 'papaparse';
// xlsx (SheetJS) 0.20.3 من cdn.sheetjs.com، نسخة محفوظة في frontend/vendor/
// لأن npm متوقف عند 0.18.5. فيها إصلاح Prototype Pollution (CVE-2023-30533،
// 0.19.3) وReDoS (CVE-2024-22363، 0.20.2). npm audit لا يفحص حزمة من ملف
// محلي، فتابع https://cdn.sheetjs.com/advisories عند أي ترقية.
import * as XLSX from 'xlsx';
import type { RawSheet } from './types';

/** يقرأ CSV/XLSX بالكامل في المتصفح — لا رفع للملف الخام لأي Storage أو خادم.
 *  يُرجع كل الأوراق شبكاتٍ خاماً بلا افتراض لصف العناوين؛ buildFileModel في
 *  fileModel.ts يكتشفه ويحذف الأعمدة الحساسة، والشبكة الخام لا تُحفظ في الحالة. */
export async function parseFile(file: File): Promise<RawSheet[]> {
  if (/\.csv$/i.test(file.name)) return parseCsvText(await file.text(), file.name.replace(/\.csv$/i, ''));
  return parseXlsxBuffer(await file.arrayBuffer());
}

/** CSV = ورقة واحدة باسم الملف */
export function parseCsvText(text: string, name: string): RawSheet[] {
  const result = Papa.parse<string[]>(text, { header: false, skipEmptyLines: false });
  const grid = result.data.map(row => row.map(cell => String(cell ?? '')));
  return [{ name, firstRow: 1, grid }];
}

export function parseXlsxBuffer(buffer: ArrayBuffer | Uint8Array): RawSheet[] {
  const workbook = XLSX.read(buffer, { type: 'array' });
  return workbook.SheetNames.map(name => {
    const sheet = workbook.Sheets[name];
    const ref = sheet?.['!ref'];
    if (!sheet || !ref) return { name, firstRow: 1, grid: [] };
    // raw: الأرقام كما هي (24.5) لا بتنسيق الخلية؛ blankrows: تبقى الصفوف
    // الفارغة حتى يطابق موضع الصف في الشبكة رقمه في Excel
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: true, defval: '', raw: true });
    const grid = rows.map(row => row.map(cell => String(cell ?? '')));
    return { name, firstRow: XLSX.utils.decode_range(ref).s.r + 1, grid };
  });
}
