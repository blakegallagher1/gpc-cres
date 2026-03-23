import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/stores/agentStore", () => ({
  useAgentStore: () => ({
    runAgent: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock("@/components/layout/DashboardShell", () => ({
  DashboardShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/layout/WorkspaceHeader", () => ({
  WorkspaceHeader: ({
    title,
    description,
    stats,
  }: {
    title: string;
    description: string;
    stats: Array<{ label: string; value: string; detail: string }>;
  }) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
      {stats.map((stat) => (
        <div key={stat.label}>
          <span>{stat.label}</span>
          <span>{stat.value}</span>
          <span>{stat.detail}</span>
        </div>
      ))}
    </div>
  ),
  WorkspaceToolbar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import AgentsPage from "./page";

describe("AgentsPage", () => {
  it("surfaces the configured tool catalog in the roster", () => {
    const { container } = render(<AgentsPage />);

    expect(screen.getByText("Tool surface")).toBeInTheDocument();
    expect(screen.getByText("79")).toBeInTheDocument();
    expect(screen.getAllByText(/catalog tools/)[0]).toBeInTheDocument();
    expect(screen.getAllByText("search_knowledge_base")[0]).toBeInTheDocument();
    expect(container.firstChild).toMatchSnapshot();
  });
});
