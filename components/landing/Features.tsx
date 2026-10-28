import {
  Boxes,
  Check,
  Gamepad2,
  KeyRound,
  Lock,
  Shuffle,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/components/ui";
import Reveal from "@/components/landing/Reveal";

/** Mini report card — the same rows the real verification report shows. */
function ReportIllustration() {
  const rows: Array<[string, string]> = [
    ["Original ran", "browser · exit 0 · 38 ms"],
    ["Original stable", "same output on 2 runs"],
    ["Converted ran", "browser · exit 0 · 41 ms"],
    ["Outputs match", "6 / 6 lines identical"],
  ];
  return (
    <div aria-hidden="true" className="rounded-lg border border-line bg-base p-4">
      <div className="flex items-center gap-2 text-[15px] font-semibold text-ink">
        <Check size={17} strokeWidth={3} className="text-success" />
        Behavior verified
      </div>
      <ul className="mt-3 space-y-1.5">
        {rows.map(([label, detail]) => (
          <li key={label} className="flex items-center gap-2 text-[12.5px]">
            <Check size={13} strokeWidth={3} className="shrink-0 text-success" />
            <span className="font-medium text-ink">{label}</span>
            <span className="truncate font-mono text-ink-mute">{detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Line-art canvas game — what the Play window shows for a converted game. */
function GameIllustration() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 240 120"
      className="h-auto w-full rounded-lg border border-line bg-base"
      fill="none"
      strokeWidth="2"
    >
      <path d="M0 104h240" stroke="var(--line-strong)" />
      <rect x="70" y="-2" width="26" height="40" rx="3" stroke="var(--ink-mute)" />
      <rect x="70" y="72" width="26" height="34" rx="3" stroke="var(--ink-mute)" />
      <rect x="160" y="-2" width="26" height="24" rx="3" stroke="var(--ink-mute)" />
      <rect x="160" y="58" width="26" height="48" rx="3" stroke="var(--ink-mute)" />
      <circle cx="122" cy="52" r="8" stroke="var(--success)" />
      <path d="M106 60c-6 4-12 4-18 2" stroke="var(--line-strong)" strokeDasharray="3 4" />
      <text x="12" y="20" fill="var(--ink-dim)" fontSize="11" fontFamily="var(--font-geist-mono)">
        score 7
      </text>
    </svg>
  );
}

const FEATURES: Array<{
  icon: LucideIcon;
  title: string;
  body: string;
  illustration?: ReactNode;
  wide?: boolean;
}> = [
  {
    icon: Check,
    title: "A report card, not a promise",
    body: "Every check, one clear verdict.",
    illustration: <ReportIllustration />,
    wide: true,
  },
  {
    icon: Gamepad2,
    title: "Run it. Play it.",
    body: "Live output. Games open in a Play window.",
    illustration: <GameIllustration />,
    wide: true,
  },
  {
    icon: Shuffle,
    title: "Smart library mapping",
    body: "pygame → canvas, numpy → plain loops.",
  },
  {
    icon: Boxes,
    title: "Python packages, auto-installed",
    body: "numpy, pandas, pygame and ~300 more.",
  },
  {
    icon: KeyRound,
    title: "Bring any AI",
    body: "Your key. Any model.",
  },
  {
    icon: Lock,
    title: "Sandboxed and private",
    body: "No network. Keys stay in your browser.",
  },
];

export default function Features() {
  return (
    <section className="border-t border-line py-24">
      <Reveal>
        <p className="label">What you get</p>
        <h2 className="mt-3 max-w-2xl text-[clamp(30px,4vw,40px)] font-semibold leading-[1.1] tracking-[-0.03em] text-ink">
          Built to show its work.
        </h2>
      </Reveal>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((feature, i) => (
          <Reveal
            key={feature.title}
            delay={(i % 4) * 0.06}
            className={cx(feature.wide && "sm:col-span-2")}
          >
            <article className="flex h-full flex-col rounded-xl border border-line bg-panel p-6 transition-colors duration-200 hover:border-line-strong">
              <feature.icon size={24} strokeWidth={2.5} className="text-ink" aria-hidden="true" />
              <h3 className="mt-4 text-[19px] font-semibold tracking-[-0.015em] text-ink">
                {feature.title}
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-dim">{feature.body}</p>
              {feature.illustration && <div className="mt-auto pt-5">{feature.illustration}</div>}
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/** The three verdicts, explained — the product's honesty promise. */
export function Verdicts() {
  const verdicts: Array<{ icon: LucideIcon; tone: string; title: string; body: string }> = [
    {
      icon: Check,
      tone: "text-success",
      title: "Verified",
      body: "Same output from both programs.",
    },
    {
      icon: TriangleAlert,
      tone: "text-warn",
      title: "Not fully verified",
      body: "Something couldn't be checked. The report says what.",
    },
    {
      icon: X,
      tone: "text-danger",
      title: "Mismatch",
      body: "Outputs differ, even after auto-fix.",
    },
  ];
  return (
    <section className="border-t border-line py-24">
      <Reveal>
        <p className="label">Honest results</p>
        <h2 className="mt-3 max-w-2xl text-[clamp(30px,4vw,40px)] font-semibold leading-[1.1] tracking-[-0.03em] text-ink">
          A green check only when it&apos;s earned.
        </h2>
      </Reveal>
      <div className="mt-12 grid gap-4 sm:grid-cols-3">
        {verdicts.map((v, i) => (
          <Reveal key={v.title} delay={i * 0.08}>
            <div className="h-full rounded-xl border border-line p-6">
              <v.icon size={26} strokeWidth={3} className={v.tone} aria-hidden="true" />
              <h3 className="mt-4 text-[19px] font-semibold text-ink">{v.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-dim">{v.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
