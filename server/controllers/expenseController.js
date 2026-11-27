const Expense = require('../models/Expense');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const { getAccessibleEvent } = require('../utils/eventAccess');
const { MAX_AMOUNT_PAISE, calculateShares, resolvePayers } = require('../utils/splitCalculator');

// Validates the request and works out every person's share on the server
const buildExpenseData = (event, body) => {
  const title = String(body.title || '').trim();
  if (!title) throw httpError(400, 'Expense name is required');

  const totalPaise = body.amountPaise;
  if (!Number.isInteger(totalPaise) || totalPaise < 1 || totalPaise > MAX_AMOUNT_PAISE) {
    throw httpError(400, 'amountPaise must be a whole number between 1 and ' + MAX_AMOUNT_PAISE);
  }

  const eventIds = event.participants.map((p) => String(p._id));
  const idSet = new Set(eventIds);

  const requested = Array.isArray(body.consumers) ? body.consumers.map(String) : [];
  if (!requested.length) throw httpError(400, 'Select at least one person who shared this expense');
  if (new Set(requested).size !== requested.length) throw httpError(400, 'A person is selected twice');
  if (requested.some((id) => !idSet.has(id))) throw httpError(400, 'A selected person is not in this event');

  // Event order makes the rounding deterministic whatever order the client sends
  const orderedConsumerIds = eventIds.filter((id) => requested.includes(id));

  const method = body.splitMethod || 'equal';
  const shares = calculateShares({
    method,
    totalPaise,
    orderedConsumerIds,
    splitInput: body.splitInput,
  });

  const payers = resolvePayers(totalPaise, idSet, { payers: body.payers, paidBy: body.paidBy });

  const data = {
    title,
    amountPaise: totalPaise,
    expenseType: ['item', 'general'].includes(body.expenseType) ? body.expenseType : 'item',
    category: body.category || 'general',
    splitMethod: method,
    payers,
    splits: orderedConsumerIds.map((id) => ({ participant: id, sharePaise: shares[id] })),
    notes: body.notes || '',
  };
  if (body.expenseDate) data.expenseDate = body.expenseDate;

  return data;
};

// POST /api/events/:eventId/expenses
const addExpense = asyncHandler(async (req, res) => {
  const { event } = await getAccessibleEvent(req.params.eventId, req.user);
  const data = buildExpenseData(event, req.body);

  const expense = await Expense.create({ ...data, event: event._id, createdBy: req.user._id });
  res.status(201).json({ expense });
});

// GET /api/events/:eventId/expenses
const listExpenses = asyncHandler(async (req, res) => {
  const { event } = await getAccessibleEvent(req.params.eventId, req.user);
  const expenses = await Expense.find({ event: event._id }).sort({ expenseDate: -1, createdAt: -1 });
  res.json({ expenses });
});

// Finds an expense and checks that this user may change it
const loadEditableExpense = async (req) => {
  const { event, isCreator } = await getAccessibleEvent(req.params.eventId, req.user);
  const expense = await Expense.findOne({ _id: req.params.expenseId, event: event._id });
  if (!expense) throw httpError(404, 'Expense not found');

  const isExpenseCreator = String(expense.createdBy) === String(req.user._id);
  if (!isCreator && !isExpenseCreator) {
    throw httpError(403, 'Only the event creator or the person who added this expense can change it');
  }
  return { event, expense };
};

// PUT /api/events/:eventId/expenses/:expenseId
const updateExpense = asyncHandler(async (req, res) => {
  const { event, expense } = await loadEditableExpense(req);
  expense.set(buildExpenseData(event, req.body));
  await expense.save();
  res.json({ expense });
});

// DELETE /api/events/:eventId/expenses/:expenseId
const deleteExpense = asyncHandler(async (req, res) => {
  const { expense } = await loadEditableExpense(req);
  await expense.deleteOne();
  res.json({ message: 'Expense deleted' });
});

module.exports = { addExpense, listExpenses, updateExpense, deleteExpense };