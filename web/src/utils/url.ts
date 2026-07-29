export function parseBooleanParam(value: string | null): boolean | undefined {
  if (value == null) return undefined;

  const normalized = value.trim().toLowerCase();

  if (['1', 'true', 't', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'f', 'no', 'n', 'off'].includes(normalized)) return false;

  return undefined;
}

