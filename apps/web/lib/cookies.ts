export function readCookie(name: string): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  const encodedValue = match?.[1];

  if (encodedValue === undefined) {
    return null;
  }

  return decodeURIComponent(encodedValue);
}
