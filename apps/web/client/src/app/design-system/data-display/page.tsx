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
import { Label } from '@repo/ui/components/label'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@repo/ui/components/pagination'
import { Separator } from '@repo/ui/components/separator'
import { Spinner } from '@repo/ui/components/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui/components/table'

export default function DataDisplayPage() {
  return (
    <div className="flex flex-col gap-8 py-8">
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

      <Carousel className="mx-12">
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

      <Empty className="border-divider border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Spinner />
          </EmptyMedia>
          <EmptyTitle>No results</EmptyTitle>
          <EmptyDescription>Try adjusting your search.</EmptyDescription>
        </EmptyHeader>
      </Empty>

      <div className="flex items-center gap-4">
        <Spinner />
        <Separator orientation="vertical" className="h-6" />
        <Label>Loading…</Label>
      </div>
    </div>
  )
}
