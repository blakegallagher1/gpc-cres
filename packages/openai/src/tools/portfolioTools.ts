import { tool } from "@openai/agents";
import { z } from "zod";

export const analyze_portfolio = tool({
  name: "analyze_portfolio",
  description:
    "Analyze the portfolio across multiple dimensions: summary metrics, concentration risk, capital allocation optimization, 1031 exchange matching, or stress testing. Use this when the user asks about portfolio-level performance, risk exposure, or investment strategy.",
  parameters: z.object({
    analysis_type: z
      .enum([
        "summary",
        "concentration",
        "capital_allocation",
        "1031_matches",
        "stress_test",
      ])
      .describe(
        "Type of analysis: summary (AUM, IRR, cap rates), concentration (geographic/SKU/risk distributions), capital_allocation (optimal equity deployment), 1031_matches (exchange candidates for a disposition), stress_test (scenario impact across portfolio)"
      ),
    available_equity: z
      .number()
      .nullable()
      .describe(
        "For capital_allocation: total equity available to deploy. Ignored for other types."
      ),
    max_deals: z
      .number()
      .nullable()
      .describe(
        "For capital_allocation: maximum number of deals to allocate to. Ignored for other types."
      ),
    disposition_deal_id: z
      .string()
      .nullable()
      .describe(
        "For 1031_matches: the deal ID being sold/exchanged. Ignored for other types."
      ),
    stress_scenario: z
      .object({
        name: z.string().describe("Scenario name (e.g. 'Rate Shock', 'Recession')"),
        rate_shock_bps: z
          .number()
          .nullable()
          .describe("Interest rate increase in basis points (e.g. 200 = +2%)"),
        vacancy_spike_pct: z
          .number()
          .nullable()
          .describe("Vacancy increase in percentage points (e.g. 10 = +10%)"),
        rent_decline_pct: z
          .number()
          .nullable()
          .describe("Rent decline as percentage (e.g. 15 = -15%)"),
        cap_rate_expansion_bps: z
          .number()
          .nullable()
          .describe("Exit cap rate expansion in basis points (e.g. 100 = +1%)"),
      })
      .nullable()
      .describe("For stress_test: scenario parameters. Ignored for other types."),
  }),
  execute: async (params) => {
    // This tool's execute function runs server-side via the agent chat API.
    // It calls the portfolio analytics service internally.
    // The actual implementation is wired in the chat route where the tool
    // results are resolved. For now, return params for the handler to process.
    return JSON.stringify({
      _portfolioAnalysis: true,
      ...params,
    });
  },
});
