import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LANGUAGES } from "@/lib/languages";
import { AI_PROVIDERS } from "@/lib/types";
import BrandIcon from "@/components/BrandIcon";
import { cx } from "@/components/ui";
import ConversionDemo from "@/components/landing/ConversionDemo";
import Features, { Verdicts } from "@/components/landing/Features";
import Reveal from "@/components/landing/Reveal";
import Steps from "@/components/landing/Steps";

// Link elements styled identically to the shared Button variants (a real
// <button> nested inside an anchor would be invalid, inaccessible HTML).
const ctaBase =
  "inline-flex h-12 select-none items-center justify-center gap-2 rounded-lg px-7 text-[16px] font-semibold transition-all duration-150";
const ctaPrimary = cx(ctaBase, "bg-accent text-[#0a0a0a] hover:bg-white active:scale-[0.98]");
const ctaGhost = cx(
  ctaBase,
  "border border-line bg-transparent text-ink-dim hover:border-line-strong hover:text-ink",
);

const sectionTitle =
  "mt-3 max-w-2xl text-[clamp(30px,4vw,40px)] font-semibold leading-[1.1] tracking-[-0.03em] text-ink";

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-[1100px] px-5">
      {/* Hero */}
      <section className="anim-fade-up pt-24 pb-20 text-center sm:pt-32">
        <h1 className="text-[clamp(52px,8vw,100px)] font-semibold leading-[0.98] tracking-[-0.05em]">
          <span className="block text-ink">Translate code.</span>
          <span className="block text-ink-dim">Check it still works.</span>
        </h1>
        <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
          <Link href="/convert" className={ctaPrimary}>
            Start converting
            <ArrowRight size={18} strokeWidth={2.5} aria-hidden="true" />
          </Link>
          <Link href="/docs" className={ctaGhost}>
            Read the docs
          </Link>
        </div>
        <p className="mt-8 font-mono text-[13px] text-ink-mute">
          {LANGUAGES.length} languages · {AI_PROVIDERS.length} AI providers · runs in your browser
        </p>
      </section>

      {/* The centerpiece: animated conversion + verification demo */}
      <Reveal>
        <ConversionDemo />
      </Reveal>

      <Steps />
      <Features />
      <Verdicts />

      {/* Languages — read from the language configs, so it can't go stale */}
      <section className="border-t border-line py-24">
        <Reveal>
          <p className="label">Languages</p>
          <h2 className={sectionTitle}>Any direction. Ten languages.</h2>
        </Reveal>
        <ul className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {LANGUAGES.map((lang, i) => (
            <li key={lang.id}>
              <Reveal delay={(i % 5) * 0.05}>
                <div className="rounded-xl border border-line bg-panel px-4 py-4 transition-colors duration-200 hover:border-line-strong">
                  <BrandIcon id={lang.id} size={30} />
                  <div className="mt-3 text-[17px] font-semibold text-ink">{lang.name}</div>
                  <div className="mt-1 truncate text-[13px] text-ink-mute">{lang.runtime}</div>
                  <div
                    className={cx(
                      "mt-3 inline-flex rounded-md border px-2 py-0.5 font-mono text-[11.5px]",
                      lang.supportsBrowserExecution
                        ? "border-success/30 text-success"
                        : "border-line text-ink-dim",
                    )}
                  >
                    {lang.supportsBrowserExecution ? "Browser + Docker" : "Docker"}
                  </div>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </section>

      {/* Providers */}
      <section className="border-t border-line py-24">
        <Reveal>
          <p className="label">AI providers</p>
          <h2 className={sectionTitle}>Your key. Your model.</h2>
        </Reveal>
        <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {AI_PROVIDERS.map((provider, i) => (
            <li key={provider.id}>
              <Reveal delay={i * 0.06}>
                <div className="flex items-center gap-4 rounded-xl border border-line bg-panel p-5 transition-colors duration-200 hover:border-line-strong">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-line bg-base">
                    <BrandIcon id={provider.id} size={26} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[17px] font-semibold text-ink">{provider.name}</div>
                    <div className="mt-0.5 truncate font-mono text-[12.5px] text-ink-mute">
                      {provider.models[0]}
                    </div>
                  </div>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </section>

      {/* Closing call to action */}
      <section className="border-t border-line py-28 text-center">
        <Reveal>
          <h2 className="text-[clamp(34px,5vw,56px)] font-semibold leading-[1.05] tracking-[-0.04em] text-ink">
            Paste code. Pick a language.
            <span className="block text-ink-dim">See the evidence.</span>
          </h2>
          <div className="mt-10 flex justify-center">
            <Link href="/convert" className={ctaPrimary}>
              Open the converter
              <ArrowRight size={18} strokeWidth={2.5} aria-hidden="true" />
            </Link>
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-line py-8 text-[14px] text-ink-mute">
        <span className="font-semibold text-ink-dim">CodeShift</span>
        <nav aria-label="Footer" className="flex items-center gap-4">
          {[
            ["/convert", "Convert"],
            ["/history", "History"],
            ["/docs", "Docs"],
            ["/docs#api", "API"],
            ["/settings", "Settings"],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="transition-colors hover:text-ink">
              {label}
            </Link>
          ))}
        </nav>
      </footer>
      <p className="pb-10 text-[12.5px] text-ink-mute">
        Language and company logos are trademarks of their respective owners, shown only to
        identify them.
      </p>
    </div>
  );
}
