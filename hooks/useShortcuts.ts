"use client";

import { useEffect, useRef } from "react";

export type ShortcutBinding = {
  combo: "mod+enter" | "mod+shift+c";
  handler: () => void;
};

/**
 * Global keyboard shortcuts. `mod` is Ctrl on Windows/Linux and ⌘ on Mac.
 * Bindings are kept in a ref so handlers always see the latest closure.
 */
export function useShortcuts(bindings: ShortcutBinding[]): void {
  const bindingsRef = useRef(bindings);
  useEffect(() => {
    bindingsRef.current = bindings;
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;

      for (const binding of bindingsRef.current) {
        const matched =
          binding.combo === "mod+enter"
            ? event.key === "Enter" && !event.shiftKey
            : event.shiftKey && (event.key === "c" || event.key === "C");
        if (matched) {
          event.preventDefault();
          binding.handler();
          return;
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
