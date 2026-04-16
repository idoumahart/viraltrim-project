import React from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { User, Bell, Shield, Link2, Video, Save, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export default function SettingsPage() {
  const { user, updateProfile } = useAuth();
  const [saving, setSaving] = React.useState(false);
  const [name, setName] = React.useState(user?.displayName ?? "");

  React.useEffect(() => {
    setName(user?.displayName ?? "");
  }, [user?.displayName]);

  const handleSave = async () => {
    setSaving(true);
    const ok = await updateProfile({ displayName: name });
    setSaving(false);
    if (ok) {
      toast.success("Profile updated");
    } else {
      toast.error("Could not save profile");
    }
  };

  return (
    <AppLayout container contentClassName="max-w-4xl space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold">Settings</h1>
        <p className="text-muted-foreground">Account preferences and integrations.</p>
      </div>
      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="social">Social</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Profile
              </CardTitle>
              <CardDescription>Update how you appear in the app.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Display name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={user?.email ?? ""} disabled />
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={() => void handleSave()} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        <TabsContent value="social">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                Connected platforms
              </CardTitle>
              <CardDescription>Connect your accounts to push scheduled clips automatically.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { name: "TikTok", connected: true },
                { name: "Instagram", connected: false },
                { name: "YouTube", connected: false },
                { name: "X (Twitter)", connected: false }
              ].map((p) => (
                <div key={p.name} className="flex flex-col gap-3 rounded-lg border p-4 bg-card/50">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 font-semibold">
                      <Video className="h-4 w-4" />
                      {p.name}
                    </span>
                    {p.connected ? (
                      <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => toast.success(`Disconnected from ${p.name}`)}>
                        Disconnect
                      </Button>
                    ) : (
                      <Button variant="secondary" size="sm" onClick={() => {
                        toast.error(`Auto-publishing to ${p.name} requires platform developer approval.`);
                      }}>
                        Connect
                      </Button>
                    )}
                  </div>
                  {p.connected && (
                    <div className="flex items-center justify-between border-t border-border/50 pt-3 mt-1">
                      <span className="text-sm text-muted-foreground">Auto-push scheduled clips to {p.name}</span>
                      <Switch defaultChecked />
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Email product updates</span>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Security alerts
                </span>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
