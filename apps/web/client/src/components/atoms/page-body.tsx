/**
 * How wide a screen's content is, decided once instead of per page.
 *
 * Before this there were five different caps across six screens, each picked
 * by eye, and every one of them centred. The design has an actual rule, and
 * these are its two answers:
 *
 * | width | cap | used by | why that number |
 * | --- | --- | --- | --- |
 * | `reading` | 640px | Home, Profile | a column of prose and form fields · past ~70 characters the eye loses the start of the next line |
 * | `wide` | 1152px | My tasks, Projects, a project's board, project settings | a table with six columns needs the room, and the toolbar above it needs to hold a search box and three chips on one line |
 *
 * **Centred, all of them.** Left-aligning a capped column next to a sidebar
 * was tried and looked broken: on a wide screen the content hugs the sidebar
 * and leaves a third of the window empty to the right, which reads as a layout
 * that failed to load rather than as a deliberate measure.
 */
export function PageBody({
  width,
  className = '',
  children,
}: {
  width: 'reading' | 'wide'
  /** Spacing between the sections of this page, and nothing else. */
  className?: string
  children: React.ReactNode
}) {
  const cap = width === 'reading' ? 'max-w-4xl' : 'max-w-6xl'

  return (
    <div
      className={`mx-auto flex w-full flex-col px-6 py-8 ${cap} ${className}`}
    >
      {children}
    </div>
  )
}
