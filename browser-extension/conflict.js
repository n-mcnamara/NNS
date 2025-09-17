// src/conflict.ts
document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const name = urlParams.get("name");
  const latestClaimants = JSON.parse(urlParams.get("latest") || "[]");
  const historyData = JSON.parse(urlParams.get("history") || "{}");
  const previousChoice = urlParams.get("previousChoice");
  const nameElement = document.getElementById("conflict-name");
  if (nameElement && name)
    nameElement.textContent = name;
  if (previousChoice) {
    const container = document.querySelector(".container");
    const reVerificationNotice = document.createElement("div");
    reVerificationNotice.className = "re-verification-notice";
    reVerificationNotice.innerHTML = `<p>You previously trusted a user for this name, but their record has changed. Please review the update and confirm your choice.</p>`;
    container?.insertBefore(reVerificationNotice, container.firstChild);
  }
  const listElement = document.getElementById("claimants-list");
  if (listElement) {
    listElement.innerHTML = "";
    latestClaimants.forEach((latestEvent) => {
      const card = document.createElement("div");
      card.className = "claimant-card";
      if (previousChoice && latestEvent.pubkey === previousChoice) {
        card.classList.add("previously-trusted");
      }
      const history = historyData[latestEvent.pubkey] || [latestEvent];
      const firstEvent = history[history.length - 1];
      let recordsHtml = '<p class="record-info">No records found.</p>';
      try {
        const records = JSON.parse(latestEvent.content)?.records;
        if (records && Object.keys(records).length > 0) {
          recordsHtml = Object.entries(records).map(([key, value]) => `
                        <div class="record-item">
                            <strong class="record-key">${key.toUpperCase()}:</strong>
                            <code class="record-value">${value}</code>
                        </div>
                    `).join("");
        }
      } catch (e) {
      }
      const firstDate = new Date(firstEvent.created_at * 1e3).toLocaleDateString();
      const latestDate = new Date(latestEvent.created_at * 1e3).toLocaleDateString();
      card.innerHTML = `
                <div class="claimant-info">
                    <div class="profile-section">
                        <img class="profile-pic-placeholder" src="" alt="">
                        <div>
                            <p class="profile-name">Loading profile...</p>
                            <p class="profile-npub"><code>${latestEvent.pubkey}</code></p>
                        </div>
                    </div>
                    <div class="records-section">${recordsHtml}</div>
                    <div class="meta-section">
                        <p><strong>First seen:</strong> ${firstDate}</p>
                        <p><strong>Last update:</strong> ${latestDate}</p>
                        <p class="wot-score"><strong>Web of Trust:</strong> <span>Checking...</span></p>
                        <details class="history-details">
                            <summary>Show ${history.length} record(s)</summary>
                            <div class="history-timeline">
                                ${history.map((event) => `
                                    <div class="history-item">
                                        <strong>${new Date(event.created_at * 1e3).toLocaleString()}:</strong>
                                        <pre>${JSON.stringify(JSON.parse(event.content).records, null, 2)}</pre>
                                    </div>
                                `).join("")}
                            </div>
                        </details>
                    </div>
                </div>
                <div class="action-section">
                    <button class="trust-button" data-pubkey="${latestEvent.pubkey}">Trust this one</button>
                </div>
            `;
      listElement.appendChild(card);
      chrome.runtime.sendMessage({ type: "NNS_FETCH_PROFILE", pubkey: latestEvent.pubkey }, (response) => {
        if (response?.event) {
          try {
            const profile = JSON.parse(response.event.content);
            card.querySelector(".profile-name").textContent = profile.displayName || profile.name || "Unknown";
            card.querySelector(".profile-pic-placeholder").src = profile.picture || "";
          } catch (e) {
          }
        } else {
          card.querySelector(".profile-name").textContent = "No profile found";
        }
      });
      chrome.runtime.sendMessage({ type: "NNS_FETCH_WOT_SCORE", claimantPubkey: latestEvent.pubkey }, (response) => {
        const wotScoreElement = card.querySelector(".wot-score span");
        if (wotScoreElement) {
          if (response?.score !== null && response?.score !== void 0) {
            wotScoreElement.textContent = `${response.score} of your contacts follow this user.`;
          } else {
            wotScoreElement.textContent = "Could not determine. (Set your pubkey in popup)";
          }
        }
      });
      card.querySelector(".trust-button")?.addEventListener("click", () => {
        handleTrustChoice(name, latestEvent);
      });
    });
    const footer = document.createElement("p");
    footer.className = "footer-note";
    footer.textContent = "Your choice will be remembered. You can clear choices from the extension popup.";
    listElement.insertAdjacentElement("afterend", footer);
  }
});
function handleTrustChoice(name, chosenEvent) {
  if (!name)
    return;
  const choice = { pubkey: chosenEvent.pubkey, eventId: chosenEvent.id };
  chrome.runtime.sendMessage({ type: "NNS_SAVE_CHOICE", name, choice }, (response) => {
    if (response?.success) {
      const httpUrl = JSON.parse(chosenEvent.content)?.records?.http;
      if (httpUrl) {
        window.location.href = httpUrl;
      } else {
        const listElement = document.getElementById("claimants-list");
        if (listElement) {
          listElement.innerHTML = `<p class="error">The selected claimant does not have a valid HTTP URL record for redirection.</p>`;
        }
      }
    }
  });
}
