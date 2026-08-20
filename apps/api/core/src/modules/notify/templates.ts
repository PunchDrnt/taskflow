import type { OutgoingEmail } from './email.transport'

/**
 * What each `notify.outbox.template` turns into.
 *
 * A stub: Phase 1 brings the real templates, in Thai, and probably a renderer.
 * What matters now is that the outbox stores a template name and a payload
 * rather than a rendered subject and body — a queued row rendered at write
 * time would go out with wording that has since been corrected, and could not
 * be re-rendered in the recipient's language.
 */
type Renderer = (payload: Record<string, unknown>) => Omit<OutgoingEmail, 'to'>

const TEMPLATES: Record<string, Renderer> = {}

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

export function isTemplateKnown(template: string): boolean {
  return template in TEMPLATES
}
