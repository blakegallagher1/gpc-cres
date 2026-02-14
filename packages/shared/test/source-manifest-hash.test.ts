import { describe, expect, it } from "vitest";

import { computeSourceCaptureManifestHash } from "../src/evidence.js";

const BASE_MANIFEST = [
  {
    sourceUrl: "https://county.example.gov/plans",
    jurisdictionId: "jur-1",
    qualityBucket: "fresh",
    captureAttempts: 1,
    captureSuccess: true,
    captureError: null,
    evidenceSourceId: "src-1",
    evidenceSnapshotId: "snap-1",
    contentHash: "hash-1",
  },
  {
    sourceUrl: "https://city.example.com/zoning",
    jurisdictionId: "jur-2",
    qualityBucket: "stale",
    captureAttempts: 2,
    captureSuccess: false,
    captureError: "Timeout",
    evidenceSourceId: null,
    evidenceSnapshotId: null,
    contentHash: null,
  },
];

describe("source manifest hash", () => {
  it("is deterministic for equivalent manifest entries irrespective of ordering", () => {
    const ordered = computeSourceCaptureManifestHash(BASE_MANIFEST);
    const shuffled = computeSourceCaptureManifestHash([BASE_MANIFEST[1], BASE_MANIFEST[0]]);

    expect(shuffled).toBe(ordered);
  });

  it("changes when manifest capture state changes", () => {
    const ordered = computeSourceCaptureManifestHash(BASE_MANIFEST);
    const changed = computeSourceCaptureManifestHash([
      ...BASE_MANIFEST.slice(0, 1),
      {
        ...BASE_MANIFEST[1],
        captureSuccess: true,
        captureError: null,
      },
    ]);

    expect(changed).not.toBe(ordered);
  });
});
