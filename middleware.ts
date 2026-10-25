import { NextResponse, type NextRequest } from 'next/server';

/**
 * Protect mutating / privileged API surfaces with a server-side admin secret.
 * Clients must send `x-admin-secret` matching `API_ADMIN_SECRET`
 * (browser UI may use the same value via `NEXT_PUBLIC_API_ADMIN_SECRET`).
 *
 * Public:
 *   - /api/health
 *   - /api/ai/stream (rate-limited in-route)
 *   - static pages
 *   - /api/recommend, /api/synthesize, /api/audit, /api/rag (not listed)
 *
 * Stripe webhook POST stays open for Stripe signature verification.
 * Stripe webhook GET requires the admin secret.
 */
const PROTECTED_PREFIXES = [
  '/api/modules/forge',
  '/api/blueprints',
  '/api/deploy/ignition',
  '/api/telemetry',
] as const;

function isProtectedPath(pathname: string, method: string): boolean {
  if (PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return true;
  }

  if (pathname === '/api/webhooks/stripe' || pathname.startsWith('/api/webhooks/stripe/')) {
    return method.toUpperCase() === 'GET';
  }

  return false;
}

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function resolveExpectedSecret(): string | undefined {
  return (
    process.env.API_ADMIN_SECRET?.trim() ||
    process.env.NEXT_PUBLIC_API_ADMIN_SECRET?.trim() ||
    undefined
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  if (!isProtectedPath(pathname, method)) {
    return NextResponse.next();
  }

  const expected = resolveExpectedSecret();
  if (!expected) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'API_ADMIN_SECRET is not configured' },
        { status: 500 }
      );
    }
    // Local/dev without a configured secret keeps the orbital HUD usable.
    return NextResponse.next();
  }

  const provided = request.headers.get('x-admin-secret')?.trim();
  if (!provided || provided !== expected) {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/modules/forge/:path*',
    '/api/blueprints/:path*',
    '/api/deploy/ignition/:path*',
    '/api/telemetry/:path*',
    '/api/webhooks/stripe/:path*',
  ],
};
