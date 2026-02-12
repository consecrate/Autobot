import { addNote, addTextNote, canAddNotes, deleteNotes, findNotes, getDeckNames, storeMediaFile } from '@/utils/anki';
import type { AutobotMessage } from '@/utils/messages';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: AutobotMessage, _sender, sendResponse) => {
    if (msg.action === 'canAddNotes') {
      canAddNotes(msg.notes)
        .then(sendResponse)
        .catch((err) => sendResponse({ error: err.message }));
      return true;
    }
    if (msg.action === 'getDeckNames') {
      console.log('[Autobot BG] Fetching deck names...');
      getDeckNames()
        .then((decks) => {
          console.log('[Autobot BG] Success:', decks);
          sendResponse(decks);
        })
        .catch((err) => {
          console.error('[Autobot BG] Error:', err);
          sendResponse({ error: err.message });
        });
      return true;
    }
    if (msg.action === 'addNote') {
      addNote(msg.deckName, msg.frontImg, msg.backImg, msg.tags)
        .then(sendResponse)
        .catch((err) => sendResponse({ error: err.message }));
      return true;
    }
    if (msg.action === 'addTextNote') {
      addTextNote(msg.deckName, msg.front, msg.back, msg.tags)
        .then(sendResponse)
        .catch((err) => sendResponse({ error: err.message }));
      return true;
    }
    if (msg.action === 'findNotes') {
      findNotes(msg.query)
        .then(sendResponse)
        .catch((err) => sendResponse({ error: err.message }));
      return true;
    }
    if (msg.action === 'deleteNotes') {
      deleteNotes(msg.notes)
        .then(sendResponse)
        .catch((err) => sendResponse({ error: err.message }));
      return true;
    }
    if (msg.action === 'storeMediaFile') {
      storeMediaFile(msg.filename, msg.data)
        .then(sendResponse)
        .catch((err) => sendResponse({ error: err.message }));
      return true;
    }
  });
});
