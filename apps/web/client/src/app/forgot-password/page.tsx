import type { Metadata } from 'next'

import { ForgotPasswordForm } from '@/components/organisms/forgot-password-form'

export const metadata: Metadata = {
  title: 'Reset your password · Taskflow',
}

/**
 * Where somebody who cannot sign in starts.
 *
 * One centred column rather than the sign-in screen's two: there is nothing to
 * explain here that the person did not already come looking for, and the panel
 * that sells the product to a first-time visitor is noise to somebody locked
 * out of it.
 */
export default function ForgotPasswordPage() {
  return (
    <main className="bg-default flex min-h-screen items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-5">
        <span className="subtitle-2 text-primary-main font-bold">Taskflow</span>

        <div className="flex flex-col gap-1.5">
          <h1 className="h5">Reset your password</h1>
          <p className="text-text-secondary body-2">
            Enter the email you sign in with and we will send a link to set a
            new one.
          </p>
        </div>

        <ForgotPasswordForm />
      </div>
    </main>
  )
}
