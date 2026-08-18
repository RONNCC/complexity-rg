import { queryBoxesDomObserverStore } from "@/entrypoints/contexts/content-scripts/core-plugins/dom-observers/query-boxes/store";
import { threadDomObserverStore } from "@/entrypoints/contexts/content-scripts/core-plugins/dom-observers/thread/store";
import { spaRouteChangeCompleteSubscribe } from "@/entrypoints/contexts/content-scripts/core-plugins/spa-router/utils";
import { AsyncLoaderRegistry } from "@/entrypoints/contexts/content-scripts/services/async-loaders";
import { DomSelectorsService } from "@/entrypoints/contexts/content-scripts/services/dom-selectors/service-init.loader";
import { isLexical } from "@/entrypoints/contexts/content-scripts/ui-groups/elements/query-box/utils";
import {
  messageQueueStore,
  type MessageQueueItem,
} from "@/plugins/message-queue/store";
import {
  clearTextbox,
  getTextboxContent,
} from "@/plugins/message-queue/textbox";
import { setLexicalEditorContent } from "@/utils/wrappers/lexical";

const STORAGE_PREFIX = "cplx-mq:";

function storageKey(path: string) {
  return `${STORAGE_PREFIX}${path}`;
}

function loadFromStorage(path: string): MessageQueueItem[] {
  const [raw] = tryCatch(() => sessionStorage.getItem(storageKey(path)));
  if (!raw) return [];
  const [parsed] = tryCatch(() => JSON.parse(raw) as MessageQueueItem[]);
  return Array.isArray(parsed) ? parsed : [];
}

function saveToStorage(path: string, queue: MessageQueueItem[]) {
  if (queue.length === 0) {
    sessionStorage.removeItem(storageKey(path));
  } else {
    tryCatch(() =>
      sessionStorage.setItem(storageKey(path), JSON.stringify(queue)),
    );
  }
}

const INTERCEPT_ATTR = "data-message-queue-intercept";

function isTypeaheadMenuPresent() {
  return (
    $(DomSelectorsService.Root.cachedSync.QUERY_BOX.TYPEAHEAD_MENU).length > 0
  );
}

function fillTextbox(textbox: HTMLElement, content: string) {
  if (isLexical(textbox)) {
    // execCommand("insertText") only mutates the DOM; it doesn't reliably
    // sync Lexical's own model, so the app's "is submit enabled" state
    // (derived from the Lexical editor, not raw DOM text) can stay stuck
    // disabled even once the text visually matches. setLexicalEditorContent
    // writes through the editor's own API instead, same as clearTextbox.
    setLexicalEditorContent({ content, activeTextbox: textbox });
    textbox.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    const nativeValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    nativeValueSetter?.call(textbox, content);
    textbox.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

async function autoSubmit(
  textbox: HTMLElement,
  message: string,
): Promise<boolean> {
  const trimmed = message.trim();
  fillTextbox(textbox, message);
  for (let i = 0; i < 20; i++) {
    await sleep(50);
    if (getTextboxContent(textbox).trim() !== trimmed) {
      fillTextbox(textbox, message);
      continue;
    }
    const btn = document.querySelector<HTMLElement>(
      'button[aria-label="Submit"]:not([disabled])',
    );
    if (btn) {
      btn.click();
      return true;
    }
  }
  return false;
}

function interceptFollowUpTextbox(textbox: HTMLElement) {
  const $textbox = $(textbox);
  if ($textbox.attr(INTERCEPT_ATTR)) return;
  $textbox.attr(INTERCEPT_ATTR, "true");

  // The clear is deferred (see clearTextbox), so a rapid second Enter fired
  // before it runs would otherwise re-read the still-uncleared textbox and
  // queue a duplicate.
  let clearPending = false;

  const handler = (e: KeyboardEvent) => {
    if (e.key !== "Enter") return;
    if (e.isComposing) return;
    if (e.shiftKey || isTypeaheadMenuPresent()) return;
    if (!threadDomObserverStore.getState().states.isInFlight) return;
    if (clearPending) return;

    const content = getTextboxContent(textbox).trim();
    if (!content) return;

    e.stopPropagation();
    e.preventDefault();

    messageQueueStore.getState().addToQueue(content);
    clearPending = true;
    clearTextbox(textbox, () => {
      clearPending = false;
    });
  };

  textbox.addEventListener("keydown", handler, true);
}

declare module "@/entrypoints/contexts/content-scripts/services/async-loaders" {
  interface AsyncLoadersRegistry {
    "plugin:messageQueue": void;
  }
}

export default function () {
  AsyncLoaderRegistry.register({
    id: "plugin:messageQueue",
    dependencies: [
      "cache:pluginsEnableStates",
      "cache:domSelectors",
      "corePlugin:domObservers:thread:messageBlocks",
    ],
    loader: ({ "cache:pluginsEnableStates": pluginsEnableStates }) => {
      if (!pluginsEnableStates["messageQueue"]) return;

      let isProcessing = false;
      let sessionToken = {};

      // Hydrate queue from sessionStorage for the current thread on load.
      messageQueueStore
        .getState()
        .hydrateQueue(loadFromStorage(window.location.pathname));
      if (
        messageQueueStore.getState().queue.length > 0 &&
        !threadDomObserverStore.getState().states.isInFlight
      ) {
        void processNextInQueue();
      }

      // Sync every queue change back to sessionStorage.
      messageQueueStore.subscribe(
        (store) => store.queue,
        (queue) => saveToStorage(window.location.pathname, queue),
      );
      queryBoxesDomObserverStore.subscribe(
        (store) => store.textbox.followUp,
        (followUp) => {
          if (followUp) interceptFollowUpTextbox(followUp);
        },
        // The follow-up box may already be populated by the time this loader
        // runs (no ordering dependency guarantees otherwise), and a plain
        // subscribe() only fires on future changes — without this, Enter-to-
        // queue would silently never attach until the node gets replaced.
        { fireImmediately: true },
      );

      async function processNextInQueue() {
        if (isProcessing) return;
        if (messageQueueStore.getState().queue.length === 0) return;
        isProcessing = true;
        const token = sessionToken;
        try {
          await sleep(150);
          if (token !== sessionToken) return;
          const followUp =
            queryBoxesDomObserverStore.getState().textbox.followUp;
          if (!followUp) return;
          const next = messageQueueStore.getState().shiftQueue();
          if (!next) return;
          const ok = await autoSubmit(followUp, next.message);
          if (!ok && token === sessionToken) {
            messageQueueStore
              .getState()
              .hydrateQueue([next, ...messageQueueStore.getState().queue]);
            // Nothing else re-triggers processing on its own after a failed
            // submit (the next trigger is normally an isInFlight toggle or a
            // nav), so the message would otherwise sit queued forever.
            setTimeout(() => {
              if (token === sessionToken) void processNextInQueue();
            }, 1000);
          }
        } finally {
          // A stale call aborted by a SPA nav (token !== sessionToken) must
          // not clear the flag out from under a fresh call for the new
          // thread that may already be running.
          if (token === sessionToken) {
            isProcessing = false;
          }
        }
      }

      threadDomObserverStore.subscribe(
        (store) => store.states.isInFlight,
        (isInFlight, prevIsInFlight) => {
          if (prevIsInFlight && !isInFlight) {
            void processNextInQueue();
          }
        },
      );

      // On SPA navigation to a different thread, swap the queue to match.
      // Only react once the nav has actually settled ("complete") — reacting
      // to "pending" too meant this fired twice per nav, with the DOM
      // possibly not reflecting the new thread yet on the first firing.
      spaRouteChangeCompleteSubscribe(() => {
        sessionToken = {};
        isProcessing = false;
        messageQueueStore
          .getState()
          .hydrateQueue(loadFromStorage(window.location.pathname));
        if (
          messageQueueStore.getState().queue.length > 0 &&
          !threadDomObserverStore.getState().states.isInFlight
        ) {
          void processNextInQueue();
        }
      });
    },
  });
}
