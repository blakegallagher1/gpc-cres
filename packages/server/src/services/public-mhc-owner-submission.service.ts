import { prisma } from "@entitlement-os/db";

export type PublicMhcOwnerSubmissionInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company?: string | null;
  locationAddress1: string;
  locationAddress2?: string | null;
  locationCity: string;
  locationState: string;
  locationPostalCode: string;
  notes?: string | null;
  source?: string | null;
  website?: string | null;
};

export type PublicMhcOwnerSubmissionRequestMeta = {
  clientIp: string;
  userAgent: string | null;
  referrer: string | null;
};

function normalizeText(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function createPublicMhcOwnerSubmission(
  submission: PublicMhcOwnerSubmissionInput,
  requestMeta: PublicMhcOwnerSubmissionRequestMeta,
): Promise<{ id: string; createdAt: Date }> {
  const result = await prisma.$queryRaw<Array<{ id: string; created_at: Date }>>`
    INSERT INTO public_mhc_owner_submissions (
      first_name,
      last_name,
      email,
      phone,
      company,
      location_address_1,
      location_address_2,
      location_city,
      location_state,
      location_postal_code,
      notes,
      source,
      honeypot_value,
      ip_address,
      user_agent,
      referrer
    ) VALUES (
      ${submission.firstName.trim()},
      ${submission.lastName.trim()},
      ${submission.email.trim().toLowerCase()},
      ${submission.phone.trim()},
      ${normalizeText(submission.company)},
      ${submission.locationAddress1.trim()},
      ${normalizeText(submission.locationAddress2)},
      ${submission.locationCity.trim()},
      ${submission.locationState.trim()},
      ${submission.locationPostalCode.trim()},
      ${normalizeText(submission.notes)},
      ${normalizeText(submission.source)},
      ${normalizeText(submission.website)},
      ${requestMeta.clientIp},
      ${normalizeText(requestMeta.userAgent)},
      ${normalizeText(requestMeta.referrer)}
    )
    RETURNING id, created_at
  `;

  const [created] = result;
  if (!created) {
    throw new Error("Submission persistence returned no row");
  }

  return {
    id: created.id,
    createdAt: created.created_at,
  };
}
