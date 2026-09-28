/** What a quick-reply pill under a Persona bubble does when tapped. */
export type ThreadActionIntent = "start-call" | "text-instead";

export interface ThreadAction {
  id: string;
  label: string;
  intent: ThreadActionIntent;
}

/** Where a thread line came from: typed chat or a voice call transcript. */
export type MessageChannel = "voice" | "text";

/** Marks system lines that describe how a call ended (used for the resumed opening line). */
export type CallMarker = "ended" | "canceled" | "dropped" | "cutoff" | "failed";

/** Interactive cards Persona can drop into the thread. */
export type ThreadCard = "gmail-connect" | "finish";

interface BaseMessage {
  id: string;
  createdAt: number;
  channel: MessageChannel;
}

export interface UserMessage extends BaseMessage {
  kind: "user";
  text: string;
}

export interface PersonaMessage extends BaseMessage {
  kind: "persona";
  text: string;
  actions?: ThreadAction[];
  /** "agent" = produced by the ElevenLabs agent; "app" = scripted by the app. */
  source: "agent" | "app";
}

/** Small centered gray line, e.g. "Call ended · 1:23". */
export interface SystemMessage extends BaseMessage {
  kind: "system";
  text: string;
  call?: CallMarker;
}

export interface CardMessage extends BaseMessage {
  kind: "card";
  card: ThreadCard;
}

export type ThreadMessage = UserMessage | PersonaMessage | SystemMessage | CardMessage;
