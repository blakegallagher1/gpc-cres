import type { HeatmapLayerSpecification } from "maplibre-gl";
import type { HeatmapPresetKey, MapParcel, SaleComp } from "./types";

export type { HeatmapPresetKey, SaleComp } from "./types";

export interface HeatmapPreset {
  key: HeatmapPresetKey;
  label: string;
  description: string;
  paint: HeatmapLayerSpecification["paint"];
  buildSource: (
    parcels: MapParcel[],
    compData?: SaleComp[]
  ) => GeoJSON.FeatureCollection<GeoJSON.Point>;
}

function normalize(values: number[]): number[] {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  return values.map((value) => (value - min) / range);
}

function monthsAgo(dateStr: string | null): number {
  if (!dateStr) return 999;
  const date = new Date(dateStr);
  const now = new Date();
  return (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
}

const SALE_ACTIVITY_PRESET: HeatmapPreset = {
  key: "sale_activity",
  label: "Sale Activity",
  description: "Recent sales concentration",
  paint: {
    "heatmap-weight": ["interpolate", ["linear"], ["get", "intensity"], 0, 0, 1, 1],
    "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, 1, 16, 2.5],
    "heatmap-color": [
      "interpolate",
      ["linear"],
      ["heatmap-density"],
      0,
      "rgba(255,255,255,0)",
      0.1,
      "rgba(209,213,219,0.3)",
      0.3,
      "rgba(134,239,172,0.5)",
      0.6,
      "rgba(34,197,94,0.7)",
      0.8,
      "rgba(22,163,74,0.82)",
      1,
      "rgba(21,128,61,0.92)",
    ],
    "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 20, 16, 40],
    "heatmap-opacity": 0.8,
  },
  buildSource(parcels, compData) {
    if (compData && compData.length > 0) {
      return {
        type: "FeatureCollection",
        features: compData.map((comp) => {
          const months = monthsAgo(comp.saleDate);
          const intensity = Math.max(0, 1 - months / 36);
          return {
            type: "Feature",
            geometry: { type: "Point", coordinates: [comp.lng, comp.lat] },
            properties: { intensity },
          };
        }),
      };
    }

    const statusRecency: Record<string, number> = {
      CLOSING: 1,
      UNDER_CONTRACT: 0.9,
      EXITED: 0.8,
      ENTITLED: 0.7,
      HEARING: 0.6,
      PREAPP: 0.5,
      TRIAGE_DONE: 0.4,
      TRIAGE_PENDING: 0.3,
      SCREENING: 0.2,
      INTAKE: 0.15,
      KILLED: 0.05,
    };

    return {
      type: "FeatureCollection",
      features: parcels.map((parcel) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [parcel.lng, parcel.lat] },
        properties: { intensity: statusRecency[parcel.dealStatus ?? ""] ?? 0.2 },
      })),
    };
  },
};

const PRICE_DENSITY_PRESET: HeatmapPreset = {
  key: "price_density",
  label: "Price Density",
  description: "Land value concentration",
  paint: {
    "heatmap-weight": ["interpolate", ["linear"], ["get", "intensity"], 0, 0, 1, 1],
    "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, 1, 16, 3],
    "heatmap-color": [
      "interpolate",
      ["linear"],
      ["heatmap-density"],
      0,
      "rgba(255,255,255,0)",
      0.1,
      "rgba(254,243,199,0.3)",
      0.3,
      "rgba(253,224,71,0.5)",
      0.6,
      "rgba(245,158,11,0.7)",
      0.8,
      "rgba(217,119,6,0.82)",
      1,
      "rgba(180,83,9,0.92)",
    ],
    "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 18, 16, 36],
    "heatmap-opacity": 0.75,
  },
  buildSource(parcels, compData) {
    if (compData && compData.length > 0) {
      const priced = compData.filter(
        (comp): comp is SaleComp & { pricePerAcre: number } =>
          typeof comp.pricePerAcre === "number" && comp.pricePerAcre > 0
      );
      const normalized = normalize(priced.map((comp) => comp.pricePerAcre));
      return {
        type: "FeatureCollection",
        features: priced.map((comp, index) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [comp.lng, comp.lat] },
          properties: { intensity: normalized[index] ?? 0.3 },
        })),
      };
    }

    const acreages = parcels.map((parcel) => Number(parcel.acreage || 1));
    const maxAcreage = Math.max(...acreages, 1);
    return {
      type: "FeatureCollection",
      features: parcels.map((parcel, index) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [parcel.lng, parcel.lat] },
        properties: { intensity: 1 - Math.min(acreages[index] / maxAcreage, 1) * 0.8 },
      })),
    };
  },
};

const DEVELOPMENT_ACTIVITY_PRESET: HeatmapPreset = {
  key: "development_activity",
  label: "Development Activity",
  description: "Deal stage and entitlement activity",
  paint: {
    "heatmap-weight": ["interpolate", ["linear"], ["get", "intensity"], 0, 0, 1, 1],
    "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, 1.2, 16, 3],
    "heatmap-color": [
      "interpolate",
      ["linear"],
      ["heatmap-density"],
      0,
      "rgba(255,255,255,0)",
      0.1,
      "rgba(224,231,255,0.3)",
      0.3,
      "rgba(165,180,252,0.5)",
      0.6,
      "rgba(99,102,241,0.72)",
      0.8,
      "rgba(79,70,229,0.84)",
      1,
      "rgba(67,56,202,0.92)",
    ],
    "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 22, 16, 44],
    "heatmap-opacity": 0.78,
  },
  buildSource(parcels) {
    const activityScore: Record<string, number> = {
      INTAKE: 0.1,
      SCREENING: 0.25,
      TRIAGE_PENDING: 0.35,
      TRIAGE_DONE: 0.45,
      PREAPP: 0.55,
      HEARING: 0.65,
      ENTITLED: 0.75,
      UNDER_CONTRACT: 0.85,
      CLOSING: 0.95,
      EXITED: 0.6,
      KILLED: 0.05,
    };

    return {
      type: "FeatureCollection",
      features: parcels.map((parcel) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [parcel.lng, parcel.lat] },
        properties: { intensity: activityScore[parcel.dealStatus ?? ""] ?? 0.15 },
      })),
    };
  },
};

const ZONING_UPSIDE_PRESET: HeatmapPreset = {
  key: "zoning_upside",
  label: "Zoning Upside",
  description:
    "Parcels zoned below highest-and-best use — industrial/commercial potential in agricultural or residential zones",
  paint: {
    "heatmap-weight": ["interpolate", ["linear"], ["get", "intensity"], 0, 0, 1, 1],
    "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, 1, 16, 2.8],
    "heatmap-color": [
      "interpolate",
      ["linear"],
      ["heatmap-density"],
      0,
      "rgba(255,255,255,0)",
      0.1,
      "rgba(237,233,254,0.3)",
      0.3,
      "rgba(196,181,253,0.5)",
      0.6,
      "rgba(139,92,246,0.72)",
      0.8,
      "rgba(109,40,217,0.84)",
      1,
      "rgba(76,29,149,0.92)",
    ],
    "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 20, 16, 40],
    "heatmap-opacity": 0.78,
  },
  buildSource(parcels) {
    return {
      type: "FeatureCollection",
      features: parcels.map((parcel) => {
        const zoning = (parcel.currentZoning ?? "").toUpperCase();
        let intensity = 0.1;
        if (zoning.startsWith("A")) {
          intensity = 0.9;
        } else if (zoning.startsWith("R")) {
          intensity = 0.6;
        } else if (zoning.startsWith("C")) {
          intensity = 0.3;
        }
        // I* / M* (industrial/manufacturing) = already at best use
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [parcel.lng, parcel.lat] },
          properties: { intensity },
        };
      }),
    };
  },
};

const DISTRESSED_OWNERSHIP_PRESET: HeatmapPreset = {
  key: "distressed_ownership",
  label: "Distressed Ownership",
  description:
    "Tax delinquent, long holding period, estate/trust parcels — motivated seller signals",
  paint: {
    "heatmap-weight": ["interpolate", ["linear"], ["get", "intensity"], 0, 0, 1, 1],
    "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, 1.1, 16, 2.8],
    "heatmap-color": [
      "interpolate",
      ["linear"],
      ["heatmap-density"],
      0,
      "rgba(255,255,255,0)",
      0.1,
      "rgba(254,235,200,0.3)",
      0.3,
      "rgba(251,191,36,0.5)",
      0.6,
      "rgba(245,124,0,0.72)",
      0.8,
      "rgba(220,38,38,0.84)",
      1,
      "rgba(153,27,27,0.92)",
    ],
    "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 18, 16, 38],
    "heatmap-opacity": 0.78,
  },
  buildSource(parcels) {
    return {
      type: "FeatureCollection",
      features: parcels.map((parcel) => {
        const owner = (parcel.owner ?? "").toUpperCase();
        let intensity = 0.2;
        if (!owner) {
          intensity = 0.5;
        } else if (
          owner.includes("BANK") ||
          owner.includes("FEDERAL")
        ) {
          intensity = 0.8;
        } else if (
          owner.includes("ESTATE") ||
          owner.includes("TRUST") ||
          owner.includes("SUCCESSION") ||
          owner.includes("LLC")
        ) {
          intensity = 0.7;
        }
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [parcel.lng, parcel.lat] },
          properties: { intensity },
        };
      }),
    };
  },
};

const INFRASTRUCTURE_MOMENTUM_PRESET: HeatmapPreset = {
  key: "infrastructure_momentum",
  label: "Infrastructure Momentum",
  description:
    "Proximity to new permits, high traffic counts, and active development — growth corridor detection",
  paint: {
    "heatmap-weight": ["interpolate", ["linear"], ["get", "intensity"], 0, 0, 1, 1],
    "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, 1.2, 16, 3],
    "heatmap-color": [
      "interpolate",
      ["linear"],
      ["heatmap-density"],
      0,
      "rgba(255,255,255,0)",
      0.1,
      "rgba(204,251,241,0.3)",
      0.3,
      "rgba(94,234,212,0.5)",
      0.6,
      "rgba(20,184,166,0.72)",
      0.8,
      "rgba(13,148,136,0.84)",
      1,
      "rgba(15,118,110,0.92)",
    ],
    "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 22, 16, 44],
    "heatmap-opacity": 0.8,
  },
  buildSource(parcels) {
    const advancedStatuses = new Set([
      "UNDER_CONTRACT",
      "CLOSING",
      "EXITED",
      "ENTITLED",
    ]);
    const earlyStatuses = new Set(["PRE_LOI", "TRIAGE", "TRIAGE_PENDING", "TRIAGE_DONE"]);

    return {
      type: "FeatureCollection",
      features: parcels.map((parcel) => {
        const status = parcel.dealStatus ?? "";
        const zoning = (parcel.currentZoning ?? "").toUpperCase();
        let intensity = 0.15;
        if (advancedStatuses.has(status)) {
          intensity = 0.9;
        } else if (earlyStatuses.has(status)) {
          intensity = 0.6;
        } else if (zoning.startsWith("C") || zoning.startsWith("I") || zoning.startsWith("M")) {
          intensity = 0.4;
        }
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [parcel.lng, parcel.lat] },
          properties: { intensity },
        };
      }),
    };
  },
};

export const HEATMAP_PRESETS: HeatmapPreset[] = [
  SALE_ACTIVITY_PRESET,
  PRICE_DENSITY_PRESET,
  DEVELOPMENT_ACTIVITY_PRESET,
  ZONING_UPSIDE_PRESET,
  DISTRESSED_OWNERSHIP_PRESET,
  INFRASTRUCTURE_MOMENTUM_PRESET,
];

export const HEATMAP_PRESET_MAP: Record<HeatmapPresetKey, HeatmapPreset> = {
  sale_activity: SALE_ACTIVITY_PRESET,
  price_density: PRICE_DENSITY_PRESET,
  development_activity: DEVELOPMENT_ACTIVITY_PRESET,
  zoning_upside: ZONING_UPSIDE_PRESET,
  distressed_ownership: DISTRESSED_OWNERSHIP_PRESET,
  infrastructure_momentum: INFRASTRUCTURE_MOMENTUM_PRESET,
};
