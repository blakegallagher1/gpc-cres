import type { Metadata } from "next";
import { DM_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AuthSessionProvider } from "@/components/providers/session-provider";
import { ObservabilityBoundary } from "@/components/observability/observability-boundary";
import { ObservabilityProvider } from "@/components/observability/observability-provider";
import { Toaster } from "@/components/ui/sonner";
import { MapChatProvider } from "@/lib/chat/MapChatContext";

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
            <MapChatProvider>
              <ObservabilityProvider>
                <ObservabilityBoundary>{children}</ObservabilityBoundary>
              </ObservabilityProvider>
            </MapChatProvider>
            <Toaster position="bottom-right" />
          </ThemeProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
