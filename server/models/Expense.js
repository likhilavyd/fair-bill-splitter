const mongoose = require('mongoose');

const isPaise = {
  validator: Number.isInteger,
  message: '{PATH} must be a whole number of paise',
};

const payerSchema = new mongoose.Schema({
  participant: { type: mongoose.Schema.Types.ObjectId, required: true },
  amountPaise: { type: Number, required: true, min: 0, validate: isPaise },
});

const splitSchema = new mongoose.Schema({
  participant: { type: mongoose.Schema.Types.ObjectId, required: true },
  sharePaise: { type: Number, required: true, min: 0, validate: isPaise },
});

const itemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  quantity: { type: Number, default: 1, min: 1 },
  pricePaise: { type: Number, required: true, min: 0, validate: isPaise },
  consumers: [{ type: mongoose.Schema.Types.ObjectId }],
});

const expenseSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    title: { type: String, required: [true, 'Expense name is required'], trim: true, maxlength: 120 },
    expenseType: { type: String, enum: ['item', 'general'], default: 'item' },
    category: {
      type: String,
      enum: ['food', 'travel', 'shopping', 'entertainment', 'accommodation', 'utilities', 'general', 'other'],
      default: 'general',
    },
    amountPaise: { type: Number, required: true, min: 1, validate: isPaise },
    expenseDate: { type: Date, default: Date.now },
    splitMethod: {
      type: String,
      enum: ['equal', 'custom', 'percentage', 'proportional', 'quantity', 'itemwise', 'shared'],
      default: 'equal',
    },
    payers: { type: [payerSchema], validate: [(a) => a.length >= 1, 'At least one payer is required'] },
    splits: { type: [splitSchema], validate: [(a) => a.length >= 1, 'At least one consumer is required'] },
    items: [itemSchema],
    charges: {
      taxPaise: { type: Number, default: 0, min: 0, validate: isPaise },
      discountPaise: { type: Number, default: 0, min: 0, validate: isPaise },
      tipPaise: { type: Number, default: 0, min: 0, validate: isPaise },
      serviceChargePaise: { type: Number, default: 0, min: 0, validate: isPaise },
    },
    notes: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// The safety net: money paid and money consumed must both equal the total
expenseSchema.pre('validate', function () {
  const sum = (arr, key) => arr.reduce((total, row) => total + (row[key] || 0), 0);

  if (this.payers && this.payers.length && sum(this.payers, 'amountPaise') !== this.amountPaise) {
    this.invalidate('payers', 'Payer amounts must add up to the expense total');
  }
  if (this.splits && this.splits.length && sum(this.splits, 'sharePaise') !== this.amountPaise) {
    this.invalidate('splits', 'Split shares must add up to the expense total');
  }
});

expenseSchema.index({ event: 1, expenseDate: -1 });
expenseSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Expense', expenseSchema);