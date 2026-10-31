"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import BrandIcon from "@/components/BrandIcon";
import { cx } from "@/components/ui";
import { LANGUAGES } from "@/lib/languages";
import type { LanguageId } from "@/lib/types";

type LanguageSelectProps = {
  value: LanguageId;
  onChange: (id: LanguageId) => void;
  /** Accessible name, e.g. "Source language" */
  label: string;
  disabled?: boolean;
};

export default function LanguageSelect({
  value,
  onChange,
  label,
  disabled = false,
}: LanguageSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;

  const selected = LANGUAGES.find((lang) => lang.id === value) ?? LANGUAGES[0];

  function openList() {
    const index = LANGUAGES.findIndex((lang) => lang.id === value);
    setActiveIndex(index >= 0 ? index : 0);
    setOpen(true);
  }

  function select(id: LanguageId) {
    setOpen(false);
    if (id !== value) onChange(id);
  }

  // Close on any pointer press outside the component.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (
        rootRef.current &&
        event.target instanceof Node &&
        !rootRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Keep the keyboard-active option visible in the popover.
  useEffect(() => {
    if (!open) return;
    document
      .getElementById(`${baseId}-opt-${activeIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, baseId]);

  function onKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openList();
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, LANGUAGES.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(LANGUAGES.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        select(LANGUAGES[activeIndex].id);
        break;
      case "Escape":
        event.preventDefault();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
      default: {
        // Type-ahead: jump to the next language starting with the typed letter.
        if (event.key.length === 1 && /\S/.test(event.key)) {
          const ch = event.key.toLowerCase();
          for (let offset = 1; offset <= LANGUAGES.length; offset++) {
            const index = (activeIndex + offset) % LANGUAGES.length;
            if (LANGUAGES[index].name.toLowerCase().startsWith(ch)) {
              setActiveIndex(index);
              break;
            }
          }
        }
      }
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        // Select-only combobox pattern (APG): focus stays on this element while
        // aria-activedescendant points at the highlighted option.
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={label}
        aria-activedescendant={open ? `${baseId}-opt-${activeIndex}` : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={cx(
          "flex h-9 items-center gap-2 rounded-md px-3 text-[15.5px] font-semibold text-ink",
          "transition-colors duration-150 hover:bg-elevated",
          "disabled:pointer-events-none disabled:opacity-40",
        )}
      >
        <BrandIcon id={selected.id} size={17} />
        {selected.name}
        <ChevronDown
          size={16}
          className={cx(
            "text-ink-mute transition-transform duration-150",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            id={listboxId}
            role="listbox"
            aria-label={label}
            initial={{ opacity: 0, scale: 0.97, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className={cx(
              "absolute left-0 top-full z-50 mt-1.5 max-h-96 w-52 origin-top-left overflow-y-auto",
              "rounded-lg border border-line bg-elevated py-1 shadow-lg",
            )}
          >
            {LANGUAGES.map((lang, index) => {
              const isSelected = lang.id === value;
              const isActive = index === activeIndex;
              return (
                <li
                  key={lang.id}
                  id={`${baseId}-opt-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  onPointerMove={() => setActiveIndex(index)}
                  onClick={() => select(lang.id)}
                  className={cx(
                    "flex cursor-pointer items-center justify-between px-3.5 py-2 text-[14px]",
                    "transition-colors duration-100",
                    isSelected ? "text-ink" : "text-ink-dim",
                    isActive && "bg-white/[0.04] text-ink",
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <BrandIcon id={lang.id} size={16} />
                    {lang.name}
                  </span>
                  {isSelected && <Check size={15} strokeWidth={2.5} aria-hidden="true" />}
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
