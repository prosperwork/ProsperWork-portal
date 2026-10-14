import{z}from"zod";
// Membership and enabled state are enforced against the central DB catalog.
export const currencyCode=z.string().regex(/^[A-Z]{3}$/,"Use a configured three-letter currency code.");
export const currencySetting=z.object({code:currencyCode,name:z.string().trim().min(2).max(80),symbol:z.string().trim().min(1).max(12),enabled:z.boolean(),notes:z.string().trim().min(5).max(2000)}).strict();
export type CurrencyRow={code:string;name:string;symbol:string;enabled:boolean};
