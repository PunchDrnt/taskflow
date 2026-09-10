import { redirect } from 'next/navigation'

import { ProfileForm } from '../../../../components/organisms/profile-form'
import { currentUser } from '../../../../lib/api/me'

/**
 * Your own details.
 *
 * `GET /v1/me` is `@SkipOrgScope()`, so this works for somebody in no
 * organisation as well — which matters, because it is one of the two screens
 * that account can reach at all.
 */
export default async function ProfilePage() {
  const me = await currentUser()

  if (me === null) redirect('/login')

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <header>
        <h1 className="h6">Profile</h1>
        <p className="text-text-secondary body-2 mt-1">
          How you appear to everyone else in Taskflow.
        </p>
      </header>

      <ProfileForm me={me} />
    </div>
  )
}
