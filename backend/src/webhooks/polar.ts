import type { Request, Response } from 'express';

export async function polarWebhookHandler(req: Request, res: Response) {
  console.log('[Polar Webhook] Received webhook event', { method: req.method, path: req.path });
  res.status(200).json({ success: true });
}
