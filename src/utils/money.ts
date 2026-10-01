/** Calculate in hundredths of a tenge so additions do not accumulate float errors. */
export const toMinorUnits = (amount: number): number =>
  Math.round(amount * 100);
export const fromMinorUnits = (amount: number): number => amount / 100;

export function formatMoney(amount: number): string {
  const absolute = Math.abs(amount);
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: Number.isInteger(toMinorUnits(absolute) / 100)
      ? 0
      : 2,
    maximumFractionDigits: 2,
  }).format(absolute);
  return `${amount < 0 ? "−" : ""}₸${formatted}`;
}
