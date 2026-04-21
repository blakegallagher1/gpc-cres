"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import * as Sentry from "@sentry/nextjs";
import { type ReadonlyURLSearchParams, usePathname, useSearchParams } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import {
  createViewId,
  installGlobalBrowserTelemetry,
  recordNavigationEvent,
  type ClientTelemetryContext,
} from "./client-telemetry";
import { DevClientErrorPanel } from "./dev-client-error-panel";

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
  const { userId, orgId } = useAuth();
  const { user } = useUser();
  const userEmail = user?.primaryEmailAddress?.emailAddress ?? null;
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
    userId: userId ?? null,
    userEmail,
    orgId: orgId ?? null,
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
      userId: userId ?? null,
      userEmail,
      orgId: orgId ?? null,
    };
  }, [route, userEmail, userId, orgId, activeViewId]);

  useEffect(() => {
    if (userId || userEmail) {
      Sentry.setUser({
        id: userId ?? undefined,
        email: userEmail ?? undefined,
      });
    } else {
      Sentry.setUser(null);
    }

    Sentry.setTag("orgId", orgId ?? "anonymous");
    Sentry.setTag("route", route);
  }, [route, userEmail, userId, orgId]);

  useEffect(() => {
    if (!orgId) {
      return;
    }

    const lastNavigation = lastNavigationRef.current;
    if (lastNavigation.route === route && lastNavigation.orgId === orgId) {
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
    lastNavigationRef.current = { route, orgId };
  }, [route, orgId]);

  return null;
}

export function ObservabilityProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <ObservabilityLifecycle />
      </Suspense>
      <DevClientErrorPanel />
    </>
  );
}
