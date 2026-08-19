'use client'

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
import { toast, Toaster } from '@repo/ui/components/toast'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@repo/ui/components/tooltip'

export default function OverlaysPage() {
  return (
    <div className="flex flex-wrap items-center gap-3 py-8">
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

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={<Button variant="outline">Hover me</Button>}
          />
          <TooltipContent>Always-inverted tooltip</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Button
        variant="outline"
        color="success"
        onClick={() =>
          toast.add({
            title: 'Saved',
            description: 'Your changes were saved.',
            type: 'success',
          })
        }
      >
        Success toast
      </Button>
      <Button
        variant="outline"
        color="error"
        onClick={() =>
          toast.add({
            title: 'Error',
            description: 'Something went wrong.',
            type: 'error',
          })
        }
      >
        Error toast
      </Button>

      <Toaster />
    </div>
  )
}
