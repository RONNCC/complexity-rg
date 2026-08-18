import { useQueryBoxesDomObserverStore } from "@/entrypoints/contexts/content-scripts/core-plugins/dom-observers/query-boxes/store";

const CONTAINER_ATTR = "data-cplx-message-queue-container";

export default function useQueueDisplayPortalContainer() {
  const followUpWrapper = useQueryBoxesDomObserverStore(
    (store) => store.wrapper.followUp,
  );
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      if (!followUpWrapper) {
        $(`[${CONTAINER_ATTR}]`).remove();
        return;
      }

      const $existing = $(`[${CONTAINER_ATTR}]`);
      if ($existing[0] && document.contains($existing[0])) {
        setContainer($existing[0]);
        return;
      }
      $existing.remove();

      const $container = $("<div>").attr(CONTAINER_ATTR, "true");
      $(followUpWrapper).before($container);
      setContainer($container[0] ?? null);
    });

    return () => {
      $(`[${CONTAINER_ATTR}]`).remove();
      setContainer(null);
    };
  }, [followUpWrapper]);

  return container;
}
