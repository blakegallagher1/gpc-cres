export interface RouteMatch {
  upstreamMethod: string;
  upstreamPath: string;
  buildBody?: (params: URLSearchParams) => unknown;
}

export function matchRoute(pathname: string, method: string, searchParams?: URLSearchParams): RouteMatch | null {
  // GET /parcels/search?q=...&limit=... — pass through to upstream gateway search
  if (pathname === "/parcels/search" && method === "GET") {
    const qs = searchParams?.toString() ?? "";
    return {
      upstreamMethod: "GET",
      upstreamPath: `/api/parcels/search${qs ? `?${qs}` : ""}`,
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
