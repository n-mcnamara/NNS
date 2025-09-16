// src/background.ts
var RELAYS = ["wss://relay.damus.io", "wss://relay.primal.net", "wss://relay.nostr.band", "wss://nos.lol"];
var NAME_KIND = 38383;
function fetchAllClaimants(filter) {
  return new Promise((resolve) => {
    const eventsByPubkey = /* @__PURE__ */ new Map();
    let socketsFinished = 0;
    const onSocketFinished = () => {
      socketsFinished++;
      if (socketsFinished === RELAYS.length)
        resolve(Array.from(eventsByPubkey.values()));
    };
    RELAYS.forEach((url) => {
      const ws = new WebSocket(url);
      const subId = `fetch-all-${url}-${Date.now()}`;
      ws.onopen = () => ws.send(JSON.stringify(["REQ", subId, { ...filter }]));
      ws.onmessage = (event) => {
        const [type, receivedSubId, eventData] = JSON.parse(event.data);
        if (type === "EVENT" && receivedSubId === subId) {
          const existing = eventsByPubkey.get(eventData.pubkey);
          if (!existing || eventData.created_at > existing.created_at) {
            eventsByPubkey.set(eventData.pubkey, eventData);
          }
        }
        if (type === "EOSE" && receivedSubId === subId) {
          ws.close();
          onSocketFinished();
        }
      };
      ws.onerror = () => onSocketFinished();
    });
    setTimeout(() => {
      if (socketsFinished < RELAYS.length)
        resolve(Array.from(eventsByPubkey.values()));
    }, 2500);
  });
}
chrome.omnibox.onInputEntered.addListener(async (text) => {
  const name = text.trim();
  if (!name)
    return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id)
    return;
  const storageKey = `nns_choice_${name}`;
  const cachedData = await chrome.storage.local.get(storageKey);
  const trustedChoice = cachedData[storageKey];
  if (trustedChoice) {
    const filter = { kinds: [NAME_KIND], "#d": [name], authors: [trustedChoice.pubkey] };
    const claimants = await fetchAllClaimants(filter);
    const latestEvent = claimants[0];
    if (latestEvent && latestEvent.id === trustedChoice.eventId) {
      handleResolution(tab.id, name, [latestEvent]);
    } else {
      await chrome.storage.local.remove(storageKey);
      const allClaimants = await fetchAllClaimants({ kinds: [NAME_KIND], "#d": [name] });
      handleResolution(tab.id, name, allClaimants);
    }
  } else {
    const filter = { kinds: [NAME_KIND], "#d": [name] };
    const claimants = await fetchAllClaimants(filter);
    handleResolution(tab.id, name, claimants);
  }
});
function handleResolution(tabId, name, claimants) {
  if (claimants.length === 0)
    return;
  if (claimants.length === 1) {
    const nostrEvent = claimants[0];
    const httpUrl = JSON.parse(nostrEvent.content)?.records?.http;
    if (httpUrl) {
      chrome.tabs.update(tabId, { url: httpUrl });
      chrome.tabs.onUpdated.addListener(function listener(updatedTabId, info) {
        if (updatedTabId === tabId && info.status === "complete") {
          chrome.tabs.sendMessage(updatedTabId, { type: "NNS_SHOW_BADGE", data: { name, event: nostrEvent } });
          chrome.tabs.onUpdated.removeListener(listener);
        }
      });
    }
  } else {
    const conflictUrl = chrome.runtime.getURL(`conflict.html?name=${name}&claimants=${encodeURIComponent(JSON.stringify(claimants))}`);
    chrome.tabs.update(tabId, { url: conflictUrl });
  }
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "NNS_FETCH_PROFILE") {
    fetchAllClaimants({ kinds: [0], authors: [message.pubkey] }).then((profiles) => sendResponse({ event: profiles[0] || null }));
    return true;
  }
  if (message.type === "NNS_SAVE_CHOICE") {
    const { name, choice } = message;
    const storageKey = `nns_choice_${name}`;
    chrome.storage.local.set({ [storageKey]: choice }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});
