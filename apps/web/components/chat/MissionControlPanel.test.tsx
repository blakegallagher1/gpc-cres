import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AgentTrustEnvelope } from '@/types';
import { MissionControlPanel, type MissionControlState } from './MissionControlPanel';

const BASE_STATE: MissionControlState = {
  activeAgentLabel: 'Coordinator',
  attachmentStatusLabel: 'No deal scope',
  conversationCount: 0,
  recentConversationLabel: 'No saved runs yet',
  threadStatusLabel: 'Draft thread',
  transportLabel: 'HTTP stream',
  agentSummary: null,
};

const TRUST_SUMMARY: AgentTrustEnvelope = {
  toolsInvoked: ['search_parcels', 'store_memory'],
  packVersionsUsed: [],
  evidenceCitations: [{ tool: 'search_parcels', url: 'https://example.test/source' }],
  confidence: 0.86,
  missingEvidence: ['Rent roll not attached'],
  verificationSteps: ['Confirm source recency'],
  proofChecks: ['Checked parcel source path'],
  toolFailures: [],
  lastAgentName: 'Research',
  errorSummary: null,
  durationMs: 1200,
};

describe('MissionControlPanel', () => {
  it('shows a pending mission-control state before a run starts', () => {
    render(<MissionControlPanel state={BASE_STATE} />);

    expect(screen.getByRole('region', { name: 'Mission control' })).toBeInTheDocument();
    expect(screen.getByText('Visible operator intelligence')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('No tools yet')).toBeInTheDocument();
    expect(screen.getByText('No memory writes yet')).toBeInTheDocument();
  });

  it('summarizes trust, tools, evidence, and memory after a run', () => {
    render(
      <MissionControlPanel
        state={{
          ...BASE_STATE,
          agentSummary: TRUST_SUMMARY,
          attachmentStatusLabel: 'Deal context attached',
          conversationCount: 4,
          recentConversationLabel: '2 saved runs',
        }}
      />,
    );

    expect(screen.getByText('86%')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2 tools invoked')).toBeInTheDocument();
    expect(screen.getByText('1 citations')).toBeInTheDocument();
    expect(screen.getByText('Memory touched')).toBeInTheDocument();
    expect(screen.getByText('Deal context attached')).toBeInTheDocument();
  });

  it('shows removable attached working context', () => {
    const onRemoveContextItem = vi.fn();

    render(
      <MissionControlPanel
        state={{
          ...BASE_STATE,
          attachmentStatusLabel: '1 context item attached',
          contextItems: [
            {
              id: 'deadline-risk',
              source: 'command-center',
              label: 'Deadline risk',
              detail: 'ALTA survey due tomorrow',
              href: '/command-center',
              createdAt: '2026-04-23T12:00:00.000Z',
            },
          ],
          onRemoveContextItem,
        }}
      />,
    );

    expect(screen.getByText('Attached working context')).toBeInTheDocument();
    expect(screen.getByText('Deadline risk')).toBeInTheDocument();
    expect(screen.getByText('command-center')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Deadline risk context' }));

    expect(onRemoveContextItem).toHaveBeenCalledWith('deadline-risk');
  });
});
