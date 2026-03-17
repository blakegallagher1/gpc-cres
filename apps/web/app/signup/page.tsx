import { redirect } from "next/navigation";

/** Legacy route — /signup consolidated into /login (Google OAuth is sole auth method) */
export default function SignupPage() {
  redirect("/login");
}
