'use client'

import { Button } from '@repo/ui/components/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@repo/ui/components/collapsible'
import { Separator } from '@repo/ui/components/separator'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@repo/ui/components/sidebar'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@repo/ui/components/tabs'

import { Example } from '../_lib/shared'

export default function NavigationPage() {
  return (
    <div className="flex flex-col gap-10 py-8">
      <Example title="Tabs" description="Switch between related views.">
        <Tabs defaultValue="list" className="w-full max-w-sm">
          <TabsList>
            <TabsTrigger value="list">List</TabsTrigger>
            <TabsTrigger value="board">Board</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
          </TabsList>
          <TabsContent value="list">List view content.</TabsContent>
          <TabsContent value="board">Board view content.</TabsContent>
          <TabsContent value="calendar">Calendar view content.</TabsContent>
        </Tabs>
      </Example>

      <Example
        title="Collapsible"
        description="Toggle a section open or closed."
      >
        <Collapsible className="w-full max-w-sm">
          <CollapsibleTrigger
            render={<Button variant="outline">Toggle details</Button>}
          />
          <CollapsibleContent className="text-body-md text-text-secondary pt-3">
            Hidden content revealed on toggle.
          </CollapsibleContent>
        </Collapsible>
      </Example>

      <Example title="Separator" description="Visual divider between content.">
        <div className="flex h-6 items-center gap-4">
          <span className="body-2">Left</span>
          <Separator orientation="vertical" />
          <span className="body-2">Right</span>
        </div>
      </Example>

      <Example
        title="Sidebar"
        description="App-shell navigation. Normally fills the viewport height — shown here contained with collapsible='none'."
        className="p-0"
      >
        <div className="h-80 w-full overflow-hidden rounded-lg">
          <SidebarProvider className="h-full min-h-0">
            <Sidebar collapsible="none" className="border-divider border-r">
              <SidebarHeader>
                <span className="subtitle-4 px-2">Taskflow</span>
              </SidebarHeader>
              <SidebarContent>
                <SidebarGroup>
                  <SidebarGroupLabel>Project</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton isActive>My Tasks</SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton>Board</SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton>Settings</SidebarMenuButton>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </SidebarContent>
            </Sidebar>
            <div className="body-2 text-text-secondary flex flex-1 items-center justify-center">
              Page content
            </div>
          </SidebarProvider>
        </div>
      </Example>
    </div>
  )
}
