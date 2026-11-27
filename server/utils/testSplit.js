const assert = require('assert');
const { calculateShares, resolvePayers } = require('./splitCalculator');

const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
const ids = ['a', 'b', 'c'];

// Equal: 10000 / 3
let shares = calculateShares({ method: 'equal', totalPaise: 10000, orderedConsumerIds: ids });
assert.deepStrictEqual(shares, { a: 3334, b: 3333, c: 3333 });
console.log('PASS: equal split of 10000 paise by 3 -> 3334 / 3333 / 3333');

// Equal: 1 paisa among 3 people
shares = calculateShares({ method: 'equal', totalPaise: 1, orderedConsumerIds: ids });
assert.deepStrictEqual(shares, { a: 1, b: 0, c: 0 });
console.log('PASS: 1 paisa is never lost or duplicated');

// Custom: correct and wrong totals
shares = calculateShares({
  method: 'custom', totalPaise: 30000, orderedConsumerIds: ['a', 'b'], splitInput: { a: 10000, b: 20000 },
});
assert.strictEqual(sum(shares), 30000);
assert.throws(() =>
  calculateShares({ method: 'custom', totalPaise: 30000, orderedConsumerIds: ['a', 'b'], splitInput: { a: 10000, b: 10000 } })
);
console.log('PASS: custom split accepted when exact, rejected when not');

// Percentage: 50 / 30 / 20 of 10001 paise
shares = calculateShares({
  method: 'percentage', totalPaise: 10001, orderedConsumerIds: ids, splitInput: { a: 50, b: 30, c: 20 },
});
assert.strictEqual(sum(shares), 10001);
console.log('PASS: percentage split adds up -> ' + JSON.stringify(shares));

// Percentage that does not reach 100
assert.throws(() =>
  calculateShares({ method: 'percentage', totalPaise: 10000, orderedConsumerIds: ids, splitInput: { a: 40, b: 30, c: 20 } })
);
console.log('PASS: percentages not adding to 100 are rejected');

// Multiple payers
const idSet = new Set(ids);
const payers = resolvePayers(10000, idSet, {
  payers: [{ participant: 'a', amountPaise: 6000 }, { participant: 'b', amountPaise: 4000 }],
});
assert.strictEqual(payers.length, 2);
assert.throws(() =>
  resolvePayers(10000, idSet, { payers: [{ participant: 'a', amountPaise: 6000 }, { participant: 'b', amountPaise: 3000 }] })
);
console.log('PASS: multiple payers must add up to the total');

console.log('\nAll split calculator tests passed.');