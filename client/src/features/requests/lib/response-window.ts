/** The response window on the RFI/RFA form is optional; when given it must be 1 to 60 whole days. */
export const RESPONSE_WINDOW_MIN = 1;
export const RESPONSE_WINDOW_MAX = 60;

export function responseWindowProblem(value: string): string | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < RESPONSE_WINDOW_MIN || n > RESPONSE_WINDOW_MAX) {
    return `Response window must be a whole number of days from ${RESPONSE_WINDOW_MIN} to ${RESPONSE_WINDOW_MAX}.`;
  }
  return null;
}
