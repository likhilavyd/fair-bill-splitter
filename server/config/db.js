const dns = require('dns');
const mongoose = require('mongoose');

// Some networks block SRV lookups; use public DNS servers instead
dns.setServers(['8.8.8.8', '1.1.1.1']);

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected: ' + conn.connection.host);
    console.log('Database name: ' + conn.connection.name);
  } catch (error) {
    console.error('MongoDB connection failed: ' + error.message);
    process.exit(1);
  }
};

module.exports = connectDB;