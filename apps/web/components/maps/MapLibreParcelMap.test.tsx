import { describe, expect, it } from "vitest";
import { parcelPopupHtml } from "./MapLibreParcelMap";
import type { MapParcel } from "./ParcelMap";

const baseParcel: MapParcel = {
  id: "p-1",
  address: "123 Main St",
  lat: 30.45,
  lng: -91.18,
};

describe("parcelPopupHtml sanitization", () => {
  it("renders expected popup content on happy path", () => {
    const html = parcelPopupHtml({
      ...baseParcel,
      dealName: "Deal One",
      dealStatus: "TRIAGE_DONE",
      acreage: 1.25,
      currentZoning: "C2",
      floodZone: "X",
    });

    expect(html).toContain("123 Main St");
    expect(html).toContain("Deal One");
    expect(html).toContain("Status: TRIAGE DONE");
    expect(html).toContain("1.25 acres");
    expect(html).toContain("Zoning: C2");
    expect(html).toContain("Flood: X");
  });

  it("escapes user-sourced HTML to block script injection", () => {
    const html = parcelPopupHtml({
      ...baseParcel,
      address: `<img src=x onerror="alert('xss')">`,
      dealName: `<script>alert("xss")</script>`,
      dealStatus: `HEARING"><script>alert(1)</script>`,
      currentZoning: `<b>C2</b>`,
      floodZone: `<svg onload=alert(1)>`,
    });

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<svg");
    expect(html).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(&#39;xss&#39;)&quot;&gt;");
    expect(html).toContain("&lt;b&gt;C2&lt;/b&gt;");
  });

  it("handles optional/null parcel fields without throwing", () => {
    const html = parcelPopupHtml({
      ...baseParcel,
      acreage: null,
      dealName: undefined,
      dealStatus: undefined,
      currentZoning: null,
      floodZone: null,
    });

    expect(html).toContain("123 Main St");
    expect(html).not.toContain("Status:");
    expect(html).not.toContain("Zoning:");
    expect(html).not.toContain("Flood:");
    expect(html).not.toContain("acres");
  });
});
