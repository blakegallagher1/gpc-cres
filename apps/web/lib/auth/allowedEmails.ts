export const DEFAULT_ALLOWED_EMAILS = ["blake@gallagherpropco.com"];

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const parseAllowedEmails = (raw?: string | null) => {
  if (!raw) {
    return DEFAULT_ALLOWED_EMAILS.map((entry) => normalizeEmail(entry));
  }

  return raw
    .split(",")
    .map((entry) => normalizeEmail(entry))
    .filter(Boolean);
};

export const getAllowedLoginEmails = () => {
  const raw =
    process.env.ALLOWED_LOGIN_EMAILS || process.env.NEXT_PUBLIC_ALLOWED_LOGIN_EMAILS;

  return new Set(parseAllowedEmails(raw));
};

export const isEmailAllowed = (email?: string | null) => {
  if (!email) {
    return false;
  }

  return getAllowedLoginEmails().has(normalizeEmail(email));
};
