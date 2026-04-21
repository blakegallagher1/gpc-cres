"use client";

import { SignIn } from "@clerk/nextjs";

export function LoginForm() {
  return (
    <div className="flex justify-center">
      <SignIn
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "bg-zinc-900 border-zinc-800",
            headerTitle: "hidden",
            headerSubtitle: "hidden",
          },
        }}
      />
    </div>
  );
}
