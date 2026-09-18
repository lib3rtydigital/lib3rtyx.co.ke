import { getAuth } from '@clerk/express';
import { and, eq, inArray } from 'drizzle-orm';
import type { NextFunction, Request, Response } from 'express';
import z from 'zod';
import { db } from '../db/index.js';
import { CheckoutSessionLine, checkoutSessions, orders, products } from '../db/schema.js';
import { getEnv } from '../lib/env.js';
import { paystackInitialize, paystackVerify } from '../lib/paystack.js';
import { getLocalUser } from '../lib/users.js';

const env = getEnv();

const cartSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
});

export async function createCheckout(req: Request, res: Response, _next: NextFunction) {
  try {
    // only signed-in users can start checkout
    const { userId, isAuthenticated } = getAuth(req);
    if (!isAuthenticated || !userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const parsed = cartSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid cart', details: parsed.error.flatten() });
      return;
    }

    if (!env.PAYSTACK_SECRET_KEY) {
      res.status(503).json({ error: 'Payments are not configured' });
      return;
    }

    const localUser = await getLocalUser(userId);
    if (!localUser) {
      res.status(503).json({ error: 'Account not synced yet' });
      return;
    }

    const ids = parsed.data.items.map((i) => i.productId);

    // load every cart product that exists, is active, and matches the IDs we asked for
    const prodRows = await db
      .select()
      .from(products)
      .where(and(inArray(products.id, ids), eq(products.active, true)));

    if (prodRows.length !== ids.length) {
      res.status(400).json({ error: 'One or more products are invalid' });
      return;
    }

    const byId = new Map(prodRows.map((p) => [p.id, p]));
    let totalCents = 0;
    const lines: CheckoutSessionLine[] = [];

    for (const line of parsed.data.items) {
      const p = byId.get(line.productId)!;
      totalCents += p.priceCents * line.quantity;
      lines.push({
        productId: p.id,
        quantity: line.quantity,
        unitPriceCents: p.priceCents,
      });
    }

    // Paystack minimum is typically 100 kobo / 1 NGN equivalent, but keep a small floor in cents
    if (totalCents < 100) {
      res.status(400).json({
        error: 'Total below Paystack minimum (at least 100 cents / 1 unit of major currency)',
      });
      return;
    }

    const [session] = await db
      .insert(checkoutSessions)
      .values({
        userId: localUser.id,
        lines,
        totalCents,
        currency: env.PAYSTACK_CURRENCY,
      })
      .returning();

    const successUrl = `${env.FRONTEND_URL}/checkout/return`;

    const checkout = await paystackInitialize(env, {
      amount: totalCents,
      currency: env.PAYSTACK_CURRENCY,
      email: localUser.email, // Paystack requires customer email
      callbackUrl: successUrl,
      metadata: {
        checkout_session_id: session.id,
        user_id: userId,
        custom_fields: [
          {
            display_name: 'Checkout Session',
            variable_name: 'checkout_session_id',
            value: session.id,
          },
        ],
      },
      reference: session.id,
    });

    await db
      .update(checkoutSessions)
      .set({
        paystackReference: checkout.reference,
      })
      .where(eq(checkoutSessions.id, session.id));

    // Paystack authorization URL
    res.json({ checkoutUrl: checkout.authorization_url });
  } catch (e) {
    _next(e);
  }
}

export async function verifyCheckout(req: Request, res: Response, _next: NextFunction) {
  try {
    const { userId, isAuthenticated } = getAuth(req);
    if (!isAuthenticated || !userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const reference = z.string().min(1).safeParse(req.query.reference);
    if (!reference.success) {
      res.status(400).json({ error: 'A Paystack reference is required' });
      return;
    }

    const localUser = await getLocalUser(userId);
    if (!localUser) {
      res.status(503).json({ error: 'Account not synced yet' });
      return;
    }

    const [order] = await db
      .select({ status: orders.status })
      .from(orders)
      .where(and(eq(orders.paystackReference, reference.data), eq(orders.userId, localUser.id)))
      .limit(1);

    if (order?.status === 'paid') {
      res.json({ paid: true });
      return;
    }

    const payment = await paystackVerify(env, reference.data);
    res.json({ paid: payment.status === 'success', status: payment.status });
  } catch (e) {
    _next(e);
  }
}
