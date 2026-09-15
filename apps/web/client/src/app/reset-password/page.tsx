import type { Metadata } from 'next'
import Link from 'next/link'

import { buttonVariants } from '@repo/ui/components/button'

import { ResetPasswordForm } from '@/components/organisms/reset-password-form'

export const metadata: Metadata = {
  title: 'Set a new password · Taskflow',
}

/**
 * The far end of the emailed link.
 *
 * `?code=` is what `PasswordResetService` puts in the message, and the only
 * thing this page does with it is hand it to the form — it is never checked
 * here. Spending it is a single request that has to be atomic, so asking "is
 * this code any good" first would be a second round trip whose answer could be
 * stale by the time the password is submitted.
 *
 * A visit with no code at all is treated as a mistyped or truncated link,
 * which is the common way to arrive here — mail clients wrap long URLs.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const raw = (await searchParams).code
  const code = typeof raw === 'string' ? raw : ''

  return (
    <main className="bg-default flex min-h-screen items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-5">
        <span className="subtitle-2 text-primary-main font-bold">Taskflow</span>

        {code === '' ? (
          <>
            <div className="flex flex-col gap-1.5">
              <h1 className="h5">That link is incomplete</h1>
              <p className="text-text-secondary body-2">
                The address is missing its code, which usually means the link
                was cut in half by the mail client. Ask for a fresh one and open
                it directly.
              </p>
            </div>
            <Link
              href="/forgot-password"
              className={buttonVariants({ color: 'primary' })}
            >
              Send a new link
            </Link>
          </>
        ) : (
          <>
            <h1 className="h5">Set a new password</h1>
            <ResetPasswordForm code={code} />
          </>
        )}
      </div>
    </main>
  )
}
