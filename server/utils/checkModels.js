require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Event = require('../models/Event');
const Expense = require('../models/Expense');
const Settlement = require('../models/Settlement');
const Notification = require('../models/Notification');

const run = async () => {
  await connectDB();

  for (const Model of [User, Event, Expense, Settlement, Notification]) {
    await Model.syncIndexes();
    console.log('Collection and indexes ready: ' + Model.modelName);
  }

  const id = () => new mongoose.Types.ObjectId();
  const a = id();
  const b = id();
  const base = { event: id(), title: 'Dinner', category: 'food', amountPaise: 120000, createdBy: id() };

  const good = new Expense({
    ...base,
    payers: [{ participant: a, amountPaise: 120000 }],
    splits: [
      { participant: a, sharePaise: 60000 },
      { participant: b, sharePaise: 60000 },
    ],
  });
  await good.validate();
  console.log('PASS: correct expense accepted');

  const bad = new Expense({
    ...base,
    payers: [{ participant: a, amountPaise: 120000 }],
    splits: [
      { participant: a, sharePaise: 50000 },
      { participant: b, sharePaise: 60000 },
    ],
  });
  try {
    await bad.validate();
    console.log('FAIL: bad split was accepted');
  } catch (err) {
    console.log('PASS: bad split rejected -> ' + err.errors.splits.message);
  }

  await mongoose.disconnect();
  process.exit(0);
};

run();