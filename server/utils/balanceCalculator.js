// Net balance = total paid - total expense share (all in paise)
// Positive = should receive money, negative = owes money
const calculateBalances = (participants, expenses) => {
  const rows = new Map();
  participants.forEach((p) => {
    rows.set(String(p._id), {
      participantId: String(p._id),
      name: p.name,
      paidPaise: 0,
      sharePaise: 0,
      balancePaise: 0,
    });
  });

  let totalExpensePaise = 0;

  expenses.forEach((expense) => {
    totalExpensePaise += expense.amountPaise;
    expense.payers.forEach((payer) => {
      const row = rows.get(String(payer.participant));
      if (row) row.paidPaise += payer.amountPaise;
    });
    expense.splits.forEach((split) => {
      const row = rows.get(String(split.participant));
      if (row) row.sharePaise += split.sharePaise;
    });
  });

  const balances = Array.from(rows.values());
  balances.forEach((row) => {
    row.balancePaise = row.paidPaise - row.sharePaise;
  });

  return { balances, totalExpensePaise };
};

module.exports = { calculateBalances };