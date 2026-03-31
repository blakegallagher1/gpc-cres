import { DashboardShell } from "@/components/layout/DashboardShell";
import { OpportunitiesWorkspace } from "@/components/opportunities/OpportunitiesWorkspace";

type SearchParams = Record<string, string | string[] | undefined>;

type OpportunitiesPageProps = {
  searchParams?: SearchParams | Promise<SearchParams>;
};

function getSearchParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }

  return Array.isArray(value) ? value[0] : value;
}

export default async function OpportunitiesPage({
  searchParams,
}: OpportunitiesPageProps) {
  const params = searchParams instanceof Promise ? await searchParams : searchParams ?? {};
  const savedSearchId = getSearchParam(params.savedSearchId) ?? null;

  return (
    <DashboardShell>
      <OpportunitiesWorkspace initialSavedSearchId={savedSearchId} />
    </DashboardShell>
  );
}
