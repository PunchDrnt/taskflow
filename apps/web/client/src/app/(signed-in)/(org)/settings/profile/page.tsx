import { redirect } from 'next/navigation'

import { PageBody } from '../../../../../components/atoms/page-body'
import { PasswordForm } from '../../../../../components/organisms/password-form'
import { ProfileForm } from '../../../../../components/organisms/profile-form'
import { currentUser } from '../../../../../lib/api/me'

/**
 * Your own details, and your password.
 *
 * `GET /v1/me` is `@SkipOrgScope()`, so this works for somebody in no
 * organisation as well — which matters, because it is one of the two screens
 * that account can reach at all.
 *
 * Two forms on one page and not two pages: they are the same errand, and they
 * submit separately only because changing a password does something a profile
 * save does not — it signs the other devices out.
 */
export default async function ProfilePage() {
  const me = await currentUser()

  if (me === null) redirect('/login')

  return (
    <PageBody width="reading" className="gap-8">
      <header className="flex flex-col gap-1">
        <span className="overlined text-text-disabled tracking-wide">
          Account
        </span>
        <h1 className="h5">Profile</h1>
        <p className="text-text-secondary body-2">
          How you appear to everyone else in Taskflow.
        </p>
      </header>

      <ProfileForm me={me} />

      <hr className="border-divider" />

      <section className="flex flex-col gap-4">
        <h2 className="subtitle-2">Change password</h2>
        <PasswordForm />
      </section>
    </PageBody>
  )
}
