// Supabase Edge Functions: مزوّد الذكاء الاصطناعي المشترك (Gemini)
//
// النقطة الوحيدة في كل الدوال (suggest-from-image، transcribe-voice، ...) التي
// تعرف تفاصيل مزوّد الذكاء الاصطناعي: شكل الطلب، الـ headers، وتفسير الرد.
// تغيير المزود مستقبلاً يعني تعديل هذا الملف فقط — الدوال المستدعية تتعامل
// فقط مع { text } كنص خام وتفسّره كل حسب حاجتها.
//
// متغيرات البيئة المطلوبة (تُضبط من Supabase Dashboard → Edge Functions → Secrets):
//   GEMINI_API_KEY   — مفتاح Gemini API
//   AI_MODEL_NAME    — اسم النموذج (مثال: gemini-2.0-flash)

export async function callAIProvider(
  mimeType: string,
  base64Data: string,
  promptText: string,
): Promise<{ text: string }> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  const modelName = Deno.env.get('AI_MODEL_NAME');
  if (!apiKey || !modelName) {
    throw new Error('AI provider is not configured (missing GEMINI_API_KEY or AI_MODEL_NAME).');
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: promptText },
            { inline_data: { mime_type: mimeType, data: base64Data } },
          ],
        }],
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`AI provider request failed (${res.status}): ${errText}`);
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || typeof text !== 'string') {
    throw new Error('AI provider returned no usable text.');
  }

  return { text: text.trim() };
}

// نفس النداء أعلاه لكن بعدة صور دفعة واحدة داخل content واحد (كل صورة inline_data
// مستقلة ضمن نفس مصفوفة parts) — الشكل المعتمد من Gemini لتصنيف دفعة صور بنداء
// واحد بدل نداء منفصل لكل صورة (مستخدمة في process-bulk-queue). الدالة أعلاه
// (صورة/صوت واحد) تبقى كما هي لبقية الدوال التي لا تحتاج دفعات.
export async function callAIProviderMultiImage(
  images: { mimeType: string; base64Data: string }[],
  promptText: string,
): Promise<{ text: string }> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  const modelName = Deno.env.get('AI_MODEL_NAME');
  if (!apiKey || !modelName) {
    throw new Error('AI provider is not configured (missing GEMINI_API_KEY or AI_MODEL_NAME).');
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: promptText },
            ...images.map(img => ({ inline_data: { mime_type: img.mimeType, data: img.base64Data } })),
          ],
        }],
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`AI provider request failed (${res.status}): ${errText}`);
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || typeof text !== 'string') {
    throw new Error('AI provider returned no usable text.');
  }

  return { text: text.trim() };
}

// نفس النداء أعلاه لكن بلا أي inline_data (لا صورة ولا صوت) — نص فقط. مستخدمة في
// generate-portfolio-summaries التي تلخّص شواهد نصية (عنوان/وصف) بدل تحليل ملف
// مرفق. بقية الدوال أعلاه (صورة/صوت واحد، أو عدة صور) تبقى كما هي لبقية الميزات.
export async function callAIProviderText(promptText: string): Promise<{ text: string }> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  const modelName = Deno.env.get('AI_MODEL_NAME');
  if (!apiKey || !modelName) {
    throw new Error('AI provider is not configured (missing GEMINI_API_KEY or AI_MODEL_NAME).');
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`AI provider request failed (${res.status}): ${errText}`);
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || typeof text !== 'string') {
    throw new Error('AI provider returned no usable text.');
  }

  return { text: text.trim() };
}
