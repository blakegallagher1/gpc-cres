# Clerk Migration Design

Date: 2026-04-20
Status: Approved

## Summary

Migrate from NextAuth v5 (Auth.js beta) to Clerk for authentication. Drop Credentials provider entirely — Clerk-only auth with Google OAuth via Clerk's shared dev credentials.

## Current State

- NextAuth v5 with JWT sessions (no Prisma adapter, no Account/Session tables)
- Google OAuth + Credentials (email/password) providers
- Single user: blake@gallagherpropco.com
- All 200+ API routes funnel through `resolveAuth()` or `authorizeApiRoute()`
- Middleware in `proxy.ts` uses `getToken()` from `next-auth/jwt`

## Target State

- Clerk manages auth (Google OAuth, hosted sign-in UI)
- Prisma `User` + `OrgMembership` tables stay as source of truth for `userId`/`orgId`
- Clerk webhook (`user.created`) auto-provisions Prisma user + org membership
- `AuthResult = { userId: string; orgId: string }` shape unchanged
- All 200+ API routes unchanged (they call helpers that get rewritten internally)

## Clerk Instance

- App: taxos-web (Development instance)
- Mode: Restricted (no public sign-ups)
- Google SSO: Enabled with shared dev credentials
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_ZW5qb3llZC1jYXRmaXNoLTMwLmNsZXJrLmFjY291bnRzLmRldiQ`
- `CLERK_SECRET_KEY=sk_test_...` (in .env.local)

## Three-Agent Workstream Design

### Agent 1: Auth Core & Middleware

Files to create:
- `apps/web/middleware.ts` — Clerk middleware (replaces proxy.ts export)
- `apps/web/app/api/webhooks/clerk/route.ts` — user.created webhook

Files to modify:
- `apps/web/proxy.ts` — remove getToken/NextAuth, use Clerk's `auth()`
- `apps/web/.env.local` — add Clerk keys, comment out NextAuth/Google vars
- `apps/web/.env.example` — document Clerk vars

Files to delete:
- `apps/web/auth.ts` — replaced by Clerk SDK
- `apps/web/types/next-auth.d.ts` — Clerk has its own types
- `apps/web/lib/auth/authSecret.ts` — no manual secret management
- `apps/web/app/api/auth/[...nextauth]/route.ts` — Clerk handles its own routes

### Agent 2: Client Components

Files to modify:
- `apps/web/components/providers/session-provider.tsx` — SessionProvider → ClerkProvider
- `apps/web/components/auth/LoginForm.tsx` — replace with Clerk `<SignIn />`
- `apps/web/components/auth/AuthGuard.tsx` — useSession → useAuth from Clerk
- `apps/web/components/layout/Header.tsx` — signOut → useClerk().signOut()
- `apps/web/components/layout/Sidebar.tsx` — useSession → useUser()
- `apps/web/components/observability/observability-provider.tsx` — useSession → useUser()
- `apps/web/app/layout.tsx` — swap provider import
- `apps/web/app/login/page.tsx` — render Clerk SignIn

### Agent 3: Server Auth Helpers

Files to modify:
- `apps/web/lib/auth/routeAuth.ts` — getToken → Clerk auth(), map Clerk userId → Prisma userId/orgId
- `apps/web/lib/auth/authorizeApiRoute.ts` — replace dynamic import("@/auth") → Clerk currentUser()
- `apps/web/app/admin/codex/layout.tsx` — auth() → currentUser() from Clerk
- `apps/web/app/deals/page.tsx` — auth() → Clerk auth helpers

Files unchanged:
- `apps/web/lib/auth/localDevBypass.ts` — still useful
- `apps/web/lib/auth/allowedEmails.ts` — reused in webhook
- `apps/web/lib/auth/apiKeyRegistry.ts` — no auth provider dependency

## Env Var Changes

| Remove | Add |
|--------|-----|
| `NEXTAUTH_SECRET` | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` |
| `NEXTAUTH_URL` | `CLERK_SECRET_KEY` |
| `AUTH_URL` | `CLERK_WEBHOOK_SECRET` |
| `AUTH_GOOGLE_ID` | |
| `AUTH_GOOGLE_SECRET` | |
| `AUTH_ENABLE_CREDENTIALS_FALLBACK` | |
| `AUTH_CREDENTIALS_FALLBACK_PASSWORD` | |

## Package Changes

| Remove | Add |
|--------|-----|
| `next-auth` | `@clerk/nextjs` |
| `bcryptjs` | |
| `@types/bcryptjs` | |

## User Provisioning Flow (Webhook)

1. User signs in via Clerk (Google OAuth)
2. Clerk fires `user.created` webhook to `/api/webhooks/clerk`
3. Webhook handler checks email against allowlist
4. If allowed: create Prisma User + OrgMembership (same logic as current `ensureOAuthUserProvisioned`)
5. If not allowed: log and ignore (Clerk restricted mode already prevents sign-up)

## Session Resolution Flow (After Migration)

1. Request arrives → Clerk middleware validates session cookie
2. API route calls `resolveAuth(request)`
3. `resolveAuth` calls Clerk's `auth()` → gets `clerkUserId`
4. Maps `clerkUserId` → Prisma User via `externalId` or email lookup
5. Looks up `OrgMembership` → returns `{ userId, orgId }`
6. All downstream code works unchanged
