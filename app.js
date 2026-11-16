const express = require('express');
const cors = require('cors');
const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const Inquiry = require('./Models/inquiryModel');
const { validateInquiry } = require('./validation/inquiry');
const { createInquiryService } = require('./services/inquiries');
const { errorHandler } = require('./Middleware/errorMiddleware');
const { rateLimit } = require('./Middleware/rateLimit');
function createApp(config, { Model = Inquiry, ready = () => mongoose.connection.readyState === 1, limiter = rateLimit() } = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxyHops) app.set('trust proxy', config.trustProxyHops);
  app.use(cors({ origin(origin, callback) {
    if (!origin || config.origins.includes(origin)) return callback(null, true);
    callback(Object.assign(new Error('Origin is not allowed'), { status: 403, code: 'ORIGIN_NOT_ALLOWED' }));
  }, credentials: true, allowedHeaders: ['Content-Type', 'Idempotency-Key', 'X-CSRF-Token'], methods: ['GET', 'POST', 'PATCH', 'OPTIONS'] }));
  app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.get('/ready', (req, res) => res.status(ready() ? 200 : 503).json({ status: ready() ? 'ready' : 'unavailable' }));
  app.use(express.json({ limit: '16kb' }));
  const submit = createInquiryService(Model, config.smtpEnabled);
  function route(legacy) {
    return async (req, res, next) => {
      try {
        if (!ready()) throw Object.assign(new Error('Service unavailable'), { status: 503, code: 'NOT_READY' });
        if (!req.is('application/json')) throw Object.assign(new Error('Use application/json'), { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
        const payload = validateInquiry(req.body, legacy);
        const key = req.get('Idempotency-Key') || (legacy ? randomUUID() : '');
        if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw Object.assign(new Error('Supply a 16–128 character Idempotency-Key'), { status: 400, code: 'INVALID_IDEMPOTENCY_KEY' });
        const { doc, replay } = await submit(payload, key);
        if (legacy) res.set('Deprecation', 'true');
        res.status(replay || legacy ? 200 : 201).json({ inquiry: { reference: String(doc._id), status: 'received' } });
      } catch (error) { next(error); }
    };
  }
  app.post('/api/v1/inquiries', limiter, route(false));
  app.post('/api/userdata', limiter, route(true));
  app.use('/api/v1/staff', require('./routes/staff').createStaffRouter(config, ready));
  app.use((req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }));
  app.use(errorHandler);
  return app;
}
module.exports = { createApp };
