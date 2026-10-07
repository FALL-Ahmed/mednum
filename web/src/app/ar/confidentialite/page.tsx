import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "سياسة الخصوصية — أكسون",
  description: "المعلومات التي يحتفظ بها أكسون ولماذا وكيف تتحكم فيها.",
};

export default function Page() {
  return <LegalPage kind="privacy" lang="ar" />;
}
