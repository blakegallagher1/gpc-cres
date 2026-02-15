import Link from "next/link";
import { type ReactNode } from "react";
import { BookOpen, Sparkles } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type OnboardingStep = {
  title: string;
  description: string;
};

export type OnboardingAction = {
  label: string;
  icon?: ReactNode;
  description?: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: ButtonProps["variant"];
};

export type OnboardingSampleAction = {
  name: string;
  description: string;
  actionLabel?: string;
  action: OnboardingAction;
};

export type OnboardingResourceLink = {
  label: string;
  href: string;
};

type GuidedOnboardingPanelProps = {
  title: string;
  description: string;
  icon: ReactNode;
  steps: OnboardingStep[];
  primaryActions?: OnboardingAction[];
  secondaryActions?: OnboardingAction[];
  sampleActions?: OnboardingSampleAction[];
  tutorials?: OnboardingResourceLink[];
  customContent?: ReactNode;
};

function renderAction(
  action: OnboardingAction,
  key: string
) {
  const buttonLabel = action.label;
  const variant: ButtonProps["variant"] = action.variant ?? "outline";
  const icon = action.icon ?? <Sparkles className="h-3.5 w-3.5" />;

  const buttonContent = (
    <span className="flex items-center gap-2">
      {icon}
      <span>{buttonLabel}</span>
    </span>
  );

  if (action.href) {
    return (
      <Button
        key={key}
        variant={variant}
        size="sm"
        asChild
        disabled={action.disabled}
      >
        <Link href={action.href}>{buttonContent}</Link>
      </Button>
    );
  }

  return (
    <Button
      key={key}
      variant={variant}
      size="sm"
      onClick={action.onClick}
      disabled={action.disabled}
    >
      {buttonContent}
    </Button>
  );
}

export function GuidedOnboardingPanel({
  title,
  description,
  icon,
  steps,
  primaryActions,
  secondaryActions,
  sampleActions,
  tutorials,
  customContent,
}: GuidedOnboardingPanelProps) {
  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-primary/10 p-2 text-primary">
            {icon}
          </div>
          <div>
            <CardTitle>{title}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 text-sm">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Quick onboarding
          </p>
          <div className="space-y-2">
            {steps.map((step, index) => (
              <div
                key={`${step.title}-${index}`}
                className="rounded-md border p-3"
              >
                <p className="text-sm font-medium">
                  Step {index + 1}: {step.title}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {primaryActions?.length ? (
          <div className="flex flex-wrap gap-2">
            {primaryActions.map((action) =>
              renderAction(
                {
                  ...action,
                  variant: action.variant ?? "default",
                  icon: action.icon ?? <Sparkles className="h-3.5 w-3.5" />,
                },
                `primary-${action.label}`
              )
            )}
          </div>
        ) : null}

        {secondaryActions?.length ? (
          <div className="flex flex-wrap gap-2">
            {secondaryActions.map((action) =>
              renderAction(
                {
                  ...action,
                  variant: action.variant ?? "outline",
                  icon: action.icon ?? <Sparkles className="h-3.5 w-3.5" />,
                },
                `secondary-${action.label}`
              )
            )}
          </div>
        ) : null}

        {customContent ? <div>{customContent}</div> : null}

        {sampleActions?.length ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Sample data
            </p>
            <div className="space-y-2">
              {sampleActions.map((sample) => (
                <div
                  key={sample.name}
                  className="rounded-md border bg-muted/40 p-3"
                >
                  <p className="font-medium">{sample.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {sample.description}
                  </p>
                  <div className="mt-2">
                    {renderAction(
                      {
                        ...(sample.action || {}),
                        variant: sample.action.variant ?? "secondary",
                        label: sample.actionLabel ?? sample.action.label ?? "Load sample",
                      },
                      `sample-${sample.name}`
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {tutorials?.length ? (
          <div className="rounded-md border bg-muted/20 p-3 text-xs">
            <p className="mb-2 flex items-center gap-2 font-medium text-muted-foreground">
              <BookOpen className="h-4 w-4" />
              Getting started
            </p>
            <div className="space-y-1">
              {tutorials.map((tutorial) => (
                <a
                  key={tutorial.label}
                  href={tutorial.href}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-primary underline underline-offset-2 hover:no-underline"
                >
                  {tutorial.label}
                </a>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

