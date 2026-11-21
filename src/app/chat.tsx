"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Msg = { id: string; role: "user" | "assistant"; content: string };

export function Chat({
  appName,
  greeting,
  enabled,
  conversations,
  activeId,
  initialMessages,
  initialSent,
}: {
  appName: string;
  greeting: string;
  enabled: boolean;
  conversations: { id: string; title: string }[];
  activeId: string | null;
  initialMessages: Msg[];
  initialSent: { at: string; outdated: boolean } | null;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [convId, setConvId] = useState(activeId);
  const [showList, setShowList] = useState(false);
  // "Send to owner" state: when it was last sent, whether there's new chat since, and the preview being reviewed.
  const [sent, setSent] = useState(initialSent);
  const [preview, setPreview] = useState<{ topic: string; summary: string } | null>(null);
  const [submitting, setSubmitting] = useState<"preview" | "send" | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError("");
    setBusy(true);
    setInput("");
    const replyId = `a-${Date.now()}`;
    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: "user", content: text }, { id: replyId, role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, ...(convId ? { conversation_id: convId } : {}) }),
      });
      if (!res.ok || !res.body) {
        const { error: e } = await res.json().catch(() => ({ error: "Something went wrong." }));
        setMessages((m) => m.filter((x) => x.id !== replyId));
        setError(e);
        setInput(text);
        return;
      }
      const newId = res.headers.get("x-conversation-id");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, content: x.content + chunk } : x)));
      }
      setSent((s) => (s ? { ...s, outdated: true } : s));
      setPreview(null);
      if (newId && newId !== convId) {
        setConvId(newId);
        // Keep the URL shareable-by-reload and refresh the sidebar list, without remounting the chat.
        window.history.replaceState(null, "", `/?c=${newId}`);
      }
      router.refresh();
    } catch {
      setError("Connection lost. Please try again.");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  async function submit(action: "preview" | "send") {
    if (!convId || submitting) return;
    setError("");
    setSubmitting(action);
    try {
      const res = await fetch("/api/chat/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversation_id: convId, action }),
      });
      const data = await res.json().catch(() => ({ error: "Something went wrong." }));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        if (res.status === 409) setPreview(null);
        return;
      }
      if (action === "preview") setPreview(data);
      else {
        setPreview(null);
        setSent({ at: data.submitted_at, outdated: false });
      }
    } catch {
      setError("Connection lost. Please try again.");
    } finally {
      setSubmitting(null);
    }
  }

  const hasUserMessage = messages.some((m) => m.role === "user");
  const canSubmit = enabled && Boolean(convId) && hasUserMessage && !busy;

  return (
    <div className="chat-shell">
      <aside className={`chat-side${showList ? " open" : ""}`}>
        <div className="chat-brand">{appName}</div>
        <Link href="/" className="new-chat" onClick={() => setShowList(false)}>+ New conversation</Link>
        {conversations.length > 0 && <div className="side-label">Your conversations</div>}
        <nav className="conv-list">
          {conversations.map((c) => (
            <Link
              key={c.id}
              href={`/?c=${c.id}`}
              aria-current={c.id === convId ? "page" : undefined}
              onClick={() => setShowList(false)}
            >
              {c.title}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="chat-main">
        <header className="chat-top">
          <button type="button" className="list-toggle" onClick={() => setShowList((s) => !s)} aria-label="Conversations">☰</button>
          <span className="chat-title">{appName}</span>
        </header>

        <div className="notice" role="note">
          Nothing reaches the owner of {appName} until you press <b>Send to owner</b>. Even then, they see only a short
          AI-written summary that you preview first, never your words. Your messages are encrypted with a key that
          exists only in this browser.
        </div>

        <div className="chat-log" aria-live="polite">
          <div className="bubble assistant">{greeting}</div>
          {messages.map((m) => (
            <div key={m.id} className={`bubble ${m.role}`}>
              {m.content || (busy && m.role === "assistant" ? <span className="typing" aria-label="Typing"><i /><i /><i /></span> : "")}
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {preview && (
          <section className="preview" aria-label="Summary preview">
            <div className="preview-head">This is exactly what the owner will see:</div>
            <div className="preview-topic">{preview.topic}</div>
            <div className="preview-body">{preview.summary}</div>
            <div className="preview-actions">
              <button type="button" className="primary" onClick={() => submit("send")} disabled={submitting !== null}>
                {submitting === "send" ? "Sending…" : sent ? "Send update" : "Send to owner"}
              </button>
              <button type="button" onClick={() => { setPreview(null); inputRef.current?.focus(); }} disabled={submitting !== null}>
                Keep chatting
              </button>
            </div>
            <p className="preview-note">Want something changed or left out? Tell the AI, then preview again.</p>
          </section>
        )}

        {error && <p className="error chat-error">{error}</p>}

        {canSubmit && !preview && (
          <div className="send-bar">
            <span className="send-status">
              {sent
                ? sent.outdated
                  ? "Sent earlier. You've added more since."
                  : `Sent to the owner ✓ ${new Date(sent.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`
                : "Only you can see this conversation."}
            </span>
            {(!sent || sent.outdated) && (
              <button type="button" className="send-owner" onClick={() => submit("preview")} disabled={submitting !== null}>
                {submitting === "preview" ? "Preparing summary…" : sent ? "Send update" : "Send to owner"}
              </button>
            )}
          </div>
        )}

        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={enabled ? "Message…" : "Chat is unavailable right now."}
            rows={1}
            maxLength={4000}
            disabled={!enabled}
            autoFocus
          />
          <button disabled={!enabled || busy || !input.trim()}>{busy ? "…" : "Send"}</button>
        </form>
      </main>
    </div>
  );
}
