import assert from "node:assert/strict";
import { buildWalletChronologicalSettlement } from "../src/lib/finance-wallet-settlement.js";

function debit(id, amount, appointmentDate) {
  return { id, amount, appointmentDate, paymentStatus: "pending" };
}

function credit(id, amount, receivedDate) {
  return { id, amount, receivedDate };
}

const cleberDebits = [
  ...["2026-05-06", "2026-05-13", "2026-05-20", "2026-05-27", "2026-06-03", "2026-06-10", "2026-06-17", "2026-06-24"]
    .map((date, index) => debit(`weekly-${index}`, 106.25, date)),
  ...["2026-07-01", "2026-07-08", "2026-07-15", "2026-07-22", "2026-07-29"]
    .map((date, index) => debit(`july-${index}`, 85, date)),
];
const cleberResult = buildWalletChronologicalSettlement({
  debitRows: cleberDebits,
  creditRows: [
    credit("manual-reversal", 85, "2026-07-20"),
    credit("bank-payment", 425, "2026-07-20"),
  ],
});

assert.equal(cleberResult.creditTotal, 510);
assert.equal(cleberResult.settledDebitTotal, 425);
assert.equal(cleberResult.openDebitTotal, 850);
assert.equal(cleberResult.availableBalance, 85);
assert.equal(cleberResult.paidDebitCount, 4);
assert.equal(cleberResult.pendingDebitCount, 9);
assert.deepEqual(cleberResult.debitRows.slice(0, 4).map((row) => row.paymentStatus), Array(4).fill("paid"));
assert.deepEqual(cleberResult.debitRows.slice(4).map((row) => row.paymentStatus), Array(9).fill("pending"));

const partialResult = buildWalletChronologicalSettlement({
  debitRows: [debit("oldest", 125, "2026-05-12"), debit("newest", 125, "2026-05-13")],
  creditRows: [credit("payment", 135, "2026-05-18")],
});
assert.equal(partialResult.paidDebitCount, 1);
assert.equal(partialResult.pendingDebitCount, 1);
assert.equal(partialResult.availableBalance, 10);

const fifoResult = buildWalletChronologicalSettlement({
  debitRows: [debit("oldest", 125, "2026-05-12"), debit("newest-smaller", 10, "2026-05-13")],
  creditRows: [credit("payment", 10, "2026-05-18")],
});
assert.equal(fifoResult.paidDebitCount, 0);
assert.equal(fifoResult.pendingDebitCount, 2);
assert.equal(fifoResult.availableBalance, 10);

console.log("Finance wallet chronological settlement tests passed.");
