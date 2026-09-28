export const GMAIL_STATUSES = ["unknown", "pending", "connected", "declined", "other_provider", "later"] as const;
export type GmailStatus = (typeof GMAIL_STATUSES)[number];

/** A row of `onboarding_sessions` as returned by Rork Cloud. */
export interface OnboardingSession {
  id: string;
  device_id: string;
  user_name: string | null;
  help_need: string | null;
  gmail_status: GmailStatus;
  gmail_email: string | null;
  gmail_note: string | null;
  agent_name: string | null;
  graduated: boolean;
  created_at: string;
  updated_at: string;
}

/** Fields the client is allowed to change via update-session. */
export type SessionPatch = Partial<
  Pick<OnboardingSession, "user_name" | "help_need" | "gmail_status" | "gmail_email" | "gmail_note" | "agent_name" | "graduated">
>;

/** A row of `onboarding_messages` as returned by Rork Cloud. */
export interface StoredMessage {
  id: string;
  session_id: string;
  role: "persona" | "user" | "system";
  channel: "voice" | "text";
  text: string;
  meta: StoredMessageMeta | null;
  created_at: string;
}

/** Extra data kept alongside a message so cards and buttons survive a refresh. */
export interface StoredMessageMeta {
  actions?: { label: string; intent: "start-call" | "text-instead" }[];
  card?: "gmail-connect" | "finish";
  call?: "ended" | "canceled" | "dropped" | "cutoff" | "failed";
  source?: "agent" | "app";
}

export interface NewStoredMessage {
  id: string;
  role: StoredMessage["role"];
  channel: StoredMessage["channel"];
  text: string;
  meta?: StoredMessageMeta;
}

export interface ToolCallLog {
  id: string;
  at: number;
  name: string;
  params: string;
  result: string;
}

export interface StoreError {
  id: string;
  at: number;
  message: string;
}
