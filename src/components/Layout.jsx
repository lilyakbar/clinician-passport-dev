import React, { useState } from "react";
import { Outlet, NavLink, Link } from "react-router-dom";
import {
  LayoutDashboard, Briefcase, GraduationCap, FlaskConical, BookOpen,
  Presentation, HeartHandshake, Users, FileText, Target, Telescope,
  Send, Award, BookMarked, Bell, Menu, X, Stethoscope, LogOut, User, Sparkles, CalendarDays, UploadCloud, ScrollText, ShieldCheck, Settings,
} from "lucide-react";
import QuickCaptureButton from "@/components/quickcapture/QuickCaptureButton";
import ProfessionSwitcher from "@/components/ProfessionSwitcher";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useProfession } from "@/professions/ProfessionContext";
import { cn } from "@/lib/utils";

const nav = [
  { section: "Overview", items: [
    { to: "/", label: "Home", icon: LayoutDashboard, end: true },
    { to: "/ask-my-career", label: "Ask My Career", icon: Sparkles },
    { to: "/import-cv", label: "Import CV / Resume", icon: UploadCloud },
    { to: "/reminders", label: "Reminders", icon: Bell },
  ]},
  { section: "My Passport", items: [
    { to: "/credentials", label: "Licenses & Credentials", icon: Award },
    { to: "/continuing-education", label: "CE / CME", icon: BookMarked },
    { to: "/compliance", label: "Compliance Intelligence", icon: ShieldCheck },
    { to: "/documents", label: "Documents", icon: FileText },
    { to: "/career-history", label: "Career History", icon: Briefcase },
    { to: "/education", label: "Education", icon: GraduationCap },
    { to: "/research", label: "Research", icon: FlaskConical },
    { to: "/publications", label: "Publications", icon: BookOpen },
    { to: "/presentations", label: "Presentations", icon: Presentation },
    { to: "/conferences", label: "Conferences", icon: CalendarDays },
    { to: "/volunteering", label: "Volunteering", icon: HeartHandshake },
    { to: "/leadership", label: "Leadership", icon: Users },
    { to: "/memberships", label: "Memberships", icon: Users },
  ]},
  { section: "Career Advancement", items: [
    { to: "/goals", label: "Goals", icon: Target },
    { to: "/opportunities", label: "Opportunities", icon: Telescope },
    { to: "/applications", label: "Applications", icon: Send },
    { to: "/resume-builder", label: "Resume Builder", icon: ScrollText },
  ]},
];

export default function Layout() {
  const { profile, professionModule } = useProfession();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await base44.auth.logout();
    window.location.href = "/login";
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-5 py-5">
        <Link to="/" className="flex items-center gap-2.5" onClick={() => setMobileOpen(false)}>
          <div className="h-9 w-9 rounded-xl bg-accent flex items-center justify-center shadow-soft">
            <Stethoscope className="h-5 w-5 text-white" />
          </div>
          <div className="leading-tight">
            <div className="font-heading font-semibold text-[15px] tracking-tight text-white">Clinician Passport</div>
            <div className="text-[11px] text-sidebar-foreground/50">{professionModule?.label || "Dentistry"}</div>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-6">
        {nav.map((group) => (
          <div key={group.section}>
            <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/40">
              {group.section}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "relative flex items-center gap-3 pl-4 pr-3 py-2 rounded-lg text-[13.5px] transition-all duration-150",
                      isActive
                        ? "bg-accent/22 text-white font-semibold"
                        : "text-sidebar-foreground/70 hover:text-white hover:bg-white/5"
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-accent" />}
                      <item.icon className={cn("h-4 w-4 shrink-0", isActive ? "text-accent" : "")} />
                      {item.label}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Profession pack + profile */}
      <div className="border-t border-sidebar-border p-3 space-y-2">
        <ProfessionSwitcher />
        <NavLink
          to="/settings"
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) =>
            cn(
              "relative flex items-center gap-3 pl-4 pr-3 py-2 rounded-lg text-[13.5px] transition-all duration-150",
              isActive
                ? "bg-accent/22 text-white font-semibold"
                : "text-sidebar-foreground/70 hover:text-white hover:bg-white/5"
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-accent" />}
              <Settings className={cn("h-4 w-4 shrink-0", isActive ? "text-accent" : "")} />
              Settings
            </>
          )}
        </NavLink>
        <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg">
          <div className="h-8 w-8 rounded-full bg-accent/20 flex items-center justify-center">
            <User className="h-4 w-4 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate text-white">{profile?.full_name || "Clinician"}</div>
            <div className="text-[11px] text-sidebar-foreground/50 truncate">{profile?.email || ""}</div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleLogout} title="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex-col">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-primary/30 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col">
            <Button variant="ghost" size="icon" className="absolute top-3 right-3 z-10" onClick={() => setMobileOpen(false)}>
              <X className="h-5 w-5" />
            </Button>
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 h-14 border-b border-border bg-background sticky top-0 z-30">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-accent flex items-center justify-center">
              <Stethoscope className="h-4 w-4 text-white" />
            </div>
            <span className="font-heading font-semibold text-sm tracking-tight">Clinician Passport</span>
          </div>
          <div className="w-9" />
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12 py-8 lg:py-12">
            <Outlet />
          </div>
        </main>
      </div>

      <QuickCaptureButton />
    </div>
  );
}