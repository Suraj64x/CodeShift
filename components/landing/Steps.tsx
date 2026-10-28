import { ArrowLeftRight, Play, ShieldCheck, type LucideIcon } from "lucide-react";
import Reveal from "@/components/landing/Reveal";

const STEPS: Array<{ num: string; icon: LucideIcon; title: string; body: string }> = [
  {
    num: "01",
    icon: ArrowLeftRight,
    title: "Convert",
    body: "AI rewrites it in the target language.",
  },
  {
    num: "02",
    icon: Play,
    title: "Run both",
    body: "Both run in a sandbox on your machine.",
  },
  {
    num: "03",
    icon: ShieldCheck,
    title: "Verify",
    body: "Outputs compared line by line.",
  },
];

export default function Steps() {
  return (
    <section className="border-t border-line py-24">
      <Reveal>
        <p className="label">How it works</p>
        <h2 className="mt-3 max-w-xl text-[clamp(30px,4vw,40px)] font-semibold leading-[1.1] tracking-[-0.03em] text-ink">
          Three steps. One honest answer.
        </h2>
      </Reveal>
      {/* The ::before hairline joins the three step icons on wide screens. */}
      <ol className="relative mt-14 grid gap-12 sm:grid-cols-3 sm:gap-8 sm:before:absolute sm:before:left-6 sm:before:right-6 sm:before:top-6 sm:before:h-px sm:before:bg-line-strong sm:before:content-['']">
        {STEPS.map((step, i) => (
          <li key={step.num} className="relative">
            <Reveal delay={i * 0.1}>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-line-strong bg-panel">
                <step.icon size={22} strokeWidth={2.5} className="text-ink" aria-hidden="true" />
              </div>
              <div className="label mt-6">{step.num}</div>
              <h3 className="mt-1.5 text-[22px] font-semibold tracking-[-0.02em] text-ink">
                {step.title}
              </h3>
              <p className="mt-2 text-[16px] leading-relaxed text-ink-dim">{step.body}</p>
            </Reveal>
          </li>
        ))}
      </ol>
    </section>
  );
}
