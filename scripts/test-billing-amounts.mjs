import assert from "node:assert/strict";
import { billingAmounts, billingAmountLines } from "../src/lib/academy/billing-amounts.ts";

assert.deepEqual(billingAmounts({amount:25000,referralDiscount:5000}),{
  grossAmount:25000,referralDiscount:5000,netAmount:20000,
});
assert.deepEqual(billingAmountLines({amount:25000,referralDiscount:5000,currency:"NGN"},"invoice"),[
  "Original fee: NGN 25000.00","Referral discount: NGN 5000.00","Amount due: NGN 20000.00",
]);
assert.equal(billingAmountLines({amount:25000,referralDiscount:5000,currency:"NGN"},"receipt")[2],"Amount paid: NGN 20000.00");
assert.equal(billingAmounts({amount:19.99,referralDiscount:0.1}).netAmount,19.89);
assert.equal(billingAmounts({amount:25}).netAmount,25);
assert.equal(billingAmounts({amount:25,referralDiscount:25}).netAmount,0);
for(const record of [
  {amount:NaN},{amount:null},{amount:""},{amount:-1},
  {amount:10,referralDiscount:11},{amount:10,referralDiscount:-1},
  {amount:10,referralDiscount:"bad"},
]) assert.throws(()=>billingAmounts(record),/invalid amounts/);
console.log("Billing amounts, invoice/receipt labels, legacy records, rounding and invalid-record checks passed.");
