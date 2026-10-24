import { supabase } from './supabase';
import { SIGNED_URL_SECONDS, newAvatarPath } from './avatarLogic';

// Profile picture storage. The photo lives in the private "avatars" bucket under "<user_id>/<file>",
// and profiles.avatar_path remembers which file is the current one. Row level security (RLS) lets each
// user touch only their own folder. These functions throw on failure; the store turns that into messages.

const BUCKET = 'avatars';

/** The saved photo path for this user, or null. Throws if the avatar_path column does not exist yet. */
export async function fetchAvatarPath(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('avatar_path')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  const path = (data as { avatar_path?: string | null } | null)?.avatar_path;
  return path ? path : null;
}

/** A link that shows the (private) photo for one hour. */
export async function signAvatarUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error('No signed URL returned');
  return data.signedUrl;
}

/** Uploads the already-shrunk JPEG under a brand new name and returns the path. */
export async function uploadAvatarObject(userId: string, blob: Blob, now = Date.now()): Promise<string> {
  const path = newAvatarPath(userId, now);
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

/** Points the profile at the new photo (or at none). */
export async function saveAvatarPath(userId: string, path: string | null): Promise<void> {
  const { error } = await supabase.from('profiles').upsert({ id: userId, avatar_path: path }, { onConflict: 'id' });
  if (error) throw error;
}

/** Deletes a photo file. Never throws: a leftover file is harmless and must not break the screen. */
export async function removeAvatarObject(path: string): Promise<void> {
  try {
    await supabase.storage.from(BUCKET).remove([path]);
  } catch {
    // ignore
  }
}
