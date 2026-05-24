import { clerkMiddleware } from '@clerk/express';
import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import { getEnv } from './lib/env';
import { clerkWebhookHandler } from './webhooks/clerk';

const env = getEnv();
const app = express();
const rawJson = express.raw({ type: 'application/json', limit: '1mb' });

app.post('/webhook/clerk', rawJson, (req, res) => {
  return clerkWebhookHandler(req, res);
});

app.use(express.json());
app.use(cors());
app.use(clerkMiddleware());

app.listen(env.PORT, () => console.log(`listening on port: ${env.PORT}`));
