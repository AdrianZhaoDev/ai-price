import Link from "next/link";
import { getMessages, type Locale } from "@/lib/i18n";
import { modelDetailPath } from "@/lib/model-catalog/paths";
import type { ModelCatalogSummary } from "@/lib/model-catalog/types";

export function ModelDirectory({
  locale,
  models,
}: {
  locale: Locale;
  models: ModelCatalogSummary[];
}) {
  const messages = getMessages(locale);
  const byLab = new Map<string, ModelCatalogSummary[]>();
  for (const model of models) {
    byLab.set(model.labName, [...(byLab.get(model.labName) ?? []), model]);
  }

  return (
    <details className="model-directory">
      <summary>{messages.apiCatalog.allModelsSummary(models.length)}</summary>
      <nav aria-label={messages.apiCatalog.allModelsTitle}>
        {[...byLab.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([labName, labModels]) => (
            <section key={labName}>
              <h2>{labName}</h2>
              <ul>
                {labModels
                  .sort((left, right) => left.name.localeCompare(right.name))
                  .map((model) => (
                    <li key={model.id}>
                      <Link href={modelDetailPath(model.id, locale)}>
                        {model.name}
                        <small>{model.id}</small>
                      </Link>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
      </nav>
    </details>
  );
}
