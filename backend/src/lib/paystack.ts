import type { Env } from './env';

type PaystackResponse<T> = {
  status: boolean;
  message: string;
  data: T;
};

export type PaystackTransaction = {
  authorization_url: string;
  access_code: string;
  reference: string;
};

export type PaystackVerification = {
  status: 'success' | 'failed' | 'abandoned' | string;
  reference: string;
  amount: number;
  currency: string;
};

async function paystackRequest<T>(env: Env, path: string, body?: object) {
  if (!env.PAYSTACK_SECRET_KEY) {
    throw new Error('Paystack is not configured');
  }

  const response = await fetch(`https://api.paystack.co${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const result = (await response.json()) as PaystackResponse<T>;
  if (!response.ok || !result.status) {
    throw new Error(result.message || 'Paystack request failed');
  }

  return result.data;
}

export function paystackInitialize(
  env: Env,
  input: { email: string; amount: number; currency: string; callbackUrl: string; reference: string; metadata: object },
) {
  return paystackRequest<PaystackTransaction>(env, '/transaction/initialize', {
    email: input.email,
    amount: input.amount,
    currency: input.currency,
    callback_url: input.callbackUrl,
    reference: input.reference,
    metadata: input.metadata,
  });
}

export function paystackVerify(env: Env, reference: string) {
  return paystackRequest<PaystackVerification>(
    env,
    `/transaction/verify/${encodeURIComponent(reference)}`,
  );
}
