import { type ReactElement, type ReactNode, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  extractFinancialKpis,
  formatTableHeaders,
  parseStructuredAssistantPayload,
  renderableObjectArray,
  type FinancialKpi,
} from "@/lib/chat/structuredAssistantOutput";

type MarkdownNode = ReactNode;

const NUMBER_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

type StructuredMessageRendererProps = {
  content: string;
};

function formatMetricValue(label: string, value: number): string {
  const lower = label.toLowerCase();

  if (
    /(irr|roi|rate|yield|dscr|cap rate|multiple|delta)/.test(lower) &&
    Math.abs(value) <= 100
  ) {
    if (Math.abs(value) <= 1.5) {
      return `${(value * 100).toFixed(2)}%`;
    }

    return `${value.toFixed(2)}%`;
  }

  if (/(cost|noi|revenue|expense|rent|purchase|loan|equity|debt|value|price|net|cash)/.test(lower)) {
    return CURRENCY_FORMATTER.format(value);
  }

  return NUMBER_FORMATTER.format(value);
}

function formatTableValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return NUMBER_FORMATTER.format(value);
  if (typeof value === "string") return value;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function splitMarkdownTableLine(line: string): string[] {
  const cleaned = line.trim();
  const stripped = cleaned.startsWith("|") ? cleaned.slice(1) : cleaned;
  const unwrapped = stripped.endsWith("|") ? stripped.slice(0, -1) : stripped;
  return unwrapped.split("|").map((segment) => segment.trim());
}

function isMarkdownTableRow(line: string): boolean {
  return /^\s*\|/.test(line) && /\|\s*$/.test(line);
}

function isTableSeparatorLine(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}\s*(\|\s*:?-{3,}\s*)+\|?\s*$/.test(line);
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

function renderMarkdownTable(rows: string[]): ReactElement[] {
  const parsedRows = rows.map(splitMarkdownTableLine);
  const headers = parsedRows[0] ?? [];
  const bodyRows = parsedRows.slice(2).filter((row) => row.some(Boolean));

  return [
    <Card key="markdown-table" className="my-2 overflow-hidden border-border/60 bg-background/75">
      <Table className="min-w-full text-xs">
        <TableHeader className="bg-muted/35">
          <TableRow>
            {headers.map((header, i) => (
              <TableHead key={`${header}-${i}`} className="h-auto px-3 py-2 text-left font-medium normal-case tracking-normal">
                {stripInlineMarkdown(header)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {bodyRows.map((row, rowIndex) => (
            <TableRow key={`row-${rowIndex}`}>
              {headers.map((_, i) => (
                <TableCell key={`${rowIndex}-${i}`} className="px-3 py-2 text-xs">
                  {stripInlineMarkdown(row[i] ?? "")}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>,
  ];
}

function renderMarkdownText(content: string): MarkdownNode[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const nodes: MarkdownNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      nodes.push(<p key={`blank-${index}`} className="h-1.5" />);
      index += 1;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1]?.length ?? 1;
      const text = headingMatch[2] ?? "";
      const classes =
        level === 1
          ? "text-sm font-semibold"
          : level === 2
            ? "text-xs font-semibold"
            : "text-xs font-medium";
      const Heading = level <= 2 ? "h4" : "h6";
      nodes.push(
        <Heading key={`heading-${index}`} className={cn("text-foreground", classes)}>
          {stripInlineMarkdown(text)}
        </Heading>,
      );
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const fenceLang = trimmed.replace(/^```/, "");
      const fenceLines = [fenceLang];
      index += 1;
      while (index < lines.length) {
        const codeLine = lines[index] ?? "";
        if (codeLine.trim() === "```") {
          break;
        }
        fenceLines.push(codeLine);
        index += 1;
      }
      nodes.push(
        <ScrollArea
          key={`code-${index}`}
          className="my-2 max-h-64 rounded-lg border border-border/60 bg-muted/35"
        >
          <pre className="p-2 text-xs">{fenceLines.join("\n")}</pre>
        </ScrollArea>,
      );
      index = Math.min(index + 1, lines.length);
      continue;
    }

    if (isMarkdownTableRow(line) && isTableSeparatorLine(lines[index + 1] ?? "")) {
      const tableRows: string[] = [line];
      index += 2;
      while (index < lines.length && isMarkdownTableRow(lines[index] ?? "")) {
        tableRows.push(lines[index]!);
        index += 1;
      }
      nodes.push(...renderMarkdownTable(tableRows));
      continue;
    }

    const bulletMatch = trimmed.match(/^\s*[-*+]\s+(.*)$/);
    if (bulletMatch) {
      const items: string[] = [];
      while (index < lines.length) {
        const currentLine = lines[index]?.trim() ?? "";
        const match = currentLine.match(/^[-*+]\s+(.*)$/);
        if (!match) break;
        items.push(match[1] ?? "");
        index += 1;
      }
      nodes.push(
        <ul key={`ul-${index}`} className="ml-4 flex list-disc flex-col gap-1 text-sm leading-relaxed">
          {items.map((item, itemIndex) => (
            <li key={`${itemIndex}-${item}`}>{stripInlineMarkdown(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    const numListMatch = trimmed.match(/^\s*(\d+)\.\s+(.*)$/);
    if (numListMatch) {
      const items: string[] = [];
      while (index < lines.length) {
        const currentLine = lines[index]?.trim() ?? "";
        const match = currentLine.match(/^\d+\.\s+(.*)$/);
        if (!match) break;
        items.push(match[1] ?? "");
        index += 1;
      }
      nodes.push(
        <ol key={`ol-${index}`} className="ml-4 flex list-decimal flex-col gap-1 text-sm leading-relaxed">
          {items.map((item, itemIndex) => (
            <li key={`${itemIndex}-${item}`}>{stripInlineMarkdown(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    nodes.push(
      <p key={`p-${index}`} className="text-sm leading-relaxed text-foreground/90">
        {stripInlineMarkdown(trimmed)}
      </p>,
    );
    index += 1;
  }

  return nodes;
}

function renderObjectArrayTable(
  rows: Record<string, unknown>[],
  title: string,
): ReactElement | null {
  const headers = formatTableHeaders(rows[0]);
  if (!headers.length) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <p className="font-medium text-xs text-muted-foreground">{title}</p>
      <Card className="overflow-hidden border-border/60 bg-background/75">
        <Table className="min-w-full text-xs">
          <TableHeader className="bg-muted/35">
            <TableRow>
              {headers.map((header) => (
                <TableHead
                  key={header}
                  className="h-auto px-2 py-2 text-left font-medium normal-case tracking-normal"
                >
                  {header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={`${title}-${i}`}>
                {headers.map((header) => (
                  <TableCell key={`${title}-${i}-${header}`} className="px-2 py-2 text-xs">
                    {formatTableValue(row[header])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function FinancialKpiCards({ metrics }: { metrics: FinancialKpi[] }) {
  if (metrics.length === 0) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {metrics.map((metric) => (
        <div
          key={`${metric.label}-${metric.source}`}
          className="rounded-lg border border-border/50 bg-muted/30 p-2"
        >
          <p className="truncate text-[11px] font-medium text-muted-foreground">
            {metric.label}
          </p>
          <p className="mt-1 text-lg font-semibold text-foreground">
            {formatMetricValue(metric.label, metric.value)}
          </p>
          {metric.source ? (
            <p className="text-[10px] text-muted-foreground">from {metric.source}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="border-border/60 bg-background/80 text-xs">
      <CardContent className="flex flex-col gap-2 p-2.5">
        <h4 className="font-medium text-muted-foreground">{title}</h4>
        <Separator />
        {children}
      </CardContent>
    </Card>
  );
}

function CollapsibleSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="border-border/60 bg-background/75">
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="flex h-auto w-full items-center justify-between rounded-none px-2.5 py-2 text-xs text-muted-foreground"
          >
            <span className="font-medium">{title}</span>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Separator />
          <CardContent className="pt-2.5">{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export function StructuredMessageRenderer({ content }: StructuredMessageRendererProps) {
  const parsed = parseStructuredAssistantPayload(content);
  const [showRaw, setShowRaw] = useState(false);
  const safePayload = parsed?.payload as Record<string, unknown> | null;
  const taskUnderstanding = safePayload?.task_understanding as
    | Record<string, unknown>
    | undefined;
  const executionPlan = safePayload?.execution_plan as Record<string, unknown> | undefined;
  const synthesis = safePayload?.synthesis as Record<string, unknown> | undefined;
  const agentOutputs = renderableObjectArray(safePayload?.agent_outputs);
  const uncertaintyMap = renderableObjectArray(safePayload?.uncertainty_map);
  const keyAssumptions = Array.isArray(safePayload?.key_assumptions)
    ? safePayload.key_assumptions.filter((item): item is string => typeof item === "string")
    : [];
  const nextSteps = renderableObjectArray(safePayload?.next_steps);
  const sources = Array.isArray(safePayload?.sources)
    ? safePayload.sources.filter((item): item is string => typeof item === "string")
    : [];
  const metrics = useMemo(() => extractFinancialKpis(safePayload, 6), [safePayload]);

  if (!parsed || !safePayload) {
    return (
      <ScrollArea className="max-h-72 rounded-xl border border-border/60 bg-muted/20">
        <pre className="whitespace-pre-wrap break-words p-3 font-mono text-sm leading-relaxed">
          {content}
        </pre>
      </ScrollArea>
    );
  }

  const steps = Array.isArray(executionPlan?.steps)
    ? executionPlan.steps.filter((item): item is Record<string, unknown> => {
        return typeof item === "object" && item !== null && !Array.isArray(item);
      })
    : [];
  const planSummary = typeof executionPlan?.summary === "string" ? executionPlan.summary : "";

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">Structured assistant report</p>

      <FinancialKpiCards metrics={metrics} />

      <SectionCard title="Task Understanding">
        {taskUnderstanding ? (
          <div className="flex flex-col gap-2">
            {typeof taskUnderstanding.summary === "string" ? (
              <div>{renderMarkdownText(taskUnderstanding.summary)}</div>
            ) : (
              <p>No structured task summary was provided.</p>
            )}
            {Array.isArray(taskUnderstanding.focus_questions) ? (
              <div>
                <p className="font-medium text-muted-foreground">Focus questions</p>
                <ul className="ml-4 list-disc">
                  {taskUnderstanding.focus_questions
                    .filter((entry): entry is string => typeof entry === "string")
                    .map((question, questionIndex) => (
                      <li key={`${questionIndex}-${question}`} className="text-xs">
                        {question}
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <p>No task understanding section available.</p>
        )}
      </SectionCard>

      <CollapsibleSection title="Execution Plan">
        <div className="flex flex-col gap-2">
          {planSummary ? <p className="text-foreground/90">{planSummary}</p> : null}
          {steps.length > 0 ? (
            <ol className="flex list-inside list-decimal flex-col gap-2">
              {steps.map((step, index) => {
                const stepSummary = typeof step.summary === "string" ? step.summary : "";
                const responsibility =
                  typeof step.responsibility === "string" ? step.responsibility : "";
                const agent = typeof step.agent === "string" ? step.agent : "Planner";
                const rationale = typeof step.rationale === "string" ? step.rationale : "";
                const timeline = typeof step.timeline === "string" ? step.timeline : null;

                return (
                  <li key={`${agent}-${index}`} className="flex flex-col gap-1 text-xs">
                    <p className="font-medium">{`${index + 1}. ${agent}`}</p>
                    {stepSummary ? <p className="text-foreground/85">{stepSummary}</p> : null}
                    {responsibility ? (
                      <p className="text-muted-foreground">Responsibility: {responsibility}</p>
                    ) : null}
                    {rationale ? <p className="text-muted-foreground">Why: {rationale}</p> : null}
                    {timeline ? <p className="text-muted-foreground">Timeline: {timeline}</p> : null}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-muted-foreground">No execution steps were provided.</p>
          )}
        </div>
      </CollapsibleSection>

      {synthesis ? (
        <SectionCard title="Synthesis">
          {renderMarkdownText(
            typeof synthesis.recommendation === "string" ? synthesis.recommendation : "",
          )}
        </SectionCard>
      ) : null}

      {agentOutputs ? renderObjectArrayTable(agentOutputs, "Agent Outputs") : null}
      {uncertaintyMap ? renderObjectArrayTable(uncertaintyMap, "Uncertainty Map") : null}
      {nextSteps ? renderObjectArrayTable(nextSteps, "Next Steps") : null}

      {keyAssumptions.length > 0 ? (
        <SectionCard title="Key Assumptions">
          <ul className="ml-4 flex list-disc flex-col gap-1">
            {keyAssumptions.map((assumption, assumptionIndex) => (
              <li key={`${assumptionIndex}-${assumption}`}>{assumption}</li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      {sources.length > 0 ? (
        <SectionCard title="Sources">
          <ul className="ml-4 flex list-disc flex-col gap-1">
            {sources.map((source, sourceIndex) => (
              <li key={`${sourceIndex}-${source}`} className="break-all">
                {source}
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 justify-start px-1.5 text-xs text-muted-foreground"
        aria-expanded={showRaw}
        aria-controls="structured-message-raw"
        onClick={() => setShowRaw((prev) => !prev)}
      >
        {showRaw ? "Hide Raw" : "View Raw"}
      </Button>

      {showRaw ? (
        <ScrollArea
          id="structured-message-raw"
          className="max-h-64 rounded-lg border border-border/60 bg-muted/40"
        >
          <pre className="whitespace-pre-wrap p-2 text-xs">{parsed.raw}</pre>
        </ScrollArea>
      ) : null}
    </div>
  );
}
