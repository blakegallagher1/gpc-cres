"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import * as Sentry from "@sentry/nextjs";
import { type ReadonlyURLSearchParams, usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  createViewId,
  installGlobalBrowserTelemetry,
  recordNavigationEvent,
  type ClientTelemetryContext,
} from "./client-telemetry";

type SessionUser = {
  id?: string | null;
  email?: string | null;
  orgId?: string | null;
};

function buildRoute(
  pathname: string | null,
  searchParams: URLSearchParams | ReadonlyURLSearchParams | null,
): string {
  const nextPathname = pathname ?? "/";
  const query = searchParams?.toString();
  return query ? `${nextPathname}?${query}` : nextPathname;
}

function ObservabilityLifecycle() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const user = (session?.user ?? {}) as SessionUser;
  const route = useMemo(
    () => buildRoute(pathname, searchParams),
    [pathname, searchParams],
  );

  const currentRouteRef = useRef(route);
  const previousRouteRef = useRef<string | null>(null);
  const viewIdRef = useRef<string | null>(null);
  if (!viewIdRef.current) {
    viewIdRef.current = createViewId();
  }
  const activeViewId = viewIdRef.current;
  const lastNavigationRef = useRef<{ route: string | null; orgId: string | null }>({
    route: null,
    orgId: null,
  });
  const currentContextRef = useRef<ClientTelemetryContext>({
    route,
    viewId: activeViewId,
    userId: user.id ?? null,
    userEmail: user.email ?? null,
    orgId: user.orgId ?? null,
  });

  useEffect(() => {
    const restoreTelemetry = installGlobalBrowserTelemetry(() => currentContextRef.current);
    return () => {
      restoreTelemetry();
    };
  }, []);

  useEffect(() => {
    const previousRoute = currentRouteRef.current;
    if (previousRoute !== route) {
      previousRouteRef.current = previousRoute;
      currentRouteRef.current = route;
      viewIdRef.current = createViewId();
    }

    currentContextRef.current = {
      route,
      viewId: viewIdRef.current ?? activeViewId,
      userId: user.id ?? null,
      userEmail: user.email ?? null,
      orgId: user.orgId ?? null,
    };
  }, [route, user.email, user.id, user.orgId]);

  useEffect(() => {
    if (user.id || user.email) {
      Sentry.setUser({
        id: user.id ?? undefined,
        email: user.email ?? undefined,
      });
    } else {
      Sentry.setUser(null);
    }

    Sentry.setTag("orgId", user.orgId ?? "anonymous");
    Sentry.setTag("route", route);
  }, [route, user.email, user.id, user.orgId]);

  useEffect(() => {
    if (!user.orgId) {
      return;
    }

    const lastNavigation = lastNavigationRef.current;
    if (lastNavigation.route === route && lastNavigation.orgId === user.orgId) {
      return;
    }

    const previousRoute = previousRouteRef.current;
    Sentry.addBreadcrumb({
      category: "navigation",
      level: "info",
      data: {
        from: previousRoute,
        to: route,
      },
    });

    void recordNavigationEvent(currentContextRef.current, previousRoute);
    lastNavigationRef.current = { route, orgId: user.orgId };
  }, [route, user.orgId]);

  return null;
}

export function ObservabilityProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <ObservabilityLifecycle />
      </Suspense>
    </>
  );
}
