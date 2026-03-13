import "server-only";

type GoogleAddressValidationGranularity =
  | "PREMISE"
  | "SUB_PREMISE"
  | "ROUTE"
  | "OTHER";

type AddressValidationResponse = {
  result?: {
    address?: {
      formattedAddress?: string;
    };
    geocode?: {
      location?: {
        latitude?: number;
        longitude?: number;
      };
    };
    verdict?: {
      validationGranularity?: string;
    };
    uspsData?: {
      standardizedAddress?: {
        firstAddressLine?: string;
        cityStateZipAddressLine?: string;
      };
      dpvConfirmation?: string;
    };
  };
};

export type ValidatedAddress = {
  formattedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  validationGranularity: GoogleAddressValidationGranularity | string | null;
  isValid: boolean;
  uspsData: {
    standardizedAddress?: string;
    dpvConfirmation?: string;
  } | null;
};

const GOOGLE_ADDRESS_VALIDATION_URL =
  "https://addressvalidation.googleapis.com/v1:validateAddress";
const GOOGLE_ADDRESS_VALIDATION_TIMEOUT_MS = 3_000;
const VALID_GRANULARITIES = new Set(["PREMISE", "SUB_PREMISE"]);

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function validateAddress(
  address: string,
  apiKey: string,
): Promise<ValidatedAddress | null> {
  const normalizedAddress = address.trim();
  const normalizedApiKey = apiKey.trim();

  if (!normalizedAddress || !normalizedApiKey) {
    return null;
  }

  try {
    const response = await fetch(GOOGLE_ADDRESS_VALIDATION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": normalizedApiKey,
      },
      body: JSON.stringify({
        address: {
          addressLines: [normalizedAddress],
          regionCode: "US",
        },
        enableUspsCass: true,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(GOOGLE_ADDRESS_VALIDATION_TIMEOUT_MS),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as AddressValidationResponse;
    const formattedAddress =
      asTrimmedString(payload.result?.address?.formattedAddress);
    const latitude = asFiniteNumber(payload.result?.geocode?.location?.latitude);
    const longitude = asFiniteNumber(
      payload.result?.geocode?.location?.longitude,
    );
    const validationGranularity = asTrimmedString(
      payload.result?.verdict?.validationGranularity,
    );
    const firstLine = asTrimmedString(
      payload.result?.uspsData?.standardizedAddress?.firstAddressLine,
    );
    const cityStateZip = asTrimmedString(
      payload.result?.uspsData?.standardizedAddress?.cityStateZipAddressLine,
    );
    const standardizedAddress = [firstLine, cityStateZip]
      .filter((value): value is string => Boolean(value))
      .join(", ");
    const dpvConfirmation = asTrimmedString(
      payload.result?.uspsData?.dpvConfirmation,
    );

    return {
      formattedAddress,
      latitude,
      longitude,
      validationGranularity,
      isValid: validationGranularity
        ? VALID_GRANULARITIES.has(validationGranularity)
        : false,
      uspsData:
        standardizedAddress || dpvConfirmation
          ? {
              ...(standardizedAddress
                ? { standardizedAddress }
                : {}),
              ...(dpvConfirmation ? { dpvConfirmation } : {}),
            }
          : null,
    };
  } catch {
    return null;
  }
}
