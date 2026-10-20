import { supabase } from './supabaseClient';

// الصورة الشخصية: كل رفع يمر من هنا. المسار ثابت {uid}/avatar.jpg ويُستبدل
// بـ upsert، فالصورة السابقة للمستخدم نفسه تُحذف ضمناً. profile.avatar يحمل
// الرابط العام وحده، ولا يُحفظ فيه نص data: من أي مسار.
const AVATAR_BUCKET = 'avatars';
const MAX_SIDE = 512;
const QUALITY = 0.85;
const FALLBACK_QUALITY = 0.7;
const TARGET_BYTES = 100 * 1024;

export const isDataUrl = (s: string | null | undefined): boolean =>
  typeof s === 'string' && s.startsWith('data:');

const loadImage = (blob: Blob): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const src = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(src); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(src); reject(new Error('avatar_decode_failed')); };
    img.src = src;
  });

const canvasToJpeg = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('avatar_encode_failed'))), 'image/jpeg', quality);
  });

/**
 * يصغّر الصورة إلى 512px كحد أقصى للضلع الأطول، ويحوّلها JPEG (0.85، ثم 0.7
 * مرة واحدة إن تجاوزت 100KB)، ويرفعها إلى avatars/{userId}/avatar.jpg.
 * background: خلفية تُرسم قبل الصورة (التدرّج بعد تفريغ الخلفية).
 * يرجع الرابط العام مع ?v= لكسر الكاش، ويرمي خطأً عند أي فشل.
 */
export async function uploadAvatar(
  userId: string,
  source: Blob,
  opts?: { background?: (ctx: CanvasRenderingContext2D, w: number, h: number) => CanvasGradient | string },
): Promise<string> {
  if (!supabase) throw new Error('avatar_no_storage');

  const img = await loadImage(source);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('avatar_canvas_unavailable');
  if (opts?.background) {
    ctx.fillStyle = opts.background(ctx, canvas.width, canvas.height);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  let blob = await canvasToJpeg(canvas, QUALITY);
  if (blob.size > TARGET_BYTES) blob = await canvasToJpeg(canvas, FALLBACK_QUALITY);

  const filePath = `${userId}/avatar.jpg`;
  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(filePath, blob, { cacheControl: '3600', upsert: true, contentType: 'image/jpeg' });
  if (error) throw error;
  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(filePath);
  // كسر الكاش: نفس المسار يُستبدل بـ upsert فيبقى الرابط ثابتاً بدون هذا
  return `${data.publicUrl}?v=${Date.now()}`;
}
