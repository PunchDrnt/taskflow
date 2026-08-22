import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from '@repo/ui/components/attachment'
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from '@repo/ui/components/avatar'
import { Badge } from '@repo/ui/components/badge'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@repo/ui/components/carousel'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@repo/ui/components/empty'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@repo/ui/components/pagination'
import { Spinner } from '@repo/ui/components/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui/components/table'

import { Example } from '../_lib/shared'

export default function DataDisplayPage() {
  return (
    <div className="flex flex-col gap-10 py-8">
      <Example title="Table" description="Rows, selected state, cell content.">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Alpha</TableCell>
              <TableCell>
                <Badge color="success" variant="secondary">
                  Active
                </Badge>
              </TableCell>
            </TableRow>
            <TableRow data-state="selected">
              <TableCell>Beta (selected row)</TableCell>
              <TableCell>
                <Badge color="warning" variant="secondary">
                  Pending
                </Badge>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Example>

      <Example title="Avatar" description="Image + fallback, sizes, grouping.">
        <Avatar>
          <AvatarFallback>AB</AvatarFallback>
        </Avatar>
        <Avatar size="sm">
          <AvatarFallback>SM</AvatarFallback>
        </Avatar>
        <Avatar size="lg">
          <AvatarFallback>LG</AvatarFallback>
        </Avatar>
        <AvatarGroup>
          <Avatar>
            <AvatarFallback>A</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback>B</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback>C</AvatarFallback>
          </Avatar>
          <AvatarGroupCount>+3</AvatarGroupCount>
        </AvatarGroup>
      </Example>

      <Example
        title="Attachment"
        description="File chip with state, actions, and a scrollable group."
      >
        <AttachmentGroup>
          <Attachment state="done">
            <AttachmentMedia>📄</AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>invoice.pdf</AttachmentTitle>
              <AttachmentDescription>128 KB</AttachmentDescription>
            </AttachmentContent>
            <AttachmentActions>
              <AttachmentAction aria-label="Remove">✕</AttachmentAction>
            </AttachmentActions>
          </Attachment>
          <Attachment state="uploading">
            <AttachmentMedia>
              <Spinner />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>report.xlsx</AttachmentTitle>
              <AttachmentDescription>Uploading…</AttachmentDescription>
            </AttachmentContent>
          </Attachment>
        </AttachmentGroup>
      </Example>

      <Example title="Pagination" description="Page links with active state.">
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious href="#" />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#" isActive>
                1
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#">2</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext href="#" />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </Example>

      <Example title="Carousel" description="Swipeable slide container.">
        <Carousel className="mx-12 w-full">
          <CarouselContent>
            {[1, 2, 3].map((i) => (
              <CarouselItem
                key={i}
                className="bg-action-hover flex h-24 items-center justify-center rounded-lg"
              >
                Slide {i}
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </Example>

      <Example title="Empty" description="Empty state placeholder.">
        <Empty className="border-divider w-full border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Spinner />
            </EmptyMedia>
            <EmptyTitle>No results</EmptyTitle>
            <EmptyDescription>Try adjusting your search.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Example>
    </div>
  )
}
