import { DocumentPage } from "@/components/document-page";
import { getMessages } from "@/lib/i18n";
import { metadataForDocument } from "@/lib/seo";

export function generateMetadata() {
  const messages = getMessages("en").documents;
  return metadataForDocument({
    path: "/methodology",
    title: messages.methodologyTitle,
    description: messages.methodologyLead,
    locale: "en",
  });
}

export default function EnglishMethodologyPage() {
  return <DocumentPage document="methodology" locale="en" />;
}
