import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import ConvertClient from "./ConvertClient";

export const metadata: Metadata = {
  title: "Convert — CodeShift",
  description:
    "Convert code between languages, run both versions in sandboxes, and verify the behavior matches.",
};

// ConvertClient uses useSearchParams (for ?restore=<id>), so it must render
// inside a Suspense boundary.
export default function ConvertPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
          <Spinner size={16} />
        </div>
      }
    >
      <ConvertClient />
    </Suspense>
  );
}
