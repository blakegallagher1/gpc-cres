import { prisma } from "@entitlement-os/db";

export class DealArtifactNotFoundError extends Error {
  constructor() {
    super("Artifact not found");
    this.name = "DealArtifactNotFoundError";
  }
}

type ArtifactScope = {
  artifactId: string;
  orgId: string;
};

export async function getArtifactForOrg(scope: ArtifactScope) {
  const artifact = await prisma.artifact.findFirst({
    where: { id: scope.artifactId, orgId: scope.orgId },
  });

  if (!artifact) {
    throw new DealArtifactNotFoundError();
  }

  return artifact;
}
