import {
  getChannelList,
  getDefaultChannelRepository,
} from "@/lib/channels/repository";
import { channelOfferFiltersSchema } from "@/lib/channels/types";
import {
  getTransitStations,
  loadTransitReadModel,
} from "@/lib/transit/repository";
import { TransitQueryError } from "@/lib/transit/ranking";
import { isTransitStationPublic } from "@/lib/transit/types";
import {
  publicChannelList,
  publicChannelMerchant,
  publicChannelOffer,
  publicChannelProduct,
  isPublicChannelOffer,
  publicError,
  publicJson,
  publicTransitDetail,
  publicTransitList,
  type ChannelResponseView,
} from "./response";

const channelViews = new Set<ChannelResponseView>([
  "all",
  "offers",
  "products",
  "merchants",
]);

function requestSearchParams(request: Request): URLSearchParams | null {
  try {
    return new URL(request.url).searchParams;
  } catch {
    return null;
  }
}

function channelViewFromParams(
  params: URLSearchParams,
  forcedView?: Exclude<ChannelResponseView, "all">,
): ChannelResponseView | Response {
  const values = params.getAll("view");
  if (values.length > 1) {
    return publicError("Invalid channel query", 400, "INVALID_QUERY");
  }
  const supplied = values[0]?.trim().toLowerCase();
  if (supplied && !channelViews.has(supplied as ChannelResponseView)) {
    return publicError("Invalid channel query", 400, "INVALID_QUERY");
  }
  if (forcedView) {
    // A path such as `/offers` has one unambiguous representation.  Ignore a
    // duplicate `view=...` value only when it agrees with that path; a
    // conflicting view is an invalid request rather than a data leak.
    if (supplied && supplied !== forcedView) {
      return publicError("Invalid channel query", 400, "INVALID_QUERY");
    }
    return forcedView;
  }
  return (supplied as ChannelResponseView | undefined) ?? "all";
}

function channelFilterParams(params: URLSearchParams): URLSearchParams {
  const filters = new URLSearchParams(params);
  filters.delete("view");
  // `publishedOnly=false` is an internal review switch.  Public endpoints
  // always query the published read model, even if a caller supplies aliases.
  for (const key of ["publishedOnly", "published_only"]) {
    const values = filters.getAll(key);
    filters.delete(key);
    if (
      values.some((value) =>
        ["0", "false", "no", "off"].includes(value.toLowerCase()),
      )
    ) {
      throw new Error("PRIVATE_FILTER");
    }
  }
  filters.set("publishedOnly", "true");
  return filters;
}

function validChannelId(id: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{0,159}$/i.test(id);
}

/** Shared GET implementation for `/api/channels` and its versioned aliases. */
export async function handleChannelsGet(
  request: Request,
  forcedView?: Exclude<ChannelResponseView, "all">,
): Promise<Response> {
  const params = requestSearchParams(request);
  if (!params) return publicError("Invalid request URL", 400, "INVALID_QUERY");
  const view = channelViewFromParams(params, forcedView);
  if (view instanceof Response) return view;

  let filters: URLSearchParams;
  try {
    filters = channelFilterParams(params);
  } catch (error) {
    if (error instanceof Error && error.message === "PRIVATE_FILTER") {
      return publicError(
        "Private channel records are not available",
        400,
        "PRIVATE_FILTER",
      );
    }
    return publicError("Invalid channel query", 400, "INVALID_QUERY");
  }
  const parsed = channelOfferFiltersSchema.safeParse(filters);
  if (!parsed.success) {
    return publicError("Invalid channel query", 400, "INVALID_QUERY");
  }

  try {
    const result = await getChannelList(parsed.data);
    const body = publicChannelList(result, view);
    const unavailable =
      result.dataStatus === "degraded" &&
      result.offers.length === 0 &&
      result.dataSource !== "synthetic" &&
      result.dataSource !== "synthetic_fixture";
    return publicJson(body, {
      status: unavailable ? 503 : 200,
      cache: !unavailable,
    });
  } catch {
    return publicError(
      "Channels data is temporarily unavailable",
      503,
      "DATA_UNAVAILABLE",
    );
  }
}

/**
 * Optional channel detail endpoint.  The domain's canonical detail object is
 * an offer; product/merchant IDs are accepted as a convenience and resolved
 * from the same published snapshot without a second source request.
 */
export async function handleChannelDetailGet(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  let id: string;
  try {
    ({ id } = await context.params);
  } catch {
    return publicError("Invalid channel identifier", 400, "INVALID_ID");
  }
  if (!validChannelId(id)) {
    return publicError("Channel offer not found", 404, "NOT_FOUND");
  }
  try {
    const repository = getDefaultChannelRepository();
    const snapshot = await repository.getSnapshot();
    const offer = snapshot.offers.find(
      (candidate) =>
        candidate.id.toLowerCase() === id.toLowerCase() &&
        isPublicChannelOffer(candidate),
    );
    if (offer) {
      return publicJson({
        ok: true,
        domain: "channels",
        offer: publicChannelOffer(offer),
      });
    }
    const product = (snapshot.products ?? []).find(
      (candidate) =>
        candidate.id.toLowerCase() === id.toLowerCase() ||
        candidate.slug.toLowerCase() === id.toLowerCase(),
    );
    if (product && ["published", "verified"].includes(product.reviewStatus)) {
      return publicJson({
        ok: true,
        domain: "channels",
        product: publicChannelProduct(product),
      });
    }
    const merchant = (snapshot.merchants ?? []).find(
      (candidate) =>
        candidate.id.toLowerCase() === id.toLowerCase() ||
        candidate.slug.toLowerCase() === id.toLowerCase(),
    );
    if (merchant && ["active", "pending_review"].includes(merchant.status)) {
      return publicJson({
        ok: true,
        domain: "channels",
        merchant: publicChannelMerchant(merchant),
      });
    }
    const unavailable =
      snapshot.dataStatus === "degraded" &&
      snapshot.offers.length === 0 &&
      snapshot.dataSource !== "synthetic" &&
      snapshot.dataSource !== "synthetic_fixture";
    return publicError(
      unavailable
        ? "Channels data is temporarily unavailable"
        : "Channel offer not found",
      unavailable ? 503 : 404,
      unavailable ? "DATA_UNAVAILABLE" : "NOT_FOUND",
    );
  } catch {
    return publicError(
      "Channels data is temporarily unavailable",
      503,
      "DATA_UNAVAILABLE",
    );
  }
}

function transitSearchParams(request: Request): URLSearchParams | Response {
  const params = requestSearchParams(request);
  if (!params) return publicError("Invalid request URL", 400, "INVALID_QUERY");
  const includeUnpublished = params.getAll("includeUnpublished");
  if (
    includeUnpublished.some((value) =>
      ["1", "true", "yes", "on"].includes(value.toLowerCase()),
    )
  ) {
    return publicError(
      "Private transit records are not available",
      400,
      "PRIVATE_FILTER",
    );
  }
  params.delete("includeUnpublished");
  return params;
}

/** Shared GET implementation for transit station lists. */
export async function handleTransitGet(request: Request): Promise<Response> {
  const params = transitSearchParams(request);
  if (params instanceof Response) return params;
  try {
    const result = await getTransitStations(params, {
      signal: request.signal,
      includeUnpublished: false,
    });
    const body = publicTransitList(result);
    const unavailable =
      result.degraded && result.items.length === 0 && !result.isSynthetic;
    return publicJson(body, {
      status: unavailable ? 503 : 200,
      cache: !unavailable,
    });
  } catch (error) {
    if (error instanceof TransitQueryError) {
      return publicError("Invalid transit query", 400, "INVALID_QUERY");
    }
    return publicError(
      "Transit data is temporarily unavailable",
      503,
      "DATA_UNAVAILABLE",
    );
  }
}

/** Shared GET implementation for `/api/transit/:slug` detail routes. */
export async function handleTransitDetailGet(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  let slug: string;
  try {
    ({ slug } = await context.params);
  } catch {
    return publicError("Invalid transit station identifier", 400, "INVALID_ID");
  }
  if (!/^[a-z0-9][a-z0-9-]{0,99}$/i.test(slug)) {
    return publicError("Transit station not found", 404, "NOT_FOUND");
  }
  try {
    // Resolve the slug from one read-model load so a cache-disabled
    // deployment/test does not perform a second DB read just for metadata.
    const model = await loadTransitReadModel({}, { signal: _request.signal });
    const station = model.stations.find(
      (candidate) =>
        candidate.slug.toLocaleLowerCase("en-US") === slug.toLowerCase() &&
        isTransitStationPublic(candidate, {
          includeSample: model.isSynthetic,
          includeUnpublished: false,
        }),
    );
    if (!station) {
      const unavailable =
        model.degraded && model.stations.length === 0 && !model.isSynthetic;
      return publicError(
        unavailable
          ? "Transit data is temporarily unavailable"
          : "Transit station not found",
        unavailable ? 503 : 404,
        unavailable ? "DATA_UNAVAILABLE" : "NOT_FOUND",
      );
    }
    return publicJson(publicTransitDetail(station, model), {
      cache: !model.degraded,
    });
  } catch {
    return publicError(
      "Transit data is temporarily unavailable",
      503,
      "DATA_UNAVAILABLE",
    );
  }
}
