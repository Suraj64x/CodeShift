import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { LANGUAGES } from "@/lib/languages";
import { AI_KEY_HEADER, AI_PROVIDERS } from "@/lib/types";
import BrandIcon from "@/components/BrandIcon";
import { cx } from "@/components/ui";

export const metadata: Metadata = {
  title: "Documentation — CodeShift",
  description:
    "How CodeShift converts code, verifies behavior, runs and plays programs, and the HTTP API behind it.",
};

// ---------------------------------------------------------------------------
// Building blocks (server-side, purely presentational)
// ---------------------------------------------------------------------------

function Section({
  overline,
  title,
  id,
  children,
}: {
  overline: string;
  title: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="label">{overline}</div>
      <h2 className="mt-2 text-[26px] font-semibold tracking-[-0.02em] text-ink">{title}</h2>
      <div className="mt-4 space-y-4 text-[16px] leading-[1.7] text-ink-dim">{children}</div>
    </section>
  );
}

function H3({ children }: { children: ReactNode }) {
  return <h3 className="pt-2 text-[18px] font-semibold text-ink">{children}</h3>;
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-elevated px-1.5 py-0.5 font-mono text-[14px] text-ink-dim">
      {children}
    </code>
  );
}

function Pre({ children }: { children: ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-line bg-panel p-4 font-mono text-[13.5px] leading-relaxed text-ink-dim">
      {children}
    </pre>
  );
}

function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-ink underline underline-offset-2 transition-colors hover:text-ink-dim"
    >
      {children}
    </a>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-left text-[14.5px]">
        <thead>
          <tr className="border-b border-line">
            {head.map((h) => (
              <th key={h} scope="col" className="label whitespace-nowrap px-4 py-2.5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row, i) => (
            <tr key={i} className="align-top">
              {row.map((cell, j) => (
                <td key={j} className={cx("px-4 py-2.5", j === 0 ? "whitespace-nowrap text-ink" : "text-ink-dim")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Endpoint({
  method,
  path,
  children,
}: {
  method: "GET" | "POST";
  path: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-line p-5">
      <div className="flex items-center gap-3 font-mono text-[15px]">
        <span
          className={cx(
            "rounded-md border px-2 py-0.5 text-[12.5px] font-semibold",
            method === "GET" ? "border-success/30 text-success" : "border-warn/30 text-warn",
          )}
        >
          {method}
        </span>
        <span className="text-ink">{path}</span>
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data derived from the configs — keeps the docs honest automatically
// ---------------------------------------------------------------------------

const TOC: Array<[string, string]> = [
  ["quick-start", "Quick start"],
  ["pipeline", "How a conversion works"],
  ["report", "The report card"],
  ["run-play", "Run, Play & packages"],
  ["providers", "AI providers & models"],
  ["languages", "Languages"],
  ["security", "Security & privacy"],
  ["api", "API reference"],
  ["shortcuts", "Keyboard shortcuts"],
  ["limitations", "Limitations"],
  ["faq", "Troubleshooting"],
  ["adding-language", "Adding a language"],
];

const PULL_COMMANDS = Array.from(new Set(LANGUAGES.map((lang) => lang.dockerImage)))
  .map((image) => `docker pull ${image}`)
  .join("\n");

const PIPELINE_STEPS: Array<[string, string]> = [
  ["Analyze", "The AI reads the program and describes what it does and exactly what it prints."],
  [
    "Generate",
    "The AI writes the target program, streaming into the editor. Third-party libraries are mapped onto what the target really has (pygame becomes a browser canvas, numpy becomes plain loops), never faked.",
  ],
  [
    "Graphical check",
    "Programs that open a window (pygame, tkinter, Swing, SDL, canvas…) aren't compared as text. The report says so, and JavaScript/TypeScript results can be played.",
  ],
  [
    "Run the original, twice",
    "The original runs in a sandbox to capture its real output, then again to check it's stable. Random or time-based output is reported honestly instead of being blamed on the conversion.",
  ],
  ["Run the conversion", "The converted program runs in its own sandbox at the same time."],
  ["Compare", "Outputs are normalized (line endings, trailing whitespace) and compared line by line."],
  [
    "Auto-fix",
    "On a mismatch the AI sees both outputs, diagnoses the difference and repairs the code (up to 2 attempts; set in Settings).",
  ],
  ["Report", "A report card shows every check, the verdict, and what the AI changed."],
];

const VERDICTS: Array<{ glyph: string; color: string; name: string; meaning: string }> = [
  {
    glyph: "✓",
    color: "text-success",
    name: "Behavior verified",
    meaning: "Both programs ran, exited cleanly, and printed identical output.",
  },
  {
    glyph: "△",
    color: "text-warn",
    name: "Converted, but not fully verified",
    meaning:
      "Something couldn't be checked: a runtime is missing (e.g. Docker for Java), the original errors or prints different output on each run, or it's a graphical program. The summary says which.",
  },
  {
    glyph: "✕",
    color: "text-danger",
    name: "Output mismatch",
    meaning:
      "Both ran but the outputs differ, or the converted program crashed, even after auto-fix. The report points at the first differing line.",
  },
  {
    glyph: "—",
    color: "text-ink-mute",
    name: "Verification unavailable",
    meaning: "Neither language can run here, so nothing was executed.",
  },
];

const REPORT_ROWS: Array<[string, string]> = [
  ["Converted", "Which provider and model did the conversion."],
  ["Original ran", "Where it ran (browser or Docker), exit code and time."],
  ["Original stable", "Whether it printed the same output on two runs."],
  ["Converted ran", "Same as above, for the converted program."],
  ["Outputs match", "How many lines matched, or the first line that differs."],
  ["Auto-fix", "How many repair attempts the AI made (only shown if any)."],
];

const EVENTS: Array<[string, string]> = [
  ['{"type":"analysis-delta","text":"…"}', "A chunk of the AI's analysis of the program."],
  ['{"type":"code-delta","text":"…"}', "A chunk of the converted code."],
  ['{"type":"done","code":"…","notes":"…"}', "The complete code, plus optional caveats. Last line."],
  ['{"type":"error","message":"…","detail":"…"}', "Something failed (bad key, refusal, network). Last line."],
];

const CONVERT_CURL = `curl -N http://localhost:3000/api/ai/convert \\
  -H "Content-Type: application/json" \\
  -H "${AI_KEY_HEADER}: $ANTHROPIC_API_KEY" \\
  -d '{
    "provider": "anthropic",
    "model": "${AI_PROVIDERS[0].models[0]}",
    "sourceLanguage": "python",
    "targetLanguage": "javascript",
    "sourceCode": "print(sum([1, 2, 3]))"
  }'`;

const MODELS_CURL = `curl http://localhost:3000/api/ai/models \\
  -H "Content-Type: application/json" \\
  -H "${AI_KEY_HEADER}: $OPENAI_API_KEY" \\
  -d '{ "provider": "openai" }'

# 200 → { "models": ["gpt-6-astra", "gpt-6.1-sol", …] }`;

const EXECUTE_CURL = `curl http://localhost:3000/api/execute \\
  -H "Content-Type: application/json" \\
  -d '{ "languageId": "go", "code": "package main\\nimport \\"fmt\\"\\nfunc main() { fmt.Println(6) }" }'

# 200 → { "ok": true, "stdout": "6\\n", "stderr": "", "exitCode": 0,
#         "timedOut": false, "truncated": false, "durationMs": 912,
#         "environment": "docker" }`;

const CAPABILITIES_SAMPLE = `curl http://localhost:3000/api/capabilities

# 200 → { "ai": { "envKeys": { "anthropic": true, "openai": false, … } },
#         "execution": { "docker": true, "dockerVersion": "27.3.1",
#           "languages": { "python": { "docker": "ready", "browser": true }, … } } }`;

const LANGUAGE_CONFIG_SNIPPET = `type LanguageConfig = {
  id: LanguageId;              // unique key, e.g. "kotlin"
  name: string;                // display name shown in the UI
  extension: string;           // file extension without the dot
  fileName: string;            // file name inside the sandbox, e.g. "Main.kt"
  monacoLanguage: string;      // editor syntax-highlighting mode
  runtime: string;             // human-readable runtime label
  dockerImage: string;         // container image for sandboxed execution
  executeCommand: string;      // command that runs the file in the container
  supportsBrowserExecution: boolean; // can it also run in a Web Worker?
  runtimeLibraries: string;    // what code may use here — the AI maps libraries onto it
  graphical?: RegExp;          // matches GUI/graphics imports (window, not stdout)
  aiNotes: string;             // runtime quirks passed to the AI prompts
  sample: string;              // built-in sample program
};`;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DocsPage() {
  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 py-16">
      <div className="max-w-[720px]">
        <h1 className="text-[clamp(36px,5vw,48px)] font-semibold tracking-[-0.035em] text-ink">
          Documentation
        </h1>
        <p className="mt-3 text-[18px] leading-relaxed text-ink-dim">
          How CodeShift converts code, checks that it still behaves the same, runs and
          plays programs, and the HTTP API behind it.
        </p>
      </div>

      <div className="mt-14 grid gap-12 lg:grid-cols-[200px_minmax(0,1fr)]">
        {/* Sticky table of contents */}
        <nav aria-label="On this page" className="hidden lg:block">
          <ol className="sticky top-24 space-y-1 border-l border-line">
            {TOC.map(([id, label], i) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="-ml-px block border-l border-transparent py-1 pl-4 text-[14px] text-ink-mute transition-colors duration-150 hover:border-ink hover:text-ink"
                >
                  <span className="mr-2 font-mono text-[12px]">{String(i + 1).padStart(2, "0")}</span>
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="max-w-[760px] space-y-20">
          <Section overline="01" title="Quick start" id="quick-start">
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Open <Link href="/settings" className="text-ink underline underline-offset-2">Settings</Link>,
                pick an AI provider and paste your API key. It&apos;s saved in this browser only.
              </li>
              <li>
                Press <Code>Test connection</Code>. It checks the key and loads your provider&apos;s
                model list for free, without running the AI.
              </li>
              <li>
                Go to <Link href="/convert" className="text-ink underline underline-offset-2">Convert</Link>,
                paste code (or press <Code>Sample</Code>), pick the target language and press{" "}
                <Code>Convert</Code>.
              </li>
              <li>Read the report card under the editors. Press ▶ Run on either side to see its output.</li>
            </ol>
            <p>
              Prefer config files? Put keys in <Code>.env.local</Code> instead (
              {AI_PROVIDERS.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ", "}
                  <Code>{p.envKey}</Code>
                </span>
              ))}
              ) and restart <Code>npm run dev</Code>. A key typed into Settings wins over the file.
            </p>
          </Section>

          <Section overline="02" title="How a conversion works" id="pipeline">
            <ol className="space-y-3">
              {PIPELINE_STEPS.map(([name, line], i) => (
                <li key={name} className="flex gap-4">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line font-mono text-[12.5px] text-ink">
                    {i + 1}
                  </span>
                  <span>
                    <span className="font-semibold text-ink">{name}.</span> {line}
                  </span>
                </li>
              ))}
            </ol>
          </Section>

          <Section overline="03" title="The report card" id="report">
            <p>
              Every conversion ends with a verdict, a one-sentence summary written from what
              actually ran (never by the AI), and one row per check. Collapse it to a single
              line with <Code>Collapse</Code> to give the editors more room.
            </p>
            <div className="overflow-hidden rounded-lg border border-line">
              <div className="divide-y divide-line">
                {VERDICTS.map((v) => (
                  <div key={v.name} className="flex gap-3 px-4 py-3.5">
                    <span aria-hidden="true" className={cx("w-4 shrink-0 text-center font-mono text-[16px]", v.color)}>
                      {v.glyph}
                    </span>
                    <div>
                      <div className="text-[15px] font-semibold text-ink">{v.name}</div>
                      <div className="mt-0.5 text-[15px] text-ink-dim">{v.meaning}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <Table head={["Row", "What it tells you"]} rows={REPORT_ROWS} />
            <p>
              <Code>Show both outputs</Code> puts the two outputs side by side with the first
              difference highlighted. <Code>What the AI changed</Code> lists each auto-fix
              attempt and its diagnosis.
            </p>
          </Section>

          <Section overline="04" title="Run, Play & packages" id="run-play">
            <H3>▶ Run</H3>
            <p>
              Both editors have a Run button. Output, errors and a status line (
              <Code>exit 0 · 41 ms · browser</Code>) appear in an Output window under that
              editor. After a conversion, both windows fill in automatically from the
              verification runs. If you edit the code, old output is flagged as out of date.
            </p>
            <H3>▶ Play</H3>
            <p>
              Graphical JavaScript or TypeScript (canvas games and drawings, for example a
              pygame game converted to JavaScript) gets a Play button instead. It opens a
              window with the canvas, your keyboard and mouse, Restart, and the program&apos;s
              console output. Graphical programs in other languages can&apos;t be shown yet:
              convert them to JavaScript to play them.
            </p>
            <H3>Python packages</H3>
            <p>
              In the browser, Python loads any of Pyodide&apos;s ~300 prebuilt packages your
              program imports before it runs: numpy, pandas, scipy, matplotlib, pillow,
              scikit-learn, pygame and more. The Output window shows{" "}
              <Code>Installing numpy…</Code> the first time; after that it&apos;s cached.
              Packages outside that set fail with the usual <Code>ModuleNotFoundError</Code>.
            </p>
          </Section>

          <Section overline="05" title="AI providers & models" id="providers">
            <p>
              Choose the provider in Settings. Each provider remembers its own key and model.
              Type any model id your provider offers. <Code>Test connection</Code> fills the
              model suggestions with the live list for your key.
            </p>
            <Table
              head={["Provider", "Default model", ".env.local key", "Get a key"]}
              rows={AI_PROVIDERS.map((p) => [
                <span key="n" className="flex items-center gap-2.5">
                  <BrandIcon id={p.id} size={17} />
                  {p.name}
                </span>,
                <Code key="m">{p.models[0]}</Code>,
                <Code key="e">{p.envKey}</Code>,
                <ExtLink key="k" href={p.keyUrl}>
                  {new URL(p.keyUrl).hostname}
                </ExtLink>,
              ])}
            />
            <p>
              OpenAI, Gemini and OpenRouter are called over their OpenAI-compatible APIs at
              fixed addresses; Anthropic uses its official SDK. OpenRouter gives one key for
              hundreds of models, including open-source ones.
            </p>
          </Section>

          <Section overline="06" title="Languages" id="languages">
            <Table
              head={["Language", "Runtime", "Runs in", "Code can use"]}
              rows={LANGUAGES.map((lang) => [
                <span key="n" className="flex items-center gap-2.5">
                  <BrandIcon id={lang.id} size={17} />
                  {lang.name}
                </span>,
                lang.runtime,
                lang.supportsBrowserExecution ? "Browser · Docker" : "Docker",
                <span key="l" className="text-[13.5px]">
                  {lang.runtimeLibraries}
                </span>,
              ])}
            />
            <p>
              To run Docker languages, install{" "}
              <ExtLink href="https://www.docker.com/products/docker-desktop/">Docker Desktop</ExtLink>{" "}
              and pull the images once:
            </p>
            <Pre>{PULL_COMMANDS}</Pre>
          </Section>

          <Section overline="07" title="Security & privacy" id="security">
            <p className="font-semibold text-ink">Your code never runs on the web server.</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <span className="text-ink">Docker:</span> a fresh container per run with no
                network, 256 MB memory, 1 CPU, a 15 second timeout, a read-only filesystem, a
                process cap and a 64 KB output cap. It&apos;s deleted after every run.
              </li>
              <li>
                <span className="text-ink">Browser:</span> Python (Pyodide) and JavaScript /
                TypeScript run in Web Workers on your machine with the network blocked. Python
                packages download only from Pyodide&apos;s pinned source, before your code
                starts.
              </li>
              <li>
                <span className="text-ink">Play window:</span> a sandboxed page with no access
                to this site&apos;s storage, cookies or API, and no network at all.
              </li>
              <li>
                <span className="text-ink">API keys:</span> stored in this browser, sent only
                to this app&apos;s own server in the <Code>{AI_KEY_HEADER}</Code> header, never
                logged, never put in a request body.
              </li>
              <li>
                <span className="text-ink">Other websites</span> can&apos;t use your local
                server: the AI and execute routes refuse cross-site requests.
              </li>
            </ul>
          </Section>

          <Section overline="08" title="API reference" id="api">
            <p>
              The converter is built on these HTTP routes, and you can call them yourself
              while <Code>npm run dev</Code> runs (use the port it prints). All bodies are
              JSON, capped at 200 KB, and source code at 100,000 characters. Requests from
              other websites are refused.
            </p>
            <p>
              <span className="text-ink">Authentication:</span> send a provider key in the{" "}
              <Code>{AI_KEY_HEADER}</Code> header. Without it, the server uses that
              provider&apos;s key from <Code>.env.local</Code>.
            </p>

            <Endpoint method="POST" path="/api/ai/convert">
              <p>
                Convert code. Body: <Code>provider</Code>, <Code>model</Code>,{" "}
                <Code>sourceLanguage</Code>, <Code>targetLanguage</Code>, <Code>sourceCode</Code>.
                Responds with a stream of JSON lines (NDJSON), one event per line:
              </p>
              <Table head={["Event", "Meaning"]} rows={EVENTS.map(([e, m]) => [<Code key="e">{e}</Code>, m])} />
              <Pre>{CONVERT_CURL}</Pre>
              <p className="text-[14.5px]">
                Invalid bodies get HTTP 400 with <Code>{"{ \"error\": \"…\" }"}</Code>. Once
                streaming starts, failures arrive as an <Code>error</Code> event.
              </p>
            </Endpoint>

            <Endpoint method="POST" path="/api/ai/fix">
              <p>
                Repair a conversion whose output didn&apos;t match. Body: everything from
                convert, plus <Code>targetCode</Code>, <Code>sourceOutput</Code>,{" "}
                <Code>targetOutput</Code>, <Code>targetStderr</Code> and{" "}
                <Code>attempt</Code> (1 or more). Same event stream as convert.
              </p>
            </Endpoint>

            <Endpoint method="POST" path="/api/ai/models">
              <p>
                List the models a key can use. Free, no tokens spent. Body:{" "}
                <Code>{"{ \"provider\": \"…\" }"}</Code>. Returns 200 with{" "}
                <Code>models</Code>, 400 for a missing key or unknown provider, and 502 when
                the provider rejects the key.
              </p>
              <Pre>{MODELS_CURL}</Pre>
            </Endpoint>

            <Endpoint method="POST" path="/api/execute">
              <p>
                Run one program in the Docker sandbox (needs Docker). Body:{" "}
                <Code>languageId</Code>, <Code>code</Code>. Program errors still return 200
                with <Code>ok: false</Code>; sandbox problems set <Code>infraError</Code>.
                Browser-tier languages run client-side and don&apos;t use this route.
              </p>
              <Pre>{EXECUTE_CURL}</Pre>
            </Endpoint>

            <Endpoint method="GET" path="/api/capabilities">
              <p>What this machine can do right now: which providers have a key in{" "}
                <Code>.env.local</Code>, whether Docker is running, and how each language can
                execute.
              </p>
              <Pre>{CAPABILITIES_SAMPLE}</Pre>
            </Endpoint>
          </Section>

          <Section overline="09" title="Keyboard shortcuts" id="shortcuts">
            <Table
              head={["Keys", "Action"]}
              rows={[
                [<Code key="a">Ctrl / ⌘ + Enter</Code>, "Convert"],
                [<Code key="b">Ctrl / ⌘ + Shift + C</Code>, "Copy the converted code"],
                [<Code key="c">Esc</Code>, "Close the Play window"],
              ]}
            />
          </Section>

          <Section overline="10" title="Limitations" id="limitations">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Programs that need typed input, network access or files can&apos;t be
                auto-verified: the sandboxes give no input and no network.
              </li>
              <li>
                Identical output on one run is strong evidence, not proof. Other inputs could
                still behave differently.
              </li>
              <li>Java, C++, C, Go, Rust, PHP and Ruby need Docker to run; without it they convert but stay unverified.</li>
              <li>
                Graphical programs are never compared as text. Only JavaScript/TypeScript can
                be played; Python, Java or C++ windows can&apos;t be shown.
              </li>
              <li>
                Browser Python is CPython 3.12 via Pyodide: some standard-library modules are
                missing and only Pyodide&apos;s prebuilt packages install.
              </li>
              <li>
                In browsers that don&apos;t isolate sandboxed pages, a game stuck in an
                endless loop can freeze the tab until it&apos;s closed.
              </li>
            </ul>
          </Section>

          <Section overline="11" title="Troubleshooting" id="faq">
            <div className="divide-y divide-line rounded-lg border border-line">
              {[
                ["“No API key yet” banner", "Add a key in Settings for the selected provider, or set it in .env.local and restart the dev server."],
                ["Test connection: “model isn’t among your models”", "The key works, but that model id isn’t available to it. Pick one from the Model suggestions."],
                ["Java / Go / Rust… show △", "Start Docker Desktop and pull the images listed under Languages."],
                ["△ “prints different output each run”", "The original uses randomness or the current time, so outputs can’t be compared. That’s expected."],
                ["My pygame / tkinter program won’t run", "It needs a window. Convert it to JavaScript and press Play on the converted code."],
                ["ModuleNotFoundError in Python", "Only Pyodide’s prebuilt packages auto-install in the browser. Others aren’t available."],
                ["Output says “Code changed since this run”", "You edited the code after running it. Press Run again."],
                ["Where is my data?", "History and settings live in this browser’s storage. Clear history in Settings."],
              ].map(([q, a]) => (
                <div key={q} className="px-4 py-3.5">
                  <div className="text-[15px] font-semibold text-ink">{q}</div>
                  <div className="mt-0.5 text-[15px]">{a}</div>
                </div>
              ))}
            </div>
          </Section>

          <Section overline="12" title="Adding a language" id="adding-language">
            <p>
              Languages are pure configuration: one entry in <Code>lib/languages.ts</Code>.
              The editors, AI prompts, sandboxes, graphical detection and these docs all read
              from it, so adding a language means filling in one object (and pulling its Docker
              image):
            </p>
            <Pre>{LANGUAGE_CONFIG_SNIPPET}</Pre>
          </Section>
        </div>
      </div>
    </div>
  );
}
