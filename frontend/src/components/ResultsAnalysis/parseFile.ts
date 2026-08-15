import Papa from 'papaparse';
// ⚠️ حزمة xlsx (SheetJS) على npm تحمل ثغرتين معلَنتين بلا إصلاح متاح حتى الآن:
// Prototype Pollution (GHSA-4r6h-8v6p-xvw6) وReDoS (GHSA-5pgg-2g8v-p4x9) —
// راجع `npm audit`. المخاطرة هنا محدودة عملياً: الملف الذي تُشغَّل الحزمة عليه
// هو دائماً الملف الذي يرفعه المعلم بنفسه من متصفحه (لا معالجة لملفات من مستخدمين
// آخرين أو من الخادم)، وكل التنفيذ محلي في جلسته فقط. قرار مقصود بقبول هذه
// المخاطرة المحدودة بدل تعطيل دعم XLSX بالكامل — أعد تقييمه إن ظهر إصلاح رسمي.
import * as XLSX from 'xlsx';
import type { ParsedFile } from './types';

/** يقرأ CSV/XLSX بالكامل في المتصفح — لا رفع للملف الخام لأي Storage أو خادم. */
export async function parseFile(file: File): Promise<ParsedFile> {
  const isCsv = /\.csv$/i.test(file.name);
  if (isCsv) return parseCsv(file);
  return parseXlsx(file);
}

function parseCsv(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      encoding: 'UTF-8',
      complete: (result) => {
        const headers = (result.meta.fields ?? []).map(h => h.trim());
        resolve({ headers, rows: result.data });
      },
      error: (err: Error) => reject(err),
    });
  });
}

async function parseXlsx(file: File): Promise<ParsedFile> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const headers = rows.length > 0 ? Object.keys(rows[0]).map(h => h.trim()) : [];
  const stringRows = rows.map(row => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) out[k.trim()] = String(v ?? '');
    return out;
  });
  return { headers, rows: stringRows };
}
