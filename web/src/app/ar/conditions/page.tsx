import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "شروط الاستخدام — أكسون",
  description: "شروط استخدام أكسون والدفع والاسترداد.",
};

export default function Page() {
  return <LegalPage kind="terms" lang="ar" />;
}
