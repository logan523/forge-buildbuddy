// Content script: exposes BOM data for the Forge popup and background.
// Works on any Forge page path (homepage SPA and future /build/[id] routes).

(function () {
  function readBom() {
    if (Array.isArray(window.__forgeBOM) && window.__forgeBOM.length > 0) {
      return window.__forgeBOM;
    }
    return null;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== "GET_BOM") return;

    const live = readBom();
    if (live) {
      sendResponse({ parts: live });
      return;
    }

    try {
      chrome.storage.local.get("forge_bom", (data) => {
        sendResponse({ parts: data.forge_bom || [] });
      });
      return true; // async response
    } catch {
      sendResponse({ parts: [] });
    }
  });
})();
