// MV3 Service Worker (classic script — do NOT use import/export here)

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs.length ? tabs[0] : null;
}

async function ensureContentScript(tabId) {
  try {
    // ping content script
    await chrome.tabs.sendMessage(tabId, { type: "JAH_CAN_YOU_HEAR_ME" });
    return true;
  } catch {
    // inject if missing
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content-script.js"]
    });
    return true;
  }
}

async function sendToAllFrames(tabId, message) {
  const frames = await chrome.webNavigation.getAllFrames({ tabId });

  const replies = await Promise.all(
    frames.map((f) =>
      chrome.tabs
        .sendMessage(tabId, message, { frameId: f.frameId })
        .catch(() => null)
    )
  );

  return replies.filter(Boolean);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (!msg || !msg.type) {
        sendResponse({ ok: false, error: "Missing message type." });
        return;
      }

      // --- Debug / health check ---
      if (msg.type === "JAH_PING") {
        sendResponse({ ok: true, from: "service-worker" });
        return;
      }

      // --- Active tab info ---
      if (msg.type === "JAH_GET_ACTIVE_TAB_INFO") {
        const tab = await getActiveTab();
        if (!tab || !tab.id) {
          sendResponse({ ok: false, error: "No active tab found." });
          return;
        }

        const url = tab.url || "";
        let hostname = "";
        try {
          hostname = url ? new URL(url).hostname : "";
        } catch {
          hostname = "";
        }

        sendResponse({ ok: true, tabId: tab.id, url, hostname });
        return;
      }

      // --- Start mapper ---
      if (msg.type === "JAH_START_MAPPER") {
        const tab = await getActiveTab();
        if (!tab || !tab.id) {
          sendResponse({ ok: false, error: "No active tab found." });
          return;
        }

        await ensureContentScript(tab.id);
        const result = await chrome.tabs.sendMessage(tab.id, { type: "JAH_START_MAPPER" });
        sendResponse({ ok: true, result });
        return;
      }

      // --- Stop mapper ---
      if (msg.type === "JAH_STOP_MAPPER") {
        const tab = await getActiveTab();
        if (!tab || !tab.id) {
          sendResponse({ ok: false, error: "No active tab found." });
          return;
        }

        const result = await chrome.tabs.sendMessage(tab.id, { type: "JAH_STOP_MAPPER" });
        sendResponse({ ok: true, result });
        return;
      }

      // --- Fill form ---
      if (msg.type === "JAH_APPLY_FILL") {
        const tab = await getActiveTab();
        if (!tab || !tab.id) {
          sendResponse({ ok: false, error: "No active tab found." });
          return;
        }

        await ensureContentScript(tab.id);

        const replies = await sendToAllFrames(tab.id, {
          type: "JAH_FILL_FORM",
          payload: msg.payload
        });

        if (!replies.length) {
          sendResponse({
            ok: false,
            error: "No frame responded. The form may be inside an iframe."
          });
          return;
        }

        sendResponse({ ok: true, result: replies[0] });
        return;
      }

      // --- Scan fields ---
      if (msg.type === "JAH_SCAN_FIELDS") {
        const tab = await getActiveTab();
        if (!tab || !tab.id) {
          sendResponse({ ok: false, error: "No active tab found." });
          return;
        }

        await ensureContentScript(tab.id);
        const result = await chrome.tabs.sendMessage(tab.id, { type: "JAH_SCAN_FIELDS" });
        sendResponse({ ok: true, result });
        return;
      }

      // --- Open / focus floating window ---
      if (msg.type === "JAH_OPEN_FLOATING_WINDOW") {
        const width = Math.max(420, Math.min(900, Number(msg.width) || 460));
        const height = Math.max(520, Math.min(1100, Number(msg.height) || 720));

        const { floatingWindowId } = await chrome.storage.local.get(["floatingWindowId"]);
        if (typeof floatingWindowId === "number") {
          try {
            await chrome.windows.update(floatingWindowId, { focused: true });
            sendResponse({ ok: true, reused: true, windowId: floatingWindowId });
            return;
          } catch {}
        }

        const win = await chrome.windows.create({
          url: chrome.runtime.getURL("popup.html?mode=window"),
          type: "popup",
          width,
          height,
          focused: true
        });

        if (win?.id != null) {
          await chrome.storage.local.set({ floatingWindowId: win.id });
        }

        sendResponse({ ok: true, reused: false, windowId: win?.id ?? null });
        return;
      }

      // --- Unknown message ---
      sendResponse({ ok: false, error: `Unknown message type: ${msg.type}` });
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    }
  })();

  return true; // ✅ REQUIRED for MV3 async responses
});
