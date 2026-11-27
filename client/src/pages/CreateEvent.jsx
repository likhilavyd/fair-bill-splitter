import { useState } from 'react';
import './CreateEvent.css';

function CreateEvent({ onBack, onCreate }) {
  const [eventName, setEventName] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [currency, setCurrency] = useState('INR');

  const [participants, setParticipants] = useState([]);
  const [participantName, setParticipantName] = useState('');
  const [error, setError] = useState('');

  const addParticipant = () => {
    const name = participantName.trim();

    if (!name) {
      setError('Please enter a participant name.');
      return;
    }

    const alreadyExists = participants.some(
      (person) => person.name.toLowerCase() === name.toLowerCase()
    );

    if (alreadyExists) {
      setError('This participant has already been added.');
      return;
    }

    setParticipants([
      ...participants,
      {
        id: Date.now(),
        name
      }
    ]);

    setParticipantName('');
    setError('');
  };

  const removeParticipant = (id) => {
    setParticipants(
      participants.filter((person) => person.id !== id)
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!eventName.trim() || !eventDate) {
      setError('Please enter the event name and date.');
      return;
    }

    if (participants.length === 0) {
      setError('Please add at least one participant.');
      return;
    }

    const newEvent = {
      id: Date.now(),
      name: eventName.trim(),
      description,
      date: eventDate,
      currency,
      participants
    };

    if (onCreate) {
      onCreate(newEvent);
    } else {
      console.log('New Event:', newEvent);
      alert('Event created successfully!');
      onBack();
    }
  };

  return (
    <div className="create-event-page">
      <div className="create-event-container">

        <div className="create-event-header">
          <button
            type="button"
            className="back-btn"
            onClick={onBack}
          >
            <i className="bi bi-arrow-left"></i>
          </button>

          <div>
            <h2>Create New Event</h2>
            <p>Create an event and add people to split expenses with.</p>
          </div>
        </div>

        <form className="create-event-card" onSubmit={handleSubmit}>

          <div className="form-section">
            <h5>Event Information</h5>

            <div className="mb-3">
              <label className="form-label">Event Name *</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Dinner at BBQ Nation"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
              />
            </div>

            <div className="mb-3">
              <label className="form-label">Description</label>
              <textarea
                className="form-control"
                placeholder="Add a short description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="form-label">Event Date *</label>
                <input
                  type="date"
                  className="form-control"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
              </div>

              <div className="col-md-6 mb-3">
                <label className="form-label">Currency</label>
                <select
                  className="form-select"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>
            </div>
          </div>

          <hr className="form-divider" />

          <div className="form-section">
            <h5>Participants</h5>
            <p>Add the people who will participate in this event.</p>

            <div className="participant-input">
              <input
                type="text"
                className="form-control"
                placeholder="Enter participant name"
                value={participantName}
                onChange={(e) => setParticipantName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addParticipant();
                  }
                }}
              />

              <button
                type="button"
                className="btn add-participant-btn"
                onClick={addParticipant}
              >
                <i className="bi bi-plus-lg me-2"></i>
                Add
              </button>
            </div>

            <div className="participant-list">
              {participants.length === 0 ? (
                <div className="empty-participants">
                  <i className="bi bi-people fs-3 d-block mb-2"></i>
                  No participants added yet.
                </div>
              ) : (
                participants.map((person) => (
                  <div className="participant-item" key={person.id}>
                    <div className="participant-info">
                      <div className="participant-avatar">
                        {person.name.charAt(0).toUpperCase()}
                      </div>

                      <span className="participant-name">
                        {person.name}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="remove-participant-btn"
                      onClick={() => removeParticipant(person.id)}
                    >
                      <i className="bi bi-trash"></i>
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="participant-count">
              {participants.length} participant(s) added
            </div>
          </div>

          {error && (
            <div className="form-error">
              <i className="bi bi-exclamation-circle me-2"></i>
              {error}
            </div>
          )}

          <div className="form-actions">
            <button
              type="button"
              className="btn cancel-btn"
              onClick={onBack}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="btn submit-event-btn"
            >
              <i className="bi bi-check-lg me-2"></i>
              Create Event
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}

export default CreateEvent;