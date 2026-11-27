const mongoose = require('mongoose');

// Participants can be registered users or just names added by the creator
const participantSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, trim: true, lowercase: true, default: '' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
});

const eventSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Event name is required'], trim: true, maxlength: 120 },
    description: { type: String, trim: true, default: '', maxlength: 500 },
    date: { type: Date, default: Date.now },
    currency: { type: String, uppercase: true, trim: true, default: 'INR' },
    category: {
      type: String,
      enum: ['food', 'trip', 'shopping', 'movie', 'hostel', 'household', 'party', 'custom'],
      default: 'custom',
    },
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    participants: {
      type: [participantSchema],
      validate: [(arr) => arr.length >= 1, 'An event needs at least one participant'],
    },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
  },
  { timestamps: true }
);

eventSchema.index({ creator: 1, date: -1 });
eventSchema.index({ 'participants.user': 1 });

module.exports = mongoose.model('Event', eventSchema);