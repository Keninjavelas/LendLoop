import mongoose from 'mongoose';

export class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function notFound(req, res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

function duplicateKeyMessage(err) {
  const field = Object.keys(err.keyPattern || {})[0] || 'field';
  if (field === 'email') return 'An account with that email already exists';
  if (field === 'itemId') return 'An active loan already exists for this item';
  return `Duplicate value for ${field}`;
}

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
export function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode ?? err.status ?? 500;
  let message = err.message || 'Something went wrong';

  if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    message = Object.values(err.errors)[0]?.message || 'Validation failed';
  } else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = `Invalid value for ${err.path}`;
  } else if (err.code === 11000) {
    statusCode = 409;
    message = duplicateKeyMessage(err);
  }

  if (statusCode >= 500) console.error(err);

  res.status(statusCode).json({
    message: statusCode >= 500 && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : message,
  });
}
