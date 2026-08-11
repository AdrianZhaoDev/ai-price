"use client";

import { ProviderMark } from "@/components/icons/provider-mark";
import { ChangeBadge } from "@/components/change-badge";
import {
  ApiPriceRanking,
  type ApiRankingFocusRequest,
  type ApiRankingSelection,
} from "@/components/api-price-ranking";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { trackTrafficEvent } from "@/lib/analytics/traffic";
import { getMessages, type Locale } from "@/lib/i18n";
import {
  compareCnyPrice,
  API_INITIAL_VISIBLE_COUNT,
  formatApiCny,
  formatFxRate,
  formatFxDate,
  formatCny,
  formatOfferPrice,
  displayableOffers,
  lowestComparableOffer,
  lowestThreeRanks,
  plansByMinimumPrice,
  sortOffersByCny,
  visibleApiOffers,
} from "@/lib/pricing/format";
import { modeHref } from "@/lib/seo";
import {
  apiRankingModelIdentity,
  inferredApiPriceType,
  type ApiRankingChange,
} from "@/lib/pricing/api-ranking";
import type {
  ModeDefinition,
  PriceChangeSummary,
  PriceMode,
  PriceOffer,
  ProviderCatalogItem,
} from "@/lib/pricing/types";
import { useVersionRefresh } from "@/lib/pricing/use-version-refresh";
import type { ApiRankingMetric } from "@/lib/pricing/api-ranking";
import {
  ArrowUpRight,
  ArrowDownUp,
  Bell,
  Clock3,
  Database,
  Globe2,
  Info,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { flushSync } from "react-dom";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

type PricingExplorerProps = {
  locale?: Locale;
  initialMode: PriceMode;
  modes: ModeDefinition[];
  providers: ProviderCatalogItem[];
  deferredProviderIds?: string[];
  rankingChanges?: ApiRankingChange[];
  contactEmail: string;
  dataVersion: string | null;
  initialQuery?: {
    providerId?: string;
    planId?: string;
    modelSlug?: string;
  };
  priceIndexLinks?: Array<{
    href: string;
    label: string;
    description: string;
  }>;
};

const subscribeToHydration = () => () => {};
const getHydratedSnapshot = () => true;
const getServerHydratedSnapshot = () => false;

type PendingApiTarget = ApiRankingSelection & {
  requestId: number;
};

function rankingMetricForOffer(
  offer: PriceOffer,
): ApiRankingMetric | undefined {
  const priceType = inferredApiPriceType(offer);
  return priceType === "cached_input" ||
    priceType === "input" ||
    priceType === "output"
    ? priceType
    : undefined;
}

const GLOBAL_INITIAL_VISIBLE_COUNT = 24;

const SubscriptionSheet = dynamic(
  () =>
    import("@/components/subscription-sheet").then(
      (module) => module.SubscriptionSheet,
    ),
  {
    ssr: false,
    loading: () => {
      const locale: Locale =
        typeof document !== "undefined" &&
        document.documentElement.lang === "en"
          ? "en"
          : "zh-CN";
      const messages = getMessages(locale).subscription;
      return (
        <div className="sheet-layer" role="presentation">
          <div
            className="subscription-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={messages.openingStatus}
          >
            <p role="status">{messages.opening}</p>
          </div>
        </div>
      );
    },
  },
);

function hasDisplayableOffers(provider: ProviderCatalogItem): boolean {
  return displayableOffers(provider.offers).length > 0;
}

function sortProvidersByRank(providers: ProviderCatalogItem[]) {
  return [...providers].sort(
    (a, b) =>
      (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER),
  );
}

function defaultPlanId(provider: ProviderCatalogItem): string | null {
  const offers = displayableOffers(provider.offers);
  if (provider.mode === "global") {
    return plansByMinimumPrice(offers, "asc")[0]?.id ?? null;
  }
  return offers[0]?.planId ?? null;
}

function priceChangeDetails(
  change: PriceChangeSummary,
  locale: Locale,
): string[] {
  const messages = getMessages(locale);
  const cnyReference =
    change.previousCny !== undefined && change.currentCny !== undefined
      ? `${messages.landing.cnyOrUnit} ${formatCny(change.previousCny, locale)} → ${formatCny(change.currentCny, locale)}`
      : `${messages.landing.cnyOrUnit} ${messages.common.noData}`;
  return [
    `${locale === "en" ? "Previous price" : "原价格"} ${change.previousDisplayPrice}`,
    `${locale === "en" ? "Current price" : "现价格"} ${change.currentDisplayPrice}`,
    cnyReference,
    `${locale === "en" ? "Confirmed" : "确认时间"} ${new Date(change.changedAt).toLocaleString(locale === "en" ? "en-US" : "zh-CN", { hour12: false })}`,
  ];
}

export function PricingExplorer({
  locale = "zh-CN",
  initialMode,
  modes,
  providers,
  deferredProviderIds = [],
  rankingChanges = [],
  contactEmail,
  dataVersion,
  initialQuery,
  priceIndexLinks = [],
}: PricingExplorerProps) {
  const messages = getMessages(locale);
  const router = useRouter();
  const availableInitialProviders = sortProvidersByRank(
    providers.filter(
      (provider) =>
        provider.mode === initialMode && hasDisplayableOffers(provider),
    ),
  );
  const initialProvider =
    availableInitialProviders.find(
      (provider) => provider.id === initialQuery?.providerId,
    ) ??
    availableInitialProviders[0] ??
    providers.find((provider) => hasDisplayableOffers(provider));
  const activeMode = initialMode;
  const [providerItems, setProviderItems] = useState(providers);
  const [deferredIds, setDeferredIds] = useState(
    () => new Set(deferredProviderIds),
  );
  const [loadingProviderIds, setLoadingProviderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [providerLoadErrors, setProviderLoadErrors] = useState<
    Map<string, string>
  >(() => new Map());
  const [selectedProviderId, setSelectedProviderId] = useState(
    initialProvider?.id ?? "",
  );
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(() => {
    if (
      initialProvider &&
      initialQuery?.planId &&
      displayableOffers(initialProvider.offers).some(
        (offer) => offer.planId === initialQuery.planId,
      )
    ) {
      return initialQuery.planId;
    }
    return initialProvider ? defaultPlanId(initialProvider) : null;
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetLoaded, setSheetLoaded] = useState(false);
  const [subscriptionType, setSubscriptionType] = useState<
    "price" | "api_model_new"
  >("price");
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerHydratedSnapshot,
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [expandedProviderIds, setExpandedProviderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [pendingApiTarget, setPendingApiTarget] =
    useState<PendingApiTarget | null>(null);
  const [rankingFocusRequest, setRankingFocusRequest] =
    useState<ApiRankingFocusRequest | null>(null);
  const [rankingMetric, setRankingMetric] = useState<ApiRankingMetric>("input");
  const [pendingPriceIndexHref, setPendingPriceIndexHref] = useState<
    string | null
  >(null);

  useEffect(() => {
    const clearRestoredNavigation = (event: PageTransitionEvent) => {
      if (event.persisted) setPendingPriceIndexHref(null);
    };
    window.addEventListener("pageshow", clearRestoredNavigation);
    return () =>
      window.removeEventListener("pageshow", clearRestoredNavigation);
  }, []);
  const priceRowRefs = useRef(new Map<string, HTMLElement>());
  const highlightedRowRef = useRef<HTMLElement | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const rankingRequestIdRef = useRef(0);
  const rankingFocusRequestIdRef = useRef(0);
  const providerSelectionIdRef = useRef(0);
  const initialQueryAppliedRef = useRef(false);
  const providerLoadPromisesRef = useRef(
    new Map<string, Promise<ProviderCatalogItem>>(),
  );
  const refreshPricingData = useCallback(() => router.refresh(), [router]);

  useVersionRefresh({
    mode: activeMode,
    dataVersion,
    onVersionChange: refreshPricingData,
  });

  const openSubscriptionSheet = useCallback(
    (type: "price" | "api_model_new") => {
      trackTrafficEvent("subscription_sheet_opened", {
        mode: activeMode,
        provider_id: selectedProviderId,
        subscription_type: type,
        plan_scope:
          type === "api_model_new"
            ? "api_model_new"
            : activeMode === "global" && selectedPlanId
              ? "plan"
              : "provider",
      });
      setSubscriptionType(type);
      setSheetLoaded(true);
      setSheetOpen(true);
    },
    [activeMode, selectedPlanId, selectedProviderId],
  );

  const modeProviders = useMemo(
    () =>
      sortProvidersByRank(
        providerItems.filter(
          (provider) =>
            provider.mode === activeMode && hasDisplayableOffers(provider),
        ),
      ),
    [activeMode, providerItems],
  );

  const selectedProvider =
    modeProviders.find((provider) => provider.id === selectedProviderId) ??
    modeProviders[0];
  const eligibleOffers = useMemo(
    () => displayableOffers(selectedProvider.offers),
    [selectedProvider],
  );

  const availablePlans = useMemo(() => {
    return plansByMinimumPrice(eligibleOffers, "asc");
  }, [eligibleOffers]);

  const sortedOffers = sortOffersByCny(
    activeMode === "global" && selectedPlanId
      ? eligibleOffers.filter((offer) => offer.planId === selectedPlanId)
      : eligibleOffers,
    sortDirection,
  );
  const initialVisibleCount =
    activeMode === "api"
      ? API_INITIAL_VISIBLE_COUNT
      : activeMode === "global"
        ? GLOBAL_INITIAL_VISIBLE_COUNT
        : sortedOffers.length;
  const visibleOffers = expandedProviderIds.has(selectedProvider.id)
    ? sortedOffers
    : activeMode === "api"
      ? visibleApiOffers(sortedOffers, false)
      : sortedOffers.slice(0, initialVisibleCount);

  const lowestOffer = lowestComparableOffer(sortedOffers);
  const topThreeRanks = lowestThreeRanks(sortedOffers);
  const lastCheckedAt = selectedProvider.lastCheckedAt
    ? new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Shanghai",
      }).format(new Date(selectedProvider.lastCheckedAt))
    : messages.landing.initialCollection;

  const ensureProviderLoaded = useCallback(
    async function ensureProviderLoaded(provider: ProviderCatalogItem) {
      if (!deferredIds.has(provider.id)) return provider;
      const pending = providerLoadPromisesRef.current.get(provider.id);
      if (pending) return pending;

      const loadPromise = (async () => {
        setLoadingProviderIds((current) => new Set(current).add(provider.id));
        setProviderLoadErrors((current) => {
          const next = new Map(current);
          next.delete(provider.id);
          return next;
        });
        try {
          const response = await fetch(
            `/pricing-data/${encodeURIComponent(provider.id)}?v=${encodeURIComponent(dataVersion ?? "seed")}`,
          );
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const payload = (await response.json()) as {
            provider?: ProviderCatalogItem;
          };
          if (
            !payload.provider ||
            payload.provider.id !== provider.id ||
            payload.provider.mode !== activeMode
          ) {
            throw new Error("Invalid provider response");
          }

          setProviderItems((current) =>
            current.map((item) =>
              item.id === provider.id ? payload.provider! : item,
            ),
          );
          setDeferredIds((current) => {
            const next = new Set(current);
            next.delete(provider.id);
            return next;
          });
          return payload.provider;
        } catch {
          setProviderLoadErrors((current) =>
            new Map(current).set(
              provider.id,
              messages.pricing.providerLoadError(provider.label),
            ),
          );
          return provider;
        } finally {
          setLoadingProviderIds((current) => {
            const next = new Set(current);
            next.delete(provider.id);
            return next;
          });
        }
      })();

      providerLoadPromisesRef.current.set(provider.id, loadPromise);
      try {
        return await loadPromise;
      } finally {
        if (providerLoadPromisesRef.current.get(provider.id) === loadPromise) {
          providerLoadPromisesRef.current.delete(provider.id);
        }
      }
    },
    [activeMode, dataVersion, deferredIds, messages.pricing],
  );

  async function selectProvider(provider: ProviderCatalogItem) {
    trackTrafficEvent("pricing_provider_selected", {
      mode: activeMode,
      provider_id: provider.id,
    });
    const selectionId = ++providerSelectionIdRef.current;
    setSelectedProviderId(provider.id);
    setSelectedPlanId(defaultPlanId(provider));
    const loadedProvider = await ensureProviderLoaded(provider);
    if (selectionId !== providerSelectionIdRef.current) return;
    setSelectedProviderId(loadedProvider.id);
    setSelectedPlanId(defaultPlanId(loadedProvider));
    if (activeMode === "api") {
      setRankingFocusRequest({
        providerId: loadedProvider.id,
        requestId: ++rankingFocusRequestIdRef.current,
      });
    }
    const query = new URLSearchParams({ provider: loadedProvider.id });
    if (activeMode === "global") {
      const planId = defaultPlanId(loadedProvider);
      if (planId) query.set("plan", planId);
    }
    router.replace(`${modeHref(activeMode, locale)}?${query.toString()}`, {
      scroll: false,
    });
  }

  function focusRankingForOffer(offer: PriceOffer) {
    if (activeMode !== "api") return;
    const offerMetric = rankingMetricForOffer(offer);
    if (offerMetric) setRankingMetric(offerMetric);
    setRankingFocusRequest({
      providerId: selectedProvider.id,
      modelSlug: apiRankingModelIdentity(offer).slug,
      offerId: offer.id,
      requestId: ++rankingFocusRequestIdRef.current,
    });
  }

  function selectPlan(planId: string) {
    setSelectedPlanId(planId);
    if (activeMode !== "global") return;
    const query = new URLSearchParams({
      provider: selectedProvider.id,
      plan: planId,
    });
    router.replace(`${modeHref(activeMode, locale)}?${query.toString()}`, {
      scroll: false,
    });
  }

  async function selectRankingEntry(selection: ApiRankingSelection) {
    const provider = modeProviders.find(
      (item) => item.id === selection.providerId,
    );
    if (!provider) return;
    trackTrafficEvent("pricing_provider_selected", {
      mode: activeMode,
      provider_id: provider.id,
    });
    const selectionId = ++providerSelectionIdRef.current;
    setSelectedProviderId(provider.id);
    setSelectedPlanId(defaultPlanId(provider));
    const loadedProvider = await ensureProviderLoaded(provider);
    if (selectionId !== providerSelectionIdRef.current) return;

    const targetOffers = sortOffersByCny(
      displayableOffers(loadedProvider.offers),
      sortDirection,
    );
    const exactTargetIndex = targetOffers.findIndex(
      (offer) => offer.id === selection.offerId,
    );
    const targetIndex =
      exactTargetIndex >= 0
        ? exactTargetIndex
        : targetOffers.findIndex(
            (offer) => offer.modelSlug === selection.modelSlug,
          );
    if (targetIndex >= API_INITIAL_VISIBLE_COUNT) {
      setExpandedProviderIds((current) => {
        const next = new Set(current);
        next.add(loadedProvider.id);
        return next;
      });
    }

    rankingRequestIdRef.current += 1;
    setSelectedProviderId(loadedProvider.id);
    setSelectedPlanId(defaultPlanId(loadedProvider));
    highlightedRowRef.current?.removeAttribute("data-highlighted");
    highlightedRowRef.current = null;
    setPendingApiTarget({
      ...selection,
      requestId: rankingRequestIdRef.current,
    });
    router.replace(
      `${modeHref(activeMode, locale)}?provider=${encodeURIComponent(provider.id)}&model=${encodeURIComponent(selection.modelSlug)}`,
      { scroll: false },
    );
  }

  useEffect(() => {
    if (initialQueryAppliedRef.current || !initialQuery?.providerId) return;
    const provider = modeProviders.find(
      (item) => item.id === initialQuery.providerId,
    );
    if (!provider) {
      initialQueryAppliedRef.current = true;
      return;
    }

    let cancelled = false;
    const applyQuery = async () => {
      const loadedProvider = await ensureProviderLoaded(provider);
      if (cancelled) return;
      setSelectedProviderId(loadedProvider.id);
      if (
        activeMode === "global" &&
        initialQuery.planId &&
        displayableOffers(loadedProvider.offers).some(
          (offer) => offer.planId === initialQuery.planId,
        )
      ) {
        setSelectedPlanId(initialQuery.planId);
      }
      if (activeMode === "api" && initialQuery.modelSlug) {
        const offer = displayableOffers(loadedProvider.offers).find(
          (candidate) => candidate.modelSlug === initialQuery.modelSlug,
        );
        if (offer) {
          setExpandedProviderIds((current) => {
            const next = new Set(current);
            next.add(loadedProvider.id);
            return next;
          });
          rankingRequestIdRef.current += 1;
          setPendingApiTarget({
            providerId: loadedProvider.id,
            modelSlug: initialQuery.modelSlug,
            offerId: offer.id,
            requestId: rankingRequestIdRef.current,
          });
        }
      }
      initialQueryAppliedRef.current = true;
    };
    void applyQuery();
    return () => {
      cancelled = true;
    };
  }, [activeMode, ensureProviderLoaded, initialQuery, modeProviders]);

  useEffect(() => {
    if (
      !pendingApiTarget ||
      selectedProvider.id !== pendingApiTarget.providerId
    ) {
      return;
    }

    const targetOffers = sortOffersByCny(
      displayableOffers(selectedProvider.offers),
      sortDirection,
    );
    const targetOffer =
      targetOffers.find((offer) => offer.id === pendingApiTarget.offerId) ??
      targetOffers.find(
        (offer) => offer.modelSlug === pendingApiTarget.modelSlug,
      );

    let revealDelay: ReturnType<typeof setTimeout> | null = null;
    let animationFrame = 0;
    let attempts = 0;
    let cancelled = false;
    const revealTarget = () => {
      if (cancelled) return;
      if (!targetOffer) {
        setPendingApiTarget(null);
        return;
      }
      const row = priceRowRefs.current.get(targetOffer.id);
      if (!row && attempts < 30) {
        attempts += 1;
        animationFrame = requestAnimationFrame(revealTarget);
        return;
      }
      if (!row) {
        setPendingApiTarget(null);
        return;
      }

      row.scrollIntoView({ behavior: "smooth", block: "center" });
      row.setAttribute("data-highlighted", "true");
      highlightedRowRef.current = row;
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
      highlightTimeoutRef.current = setTimeout(() => {
        row.removeAttribute("data-highlighted");
        if (highlightedRowRef.current === row) {
          highlightedRowRef.current = null;
        }
        setPendingApiTarget(null);
        highlightTimeoutRef.current = null;
      }, 3000);
    };

    revealDelay = setTimeout(() => {
      animationFrame = requestAnimationFrame(revealTarget);
    }, 240);
    return () => {
      cancelled = true;
      if (revealDelay) clearTimeout(revealDelay);
      cancelAnimationFrame(animationFrame);
    };
  }, [pendingApiTarget, selectedProvider, sortDirection]);

  useEffect(
    () => () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
      highlightedRowRef.current?.removeAttribute("data-highlighted");
    },
    [],
  );

  useEffect(() => {
    for (const mode of modes) {
      if (mode.id === activeMode) continue;
      router.prefetch(modeHref(mode.id, locale));
    }
  }, [activeMode, locale, modes, router]);

  const selectedPlan = availablePlans.find(
    (plan) => plan.id === selectedPlanId,
  );
  const subscriptionScope =
    activeMode === "global" && selectedPlan
      ? `${selectedProvider.name} · ${selectedPlan.name}`
      : selectedProvider.name;

  function toggleSortDirection() {
    const nextDirection = sortDirection === "desc" ? "asc" : "desc";
    trackTrafficEvent("pricing_sort_changed", {
      mode: activeMode,
      provider_id: selectedProvider.id,
      sort_direction: nextDirection,
    });
    setSortDirection(nextDirection);
  }

  return (
    <div className="app-shell" data-hydrated={hydrated}>
      <a
        className="skip-link"
        href="#main-content"
        aria-hidden={sheetOpen ? true : undefined}
        tabIndex={sheetOpen ? -1 : undefined}
      >
        {messages.common.skipToContent}
      </a>
      <SiteHeader
        locale={locale}
        activeMode={activeMode}
        showSync
        syncLabel={messages.common.syncEveryFourHours}
        syncTitle={messages.common.syncTitle}
        ariaHidden={sheetOpen}
      />

      <main
        id="main-content"
        className="main-content"
        aria-hidden={sheetOpen ? true : undefined}
      >
        <h1 className="sr-only" id="workspace-title">
          {messages.pricing.titles[activeMode]}
        </h1>

        {activeMode === "api" ? (
          <div className="api-ranking-mobile" id="api-ranking">
            <ApiPriceRanking
              providers={modeProviders}
              changes={rankingChanges}
              onSubscribe={() => {
                openSubscriptionSheet("api_model_new");
              }}
              metric={rankingMetric}
              onMetricChange={setRankingMetric}
              focusRequest={rankingFocusRequest}
              locale={locale}
              onSelectEntry={(selection) => void selectRankingEntry(selection)}
            />
          </div>
        ) : null}

        <section className="provider-section" aria-labelledby="provider-title">
          <div className="section-label-row">
            <h2 id="provider-title">
              {activeMode === "api"
                ? messages.pricing.providerSelection
                : messages.pricing.productSelection}
            </h2>
            <div className="section-meta">
              <div className="freshness-block">
                <Clock3 size={16} aria-hidden="true" />
                <span>
                  {messages.pricing.lastChecked}
                  <strong>{lastCheckedAt}</strong>
                </span>
              </div>
              <span className="official-source-count">
                {messages.pricing.officialSourceCount(modeProviders.length)}
              </span>
            </div>
          </div>
          <div
            className={`provider-rail ${activeMode === "global" ? "provider-rail-global" : ""}`}
          >
            {modeProviders.map((provider) => {
              const active = selectedProvider.id === provider.id;
              const loading = loadingProviderIds.has(provider.id);
              return (
                <button
                  key={provider.id}
                  type="button"
                  className="provider-button pressable"
                  data-provider-id={provider.id}
                  data-active={active}
                  onClick={() => void selectProvider(provider)}
                  aria-pressed={active}
                  aria-busy={loading}
                >
                  {active ? (
                    <motion.span
                      className="provider-selection"
                      layoutId="provider-selection"
                      transition={{
                        type: "spring",
                        bounce: 0,
                        duration: 0.32,
                      }}
                    />
                  ) : null}
                  <span className="provider-button-content">
                    <ProviderMark
                      providerId={provider.id}
                      color={provider.color}
                    />
                    <span>
                      {loading
                        ? messages.pricing.loadingProvider
                        : provider.label}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {providerLoadErrors.get(selectedProvider.id) ? (
            <p className="provider-load-error" role="status">
              {providerLoadErrors.get(selectedProvider.id)}
            </p>
          ) : null}
        </section>

        <div
          className={`pricing-layout ${activeMode === "api" ? "pricing-layout-api" : ""}`}
        >
          <section className="price-workspace" aria-live="polite">
            <AnimatePresence mode="wait">
              <motion.div
                key={`${activeMode}-${selectedProvider.id}`}
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
              >
                <div className="provider-heading">
                  <div className="provider-title-group">
                    <div
                      className="provider-large-mark"
                      style={
                        {
                          "--provider-color": selectedProvider.color,
                        } as React.CSSProperties
                      }
                    >
                      <ProviderMark
                        providerId={selectedProvider.id}
                        color={selectedProvider.color}
                        size={30}
                      />
                    </div>
                    <div>
                      <div className="provider-name-line">
                        <h2>{selectedProvider.name}</h2>
                      </div>
                      <p>{selectedProvider.description}</p>
                    </div>
                  </div>
                  <div className="provider-actions">
                    <a
                      className="secondary-button pressable"
                      href={selectedProvider.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {messages.common.officialPage}
                      <ArrowUpRight size={16} />
                    </a>
                    <button
                      type="button"
                      className="primary-button pressable"
                      onClick={() => {
                        openSubscriptionSheet("price");
                      }}
                    >
                      <Bell size={16} />
                      {messages.pricing.followPrice}
                    </button>
                  </div>
                </div>

                {activeMode === "global" && availablePlans.length > 1 ? (
                  <div
                    className="plan-strip"
                    aria-label={messages.pricing.selectPlan}
                    title={messages.pricing.planSortTitle}
                  >
                    {availablePlans.map((plan, index) => (
                      <button
                        type="button"
                        key={plan.id}
                        className="plan-button pressable"
                        data-active={selectedPlanId === plan.id}
                        data-cheapest={index === 0}
                        data-plan-id={plan.id}
                        onClick={() => selectPlan(plan.id)}
                        aria-label={`${plan.name}, ${messages.pricing.planMinimum(formatCny(plan.minimumCny, locale))}`}
                      >
                        <span className="plan-name">{plan.name}</span>
                        <span className="plan-minimum">
                          {messages.pricing.planMinimum(
                            formatCny(plan.minimumCny, locale),
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="price-summary">
                  <div>
                    <span className="summary-icon" aria-hidden="true">
                      {activeMode === "global" ? (
                        <Globe2 size={18} />
                      ) : activeMode === "api" ? (
                        <Database size={18} />
                      ) : (
                        <RefreshCw size={18} />
                      )}
                    </span>
                    <span>
                      {activeMode === "global"
                        ? `${selectedPlan?.name ?? (locale === "en" ? "Plan" : "套餐")} · ${visibleOffers.length} ${locale === "en" ? "regional quotes" : "个地区报价"}`
                        : `${sortedOffers.length} ${locale === "en" ? "price items" : "个价格项目"}`}
                    </span>
                    <button
                      type="button"
                      className="sort-button pressable"
                      onClick={toggleSortDirection}
                      aria-label={
                        sortDirection === "desc"
                          ? messages.pricing.sortHighToLow
                          : messages.pricing.sortLowToHigh
                      }
                    >
                      <ArrowDownUp size={13} />
                      {sortDirection === "desc"
                        ? locale === "en"
                          ? "High first"
                          : "高价优先"
                        : locale === "en"
                          ? "Low first"
                          : "低价优先"}
                    </button>
                  </div>
                  {lowestOffer?.convertedCny !== undefined ? (
                    <p>
                      {messages.pricing.currentMinimum}
                      <strong className="lowest-price">
                        {activeMode === "api"
                          ? formatApiCny(lowestOffer.convertedCny, locale)
                          : formatCny(lowestOffer.convertedCny, locale)}
                      </strong>
                    </p>
                  ) : (
                    <p>{messages.pricing.originalPriceNote}</p>
                  )}
                </div>

                <div
                  className={`price-list ${activeMode === "global" ? "price-list-global" : ""}`}
                  role="table"
                  aria-label={messages.pricing.priceTable}
                >
                  <div className="price-list-header" role="row">
                    {activeMode === "global" ? (
                      <>
                        <span role="columnheader">
                          {messages.pricing.globalColumns.rank}
                        </span>
                        <span role="columnheader">
                          {messages.pricing.globalColumns.country}
                        </span>
                        <span role="columnheader">
                          {messages.pricing.globalColumns.original}
                        </span>
                        <span role="columnheader">
                          {messages.pricing.globalColumns.fxRate}
                        </span>
                        <span role="columnheader">
                          {messages.pricing.globalColumns.cny}
                        </span>
                        <span role="columnheader">
                          {messages.pricing.globalColumns.comparison}
                        </span>
                        <span
                          role="columnheader"
                          aria-label={messages.pricing.globalColumns.source}
                        />
                      </>
                    ) : (
                      <>
                        <span role="columnheader">
                          {messages.pricing.compactColumns.planOrModel}
                        </span>
                        <span role="columnheader">
                          {activeMode === "api"
                            ? messages.pricing.compactColumns.cnyOrUnit.split(
                                " /",
                              )[0]
                            : messages.pricing.compactColumns.officialPrice}
                        </span>
                        <span role="columnheader">
                          {activeMode === "api"
                            ? locale === "en"
                              ? "Billing unit"
                              : "计费单位"
                            : locale === "en"
                              ? "CNY reference"
                              : "人民币参考"}
                        </span>
                        {activeMode === "api" ? (
                          <span role="columnheader" className="sr-only">
                            {messages.pricing.compactColumns.ranking}
                          </span>
                        ) : null}
                      </>
                    )}
                  </div>

                  {visibleOffers.map((offer, index) => {
                    const rank = topThreeRanks.get(offer.id);
                    const comparison = compareCnyPrice(
                      offer.convertedCny,
                      lowestOffer?.convertedCny,
                    );
                    if (activeMode === "global") {
                      return (
                        <motion.div
                          className="price-row global-price-row"
                          role="row"
                          key={offer.id}
                          data-rank={rank}
                          initial={false}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            duration: 0.2,
                            delay: Math.min(index, 15) * 0.02,
                          }}
                        >
                          <span className="rank-number" role="cell">
                            {index + 1}
                          </span>
                          <div className="country-cell" role="cell">
                            <span className="region-code">
                              {offer.regionCode}
                            </span>
                            <strong>{offer.regionName}</strong>
                          </div>
                          <div
                            className="official-price global-original-price"
                            role="cell"
                            data-rank={rank}
                          >
                            <strong>{offer.displayPrice}</strong>
                            {offer.lastPriceChange ? (
                              <ChangeBadge
                                label={
                                  offer.lastPriceChange.direction === "decrease"
                                    ? messages.pricing.priceDecrease
                                    : messages.pricing.priceIncrease
                                }
                                tone={
                                  offer.lastPriceChange.direction === "decrease"
                                    ? "positive"
                                    : "negative"
                                }
                                ariaLabel={`${offer.regionName ?? offer.planName}${offer.lastPriceChange.direction === "decrease" ? messages.pricing.priceDecrease : messages.pricing.priceIncrease}`}
                                details={priceChangeDetails(
                                  offer.lastPriceChange,
                                  locale,
                                )}
                              />
                            ) : null}
                            <small>{offer.planName}</small>
                            <span className="mobile-global-details">
                              {formatCny(offer.convertedCny, locale)}
                              {comparison && !comparison.isMinimum
                                ? ` · ↑ ${comparison.percentage.toFixed(1)}%`
                                : comparison?.isMinimum
                                  ? ` · ${messages.pricing.cheapest}`
                                  : ""}
                            </span>
                          </div>
                          <span className="fx-rate" role="cell">
                            {formatFxRate(offer, locale)}
                          </span>
                          <div
                            className="converted-price"
                            role="cell"
                            data-rank={rank}
                          >
                            <strong>
                              {formatCny(offer.convertedCny, locale)}
                            </strong>
                          </div>
                          <div
                            className="price-comparison"
                            role="cell"
                            data-minimum={comparison?.isMinimum}
                          >
                            {comparison?.isMinimum ? (
                              <strong>{messages.pricing.cheapest}</strong>
                            ) : comparison ? (
                              <>
                                <strong>
                                  ↑ {comparison.percentage.toFixed(1)}%
                                </strong>
                                <small>
                                  {locale === "en" ? "More " : "贵"}
                                  {formatCny(comparison.difference, locale)}
                                </small>
                              </>
                            ) : (
                              <span>—</span>
                            )}
                          </div>
                          <span className="row-link-cell" role="cell">
                            <a
                              className="row-link pressable"
                              href={
                                offer.sourceUrl ?? selectedProvider.sourceUrl
                              }
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`${messages.common.viewOfficialSource}: ${offer.regionName ?? (locale === "en" ? "this region" : "此地区")}`}
                            >
                              <ArrowUpRight size={14} />
                            </a>
                          </span>
                        </motion.div>
                      );
                    }

                    const priceCells = (
                      <>
                        <div className="price-identity" role="cell">
                          <span>
                            <strong>
                              {rank ? (
                                <span className="rank-badge" data-rank={rank}>
                                  #{rank}
                                </span>
                              ) : null}
                              {offer.planName}
                            </strong>
                            <small>
                              {offer.note ??
                                (activeMode === "api"
                                  ? [offer.category, offer.priceTier]
                                      .filter(Boolean)
                                      .join(" · ") ||
                                    selectedProvider.description
                                  : selectedProvider.description)}
                            </small>
                          </span>
                        </div>
                        <div
                          className="official-price"
                          role="cell"
                          data-rank={rank}
                        >
                          <strong>
                            {activeMode === "api" &&
                            offer.convertedCny !== undefined
                              ? formatApiCny(offer.convertedCny, locale)
                              : formatOfferPrice(offer, locale)}
                          </strong>
                          {offer.lastPriceChange ? (
                            <ChangeBadge
                              label={
                                offer.lastPriceChange.direction === "decrease"
                                  ? messages.pricing.priceDecrease
                                  : messages.pricing.priceIncrease
                              }
                              tone={
                                offer.lastPriceChange.direction === "decrease"
                                  ? "positive"
                                  : "negative"
                              }
                              ariaLabel={`${offer.planName}${offer.lastPriceChange.direction === "decrease" ? messages.pricing.priceDecrease : messages.pricing.priceIncrease}`}
                              details={priceChangeDetails(
                                offer.lastPriceChange,
                                locale,
                              )}
                            />
                          ) : null}
                          {offer.currency ? (
                            <small>
                              {activeMode === "api" &&
                              offer.currency.toUpperCase() !== "CNY"
                                ? `${formatOfferPrice(offer, locale)} · ${formatFxRate(offer, locale)} · ${formatFxDate(offer, locale)}`
                                : offer.currency}
                              {activeMode === "api" && offer.unit ? (
                                <span className="mobile-api-unit">
                                  {" "}
                                  · {offer.unit}
                                </span>
                              ) : null}
                              {activeMode !== "api" &&
                              offer.convertedCny !== undefined ? (
                                <span className="mobile-cny">
                                  {" "}
                                  · {formatCny(offer.convertedCny, locale)}
                                </span>
                              ) : null}
                            </small>
                          ) : null}
                        </div>
                        <div
                          className="converted-price"
                          role="cell"
                          data-rank={rank}
                        >
                          {activeMode === "api" ? (
                            <span>
                              {offer.unit ?? messages.pricing.perOfficialUnit}
                            </span>
                          ) : (
                            <strong>
                              {formatCny(offer.convertedCny, locale)}
                            </strong>
                          )}
                        </div>
                      </>
                    );

                    const rowMotion = {
                      initial: false as const,
                      animate: { opacity: 1, y: 0 },
                      transition: {
                        duration: 0.2,
                        delay: Math.min(index, 15) * 0.02,
                      },
                    };

                    if (activeMode === "api") {
                      return (
                        <motion.div
                          className="price-row"
                          role="row"
                          key={offer.id}
                          data-rank={rank}
                          data-offer-id={offer.id}
                          data-model-slug={offer.modelSlug}
                          data-clickable="true"
                          ref={(node) => {
                            if (node) {
                              priceRowRefs.current.set(offer.id, node);
                            } else {
                              priceRowRefs.current.delete(offer.id);
                            }
                          }}
                          {...rowMotion}
                        >
                          {priceCells}
                          <div role="cell" className="price-row-action-cell">
                            <button
                              type="button"
                              className="price-row-action"
                              aria-label={`${locale === "en" ? "View" : "在排行榜中查看"} ${offer.planName}`}
                              onClick={() => focusRankingForOffer(offer)}
                            />
                          </div>
                        </motion.div>
                      );
                    }

                    return (
                      <motion.div
                        className="price-row"
                        role="row"
                        key={offer.id}
                        data-rank={rank}
                        data-offer-id={offer.id}
                        data-model-slug={offer.modelSlug}
                        {...rowMotion}
                      >
                        {priceCells}
                      </motion.div>
                    );
                  })}
                </div>

                {sortedOffers.length > initialVisibleCount ? (
                  <button
                    type="button"
                    className="load-more-prices pressable"
                    aria-expanded={expandedProviderIds.has(selectedProvider.id)}
                    onClick={() =>
                      setExpandedProviderIds((current) => {
                        const next = new Set(current);
                        if (next.has(selectedProvider.id)) {
                          next.delete(selectedProvider.id);
                        } else {
                          next.add(selectedProvider.id);
                        }
                        return next;
                      })
                    }
                  >
                    {expandedProviderIds.has(selectedProvider.id)
                      ? activeMode === "global"
                        ? messages.pricing.collapseRegions
                        : messages.pricing.collapseItems
                      : activeMode === "global"
                        ? messages.pricing.viewAllRegions(sortedOffers.length)
                        : messages.pricing.viewAllItems(sortedOffers.length)}
                    <span>
                      {expandedProviderIds.has(selectedProvider.id)
                        ? activeMode === "global"
                          ? messages.pricing.shownAllRegions(
                              sortedOffers.length,
                            )
                          : messages.pricing.shownAllItems(sortedOffers.length)
                        : messages.pricing.shownCount(visibleOffers.length)}
                    </span>
                  </button>
                ) : null}

                <div className="method-note">
                  <Info size={16} aria-hidden="true" />
                  <p>{messages.pricing.referenceNote}</p>
                </div>
              </motion.div>
            </AnimatePresence>
          </section>
          {activeMode === "api" ? (
            <div className="api-ranking-desktop">
              <ApiPriceRanking
                providers={modeProviders}
                changes={rankingChanges}
                onSubscribe={() => {
                  openSubscriptionSheet("api_model_new");
                }}
                metric={rankingMetric}
                onMetricChange={setRankingMetric}
                focusRequest={rankingFocusRequest}
                locale={locale}
                onSelectEntry={(selection) =>
                  void selectRankingEntry(selection)
                }
              />
            </div>
          ) : null}
        </div>
        {priceIndexLinks.length > 0 ? (
          <nav className="price-index" aria-labelledby="price-index-title">
            <div className="price-index-heading">
              <p className="eyebrow">
                <span className="eyebrow-line" />
                {messages.pricing.priceIndexTitle}
              </p>
              <h2 id="price-index-title">
                {activeMode === "global"
                  ? messages.pricing.compareProducts
                  : messages.pricing.compareBrands}
              </h2>
              <p>
                {activeMode === "global"
                  ? messages.pricing.compareProductsDescription
                  : messages.pricing.compareBrandsDescription}
              </p>
            </div>
            <div className="price-index-links">
              {priceIndexLinks.map((link) => {
                const pending = pendingPriceIndexHref === link.href;
                return (
                  <a
                    key={link.href}
                    href={link.href}
                    data-pending={pending || undefined}
                    aria-busy={pending || undefined}
                    onClick={(event) => {
                      if (
                        event.defaultPrevented ||
                        event.button !== 0 ||
                        event.metaKey ||
                        event.ctrlKey ||
                        event.shiftKey ||
                        event.altKey
                      ) {
                        return;
                      }
                      event.preventDefault();
                      flushSync(() => setPendingPriceIndexHref(link.href));
                      window.setTimeout(
                        () => window.location.assign(link.href),
                        80,
                      );
                    }}
                  >
                    <span>
                      <strong>{link.label}</strong>
                      <small>
                        {pending
                          ? messages.pricing.openPricingPage
                          : link.description}
                      </small>
                    </span>
                    {pending ? (
                      <LoaderCircle
                        className="price-index-spinner"
                        size={16}
                        aria-hidden="true"
                      />
                    ) : (
                      <ArrowUpRight size={16} aria-hidden="true" />
                    )}
                  </a>
                );
              })}
            </div>
          </nav>
        ) : null}
      </main>

      <SiteFooter
        locale={locale}
        description={messages.pricing.footerDescription}
        includeCorrection
        contactEmail={hydrated ? contactEmail : undefined}
        ariaHidden={sheetOpen}
      />

      {sheetLoaded ? (
        <SubscriptionSheet
          open={sheetOpen}
          scopeLabel={subscriptionScope}
          providerId={selectedProvider.id}
          mode={activeMode}
          subscriptionType={subscriptionType}
          locale={locale}
          planId={
            activeMode === "global" ? (selectedPlanId ?? undefined) : undefined
          }
          onClose={() => setSheetOpen(false)}
        />
      ) : null}
    </div>
  );
}
