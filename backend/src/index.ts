import { clerkMiddleware } from '@clerk/express';
import cors from 'cors';
import 'dotenv/config';
import express from 'express';

import fs from 'node:fs';
import path from 'node:path';

import { getEnv } from './lib/env';
import { clerkWebhookHandler } from './webhooks/clerk';
import keepAlivecron from"./lib/cron";

const env = getEnv();
const app = express();
const rawJson = express.raw({ type: 'application/json', limit: '1mb' });

app.post('/webhook/clerk', rawJson, (req, res) => {
  return clerkWebhookHandler(req, res);
});

app.use(express.json());
app.use(cors());
app.use(clerkMiddleware());
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const publicDir = path.join(process.cwd(), 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));

  app.get('/{*any}', (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }

    res.sendFile(path.join(publicDir, 'index.html'), (err) => next(err));
  });
}
app.listen(env.PORT, () => {
  console.log(`listening on port: ${env.PORT}`);
  if (env.NODE_ENV === 'production'){
  keepAlivecron.start();
  }
});
