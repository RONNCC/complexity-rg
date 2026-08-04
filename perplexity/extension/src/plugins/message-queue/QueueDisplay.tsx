import { Portal } from "@/components/ui/portal";
import { queryBoxesDomObserverStore } from "@/entrypoints/contexts/content-scripts/core-plugins/dom-observers/query-boxes/store";
import { useThreadDomObserverStore } from "@/entrypoints/contexts/content-scripts/core-plugins/dom-observers/thread/store";
import {
  messageQueueStore,
  useMessageQueueStore,
} from "@/plugins/message-queue/store";
import {
  clearTextbox,
  getTextboxContent,
} from "@/plugins/message-queue/textbox";
import useQueueDisplayPortalContainer from "@/plugins/message-queue/useQueueDisplayPortalContainer";

import TablerPlus from "~icons/tabler/plus";

export function QueueDisplay() {
  const queue = useMessageQueueStore((s) => s.queue);
  const container = useQueueDisplayPortalContainer();

  const isInFlight = useThreadDomObserverStore((s) => s.states.isInFlight);

  // The clear is deferred (see clearTextbox), so a rapid double-click before
  // it runs would otherwise re-read the still-uncleared textbox and queue a
  // duplicate.
  const clearPendingRef = useRef(false);

  if (!container) return null;
  if (!isInFlight && queue.length === 0) return null;

  return (
    <Portal container={container}>
      <div className="x:flex x:flex-col x:gap-1 x:px-3 x:pt-2 x:pb-1">
        {queue.map((item, index) => (
          <div
            key={item.id}
            className="x:flex x:items-start x:gap-2 x:rounded-md x:bg-[var(--color-super-duper-bgColor-secondary)] x:px-2 x:py-1 x:text-sm x:text-[var(--color-super-duper-fgColor-muted)]"
          >
            <span className="x:shrink-0 x:opacity-50 x:select-none">
              {index + 1}.
            </span>
            <span className="x:line-clamp-2 x:min-w-0 x:flex-1 x:break-words">
              {item.message}
            </span>
            <button
              aria-label="Remove from queue"
              className="hover:x:opacity-100 x:shrink-0 x:cursor-pointer x:rounded x:p-0.5 x:opacity-50 x:transition-opacity"
              onClick={() =>
                messageQueueStore.getState().removeFromQueue(item.id)
              }
            >
              ×
            </button>
          </div>
        ))}
        {isInFlight && (
          <div className="x:flex x:items-center x:gap-1.5 x:px-2 x:pb-1">
            <button
              title="Add to queue"
              className="x:flex x:cursor-pointer x:items-center x:gap-1 x:rounded-md x:px-2 x:py-0.5 x:text-xs x:text-muted-foreground x:transition-all x:duration-150 x:outline-none x:hover:bg-foreground-subtle x:hover:text-foreground x:focus-visible:bg-foreground-subtle x:focus-visible:outline-none x:active:scale-95"
              onClick={() => {
                if (clearPendingRef.current) return;
                const followUp =
                  queryBoxesDomObserverStore.getState().textbox.followUp;
                if (!followUp) return;
                const content = getTextboxContent(followUp).trim();
                if (!content) return;
                messageQueueStore.getState().addToQueue(content);
                clearPendingRef.current = true;
                clearTextbox(followUp, () => {
                  clearPendingRef.current = false;
                });
              }}
            >
              <TablerPlus className="x:size-3" />
              <span>Add to queue</span>
            </button>
          </div>
        )}
      </div>
    </Portal>
  );
}
