'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@repo/ui/components/alert-dialog'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@repo/ui/components/popover'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@repo/ui/components/sheet'

import { Example } from '../_lib/shared'

export default function OverlaysPage() {
  return (
    <div className="flex flex-col gap-10 py-8">
      <Example
        title="Dialog"
        description="Modal for a focused action, dismissable."
      >
        <Dialog>
          <DialogTrigger render={<Button>Open dialog</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm action</DialogTitle>
              <DialogDescription>
                This is a dialog styled with the project tokens.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline">Cancel</Button>} />
              <DialogClose render={<Button color="error">Confirm</Button>} />
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Example>

      <Example
        title="Alert dialog"
        description="Confirmation that blocks until the user chooses — for destructive or irreversible actions."
      >
        <AlertDialog>
          <AlertDialogTrigger
            render={<Button color="error">Delete project</Button>}
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this project?</AlertDialogTitle>
              <AlertDialogDescription>
                This soft-deletes the project and everything under it. This can
                be undone within 90 days.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel render={<Button variant="outline" />}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction render={<Button color="error" />}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Example>

      <Example
        title="Dropdown menu"
        description="Contextual list of actions anchored to a trigger."
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline">Options</Button>}
          />
          <DropdownMenuContent>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Task</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Edit</DropdownMenuItem>
              <DropdownMenuItem>Duplicate</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </Example>

      <Example
        title="Popover"
        description="Anchored panel for secondary content, stays open until dismissed."
      >
        <Popover>
          <PopoverTrigger render={<Button variant="outline">Details</Button>} />
          <PopoverContent>
            <PopoverHeader>
              <PopoverTitle>Task details</PopoverTitle>
              <PopoverDescription>
                Anchored panel — click outside to close.
              </PopoverDescription>
            </PopoverHeader>
          </PopoverContent>
        </Popover>
      </Example>

      <Example
        title="Sheet"
        description="Slide-in panel from an edge — a heavier drawer for forms or filters."
      >
        <Sheet>
          <SheetTrigger
            render={<Button variant="outline">Open sheet</Button>}
          />
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
              <SheetDescription>
                Slides in from the edge of the screen.
              </SheetDescription>
            </SheetHeader>
            <SheetFooter>
              <SheetClose render={<Button variant="outline">Close</Button>} />
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </Example>
    </div>
  )
}
