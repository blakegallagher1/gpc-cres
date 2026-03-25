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
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300'
                : 'border-indigo-500/40 bg-indigo-500/10 text-indigo-700 hover:bg-indigo-500/20 dark:text-indigo-300',
              className,
            )}
          >
            <Monitor className="h-3 w-3" />
            <span>{isMini ? '5.4-mini' : '5.4'}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">
            CUA Browser Model: <strong>{model}</strong>
          </p>
          <p className="text-[10px] text-muted-foreground">
            {isMini ? '~$0.05/task · Budget mode' : '~$0.30/task · 95% accuracy'}
          </p>
          <p className="text-[10px] text-muted-foreground">Click to toggle</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
