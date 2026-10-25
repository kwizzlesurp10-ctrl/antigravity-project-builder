/**
 * Browser-safe admin auth header for protected API routes.
 * Set NEXT_PUBLIC_API_ADMIN_SECRET to the same value as API_ADMIN_SECRET
 * so the orbital UI can call gated endpoints.
 */
export function getAdminAuthHeaders(): Record<string, string> {
  const secret = process.env.NEXT_PUBLIC_API_ADMIN_SECRET?.trim();
  if (!secret) return {};
  return { 'x-admin-secret': secret };
}

export function withAdminAuthHeaders(init?: HeadersInit): HeadersInit {
  const admin = getAdminAuthHeaders();
  if (!init) return admin;
  if (init instanceof Headers) {
    const merged = new Headers(init);
    for (const [k, v] of Object.entries(admin)) merged.set(k, v);
    return merged;
  }
  if (Array.isArray(init)) {
    return [...init, ...Object.entries(admin)];
  }
  return { ...init, ...admin };
}
