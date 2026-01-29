import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Note: This middleware runs on the edge and cannot access Firebase Auth directly.
// Authentication is primarily handled client-side in the AuthProvider and layout components.
// This middleware handles simple redirect logic.

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Redirect root to home (which will then check auth)
  if (pathname === '/') {
    // Let it through - the protected layout will handle auth
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*|public).*)',
  ],
};