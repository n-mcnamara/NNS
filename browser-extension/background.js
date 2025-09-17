// src/background.ts
var RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://relay.nostr.band",
  "wss://nos.lol",
  "wss://history.nostr.watch"
  // Archival relay
];
var NAME_KIND = 38383;
function fetchAllEventsPerUser(filter) {
  return new Promise((resolve) => {
    const eventsByPubkey = /* @__PURE__ */ new Map();
    const seenEventIds = /* @__PURE__ */ new Set();
    let socketsFinished = 0;
    const onSocketFinished = () => {
      socketsFinished++;
      if (socketsFinished === RELAYS.length) {
        eventsByPubkey.forEach((events) => events.sort((a, b) => b.created_at - a.created_at));
        resolve(eventsByPubkey);
      }
    };
    RELAYS.forEach((url) => {
      const ws = new WebSocket(url);
      const subId = `fetch-all-events-${url}-${Date.now()}`;
      ws.onopen = () => ws.send(JSON.stringify(["REQ", subId, { ...filter }]));
      ws.onmessage = (event) => {
        const [type, receivedSubId, eventData] = JSON.parse(event.data);
        if (type === "EVENT" && receivedSubId === subId) {
          if (!seenEventIds.has(eventData.id)) {
            seenEventIds.add(eventData.id);
            const pubkey = eventData.pubkey;
            if (!eventsByPubkey.has(pubkey)) {
              eventsByPubkey.set(pubkey, []);
            }
            eventsByPubkey.get(pubkey).push(eventData);
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
      if (socketsFinished < RELAYS.length) {
        socketsFinished = RELAYS.length;
        onSocketFinished();
      }
    }, 3500);
  });
}
async function resolveNostrName(tabId, name) {
  const storageKey = `nns_choice_${name}`;
  const cachedData = await chrome.storage.local.get(storageKey);
  const trustedChoice = cachedData[storageKey];
  const filter = { kinds: [NAME_KIND], "#d": [name] };
  const historyMap = await fetchAllEventsPerUser(filter);
  const latestClaimants = Array.from(historyMap.values()).map((events) => events[0]).filter(Boolean);
  if (trustedChoice) {
    const latestEvent = latestClaimants.find((e) => e.pubkey === trustedChoice.pubkey);
    if (latestEvent && latestEvent.id === trustedChoice.eventId) {
      await processResolution(tabId, name, [latestEvent], historyMap);
    } else {
      await chrome.storage.local.remove(storageKey);
      await processResolution(tabId, name, latestClaimants, historyMap, trustedChoice.pubkey);
    }
  } else {
    await processResolution(tabId, name, latestClaimants, historyMap);
  }
}
async function processResolution(tabId, name, latestClaimants, historyMap, previousChoice) {
  if (latestClaimants.length === 0)
    return;
  if (latestClaimants.length === 1) {
    const nostrEvent = latestClaimants[0];
    const records = JSON.parse(nostrEvent.content)?.records || {};
    if (records.nostr) {
      await resolveNostrName(tabId, records.nostr);
      return;
    }
    if (records.http) {
      chrome.tabs.update(tabId, { url: records.http });
      chrome.tabs.onUpdated.addListener(function listener(updatedTabId, info) {
        if (updatedTabId === tabId && info.status === "complete") {
          chrome.tabs.sendMessage(updatedTabId, { type: "NNS_SHOW_BADGE", data: { name, event: nostrEvent } });
          chrome.tabs.onUpdated.removeListener(listener);
        }
      });
    }
  } else {
    const historyObject = Object.fromEntries(historyMap.entries());
    let conflictUrl = chrome.runtime.getURL(`conflict.html?name=${name}&latest=${encodeURIComponent(JSON.stringify(latestClaimants))}&history=${encodeURIComponent(JSON.stringify(historyObject))}`);
    if (previousChoice) {
      conflictUrl += `&previousChoice=${previousChoice}`;
    }
    chrome.tabs.update(tabId, { url: conflictUrl });
  }
}
chrome.omnibox.onInputEntered.addListener(async (text) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await resolveNostrName(tab.id, text.trim());
  }
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "NNS_FETCH_PROFILE") {
    fetchAllEventsPerUser({ kinds: [0], authors: [message.pubkey] }).then((profileMap) => sendResponse({ event: profileMap.get(message.pubkey)?.[0] || null }));
    return true;
  }
  if (message.type === "NNS_FETCH_HISTORY") {
    fetchAllEventsPerUser({ kinds: [NAME_KIND], authors: [message.pubkey], "#d": [message.name] }).then((historyMap) => sendResponse({ events: historyMap.get(message.pubkey) || [] }));
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
  if (message.type === "NNS_FETCH_WOT_SCORE") {
  }
});
