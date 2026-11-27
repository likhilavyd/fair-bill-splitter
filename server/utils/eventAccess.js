const Event = require('../models/Event');
const httpError = require('./httpError');

// Loads an event only if the logged-in user created it or is a linked participant.
// Everyone else gets "not found", so event ids can't be probed.
const getAccessibleEvent = async (eventId, user) => {
  const event = await Event.findById(eventId);
  if (!event) throw httpError(404, 'Event not found');

  const userId = String(user._id);
  const isCreator = String(event.creator) === userId;
  const isParticipant = event.participants.some((p) => p.user && String(p.user) === userId);

  if (!isCreator && !isParticipant) throw httpError(404, 'Event not found');

  return { event, isCreator };
};

module.exports = { getAccessibleEvent };