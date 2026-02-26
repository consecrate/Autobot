import {
  addTextNote,
  deleteNotes,
  findNotes,
  getDeckNames,
  notesInfo,
  storeMediaFile,
} from "@/utils/anki";
import type { AutobotMessage, ExtractStructureMessage } from "@/utils/messages";

export default defineBackground(() => {
  type BackgroundMessage = AutobotMessage | ExtractStructureMessage;

  const handlers = {
    getDeckNames: async () => {
      console.log("[Autobot BG] Fetching deck names...");
      const decks = await getDeckNames();
      console.log("[Autobot BG] Success:", decks);
      return decks;
    },
    addTextNote: async (
      msg: Extract<AutobotMessage, { action: "addTextNote" }>,
    ) => addTextNote(msg.deckName, msg.front, msg.back, msg.tags),
    findNotes: async (msg: Extract<AutobotMessage, { action: "findNotes" }>) =>
      findNotes(msg.query),
    notesInfo: async (msg: Extract<AutobotMessage, { action: "notesInfo" }>) =>
      notesInfo(msg.notes),
    deleteNotes: async (
      msg: Extract<AutobotMessage, { action: "deleteNotes" }>,
    ) => deleteNotes(msg.notes),
    storeMediaFile: async (
      msg: Extract<AutobotMessage, { action: "storeMediaFile" }>,
    ) => storeMediaFile(msg.filename, msg.data),
  };

  browser.runtime.onMessage.addListener(
    (msg: BackgroundMessage, _sender, sendResponse) => {
      if (msg.action === "extractStructure") {
        browser.tabs
          .query({ active: true, currentWindow: true })
          .then((tabs) => {
            const activeTab = tabs[0];
            if (!activeTab?.id) {
              sendResponse({ error: "No active tab found." });
              return;
            }

            browser.tabs
              .sendMessage(activeTab.id, msg)
              .then(sendResponse)
              .catch((err) =>
                sendResponse({
                  error:
                    err?.message ||
                    "Failed to extract page structure from active tab.",
                }),
              );
          })
          .catch((err) =>
            sendResponse({
              error: err?.message || "Failed to query active tab.",
            }),
          );
        return true;
      }

      const handler = handlers[msg.action as keyof typeof handlers];
      if (!handler) {
        return false;
      }

      Promise.resolve(handler(msg as never))
        .then(sendResponse)
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          sendResponse({ error: message });
        });
      return true;
    },
  );
});
