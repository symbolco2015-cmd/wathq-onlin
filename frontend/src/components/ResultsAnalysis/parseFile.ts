import Papa from 'papaparse';
// ⚠️ حزمة xlsx (SheetJS) على npm تحمل ثغرتين معلَنتين بلا إصلاح متاح حتى الآن:
// Prototype Pollution (GHSA-4r6h-8v6p-xvw6) وReDoS (GHSA-5pgg-2g8v-p4x9) —
// راجع `npm audit`. المخاطرة هنا محدودة عملياً: الملف الذي تُشغَّل الحزمة عليه
// هو دائماً الملف الذي يرفعه المعلم بنفسه من متصفحه (لا معالجة لملفات من مستخدمين
// آخرين أو من الخادم)، وكل التنفيذ محلي في جلسته فقط. قرار مقصود بقبول هذه
// المخاطرة المحدودة بدل تعطيل دعم XLSX بالكامل — أعد تقييمه إن ظهر إصلاح رسمي.
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
