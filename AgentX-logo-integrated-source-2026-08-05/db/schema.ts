import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  status: text("status").notNull().default("active"),
  channel: text("channel").notNull().default("web"),
  consentGiven: integer("consent_given", { mode: "boolean" }).notNull().default(false),
  /** Tenant that owns this conversation. Set once, at session creation. */
  ownerEmail: text("owner_email").notNull().default(""),
  startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  endedAt: text("ended_at"),
}, (table) => [
  index("conversations_owner_idx").on(table.ownerEmail),
]);

export const leads = sqliteTable("leads", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").references(() => conversations.id),
  name: text("name").notNull(),
  company: text("company").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  location: text("location").notNull().default(""),
  service: text("service").notNull().default(""),
  timeline: text("timeline").notNull().default(""),
  preferredContact: text("preferred_contact").notNull().default(""),
  source: text("source").notNull().default("voice-agent"),
  status: text("status").notNull().default("new"),
  /** Tenant that owns this record, copied from its conversation. */
  ownerEmail: text("owner_email").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("leads_owner_idx").on(table.ownerEmail),
]);

export const appointmentRequests = sqliteTable("appointment_requests", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").references(() => conversations.id),
  leadId: text("lead_id").references(() => leads.id),
  name: text("name").notNull(),
  contact: text("contact").notNull(),
  requestedDate: text("requested_date").notNull(),
  requestedTime: text("requested_time").notNull().default(""),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  service: text("service").notNull().default(""),
  notes: text("notes").notNull().default(""),
  status: text("status").notNull().default("requested"),
  /** Tenant that owns this record, copied from its conversation. */
  ownerEmail: text("owner_email").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("appointment_requests_owner_idx").on(table.ownerEmail),
]);

export const handoffRequests = sqliteTable("handoff_requests", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").references(() => conversations.id),
  name: text("name").notNull().default(""),
  contact: text("contact").notNull(),
  reason: text("reason").notNull(),
  urgency: text("urgency").notNull().default("normal"),
  status: text("status").notNull().default("queued"),
  /** Tenant that owns this record, copied from its conversation. */
  ownerEmail: text("owner_email").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("handoff_requests_owner_idx").on(table.ownerEmail),
]);

export const conversationEvents = sqliteTable("conversation_events", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id),
  role: text("role").notNull(),
  eventType: text("event_type").notNull(),
  content: text("content").notNull().default(""),
  /** Tenant that owns this record, copied from its conversation. */
  ownerEmail: text("owner_email").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("conversation_events_conversation_idx").on(table.conversationId),
]);

export const createdAgents = sqliteTable("created_agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  clientName: text("client_name").notNull().default(""),
  businessName: text("business_name").notNull().default(""),
  industry: text("industry").notNull().default(""),
  agentType: text("agent_type").notNull(),
  primaryGoal: text("primary_goal").notNull(),
  languages: text("languages").notNull().default("English"),
  voice: text("voice").notNull().default("marin"),
  tone: text("tone").notNull().default("professional"),
  channels: text("channels").notNull().default("web"),
  capabilities: text("capabilities").notNull().default(""),
  integrations: text("integrations").notNull().default(""),
  instructions: text("instructions").notNull(),
  welcomeMessage: text("welcome_message").notNull(),
  status: text("status").notNull().default("draft"),
  source: text("source").notNull().default("studio"),
  accessKeyHash: text("access_key_hash").notNull().default(""),
  accessKeyHint: text("access_key_hint").notNull().default(""),
  ownerEmail: text("owner_email").notNull().default(""),
  /** Vapi assistant that answers this agent's phone calls. */
  vapiAssistantId: text("vapi_assistant_id").notNull().default(""),
  /** Phone number attached to this agent, in E.164. */
  vapiPhoneNumber: text("vapi_phone_number").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("created_agents_vapi_assistant_idx").on(table.vapiAssistantId),
]);

export const agentDeployments = sqliteTable("agent_deployments", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => createdAgents.id),
  channel: text("channel").notNull().default("website"),
  publicTokenHash: text("public_token_hash").notNull(),
  tokenHint: text("token_hint").notNull().default(""),
  allowedDomains: text("allowed_domains").notNull().default(""),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const knowledgeSources = sqliteTable("knowledge_sources", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => createdAgents.id),
  name: text("name").notNull(),
  sourceType: text("source_type").notNull(),
  sourceUrl: text("source_url").notNull().default(""),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const usageEvents = sqliteTable("usage_events", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().default("platform"),
  ownerEmail: text("owner_email").notNull().default(""),
  eventType: text("event_type").notNull(),
  quantity: integer("quantity").notNull().default(1),
  costPaise: integer("cost_paise").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/** Short-lived, hashed request counters used to protect paid provider routes. */
export const requestLimits = sqliteTable("request_limits", {
  key: text("key").primaryKey(),
  windowStartedAt: integer("window_started_at").notNull(),
  requestCount: integer("request_count").notNull().default(1),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  index("request_limits_updated_idx").on(table.updatedAt),
]);

export const integrations = sqliteTable("integrations", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => createdAgents.id),
  provider: text("provider").notNull(),
  status: text("status").notNull().default("configuration_required"),
  lastCheckedAt: text("last_checked_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const agentVersions = sqliteTable("agent_versions", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => createdAgents.id),
  version: integer("version").notNull().default(1),
  snapshot: text("snapshot").notNull(),
  status: text("status").notNull().default("draft"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
