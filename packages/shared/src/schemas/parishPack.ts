import { z } from "zod";

import { SKU_TYPES, WORKFLOW_PATH_TYPES } from "../enums.js";

const Url = z.string().url();

export const ParishPackSchemaVersion = z.literal("1.0");

export const ParishPackJurisdictionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  kind: z.enum(["parish", "city"]),
  state: z.string().min(1),
  timezone: z.string().min(1),
});

export const ParishPackPathOptionSchema = z.object({
  path_type: z.enum(WORKFLOW_PATH_TYPES),
  applicability: z.string().min(1),
  steps_summary: z.string().min(1),
  pros: z.array(z.string().min(1)).min(1),
  cons: z.array(z.string().min(1)).min(1),
  sources: z.array(Url).min(1),
});

export const ParishPackMeetingCadenceSchema = z.object({
  body: z.string().min(1),
  cadence: z.string().min(1),
  submission_deadlines: z.string().min(1),
  meeting_time: z.string().min(1),
  location: z.string().min(1),
  agenda_posting: z.string().min(1),
  sources: z.array(Url).min(1),
});

export const ParishPackRequiredDocSchema = z.object({
  name: z.string().min(1),
  details: z.string().min(1),
  sources: z.array(Url).min(1),
});

export const ParishPackApplicationRequirementsSchema = z.object({
  path_type: z.enum(WORKFLOW_PATH_TYPES),
  required_docs: z.array(ParishPackRequiredDocSchema).min(1),
  submission_method: z.string().min(1),
  sources: z.array(Url).min(1),
});

export const ParishPackFeeSchema = z.object({
  fee_name: z.string().min(1),
  amount_text: z.string().min(1),
  notes: z.string().min(1),
  sources: z.array(Url).min(1),
});

export const ParishPackNoticeRuleSchema = z.object({
  rule_name: z.string().min(1),
  rule_text: z.string().min(1),
  sources: z.array(Url).min(1),
});

export const ParishPackOfficialLinkSchema = z.object({
  label: z.string().min(1),
  url: Url,
  kind: z.string().min(1),
});

export const ParishPackSchema = z.object({
  schema_version: ParishPackSchemaVersion,
  generated_at: z.string().datetime(),
  jurisdiction: ParishPackJurisdictionSchema,
  sku: z.enum(SKU_TYPES),
  paths: z.object({
    recommended_path: z.enum(WORKFLOW_PATH_TYPES),
    options: z.array(ParishPackPathOptionSchema).min(1),
  }),
  meeting_cadence: z.array(ParishPackMeetingCadenceSchema).min(1),
  application_requirements: z.array(ParishPackApplicationRequirementsSchema).min(1),
  fees: z.array(ParishPackFeeSchema).min(1),
  notice_rules: z.array(ParishPackNoticeRuleSchema).min(1),
  official_links: z.array(ParishPackOfficialLinkSchema).min(1),
  sources_summary: z.array(Url).min(1),
  warnings: z.array(z.string()),
});

export type ParishPack = z.infer<typeof ParishPackSchema>;

