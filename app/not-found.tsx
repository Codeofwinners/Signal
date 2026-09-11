import Link from "next/link";
export default function NotFound() {
  return (
    <main>
      <section className="panel">
        <div className="empty-state">
          <h1>Page not found</h1>
          <p>This page does not exist.</p>
          <Link href="/" className="btn btn-primary">
            Back to workspace
          </Link>
        </div>
      </section>
    </main>
  );
}
