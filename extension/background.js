// Background service worker: handles cart-filling logic per vendor.
// Ported from 1clickBOM retailer adapters (CPAL licensed).

// ── DigiKey: fastadd.aspx URL ──
// Opens tabs with pre-filled DigiKey cart using fastadd.aspx
// Falls back to search result tabs without exact MPNs
function openDigiKey(parts) {
  const electronics = parts.filter(p =>
    !p.name.toLowerCase().includes("bamboo") &&
    !p.name.toLowerCase().includes("brass") &&
    !p.name.toLowerCase().includes("copper") &&
    !p.name.toLowerCase().includes("coaster")
  );

  if (electronics.length === 0) return;

  // Open DigiKey fastadd.aspx with search terms (best effort without MPNs)
  const baseUrl = "https://www.digikey.com/classic/Ordering/fastadd.aspx";
  const params = electronics.map((p, i) =>
    `part${i}=${encodeURIComponent(p.name + " " + p.specification)}&qty${i}=${p.quantity}&cref${i}=${encodeURIComponent(p.name.slice(0, 48))}`
  ).join("&");

  chrome.tabs.create({ url: `${baseUrl}?${params}`, active: false });
}

// ── Mouser: search tabs ──
// Opens search result tabs. Cart API requires CSRF token from active session.
function openMouser(parts) {
  const electronics = parts.filter(p =>
    !p.name.toLowerCase().includes("bamboo") &&
    !p.name.toLowerCase().includes("brass") &&
    !p.name.toLowerCase().includes("copper") &&
    !p.name.toLowerCase().includes("coaster")
  );

  if (electronics.length === 0) return;

  // Batch into groups of 5 per tab (Mouser allows multi-line search paste)
  for (let i = 0; i < electronics.length; i += 5) {
    const batch = electronics.slice(i, i + 5);
    const query = batch.map(p => `${p.name} ${p.specification}`).join(" OR ");
    chrome.tabs.create({
      url: `https://www.mouser.com/c/?q=${encodeURIComponent(query)}`,
      active: false,
    });
  }
}

// ── LCSC: search tabs ──
// Opens search result tabs. Batch cart API requires browser cookies.
function openLCSC(parts) {
  const electronics = parts.filter(p =>
    !p.name.toLowerCase().includes("bamboo") &&
    !p.name.toLowerCase().includes("brass") &&
    !p.name.toLowerCase().includes("copper") &&
    !p.name.toLowerCase().includes("coaster")
  );

  if (electronics.length === 0) return;

  // Batch into groups of 5 per tab
  for (let i = 0; i < electronics.length; i += 5) {
    const batch = electronics.slice(i, i + 5);
    batch.forEach((p) => {
      chrome.tabs.create({
        url: `https://www.lcsc.com/search?q=${encodeURIComponent(p.name + " " + p.specification)}`,
        active: i === 0 && batch.indexOf(p) === 0,
      });
    });
  }
}

// ── Amazon: individual tabs ──
function openAmazon(parts) {
  parts.forEach((p, i) => {
    chrome.tabs.create({
      url: `https://www.amazon.com/s?k=${encodeURIComponent(p.name + " " + p.specification)}`,
      active: i === 0,
    });
  });
}

// ── AliExpress: individual tabs ──
function openAliExpress(parts) {
  parts.forEach((p, i) => {
    chrome.tabs.create({
      url: `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(p.name + " " + p.specification)}`,
      active: false,
    });
  });
}

// ── Message handler ──
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "BUY_ALL") {
    const parts = msg.parts || [];
    if (parts.length === 0) {
      sendResponse({ success: false, error: "No parts found on this page." });
      return false;
    }

    const vendor = msg.vendor;

    try {
      switch (vendor) {
        case "digikey": openDigiKey(parts); break;
        case "mouser": openMouser(parts); break;
        case "lcsc": openLCSC(parts); break;
        case "amazon": openAmazon(parts); break;
        case "aliexpress": openAliExpress(parts); break;
        case "all":
          openDigiKey(parts);
          setTimeout(() => openMouser(parts), 500);
          setTimeout(() => openLCSC(parts), 1000);
          setTimeout(() => openAmazon(parts), 1500);
          setTimeout(() => openAliExpress(parts), 2000);
          break;
        default:
          sendResponse({ success: false, error: `Unknown vendor: ${vendor}` });
          return false;
      }

      sendResponse({ success: true, vendor });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
  }
  return true;
});
