import Link from 'next/link';

export default function ModulePage({
  module,
  title,
  description,
  features,
}: {
  module: string;
  title: string;
  description: string;
  features: string[];
}) {
  return (
    <div className="mx-auto w-full max-w-[900px] px-5 py-8 md:px-8 md:py-10">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
        {module}
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-sky-ink">
        {title}
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-sky-ink/60 md:text-base">
        {description}
      </p>

      <div className="mt-8 rounded-2xl border border-[#cfe0ee] bg-white p-6 md:p-8">
        <h2 className="font-display text-lg font-semibold text-sky-ink">What this module includes</h2>
        <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {features.map((f) => (
            <li key={f} className="flex gap-2.5 text-sm text-sky-ink/70">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-mid" />
              {f}
            </li>
          ))}
        </ul>

        <div className="mt-8 rounded-xl bg-sky-soft px-4 py-4 text-center">
          <p className="text-sm font-medium text-sky-ink/70">
            Screen ready in the sidebar — we will build the working features next, step by step.
          </p>
          <Link
            href="/app"
            className="mt-3 inline-flex rounded-full bg-sky-deep px-5 py-2 text-sm font-semibold text-white transition hover:bg-sky-ink"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
