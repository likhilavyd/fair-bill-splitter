
const Settlement = require('../models/Settlement');
const Expense = require('../models/Expense');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const { getAccessibleEvent } = require('../utils/eventAccess');
const { calculateBalances } = require('../utils/balanceCalculator');

// GET /api/events/:eventId/settlements
const listSettlements = asyncHandler(async (req, res) => {
  const { event } = await getAccessibleEvent(req.params.eventId, req.user);

  const settlements = await Settlement.find({ event: event._id })
    .populate('recordedBy', 'name email')
    .populate('confirmedBy', 'name email')
    .sort({ createdAt: -1 });

  res.json({ settlements });
});

// POST /api/events/:eventId/settlements
const createSettlement = asyncHandler(async (req, res) => {
  const { event } = await getAccessibleEvent(req.params.eventId, req.user);

  const {
    fromParticipant,
    toParticipant,
    amountPaise,
    method,
    reference,
    note,
    paymentDate,
  } = req.body;

  if (!fromParticipant || !toParticipant) {
    throw httpError(400, 'Payer and receiver are required');
  }

  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    throw httpError(400, 'Amount must be a positive whole number of paise');
  }

  if (String(fromParticipant) === String(toParticipant)) {
    throw httpError(400, 'Payer and receiver must be different');
  }

  const payer = event.participants.find(
    (p) => String(p._id) === String(fromParticipant)
  );

  const receiver = event.participants.find(
    (p) => String(p._id) === String(toParticipant)
  );

  if (!payer || !receiver) {
    throw httpError(400, 'Both participants must belong to this event');
  }

  // Start with balances calculated from expenses.
  const expenses = await Expense.find({ event: event._id });
  const { balances } = calculateBalances(event.participants, expenses);

  // Both confirmed and pending payments reserve the outstanding amount.
  // Rejected payments are excluded.
  const existingSettlements = await Settlement.find({
    event: event._id,
    confirmation: { $in: ['confirmed', 'pending_confirmation'] },
  });

  existingSettlements.forEach((settlement) => {
    const from = balances.find(
      (b) => b.participantId === String(settlement.fromParticipant)
    );

    const to = balances.find(
      (b) => b.participantId === String(settlement.toParticipant)
    );

    if (from) from.balancePaise += settlement.amountPaise;
    if (to) to.balancePaise -= settlement.amountPaise;
  });

  const payerBalance = balances.find(
    (b) => b.participantId === String(fromParticipant)
  );

  const receiverBalance = balances.find(
    (b) => b.participantId === String(toParticipant)
  );

  if (
    !payerBalance ||
    !receiverBalance ||
    payerBalance.balancePaise >= 0 ||
    receiverBalance.balancePaise <= 0
  ) {
    throw httpError(
      400,
      'This payment does not match the current outstanding balances'
    );
  }

  if (
    amountPaise > -payerBalance.balancePaise ||
    amountPaise > receiverBalance.balancePaise
  ) {
    throw httpError(400, 'Payment exceeds the outstanding amount');
  }

  const settlement = await Settlement.create({
    event: event._id,
    fromParticipant,
    toParticipant,
    amountPaise,
    method,
    reference,
    note,
    paymentDate,
    recordedBy: req.user._id,
    confirmation: 'pending_confirmation',
  });

  res.status(201).json({
    message: 'Payment recorded and awaiting receiver confirmation',
    settlement,
  });
});

// PATCH /api/events/:eventId/settlements/:settlementId/confirm
const confirmSettlement = asyncHandler(async (req, res) => {
  const { event } = await getAccessibleEvent(req.params.eventId, req.user);

  const settlement = await Settlement.findOne({
    _id: req.params.settlementId,
    event: event._id,
  });

  if (!settlement) {
    throw httpError(404, 'Settlement not found');
  }

  const receiver = event.participants.find(
    (p) => String(p._id) === String(settlement.toParticipant)
  );

  if (
    !receiver ||
    !receiver.user ||
    String(receiver.user) !== String(req.user._id)
  ) {
    throw httpError(403, 'Only the registered receiver can confirm this payment');
  }

  if (settlement.confirmation !== 'pending_confirmation') {
    throw httpError(400, 'This payment has already been processed');
  }

  const action = req.body.action;

  if (!['confirmed', 'rejected'].includes(action)) {
    throw httpError(400, 'Action must be confirmed or rejected');
  }

  settlement.confirmation = action;
  settlement.confirmedBy = req.user._id;
  settlement.confirmedAt = new Date();

  await settlement.save();

  res.json({
    message: action === 'confirmed'
      ? 'Payment confirmed successfully'
      : 'Payment rejected',
    settlement,
  });
});

module.exports = {
  listSettlements,
  createSettlement,
  confirmSettlement,
};