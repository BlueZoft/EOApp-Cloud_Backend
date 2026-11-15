function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed') error = { status: 400, code: 'INVALID_JSON', message: 'Malformed JSON body' };
  if (error.type === 'entity.too.large') error = { status: 413, code: 'BODY_TOO_LARGE', message: 'Request body exceeds 16 KiB' };
  const status = error.status >= 400 && error.status <= 599 ? error.status : 500;
  const code = error.code && typeof error.code === 'string' ? error.code : 'INTERNAL_ERROR';
  if (status >= 500) console.error('Request failed', { code: 'INTERNAL_ERROR' });
  res.status(status).json({ error: { code, message: status >= 500 ? 'Unable to process the request' : error.message,
    ...(error.fields ? { fields: error.fields } : {}) } });
}
module.exports = { errorHandler };
