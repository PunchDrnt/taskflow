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
    subject: 'ตั้งรหัสผ่านใหม่ · Taskflow',
    text: [
      `สวัสดีคุณ${String(payload.name ?? '')}`,
      '',
      'มีคนขอตั้งรหัสผ่านใหม่ให้บัญชีนี้ ถ้าใช่คุณ กดลิงก์ข้างล่างได้เลย',
      String(payload.url ?? ''),
      '',
      `ลิงก์นี้ใช้ได้ครั้งเดียว และหมดอายุใน ${String(payload.expiresInMinutes ?? '')} นาที`,
      'ถ้าไม่ได้เป็นคนขอ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้ตามปกติ',
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
