const FOLDER = 'nota';
const SAFE_NOTE_FILE = /^nota-[a-z0-9_-]+\.(jpg|jpeg|png|webp|heic)$/i;

export function safeNoteFileName(uri?: string): string | null {
  if (!uri || typeof uri !== 'string') return null;
  const clean = uri.split('?')[0].split('#')[0];
  if (clean.includes('..') || clean.includes('\\')) return null;
  const parts = clean.split('/');
  if (parts.length < 2) return null;
  const folder = parts[parts.length - 2];
  const filename = parts[parts.length - 1];
  if (folder !== FOLDER) return null;
  return SAFE_NOTE_FILE.test(filename) ? filename : null;
}

