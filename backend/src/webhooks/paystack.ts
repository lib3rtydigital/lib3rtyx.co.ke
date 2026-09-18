import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { db } from '../db/index.js';
import { checkoutSessions, orderItems, orders } from '../db/schema.js';
import { getEnv } from '../lib/env.js';

function headerString(headers: Request['headers'], name: string) {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function checkoutSessionIdFromMetadata(data: Record<string, unknown>) {
  const metadata = data.metadata;
  if (!metadata || typeof metadata !== 'object') return undefined;
  const sessionId = (metadata as Record<string, unknown>).checkout_session_id;
  return typeof sessionId === 'string' ? sessionId : undefined;
}

async function alreadyPaid(paystackReference?: string) {
  if (!paystackReference) return false;

  const [row] = await db
    .select()
    .from(orders)
    .where(eq(orders.paystackReference, paystackReference))
    .limit(1);

  return row?.status === 'paid';
}

async function fulfillCheckoutSession(sessionId: string, paystackReference: string | undefined) {
  return await db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(checkoutSessions)
      .where(eq(checkoutSessions.id, sessionId))
      .for('update');

    if (!session) return false;

    const [order] = await tx
      .insert(orders)
      .values({
        userId: session.userId,
        status: 'paid',
        totalCents: session.totalCents,
        paystackReference: paystackReference ?? null,
      })
      .returning();

    if (session.lines.length) {
      await tx.insert(orderItems).values(
        session.lines.map((line) => ({
          orderId: order.id,
          productId: line.productId,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
        }))
      );
    }

    await tx.delete(checkoutSessions).where(eq(checkoutSessions.id, sessionId));
    return true;
  });
}

export async function paystackWebhookHandler(req: Request, res: Response) {
  const env = getEnv();

  try {
    if (!env.PAYSTACK_SECRET_KEY) {
      res.status(503).send('Paystack webhooks not configured');
      return;
    }

    // Must be the raw body (Buffer) for signature verification
    const raw = req.body instanceof Buffer ? req.body : Buffer.from(String(req.body));

    const signature = headerString(req.headers, 'x-paystack-signature');
    if (!signature) {
      res.status(400).json({ error: 'Missing x-paystack-signature header' });
      return;
    }

    const hash = crypto.createHmac('sha512', env.PAYSTACK_SECRET_KEY).update(raw).digest('hex');

    if (hash !== signature) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const event = JSON.parse(raw.toString('utf8')) as {
      event: string;
      data?: Record<string, unknown>;
    };

    // Successful charge
    if (event.event === 'charge.success' && event.data) {
      const data = event.data;

      const paystackReference = typeof data.reference === 'string' ? data.reference : undefined;

      // Extra safety: only fulfill on successful status
      if (data.status !== 'success') {
        res.json({ ok: true, ignored: true });
        return;
      }

      if (await alreadyPaid(paystackReference)) {
        res.json({ ok: true, duplicate: true });
        return;
      }

      const sessionId = checkoutSessionIdFromMetadata(data);

      if (sessionId) {
        const ok = await fulfillCheckoutSession(sessionId, paystackReference);

        if (ok) {
          res.json({ ok: true });
          return;
        }

        // Race condition: another worker may have already fulfilled it
        if (await alreadyPaid(paystackReference)) {
          res.json({ ok: true, duplicate: true });
          return;
        }

        console.error('Paystack charge.success: could not fulfill checkout session', {
          sessionId,
          paystackReference,
        });
        res.status(500).json({ error: 'Checkout fulfillment failed' });
        return;
      }
    }

    // Acknowledge other events so Paystack doesn't retry unnecessarily
    res.json({ ok: true });
  } catch (err) {
    console.error('Paystack webhook error', err);
    res.status(400).json({ error: 'Invalid webhook' });
  }
}
