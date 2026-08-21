import Link from 'next/link'

export default function Home() {
  return (
    <main className="bg-default text-text-primary flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-headline-lg font-bold">Taskflow</h1>
      <p className="text-text-secondary">apps/web/client is up and running.</p>
      <Link
        href="/design-system"
        className="text-primary-main underline underline-offset-4"
      >
        View design system
      </Link>
    </main>
  )
}
