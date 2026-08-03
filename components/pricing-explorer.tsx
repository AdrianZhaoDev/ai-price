"use client";

import { ProviderMark } from "@/components/icons/provider-mark";
import { ChangeBadge } from "@/components/change-badge";
import {
  ApiPriceRanking,
  type ApiRankingFocusRequest,
  type ApiRankingSelection,
} from "@/components/api-price-ranking";
import { ThemeToggle } from "@/components/theme-toggle";
import { trackTrafficEvent } from "@/lib/analytics/traffic";
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
  RefreshCw,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

type PricingExplorerProps = {
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
    loading: () => (
      <div className="sheet-layer" role="presentation">
        <div
          className="subscription-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="正在打开价格订阅"
        >
          <p role="status">正在打开价格订阅…</p>
        </div>
      </div>
    ),
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

function priceChangeDetails(change: PriceChangeSummary): string[] {
  const cnyReference =
    change.previousCny !== undefined && change.currentCny !== undefined
      ? `人民币参考 ${formatCny(change.previousCny)} → ${formatCny(change.currentCny)}`
      : "人民币参考暂不可用";
  return [
    `原价格 ${change.previousDisplayPrice}`,
    `现价格 ${change.currentDisplayPrice}`,
    cnyReference,
    `确认时间 ${new Date(change.changedAt).toLocaleString("zh-CN", { hour12: false })}`,
  ];
}

export function PricingExplorer({
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
    "price" | "api_ranking"
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
    (type: "price" | "api_ranking") => {
      trackTrafficEvent("subscription_sheet_opened", {
        mode: activeMode,
        provider_id: selectedProviderId,
        subscription_type: type,
        plan_scope:
          type === "api_ranking"
            ? "api_ranking"
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
    ? new Intl.DateTimeFormat("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Shanghai",
      }).format(new Date(selectedProvider.lastCheckedAt))
    : "等待首次采集";

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
              `${provider.label}完整报价暂时加载失败，请稍后重试。`,
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
    [activeMode, dataVersion, deferredIds],
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
    router.replace(`${modeHref(activeMode)}?${query.toString()}`, {
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
    router.replace(`${modeHref(activeMode)}?${query.toString()}`, {
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
      `${modeHref(activeMode)}?provider=${encodeURIComponent(provider.id)}&model=${encodeURIComponent(selection.modelSlug)}`,
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
      router.prefetch(modeHref(mode.id));
    }
  }, [activeMode, modes, router]);

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
      <a className="skip-link" href="#main-content">
        跳至主要内容
      </a>
      <header
        className="site-header"
        aria-hidden={sheetOpen ? true : undefined}
      >
        <Link href="/" className="brand" aria-label="Low Price Radar 首页">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
          </span>
          <span className="brand-copy">
            <strong>Low Price Radar</strong>
            <small>AI订阅全球比价</small>
          </span>
        </Link>

        <nav className="desktop-nav" aria-label="价格模式">
          {modes.map((mode) => (
            <Link
              key={mode.id}
              href={modeHref(mode.id)}
              prefetch
              className="nav-item pressable"
              data-mode={mode.id}
              aria-current={activeMode === mode.id ? "page" : undefined}
              aria-label={mode.shortLabel}
            >
              {mode.shortLabel}
              {mode.id === "api" ? (
                <span className="nav-label-compact" aria-hidden="true">
                  API 榜单
                </span>
              ) : null}
              {mode.id === "api" ? (
                <span className="nav-hot-badge" aria-hidden="true">
                  Hot
                </span>
              ) : null}
            </Link>
          ))}
        </nav>

        <div className="header-actions">
          <div className="sync-state" title="计划任务每 4 小时采集一次">
            <span className="sync-dot" />每 4 小时
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main
        id="main-content"
        className="main-content"
        aria-hidden={sheetOpen ? true : undefined}
      >
        <h1 className="sr-only" id="workspace-title">
          {activeMode === "global"
            ? "AI订阅全球价格对比"
            : activeMode === "china-subscription"
              ? "国内 AI 会员，直接看官方价"
              : "模型调用成本，按官方单位列清楚"}
        </h1>

        {activeMode === "api" ? (
          <div className="api-ranking-mobile" id="api-ranking">
            <ApiPriceRanking
              providers={modeProviders}
              changes={rankingChanges}
              onSubscribe={() => {
                openSubscriptionSheet("api_ranking");
              }}
              metric={rankingMetric}
              onMetricChange={setRankingMetric}
              focusRequest={rankingFocusRequest}
              onSelectEntry={(selection) => void selectRankingEntry(selection)}
            />
          </div>
        ) : null}

        <section className="provider-section" aria-labelledby="provider-title">
          <div className="section-label-row">
            <h2 id="provider-title">
              {activeMode === "api" ? "选择模型平台" : "选择产品"}
            </h2>
            <div className="section-meta">
              <div className="freshness-block">
                <Clock3 size={16} aria-hidden="true" />
                <span>
                  最近核验
                  <strong>{lastCheckedAt}</strong>
                </span>
              </div>
              <span className="official-source-count">
                {modeProviders.length} 个官方来源
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
                    <span>{loading ? "加载中…" : provider.label}</span>
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
                      官方页面
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
                      关注价格
                    </button>
                  </div>
                </div>

                {activeMode === "global" && availablePlans.length > 1 ? (
                  <div
                    className="plan-strip"
                    aria-label="选择套餐，按最低价格从低到高排列"
                    title="各套餐按全球最低价排列：左便宜右贵"
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
                        aria-label={`${plan.name}，全球最低价 ${formatCny(plan.minimumCny)}`}
                      >
                        <span className="plan-name">{plan.name}</span>
                        <span className="plan-minimum">
                          最低 {formatCny(plan.minimumCny)}
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
                        ? `${selectedPlan?.name ?? "套餐"} · ${visibleOffers.length} 个地区报价`
                        : `${sortedOffers.length} 个价格项目`}
                    </span>
                    <button
                      type="button"
                      className="sort-button pressable"
                      onClick={toggleSortDirection}
                      aria-label={
                        sortDirection === "desc"
                          ? "当前高价优先，点击改为低价优先"
                          : "当前低价优先，点击改为高价优先"
                      }
                    >
                      <ArrowDownUp size={13} />
                      {sortDirection === "desc" ? "高价优先" : "低价优先"}
                    </button>
                  </div>
                  {lowestOffer?.convertedCny !== undefined ? (
                    <p>
                      当前最低参考
                      <strong className="lowest-price">
                        {activeMode === "api"
                          ? formatApiCny(lowestOffer.convertedCny)
                          : formatCny(lowestOffer.convertedCny)}
                      </strong>
                    </p>
                  ) : (
                    <p>原始价格以官方页面为准</p>
                  )}
                </div>

                <div
                  className={`price-list ${activeMode === "global" ? "price-list-global" : ""}`}
                  role="table"
                  aria-label="官方价格"
                >
                  <div className="price-list-header" role="row">
                    {activeMode === "global" ? (
                      <>
                        <span role="columnheader">序号</span>
                        <span role="columnheader">国家</span>
                        <span role="columnheader">原始价格</span>
                        <span role="columnheader">汇率</span>
                        <span role="columnheader">人民币</span>
                        <span role="columnheader">比价</span>
                        <span role="columnheader" aria-label="官方链接" />
                      </>
                    ) : (
                      <>
                        <span role="columnheader">方案 / 模型</span>
                        <span role="columnheader">
                          {activeMode === "api" ? "人民币价格" : "官方价格"}
                        </span>
                        <span role="columnheader">
                          {activeMode === "api" ? "计费单位" : "人民币参考"}
                        </span>
                        {activeMode === "api" ? (
                          <span role="columnheader" className="sr-only">
                            排行榜定位
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
                                    ? "降价"
                                    : "涨价"
                                }
                                tone={
                                  offer.lastPriceChange.direction === "decrease"
                                    ? "positive"
                                    : "negative"
                                }
                                ariaLabel={`${offer.regionName ?? offer.planName}${offer.lastPriceChange.direction === "decrease" ? "降价" : "涨价"}`}
                                details={priceChangeDetails(
                                  offer.lastPriceChange,
                                )}
                              />
                            ) : null}
                            <small>{offer.planName}</small>
                            <span className="mobile-global-details">
                              {formatCny(offer.convertedCny)}
                              {comparison && !comparison.isMinimum
                                ? ` · ↑ ${comparison.percentage.toFixed(1)}%`
                                : comparison?.isMinimum
                                  ? " · 最便宜"
                                  : ""}
                            </span>
                          </div>
                          <span className="fx-rate" role="cell">
                            {formatFxRate(offer)}
                          </span>
                          <div
                            className="converted-price"
                            role="cell"
                            data-rank={rank}
                          >
                            <strong>{formatCny(offer.convertedCny)}</strong>
                          </div>
                          <div
                            className="price-comparison"
                            role="cell"
                            data-minimum={comparison?.isMinimum}
                          >
                            {comparison?.isMinimum ? (
                              <strong>最便宜</strong>
                            ) : comparison ? (
                              <>
                                <strong>
                                  ↑ {comparison.percentage.toFixed(1)}%
                                </strong>
                                <small>
                                  贵{formatCny(comparison.difference)}
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
                              aria-label={`查看${offer.regionName ?? "此地区"}官方价格`}
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
                              ? formatApiCny(offer.convertedCny)
                              : formatOfferPrice(offer)}
                          </strong>
                          {offer.lastPriceChange ? (
                            <ChangeBadge
                              label={
                                offer.lastPriceChange.direction === "decrease"
                                  ? "降价"
                                  : "涨价"
                              }
                              tone={
                                offer.lastPriceChange.direction === "decrease"
                                  ? "positive"
                                  : "negative"
                              }
                              ariaLabel={`${offer.planName}${offer.lastPriceChange.direction === "decrease" ? "降价" : "涨价"}`}
                              details={priceChangeDetails(
                                offer.lastPriceChange,
                              )}
                            />
                          ) : null}
                          {offer.currency ? (
                            <small>
                              {activeMode === "api" &&
                              offer.currency.toUpperCase() !== "CNY"
                                ? `${formatOfferPrice(offer)} · ${formatFxRate(offer)} · ${formatFxDate(offer)}`
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
                                  · {formatCny(offer.convertedCny)}
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
                            <span>{offer.unit ?? "按官方单位"}</span>
                          ) : (
                            <strong>{formatCny(offer.convertedCny)}</strong>
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
                              aria-label={`在排行榜中查看 ${offer.planName}`}
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
                        ? "收起地区列表"
                        : "收起价格项目"
                      : activeMode === "global"
                        ? `查看全部 ${sortedOffers.length} 个地区`
                        : `查看全部 ${sortedOffers.length} 个价格项目`}
                    <span>
                      {expandedProviderIds.has(selectedProvider.id)
                        ? activeMode === "global"
                          ? `已显示全部 ${sortedOffers.length} 个地区`
                          : `已显示全部 ${sortedOffers.length} 个价格项目`
                        : `当前显示 ${visibleOffers.length} 个`}
                    </span>
                  </button>
                ) : null}

                <div className="method-note">
                  <Info size={16} aria-hidden="true" />
                  <p>
                    价格仅作参考；原币金额来自官方来源，人民币为汇率换算结果。
                    失效数据不会覆盖最后一次有效记录。
                  </p>
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
                  openSubscriptionSheet("api_ranking");
                }}
                metric={rankingMetric}
                onMetricChange={setRankingMetric}
                focusRequest={rankingFocusRequest}
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
                可收录价格页面
              </p>
              <h2 id="price-index-title">
                {activeMode === "global" ? "按产品继续比较" : "按品牌查看价格"}
              </h2>
              <p>
                {activeMode === "global"
                  ? "进入产品页查看套餐范围，再按具体套餐比较不同地区。"
                  : "每个品牌页汇总可追溯的官方套餐、模型和计费单位。"}
              </p>
            </div>
            <div className="price-index-links">
              {priceIndexLinks.map((link) => (
                <Link key={link.href} href={link.href} prefetch={false}>
                  <span>
                    <strong>{link.label}</strong>
                    <small>{link.description}</small>
                  </span>
                  <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              ))}
            </div>
          </nav>
        ) : null}
      </main>

      <footer
        className="site-footer"
        aria-hidden={sheetOpen ? true : undefined}
      >
        <div>
          <strong>Low Price Radar</strong>
          <p>AI订阅全球比价 · 看清官方价格，再决定是否订阅。</p>
        </div>
        <div className="footer-links">
          <Link href="/methodology">采集方法</Link>
          <Link href="/privacy">隐私</Link>
          <a
            href={
              hydrated
                ? `mailto:${contactEmail}`
                : "/methodology#data-corrections"
            }
          >
            数据纠错
          </a>
        </div>
      </footer>

      {sheetLoaded ? (
        <SubscriptionSheet
          open={sheetOpen}
          scopeLabel={subscriptionScope}
          providerId={selectedProvider.id}
          mode={activeMode}
          subscriptionType={subscriptionType}
          planId={
            activeMode === "global" ? (selectedPlanId ?? undefined) : undefined
          }
          onClose={() => setSheetOpen(false)}
        />
      ) : null}
    </div>
  );
}
