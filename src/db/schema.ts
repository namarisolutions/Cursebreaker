import { pgTable, uuid, text, timestamp, pgEnum, index, integer } from "drizzle-orm/pg-core";

export const visitorStatus = pgEnum("visitor_status", ["active", "blocked"]);
export const conversationStatus = pgEnum("conversation_status", ["active", "flagged", "archived"]);
export const messageRole = pgEnum("message_role", ["user", "assistant"]);
export const adminRole = pgEnum("admin_role", ["owner", "moderator"]);

// An anonymous browser, identified only by a random cookie token (stored hashed).
// No email, IP, or user-agent is stored.
export const visitors = pgTable("visitors", {
  id: uuid("id").primaryKey().defaultRandom(),
  handle: text("handle").notNull().unique(),
  tokenHash: text("token_hash").notNull().unique(),
  status: visitorStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    visitorId: uuid("visitor_id")
      .notNull()
      .references(() => visitors.id, { onDelete: "cascade" }),
    // Visitor's own label for the conversation (their first message), encrypted like messages.
    titleSealed: text("title_sealed").notNull(),
    // What the owner sees: AI-written, paraphrased, never the visitor's words.
    topic: text("topic"),
    summary: text("summary"),
    summaryUpdatedAt: timestamp("summary_updated_at", { withTimezone: true }),
    summaryError: text("summary_error"),
    // Nothing reaches the owner until the visitor presses "Send to owner".
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    // Summary preview awaiting the visitor's confirmation, sealed with their key.
    draftSealed: text("draft_sealed"),
    status: conversationStatus("status").notNull().default("active"),
    flagReason: text("flag_reason"),
    messageCount: integer("message_count").notNull().default(0),
    // Owner's inbox state. Null = has messages the owner hasn't seen.
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("conv_last_msg_idx").on(t.lastMessageAt), index("conv_visitor_idx").on(t.visitorId)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: messageRole("role").notNull(),
    // Encrypted with the visitor's transcript key (see src/lib/crypto.ts). Never plaintext.
    contentSealed: text("content_sealed").notNull(),
    // Assistant-only metadata, shown to the owner in the transcript.
    model: text("model"),
    stopReason: text("stop_reason"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("msg_conv_idx").on(t.conversationId, t.createdAt), index("msg_created_idx").on(t.createdAt)],
);

export const admins = pgTable("admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: adminRole("role").notNull().default("moderator"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Admin-editable configuration (the AI's system prompt, greeting).
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Email invites the owner sent. Deliberately not linked to visitors: the invite link
// carries no token, so nobody can tell which conversations came from which invitee.
export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    note: text("note"),
    status: text("status").notNull(), // "sent" | "failed"
    error: text("error"),
    sentBy: uuid("sent_by")
      .notNull()
      .references(() => admins.id),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("invites_sent_idx").on(t.sentAt)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => admins.id),
    action: text("action").notNull(),
    target: text("target"),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_ts_idx").on(t.timestamp)],
);

export type Visitor = typeof visitors.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
