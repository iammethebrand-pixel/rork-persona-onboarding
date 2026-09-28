import type { OnboardingSession } from "@/types/onboarding";
import type { ThreadMessage } from "@/types/thread";

export const FRESH_OPENING_LINE = "Hey! It's Persona. Can you hear me okay?";
export const RESUMED_OPENING_LINE = "Hey, it's Persona again! Looks like we got cut off.";

export type SessionMode = "voice" | "text";

export type DynamicVariables = Record<string, string>;

const orUnknown = (value: string | null | undefined): string => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "unknown";
};

function lastPersonaMessage(messages: ThreadMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.kind === "persona") return m.text;
  }
  return "";
}

/** True when an earlier call actually connected (hung up or cut off) and onboarding isn't finished. */
function hasPriorCall(messages: ThreadMessage[]): boolean {
  return messages.some(
    (m) => m.kind === "system" && (m.call === "ended" || m.call === "dropped" || m.call === "cutoff"),
  );
}

/** True when the agent has already talked with this user (voice or text). */
function hasPriorConversation(messages: ThreadMessage[]): boolean {
  return messages.some((m) => (m.kind === "persona" && m.source === "agent") || m.channel === "voice");
}

const isMissing = (value: string | undefined): boolean => !value || value === "unknown";

/**
 * Persona's first text after the user taps "Text instead": asks for the next
 * missing onboarding step (name, then help need, then Gmail, then agent name).
 */
export function textInsteadLine(vars: DynamicVariables): string {
  const lead = "No worries, texting works!";
  if (isMissing(vars.user_name)) return `${lead} What should I call you?`;
  if (isMissing(vars.help_need)) return `${lead} What can I help you with, ${vars.user_name}?`;
  if (vars.gmail_status === "unknown" || vars.gmail_status === "pending") {
    return `${lead} Want to connect your Gmail so I can keep an eye on your inbox?`;
  }
  if (isMissing(vars.agent_name)) {
    return `${lead} Last thing: I go by Persona, but you can name me whatever you want. What should I be called?`;
  }
  return `${lead} What can I help you with next?`;
}

/**
 * Builds the dynamic variables passed on every ElevenLabs session start.
 * Voice: opening_line depends on whether this is a call back mid-onboarding.
 * Text: opening_line is always empty.
 */
export function buildDynamicVariables(
  mode: SessionMode,
  session: OnboardingSession | null,
  messages: ThreadMessage[],
): DynamicVariables {
  const graduated = session?.graduated ?? false;
  const resumed = mode === "voice" ? !graduated && hasPriorCall(messages) : hasPriorConversation(messages);
  const openingLine = mode === "voice" ? (resumed ? RESUMED_OPENING_LINE : FRESH_OPENING_LINE) : "";

  return {
    mode,
    user_name: orUnknown(session?.user_name),
    help_need: orUnknown(session?.help_need),
    gmail_status: orUnknown(session?.gmail_status),
    agent_name: orUnknown(session?.agent_name),
    resumed: resumed ? "true" : "false",
    last_persona_message: lastPersonaMessage(messages),
    opening_line: openingLine,
  };
}
