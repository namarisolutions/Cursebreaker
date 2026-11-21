# Cursebreaker: design handoff

Cursebreaker is an AI chat app: people come to talk with it. It has a black-and-gold look with a faint terminal flavor (a `❯` prompt in the composer, monospace details). This folder holds everything needed to build the UI. **Match the reference HTML exactly unless it conflicts with the existing codebase's conventions.**

## What's in here

| File | What it is |
|---|---|
| `reference/chat-screen.html` | The main chat screen, standalone. Open it in a browser. This is the source of truth for layout, spacing and colors. |
| `reference/brand-sheet.html` | Logo, wordmark, palette and fonts on one page. |
| `logo/cursebreaker-mark.svg` | Full-detail logo, for 48px and larger (splash, brand, favicon source). |
| `logo/cursebreaker-mark-small.svg` | Simplified logo with heavier lines, for under 48px (sidebar, chat avatar, favicon). |
| `tokens.css` | Colors, fonts, radii and sizes as CSS variables. |

## Build instructions for Claude Code

1. Read this README, `tokens.css`, then open both reference HTML files.
2. Use the project's existing stack. If there isn't one, React + plain CSS (or Tailwind mapped to `tokens.css`) is fine.
3. Bring in `tokens.css` and use its variables. Don't hard-code new colors.
4. Build these components, in order:
   - `Logo` (the SVG mark, `size` prop; swap to the small version under 48px)
   - `Sidebar` (wordmark, New chat button, grouped conversation list, account row)
   - `ChatHeader` (conversation title + online dot)
   - `MessageList` with `UserMessage`, `AssistantMessage` and `TypingIndicator`
   - `Composer` (prompt symbol, text input, send button, disclaimer line)
   - `ChatPage` that lays them out
5. Wire the composer to whatever chat backend exists. If none, stub it so a sent message appears as a user bubble and a typing indicator shows.
6. Check it at 1440px wide and at phone width (390px).

## Layout

- Full-height, true black (`--cb-bg`). Two columns in a wrapping flex row:
  - **Sidebar**: `flex: 1 1 260px; max-width: 300px`, right border `--cb-border`, padding 20px 16px, 24px gaps between sections.
  - **Main**: `flex: 999 1 560px; min-width: 0`. Header on top, scrolling thread in the middle, composer pinned at the bottom.
- Thread and composer are centered with `max-width: 820px` and 32px side padding.
- On phones the sidebar wraps above the chat. A real build should collapse it into a slide-out menu behind a hamburger button.

## Components

**Sidebar**
- Logo row: 36px mark + "CURSEBREAKER" in Cinzel 700, 17px, `letter-spacing: 0.2em`, gold.
- "New chat": full-width, 44px tall, 1px gold border, transparent fill, gold text Inter 600 14px, plus icon. Radius 8px.
- Group labels ("Today", "Earlier"): 11px uppercase, `letter-spacing: 0.14em`, `--cb-text-faint`.
- Conversation item: 10px padding, 13px, radius 6px, `--cb-text-muted`. Active item: `--cb-surface-2` fill, `--cb-border-strong` border, `--cb-text`.
- Account row pinned to the bottom (`margin-top: auto`), top border, 32px round initial avatar, name, 44px settings icon button.

**Chat header**
- 16px 32px padding, bottom border, title Inter 600 15px. Right side: 8px gold dot + "online" in mono 12px faint.

**User message**
- Right-aligned, max 78% width, padding 14px 18px, `--cb-surface-3` fill, `--cb-border-strong` border, radius `16px 16px 4px 16px`, Inter 15px, line-height 1.6.

**Assistant message**
- Left-aligned row: 36px round avatar (1px gold ring, small logo inside, 24px) + content column, 14px gap.
- Body: Inter 15px, line-height 1.7, `--cb-text-body`.
- Rich blocks (lists, plans) go in a card: `--cb-surface-1` fill, `--cb-border` border, radius 10px, padding 16px 18px. Card title: Cinzel 700 12px, `letter-spacing: 0.18em`, gold. Numbered items use gold mono numbers (`01`, `02`…).

**Typing indicator**
- Avatar + three 7px gold dots at 100%, 60% and 30% opacity. Animate them (gentle pulse) in the real build.

**Composer**
- 1px gold border, radius 14px, padding 8px 8px 8px 18px, black fill.
- Gold `❯` in mono 16px as the input's `<label>`, input Inter 15px with placeholder "Say anything…".
- Send: 44px square, gold fill, black arrow icon, radius 10px, `aria-label="Send"`.
- Below: centered 12px faint line, "Cursebreaker can make mistakes. Double-check anything important."

## Logo

A hollow gold rising sun with an upside-down Masonic compass across it, all built from one center point:

- A thick gold half-ring (outer radius 16, inner radius 12) sits on a curved gold band set with three small black gems.
- Seven rays around the ring at even 22.5° steps. The two steps at 112.5° and 67.5° are taken by the compass legs instead of rays. The top ray is slightly longer.
- The compass hinge is at the center point. Its legs open upward along those two ray lines, with pointed tips on the full version.
- Five small rays shoot out from the hinge into the hollow, at the same angles as the outer rays.
- The compass has a black outline that cuts a gap where it crosses the gold. **The logo must sit on black.** Both SVGs include a black background square for that reason. On any other background, keep a black tile behind it.

Wordmark: "CURSEBREAKER" in Cinzel 700, wide tracking (`0.16–0.22em`), gold.

## Accessibility

- Use real `<button>`, `<a>`, `<input>` and `<label>` elements. Icon-only buttons get an `aria-label`.
- Every hit target is at least 44px.
- The text colors in `tokens.css` pass 4.5:1 on black. Don't go dimmer than `--cb-text-faint`.
- Decorative SVGs get `aria-hidden="true"`. The standalone logo gets `role="img"` plus a label.

## Placeholders

- `[YOUR NAME]` in the account row and the sample conversation (dinner for six) are demo content. Replace them with real user data and messages.
- Sidebar conversation titles are examples.
