import { supabase } from "@/integrations/supabase/client";

const STORAGE_URL_PATTERNS = [
  "/storage/v1/object/public/",
  "/storage/v1/object/sign/",
  "/storage/v1/object/authenticated/",
];

export function extractStoragePathFromUrl(assetUrl: string, bucket: string): string | null {
  if (!assetUrl) return null;

  try {
    const parsed = new URL(assetUrl);
    for (const pattern of STORAGE_URL_PATTERNS) {
      const prefix = `${pattern}${bucket}/`;
      const idx = parsed.pathname.indexOf(prefix);
      if (idx !== -1) {
        return decodeURIComponent(parsed.pathname.slice(idx + prefix.length));
      }
    }
    return null;
  } catch {
    return assetUrl.startsWith("http") ? null : assetUrl.replace(/^\/+/, "");
  }
}

export async function resolveStorageUrl(
  bucket: string,
  assetUrl: string | null | undefined,
  expiresIn = 3600,
): Promise<string | null> {
  if (!assetUrl) return null;

  const objectPath = extractStoragePathFromUrl(assetUrl, bucket);
  if (!objectPath) return assetUrl;

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(objectPath, expiresIn);
  if (error || !data?.signedUrl) {
    console.warn(`Failed to create signed URL for ${bucket}/${objectPath}:`, error);
    return assetUrl;
  }

  return data.signedUrl;
}
