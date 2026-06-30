import { queryBoxesDomObserverStore } from "@/entrypoints/contexts/content-scripts/core-plugins/dom-observers/query-boxes/store";
import { threadDomObserverStore } from "@/entrypoints/contexts/content-scripts/core-plugins/dom-observers/thread/store";
import { spaRouterRouteChangeEvent } from "@/entrypoints/contexts/content-scripts/core-plugins/spa-router/listeners.loader";
import { AsyncLoaderRegistry } from "@/entrypoints/contexts/content-scripts/services/async-loaders";
import { DomSelectorsService } from "@/entrypoints/contexts/content-scripts/services/dom-selectors/service-init.loader";
import { isLexical } from "@/entrypoints/contexts/content-scripts/ui-groups/elements/query-box/utils";
import {
  messageQueueStore,
  type MessageQueueItem,
} from "@/plugins/message-queue/store";
import { getTextContent } from "@/utils/dom-utils/lexical-utils";
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

function getTextboxContent(textbox: HTMLElement): string {
  if (isLexical(textbox)) {
    return getTextContent({ element: textbox, omitDecorators: true });
  }
  return (textbox as HTMLTextAreaElement).value;
}

function clearTextbox(textbox: HTMLElement) {
  if ("__lexicalEditor" in textbox) {
    setLexicalEditorContent({ content: "", activeTextbox: textbox });
  } else {
    const nativeValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    nativeValueSetter?.call(textbox, "");
    textbox.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function fillTextbox(textbox: HTMLElement, content: string) {
  if (isLexical(textbox)) {
    // selectAll + insertText goes through Lexical's beforeinput pipeline,
    // which updates React state and enables the submit button.
    textbox.focus();
    document.execCommand("selectAll", false);
    document.execCommand("insertText", false, content);
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

  const handler = (e: KeyboardEvent) => {
    if (e.key !== "Enter") return;
    if (e.isComposing) return;
    if (e.shiftKey || isTypeaheadMenuPresent()) return;
    if (!threadDomObserverStore.getState().states.isInFlight) return;

    const content = getTextboxContent(textbox).trim();
    if (!content) return;

    e.stopPropagation();
    e.preventDefault();

    messageQueueStore.getState().addToQueue(content);
    clearTextbox(textbox);
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
      );

      async function processNextInQueue() {
        if (isProcessing) return;
        if (messageQueueStore.getState().queue.length === 0) return;
        isProcessing = true;
        try {
          await sleep(150);
          const followUp =
            queryBoxesDomObserverStore.getState().textbox.followUp;
          if (!followUp) return;
          const next = messageQueueStore.getState().shiftQueue();
          if (!next) return;
          const ok = await autoSubmit(followUp, next.message);
          if (!ok) {
            messageQueueStore
              .getState()
              .hydrateQueue([next, ...messageQueueStore.getState().queue]);
          }
        } finally {
          isProcessing = false;
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
      window.addEventListener(spaRouterRouteChangeEvent, () => {
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
