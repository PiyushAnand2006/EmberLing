// Block B19: rich text composer — TipTap-based editing with markdown
// round-trip (paste markdown → rich; send → markdown). Falls back to plain
// markdown textarea semantics for the rest of the app (drafts, edit flow).
import React, { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TurndownService from "turndown";
import { marked } from "marked";

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
turndown.keep(["table"]);
const mdToHtml = (md: string) => marked.parse(md || "", { async: false, breaks: true }) as string;

export function RichEditor({
  value,
  onChange,
  placeholder,
  onEnter,
  onReady,
  autoFocus,
}: {
  value: string;
  onChange: (md: string) => void;
  placeholder: string;
  onEnter: () => void;
  onReady?: (editor: any) => void;
  autoFocus?: boolean;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder }),
    ],
    content: mdToHtml(value),
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: {
        class: "composer-input tiptap",
        "data-testid": "composer-rich",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          onEnter();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => onChange(turndown.turndown(e.getHTML())),
  });

  useEffect(() => {
    if (editor && onReady) onReady(editor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // external value changes (draft load, edit-mode prefill) replace content
  const lastEmitted = useRef(value);
  useEffect(() => {
    if (!editor) return;
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      editor.commands.setContent(mdToHtml(value));
    }
  }, [value, editor]);

  useEffect(() => {
    if (!editor) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") editor.commands.blur();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editor]);

  if (!editor) return <textarea className="composer-input" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />;

  return <EditorContent editor={editor} />;
}
