import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import * as Sentry from "@sentry/nextjs";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({ subsets: ["latin"] });

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
      <body className={inter.className}>
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
      </body>
    </html>
  );
}
