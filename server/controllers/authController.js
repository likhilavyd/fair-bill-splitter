const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const generateToken = require('../utils/generateToken');

// POST /api/auth/register
const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    res.status(400);
    throw new Error('Name, email and password are required');
  }
  if (password.length < 8) {
    res.status(400);
    throw new Error('Password must be at least 8 characters');
  }

  const exists = await User.findOne({ email: email.toLowerCase().trim() });
  if (exists) {
    res.status(409);
    throw new Error('An account with this email already exists');
  }

  const user = await User.create({ name, email, password });
  res.status(201).json({ token: generateToken(user._id), user });
});

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400);
    throw new Error('Email and password are required');
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');

  // Same message for wrong email and wrong password, so attackers learn nothing
  if (!user || !(await user.matchPassword(password))) {
    res.status(401);
    throw new Error('Invalid email or password');
  }

  res.json({ token: generateToken(user._id), user });
});

// POST /api/auth/logout
// JWTs are stateless: the frontend logs out by deleting its stored token
const logout = (req, res) => {
  res.json({ message: 'Logged out. Delete the token on the client.' });
};

// GET /api/auth/me
const getMe = (req, res) => {
  res.json({ user: req.user });
};

// PUT /api/auth/me
const updateMe = asyncHandler(async (req, res) => {
  const allowed = ['name', 'phone', 'profileImage', 'upiId', 'upiQrImage'];
  allowed.forEach((field) => {
    if (req.body[field] !== undefined) req.user[field] = req.body[field];
  });

  await req.user.save();
  res.json({ user: req.user });
});

module.exports = { register, login, logout, getMe, updateMe };