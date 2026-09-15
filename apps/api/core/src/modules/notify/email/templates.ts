import type { OutgoingEmail } from './email.transport'

/**
 * What each `notify.outbox.template` turns into.
 *
 * Phase 1's first real one is `password_reset`; the rest arrive with the
 * features that send them.
 * What matters is that the outbox stores a template name and a payload
 * rather than a rendered subject and body — a queued row rendered at write
 * time would go out with wording that has since been corrected, and could not
 * be re-rendered in the recipient's language.
 */
type Renderer = (payload: Record<string, unknown>) => Omit<OutgoingEmail, 'to'>

const TEMPLATES: Record<string, Renderer> = {
  /**
   * The forgotten-password link. Plain text on purpose for now: the link has
   * to be readable and clickable in every client, and an HTML mail that a
   * client strips leaves nothing behind.
   *
   * The URL is built where the token is issued, not here — this renderer runs
   * in OutboxWorker, long after the request, and must not be able to mint one.
   */
  password_reset: (payload) => ({
    subject: 'Reset your password · Taskflow',
    text: [
      `Hi ${String(payload.name ?? '')}`.trimEnd() + ',',
      '',
      'Somebody asked to reset the password for this account.',
      'If that was you, use the link below.',
      String(payload.url ?? ''),
      '',
      `This link works once and expires in ${String(payload.expiresInMinutes ?? '')} minutes.`,
      'If it was not you, nothing needs doing — your current password still works.',
    ].join('\n'),
  }),

  /**
   * Somebody was given a task. The only notification Phase 1 sends
   * (docs/04-features/phase-1.md#notifications) — without it a person has no
   * reason to come back to the tool, and with any more the mail becomes noise
   * people filter away, taking this one with it.
   *
   * Everything readable is in the payload rather than looked up here: this
   * renderer runs inside `OutboxWorker`, long after the request, with no
   * organisation context and no right to read anybody's rows.
   */
  task_assigned: (payload) => ({
    subject: `[${String(payload.taskKey ?? '')}] ${String(payload.title ?? '')}`,
    text: [
      `Hi ${String(payload.recipientName ?? '')}`.trimEnd() + ',',
      '',
      `${String(payload.assignedByName ?? 'Somebody')} assigned you a task in ${String(payload.projectName ?? '')}`,
      '',
      `${String(payload.taskKey ?? '')} · ${String(payload.title ?? '')}`,
      String(payload.url ?? ''),
    ].join('\n'),
  }),
}

export function renderTemplate(
  template: string,
  payload: Record<string, unknown>,
): Omit<OutgoingEmail, 'to'> {
  const renderer = TEMPLATES[template]
  if (renderer) return renderer(payload)

  // Deliberately not a throw. A template nobody has written yet must not put
  // the row into a retry loop; the message goes out plainly and the log says
  // which template is missing.
  return {
    subject: `Taskflow: ${template}`,
    text: JSON.stringify(payload, null, 2),
  }
}
