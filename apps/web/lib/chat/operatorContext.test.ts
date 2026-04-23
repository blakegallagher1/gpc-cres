import { describe, expect, it } from 'vitest';
import {
  buildOperatorContextPrompt,
  createOperatorContextEnvelope,
  normalizeOperatorContextEnvelope,
  removeOperatorContextItem,
} from './operatorContext';

describe('operatorContext', () => {
  it('normalizes valid context and drops invalid items', () => {
    const normalized = normalizeOperatorContextEnvelope({
      version: 1,
      createdAt: '2026-04-23T16:00:00.000Z',
      sourceSurface: 'command-center',
      prompt: 'Investigate this deadline.',
      items: [
        {
          id: 'deadline-1',
          source: 'command-center',
          label: 'Deadline risk',
          detail: 'Due tomorrow',
          href: '/deals/deal-1',
        },
        {
          id: '',
          source: 'deal',
          label: 'Invalid',
        },
      ],
    });

    expect(normalized).toEqual({
      version: 1,
      createdAt: '2026-04-23T16:00:00.000Z',
      sourceSurface: 'command-center',
      prompt: 'Investigate this deadline.',
      items: [
        {
          id: 'deadline-1',
          source: 'command-center',
          label: 'Deadline risk',
          detail: 'Due tomorrow',
          href: '/deals/deal-1',
          payload: undefined,
        },
      ],
    });
  });

  it('builds a compact agent context prefix', () => {
    const envelope = createOperatorContextEnvelope({
      sourceSurface: 'map',
      items: [
        {
          id: 'parcel-1',
          source: 'map',
          label: '2774 Highland Rd',
          detail: 'Selected parcel',
        },
      ],
    });

    expect(buildOperatorContextPrompt(envelope)).toContain('[Operator Context]');
    expect(buildOperatorContextPrompt(envelope)).toContain('map: 2774 Highland Rd');
    expect(buildOperatorContextPrompt(envelope)).toContain('detail=Selected parcel');
  });

  it('removes context items and clears the envelope when empty', () => {
    const envelope = createOperatorContextEnvelope({
      sourceSurface: 'run',
      items: [
        { id: 'run-1', source: 'run', label: 'Prior run' },
      ],
    });

    expect(removeOperatorContextItem(envelope, 'run-1')).toBeNull();
  });
});
