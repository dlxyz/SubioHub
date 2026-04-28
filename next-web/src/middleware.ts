import { NextResponse, type NextRequest } from 'next/server';
import { isAppLocale } from '@/store/locale';

const defaultLocale = 'zh-CN';

const publicPrefixes = [
  '/',
  '/models',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/news',
];

function hasLocalePrefix(pathname: string) {
  const segment = pathname.split('/')[1];
  return isAppLocale(segment);
}

function resolvePathLocale(pathname: string) {
  const segment = pathname.split('/')[1];
  return isAppLocale(segment) ? segment : defaultLocale;
}

function isPublicPath(pathname: string) {
  return publicPrefixes.some((prefix) => {
    if (prefix === '/') {
      return pathname === '/';
    }
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-subiohub-locale', resolvePathLocale(pathname));

  if (hasLocalePrefix(pathname) || !isPublicPath(pathname)) {
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  const localizedPath = pathname === '/' ? `/${defaultLocale}` : `/${defaultLocale}${pathname}`;
  return NextResponse.redirect(new URL(`${localizedPath}${search}`, request.url));
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};

