import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  recordTelemetry,
  recordStripeWebhookEvent,
  listStripeWebhookEvents,
} from '@/lib/db/sqlite-engine';

function verifyStripeSignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((item) => {
      const [k, v] = item.trim().split('=');
      return [k, v];
    })
  );
  const timestamp = parts.t;
  const v1 = parts.v1;
  if (!timestamp || !v1) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(v1, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export async function GET() {
  const events = listStripeWebhookEvents(25);
  return NextResponse.json({ status: 'online', events }, { status: 200 });
}

export async function PUT(request: Request) {
  const start = performance.now();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_orbital_test_secret';

  try {
    const body = (await request.json().catch(() => ({}))) as {
      eventType?: string;
      customerEmail?: string;
      eventId?: string;
    };
    const eventId = body.eventId?.trim() || `evt_orbital_${Date.now()}`;
    const eventType = body.eventType?.trim() || 'checkout.session.completed';
    const customerEmail = body.customerEmail?.trim() || 'architect@antigravity.dev';
    const status =
      eventType === 'customer.subscription.deleted'
        ? 'canceled'
        : eventType === 'customer.subscription.updated'
          ? 'past_due'
          : 'active';

    const payloadObj = {
      id: eventId,
      type: eventType,
      data: {
        object: {
          customer_email: customerEmail,
          status,
        },
      },
    };
    const rawBody = JSON.stringify(payloadObj);
    const timestamp = Math.floor(Date.now() / 1000);
    const v1 = crypto
      .createHmac('sha256', webhookSecret)
      .update(`${timestamp}.${rawBody}`, 'utf8')
      .digest('hex');
    const signatureHeader = `t=${timestamp},v1=${v1}`;

    const isVerified = verifyStripeSignature(rawBody, signatureHeader, webhookSecret);
    const stored = recordStripeWebhookEvent({
      eventId,
      eventType,
      customerEmail,
      subscriptionStatus: status,
      payload: payloadObj,
      verified: isVerified,
    });

    recordTelemetry({
      eventType: `STRIPE_${eventType.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`,
      projectName: customerEmail,
      moduleCount: 1,
      filesCount: 1,
      bundleBytes: Buffer.byteLength(rawBody, 'utf8'),
      durationMs: performance.now() - start,
    });

    return NextResponse.json(
      {
        received: true,
        verified: isVerified,
        simulatedDispatch: true,
        id: eventId,
        type: eventType,
        idempotentReplay: stored.idempotentReplay,
        subscriptionStatus: stored.record.subscriptionStatus,
        signatureHeader,
        event: stored.record,
      },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to dispatch signed webhook: ${String(err)}` },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  const start = performance.now();
  const signature = request.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_orbital_test_secret';

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    );
  }

  const rawBody = await request.text();
  const isVerified = verifyStripeSignature(rawBody, signature, webhookSecret);

  if (!isVerified) {
    return NextResponse.json(
      { error: 'Webhook cryptographic signature verification failed' },
      { status: 400 }
    );
  }

  try {
    const event = JSON.parse(rawBody) as {
      id?: string;
      type?: string;
      data?: { object?: { customer_email?: string; id?: string; status?: string } };
    };
    const eventId = event.id ?? `evt_orbital_${Date.now()}`;
    const eventType = event.type || 'unknown';
    const customerEmail = event.data?.object?.customer_email || event.id || 'stripe-webhook';

    const stored = recordStripeWebhookEvent({
      eventId,
      eventType,
      customerEmail,
      subscriptionStatus: event.data?.object?.status,
      payload: event as unknown as Record<string, unknown>,
      verified: true,
    });

    recordTelemetry({
      eventType: `STRIPE_${eventType.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`,
      projectName: customerEmail,
      moduleCount: 1,
      filesCount: 1,
      bundleBytes: Buffer.byteLength(rawBody, 'utf8'),
      durationMs: performance.now() - start,
    });

    switch (eventType) {
      case 'checkout.session.completed':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        return NextResponse.json(
          {
            received: true,
            verified: true,
            id: eventId,
            type: eventType,
            idempotentReplay: stored.idempotentReplay,
            subscriptionStatus: stored.record.subscriptionStatus,
          },
          { status: 200 }
        );
      default:
        return NextResponse.json(
          {
            received: true,
            verified: true,
            unhandled: eventType,
            idempotentReplay: stored.idempotentReplay,
          },
          { status: 200 }
        );
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Invalid webhook JSON payload: ${String(err)}` },
      { status: 400 }
    );
  }
}
