import { PrismaClient } from "@prisma/client";

type SeedJurisdiction = {
  id: string;
  name: string;
  kind: "parish" | "city";
  state: string;
  timezone: string;
  officialDomains: string[];
  seedSources: Array<{ purpose: string; url: string }>;
};

const SEED_ORG = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "Gallagher Property Company",
};

const SEED_USER = {
  id: "00000000-0000-0000-0000-000000000002",
  email: "admin@gallagherpropertyco.com",
};

const SEED_JURISDICTIONS: SeedJurisdiction[] = [
  {
    id: "00000000-0000-0000-0000-000000000010",
    name: "East Baton Rouge Parish",
    kind: "parish",
    state: "LA",
    timezone: "America/Chicago",
    officialDomains: [
      "brla.gov",
      "la-batonrouge.civicplus.com",
      "experience.arcgis.com",
      "ebrgis.maps.arcgis.com",
      "stormwater.brla.gov",
      "bfrpc.org",
      "legis.la.gov",
    ],
    seedSources: [
      { purpose: "applications", url: "https://www.brla.gov/683/Applications" },
      { purpose: "schedule", url: "https://www.brla.gov/2521/Planning-and-Zoning-Schedule" },
      {
        purpose: "fees",
        url: "https://www.brla.gov/DocumentCenter/View/2279/Appendix-B---Application-Fee-Schedule-PDF",
      },
      {
        purpose: "applications",
        url: "https://www.brla.gov/DocumentCenter/View/2178/Conditional-Use-Permit-PDF",
      },
      { purpose: "applications", url: "https://www.brla.gov/DocumentCenter/View/2159/Rezoning-PDF" },
      {
        purpose: "checklists",
        url: "https://www.brla.gov/DocumentCenter/View/15644/Conditional-Use-Permit-Checklist-",
      },
      { purpose: "ordinance", url: "https://www.brla.gov/110/Unified-Development-Code" },
      { purpose: "forms", url: "https://www.brla.gov/1240/Planning-Applications" },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000011",
    name: "Ascension Parish",
    kind: "parish",
    state: "LA",
    timezone: "America/Chicago",
    officialDomains: ["ascensionparish.net", "library.municode.com", "maps.apgov.us", "apgov.us"],
    seedSources: [
      { purpose: "applications", url: "https://www.ascensionparish.net/zoning-2/" },
      {
        purpose: "applications",
        url: "https://www.ascensionparish.net/wp-content/uploads/2024/05/New-Rezoning-Application-3.pdf",
      },
      {
        purpose: "schedule",
        url: "https://www.ascensionparish.net/wp-content/uploads/2026/01/Meeting-Dates-Deadlines-Zoning-2026.pdf",
      },
      {
        purpose: "schedule",
        url: "https://www.ascensionparish.net/wp-content/uploads/2026/01/Meeting-Dates-Deadlines-BOA-2026.pdf",
      },
      {
        purpose: "applications",
        url: "https://www.ascensionparish.net/wp-content/uploads/2024/05/Variance-Application-New-Format-1.pdf",
      },
      { purpose: "ordinance", url: "https://library.municode.com/la/ascension_parish" },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000012",
    name: "Livingston Parish",
    kind: "parish",
    state: "LA",
    timezone: "America/Chicago",
    officialDomains: [
      "livingstonparishcouncil.com",
      "livingstonparishla.gov",
      "library.municode.com",
      "wspglobal.maps.arcgis.com",
    ],
    seedSources: [
      { purpose: "zoning", url: "https://www.livingstonparishcouncil.com/council/page/zoning" },
      {
        purpose: "ordinance",
        url: "https://www.livingstonparishcouncil.com/sites/default/files/fileattachments/parish_council/page/14584/zoning_ordinance_-_chapter_117_only_signed_final_v.2.pdf",
      },
      { purpose: "schedule", url: "https://www.livingstonparishcouncil.com/cc-pc" },
      { purpose: "applications", url: "https://www.livingstonparishla.gov/planning-dev" },
      { purpose: "applications", url: "https://www.livingstonparishla.gov/formsPermitsApplications" },
    ],
  },
];

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    // Seed org
    const org = await prisma.org.upsert({
      where: { id: SEED_ORG.id },
      update: {},
      create: {
        id: SEED_ORG.id,
        name: SEED_ORG.name,
      },
    });

    // Seed user
    const user = await prisma.user.upsert({
      where: { id: SEED_USER.id },
      update: {},
      create: {
        id: SEED_USER.id,
        email: SEED_USER.email,
      },
    });

    // Seed org membership
    await prisma.orgMembership.upsert({
      where: { orgId_userId: { orgId: org.id, userId: user.id } },
      update: {},
      create: { orgId: org.id, userId: user.id, role: "owner" },
    });

    // Seed jurisdictions
    for (const jurisdictionSeed of SEED_JURISDICTIONS) {
      const jurisdiction = await prisma.jurisdiction.upsert({
        where: { id: jurisdictionSeed.id },
        update: {},
        create: {
          id: jurisdictionSeed.id,
          orgId: org.id,
          name: jurisdictionSeed.name,
          kind: jurisdictionSeed.kind,
          state: jurisdictionSeed.state,
          timezone: jurisdictionSeed.timezone,
          officialDomains: jurisdictionSeed.officialDomains,
        },
      });

      // Seed jurisdiction seed sources
      for (const source of jurisdictionSeed.seedSources) {
        const existing = await prisma.jurisdictionSeedSource.findFirst({
          where: {
            jurisdictionId: jurisdiction.id,
            url: source.url,
          },
        });

        if (!existing) {
          await prisma.jurisdictionSeedSource.create({
            data: {
              jurisdictionId: jurisdiction.id,
              purpose: source.purpose,
              url: source.url,
              active: true,
            },
          });
        } else {
          await prisma.jurisdictionSeedSource.update({
            where: { id: existing.id },
            data: {
              purpose: source.purpose,
              active: true,
            },
          });
        }
      }
    }

    // eslint-disable-next-line no-console
    console.log("Seed complete");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
