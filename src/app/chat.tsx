"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Logo from "@/components/Logo";

type Msg = { id: string; role: "user" | "assistant"; content: string };
type Convo = { id: string; title: string; updatedAt: string };

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

const Icon = {
  plus: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  menu: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  ),
  arrow: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  shield: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 3l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  check: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <path d="M5 12l5 5 9-10" />
    </svg>
  ),
};

function AssistantRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="msg-ai">
      <div className="avatar">
        <Logo size={24} />
      </div>
      {children}
    </div>
  );
}

function Typing() {
  return (
    <div className="typing" role="status" aria-label="Cursebreaker is typing">
      <span />
      <span />
      <span />
    </div>
  );
}

export function Chat({
  appName,
  greeting,
  enabled,
  handle,
  conversations,
  activeId,
  initialMessages,
  initialSent,
}: {
  appName: string;
  greeting: string;
  enabled: boolean;
  handle: string | null;
  conversations: Convo[];
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
  const [menuOpen, setMenuOpen] = useState(false);
  // "Send to owner" state: when it was last sent, whether there's new chat since, and the preview being reviewed.
  const [sent, setSent] = useState(initialSent);
  const [preview, setPreview] = useState<{ topic: string; summary: string } | null>(null);
  const [submitting, setSubmitting] = useState<"preview" | "send" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Keep the newest message (and any preview) in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, preview]);

  // Grow the textarea with its content.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [input]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError("");
    setBusy(true);
    setInput("");
    setConfirmDelete(false);
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
        // First message of a new chat: move to its URL so the sidebar and account row pick it up.
        // The reply is already saved by the time the stream ends, so the server view matches.
        setConvId(newId);
        router.replace(`/?c=${newId}`, { scroll: false });
      } else {
        router.refresh();
      }
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

  async function remove() {
    if (!convId) return;
    const res = await fetch("/api/chat/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversation_id: convId }),
    }).catch(() => null);
    if (!res?.ok) {
      setError("Couldn't delete the conversation. Please try again.");
      setConfirmDelete(false);
      return;
    }
    window.location.assign("/");
  }

  const hasUserMessage = messages.some((m) => m.role === "user");
  const canSubmit = enabled && Boolean(convId) && hasUserMessage && !busy;
  const title = conversations.find((c) => c.id === convId)?.title ?? (hasUserMessage ? messages.find((m) => m.role === "user")!.content : "New chat");
  const today = conversations.filter((c) => isToday(c.updatedAt));
  const earlier = conversations.filter((c) => !isToday(c.updatedAt));

  const group = (label: string, items: Convo[]) =>
    items.length > 0 && (
      <div className="convo-group">
        <h2>{label}</h2>
        {items.map((c) => (
          <Link
            key={c.id}
            href={`/?c=${c.id}`}
            className="convo-item"
            aria-current={c.id === convId ? "page" : undefined}
            onClick={() => setMenuOpen(false)}
          >
            <span>{c.title}</span>
          </Link>
        ))}
      </div>
    );

  return (
    <div className="app">
      <aside id="cb-sidebar" className={`sidebar${menuOpen ? " open" : ""}`} aria-label="Conversations">
        <Link href="/" className="brand" aria-label={`${appName}, new chat`} onClick={() => setMenuOpen(false)}>
          <Logo size={36} />
          <span className="wordmark">{appName}</span>
        </Link>

        <Link href="/" className="btn-outline new-chat" onClick={() => setMenuOpen(false)}>
          {Icon.plus}
          New chat
        </Link>

        {conversations.length === 0 && <p className="sidebar-empty">Your conversations will show up here. Only you can see them.</p>}
        {group("Today", today)}
        {group("Earlier", earlier)}

        <div className="account">
          <div className="initial" aria-hidden="true">{handle ? handle[0] : "?"}</div>
          <div className="who">
            <span className="name">{handle ?? "Anonymous"}</span>
            <span className="sub">Your anonymous name</span>
          </div>
          <Link href="/privacy" className="icon-btn" aria-label="How privacy works">
            {Icon.shield}
          </Link>
        </div>
      </aside>

      <button
        className={`scrim${menuOpen ? " open" : ""}`}
        aria-label="Close menu"
        tabIndex={menuOpen ? 0 : -1}
        onClick={() => setMenuOpen(false)}
      />

      <main className="main">
        <header className="chat-header">
          <button
            className="icon-btn menu-btn"
            aria-label="Open menu"
            aria-controls="cb-sidebar"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            {Icon.menu}
          </button>
          <h1>{title}</h1>
          <span className={`status${enabled ? "" : " off"}`}>
            <span className="dot" aria-hidden="true" />
            {enabled ? "online" : "offline"}
          </span>
        </header>

        <div className="thread-scroll" ref={scrollRef}>
          <div className="thread" aria-live="polite">
            {messages.length === 0 && (
              <div className="chat-empty">
                <Logo size={96} />
                <h2>WHAT&apos;S ON YOUR MIND?</h2>
                <p className="greeting">{greeting}</p>
                <div className="shield">
                  <div className="card-title">How your privacy works</div>
                  <div className="row"><span className="n">01</span><span>Only you can see this chat.</span></div>
                  <div className="row"><span className="n">02</span><span>Press <b>Send to owner</b> and the AI writes a short summary. You preview it first.</span></div>
                  <div className="row"><span className="n">03</span><span>The owner sees that summary, never your words. <Link href="/privacy">Details</Link></span></div>
                </div>
              </div>
            )}

            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="msg-user">{m.content}</div>
              ) : (
                <AssistantRow key={m.id}>
                  {m.content ? <div className="reply">{m.content}</div> : busy ? <Typing /> : <div className="reply" />}
                </AssistantRow>
              ),
            )}
          </div>
        </div>

        {(preview || error || canSubmit) && (
          <div className="dock">
            {preview && (
              <section className="preview" aria-label="Summary preview">
                <div className="card-title">What the owner will see</div>
                <div className="preview-topic">{preview.topic}</div>
                <div className="preview-body">{preview.summary}</div>
                <div className="preview-actions">
                  <button type="button" className="btn-gold" onClick={() => submit("send")} disabled={submitting !== null}>
                    {submitting === "send" ? "Sending…" : sent ? "Send update" : "Send to owner"}
                  </button>
                  <button
                    type="button"
                    className="btn-quiet"
                    onClick={() => {
                      setPreview(null);
                      inputRef.current?.focus();
                    }}
                    disabled={submitting !== null}
                  >
                    Keep chatting
                  </button>
                </div>
                <p className="preview-note">Want something changed or left out? Tell the AI, then preview again.</p>
              </section>
            )}

            {error && <p className="chat-error" role="alert">{error}</p>}

            {canSubmit && !preview && (
              <div className="send-bar">
                {confirmDelete ? (
                  <span className="send-status">Delete this chat permanently{sent ? ", including what you sent" : ""}?</span>
                ) : sent && !sent.outdated ? (
                  <span className="send-status sent">
                    {Icon.check} Sent to owner · {new Date(sent.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                ) : (
                  <span className="send-status">{sent ? "Sent earlier · you've added more since" : "Only you can see this chat"}</span>
                )}
                <span className="send-actions">
                  {confirmDelete ? (
                    <>
                      <button type="button" className="btn-quiet btn-danger" onClick={remove}>Delete</button>
                      <button type="button" className="btn-quiet" onClick={() => setConfirmDelete(false)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="btn-quiet" onClick={() => setConfirmDelete(true)}>Delete</button>
                      {(!sent || sent.outdated) && (
                        <button type="button" className="btn-gold" onClick={() => submit("preview")} disabled={submitting !== null}>
                          {submitting === "preview" ? "Preparing summary…" : sent ? "Send update" : "Send to owner"}
                        </button>
                      )}
                    </>
                  )}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="composer-wrap">
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <label htmlFor="cb-message">❯</label>
            <textarea
              id="cb-message"
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={enabled ? "Say anything…" : "Chat is unavailable right now."}
              maxLength={4000}
              disabled={!enabled}
              autoFocus
            />
            <button type="submit" className="send" aria-label="Send" disabled={!enabled || busy || !input.trim()}>
              {Icon.arrow}
            </button>
          </form>
          <p className="disclaimer">
            {appName} can make mistakes. Double-check anything important. · <Link href="/privacy">Privacy</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
