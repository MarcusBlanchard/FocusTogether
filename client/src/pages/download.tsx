import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MAC_DOWNLOAD_URL } from "@/lib/download";
import { Download, FileText, Shield } from "lucide-react";

export default function Download() {
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <Link href="/landing" className="text-lg font-semibold hover:underline underline-offset-4">
            Flowlocked
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/legal/terms" className="text-muted-foreground hover:text-foreground">
              Terms
            </Link>
            <Link href="/legal/privacy" className="text-muted-foreground hover:text-foreground">
              Privacy
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10 space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Download Flowlocked for Mac</h1>
          <p className="text-muted-foreground">
            Install the desktop companion to enforce focus rules during scheduled sessions. Before you
            download, review the legal documents and confirm you agree to them.
          </p>
        </div>

        <Alert>
          <AlertTitle>Apple Silicon build</AlertTitle>
          <AlertDescription>
            The default installer link targets the Apple Silicon (ARM64) DMG. If you distribute an Intel
            build as well, host both files and set <code className="text-xs">VITE_MAC_DOWNLOAD_URL</code>{" "}
            to the correct URL for each deployment or add a second download entry on your site.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle>Before you download</CardTitle>
            </div>
            <CardDescription>
              Flowlocked can observe foreground applications and browser context during active focus
              sessions and share high-level status with your session partners and our servers, as
              described in the Privacy Policy.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-start gap-3">
              <Checkbox
                id="agree-legal"
                checked={agreed}
                onCheckedChange={(v) => setAgreed(v === true)}
                className="mt-1"
              />
              <div className="space-y-1">
                <Label htmlFor="agree-legal" className="text-sm font-medium leading-snug cursor-pointer">
                  I have read and agree to the{" "}
                  <Link
                    href="/legal/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-4"
                  >
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link
                    href="/legal/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-4"
                  >
                    Privacy Policy
                  </Link>
                  .
                </Label>
                <p className="text-xs text-muted-foreground">
                  You must accept before the download button is enabled.
                </p>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground space-y-2">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <FileText className="h-4 w-4" />
                Quick links
              </div>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  <Link href="/legal/terms" className="text-primary underline underline-offset-4">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link href="/legal/privacy" className="text-primary underline underline-offset-4">
                    Privacy Policy
                  </Link>
                </li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              {agreed ? (
                <Button asChild size="lg" className="gap-2">
                  <a href={MAC_DOWNLOAD_URL} rel="noopener noreferrer">
                    <Download className="h-4 w-4" />
                    Download for Mac
                  </a>
                </Button>
              ) : (
                <Button size="lg" className="gap-2" disabled>
                  <Download className="h-4 w-4" />
                  Download for Mac
                </Button>
              )}
              <p className="text-xs text-muted-foreground sm:flex-1">
                Installer URL: <code className="break-all text-[11px]">{MAC_DOWNLOAD_URL}</code>
              </p>
            </div>
          </CardContent>
        </Card>

      </main>
    </div>
  );
}
