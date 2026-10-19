export function nowISO() {
  return new Date().toISOString();
}

export function toDate(str: string): Date {
  return new Date(str);
}
