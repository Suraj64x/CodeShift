import type { Metadata } from "next";
import HistoryClient from "./HistoryClient";

export const metadata: Metadata = {
  title: "History — CodeShift",
  description: "Your past conversions, saved on this device.",
};

export default function HistoryPage() {
  return <HistoryClient />;
}
