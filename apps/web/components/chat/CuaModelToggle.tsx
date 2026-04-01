'use client';

import { useState, useEffect } from 'react';
import { Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const CUA_MODEL_KEY = 'cua.preferredModel';

export type CuaModel = 'gpt-5.4' | 'gpt-5.4-mini';

export function useCuaModel(): [CuaModel, (model: CuaModel) => void] {
  const [model, setModelState] = useState<CuaModel>('gpt-5.4');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem(CUA_MODEL_KEY);
      if (stored === 'gpt-5.4' || stored === 'gpt-5.4-mini') {
        setModelState(stored);
      }
    }
  }, []);

  const setModel = (next: CuaModel) => {
    setModelState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CUA_MODEL_KEY, next);
    }
  };

  return [model, setModel];
}

interface CuaModelToggleProps {
  model: CuaModel;
  onModelChange: (model: CuaModel) => void;
  className?: string;
}

export function CuaModelToggle({ model, onModelChange, className }: CuaModelToggleProps) {
  const isMini = model === 'gpt-5.4-mini';

  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onModelChange(isMini ? 'gpt-5.4' : 'gpt-5.4-mini')}
            className={cn(
              'h-7 gap-1.5 rounded-full px-2.5 font-mono text-[10px] tracking-wide',
              isMini
                ? 'border-border/70 bg-background text-foreground hover:bg-muted'
                : 'border-border/70 bg-background text-foreground hover:bg-muted',
              className,
            )}
          >
            <Monitor className="h-3 w-3" />
            <span>{isMini ? 'GPT-5.4 mini' : 'GPT-5.4'}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">
            Browser run model: <strong>{model}</strong>
          </p>
          <p className="text-[10px] text-muted-foreground">
            {isMini ? 'Use for lighter browser tasks.' : 'Use for the highest-fidelity browser runs.'}
          </p>
          <p className="text-[10px] text-muted-foreground">Click to toggle</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
