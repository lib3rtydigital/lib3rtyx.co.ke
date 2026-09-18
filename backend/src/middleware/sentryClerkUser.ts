import { getAuth } from '@clerk/express';
import * as Sentry from '@sentry/node';
import type { RequestHandler } from 'express';

/** attach Clerk user id to the request isolation scope so errors include who was signed in */
export const sentryClerkUserMiddleware: RequestHandler = (req, _res, next) => {
  const { userId } = getAuth(req);
  Sentry.getIsolationScope().setUser(userId ? { id: userId } : null);
  next();
};
