"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main>
      <section className="panel">
        <div className="empty-state">
          <h1>Unable to load this view</h1>
          <p>Please try again. Your saved results are retained in Supabase.</p>
          <Button onClick={reset}>Try again</Button>
        </div>
      </section>
    </main>
  );
}
