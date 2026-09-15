import { redirect } from 'next/navigation'

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@repo/ui/components/tabs'

import { PageBody } from '@/components/atoms/page-body'
import { PasswordForm } from '@/components/organisms/password-form'
import { ProfileForm } from '@/components/organisms/profile-form'
import { currentUser } from '@/lib/api/me'

/**
 * Your own details, and your password.
 *
 * `GET /v1/me` is `@SkipOrgScope()`, so this works for somebody in no
 * organisation as well — which matters, because it is one of the two screens
 * that account can reach at all.
 *
 * **Tabs rather than one scroll, which the design does not do here.** It draws
 * this screen as a single column with the password fields under a rule, and it
 * tabs the organisation's settings next door. Two account screens with two
 * different shapes is a difference that means nothing: they are both "settings
 * for a thing", reached the same way, and the one in the sidebar teaches you
 * how the one in the account menu works. The forms already submit separately —
 * `PATCH /v1/me` and `PATCH /v1/me/password` — so a tab boundary falls exactly
 * where a submit boundary already was.
 *
 * Password is its own tab and not three more fields for the same reason it was
 * its own form before: it succeeds differently, signing every other session
 * out, and that is worth its own page rather than a surprise at the bottom of
 * a save.
 */
export default async function ProfilePage() {
  const me = await currentUser()

  if (me === null) redirect('/login')

  return (
    <PageBody width="reading" className="gap-6">
      <header>
        <p className="text-text-secondary body-3 mb-1.5">
          {me.email} <span className="text-text-disabled">/</span> Account
        </p>
        <h1 className="h5">Your settings</h1>
        <p className="text-text-secondary body-2 mt-1">
          How you appear to everyone else in Taskflow, and how you get in.
        </p>
      </header>

      <Tabs defaultValue="profile">
        <TabsList
          variant="line"
          className="border-divider w-full justify-start border-b"
        >
          <TabsTrigger value="profile" className="flex-none px-3">
            Profile
          </TabsTrigger>
          <TabsTrigger value="password" className="flex-none px-3">
            Password
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="pt-4">
          <ProfileForm me={me} />
        </TabsContent>

        <TabsContent value="password" className="flex flex-col gap-4 pt-4">
          {/* Said before the fields rather than only in the success message
              beside the button. "Four other devices were signed out" is a fine
              thing to read once it has happened and a bad thing to discover
              then, if one of them was the phone you are holding. */}
          <p className="text-text-secondary body-2">
            Changing your password signs every other device out. This one stays
            signed in.
          </p>

          <PasswordForm />
        </TabsContent>
      </Tabs>
    </PageBody>
  )
}
