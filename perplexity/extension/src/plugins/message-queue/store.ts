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
