"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { LayoutDashboard, Building2, Search, Trophy, Lightbulb, History, Settings, LogOut, Activity, Loader2, CreditCard, Network } from "lucide-react";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { AuthDebugBanner } from "@/components/dev/auth-debug-banner";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, userProfile, loading, signOut } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/sign-in");
      return;
    }
    if (!loading && userProfile?.organizationId === "unassigned") {
      router.replace("/onboarding");
    }
  }, [loading, user, userProfile, router]);

  const handleLogout = async () => {
    await signOut();
    router.replace("/auth/sign-in");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground font-bold uppercase tracking-widest">Loading Intelligence Platform...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const menuItems = [
    { title: "Dashboard",       icon: LayoutDashboard, href: "/dashboard" },
    { title: "Intelligence",    icon: Network,         href: "/intelligence" },
    { title: "Monitoring",      icon: Activity,        href: "/monitoring" },
    { title: "Companies",       icon: Building2,       href: "/companies" },
    { title: "Scans",           icon: Search,          href: "/scans" },
    { title: "Rankings",        icon: Trophy,          href: "/rankings" },
    { title: "Recommendations", icon: Lightbulb,       href: "/recommendations" },
    { title: "History",         icon: History,         href: "/history" },
    { title: "Billing",         icon: CreditCard,      href: "/billing" },
  ];

  const displayName = userProfile?.displayName || user.email || "User";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar variant="sidebar" className="border-r print:hidden">
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
                    isActive={pathname === item.href || (item.href === '/scans' && pathname.startsWith('/scans/'))}
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
            {userProfile?.role === "admin" && (
              <SidebarMenuButton asChild>
                <Link href="/admin">
                  <Settings className="w-4 h-4" />
                  <span>Admin Control Center</span>
                </Link>
              </SidebarMenuButton>
            )}
            <SidebarMenuButton
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleLogout}
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 overflow-auto">
          <header className="h-16 border-b bg-white flex items-center px-6 sticky top-0 z-30 justify-between print:hidden">
            <div className="flex items-center gap-4">
              <SidebarTrigger />
              <h1 className="text-lg font-bold font-headline text-primary capitalize">
                {pathname.split("/").pop() || "Dashboard"}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <NotificationBell />
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-sm font-bold text-primary">{displayName}</span>
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter">
                  {userProfile?.role === "admin" ? "Administrator" : "Client Profile"}
                </span>
              </div>
              <div className="w-8 h-8 rounded-full bg-accent text-primary flex items-center justify-center font-bold text-xs border border-primary/10">
                {initials}
              </div>
            </div>
          </header>
          <div className={cn("p-6 print:p-0 print:bg-white", pathname.includes('/report') && "print:p-0")}>
            {children}
          </div>
        </main>
      </div>
      {/* DEV-ONLY: auth/provisioning state banner — tree-shaken from production */}
      <AuthDebugBanner />
    </SidebarProvider>
  );
}
