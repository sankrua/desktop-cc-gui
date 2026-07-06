import { invoke } from "@tauri-apps/api/core";
import type {
  CheckEmailInboxRequest,
  CheckEmailInboxResult,
  ClaimMailCommandResult,
  CompleteMailCommandRequest,
  EmailInboundListenerStatus,
  EmailInboundSettingsView,
  EmailMailSessionList,
  EmailSenderSettingsView,
  EmailSendError,
  EmailSendResult,
  MutateMailSessionRequest,
  SendConversationCompletionEmailRequest,
  SendTestEmailRequest,
  UpdateEmailInboundSettingsRequest,
  UpdateEmailSenderSettingsRequest,
} from "../../types";

const EMAIL_SEND_ERROR_PREFIX = "EMAIL_SEND_ERROR:";

function normalizeEmailSendError(error: unknown): EmailSendError {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith(EMAIL_SEND_ERROR_PREFIX)) {
    try {
      return JSON.parse(message.slice(EMAIL_SEND_ERROR_PREFIX.length)) as EmailSendError;
    } catch {
      // Fall through to a generic structured error.
    }
  }
  return {
    code: "unknown",
    retryable: false,
    userMessage: message || "Email command failed.",
  };
}

async function invokeEmailCommand<T>(
  command: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(command, payload);
  } catch (error) {
    throw normalizeEmailSendError(error);
  }
}

export async function getEmailSenderSettings(): Promise<EmailSenderSettingsView> {
  return invokeEmailCommand<EmailSenderSettingsView>("get_email_sender_settings");
}

export async function updateEmailSenderSettings(
  request: UpdateEmailSenderSettingsRequest,
): Promise<EmailSenderSettingsView> {
  return invokeEmailCommand<EmailSenderSettingsView>("update_email_sender_settings", {
    request,
  });
}

export async function sendTestEmail(
  request: SendTestEmailRequest,
): Promise<EmailSendResult> {
  return invokeEmailCommand<EmailSendResult>("send_test_email", { request });
}

export async function sendConversationCompletionEmail(
  request: SendConversationCompletionEmailRequest,
): Promise<EmailSendResult> {
  return invokeEmailCommand<EmailSendResult>("send_conversation_completion_email", { request });
}

export async function getEmailInboundSettings(): Promise<EmailInboundSettingsView> {
  return invoke<EmailInboundSettingsView>("get_email_inbound_settings");
}

export async function updateEmailInboundSettings(
  request: UpdateEmailInboundSettingsRequest,
): Promise<EmailInboundSettingsView> {
  return invoke<EmailInboundSettingsView>("update_email_inbound_settings", { request });
}

export async function getEmailInboundListenerStatus(): Promise<EmailInboundListenerStatus> {
  return invoke<EmailInboundListenerStatus>("get_email_inbound_listener_status");
}

export async function checkEmailInbox(
  request: CheckEmailInboxRequest = {},
): Promise<CheckEmailInboxResult> {
  return invoke<CheckEmailInboxResult>("check_email_inbox", { request });
}

export async function listEmailMailSessions(): Promise<EmailMailSessionList> {
  return invoke<EmailMailSessionList>("list_email_mail_sessions");
}

export async function mutateEmailMailSession(
  request: MutateMailSessionRequest,
): Promise<EmailMailSessionList> {
  return invoke<EmailMailSessionList>("mutate_email_mail_session", { request });
}

export async function claimNextEmailMailCommand(): Promise<ClaimMailCommandResult> {
  return invoke<ClaimMailCommandResult>("claim_next_email_mail_command");
}

export async function completeEmailMailCommand(
  request: CompleteMailCommandRequest,
): Promise<EmailMailSessionList> {
  return invoke<EmailMailSessionList>("complete_email_mail_command", { request });
}
