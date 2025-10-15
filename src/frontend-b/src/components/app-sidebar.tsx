"use client"

import * as React from "react"
import { Settings, FolderOpen, Play, Zap, ChevronRight } from "lucide-react"
import { usePathname } from "next/navigation"
import Link from "next/link"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

const menuItems = [
  {
    title: "构造",
    icon: Settings,
    url: "/construct",
    items: [
      { title: "新建配置", url: "/construct/new" },
      { title: "编辑配置", url: "/construct/edit" },
    ],
  },
  {
    title: "读取",
    icon: FolderOpen,
    url: "/read",
    items: [
      { title: "浏览文件", url: "/read/browse" },
      { title: "最近打开", url: "/read/recent" },
    ],
  },
  {
    title: "仿真",
    icon: Play,
    url: "/simulation",
    items: [
      { title: "运行仿真", url: "/simulation/run" },
      { title: "历史记录", url: "/simulation/history" },
    ],
  },
  {
    title: "优化",
    icon: Zap,
    url: "/optimization",
    items: [
      { title: "参数优化", url: "/optimization/params" },
      { title: "优化历史", url: "/optimization/history" },
    ],
  },
]

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>仿真系统</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <Collapsible key={item.title} defaultOpen={pathname.startsWith(item.url)} asChild>
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                        <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {item.items.map((subItem) => (
                          <SidebarMenuSubItem key={subItem.title}>
                            <SidebarMenuSubButton asChild isActive={pathname === subItem.url}>
                              <Link href={subItem.url}>{subItem.title}</Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
