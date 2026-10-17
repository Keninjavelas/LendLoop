import mongoose from 'mongoose';
import { ApiError } from './errorMiddleware.js';

export function validateObjectId(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return next(new ApiError(400, 'Malformed id in request path'));
  }
  next();
}
