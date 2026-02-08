export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function asNumber(value: bigint | number): number {
  return typeof value === 'bigint' ? Number(value) : value;
}
