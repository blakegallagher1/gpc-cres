"use client";

import { useEffect, useMemo } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { getBackendBaseUrl } from "@/lib/backendConfig";

const DEFAULT_USER_COLORS = ["#1f7aec", "#f97316", "#16a34a", "#a855f7"];

type CollaborativeMemoProps = {
  roomId: string;
  artifactId: string;
  initialContent?: string;
  className?: string;
  onContentChange?: (content: string) => void;
};

function buildCollabUrl() {
  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) return null;
  return baseUrl.replace(/^http/, "ws");
}

export function CollaborativeMemo({
  roomId,
  artifactId,
  initialContent,
  className,
  onContentChange,
}: CollaborativeMemoProps) {
  const ydoc = useMemo(() => new Y.Doc(), [roomId, artifactId]);
  const user = useMemo(() => {
    const randomIndex = Math.floor(Math.random() * DEFAULT_USER_COLORS.length);
    return {
      name: "GPC Editor",
      color: DEFAULT_USER_COLORS[randomIndex],
    };
  }, []);

  const collabUrl = buildCollabUrl();

  const provider = useMemo(() => {
    if (!collabUrl) return null;
    const docName = `deal-room-${roomId}-${artifactId}`;
    return new WebsocketProvider(`${collabUrl}/collab`, docName, ydoc);
  }, [roomId, artifactId, ydoc, collabUrl]);

  const editorExtensions = useMemo(() => {
    if (!provider) {
      return [StarterKit];
    }

    return [
      StarterKit,
      Collaboration.configure({ document: ydoc }),
      CollaborationCursor.configure({ provider, user }),
    ];
  }, [provider, user, ydoc]);

  const editor = useEditor({
    extensions: editorExtensions,
    editorProps: {
      attributes: {
        class:
          "min-h-[220px] rounded-md border bg-background px-3 py-2 text-sm text-foreground focus:outline-none",
      },
    },
    onCreate({ editor: createdEditor }) {
      if (initialContent && createdEditor.getText().trim().length === 0) {
        createdEditor.commands.setContent(initialContent);
      }
    },
    onUpdate({ editor: updatedEditor }) {
      if (onContentChange) {
        onContentChange(updatedEditor.getText());
      }
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (initialContent && editor.getText().trim().length === 0) {
      editor.commands.setContent(initialContent);
    }
  }, [editor, initialContent]);

  useEffect(() => {
    return () => {
      ydoc.destroy();
    };
  }, [ydoc]);

  useEffect(() => {
    if (!provider) return;

    provider.awareness.setLocalStateField("user", user);
    return () => {
      provider.destroy();
    };
  }, [provider, user]);

  if (!provider) {
    return (
      <div className={className}>
        <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">
          Collaboration unavailable: backend URL is not configured.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <EditorContent editor={editor} />
    </div>
  );
}
