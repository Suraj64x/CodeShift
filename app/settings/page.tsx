import type { Metadata } from "next";
import SettingsClient from "./SettingsClient";

export const metadata: Metadata = {
  title: "Settings — CodeShift",
  description: "AI provider and key, editor, converter, verification, environment and data settings.",
};

export default function SettingsPage() {
  return <SettingsClient />;
}
