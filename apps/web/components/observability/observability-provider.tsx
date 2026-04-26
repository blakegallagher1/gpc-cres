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

const LOCAL_AUTH_BYPASS = process.env.NEXT_PUBLIC_DISABLE_AUTH === "true";

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

  if (LOCAL_AUTH_BYPASS) {
    return (
      <TelemetryLifecycle
        pathname={pathname}
        searchParams={searchParams}
        userId={null}
        userEmail={null}
        orgId={null}
        fallbackOrgTag="local-dev"
      />
    );
  }

  return (
    <ClerkObservabilityLifecycle
      pathname={pathname}
      searchParams={searchParams}
    />
  );
}

function ClerkObservabilityLifecycle({
  pathname,
  searchParams,
}: {
  pathname: string | null;
  searchParams: ReadonlyURLSearchParams | null;
}) {
  const { userId, orgId } = useAuth();
  const { user } = useUser();
  const userEmail = user?.primaryEmailAddress?.emailAddress ?? null;

  return (
    <TelemetryLifecycle
      pathname={pathname}
      searchParams={searchParams}
      userId={userId ?? null}
      userEmail={userEmail}
      orgId={orgId ?? null}
      fallbackOrgTag="anonymous"
    />
  );
}

function TelemetryLifecycle({
  pathname,
  searchParams,
  userId,
  userEmail,
  orgId,
  fallbackOrgTag,
}: {
  pathname: string | null;
  searchParams: ReadonlyURLSearchParams | null;
  userId: string | null;
  userEmail: string | null;
  orgId: string | null;
  fallbackOrgTag: "anonymous" | "local-dev";
}) {
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
    userId,
    userEmail,
    orgId,
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
      userId,
      userEmail,
      orgId,
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

    Sentry.setTag("orgId", orgId ?? fallbackOrgTag);
    Sentry.setTag("route", route);
  }, [route, userEmail, userId, orgId, fallbackOrgTag]);

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
