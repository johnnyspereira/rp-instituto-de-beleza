export function nextNumericClientReference(
  references: Array<string | null | undefined>
) {
  const highest = references.reduce((maximum, reference) => {
    const normalized = reference?.trim() ?? '';
    if (!/^\d+$/.test(normalized)) return maximum;
    const value = Number(normalized);
    return Number.isSafeInteger(value) ? Math.max(maximum, value) : maximum;
  }, 0);

  return String(highest + 1);
}
