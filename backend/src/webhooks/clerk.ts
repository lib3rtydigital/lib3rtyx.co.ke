
import { verifyWebhook } from "@clerk/backend/webhooks";
import { eq } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { db } from '../db';
import { users } from '../db/schema';
import { getEnv } from '../lib/env';
import { parseRole } from '../lib/roles';

export async function clerkWebhookHandler(req: Request, res: Response) {
  const env = getEnv();

  try {
    console.log('[Clerk Webhook] Received webhook event');

    // Clerk's verifier expects a Web Request with the raw body; Express may give Buffer or string.
    const payload = req.body instanceof Buffer ? req.body.toString('utf8') : String(req.body);

    const request = new Request('http://internal/webhooks/clerk', {
      method: 'POST',
      headers: new Headers(req.headers as HeadersInit),
      body: payload,
    });

    // Verify the webhook signature
    let evt;
    try {
      evt = await verifyWebhook(request, { signingSecret: env.CLERK_WEBHOOK_SECRET });
    } catch (verifyErr) {
      console.error('[Clerk Webhook] Signature verification failed:', verifyErr);
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    console.log('[Clerk Webhook] Event type:', evt.type);

    if (evt.type === 'user.created' || evt.type === 'user.updated') {
      const u = evt.data;

      const email =
        u.email_addresses?.find((e) => e.id === u.primary_email_address_id)?.email_address ??
        u.email_addresses?.[0]?.email_address;

      const displayName =
        [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || null;

      const role = parseRole(u.public_metadata?.role);

      console.log('[Clerk Webhook] Syncing user:', { clerkUserId: u.id, email, displayName, role });

      await db
        .insert(users)
        .values({
          clerkUserId: u.id,
          email,
          displayName,
          role,
        })
        .onConflictDoUpdate({
          target: users.clerkUserId,
          set: { email, displayName, role, updatedAt: new Date() },
        });

      console.log('[Clerk Webhook] User synced successfully:', u.id);
    }

    if (evt.type === 'user.deleted') {
      const id = evt.data.id;
      if (id) {
        console.log('[Clerk Webhook] Deleting user:', id);
        await db.delete(users).where(eq(users.clerkUserId, id));
        console.log('[Clerk Webhook] User deleted successfully:', id);
      }
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('[Clerk Webhook] Unexpected error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
