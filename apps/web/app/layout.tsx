import type { Metadata } from "next";
import { DM_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";
import * as Sentry from "@sentry/nextjs";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AuthSessionProvider } from "@/components/providers/session-provider";
import { Toaster } from "@/components/ui/sonner";

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-mono",
});

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "GPC Agent Dashboard | Gallagher Property Company",
  description:
    "AI Agent Orchestration Dashboard for Commercial Real Estate Development",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${instrumentSans.variable} ${dmMono.variable} ${instrumentSans.className}`}>
        <AuthSessionProvider>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Sentry.ErrorBoundary
            fallback={
              <div className="flex min-h-screen flex-col items-center justify-center gap-4">
                <h1 className="text-2xl font-semibold text-zinc-900">
                  Something went wrong
                </h1>
                <p className="text-zinc-600">
                  The application encountered an unexpected error.
                </p>
              </div>
            }
          >
            {children}
          </Sentry.ErrorBoundary>
          <Toaster position="bottom-right" />
        </ThemeProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
