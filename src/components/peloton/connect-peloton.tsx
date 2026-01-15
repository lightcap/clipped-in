"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Link2, CheckCircle2 } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth-store";

interface ConnectPelotonProps {
  onConnect?: () => void;
}

export function ConnectPeloton({ onConnect }: ConnectPelotonProps) {
  const { isPelotonConnected, setIsPelotonConnected, setProfile } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<"instructions" | "token" | "success">("instructions");
  const [accessToken, setAccessToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    if (!accessToken.trim()) {
      setError("Please enter your access token");
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/peloton/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: accessToken.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to connect Peloton account");
      }

      setIsPelotonConnected(true);
      setProfile(data.profile);
      setStep("success");
      onConnect?.();

      setTimeout(() => {
        setIsOpen(false);
        setStep("instructions");
        setAccessToken("");
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setIsLoading(false);
    }
  };

  if (isPelotonConnected) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-green-500" />
        Peloton Connected
      </div>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Link2 className="h-4 w-4" />
          Connect Peloton
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Your Peloton Account</DialogTitle>
          <DialogDescription>
            Link your Peloton account to sync workouts and track your FTP
          </DialogDescription>
        </DialogHeader>

        {step === "instructions" && (
          <div className="space-y-4">
            <div className="rounded-lg border p-4 space-y-3">
              <h4 className="font-medium">How to get your access token:</h4>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>
                  Go to{" "}
                  <a
                    href="https://members.onepeloton.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    members.onepeloton.com
                  </a>{" "}
                  and log in
                </li>
                <li>Open your browser&apos;s Developer Tools (F12)</li>
                <li>Go to the Application tab, then Local Storage</li>
                <li>
                  Find the key starting with{" "}
                  <code className="text-xs bg-muted px-1 rounded">
                    @@auth0spajs::
                  </code>
                </li>
                <li>
                  Copy the <code className="text-xs bg-muted px-1 rounded">access_token</code>{" "}
                  value
                </li>
              </ol>
            </div>
            <Button className="w-full" onClick={() => setStep("token")}>
              I have my token
            </Button>
          </div>
        )}

        {step === "token" && (
          <div className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="token">Access Token</Label>
              <Input
                id="token"
                type="password"
                placeholder="Paste your access token here"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setStep("instructions")}
                disabled={isLoading}
              >
                Back
              </Button>
              <Button
                className="flex-1"
                onClick={handleConnect}
                disabled={isLoading}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Connect Account
              </Button>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <p className="text-center font-medium">
              Your Peloton account has been connected!
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
