'use client'

import { Button } from '@repo/ui/components/button'
import { Progress } from '@repo/ui/components/progress'
import { Skeleton } from '@repo/ui/components/skeleton'
import { Spinner } from '@repo/ui/components/spinner'
import { toast, Toaster } from '@repo/ui/components/toast'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@repo/ui/components/tooltip'

import { Example } from '../_lib/shared'

export default function FeedbackPage() {
  return (
    <div className="flex flex-col gap-10 py-8">
      <Example title="Progress" description="Determinate progress bar.">
        <Progress value={60} className="w-full max-w-xs" />
      </Example>

      <Example
        title="Skeleton"
        description="Placeholder while content is loading."
      >
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </Example>

      <Example title="Spinner" description="Indeterminate loading indicator.">
        <Spinner />
      </Example>

      <Example
        title="Toast"
        description="Transient notification triggered from code."
      >
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
      </Example>

      <Example
        title="Tooltip"
        description="Label shown on hover or focus of a trigger."
      >
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={<Button variant="outline">Hover me</Button>}
            />
            <TooltipContent>Always-inverted tooltip</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </Example>
    </div>
  )
}
