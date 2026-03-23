export interface RouteMatch {
  upstreamMethod: string;
  upstreamPath: string;
  buildBody?: (params: URLSearchParams) => unknown;
}

export function matchRoute(pathname: string, method: string): RouteMatch | null {
  // GET /parcels/search?address=...&polygon=...&limit=...
  if (pathname === "/parcels/search" && method === "GET") {
    return {
      upstreamMethod: "POST",
      upstreamPath: "/tools/parcel.bbox",
      buildBody: (params) => ({
        address: params.get("address") || undefined,
        polygon: params.get("polygon") || undefined,
        limit: params.get("limit") ? Number(params.get("limit")) : 50,
      }),
    };
  }

  // POST /parcels/sql
  if (pathname === "/parcels/sql" && method === "POST") {
    return {
      upstreamMethod: "POST",
      upstreamPath: "/tools/parcels.sql",
    };
  }

  // GET /parcels/:id
  const parcelMatch = pathname.match(/^\/parcels\/([^/]+)$/);
  if (parcelMatch && method === "GET" && parcelMatch[1] !== "sql") {
    return {
      upstreamMethod: "POST",
      upstreamPath: "/tools/parcel.lookup",
      buildBody: () => ({ parcel_id: decodeURIComponent(parcelMatch[1]) }),
    };
  }

  // GET /screening/:type/:parcelId
  const screenMatch = pathname.match(/^\/screening\/([^/]+)\/([^/]+)$/);
  if (screenMatch && method === "GET") {
    const type = screenMatch[1];
    const parcelId = decodeURIComponent(screenMatch[2]);
    // Don't match /screening/full/:parcelId here — that's the next route
    if (type === "full") return null;
    return {
      upstreamMethod: "POST",
      upstreamPath: `/tools/screen.${type}`,
      buildBody: () => ({ parcel_id: parcelId }),
    };
  }

  // POST /screening/full/:parcelId
  const fullScreenMatch = pathname.match(/^\/screening\/full\/([^/]+)$/);
  if (fullScreenMatch && method === "POST") {
    return {
      upstreamMethod: "POST",
      upstreamPath: "/api/screening/full",
      buildBody: () => ({ parcelId: decodeURIComponent(fullScreenMatch[1]) }),
    };
  }

  return null;
}
