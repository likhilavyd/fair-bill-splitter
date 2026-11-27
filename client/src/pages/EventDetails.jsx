
import { useCallback, useEffect, useState } from 'react';
import './EventDetails.css';
import { api } from '../services/api';
import SettlementSection from './SettlementSection';

const getId = (value) => {
  if (!value) return '';
  return String(value._id || value.id || value);
};

const formatCurrency = (paise, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(paise || 0) / 100);

function EventDetails({ event, onBack, onUpdate }) {
  const [details, setDetails] = useState(event);

  const [expenseName, setExpenseName] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseType, setExpenseType] = useState('item');
  const [splitType, setSplitType] = useState('equal');

  const [selectedPeople, setSelectedPeople] = useState([]);
  const [splitInputs, setSplitInputs] = useState({});

  const [selectedPayers, setSelectedPayers] = useState([]);
  const [payerAmounts, setPayerAmounts] = useState({});

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');

  const eventData = details?.event || {};
  const eventId = getId(eventData);
  const participants = eventData.participants || [];
  const expenses = details?.expenses || [];
  const balances = details?.balances || [];
  const currency = eventData.currency || 'INR';

  const totalExpensePaise = expenses.reduce(
    (total, expense) => total + Number(expense.amountPaise || 0),
    0
  );

  const refreshDetails = useCallback(async () => {
    const response = await api.getEvent(eventId);
    setDetails(response);
    return response;
  }, [eventId]);

  useEffect(() => {
    setDetails(event);
  }, [event]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await api.getEvent(eventId);

        if (active) {
          setDetails(response);
        }
      } catch (err) {
        if (active) {
          setError(err.message || 'Could not load event details.');
        }
      }
    };

    if (eventId) load();

    return () => {
      active = false;
    };
  }, [eventId]);

  const togglePerson = (id) => {
    setSelectedPeople((previous) =>
      previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id]
    );

    setError('');
    setSuccess('');
  };

  const togglePayer = (id) => {
    setSelectedPayers((previous) => {
      if (previous.includes(id)) {
        return previous.filter((item) => item !== id);
      }

      return [...previous, id];
    });

    setError('');
    setSuccess('');
  };

  const handleSplitInput = (id, value) => {
    setSplitInputs((previous) => ({
      ...previous,
      [id]: value,
    }));
  };

  const handlePayerAmount = (id, value) => {
    setPayerAmounts((previous) => ({
      ...previous,
      [id]: value,
    }));
  };

  const resetForm = () => {
    setExpenseName('');
    setExpenseAmount('');
    setExpenseType('item');
    setSplitType('equal');
    setSelectedPeople([]);
    setSplitInputs({});
    setSelectedPayers([]);
    setPayerAmounts({});
  };

  const addExpense = async (e) => {
    e.preventDefault();

    setError('');
    setSuccess('');

    if (!expenseName.trim()) {
      setError('Please enter an expense name.');
      return;
    }

    const amount = Number(expenseAmount);

    if (
      !expenseAmount ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      setError('Please enter a valid expense amount.');
      return;
    }

    const amountPaise = Math.round(amount * 100);

    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
      setError('Please enter a valid amount.');
      return;
    }

    if (selectedPeople.length === 0) {
      setError('Select at least one participant who shared this expense.');
      return;
    }

    if (selectedPayers.length === 0) {
      setError('Select at least one person who paid.');
      return;
    }

    let splitInput = {};

    if (splitType === 'custom') {
      for (const id of selectedPeople) {
        const value = splitInputs[id];

        if (
          value === undefined ||
          value === '' ||
          !Number.isFinite(Number(value)) ||
          Number(value) < 0
        ) {
          setError('Enter a valid share for every selected participant.');
          return;
        }

        splitInput[id] = Math.round(Number(value) * 100);
      }

      const totalShares = Object.values(splitInput).reduce(
        (total, value) => total + value,
        0
      );

      if (totalShares !== amountPaise) {
        setError('Custom shares must add up exactly to the expense amount.');
        return;
      }
    }

    if (splitType === 'percentage') {
      for (const id of selectedPeople) {
        const value = splitInputs[id];

        if (
          value === undefined ||
          value === '' ||
          !Number.isFinite(Number(value)) ||
          Number(value) < 0
        ) {
          setError('Enter a valid percentage for every selected participant.');
          return;
        }

        splitInput[id] = Number(value);
      }

      const percentageTotal = Object.values(splitInput).reduce(
        (total, value) => total + value,
        0
      );

      if (Math.round(percentageTotal * 100) !== 10000) {
        setError('Percentages must add up to exactly 100%.');
        return;
      }
    }

    let payers = [];

    if (selectedPayers.length === 1) {
      payers = [
        {
          participant: selectedPayers[0],
          amountPaise,
        },
      ];
    } else {
      for (const id of selectedPayers) {
        const value = payerAmounts[id];

        if (
          value === undefined ||
          value === '' ||
          !Number.isFinite(Number(value)) ||
          Number(value) <= 0
        ) {
          setError('Enter a valid payment amount for every selected payer.');
          return;
        }

        payers.push({
          participant: id,
          amountPaise: Math.round(Number(value) * 100),
        });
      }

      const totalPaid = payers.reduce(
        (total, payer) => total + payer.amountPaise,
        0
      );

      if (totalPaid !== amountPaise) {
        setError('Payer amounts must add up exactly to the expense amount.');
        return;
      }
    }

    const expenseData = {
      title: expenseName.trim(),
      amountPaise,
      expenseType,
      category: 'general',
      splitMethod: splitType,
      consumers: selectedPeople,
      splitInput:
        splitType === 'equal' ? undefined : splitInput,
      payers,
    };

    setSaving(true);

    try {
      await api.createExpense(eventId, expenseData);
      await refreshDetails();

      if (typeof onUpdate === 'function') {
        onUpdate();
      }

      resetForm();
      setSuccess('Expense added successfully!');
    } catch (err) {
      setError(err.message || 'Could not add the expense.');
    } finally {
      setSaving(false);
    }
  };

  const removeExpense = async (expenseId) => {
    if (!window.confirm('Are you sure you want to delete this expense?')) {
      return;
    }

    setError('');
    setSuccess('');
    setDeletingId(expenseId);

    try {
      await api.deleteExpense(eventId, expenseId);
      await refreshDetails();

      if (typeof onUpdate === 'function') {
        onUpdate();
      }

      setSuccess('Expense deleted successfully!');
    } catch (err) {
      setError(err.message || 'Could not delete the expense.');
    } finally {
      setDeletingId('');
    }
  };

  const getParticipantName = (id) => {
    const person = participants.find(
      (participant) => getId(participant) === getId(id)
    );

    return person?.name || 'Unknown';
  };

  return (
    <div className="event-details-page">
      <div className="event-details-container">

        <button
          type="button"
          className="event-back-btn"
          onClick={onBack}
        >
          <i className="bi bi-arrow-left"></i> Back to Dashboard
        </button>

        {/* EVENT INFORMATION */}

        <div className="event-title-card">
          <div>
            <span className="event-label">EXPENSE EVENT</span>

            <h2>{eventData.name}</h2>

            <p>
              {eventData.description || 'Manage your shared expenses.'}
            </p>

            <div className="event-meta">
              <span>
                <i className="bi bi-calendar3"></i>
                {eventData.date
                  ? new Date(eventData.date).toLocaleDateString('en-IN')
                  : 'No date set'}
              </span>

              <span>
                <i className="bi bi-people"></i>
                {participants.length} participants
              </span>
            </div>
          </div>

          <div className="event-total-box">
            <small>Total Expenses</small>
            <h2>{formatCurrency(totalExpensePaise, currency)}</h2>
          </div>
        </div>

        {/* ADD EXPENSE */}

        <div className="event-section-card">
          <div className="event-section-heading">
            <div>
              <h4>Add an Expense</h4>
              <p>Add items or general shared expenses.</p>
            </div>
          </div>

          <form onSubmit={addExpense}>
            <div className="row g-3 mb-3">

              <div className="col-md-6">
                <label className="form-label">Expense Name *</label>

                <input
                  type="text"
                  maxLength="120"
                  className="form-control"
                  placeholder="e.g. Pizza, Burger, Cab"
                  value={expenseName}
                  onChange={(e) => setExpenseName(e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="col-md-6">
                <label className="form-label">Amount *</label>

                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  className="form-control"
                  placeholder="Enter amount"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="col-md-6">
                <label className="form-label">Expense Category</label>

                <select
                  className="form-select"
                  value={expenseType}
                  onChange={(e) => setExpenseType(e.target.value)}
                  disabled={saving}
                >
                  <option value="item">Individual Item</option>
                  <option value="general">General Shared Expense</option>
                </select>
              </div>

              <div className="col-md-6">
                <label className="form-label">Split Method</label>

                <select
                  className="form-select"
                  value={splitType}
                  onChange={(e) => {
                    setSplitType(e.target.value);
                    setSplitInputs({});
                  }}
                  disabled={saving}
                >
                  <option value="equal">Split Equally</option>
                  <option value="custom">Custom Amounts</option>
                  <option value="percentage">Percentage Split</option>
                </select>
              </div>
            </div>

            {/* PARTICIPANTS */}

            <div className="participant-selection">
              <label className="form-label">
                Who consumed/shared this expense? *
              </label>

              <div className="selected-people-grid">
                {participants.map((person) => {
                  const id = getId(person);

                  return (
                    <label
                      className={`person-checkbox ${
                        selectedPeople.includes(id) ? 'selected' : ''
                      }`}
                      key={id}
                    >
                      <input
                        type="checkbox"
                        checked={selectedPeople.includes(id)}
                        onChange={() => togglePerson(id)}
                        disabled={saving}
                      />

                      <span>{person.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* CUSTOM AND PERCENTAGE SHARES */}

            {(splitType === 'custom' || splitType === 'percentage') &&
              selectedPeople.length > 0 && (
                <div className="custom-share-section">
                  <h6>
                    {splitType === 'custom'
                      ? 'Enter each participant’s share'
                      : 'Enter each participant’s percentage'}
                  </h6>

                  {selectedPeople.map((id) => (
                    <div className="custom-share-row" key={id}>
                      <span>{getParticipantName(id)}</span>

                      <input
                        type="number"
                        min="0"
                        step={splitType === 'custom' ? '0.01' : '0.01'}
                        className="form-control"
                        placeholder={
                          splitType === 'custom' ? 'Amount' : 'Percentage'
                        }
                        value={splitInputs[id] ?? ''}
                        onChange={(e) =>
                          handleSplitInput(id, e.target.value)
                        }
                        disabled={saving}
                      />

                      {splitType === 'percentage' && <span>%</span>}
                    </div>
                  ))}
                </div>
              )}

            {/* MULTIPLE PAYERS */}

            <div className="participant-selection mt-4">
              <label className="form-label">
                Who paid for this expense? *
              </label>

              <p className="text-muted small">
                Select one or more people who contributed to the payment.
              </p>

              <div className="selected-people-grid">
                {participants.map((person) => {
                  const id = getId(person);

                  return (
                    <label
                      className={`person-checkbox ${
                        selectedPayers.includes(id) ? 'selected' : ''
                      }`}
                      key={id}
                    >
                      <input
                        type="checkbox"
                        checked={selectedPayers.includes(id)}
                        onChange={() => togglePayer(id)}
                        disabled={saving}
                      />

                      <span>{person.name}</span>
                    </label>
                  );
                })}
              </div>

              {selectedPayers.length === 1 && (
                <p className="small text-muted mt-2">
                  {getParticipantName(selectedPayers[0])} will be recorded as
                  paying the full expense amount.
                </p>
              )}

              {selectedPayers.length > 1 && (
                <div className="custom-share-section">
                  <h6>Enter the amount paid by each person</h6>

                  {selectedPayers.map((id) => (
                    <div className="custom-share-row" key={id}>
                      <span>{getParticipantName(id)}</span>

                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        className="form-control"
                        placeholder="Amount paid"
                        value={payerAmounts[id] ?? ''}
                        onChange={(e) =>
                          handlePayerAmount(id, e.target.value)
                        }
                        disabled={saving}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div className="expense-error mt-3" role="alert">
                <i className="bi bi-exclamation-circle me-2"></i>
                {error}
              </div>
            )}

            {success && (
              <div className="alert alert-success mt-3" role="status">
                <i className="bi bi-check-circle me-2"></i>
                {success}
              </div>
            )}

            <button
              type="submit"
              className="add-expense-btn"
              disabled={saving}
            >
              {saving ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2"></span>
                  Saving...
                </>
              ) : (
                <>
                  <i className="bi bi-plus-lg me-2"></i>
                  Add Expense
                </>
              )}
            </button>
          </form>
        </div>

        {/* EXPENSE BREAKDOWN */}

        <div className="event-section-card">
          <div className="event-section-heading">
            <div>
              <h4>Expense Breakdown</h4>
              <p>All items and shared expenses in this event.</p>
            </div>

            <span className="expense-count">
              {expenses.length} expenses
            </span>
          </div>

          {expenses.length === 0 ? (
            <div className="no-expenses">
              <i className="bi bi-receipt"></i>
              <h5>No expenses added yet</h5>
              <p>Start by adding your first expense above.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table expense-table">
                <thead>
                  <tr>
                    <th>EXPENSE</th>
                    <th>CATEGORY</th>
                    <th>PAID BY</th>
                    <th>SHARED BY</th>
                    <th>AMOUNT</th>
                    <th>ACTION</th>
                  </tr>
                </thead>

                <tbody>
                  {expenses.map((expense) => {
                    const payers = expense.payers || [];
                    const splits = expense.splits || [];

                    return (
                      <tr key={getId(expense)}>
                        <td>
                          <strong>{expense.title}</strong>
                        </td>

                        <td>
                          {expense.expenseType === 'item'
                            ? 'Individual Item'
                            : 'General Expense'}
                        </td>

                        <td>
                          {payers.map((payer) => (
                            <div key={getId(payer.participant)}>
                              {getParticipantName(payer.participant)}
                            </div>
                          ))}
                        </td>

                        <td>
                          {splits
                            .map((split) =>
                              getParticipantName(split.participant)
                            )
                            .join(', ')}
                        </td>

                        <td className="expense-amount">
                          {formatCurrency(expense.amountPaise, currency)}
                        </td>

                        <td>
                          <button
                            type="button"
                            className="delete-expense-btn"
                            onClick={() => removeExpense(getId(expense))}
                            disabled={deletingId === getId(expense)}
                            title="Delete expense"
                          >
                            {deletingId === getId(expense) ? (
                              <span className="spinner-border spinner-border-sm"></span>
                            ) : (
                              <i className="bi bi-trash"></i>
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* PARTICIPANT BALANCES */}

        <div className="event-section-card">
          <div className="event-section-heading">
            <div>
              <h4>Participant Balances</h4>
              <p>Compare what each person paid against their share.</p>
            </div>
          </div>

          <div className="table-responsive">
            <table className="table expense-table">
              <thead>
                <tr>
                  <th>PARTICIPANT</th>
                  <th>PAID</th>
                  <th>EXPENSE SHARE</th>
                  <th>NET BALANCE</th>
                </tr>
              </thead>

              <tbody>
                {balances.map((person) => (
                  <tr key={getId(person.participantId)}>
                    <td>
                      <strong>{person.name}</strong>
                    </td>

                    <td>{formatCurrency(person.paidPaise, currency)}</td>

                    <td>{formatCurrency(person.sharePaise, currency)}</td>

                    <td>
                      <strong
                        className={
                          person.balancePaise > 0
                            ? 'positive-amount'
                            : person.balancePaise < 0
                              ? 'negative-amount'
                              : ''
                        }
                      >
                        {person.balancePaise > 0 ? '+' : ''}
                        {formatCurrency(person.balancePaise, currency)}
                      </strong>
                    </td>
                  </tr>
                ))}

                {balances.length === 0 && (
                  <tr>
                    <td colSpan="4" className="text-center py-3">
                      No balance data available yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <SettlementSection
          eventId={eventId}
          participants={participants}
          participantBalances={balances}
          currency={currency}
        />

      </div>
    </div>
  );
}

export default EventDetails;
