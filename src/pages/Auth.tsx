import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Shield, ShieldAlert, User } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Auth() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLogin, setIsLogin] = useState(true);
  const [loginMode, setLoginMode] = useState<"user" | "admin">("user");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showVerifyMessage, setShowVerifyMessage] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isLogin) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast({ title: "Login failed", description: error.message, variant: "destructive" });
        setLoading(false);
        return;
      }

      if (loginMode === "admin") {
        // Check admin role
        const { data: roleData } = await supabase
          .from("user_roles" as any)
          .select("role")
          .eq("user_id", data.user.id)
          .eq("role", "admin")
          .maybeSingle();

        if (!roleData) {
          await supabase.auth.signOut();
          toast({ title: "Access Denied", description: "This account does not have admin privileges.", variant: "destructive" });
          setLoading(false);
          return;
        }

        toast({ title: "Welcome, Admin", description: "Signed in successfully." });
        navigate("/admin");
      } else {
        navigate("/");
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) {
        toast({ title: "Sign up failed", description: error.message, variant: "destructive" });
      } else if (data.user && !data.session) {
        setShowVerifyMessage(true);
      } else if (data.session) {
        navigate("/");
      }
    }
    setLoading(false);
  };

  if (showVerifyMessage) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <Card className="w-full max-w-md shadow-elevated animate-slide-up">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mx-auto mb-5">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">Check Your Email</h2>
            <p className="mt-2 text-muted-foreground">
              We've sent a verification link to <strong>{email}</strong>. Please click the link to verify your account before signing in.
            </p>
            <Button className="mt-6" variant="outline" onClick={() => { setShowVerifyMessage(false); setIsLogin(true); }}>
              Back to Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isAdminMode = loginMode === "admin";

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <Card className="w-full max-w-md shadow-elevated animate-slide-up">
        <CardHeader className="text-center">
          {/* Login mode toggle */}
          <Tabs value={loginMode} onValueChange={(v) => { setLoginMode(v as "user" | "admin"); setIsLogin(true); }} className="mb-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="user" className="gap-2">
                <User className="h-4 w-4" /> User
              </TabsTrigger>
              <TabsTrigger value="admin" className="gap-2">
                <ShieldAlert className="h-4 w-4" /> Admin
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className={`flex h-12 w-12 items-center justify-center rounded-xl mx-auto mb-3 ${isAdminMode ? "bg-destructive/10" : "bg-primary"}`}>
            {isAdminMode ? (
              <ShieldAlert className="h-6 w-6 text-destructive" />
            ) : (
              <Shield className="h-6 w-6 text-primary-foreground" />
            )}
          </div>
          <CardTitle className="text-2xl">
            {isAdminMode
              ? "Admin Sign In"
              : isLogin ? "Welcome Back" : "Create Account"}
          </CardTitle>
          <CardDescription>
            {isAdminMode
              ? "Authorized personnel only"
              : isLogin ? "Sign in to manage your claims" : "Sign up to start filing claims"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && !isAdminMode && (
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <Button
              type="submit"
              className={`w-full ${isAdminMode ? "bg-destructive hover:bg-destructive/90" : ""}`}
              disabled={loading}
            >
              {loading
                ? "Please wait..."
                : isAdminMode
                  ? "Sign In as Admin"
                  : isLogin ? "Sign In" : "Sign Up"}
            </Button>
          </form>
          {!isAdminMode && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="text-sm text-primary hover:underline"
              >
                {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
