import { DashboardShell } from "@/components/layout/DashboardShell";
import { OpportunityFeed } from "@/components/opportunities/OpportunityFeed";

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
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Opportunity Inbox</h1>
          <p className="text-sm text-muted-foreground">
            Review parcel matches from saved searches and convert the best ones into deals.
            {savedSearchId ? " Showing a single saved search filter." : ""}
          </p>
        </div>

        <OpportunityFeed
          limit={50}
          savedSearchId={savedSearchId}
          showViewAllLink={false}
        />
      </div>
    </DashboardShell>
  );
}
