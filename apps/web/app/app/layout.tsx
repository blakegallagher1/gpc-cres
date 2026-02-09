'use client';

import { DashboardShell } from '@/components/layout/DashboardShell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell noPadding>{children}</DashboardShell>;
}
