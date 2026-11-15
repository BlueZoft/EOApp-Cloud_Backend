const mongoose = require('mongoose');
async function connectDB(uri) {
  if (!uri) throw new Error('MONGO_URI is required');
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  await require('../Models/inquiryModel').init();
}
module.exports = connectDB;
