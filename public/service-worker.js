async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs.length ? tabs[0] : null;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (!msg || !msg.type) return;

      if (msg.type === "JAH_PING") {
        sendResponse({ ok: true, from: "service-worker" });
        return;
      }

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

      if (msg.type === "JAH_START_MAPPER") {
        const tab = await getActiveTab();
        if (!tab || !tab.id) {
          sendResponse({ ok: false, error: "No active tab found." });
          return;
        }

        try {
          await chrome.tabs.sendMessage(tab.id, { type: "JAH_CAN_YOU_HEAR_ME" });
        } catch {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["content-script.js"]
          });
        }

        const result = await chrome.tabs.sendMessage(tab.id, {
          type: "JAH_START_MAPPER"
        });

        sendResponse({ ok: true, result });
        return;
      }

      if (msg.type === "JAH_STOP_MAPPER") {
        const tab = await getActiveTab();
        if (!tab || !tab.id) {
          sendResponse({ ok: false, error: "No active tab found." });
          return;
        }

        const result = await chrome.tabs.sendMessage(tab.id, {
          type: "JAH_STOP_MAPPER"
        });

        sendResponse({ ok: true, result });
        return;
      }

      if (msg.type === "JAH_APPLY_FILL") {
        const tab = await getActiveTab();
        if (!tab || !tab.id) {
          sendResponse({ ok: false, error: "No active tab found." });
          return;
        }

        try {
          await chrome.tabs.sendMessage(tab.id, { type: "JAH_CAN_YOU_HEAR_ME" });
        } catch {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["content-script.js"]
          });
        }

        const result = await chrome.tabs.sendMessage(tab.id, {
          type: "JAH_FILL_FORM",
          payload: msg.payload
        });

        sendResponse({ ok: true, result });
        return;
      }
    } catch (e) {
      sendResponse({
        ok: false,
        error: e?.message || String(e)
      });
    }
  })();

  return true;
});
