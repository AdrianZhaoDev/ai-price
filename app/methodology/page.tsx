import { DocumentPage } from "@/components/document-page";
import { getMessages } from "@/lib/i18n";
import { metadataForDocument } from "@/lib/seo";

export function generateMetadata() {
  const messages = getMessages("zh-CN").documents;
  return metadataForDocument({
    path: "/methodology",
    title: messages.methodologyTitle,
    description: messages.methodologyLead,
    locale: "zh-CN",
  });
}

export default function MethodologyPage() {
  return <DocumentPage document="methodology" locale="zh-CN" />;
}
