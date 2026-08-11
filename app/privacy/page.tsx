import { DocumentPage } from "@/components/document-page";
import { getMessages } from "@/lib/i18n";
import { metadataForDocument } from "@/lib/seo";

export function generateMetadata() {
  const messages = getMessages("zh-CN").documents;
  return metadataForDocument({
    path: "/privacy",
    title: messages.privacyTitle,
    description: messages.privacyDescription,
    locale: "zh-CN",
  });
}

export default function PrivacyPage() {
  return <DocumentPage document="privacy" locale="zh-CN" />;
}
