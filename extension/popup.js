// Popup script: sends "BUY_ALL" messages to the background service worker.
// First requests the BOM from the active tab's content script.

const status = document.getElementById("status");

function setStatus(text) {
  status.textContent = text;
  setTimeout(() => { if (status.textContent === text) status.textContent = ""; }, 3000);
}

async function buyFromVendor(vendor) {
  setStatus(`Opening ${vendor === "all" ? "all vendors" : vendor}...`);

  try {
    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) { setStatus("No active tab found."); return; }

    // Request BOM from content script
    let parts = [];
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_BOM" });
      if (response?.parts?.length > 0) {
        parts = response.parts;
      }
    } catch {
      // Content script might not have responded — will use empty parts
    }

    // If no parts from content script, read from storage
    if (parts.length === 0) {
      const stored = await chrome.storage.local.get("forge_bom");
      if (stored.forge_bom?.length > 0) {
        parts = stored.forge_bom;
      }
    }

    // Send to background for cart filling
    const result = await chrome.runtime.sendMessage({ type: "BUY_ALL", vendor, parts });
    if (result?.success) {
      setStatus(`Opening ${vendor === "all" ? "all vendors" : vendor} tabs...`);
      setTimeout(() => window.close(), 500);
    } else {
      setStatus(result?.error || `Failed to open ${vendor}`);
    }
  } catch (err) {
    setStatus(`Error: ${err.message}`);
  }
}

document.getElementById("btn-digikey").addEventListener("click", () => buyFromVendor("digikey"));
document.getElementById("btn-mouser").addEventListener("click", () => buyFromVendor("mouser"));
document.getElementById("btn-lcsc").addEventListener("click", () => buyFromVendor("lcsc"));
document.getElementById("btn-amazon").addEventListener("click", () => buyFromVendor("amazon"));
document.getElementById("btn-aliexpress").addEventListener("click", () => buyFromVendor("aliexpress"));
document.getElementById("btn-all").addEventListener("click", () => buyFromVendor("all"));
