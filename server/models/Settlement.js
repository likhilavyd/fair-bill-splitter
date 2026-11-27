const mongoose = require('mongoose');

// One document = one recorded payment. Status (Pending / Partially Paid / Paid)
// is worked out later by comparing confirmed payments with the amount owed.
const settlementSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    fromParticipant: { type: mongoose.Schema.Types.ObjectId, required: true },
    toParticipant: { type: mongoose.Schema.Types.ObjectId, required: true },
    amountPaise: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: 'amountPaise must be a whole number of paise' },
    },
    paymentDate: { type: Date, default: Date.now },
    method: { type: String, enum: ['upi', 'cash', 'bank', 'other'], default: 'upi' },
    reference: { type: String, trim: true, default: '' },
    note: { type: String, trim: true, default: '' },
    // A QR scan or Pay Now click never marks a payment complete; the receiver confirms
    confirmation: {
      type: String,
      enum: ['pending_confirmation', 'confirmed', 'rejected'],
      default: 'pending_confirmation',
    },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    confirmedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

settlementSchema.pre('validate', function () {
  if (this.fromParticipant && this.toParticipant && this.fromParticipant.equals(this.toParticipant)) {
    this.invalidate('toParticipant', 'Payer and receiver must be different people');
  }
});

settlementSchema.index({ event: 1, createdAt: -1 });
settlementSchema.index({ event: 1, fromParticipant: 1, toParticipant: 1 });

module.exports = mongoose.model('Settlement', settlementSchema);