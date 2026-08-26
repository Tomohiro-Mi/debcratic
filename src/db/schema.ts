import {
  pgTable,
  text,
  integer,
  real,
  boolean,
  jsonb,
  uuid,
  timestamp,
  bigserial,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { CommentSuffix } from "@/lib/constants";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  sessionVersion: integer("session_version").notNull().default(0),
  role: text("role").$type<"user" | "admin">().notNull().default("user"),
  bannedAt: timestamp("banned_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cats = pgTable("cats", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("🐱"),
  gender: text("gender").$type<"オス" | "メス" | "セン">().notNull().default("セン"),
  commentSuffix: text("comment_suffix").$type<CommentSuffix>().notNull().default("普通"),
  power: integer("power").notNull().default(1),
  factionId: uuid("faction_id"),
  leaderId: text("leader_id"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const factions = pgTable("factions", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  leaderId: text("leader_id")
    .notNull()
    .references(() => cats.id),
  foundedTurn: integer("founded_turn").notNull().default(0),
  status: text("status").$type<"active" | "dissolved">().notNull().default("active"),
  dissolvedTurn: integer("dissolved_turn"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const factionMemberships = pgTable(
  "faction_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    factionId: uuid("faction_id")
      .notNull()
      .references(() => factions.id, { onDelete: "cascade" }),
    catId: text("cat_id")
      .notNull()
      .references(() => cats.id, { onDelete: "cascade" }),
    role: text("role").$type<"leader" | "follower">().notNull(),
    joinedTurn: integer("joined_turn").notNull(),
    leftTurn: integer("left_turn"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("fm_cat_active_idx").on(t.catId, t.leftTurn)],
);

export const proposals = pgTable(
  "proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    authorId: uuid("author_id").references(() => users.id),
    status: text("status")
      .$type<"OPEN" | "RUNOFF_PENDING" | "RUNOFF" | "CLOSED">()
      .notNull()
      .default("OPEN"),
    deadline: timestamp("deadline", { withTimezone: true }).notNull(),
    adoptedOpinionId: uuid("adopted_opinion_id"),
    runoffStartedAt: timestamp("runoff_started_at", { withTimezone: true }),
    runoffAutoStartAt: timestamp("runoff_auto_start_at", { withTimezone: true }),
    runoffTurnsDone: integer("runoff_turns_done").notNull().default(0),
    turnLockedUntil: timestamp("turn_locked_until", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("proposals_status_idx").on(t.status)],
);

export const proposalParameters = pgTable("proposal_parameters", {
  id: uuid("id").defaultRandom().primaryKey(),
  proposalId: uuid("proposal_id")
    .notNull()
    .references(() => proposals.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const proposalCatValues = pgTable(
  "proposal_cat_values",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    catId: text("cat_id")
      .notNull()
      .references(() => cats.id, { onDelete: "cascade" }),
    values: jsonb("values").$type<Record<string, number>>().notNull().default({}),
  },
  (t) => [uniqueIndex("pcv_proposal_cat_uq").on(t.proposalId, t.catId)],
);

export const opinions = pgTable(
  "opinions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id),
    content: text("content").notNull(),
    point: integer("point").notNull().default(0),
    prevPoint: integer("prev_point").notNull().default(0),
    lastVotedAt: timestamp("last_voted_at", { withTimezone: true }),
    nextVoteDue: timestamp("next_vote_due", { withTimezone: true }).notNull().defaultNow(),
    eligible: boolean("eligible").notNull().default(true),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("opinions_due_idx").on(t.proposalId, t.nextVoteDue)],
);

export const turns = pgTable(
  "turns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    kind: text("kind").$type<"initial" | "regular" | "runoff">().notNull(),
    randomSeed: text("random_seed").notNull(),
    executedAt: timestamp("executed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("turns_proposal_number_uq").on(t.proposalId, t.number)],
);

export type VoteFactor = { label: string; delta: number };

export const votes = pgTable(
  "votes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    turnId: uuid("turn_id")
      .notNull()
      .references(() => turns.id, { onDelete: "cascade" }),
    opinionId: uuid("opinion_id")
      .notNull()
      .references(() => opinions.id, { onDelete: "cascade" }),
    catId: text("cat_id").notNull(),
    score: integer("score").notNull(),
    stance: text("stance").$type<"for" | "neutral" | "against">().notNull(),
    reason: text("reason").notNull().default(""),
    confidence: real("confidence").notNull().default(0.5),
    factors: jsonb("factors").$type<VoteFactor[]>().notNull().default([]),
    model: text("model").notNull().default("demo"),
    promptVersion: text("prompt_version").notNull().default("vote-v1"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("votes_opinion_cat_idx").on(t.opinionId, t.catId),
    index("votes_cat_idx").on(t.catId),
  ],
);

export const events = pgTable(
  "events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    proposalId: uuid("proposal_id").references(() => proposals.id, {
      onDelete: "cascade",
    }),
    turnNumber: integer("turn_number"),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_proposal_idx").on(t.proposalId, t.id)],
);

export const llmLogs = pgTable("llm_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  opinionId: uuid("opinion_id"),
  turnId: uuid("turn_id"),
  model: text("model").notNull(),
  provider: text("provider").notNull().default("openrouter"),
  temperature: real("temperature").notNull().default(0.7),
  promptVersion: text("prompt_version").notNull(),
  inputHash: text("input_hash").notNull(),
  output: jsonb("output").$type<Record<string, unknown>>().notNull().default({}),
  ok: boolean("ok").notNull().default(true),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const systemSettings = pgTable("system_settings", {
  id: integer("id").primaryKey().default(1),
  llmModel: text("llm_model"),
  llmApiKeyEnc: text("llm_api_key_enc"),
  temperature: real("temperature"),
  exilePenaltyProb: real("exile_penalty_prob"),
  changeWindow: integer("change_window"),
  changeThreshold: integer("change_threshold"),
  runoffTurnLimit: integer("runoff_turn_limit"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reports = pgTable("reports", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  reporterId: uuid("reporter_id").references(() => users.id),
  targetType: text("target_type").$type<"opinion" | "proposal">().notNull(),
  targetId: uuid("target_id").notNull(),
  reason: text("reason").notNull().default(""),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Cat = typeof cats.$inferSelect;
export type Faction = typeof factions.$inferSelect;
export type Proposal = typeof proposals.$inferSelect;
export type ProposalParameter = typeof proposalParameters.$inferSelect;
export type Opinion = typeof opinions.$inferSelect;
export type Turn = typeof turns.$inferSelect;
export type Vote = typeof votes.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type Report = typeof reports.$inferSelect;
