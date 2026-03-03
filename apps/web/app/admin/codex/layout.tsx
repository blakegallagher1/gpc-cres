import type { ReactNode } from "react";
import { auth } from "@/auth";
import { isEmailAllowed } from "@/lib/auth/allowedEmails";

interface AdminCodexLayoutProps {
  children: ReactNode;
}

function isAuthBypassedForLocalDev(): boolean {
  return process.env.NEXT_PUBLIC_DISABLE_AUTH === "true";
}

export default async function AdminCodexLayout({ children }: AdminCodexLayoutProps) {
  if (isAuthBypassedForLocalDev()) {
    return <>{children}</>;
  }

  const session = await auth();
  if (!session?.user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 text-gray-200">
        <div className="max-w-lg rounded-md border border-red-700/60 bg-gray-900 p-6 text-center">
          <h1 className="mb-2 text-2xl font-semibold text-white">Unauthorized</h1>
          <p className="text-sm text-gray-300">Sign in as an admin to access Codex tooling.</p>
        </div>
      </div>
    );
  }

  if (!isEmailAllowed(session.user.email)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 text-gray-200">
        <div className="max-w-lg rounded-md border border-amber-600/70 bg-gray-900 p-6 text-center">
          <h1 className="mb-2 text-2xl font-semibold text-white">Forbidden</h1>
          <p className="text-sm text-gray-300">This admin tool requires an admin account.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
