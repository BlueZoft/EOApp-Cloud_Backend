function loadConfig(env = process.env) {
  const port = Number(env.PORT || 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  if (env.SMTP_ENABLED && !['true', 'false'].includes(env.SMTP_ENABLED)) throw new Error('SMTP_ENABLED must be true or false');
  const smtpEnabled = env.SMTP_ENABLED === 'true';
  if (smtpEnabled && ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM', 'SMTP_TO'].some(k => !env[k])) {
    throw new Error('SMTP configuration is incomplete');
  }
  if (smtpEnabled && ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM', 'SMTP_TO'].some(k => /example\.invalid|REPLACE_WITH/i.test(env[k]))) {
    throw new Error('Replace SMTP placeholders before enabling email');
  }
  const smtpPort = Number(env.SMTP_PORT || 465);
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) throw new Error('Invalid SMTP_PORT');
  return { port, mongoUri: env.MONGO_URI, origins: (env.CORS_ORIGINS || 'http://localhost:8080').split(',').map(s => s.trim()),
    smtpEnabled, smtp: { host: env.SMTP_HOST, port: smtpPort, secure: smtpPort === 465,
      requireTLS: smtpPort !== 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000 },
    mailFrom: env.SMTP_FROM, mailTo: env.SMTP_TO };
}
module.exports = { loadConfig };
