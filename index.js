require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const { loadConfig } = require('./config');
const { createApp } = require('./app');
const connectDB = require('./Config/db');
const Inquiry = require('./Models/inquiryModel');
const { createNotificationWorker } = require('./services/notifications');
async function start() {
  const config = loadConfig();
  await connectDB(config.mongoUri);
  const worker = createNotificationWorker(Inquiry, config);
  const server = createApp(config).listen(config.port, () => console.log(`API listening on port ${config.port}`));
  worker.start();
  const shutdown = () => { worker.stop(); server.close(() => { mongoose.disconnect().then(() => process.exit(0)); }); };
  process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
  return { server, worker };
}
if (require.main === module) start().catch(() => { console.error('Startup failed: check database and runtime configuration'); process.exit(1); });
module.exports = { start };
