import { ChatContainer } from "@/components/chat/ChatContainer";
import { Card } from "@/components/ui/card";

/** Dedicated authenticated chat workspace now that `/` is the public company homepage. */
export default function ChatPage() {
  return (
    <Card className="h-full overflow-hidden rounded-none border-x-0 border-b-0 border-t border-border/60 bg-background/70 shadow-none">
      <ChatContainer />
    </Card>
  );
}
