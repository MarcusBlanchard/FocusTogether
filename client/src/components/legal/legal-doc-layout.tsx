import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowLeft } from "lucide-react";

type Props = {
  title: string;
  updated: string;
  children: React.ReactNode;
};

export function LegalDocLayout({ title, updated, children }: Props) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-start gap-3">
          <Button variant="ghost" size="icon" asChild className="shrink-0 mt-0.5">
            <Link href="/download" aria-label="Back to download">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">Last updated: {updated}</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-8">
        <Alert>
          <AlertTitle>Not legal advice</AlertTitle>
          <AlertDescription>
            These documents are starter templates for Flowlocked. They are not a substitute for advice
            from a qualified attorney. Update placeholders (contact email, legal entity, jurisdiction)
            and have counsel review before you rely on them.
          </AlertDescription>
        </Alert>
      </div>

      <article className="max-w-3xl mx-auto px-4 py-8 prose prose-neutral dark:prose-invert max-w-none">
        {children}
      </article>
    </div>
  );
}
