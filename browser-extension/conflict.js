// src/conflict.ts
document.addEventListener("DOMContentLoaded", () => {
  const name = new URLSearchParams(window.location.search).get("name");
  const claimants = JSON.parse(new URLSearchParams(window.location.search).get("claimants") || "[]");
  document.getElementById("conflict-name").textContent = name;
  const listElement = document.getElementById("claimants-list");
  listElement.innerHTML = "";
  claimants.forEach((claimantEvent) => {
    const card = document.createElement("div");
    card.className = "claimant-card";
    card.innerHTML = `<div class="profile-section"><img class="profile-pic"><div><p class="profile-name">Loading...</p><p class="profile-npub"><code>${claimantEvent.pubkey.substring(0, 24)}...</code></p></div></div><div class="action-section"><button class="trust-button">Trust</button></div>`;
    listElement.appendChild(card);
    chrome.runtime.sendMessage({ type: "NNS_FETCH_PROFILE", pubkey: claimantEvent.pubkey }, (response) => {
      if (response?.event) {
        const profile = JSON.parse(response.event.content);
        card.querySelector(".profile-name").textContent = profile.displayName || profile.name || "Unknown";
        card.querySelector(".profile-pic").src = profile.picture || "";
      } else {
        card.querySelector(".profile-name").textContent = "No profile";
      }
    });
    card.querySelector(".trust-button")?.addEventListener("click", () => handleTrustChoice(name, claimantEvent));
  });
});
function handleTrustChoice(name, chosenEvent) {
  if (!name)
    return;
  const choice = { pubkey: chosenEvent.pubkey, eventId: chosenEvent.id };
  chrome.runtime.sendMessage({ type: "NNS_SAVE_CHOICE", name, choice }, () => {
    const httpUrl = JSON.parse(chosenEvent.content)?.records?.http;
    if (httpUrl)
      window.location.href = httpUrl;
  });
}
