
const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const getToken = () => localStorage.getItem('fairsplit_token');

export const setToken = (token) => {
  if (token) {
    localStorage.setItem('fairsplit_token', token);
  } else {
    localStorage.removeItem('fairsplit_token');
  }
};

const request = async (endpoint, options = {}) => {
  const token = getToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;

  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error(
      'Cannot connect to the FairSplit server. Please check that the backend is running.'
    );
  }

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.message || 'Something went wrong. Please try again.');
  }

  return data;
};

export const api = {
  // Authentication
  register: (userData) =>
    request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    }),

  login: (credentials) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),

  getMe: () => request('/auth/me'),

  logout: () =>
    request('/auth/logout', {
      method: 'POST',
    }),

  updateMe: (userData) =>
    request('/auth/me', {
      method: 'PUT',
      body: JSON.stringify(userData),
    }),

  // Events
  getEvents: () => request('/events'),

  createEvent: (eventData) =>
    request('/events', {
      method: 'POST',
      body: JSON.stringify(eventData),
    }),

  getEvent: (eventId) => request(`/events/${eventId}`),

  updateEvent: (eventId, eventData) =>
    request(`/events/${eventId}`, {
      method: 'PUT',
      body: JSON.stringify(eventData),
    }),

  deleteEvent: (eventId) =>
    request(`/events/${eventId}`, {
      method: 'DELETE',
    }),

  getBalances: (eventId) =>
    request(`/events/${eventId}/balances`),

  // Expenses
  getExpenses: (eventId) =>
    request(`/events/${eventId}/expenses`),

  createExpense: (eventId, expenseData) =>
    request(`/events/${eventId}/expenses`, {
      method: 'POST',
      body: JSON.stringify(expenseData),
    }),

  updateExpense: (eventId, expenseId, expenseData) =>
    request(`/events/${eventId}/expenses/${expenseId}`, {
      method: 'PUT',
      body: JSON.stringify(expenseData),
    }),

  deleteExpense: (eventId, expenseId) =>
    request(`/events/${eventId}/expenses/${expenseId}`, {
      method: 'DELETE',
    }),

  // Settlements
  getSettlements: (eventId) =>
    request(`/events/${eventId}/settlements`),

  createSettlement: (eventId, settlementData) =>
    request(`/events/${eventId}/settlements`, {
      method: 'POST',
      body: JSON.stringify(settlementData),
    }),

  confirmSettlement: (eventId, settlementId, action) =>
    request(`/events/${eventId}/settlements/${settlementId}/confirm`, {
      method: 'PATCH',
      body: JSON.stringify({ action }),
    }),
};
