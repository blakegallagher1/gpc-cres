import { GET } from "../app/api/cron/parish-pack-refresh/route";

async function main() {
  const req = new Request(
    "http://localhost/api/cron/parish-pack-refresh?jurisdictionId=00000000-0000-0000-0000-000000000010&sku=SMALL_BAY_FLEX",
    {
      method: "GET",
      headers: {
        authorization: "Bearer dummy",
      },
    },
  );
  const res = await GET(req);
  console.log("status", res.status);
  console.log(await res.text());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
