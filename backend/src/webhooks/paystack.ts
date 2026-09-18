import { eq } from 'drizzle-orm';
import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import { db } from '../db';
import { checkoutSessions } from '../db/schema';
import { getEnv } from '../lib/env';

export async function paystackWebhookHandler(req: Request, res: Response) {
  const env = getEnv();
  const signature = req.header('x-paystack-signature');
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  const expected = crypto.createHmac('sha512', env.PAYSTACK_SECRET_KEY ?? '').update(rawBody).digest('hex');

  const signatureBuffer = signature ? Buffer.from(signature) : Buffer.alloc(0);
  const expectedBuffer = Buffer.from(expected);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  const event = JSON.parse(rawBody.toString('utf8')) as {
    event?: string;
    data?: { reference?: string; status?: string; amount?: number; currency?: string };
  };

  if (event.event === 'charge.success' && event.data?.reference) {
    const payment = event.data;
      const reference = payment.reference;
    if (!reference) {
      res.status(200).json({ received: true });
      return;
    }
    const [session] = await db
      .select({ id: checkoutSessions.id, totalCents: checkoutSessions.totalCents, currency: checkoutSessions.currency })
      .from(checkoutSessions)
      .where(eq(checkoutSessions.paystackReference, reference))
      .limit(1);

    if (session && payment.amount === session.totalCents && payment.currency === session.currency) {
      await db
        .update(checkoutSessions)
        .set({ paymentStatus: 'paid', paidAt: new Date() })
        .where(eq(checkoutSessions.id, session.id));
    }
  }

  res.status(200).json({ received: true });
}
