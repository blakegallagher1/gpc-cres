'use client';

import { DashboardShell } from '@/components/layout/DashboardShell';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell noPadding>{children}</DashboardShell>;
}
