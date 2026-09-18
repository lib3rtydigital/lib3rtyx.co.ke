import { getAuth } from "@clerk/express";
import { and, eq, inArray } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import z from "zod";
import { db } from "../db";
import { CheckoutSessionLine, checkoutSessions, products } from "../db/schema";
import { getEnv } from "../lib/env";
import { paystackInitialize, paystackVerify } from "../lib/paystack";
import { getLocalUser } from "../lib/users";

const env = getEnv();

const cartSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
});

export async function createCheckout(req: Request, res: Response, next: NextFunction) {
  try {
    // only signed-in users can start checkout
    const { userId, isAuthenticated } = getAuth(req);
    if (!isAuthenticated || !userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const parsed = cartSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid cart", details: parsed.error.flatten() });
      return;
    }

    if (!env.PAYSTACK_SECRET_KEY) {
      res.status(503).json({ error: "Payments are not configured" });
      return;
    }

    const localUser = await getLocalUser(userId);
    if (!localUser) {
      res.status(503).json({ error: "Account not synced yet" });
      return;
    }

    const ids = parsed.data.items.map((i) => i.productId);

    // load every cart product that exists, is active, and matches the IDs we asked for.
    const prodRows = await db
      .select()
      .from(products)
      .where(and(inArray(products.id, ids), eq(products.active, true)));

    if (prodRows.length !== ids.length) {
      res.status(400).json({ error: "One or more products are invalid" });
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

    if (totalCents < 10) {
      res.status(400).json({
        error: "Total must be greater than zero",
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

    const checkout = await paystackInitialize(env, {
      email: localUser.email,
      amount: totalCents,
      currency: env.PAYSTACK_CURRENCY,
      callbackUrl: `${env.FRONTEND_URL ?? ""}/checkout/return`,
      reference: session.id,
      metadata: { checkout_session_id: session.id, clerk_user_id: userId },
    });

    await db
      .update(checkoutSessions)
      .set({ paystackReference: checkout.reference })
      .where(eq(checkoutSessions.id, session.id));

    res.json({ checkoutUrl: checkout.authorization_url, reference: checkout.reference });
  } catch (e) {
    next(e);
  }
}

export async function verifyCheckout(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, isAuthenticated } = getAuth(req);
    if (!isAuthenticated || !userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const reference = typeof req.query.reference === "string" ? req.query.reference : "";
    if (!reference || !env.PAYSTACK_SECRET_KEY) {
      res.status(400).json({ error: "A Paystack reference is required" });
      return;
    }

    const localUser = await getLocalUser(userId);
    const [session] = await db
      .select()
      .from(checkoutSessions)
      .where(and(eq(checkoutSessions.paystackReference, reference), localUser ? eq(checkoutSessions.userId, localUser.id) : eq(checkoutSessions.userId, "00000000-0000-0000-0000-000000000000")))
      .limit(1);

    if (!session) {
      res.status(404).json({ error: "Checkout session not found" });
      return;
    }

    const payment = await paystackVerify(env, reference);
    const paid = payment.status === "success" && payment.amount === session.totalCents && payment.currency === session.currency;
    await db
      .update(checkoutSessions)
      .set({ paymentStatus: paid ? "paid" : "failed", ...(paid ? { paidAt: new Date() } : {}) })
      .where(eq(checkoutSessions.id, session.id));

    res.json({ paid, reference: payment.reference });
  } catch (e) {
    next(e);
  }
}
