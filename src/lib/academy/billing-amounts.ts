type BillingRecord = { amount: unknown; referralDiscount?: unknown };

export function billingAmounts(record: BillingRecord) {
  const gross = Number(record.amount);
  const discount = Number(record.referralDiscount ?? 0);
  if (
    record.amount == null || record.amount === "" ||
    !Number.isFinite(gross) || !Number.isFinite(discount) ||
    gross < 0 || discount < 0 || discount > gross
  ) {
    throw new Error("This billing record has invalid amounts.");
  }
  const cents = (value: number) => Math.round((value + Number.EPSILON) * 100);
  const grossAmount = cents(gross) / 100;
  const referralDiscount = cents(discount) / 100;
  const netAmount = (cents(gross) - cents(discount)) / 100;
  return { grossAmount, referralDiscount, netAmount };
}

export function billingAmountLines(
  record: BillingRecord & { currency: string },
  kind: "invoice" | "receipt",
) {
  const amounts = billingAmounts(record);
  const money = (value: number) => `${record.currency} ${value.toFixed(2)}`;
  return [
    `Original fee: ${money(amounts.grossAmount)}`,
    `Referral discount: ${money(amounts.referralDiscount)}`,
    `${kind === "receipt" ? "Amount paid" : "Amount due"}: ${money(amounts.netAmount)}`,
  ];
}
