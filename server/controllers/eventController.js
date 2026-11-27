
const Event = require('../models/Event');
const Expense = require('../models/Expense');
const Settlement = require('../models/Settlement');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const { getAccessibleEvent } = require('../utils/eventAccess');
const { calculateBalances } = require('../utils/balanceCalculator');

// Calculate balances after applying all confirmed payments
const calculateEventBalances = async (event, expenses) => {
  const result = calculateBalances(event.participants, expenses);

  const confirmedSettlements = await Settlement.find({
    event: event._id,
    confirmation: 'confirmed',
  });

  confirmedSettlements.forEach((settlement) => {
    const payer = result.balances.find(
      (b) => b.participantId === String(settlement.fromParticipant)
    );

    const receiver = result.balances.find(
      (b) => b.participantId === String(settlement.toParticipant)
    );

    if (payer && receiver) {
      payer.balancePaise += settlement.amountPaise;
      receiver.balancePaise -= settlement.amountPaise;
    }
  });

  return result;
};

// POST /api/events
const createEvent = asyncHandler(async (req, res) => {
  const { name, description, date, currency, category, participants } = req.body;

  if (!name || !String(name).trim()) {
    throw httpError(400, 'Event name is required');
  }

  const cleaned = (Array.isArray(participants) ? participants : [])
    .map((p) => ({
      name: String((p && p.name) || '').trim(),
      email: String((p && p.email) || '').trim().toLowerCase(),
    }))
    .filter((p) => p.name);

  const seenNames = new Set();

  for (const p of cleaned) {
    const key = p.name.toLowerCase();

    if (seenNames.has(key)) {
      throw httpError(400, 'Duplicate participant name: ' + p.name);
    }

    seenNames.add(key);
  }

  const creatorIndex = cleaned.findIndex(
    (p) =>
      (p.email && p.email === req.user.email) ||
      p.name.toLowerCase() === req.user.name.toLowerCase()
  );

  const creatorEntry =
    creatorIndex >= 0
      ? cleaned.splice(creatorIndex, 1)[0]
      : { name: req.user.name };

  const emails = cleaned.map((p) => p.email).filter(Boolean);

  const users = emails.length
    ? await User.find({ email: { $in: emails } }).select('_id email')
    : [];

  const userByEmail = new Map(users.map((u) => [u.email, u._id]));

  const participantList = [
    {
      name: creatorEntry.name,
      email: req.user.email,
      user: req.user._id,
    },
    ...cleaned.map((p) => ({
      name: p.name,
      email: p.email,
      user: userByEmail.get(p.email) || null,
    })),
  ];

  const event = await Event.create({
    name,
    description,
    date,
    currency,
    category,
    creator: req.user._id,
    participants: participantList,
  });

  res.status(201).json({ event });
});

// GET /api/events
const listEvents = asyncHandler(async (req, res) => {
  const events = await Event.find({
    $or: [
      { creator: req.user._id },
      { 'participants.user': req.user._id },
    ],
  }).sort({ date: -1, createdAt: -1 });

  const totals = await Expense.aggregate([
    { $match: { event: { $in: events.map((e) => e._id) } } },
    {
      $group: {
        _id: '$event',
        totalPaise: { $sum: '$amountPaise' },
        count: { $sum: 1 },
      },
    },
  ]);

  const totalByEvent = new Map(totals.map((t) => [String(t._id), t]));

  res.json({
    events: events.map((event) => {
      const t = totalByEvent.get(String(event._id));

      return {
        ...event.toJSON(),
        totalExpensePaise: t ? t.totalPaise : 0,
        expenseCount: t ? t.count : 0,
      };
    }),
  });
});

// GET /api/events/:eventId
const getEvent = asyncHandler(async (req, res) => {
  const { event } = await getAccessibleEvent(req.params.eventId, req.user);

  const expenses = await Expense.find({ event: event._id }).sort({
    expenseDate: -1,
    createdAt: -1,
  });

  const { balances, totalExpensePaise } =
    await calculateEventBalances(event, expenses);

  res.json({ event, expenses, balances, totalExpensePaise });
});

// PUT /api/events/:eventId (creator only)
const updateEvent = asyncHandler(async (req, res) => {
  const { event, isCreator } = await getAccessibleEvent(
    req.params.eventId,
    req.user
  );

  if (!isCreator) {
    throw httpError(403, 'Only the event creator can edit this event');
  }

  ['name', 'description', 'date', 'currency', 'category', 'status'].forEach(
    (field) => {
      if (req.body[field] !== undefined) {
        event[field] = req.body[field];
      }
    }
  );

  await event.save();

  res.json({ event });
});

// DELETE /api/events/:eventId (creator only)
const deleteEvent = asyncHandler(async (req, res) => {
  const { event, isCreator } = await getAccessibleEvent(
    req.params.eventId,
    req.user
  );

  if (!isCreator) {
    throw httpError(403, 'Only the event creator can delete this event');
  }

  await Settlement.deleteMany({ event: event._id });
  await Expense.deleteMany({ event: event._id });
  await event.deleteOne();

  res.json({ message: 'Event deleted' });
});

// GET /api/events/:eventId/balances
const getBalances = asyncHandler(async (req, res) => {
  const { event } = await getAccessibleEvent(req.params.eventId, req.user);

  const expenses = await Expense.find({ event: event._id });

  const result = await calculateEventBalances(event, expenses);

  res.json(result);
});

module.exports = {
  createEvent,
  listEvents,
  getEvent,
  updateEvent,
  deleteEvent,
  getBalances,
};