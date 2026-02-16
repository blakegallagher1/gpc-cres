import * as Sentry from "@sentry/nextjs";

type AutomationTagMeta = {
  handler?: string;
  eventType: string;
  dealId?: string;
  orgId: string;
  status?: string;
};

export function captureAutomationDispatchError(
  error: unknown,
  meta: AutomationTagMeta,
): void {
  Sentry.withScope((scope) => {
    scope.setTags({
      automation: true,
      handler: meta.handler || "dispatchEvent",
      eventType: meta.eventType,
      orgId: meta.orgId,
    });
    scope.setContext("deal", {
      dealId: meta.dealId,
      orgId: meta.orgId,
      status: meta.status,
    });

    if (meta.dealId) {
      scope.setTag("dealId", meta.dealId);
    }

    if (meta.status) {
      scope.setTag("status", meta.status);
    }

    Sentry.captureException(error, {
      tags: {
        automation: true,
        handler: meta.handler || "dispatchEvent",
      },
    });
  });
}

type ChatGptAppsErrorMeta = {
  rpc: string;
  requestId: string;
  orgId: string;
  status?: number;
  route?: string;
  input?: Record<string, unknown>;
  details?: string;
};

export function captureChatGptAppsError(error: unknown, meta: ChatGptAppsErrorMeta): void {
  Sentry.withScope((scope) => {
    scope.setTags({
      integration: "chatgpt-apps",
      rpc: meta.rpc,
      orgId: meta.orgId,
    });

    if (meta.route) {
      scope.setTag("route", meta.route);
    }

    if (typeof meta.status === "number") {
      scope.setTag("status_code", String(meta.status));
    }

    scope.setContext("chatgpt_apps", {
      request_id: meta.requestId,
      route: meta.route,
      input: meta.input,
      details: meta.details,
    });

    const safeError = error instanceof Error ? error : new Error(String(error));
    Sentry.captureException(safeError, {
      tags: {
        integration: "chatgpt-apps",
        rpc: meta.rpc,
      },
      level: "error",
    });
  });
}

type CronMonitorMeta = {
  slug: string;
  schedule: string;
};

type WithSentryCronMonitorOptions<T> = CronMonitorMeta & {
  handler: () => Promise<T>;
};

export async function runWithCronMonitor<T>(options: WithSentryCronMonitorOptions<T>): Promise<T> {
  const withMonitor = (Sentry as {
    withMonitor?: (
      name: string,
      callback: () => Promise<T>,
      options?: { schedule?: { type: string; value: string } },
    ) => Promise<T>;
  }).withMonitor;

  if (typeof withMonitor === "function") {
    return withMonitor(
      options.slug,
      options.handler,
      {
        schedule: {
          type: "crontab",
          value: options.schedule,
        },
      },
    );
  }

  return options.handler();
}
