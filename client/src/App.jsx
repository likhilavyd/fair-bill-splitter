
import { useCallback, useEffect, useMemo, useState } from 'react';
import CreateEvent from './pages/CreateEvent';
import EventDetails from './pages/EventDetails';
import { api } from './services/api';
import { useAuth } from './AuthGate';
import './App.css';

const formatCurrency = (paise) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(paise || 0) / 100);

const formatDate = (date) => {
  if (!date) return '—';

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) return '—';

  return parsedDate.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const getId = (value) => {
  if (!value) return '';
  return String(value._id || value.id || value);
};

const findCurrentParticipant = (event, user) => {
  const participants = event?.participants || [];

  return participants.find((participant) => {
    const participantUserId = getId(participant.user);

    if (user?._id && participantUserId === String(user._id)) {
      return true;
    }

    if (
      user?.email &&
      participant.email &&
      participant.email.toLowerCase() === user.email.toLowerCase()
    ) {
      return true;
    }

    return (
      user?.name &&
      participant.name?.toLowerCase() === user.name.toLowerCase()
    );
  });
};

const calculatePersonalObligations = (
  balances,
  ownParticipantId,
  eventName
) => {
  const ownId = String(ownParticipantId);

  const ownBalance = balances.find(
    (balance) => String(balance.participantId) === ownId
  );

  if (!ownBalance) {
    return { owedToYou: [], youOwe: [] };
  }

  let ownCredit = Math.max(0, Number(ownBalance.balancePaise || 0));
  let ownDebt = Math.max(0, -Number(ownBalance.balancePaise || 0));

  const debtors = balances.filter(
    (balance) =>
      String(balance.participantId) !== ownId &&
      Number(balance.balancePaise) < 0
  );

  const creditors = balances.filter(
    (balance) =>
      String(balance.participantId) !== ownId &&
      Number(balance.balancePaise) > 0
  );

  const owedToYou = [];
  const youOwe = [];

  for (const debtor of debtors) {
    if (ownCredit <= 0) break;

    const amount = Math.min(
      ownCredit,
      Math.abs(Number(debtor.balancePaise))
    );

    if (amount > 0) {
      owedToYou.push({
        name: debtor.name,
        event: eventName,
        amount,
      });

      ownCredit -= amount;
    }
  }

  for (const creditor of creditors) {
    if (ownDebt <= 0) break;

    const amount = Math.min(
      ownDebt,
      Number(creditor.balancePaise)
    );

    if (amount > 0) {
      youOwe.push({
        name: creditor.name,
        event: eventName,
        amount,
      });

      ownDebt -= amount;
    }
  }

  return { owedToYou, youOwe };
};

const pageInfo = {
  dashboard: {
    title: 'Dashboard',
    subtitle: "Welcome back! Here's your financial overview.",
  },
  groups: {
    title: 'My Groups',
    subtitle: 'View and manage your expense groups.',
  },
  expenses: {
    title: 'Expenses',
    subtitle: 'All expenses recorded across your groups.',
  },
  settlements: {
    title: 'Settlements',
    subtitle: 'Track payments and settlement confirmations.',
  },
  profile: {
    title: 'My Profile',
    subtitle: 'Manage your personal account information.',
  },
  analytics: {
    title: 'Analytics',
    subtitle: 'Understand your shared spending patterns.',
  },
  settings: {
    title: 'Settings',
    subtitle: 'Manage your account and application preferences.',
  },
};

function App() {
  const { user, logout, updateUser } = useAuth();

  const [currentPage, setCurrentPage] = useState('dashboard');
  const [events, setEvents] = useState([]);
  const [eventDetails, setEventDetails] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notificationOpen, setNotificationOpen] = useState(false);

  const [profileForm, setProfileForm] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    upiId: user?.upiId || '',
  });

  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  useEffect(() => {
    setProfileForm({
      name: user?.name || '',
      phone: user?.phone || '',
      upiId: user?.upiId || '',
    });
  }, [user]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setLoadError('');

    try {
      const response = await api.getEvents();
      const fetchedEvents = response.events || [];

      const details = await Promise.all(
        fetchedEvents.map(async (event) => {
          try {
            const [eventResponse, settlementResponse] = await Promise.all([
              api.getEvent(event._id),
              api.getSettlements(event._id),
            ]);

            return {
              ...eventResponse,
              settlements: settlementResponse.settlements || [],
            };
          } catch (error) {
            console.error(
              `Could not load details for ${event.name}:`,
              error.message
            );

            return null;
          }
        })
      );

      setEvents(fetchedEvents);
      setEventDetails(details.filter(Boolean));
    } catch (error) {
      console.error('Dashboard loading failed:', error);
      setLoadError(error.message || 'Could not load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleCreateEvent = async (newEvent) => {
    setLoadError('');

    try {
      const eventData = {
        name: newEvent.name,
        description: newEvent.description || '',
        date: newEvent.date || undefined,
        currency: newEvent.currency || 'INR',
        category: newEvent.category || 'custom',
        participants: (newEvent.participants || []).map((person) => ({
          name: person.name,
          email: person.email || '',
        })),
      };

      await api.createEvent(eventData);
      await loadDashboard();
      setCurrentPage('dashboard');
    } catch (error) {
      console.error('Event creation failed:', error);
      setLoadError(error.message || 'Could not create event.');
    }
  };

  const handleUpdateEvent = async () => {
    await loadDashboard();
  };

  const openEvent = (event) => {
    const details = eventDetails.find(
      (item) => String(item.event?._id) === String(event._id)
    );

    if (details) {
      setSelectedEvent(details);
      setNotificationOpen(false);
      setCurrentPage('event-details');
    }
  };

  const peopleWhoOweYou = [];
  const peopleYouOwe = [];

  let totalExpensesPaise = 0;
  let totalPaidPaise = 0;

  for (const event of events) {
    totalExpensesPaise += Number(event.totalExpensePaise || 0);
  }

  for (const details of eventDetails) {
    const event = details.event;
    const balances = details.balances || [];

    if (!event) continue;

    const ownParticipant = findCurrentParticipant(event, user);

    if (!ownParticipant) continue;

    const ownBalance = balances.find(
      (balance) =>
        String(balance.participantId) === String(ownParticipant._id)
    );

    if (ownBalance) {
      totalPaidPaise += Number(ownBalance.paidPaise || 0);
    }

    const obligations = calculatePersonalObligations(
      balances,
      ownParticipant._id,
      event.name
    );

    peopleWhoOweYou.push(...obligations.owedToYou);
    peopleYouOwe.push(...obligations.youOwe);
  }

  const totalOwedToYou = peopleWhoOweYou.reduce(
    (total, person) => total + person.amount,
    0
  );

  const totalYouOwe = peopleYouOwe.reduce(
    (total, person) => total + person.amount,
    0
  );

  const recentEvents = events.map((event) => {
    const details = eventDetails.find(
      (item) => String(item.event?._id) === String(event._id)
    );

    const balances = details?.balances || [];
    const settlements = details?.settlements || [];

    const isSettled =
      balances.length > 0 &&
      balances.every((balance) => Number(balance.balancePaise) === 0);

    const hasPendingConfirmation = settlements.some(
      (settlement) =>
        settlement.confirmation === 'pending_confirmation'
    );

    const hasConfirmedSettlement = settlements.some(
      (settlement) => settlement.confirmation === 'confirmed'
    );

    let status = 'Pending';

    if (isSettled) {
      status = 'Settled';
    } else if (hasPendingConfirmation) {
      status = 'Awaiting Confirmation';
    } else if (hasConfirmedSettlement) {
      status = 'Partially Settled';
    }

    return {
      ...event,
      members: event.participants?.length || 0,
      amount: Number(event.totalExpensePaise || 0),
      displayDate: formatDate(event.date),
      status,
    };
  });

  const allExpenses = useMemo(() => {
    return eventDetails.flatMap((details) =>
      (details.expenses || []).map((expense) => ({
        ...expense,
        eventName: details.event?.name || 'Unknown event',
        eventId: details.event?._id,
      }))
    );
  }, [eventDetails]);

  const allSettlements = useMemo(() => {
    return eventDetails.flatMap((details) =>
      (details.settlements || []).map((settlement) => {
        const participants = details.event?.participants || [];

        const payer = participants.find(
          (person) =>
            getId(person._id) === getId(settlement.fromParticipant)
        );

        const receiver = participants.find(
          (person) =>
            getId(person._id) === getId(settlement.toParticipant)
        );

        return {
          ...settlement,
          eventName: details.event?.name || 'Unknown event',
          eventId: details.event?._id,
          payerName: payer?.name || 'Unknown participant',
          receiverName: receiver?.name || 'Unknown participant',
        };
      })
    );
  }, [eventDetails]);

  const pendingNotifications = allSettlements.filter(
    (settlement) =>
      settlement.confirmation === 'pending_confirmation'
  );

  const categoryTotals = useMemo(() => {
    const totals = {};

    allExpenses.forEach((expense) => {
      const category = expense.category || 'Other';
      totals[category] =
        (totals[category] || 0) + Number(expense.amountPaise || 0);
    });

    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [allExpenses]);

  const largestEvent = useMemo(() => {
    if (!events.length) return null;

    return events.reduce((largest, event) =>
      Number(event.totalExpensePaise || 0) >
      Number(largest.totalExpensePaise || 0)
        ? event
        : largest
    );
  }, [events]);

  const handleProfileChange = (event) => {
    const { name, value } = event.target;

    setProfileForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleProfileSave = async (event) => {
    event.preventDefault();

    setProfileSaving(true);
    setProfileError('');
    setProfileSuccess('');

    try {
      const response = await api.updateMe(profileForm);

      if (response.user) {
        updateUser(response.user);
      } else {
        updateUser({ ...user, ...profileForm });
      }

      setProfileSuccess('Your profile has been updated successfully.');
    } catch (error) {
      setProfileError(error.message || 'Could not update your profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  const navigate = (page) => {
    setCurrentPage(page);
    setNotificationOpen(false);
    setProfileError('');
    setProfileSuccess('');
  };

  if (currentPage === 'create-event') {
    return (
      <CreateEvent
        onBack={() => navigate('dashboard')}
        onCreate={handleCreateEvent}
      />
    );
  }

  if (currentPage === 'event-details' && selectedEvent) {
    return (
      <EventDetails
        event={selectedEvent}
        onBack={() => navigate('dashboard')}
        onUpdate={handleUpdateEvent}
      />
    );
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'bi-grid' },
    { id: 'groups', label: 'My Groups', icon: 'bi-people' },
    { id: 'expenses', label: 'Expenses', icon: 'bi-receipt' },
    {
      id: 'settlements',
      label: 'Settlements',
      icon: 'bi-arrow-left-right',
    },
  ];

  const personalItems = [
    { id: 'profile', label: 'My Profile', icon: 'bi-person-circle' },
    { id: 'analytics', label: 'Analytics', icon: 'bi-graph-up' },
    { id: 'settings', label: 'Settings', icon: 'bi-gear' },
  ];

  const renderPageContent = () => {
    if (loading) {
      return (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status" />
          <p className="mt-3">Loading your financial data...</p>
        </div>
      );
    }

    if (currentPage === 'dashboard') {
      return (
        <>
          <div className="row g-3 mb-4">
            {[
              {
                label: 'Total Expenses',
                value: totalExpensesPaise,
                icon: 'bi-wallet2',
                note: 'Across all events',
              },
              {
                label: 'Total Paid',
                value: totalPaidPaise,
                icon: 'bi-credit-card',
                note: 'Your total contributions',
              },
              {
                label: 'Others Owe You',
                value: totalOwedToYou,
                icon: 'bi-arrow-down-left',
                note: 'Across all events',
                amountClass: 'positive-amount',
              },
              {
                label: 'You Owe Others',
                value: totalYouOwe,
                icon: 'bi-arrow-up-right',
                note: 'Across all events',
                amountClass: 'negative-amount',
              },
            ].map((card) => (
              <div className="col-md-6 col-xl-3" key={card.label}>
                <div className="summary-card">
                  <div className="summary-top">
                    <span>{card.label}</span>
                    <i className={`bi ${card.icon}`} />
                  </div>
                  <h3 className={card.amountClass || ''}>
                    {formatCurrency(card.value)}
                  </h3>
                  <small>{card.note}</small>
                </div>
              </div>
            ))}
          </div>

          <div className="row g-4 mb-4">
            <div className="col-lg-6">
              <div className="dashboard-card">
                <div className="card-heading">
                  <div>
                    <h5>People Who Owe You</h5>
                    <p>Money you are yet to receive</p>
                  </div>
                  <span className="balance-icon green">
                    <i className="bi bi-arrow-down-left" />
                  </span>
                </div>

                <div className="table-responsive">
                  <table className="table balance-table">
                    <thead>
                      <tr>
                        <th>PERSON</th>
                        <th>EVENT</th>
                        <th className="text-end">AMOUNT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {peopleWhoOweYou.length ? (
                        peopleWhoOweYou.map((person, index) => (
                          <tr key={`${person.event}-${person.name}-${index}`}>
                            <td><strong>{person.name}</strong></td>
                            <td>{person.event}</td>
                            <td className="text-end positive-amount">
                              +{formatCurrency(person.amount)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="3" className="text-center py-3">
                            No outstanding amounts to receive.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="table-total">
                  <span>Total to receive</span>
                  <strong className="positive-amount">
                    {formatCurrency(totalOwedToYou)}
                  </strong>
                </div>
              </div>
            </div>

            <div className="col-lg-6">
              <div className="dashboard-card">
                <div className="card-heading">
                  <div>
                    <h5>People You Owe</h5>
                    <p>Money you need to pay</p>
                  </div>
                  <span className="balance-icon red">
                    <i className="bi bi-arrow-up-right" />
                  </span>
                </div>

                <div className="table-responsive">
                  <table className="table balance-table">
                    <thead>
                      <tr>
                        <th>PERSON</th>
                        <th>EVENT</th>
                        <th className="text-end">AMOUNT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {peopleYouOwe.length ? (
                        peopleYouOwe.map((person, index) => (
                          <tr key={`${person.event}-${person.name}-${index}`}>
                            <td><strong>{person.name}</strong></td>
                            <td>{person.event}</td>
                            <td className="text-end negative-amount">
                              -{formatCurrency(person.amount)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="3" className="text-center py-3">
                            You don't owe anyone currently.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="table-total">
                  <span>Total to pay</span>
                  <strong className="negative-amount">
                    {formatCurrency(totalYouOwe)}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          <div className="dashboard-card events-card">
            <div className="card-heading">
              <div>
                <h5>Recent Expense Events</h5>
                <p>Your recently created and updated groups</p>
              </div>
              <button
                className="view-all-btn"
                type="button"
                onClick={loadDashboard}
              >
                Refresh <i className="bi bi-arrow-clockwise" />
              </button>
            </div>

            <div className="table-responsive">
              <table className="table events-table">
                <thead>
                  <tr>
                    <th>EVENT NAME</th>
                    <th>DATE</th>
                    <th>MEMBERS</th>
                    <th>TOTAL EXPENSE</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEvents.length ? (
                    recentEvents.map((event) => (
                      <tr
                        key={event._id}
                        onClick={() => openEvent(event)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td><strong>{event.name}</strong></td>
                        <td>{event.displayDate}</td>
                        <td>
                          <i className="bi bi-people me-2" />
                          {event.members}
                        </td>
                        <td>{formatCurrency(event.amount)}</td>
                        <td>
                          <span
                            className={`status-badge ${
                              event.status === 'Settled'
                                ? 'settled'
                                : event.status === 'Pending'
                                  ? 'pending'
                                  : 'partial'
                            }`}
                          >
                            {event.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="text-center py-4">
                        No events yet. Create your first event to get started!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      );
    }

    if (currentPage === 'groups') {
      return (
        <div className="dashboard-card">
          <div className="card-heading">
            <div>
              <h5>All Groups</h5>
              <p>Open a group to view its expenses and balances.</p>
            </div>
            <button
              className="btn create-btn"
              onClick={() => navigate('create-event')}
            >
              <i className="bi bi-plus-lg me-2" />
              Create Group
            </button>
          </div>

          {events.length ? (
            <div className="table-responsive">
              <table className="table events-table">
                <thead>
                  <tr>
                    <th>GROUP NAME</th>
                    <th>DATE</th>
                    <th>MEMBERS</th>
                    <th>TOTAL EXPENSE</th>
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event._id}>
                      <td><strong>{event.name}</strong></td>
                      <td>{formatDate(event.date)}</td>
                      <td>{event.participants?.length || 0}</td>
                      <td>
                        {formatCurrency(event.totalExpensePaise)}
                      </td>
                      <td>
                        <button
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => openEvent(event)}
                        >
                          View Group
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center py-4 mb-0">
              No groups found. Create your first group to get started.
            </p>
          )}
        </div>
      );
    }

    if (currentPage === 'expenses') {
      return (
        <div className="dashboard-card">
          <div className="card-heading">
            <div>
              <h5>All Expenses</h5>
              <p>{allExpenses.length} expense records found.</p>
            </div>
          </div>

          <div className="table-responsive">
            <table className="table events-table">
              <thead>
                <tr>
                  <th>EXPENSE</th>
                  <th>GROUP</th>
                  <th>CATEGORY</th>
                  <th>DATE</th>
                  <th>AMOUNT</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {allExpenses.length ? (
                  allExpenses.map((expense) => {
                    const event = events.find(
                      (item) => String(item._id) === String(expense.eventId)
                    );

                    return (
                      <tr key={expense._id}>
                        <td><strong>{expense.title || 'Expense'}</strong></td>
                        <td>{expense.eventName}</td>
                        <td>{expense.category || 'Other'}</td>
                        <td>{formatDate(expense.date || expense.createdAt)}</td>
                        <td>{formatCurrency(expense.amountPaise)}</td>
                        <td>
                          {event && (
                            <button
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => openEvent(event)}
                            >
                              View
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="6" className="text-center py-4">
                      No expenses recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (currentPage === 'settlements') {
      return (
        <div className="dashboard-card">
          <div className="card-heading">
            <div>
              <h5>All Settlements</h5>
              <p>Payment records across your groups.</p>
            </div>
          </div>

          <div className="table-responsive">
            <table className="table events-table">
              <thead>
                <tr>
                  <th>GROUP</th>
                  <th>PAID BY</th>
                  <th>PAID TO</th>
                  <th>AMOUNT</th>
                  <th>DATE</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {allSettlements.length ? (
                  allSettlements.map((settlement) => (
                    <tr key={settlement._id}>
                      <td>{settlement.eventName}</td>
                      <td>{settlement.payerName}</td>
                      <td>{settlement.receiverName}</td>
                      <td>{formatCurrency(settlement.amountPaise)}</td>
                      <td>{formatDate(settlement.createdAt)}</td>
                      <td>
                        <span
                          className={`status-badge ${
                            settlement.confirmation === 'confirmed'
                              ? 'settled'
                              : settlement.confirmation === 'rejected'
                                ? 'pending'
                                : 'partial'
                          }`}
                        >
                          {settlement.confirmation || 'Pending'}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="text-center py-4">
                      No settlement records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (currentPage === 'profile') {
      return (
        <div className="dashboard-card" style={{ maxWidth: '700px' }}>
          <div className="card-heading">
            <div>
              <h5>Personal Information</h5>
              <p>Update the details associated with your account.</p>
            </div>
          </div>

          {profileError && (
            <div className="alert alert-danger">{profileError}</div>
          )}

          {profileSuccess && (
            <div className="alert alert-success">{profileSuccess}</div>
          )}

          <form onSubmit={handleProfileSave}>
            <div className="mb-3">
              <label className="form-label">Full Name</label>
              <input
                className="form-control"
                name="name"
                value={profileForm.name}
                onChange={handleProfileChange}
                required
              />
            </div>

            <div className="mb-3">
              <label className="form-label">Email Address</label>
              <input
                className="form-control"
                value={user?.email || ''}
                disabled
              />
              <small className="text-muted">
                Email address cannot be changed here.
              </small>
            </div>

            <div className="mb-3">
              <label className="form-label">Phone Number</label>
              <input
                className="form-control"
                name="phone"
                value={profileForm.phone}
                onChange={handleProfileChange}
                placeholder="Enter your phone number"
              />
            </div>

            <div className="mb-4">
              <label className="form-label">UPI ID</label>
              <input
                className="form-control"
                name="upiId"
                value={profileForm.upiId}
                onChange={handleProfileChange}
                placeholder="example@upi"
              />
            </div>

            <button
              className="btn create-btn"
              type="submit"
              disabled={profileSaving}
            >
              {profileSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>
      );
    }

    if (currentPage === 'analytics') {
      return (
        <>
          <div className="row g-3 mb-4">
            <div className="col-md-4">
              <div className="summary-card">
                <div className="summary-top">
                  <span>Total Groups</span>
                  <i className="bi bi-people" />
                </div>
                <h3>{events.length}</h3>
                <small>Groups you can access</small>
              </div>
            </div>

            <div className="col-md-4">
              <div className="summary-card">
                <div className="summary-top">
                  <span>Total Expenses</span>
                  <i className="bi bi-wallet2" />
                </div>
                <h3>{formatCurrency(totalExpensesPaise)}</h3>
                <small>Across all groups</small>
              </div>
            </div>

            <div className="col-md-4">
              <div className="summary-card">
                <div className="summary-top">
                  <span>Expense Records</span>
                  <i className="bi bi-receipt" />
                </div>
                <h3>{allExpenses.length}</h3>
                <small>Recorded transactions</small>
              </div>
            </div>
          </div>

          <div className="dashboard-card mb-4">
            <div className="card-heading">
              <div>
                <h5>Spending by Category</h5>
                <p>Based on your recorded expenses.</p>
              </div>
            </div>

            {categoryTotals.length ? (
              categoryTotals.map(([category, amount]) => {
                const percentage =
                  totalExpensesPaise > 0
                    ? (amount / totalExpensesPaise) * 100
                    : 0;

                return (
                  <div className="mb-3" key={category}>
                    <div className="d-flex justify-content-between mb-1">
                      <strong>{category}</strong>
                      <span>
                        {formatCurrency(amount)} ({percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <div
                      className="progress"
                      role="progressbar"
                      aria-valuenow={percentage}
                      aria-valuemin="0"
                      aria-valuemax="100"
                      style={{ height: '10px' }}
                    >
                      <div
                        className="progress-bar"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="mb-0 text-center py-3">
                Add expenses to see category analytics.
              </p>
            )}
          </div>

          <div className="dashboard-card">
            <div className="card-heading">
              <div>
                <h5>Largest Group by Expense</h5>
                <p>Group with the highest recorded total.</p>
              </div>
            </div>

            {largestEvent ? (
              <div>
                <h4>{largestEvent.name}</h4>
                <h3>{formatCurrency(largestEvent.totalExpensePaise)}</h3>
              </div>
            ) : (
              <p className="mb-0">No group data available yet.</p>
            )}
          </div>
        </>
      );
    }

    if (currentPage === 'settings') {
      return (
        <div className="dashboard-card" style={{ maxWidth: '700px' }}>
          <div className="card-heading">
            <div>
              <h5>Account Settings</h5>
              <p>Manage your account and dashboard.</p>
            </div>
          </div>

          <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 py-3 border-bottom">
            <div>
              <strong>Refresh dashboard data</strong>
              <p className="mb-0 text-muted">
                Fetch the latest groups, expenses and settlements.
              </p>
            </div>
            <button
              className="btn btn-outline-primary"
              onClick={loadDashboard}
              disabled={loading}
            >
              <i className="bi bi-arrow-clockwise me-2" />
              Refresh
            </button>
          </div>

          <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 py-3 border-bottom">
            <div>
              <strong>Personal information</strong>
              <p className="mb-0 text-muted">
                Update your name, phone number and UPI ID.
              </p>
            </div>
            <button
              className="btn btn-outline-primary"
              onClick={() => navigate('profile')}
            >
              Edit Profile
            </button>
          </div>

          <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 py-3">
            <div>
              <strong>Sign out</strong>
              <p className="mb-0 text-muted">
                Sign out of your FairSplit account.
              </p>
            </div>
            <button
              className="btn btn-outline-danger"
              onClick={logout}
            >
              <i className="bi bi-box-arrow-right me-2" />
              Logout
            </button>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <i className="bi bi-wallet2" />
          </div>
          <span>FairSplit</span>
        </div>

        <div className="sidebar-menu">
          <p className="menu-heading">MENU</p>

          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`menu-item ${currentPage === item.id ? 'active' : ''}`}
              onClick={() => navigate(item.id)}
            >
              <i className={`bi ${item.icon}`} />
              {item.label}
            </button>
          ))}

          <p className="menu-heading mt-4">PERSONAL</p>

          {personalItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`menu-item ${currentPage === item.id ? 'active' : ''}`}
              onClick={() => navigate(item.id)}
            >
              <i className={`bi ${item.icon}`} />
              {item.label}
            </button>
          ))}
        </div>

        <div className="sidebar-bottom">
          <div className="user-mini">
            <button
              type="button"
              className="avatar"
              aria-label="Open profile"
              onClick={() => navigate('profile')}
            >
              {(user?.name || 'U').charAt(0).toUpperCase()}
            </button>

            <div>
              <h6>{user?.name || 'User'}</h6>
              <small>Personal Account</small>
            </div>

            <button
              type="button"
              className="btn btn-sm"
              aria-label="Open settings"
              onClick={() => navigate('settings')}
            >
              <i className="bi bi-three-dots" />
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <h4>{pageInfo[currentPage]?.title || 'Dashboard'}</h4>
            <p>
              {pageInfo[currentPage]?.subtitle ||
                'Manage your shared expenses.'}
            </p>
          </div>

          <div className="topbar-actions" style={{ position: 'relative' }}>
            <button
              className="icon-button"
              type="button"
              aria-label="Notifications"
              aria-expanded={notificationOpen}
              onClick={() => setNotificationOpen((open) => !open)}
            >
              <i className="bi bi-bell" />
              {pendingNotifications.length > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '2px',
                    right: '2px',
                    width: '9px',
                    height: '9px',
                    borderRadius: '50%',
                    background: '#dc3545',
                  }}
                />
              )}
            </button>

            {notificationOpen && (
              <div
                className="notification-panel"
                role="dialog"
                aria-label="Notifications"
              >
                <div className="notification-panel-heading">
                  <div>
                    <h5>Notifications</h5>
                    <p>
                      {pendingNotifications.length} pending confirmation(s)
                    </p>
                  </div>
                </div>

                {pendingNotifications.length ? (
                  pendingNotifications.slice(0, 5).map((settlement) => (
                    <div key={settlement._id} className="notification-item">
                      <i className="bi bi-bell" aria-hidden="true" />
                      <div>
                        <strong>{settlement.eventName}</strong>
                        <p>
                          {settlement.payerName} paid{' '}
                          {settlement.receiverName}
                          <br />
                          {formatCurrency(settlement.amountPaise)}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="notification-empty">
                    No pending notifications.
                  </p>
                )}

                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary w-100 mt-2"
                  onClick={() => navigate('settlements')}
                >
                  View Settlements
                </button>
              </div>
            )}

            <button
              type="button"
              className="profile-avatar"
              aria-label="Open profile"
              onClick={() => navigate('profile')}
            >
              {(user?.name || 'U').charAt(0).toUpperCase()}
            </button>
          </div>
        </header>

        <div className="dashboard-content">
          <div className="section-header">
            <div>
              <h3>
                {currentPage === 'dashboard'
                  ? 'Financial Overview'
                  : pageInfo[currentPage]?.title}
              </h3>
              <p>
                {currentPage === 'dashboard'
                  ? 'Track your shared expenses and settlements.'
                  : pageInfo[currentPage]?.subtitle}
              </p>
            </div>

            {['dashboard', 'groups'].includes(currentPage) && (
              <button
                className="btn create-btn"
                onClick={() => navigate('create-event')}
              >
                <i className="bi bi-plus-lg me-2" />
                Create New Event
              </button>
            )}
          </div>

          {loadError && (
            <div className="alert alert-danger" role="alert">
              {loadError}
              <button
                type="button"
                className="btn btn-sm btn-outline-danger ms-3"
                onClick={loadDashboard}
              >
                Retry
              </button>
            </div>
          )}

          {renderPageContent()}
        </div>
      </main>
    </div>
  );
}

export default App;
