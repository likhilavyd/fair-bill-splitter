const httpError = require('./httpError');

const MAX_AMOUNT_PAISE = 10000000000; // Rs 10 crore, a sanity limit

const isPaise = (n) => Number.isInteger(n) && n >= 0;

// Equal split: the leftover paise go one each to the first people in event order,
// so the result is always the same and always adds up exactly
const splitEqual = (totalPaise, ids) => {
  const base = Math.floor(totalPaise / ids.length);
  const remainder = totalPaise % ids.length;
  const shares = {};
  ids.forEach((id, index) => {
    shares[id] = base + (index < remainder ? 1 : 0);
  });
  return shares;
};

// Custom split: the client sends paise per person, and they must add up exactly
const splitCustom = (totalPaise, ids, input) => {
  const shares = {};
  let sum = 0;
  for (const id of ids) {
    const value = input ? input[id] : undefined;
    if (!isPaise(value)) {
      throw httpError(400, 'Every selected person needs a share in whole paise');
    }
    shares[id] = value;
    sum += value;
  }
  if (sum !== totalPaise) {
    throw httpError(400, 'Custom shares add up to ' + sum + ' paise but the expense is ' + totalPaise + ' paise');
  }
  return shares;
};

// Percentage split: uses the "largest remainder" method so nothing is lost to rounding
const splitPercentage = (totalPaise, ids, input) => {
  const basisPoints = {};
  let bpSum = 0;
  for (const id of ids) {
    const percent = Number(input ? input[id] : NaN);
    if (!Number.isFinite(percent) || percent < 0) {
      throw httpError(400, 'Every selected person needs a valid percentage');
    }
    basisPoints[id] = Math.round(percent * 100); // 2 decimal places
    bpSum += basisPoints[id];
  }
  if (bpSum !== 10000) {
    throw httpError(400, 'Percentages must add up to exactly 100');
  }

  const shares = {};
  const rows = [];
  let allocated = 0;
  ids.forEach((id, index) => {
    const product = totalPaise * basisPoints[id];
    const whole = Math.floor(product / 10000);
    shares[id] = whole;
    allocated += whole;
    rows.push({ id, index, remainder: product % 10000 });
  });

  // Biggest leftover gets the extra paisa first; ties go to event order
  rows.sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const left = totalPaise - allocated;
  for (let i = 0; i < left; i++) {
    shares[rows[i].id] += 1;
  }
  return shares;
};

// orderedConsumerIds must already be in event participant order
const calculateShares = ({ method, totalPaise, orderedConsumerIds, splitInput }) => {
  if (!orderedConsumerIds.length) {
    throw httpError(400, 'Select at least one person who shared this expense');
  }
  switch (method) {
    case 'equal':
      return splitEqual(totalPaise, orderedConsumerIds);
    case 'custom':
      return splitCustom(totalPaise, orderedConsumerIds, splitInput);
    case 'percentage':
      return splitPercentage(totalPaise, orderedConsumerIds, splitInput);
    default:
      throw httpError(400, 'Split method "' + method + '" is not supported yet. Use equal, custom or percentage.');
  }
};

// Accepts either payers: [{ participant, amountPaise }] or a single paidBy
const resolvePayers = (totalPaise, participantIdSet, { payers, paidBy }) => {
  let list;
  if (Array.isArray(payers) && payers.length) {
    list = payers.map((p) => ({ participant: String(p.participant), amountPaise: p.amountPaise }));
  } else if (paidBy) {
    list = [{ participant: String(paidBy), amountPaise: totalPaise }];
  } else {
    throw httpError(400, 'Please select who paid for this expense');
  }

  const seen = new Set();
  let sum = 0;
  for (const payer of list) {
    if (!participantIdSet.has(payer.participant)) {
      throw httpError(400, 'A payer is not a participant of this event');
    }
    if (seen.has(payer.participant)) {
      throw httpError(400, 'The same payer is listed twice');
    }
    seen.add(payer.participant);
    if (!Number.isInteger(payer.amountPaise) || payer.amountPaise <= 0) {
      throw httpError(400, 'Each payer amount must be a whole number of paise above zero');
    }
    sum += payer.amountPaise;
  }
  if (sum !== totalPaise) {
    throw httpError(400, 'Payer amounts add up to ' + sum + ' paise but the expense is ' + totalPaise + ' paise');
  }
  return list;
};

module.exports = { MAX_AMOUNT_PAISE, calculateShares, resolvePayers };