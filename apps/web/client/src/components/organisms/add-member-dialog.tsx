import { UserPlus } from 'lucide-react'
import { useState, useTransition } from 'react'

import { Button } from '@repo/ui/components/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@repo/ui/components/dialog'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@repo/ui/components/field'
import { Input } from '@repo/ui/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/select'

import {
  addOrgMember,
  type NewMemberField,
} from '@/app/(signed-in)/(org)/settings/organization/actions'
import { blankForm } from '@/lib/forms/form-state'

/**
 * Adding a colleague, in the phase before invitations exist.
 *
 * ⏳ **The design calls this "Invite people" and puts it in its own tab marked
 * Phase 2.** Phase 1 has no invitation to send — `organization.invitations` is
 * migrated and unread — so the button says what it does: somebody with the
 * rights types the details and the account and the membership are created
 * together. Drawing the eventual invite form dimmed was the alternative, and a
 * form that cannot be submitted is a worse promise than an honest button.
 *
 * The password is the part that surprises people, so the field says why:
 * it is set here rather than emailed because the reset flow already exists and
 * is the safer way to hand one over. Nothing is sent to the address.
 *
 * An address that already has an account is **joined to this organisation**
 * rather than refused — one person, several companies, from Phase 1 — so the
 * other four boxes are ignored in that case. Only an address already in *this*
 * organisation comes back as an error.
 */
export function AddMemberDialog() {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState(blankForm<NewMemberField>())
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)

    startTransition(async () => {
      const result = await addOrgMember(formData)

      // Closed only on success, so a refusal leaves everything still typed in.
      if (
        result.error === null &&
        Object.keys(result.fieldErrors).length === 0
      ) {
        setState(blankForm<NewMemberField>())
        setOpen(false)

        return
      }

      setState(result)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button color="primary">
            <UserPlus />
            Add member
          </Button>
        }
      />

      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Add someone to this organisation</DialogTitle>
            <DialogDescription>
              Their account is created now and they can sign in immediately.
              Nothing is emailed.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {state.error !== null && (
              <p
                role="alert"
                className="border-error-main/30 bg-error-main/10 text-error-main body-2 mb-4 rounded-md border px-3 py-2"
              >
                {state.error}
              </p>
            )}

            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="member-email">Email</FieldLabel>
                <Input
                  id="member-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="off"
                  placeholder="somchai@bangmod.co.th"
                  aria-invalid={state.fieldErrors.email !== undefined}
                />
                <FieldDescription>
                  If this address already has an account, it joins this
                  organisation instead of a second one being created.
                </FieldDescription>
                {state.fieldErrors.email !== undefined && (
                  <FieldError errors={[{ message: state.fieldErrors.email }]} />
                )}
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="member-name">Full name</FieldLabel>
                  <Input
                    id="member-name"
                    name="name"
                    required
                    aria-invalid={state.fieldErrors.name !== undefined}
                  />
                  {state.fieldErrors.name !== undefined && (
                    <FieldError
                      errors={[{ message: state.fieldErrors.name }]}
                    />
                  )}
                </Field>

                <Field>
                  <FieldLabel htmlFor="member-nickname">Nickname</FieldLabel>
                  <Input
                    id="member-nickname"
                    name="nickname"
                    required
                    aria-invalid={state.fieldErrors.nickname !== undefined}
                  />
                  <FieldDescription>
                    What colleagues call them — it is what every list shows.
                  </FieldDescription>
                  {state.fieldErrors.nickname !== undefined && (
                    <FieldError
                      errors={[{ message: state.fieldErrors.nickname }]}
                    />
                  )}
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="member-username">Username</FieldLabel>
                  <Input
                    id="member-username"
                    name="username"
                    required
                    autoComplete="off"
                    aria-invalid={state.fieldErrors.username !== undefined}
                  />
                  <FieldDescription>
                    Their login name and @-mention. Lowercase, 3–30 characters.
                  </FieldDescription>
                  {state.fieldErrors.username !== undefined && (
                    <FieldError
                      errors={[{ message: state.fieldErrors.username }]}
                    />
                  )}
                </Field>

                <Field>
                  <FieldLabel htmlFor="member-role">Org role</FieldLabel>
                  <Select name="role" defaultValue="member">
                    <SelectTrigger id="member-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    Owners are appointed afterwards, from the row&rsquo;s menu.
                  </FieldDescription>
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="member-password">
                  Starting password
                </FieldLabel>
                <Input
                  id="member-password"
                  name="password"
                  type="text"
                  required
                  autoComplete="off"
                  aria-invalid={state.fieldErrors.password !== undefined}
                />
                <FieldDescription>
                  Hand it over in person, or tell them to use &ldquo;forgot
                  password&rdquo; — that flow exists and is the safer way round.
                </FieldDescription>
                {state.fieldErrors.password !== undefined && (
                  <FieldError
                    errors={[{ message: state.fieldErrors.password }]}
                  />
                )}
              </Field>
            </FieldGroup>
          </div>

          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="ghost" color="neutral">
                  Cancel
                </Button>
              }
            />
            <Button type="submit" color="primary" disabled={pending}>
              {pending ? 'Adding' : 'Add member'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
