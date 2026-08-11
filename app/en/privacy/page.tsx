import { DocumentPage } from "@/components/document-page";
import { getMessages } from "@/lib/i18n";
import { metadataForDocument } from "@/lib/seo";

export function generateMetadata() {
  const messages = getMessages("en").documents;
  return metadataForDocument({
    path: "/privacy",
    title: messages.privacyTitle,
    description: messages.privacyDescription,
    locale: "en",
  });
}

export default function EnglishPrivacyPage() {
  return <DocumentPage document="privacy" locale="en" />;
}
