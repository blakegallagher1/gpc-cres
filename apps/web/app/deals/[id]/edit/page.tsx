import { DealUpsertForm } from "@/components/deals/DealUpsertForm";

export default async function EditDealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <DealUpsertForm mode="edit" dealId={id} />;
}
