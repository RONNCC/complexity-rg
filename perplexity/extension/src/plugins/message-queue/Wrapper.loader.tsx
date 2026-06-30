import { lazily } from "react-lazily";

import CsUiGuard from "@/entrypoints/contexts/content-scripts/services/ui-guard/CsUiGuard";
import { csUiMount } from "@/entrypoints/contexts/content-scripts/ui-groups/_root/CsUiRoot";

const { QueueDisplay } = lazily(
  () => import("@/plugins/message-queue/QueueDisplay"),
);

export default function () {
  csUiMount({
    id: "plugin:messageQueue:queueDisplay",
    component: (
      <CsUiGuard location={["thread"]} dependentPluginIds={["messageQueue"]}>
        <QueueDisplay />
      </CsUiGuard>
    ),
  });
}
