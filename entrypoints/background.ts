import { addNote, getDeckNames } from '@/utils/anki';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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
  });
});
