"use client";

import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { LayoutDashboard, Building2, Search, Trophy, Lightbulb, History, Settings, LogOut, PanelLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const menuItems = [
    { title: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
    { title: "Companies", icon: Building2, href: "/companies" },
    { title: "Scans", icon: Search, href: "/scans" },
    { title: "Rankings", icon: Trophy, href: "/rankings" },
    { title: "Recommendations", icon: Lightbulb, href: "/recommendations" },
    { title: "Scan History", icon: History, href: "/history" },
  ];

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar variant="sidebar" className="border-r">
          <SidebarHeader className="p-4 border-b">
            <Link href="/" className="flex items-center gap-2">
              <div className="bg-primary p-1.5 rounded-lg">
                <Search className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-headline font-bold text-primary">VizAI</span>
            </Link>
          </SidebarHeader>
          <SidebarContent className="p-4">
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={pathname === item.href}
                    tooltip={item.title}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="p-4 border-t space-y-2">
             <SidebarMenuButton asChild>
                <Link href="/admin">
                    <Settings className="w-4 h-4" />
                    <span>Admin Panel</span>
                </Link>
             </SidebarMenuButton>
             <SidebarMenuButton className="text-destructive hover:text-destructive hover:bg-destructive/10">
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
             </SidebarMenuButton>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 overflow-auto">
          <header className="h-16 border-b bg-white flex items-center px-6 sticky top-0 z-30 justify-between">
            <div className="flex items-center gap-4">
              <SidebarTrigger />
              <h1 className="text-lg font-bold font-headline text-primary capitalize">
                {pathname.split("/").pop() || "Dashboard"}
              </h1>
            </div>
            <div className="flex items-center gap-4">
               <div className="hidden sm:flex flex-col items-end">
                  <span className="text-sm font-bold text-primary">Acme Corp</span>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter">Client Account</span>
               </div>
               <div className="w-8 h-8 rounded-full bg-accent text-primary flex items-center justify-center font-bold text-xs border border-primary/10">
                  AC
               </div>
            </div>
          </header>
          <div className="p-6">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
