
const express = require('express');
const { protect } = require('../middleware/auth');

const {
  createEvent,
  listEvents,
  getEvent,
  updateEvent,
  deleteEvent,
  getBalances,
} = require('../controllers/eventController');

const {
  addExpense,
  listExpenses,
  updateExpense,
  deleteExpense,
} = require('../controllers/expenseController');

const {
  listSettlements,
  createSettlement,
  confirmSettlement,
} = require('../controllers/settlementController');

const router = express.Router();

// Every event route requires a logged-in user
router.use(protect);

router.route('/')
  .get(listEvents)
  .post(createEvent);

router.route('/:eventId')
  .get(getEvent)
  .put(updateEvent)
  .delete(deleteEvent);

router.get('/:eventId/balances', getBalances);

router.route('/:eventId/expenses')
  .get(listExpenses)
  .post(addExpense);

router.route('/:eventId/expenses/:expenseId')
  .put(updateExpense)
  .delete(deleteExpense);

// Settlement routes
router.route('/:eventId/settlements')
  .get(listSettlements)
  .post(createSettlement);

router.patch(
  '/:eventId/settlements/:settlementId/confirm',
  confirmSettlement
);

module.exports = router;
