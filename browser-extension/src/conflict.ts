document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const name = urlParams.get('name');
    const claimants = JSON.parse(urlParams.get('claimants') || '[]');
    const previousChoice = urlParams.get('previousChoice');

    const nameElement = document.getElementById('conflict-name');
    if (nameElement && name) {
        nameElement.textContent = name;
    }

    // Add the re-verification message if applicable
    if (previousChoice) {
        const container = document.querySelector('.container');
        const reVerificationNotice = document.createElement('div');
        reVerificationNotice.className = 're-verification-notice';
        reVerificationNotice.innerHTML = `<p>You previously trusted a user for this name, but their record has changed. Please review the update and confirm your choice.</p>`;
        container?.insertBefore(reVerificationNotice, container.firstChild);
    }

    const listElement = document.getElementById('claimants-list');
    if (listElement) {
        listElement.innerHTML = ''; // Clear spinner

        claimants.forEach((claimantEvent: any) => {
            const card = document.createElement('div');
            card.className = 'claimant-card';

            // Highlight the previously trusted user
            if (previousChoice && claimantEvent.pubkey === previousChoice) {
                card.classList.add('previously-trusted');
            }
            
            let recordsHtml = '<p class="record-info">No records found.</p>';
            try {
                const records = JSON.parse(claimantEvent.content)?.records;
                if (records && Object.keys(records).length > 0) {
                    recordsHtml = Object.entries(records).map(([key, value]) => `
                        <div class="record-item">
                            <strong class="record-key">${key.toUpperCase()}:</strong>
                            <code class="record-value">${value}</code>
                        </div>
                    `).join('');
                }
            } catch (e) {}

            const claimDate = new Date(claimantEvent.created_at * 1000);
            const dateString = claimDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

            card.innerHTML = `
                <div class="claimant-info">
                    <div class="profile-section">
                        <img class="profile-pic-placeholder" src="" alt="">
                        <div>
                            <p class="profile-name">Loading profile...</p>
                            <p class="profile-npub"><code>${claimantEvent.pubkey.substring(0, 24)}...</code></p>
                        </div>
                    </div>
                    <div class="records-section">
                        ${recordsHtml}
                    </div>
                    <div class="meta-section">
                        <p><strong>Claimed on:</strong> ${dateString}</p>
                    </div>
                </div>
                <div class="action-section">
                    <button class="trust-button" data-pubkey="${claimantEvent.pubkey}">Trust this one</button>
                </div>
            `;
            listElement.appendChild(card);

            chrome.runtime.sendMessage({ type: 'NNS_FETCH_PROFILE', pubkey: claimantEvent.pubkey }, response => {
                if (response?.event) {
                    try {
                        const profile = JSON.parse(response.event.content);
                        card.querySelector('.profile-name')!.textContent = profile.displayName || profile.name || 'Unknown';
                        (card.querySelector('.profile-pic-placeholder') as HTMLImageElement)!.src = profile.picture || '';
                    } catch (e) {}
                } else {
                    card.querySelector('.profile-name')!.textContent = 'No profile found';
                }
            });

            card.querySelector('.trust-button')?.addEventListener('click', () => {
                handleTrustChoice(name, claimantEvent);
            });
        });
        
        const footer = document.createElement('p');
        footer.className = 'footer-note';
        footer.textContent = 'Your choice will be remembered for this name. You can clear your choices from the extension popup menu.';
        listElement.insertAdjacentElement('afterend', footer);
    }
});

function handleTrustChoice(name: string | null, chosenEvent: any) {
    if (!name) return;

    const choice = {
        pubkey: chosenEvent.pubkey,
        eventId: chosenEvent.id
    };
    const storageKey = `nns_choice_${name}`;

    chrome.runtime.sendMessage({ type: 'NNS_SAVE_CHOICE', name: name, choice: choice }, (response) => {
        if (response?.success) {
            const httpUrl = JSON.parse(chosenEvent.content)?.records?.http;
            if (httpUrl) {
                window.location.href = httpUrl;
            } else {
                const listElement = document.getElementById('claimants-list');
                if (listElement) {
                    listElement.innerHTML = `<p class="error">The selected claimant does not have a valid HTTP URL record for redirection.</p>`;
                }
            }
        }
    });
}