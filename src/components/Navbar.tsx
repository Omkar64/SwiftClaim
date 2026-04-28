import { Link, useLocation } from "react-router-dom";
import { Shield, Menu, X, LogIn, LogOut, User, ShieldAlert, Bell, Sun, Moon } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AlertClaim {
  id: string;
  claim_number: string;
  status: string;
  paused: boolean;
  awaiting_confirmation: boolean;
}

interface UserNotification {
  id: string;
  claim_number: string;
  status: string;
  updated_at: string;
}

const USER_NOTIF_KEY = "swiftclaim_user_notif_last_seen";

export function Navbar() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, isAdmin, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [alerts, setAlerts] = useState<AlertClaim[]>([]);
  const [userNotifications, setUserNotifications] = useState<UserNotification[]>([]);
  const [userUnreadCount, setUserUnreadCount] = useState(0);
  const lastSeenRef = useRef<string>(localStorage.getItem(USER_NOTIF_KEY) || new Date(0).toISOString());

  // Admins only see the admin dashboard — no user portal links
  const navLinks = isAdmin
    ? [{ href: "/admin", label: "Admin Dashboard" }]
    : [
        { href: "/", label: "Home" },
        ...(user ? [
          { href: "/my-policies", label: "My Policies" },
          { href: "/raise-claim", label: "Raise Claim" },
          { href: "/my-claims", label: "My Claims" },
        ] : []),
      ];

  // Fetch alert claims for admins
  useEffect(() => {
    if (!isAdmin) { setAlerts([]); return; }

    async function fetchAlerts() {
      const { data } = await supabase
        .from("claims" as any)
        .select("id, claim_number, status, paused, awaiting_confirmation")
        .or("awaiting_confirmation.eq.true,paused.eq.true")
        .neq("status", "CLAIM_CLOSED")
        .neq("status", "rejected")
        .order("created_at", { ascending: false })
        .limit(20);
      setAlerts((data as any as AlertClaim[]) || []);
    }

    fetchAlerts();

    const channel = supabase
      .channel("navbar-alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "claims" }, fetchAlerts)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isAdmin]);

  // Fetch user notifications (claim status updates)
  useEffect(() => {
    if (!user || isAdmin) { setUserNotifications([]); return; }

    async function fetchUserNotifications() {
      const { data } = await supabase
        .from("claims" as any)
        .select("id, claim_number, status, updated_at")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false })
        .limit(5);
      const notifs = (data as any as UserNotification[]) || [];
      setUserNotifications(notifs);
      const lastSeen = lastSeenRef.current;
      const unread = notifs.filter(n => n.updated_at > lastSeen).length;
      setUserUnreadCount(unread);
    }

    fetchUserNotifications();

    const channel = supabase
      .channel("navbar-user-notifs")
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "claims",
        filter: `user_id=eq.${user.id}`,
      }, fetchUserNotifications)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, isAdmin]);

  const handleUserBellClick = () => {
    const now = new Date().toISOString();
    lastSeenRef.current = now;
    localStorage.setItem(USER_NOTIF_KEY, now);
    setUserUnreadCount(0);
  };

  const alertCount = alerts.length;

  const statusLabel = (status: string) =>
    status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between">
        <Link to={isAdmin ? "/admin" : "/"} className="flex items-center gap-2.5">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${isAdmin ? "bg-destructive/10" : "bg-primary"}`}>
            {isAdmin
              ? <ShieldAlert className="h-5 w-5 text-destructive" />
              : <Shield className="h-5 w-5 text-primary-foreground" />
            }
          </div>
          <span className="text-lg font-bold text-foreground">
            SwiftClaim {isAdmin && <span className="text-xs font-medium text-destructive ml-1">ADMIN</span>}
          </span>
        </Link>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map(link => (
            <Link
              key={link.href}
              to={link.href}
              className={cn(
                "px-3.5 py-2 rounded-md text-sm font-medium transition-colors",
                location.pathname === link.href
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              {link.label}
            </Link>
          ))}
          <div className="ml-3 border-l border-border pl-3 flex items-center gap-2">

            {/* Dark mode toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            {/* Admin alert bell */}
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-4 w-4" />
                    {alertCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground animate-pulse">
                        {alertCount > 9 ? "9+" : alertCount}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  <DropdownMenuLabel className="flex items-center justify-between">
                    <span>Alerts</span>
                    {alertCount > 0 && (
                      <span className="text-xs font-normal text-muted-foreground">{alertCount} claim{alertCount !== 1 ? "s" : ""} need attention</span>
                    )}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {alertCount === 0 ? (
                    <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                      ✅ No claims need attention
                    </div>
                  ) : (
                    alerts.map(alert => (
                      <DropdownMenuItem key={alert.id} asChild className="cursor-pointer">
                        <Link to="/admin" className="flex items-start gap-2.5 py-2">
                          <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                            alert.paused
                              ? "bg-status-warning/15 text-status-warning"
                              : "bg-status-info/15 text-status-info"
                          }`}>
                            {alert.paused ? "⏸" : "⏳"}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{alert.claim_number}</p>
                            <p className="text-xs text-muted-foreground">
                              {alert.paused ? "Paused" : "Awaiting confirmation"} — {alert.status.replace(/_/g, " ")}
                            </p>
                          </div>
                        </Link>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* User notification bell */}
            {user && !isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative" onClick={handleUserBellClick}>
                    <Bell className="h-4 w-4" />
                    {userUnreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground animate-pulse">
                        {userUnreadCount > 9 ? "9+" : userUnreadCount}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  <DropdownMenuLabel>Recent Claim Updates</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {userNotifications.length === 0 ? (
                    <div className="px-3 py-4 text-center text-sm text-muted-foreground">No recent activity</div>
                  ) : (
                    userNotifications.map(notif => (
                      <DropdownMenuItem key={notif.id} asChild className="cursor-pointer">
                        <Link to={`/claim/${notif.id}`} className="flex items-start gap-2.5 py-2">
                          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                            🔔
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{notif.claim_number}</p>
                            <p className="text-xs text-muted-foreground">{statusLabel(notif.status)}</p>
                            <p className="text-[10px] text-muted-foreground">{new Date(notif.updated_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</p>
                          </div>
                        </Link>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="flex items-center gap-1.5">
                    <User className="h-4 w-4" />
                    <span className="hidden lg:inline text-xs max-w-[120px] truncate">{user.email}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {!isAdmin && (
                    <>
                      <DropdownMenuItem asChild>
                        <Link to="/profile" className="cursor-pointer flex items-center gap-2">
                          <User className="h-4 w-4" /> My Profile
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem onClick={signOut} className="cursor-pointer text-destructive focus:text-destructive">
                    <LogOut className="h-4 w-4 mr-2" /> Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button asChild variant="default" size="sm">
                <Link to="/auth"><LogIn className="h-4 w-4 mr-1" /> Sign In</Link>
              </Button>
            )}
          </div>
        </div>

        {/* Mobile toggle */}
        <div className="md:hidden flex items-center gap-2">
          {/* Dark mode toggle mobile */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          {/* Mobile alert bell for admins */}
          {isAdmin && alertCount > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="h-4 w-4" />
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                    {alertCount > 9 ? "9+" : alertCount}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>Alerts ({alertCount})</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {alerts.map(alert => (
                  <DropdownMenuItem key={alert.id} asChild>
                    <Link to="/admin" className="flex items-start gap-2 py-1.5" onClick={() => setMobileOpen(false)}>
                      <span>{alert.paused ? "⏸" : "⏳"}</span>
                      <div>
                        <p className="text-sm font-medium">{alert.claim_number}</p>
                        <p className="text-xs text-muted-foreground">{alert.paused ? "Paused" : "Awaiting confirmation"}</p>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Mobile user bell */}
          {user && !isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative" onClick={handleUserBellClick}>
                  <Bell className="h-4 w-4" />
                  {userUnreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                      {userUnreadCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>Recent Updates</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {userNotifications.map(notif => (
                  <DropdownMenuItem key={notif.id} asChild>
                    <Link to={`/claim/${notif.id}`} className="flex items-start gap-2 py-1.5" onClick={() => setMobileOpen(false)}>
                      <span>🔔</span>
                      <div>
                        <p className="text-sm font-medium">{notif.claim_number}</p>
                        <p className="text-xs text-muted-foreground">{statusLabel(notif.status)}</p>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-card p-4 space-y-1 animate-fade-in">
          {navLinks.map(link => (
            <Link
              key={link.href}
              to={link.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "block px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                location.pathname === link.href
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              {link.label}
            </Link>
          ))}
          <div className="pt-2 border-t border-border mt-2 space-y-1">
            {user && !isAdmin && (
              <Link
                to="/profile"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <User className="h-4 w-4" /> My Profile
              </Link>
            )}
            {user ? (
              <button onClick={() => { signOut(); setMobileOpen(false); }} className="block w-full text-left px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground">
                Sign Out
              </button>
            ) : (
              <Link to="/auth" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 text-sm font-medium text-primary">
                Sign In
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
