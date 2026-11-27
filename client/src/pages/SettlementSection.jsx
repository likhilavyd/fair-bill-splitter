
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { useAuth } from '../AuthGate';
import './SettlementSection.css';

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

const getPaymentDate = (payment) =>
  payment.paymentDate || payment.createdAt || new Date().toISOString();

function SettlementSection({
  eventId,
  participants = [],
  participantBalances = [],
  currency = 'INR',
}) {
  const { user } = useAuth();

  const [settlements, setSettlements] = useState([]);
  const [payerId, setPayerId] = useState('');
  const [receiverId, setReceiverId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('upi');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processingId, setProcessingId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const currentUserId = getId(user);

  const loadSettlements = useCallback(async () => {
    if (!eventId) return;

    const response = await api.getSettlements(eventId);
    setSettlements(response.settlements || []);
  }, [eventId]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await api.getSettlements(eventId);

        if (active) {
          setSettlements(response.settlements || []);
        }
      } catch (err) {
        if (active) {
          setError(err.message || 'Could not load payment history.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    if (eventId) load();

    return () => {
      active = false;
    };
  }, [eventId]);

  const obligations = useMemo(() => {
    const debtors = participantBalances
      .filter((person) => Number(person.balancePaise) < 0)
      .map((person) => ({
        id: getId(person.participantId || person.id),
        name: person.name,
        remaining: -Number(person.balancePaise),
      }));

    const creditors = participantBalances
      .filter((person) => Number(person.balancePaise) > 0)
      .map((person) => ({
        id: getId(person.participantId || person.id),
        name: person.name,
        remaining: Number(person.balancePaise),
      }));

    const result = [];
    let debtorIndex = 0;
    let creditorIndex = 0;

    while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
      const debtor = debtors[debtorIndex];
      const creditor = creditors[creditorIndex];
      const amountPaise = Math.min(debtor.remaining, creditor.remaining);

      if (amountPaise > 0) {
        result.push({
          debtorId: debtor.id,
          debtorName: debtor.name,
          creditorId: creditor.id,
          creditorName: creditor.name,
          originalPaise: amountPaise,
          confirmedPaise: 0,
          pendingPaise: 0,
        });
      }

      debtor.remaining -= amountPaise;
      creditor.remaining -= amountPaise;

      if (debtor.remaining === 0) debtorIndex += 1;
      if (creditor.remaining === 0) creditorIndex += 1;
    }

    settlements.forEach((payment) => {
      if (!['confirmed', 'pending_confirmation'].includes(payment.confirmation)) {
        return;
      }

      const fromId = getId(payment.fromParticipant);
      const toId = getId(payment.toParticipant);
      let remainingPayment = Number(payment.amountPaise || 0);

      for (const obligation of result) {
        if (
          obligation.debtorId === fromId &&
          obligation.creditorId === toId &&
          remainingPayment > 0
        ) {
          const alreadyApplied =
            obligation.confirmedPaise + obligation.pendingPaise;
          const available = Math.max(0, obligation.originalPaise - alreadyApplied);
          const applied = Math.min(available, remainingPayment);

          if (payment.confirmation === 'confirmed') {
            obligation.confirmedPaise += applied;
          } else {
            obligation.pendingPaise += applied;
          }

          remainingPayment -= applied;
        }
      }
    });

    return result.map((item) => ({
      ...item,
      outstandingPaise: Math.max(
        0,
        item.originalPaise - item.confirmedPaise
      ),
      availablePaise: Math.max(
        0,
        item.originalPaise - item.confirmedPaise - item.pendingPaise
      ),
    }));
  }, [participantBalances, settlements]);

  const totalOutstandingPaise = obligations.reduce(
    (total, item) => total + item.outstandingPaise,
    0
  );

  const totalPendingPaise = obligations.reduce(
    (total, item) => total + item.pendingPaise,
    0
  );

  const recordPayment = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!payerId || !receiverId) {
      setError('Select both the person paying and the person receiving.');
      return;
    }

    if (payerId === receiverId) {
      setError('The payer and receiver must be different people.');
      return;
    }

    const amountNumber = Number(amount);

    if (!amount || !Number.isFinite(amountNumber) || amountNumber <= 0) {
      setError('Enter a valid payment amount.');
      return;
    }

    const amountPaise = Math.round(amountNumber * 100);

    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
      setError('Enter a valid payment amount.');
      return;
    }

    const obligation = obligations.find(
      (item) => item.debtorId === payerId && item.creditorId === receiverId
    );

    if (!obligation || obligation.availablePaise <= 0) {
      setError('There is no available amount to record for this payment. Check pending confirmations.');
      return;
    }

    if (amountPaise > obligation.availablePaise) {
      setError(
        `You can record up to ${formatCurrency(obligation.availablePaise, currency)} for this payment.`
      );
      return;
    }

    setSaving(true);

    try {
      await api.createSettlement(eventId, {
        fromParticipant: payerId,
        toParticipant: receiverId,
        amountPaise,
        method,
        reference: reference.trim(),
        note: note.trim(),
        paymentDate: new Date().toISOString(),
      });

      await loadSettlements();

      setAmount('');
      setReference('');
      setNote('');
      setSuccess('Payment recorded. It is awaiting receiver confirmation.');
    } catch (err) {
      setError(err.message || 'Could not record the payment.');
    } finally {
      setSaving(false);
    }
  };

  const processPayment = async (settlementId, action) => {
    setError('');
    setSuccess('');
    setProcessingId(settlementId);

    try {
      await api.confirmSettlement(eventId, settlementId, action);
      await loadSettlements();

      setSuccess(
        action === 'confirmed'
          ? 'Payment confirmed successfully.'
          : 'Payment rejected.'
      );
    } catch (err) {
      setError(err.message || 'Could not process this payment.');
    } finally {
      setProcessingId('');
    }
  };

  const getParticipantName = (participantId) => {
    const person = participants.find(
      (item) => getId(item) === getId(participantId)
    );

    return person?.name || 'Unknown';
  };

  const getStatusLabel = (item) => {
    if (item.outstandingPaise === 0) return 'Paid';
    if (item.pendingPaise > 0 && item.confirmedPaise > 0) {
      return 'Partially paid · Awaiting confirmation';
    }
    if (item.pendingPaise > 0) return 'Awaiting confirmation';
    if (item.confirmedPaise > 0) return 'Partially paid';
    return 'Pending';
  };

  return (
    <div className="event-section-card settlement-section">
      <div className="event-section-heading">
        <div>
          <h4>Settlements</h4>
          <p>Record payments and track receiver confirmations.</p>
        </div>

        <span className="settlement-outstanding">
          Outstanding: {formatCurrency(totalOutstandingPaise, currency)}
        </span>
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

      {loading ? (
        <div className="settlement-loading">
          <span className="spinner-border spinner-border-sm me-2"></span>
          Loading settlements...
        </div>
      ) : (
        <>
          <div className="settlement-summary">
            <div>
              <small>Outstanding balance</small>
              <strong>{formatCurrency(totalOutstandingPaise, currency)}</strong>
            </div>
            <div>
              <small>Awaiting confirmation</small>
              <strong>{formatCurrency(totalPendingPaise, currency)}</strong>
            </div>
          </div>

          {obligations.length === 0 ? (
            <div className="settlement-empty">
              <i className="bi bi-check-circle"></i>
              <strong>All settled!</strong>
              <span>There are no outstanding balances in this event.</span>
            </div>
          ) : (
            <div className="table-responsive mb-4">
              <table className="table expense-table">
                <thead>
                  <tr>
                    <th>WHO PAYS</th>
                    <th>WHO RECEIVES</th>
                    <th>ORIGINAL DUE</th>
                    <th>CONFIRMED</th>
                    <th>OUTSTANDING</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {obligations.map((item) => (
                    <tr key={`${item.debtorId}-${item.creditorId}`}>
                      <td>{item.debtorName}</td>
                      <td>{item.creditorName}</td>
                      <td>{formatCurrency(item.originalPaise, currency)}</td>
                      <td>{formatCurrency(item.confirmedPaise, currency)}</td>
                      <td className="negative-amount">
                        {formatCurrency(item.outstandingPaise, currency)}
                        {item.pendingPaise > 0 && (
                          <small className="settlement-pending-note">
                            {formatCurrency(item.pendingPaise, currency)} awaiting confirmation
                          </small>
                        )}
                      </td>
                      <td>
                        <span
                          className={`settlement-status ${
                            item.outstandingPaise === 0
                              ? 'paid'
                              : item.confirmedPaise > 0
                                ? 'partial'
                                : item.pendingPaise > 0
                                  ? 'awaiting'
                                  : 'pending'
                          }`}
                        >
                          {getStatusLabel(item)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <form onSubmit={recordPayment} className="record-payment-form">
            <h5>Record a Payment</h5>

            <div className="row g-3">
              <div className="col-md-4">
                <label className="form-label">Paid By</label>
                <select
                  className="form-select"
                  value={payerId}
                  onChange={(e) => setPayerId(e.target.value)}
                  disabled={saving}
                  required
                >
                  <option value="">Select payer</option>
                  {participants.map((person) => (
                    <option key={getId(person)} value={getId(person)}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-md-4">
                <label className="form-label">Paid To</label>
                <select
                  className="form-select"
                  value={receiverId}
                  onChange={(e) => setReceiverId(e.target.value)}
                  disabled={saving}
                  required
                >
                  <option value="">Select receiver</option>
                  {participants.map((person) => (
                    <option key={getId(person)} value={getId(person)}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-md-4">
                <label className="form-label">Amount</label>
                <input
                  className="form-control"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount"
                  disabled={saving}
                  required
                />
              </div>

              <div className="col-md-4">
                <label className="form-label">Payment Method</label>
                <select
                  className="form-select"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  disabled={saving}
                >
                  <option value="upi">UPI</option>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank Transfer</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="col-md-8">
                <label className="form-label">Reference (optional)</label>
                <input
                  className="form-control"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="UPI reference / transaction ID"
                  maxLength="120"
                  disabled={saving}
                />
              </div>

              <div className="col-12">
                <label className="form-label">Note (optional)</label>
                <input
                  className="form-control"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a payment note"
                  maxLength="300"
                  disabled={saving}
                />
              </div>

              <div className="col-12">
                <button
                  className="record-payment-btn"
                  type="submit"
                  disabled={saving || obligations.every((item) => item.availablePaise <= 0)}
                >
                  {saving ? 'Recording...' : 'Record Payment'}
                </button>
              </div>
            </div>
          </form>

          <div className="payment-history">
            <h5>Payment History</h5>

            {settlements.length === 0 ? (
              <p className="text-muted mb-0">No payments recorded yet.</p>
            ) : (
              settlements.map((payment) => {
                const fromId = getId(payment.fromParticipant);
                const toId = getId(payment.toParticipant);
                const receiver = participants.find(
                  (person) => getId(person) === toId
                );
                const canConfirm =
                  receiver?.user &&
                  getId(receiver.user) === currentUserId &&
                  payment.confirmation === 'pending_confirmation';

                return (
                  <div className="payment-history-row" key={getId(payment)}>
                    <div className="payment-history-main">
                      <span>
                        <strong>{getParticipantName(fromId)}</strong> paid{' '}
                        <strong>{getParticipantName(toId)}</strong>
                      </span>
                      <strong>{formatCurrency(payment.amountPaise, currency)}</strong>
                    </div>

                    <div className="payment-history-meta">
                      <small>
                        {new Date(getPaymentDate(payment)).toLocaleString('en-IN')}
                      </small>
                      <small>
                        {String(payment.method || 'other').toUpperCase()}
                      </small>
                      {payment.reference && (
                        <small>Ref: {payment.reference}</small>
                      )}
                    </div>

                    {payment.note && (
                      <small className="payment-note">{payment.note}</small>
                    )}

                    <div className="payment-history-actions">
                      <span
                        className={`settlement-status ${
                          payment.confirmation === 'confirmed'
                            ? 'paid'
                            : payment.confirmation === 'rejected'
                              ? 'rejected'
                              : 'awaiting'
                        }`}
                      >
                        {payment.confirmation === 'confirmed'
                          ? 'Confirmed'
                          : payment.confirmation === 'rejected'
                            ? 'Rejected'
                            : 'Awaiting confirmation'}
                      </span>

                      {canConfirm && (
                        <div className="settlement-confirm-actions">
                          <button
                            type="button"
                            className="settlement-confirm-btn"
                            onClick={() => processPayment(getId(payment), 'confirmed')}
                            disabled={processingId === getId(payment)}
                          >
                            {processingId === getId(payment) ? 'Please wait...' : 'Confirm'}
                          </button>

                          <button
                            type="button"
                            className="settlement-reject-btn"
                            onClick={() => processPayment(getId(payment), 'rejected')}
                            disabled={processingId === getId(payment)}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default SettlementSection;
