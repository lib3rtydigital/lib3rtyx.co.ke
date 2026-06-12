import type { NextFunction, Request, Response } from 'express';

export function sentryClerkUserMiddleware(
  _req: Request,
  _res: Response,
  next: NextFunction,
) {
  next();
}
