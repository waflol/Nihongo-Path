import type { Metadata } from "next";
import { GrammarImportConsole } from "@/components/admin/grammar-import-console";

export const metadata: Metadata = { title: "Import ngữ pháp", robots: { index: false, follow: false } };

export default function GrammarImportPage() {
  return <GrammarImportConsole />;
}
