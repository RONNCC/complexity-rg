import { subscribeWithSelector } from "zustand/middleware";
import { createWithEqualityFn } from "zustand/traditional";
import { mutative } from "zustand-mutative";

export type MessageQueueItem = {
  id: string;
  message: string;
};

type MessageQueueStoreType = {
  queue: MessageQueueItem[];
  addToQueue: (message: string) => void;
  removeFromQueue: (id: string) => void;
  updateMessage: (id: string, message: string) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  shiftQueue: () => MessageQueueItem | undefined;
  clearQueue: () => void;
  hydrateQueue: (items: MessageQueueItem[]) => void;
};

export const messageQueueStore = createWithEqualityFn<MessageQueueStoreType>()(
  subscribeWithSelector(
    mutative(
      (set, get): MessageQueueStoreType => ({
        queue: [],
        addToQueue: (message) => {
          set({
            queue: [...get().queue, { id: crypto.randomUUID(), message }],
          });
        },
        removeFromQueue: (id) => {
          set({ queue: get().queue.filter((item) => item.id !== id) });
        },
        updateMessage: (id, message) => {
          set({
            queue: get().queue.map((item) =>
              item.id === id ? { ...item, message } : item,
            ),
          });
        },
        reorderQueue: (fromIndex, toIndex) => {
          const { queue } = get();
          if (
            fromIndex === toIndex ||
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= queue.length ||
            toIndex >= queue.length
          ) {
            return;
          }
          const next = [...queue];
          const [moved] = next.splice(fromIndex, 1);
          if (!moved) return;
          next.splice(toIndex, 0, moved);
          set({ queue: next });
        },
        shiftQueue: () => {
          const { queue } = get();
          if (queue.length === 0) return undefined;
          const [first, ...rest] = queue;
          set({ queue: rest });
          return first;
        },
        clearQueue: () => {
          set({ queue: [] });
        },
        hydrateQueue: (items) => {
          set({ queue: items });
        },
      }),
    ),
  ),
);

export const useMessageQueueStore = messageQueueStore;
