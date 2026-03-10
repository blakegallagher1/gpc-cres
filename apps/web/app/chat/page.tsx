import { redirect } from "next/navigation";

/**
 * /chat → redirect to / where the (chat) route group renders the chat UI.
 * This prevents 404s when users or navigation links reference /chat directly.
 */
export default function ChatRedirectPage() {
  redirect("/");
}
