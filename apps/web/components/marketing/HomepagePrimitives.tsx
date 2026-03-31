import type { ComponentPropsWithoutRef, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type DivProps = HTMLAttributes<HTMLDivElement>;

export function PageShell({ className, ...props }: DivProps) {
  return <div className={cn("min-h-screen bg-[#07111f] text-white", className)} {...props} />;
}

export function Container({ className, ...props }: DivProps) {
  return <div className={cn("mx-auto w-full max-w-[1280px] px-6 md:px-10 lg:px-16", className)} {...props} />;
}

interface SectionProps extends DivProps {
  id?: string;
}

export function Section({ className, ...props }: SectionProps) {
  return <section className={cn("relative py-16 md:py-24", className)} {...props} />;
}

export function Eyebrow({ className, ...props }: ComponentPropsWithoutRef<"p">) {
  return (
    <p
      className={cn("font-mono text-[0.68rem] uppercase tracking-[0.28em] text-white/54", className)}
      {...props}
    />
  );
}

export function Headline({ className, ...props }: ComponentPropsWithoutRef<"h1">) {
  return (
    <h1
      className={cn("text-[clamp(3.4rem,7vw,6.4rem)] font-semibold tracking-[-0.08em] text-white", className)}
      {...props}
    />
  );
}

export function Subhead({ className, ...props }: ComponentPropsWithoutRef<"p">) {
  return (
    <p
      className={cn("max-w-2xl text-[clamp(1.15rem,2vw,1.55rem)] leading-[1.2] tracking-[-0.04em] text-white/86", className)}
      {...props}
    />
  );
}

export function Body({ className, ...props }: ComponentPropsWithoutRef<"p">) {
  return <p className={cn("max-w-2xl text-sm leading-6 text-white/62 sm:text-[0.97rem]", className)} {...props} />;
}

export function SectionIntro({
  eyebrow,
  title,
  body,
  className,
}: {
  eyebrow: string;
  title: string;
  body: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl space-y-4", className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="text-[clamp(2rem,4vw,3.3rem)] font-semibold tracking-[-0.07em] text-white">{title}</h2>
      <Body>{body}</Body>
    </div>
  );
}

export function SurfaceCard({ className, ...props }: DivProps) {
  return (
    <div
      className={cn(
        "rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-6 shadow-[0_24px_80px_rgba(1,10,25,0.24)] backdrop-blur-sm md:p-8",
        className,
      )}
      {...props}
    />
  );
}

export function Divider({ className, ...props }: DivProps) {
  return <div className={cn("h-px w-full bg-white/10", className)} {...props} />;
}

export function ButtonGroup({ className, ...props }: DivProps) {
  return <div className={cn("flex flex-wrap items-center gap-3", className)} {...props} />;
}

export function StepItem({
  index,
  title,
  body,
  className,
  children,
}: {
  index: string;
  title: string;
  body: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("grid gap-4", className)}>
      <div className="flex items-center gap-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] font-mono text-sm text-white/78">
          {index}
        </span>
        <div className="h-px flex-1 bg-white/10" />
      </div>
      <div className="space-y-3">
        <h3 className="text-xl font-semibold tracking-[-0.04em] text-white">{title}</h3>
        <Body className="max-w-none">{body}</Body>
        {children}
      </div>
    </div>
  );
}

export function SiteFooter({ className, ...props }: DivProps) {
  return <footer className={cn("border-t border-white/10 py-8", className)} {...props} />;
}
