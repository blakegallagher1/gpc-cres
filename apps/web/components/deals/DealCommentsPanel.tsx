"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { Loader2, Pin, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

interface DealComment {
  id: string;
  dealId: string;
  authorUserId: string;
  authorEmail: string | null;
  parentCommentId: string | null;
  body: string;
  mentions: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  replyCount: number;
}

interface DealCommentsPanelProps {
  dealId: string;
  currentUserId?: string | null;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
};

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function buildThreads(comments: DealComment[]): Array<DealComment & { children: DealComment[] }> {
  const byParent = new Map<string | null, DealComment[]>();
  for (const comment of comments) {
    const key = comment.parentCommentId;
    const arr = byParent.get(key) ?? [];
    arr.push(comment);
    byParent.set(key, arr);
  }
  const roots = byParent.get(null) ?? [];
  return roots.map((root) => ({
    ...root,
    children: byParent.get(root.id) ?? [],
  }));
}

export function DealCommentsPanel({ dealId, currentUserId }: DealCommentsPanelProps) {
  const { data, error, isLoading, mutate } = useSWR<{ comments: DealComment[] }>(
    `/api/deals/${dealId}/comments`,
    fetcher,
  );

  const [body, setBody] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const threads = useMemo(() => buildThreads(data?.comments ?? []), [data]);

  const submit = useCallback(async () => {
    const trimmed = body.trim();
    if (trimmed.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body: trimmed,
          parentCommentId: replyingTo,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? `Failed: ${res.status}`);
      }
      setBody("");
      setReplyingTo(null);
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to post comment");
    } finally {
      setSubmitting(false);
    }
  }, [body, dealId, mutate, replyingTo]);

  const deleteComment = useCallback(
    async (commentId: string) => {
      if (!confirm("Delete this comment?")) return;
      try {
        const res = await fetch(`/api/deals/${dealId}/comments/${commentId}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error ?? `Failed: ${res.status}`);
        }
        await mutate();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete");
      }
    },
    [dealId, mutate],
  );

  const togglePin = useCallback(
    async (comment: DealComment) => {
      try {
        const res = await fetch(`/api/deals/${dealId}/comments/${comment.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pinned: !comment.pinned }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error ?? `Failed: ${res.status}`);
        }
        await mutate();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to pin");
      }
    },
    [dealId, mutate],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm tracking-wide uppercase">Deal discussion</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading comments…
          </div>
        )}
        {error && (
          <p className="text-sm text-destructive">Failed to load comments.</p>
        )}

        {!isLoading && threads.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No discussion yet. Start a thread to document decisions, concerns, and next steps.
          </p>
        )}

        {threads.map((thread) => (
          <div key={thread.id} className="rounded border border-border/60 bg-card/30 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-xs font-medium">
                  {thread.authorEmail ?? thread.authorUserId.slice(0, 8)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {formatTimestamp(thread.createdAt)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => togglePin(thread)}
                  title={thread.pinned ? "Unpin" : "Pin"}
                >
                  <Pin
                    className={`h-3 w-3 ${thread.pinned ? "fill-current" : ""}`}
                  />
                </Button>
                {currentUserId === thread.authorUserId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-destructive"
                    onClick={() => deleteComment(thread.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm">{thread.body}</p>

            {thread.children.length > 0 && (
              <div className="mt-3 space-y-2 border-l-2 border-border/60 pl-3">
                {thread.children.map((reply) => (
                  <div key={reply.id} className="text-sm">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {reply.authorEmail ?? reply.authorUserId.slice(0, 8)}
                      </span>
                      <span>{formatTimestamp(reply.createdAt)}</span>
                      {currentUserId === reply.authorUserId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 text-destructive"
                          onClick={() => deleteComment(reply.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap">{reply.body}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setReplyingTo(thread.id)}
              >
                Reply
              </Button>
            </div>
          </div>
        ))}

        <div className="space-y-2 border-t pt-3">
          {replyingTo && (
            <div className="flex items-center justify-between rounded bg-muted/40 px-2 py-1 text-xs">
              <span>Replying to thread…</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-2 text-xs"
                onClick={() => setReplyingTo(null)}
              >
                Cancel
              </Button>
            </div>
          )}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Share a decision, concern, or next step…"
            rows={3}
            className="w-full resize-y rounded border border-border/60 bg-background p-2 text-sm focus:border-primary focus:outline-none"
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={submit} disabled={submitting || body.trim().length === 0}>
              {submitting ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Send className="mr-1 h-3 w-3" />
              )}
              Post
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default DealCommentsPanel;
