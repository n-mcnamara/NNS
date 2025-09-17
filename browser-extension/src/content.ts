chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'NNS_SHOW_BADGE') {
        createBadge(message.data);
    }
});

function createBadge(data: { name: string, event: any }) {
    if (document.getElementById('nns-host-element')) return;

    const host = document.createElement('div');
    host.id = 'nns-host-element';
    document.body.appendChild(host);

    const shadowRoot = host.attachShadow({ mode: 'open' });
    const ownerPubkey = data.event.pubkey;

    const badge = document.createElement('div');
    badge.className = 'nns-badge';
    badge.textContent = `Resolved via NNS: ${data.name}`;
    
    const modal = document.createElement('div');
    modal.className = 'nns-modal';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'nns-modal-content';
    modalContent.innerHTML = `
        <span class="nns-modal-close">&times;</span>
        <div class="nns-tabs">
            <button class="nns-tab-button active" data-tab="profile">Profile</button>
            <button class="nns-tab-button" data-tab="history">History</button>
        </div>
        <div id="profile" class="nns-tab-content active">
            <div class="nns-profile-section">
                <p class="nns-profile-status"><em>Loading profile...</em></p>
            </div>
            <details><summary>Raw NNS Record</summary><pre>${JSON.stringify(data.event, null, 2)}</pre></details>
        </div>
        <div id="history" class="nns-tab-content">
            <p>Loading history...</p>
        </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
        .nns-badge { position: fixed; bottom: 20px; right: 20px; background: #6a0dad; color: white; padding: 10px 15px; border-radius: 20px; font-family: sans-serif; cursor: pointer; z-index: 2147483647; }
        .nns-modal { display: none; position: fixed; z-index: 2147483647; left: 0; top: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); }
        .nns-modal-content { background: #1e1e1e; color: white; margin: 10% auto; padding: 20px; border-radius: 8px; max-width: 500px; }
        .nns-modal-close { float: right; font-size: 28px; cursor: pointer; }
        .nns-tabs { border-bottom: 1px solid #444; margin-bottom: 15px; }
        .nns-tab-button { background: none; border: none; color: #aaa; padding: 10px 15px; cursor: pointer; }
        .nns-tab-button.active { color: white; border-bottom: 2px solid #6a0dad; }
        .nns-tab-content { display: none; }
        .nns-tab-content.active { display: block; }
        .nns-profile-section { display: flex; gap: 15px; align-items: center; }
        .nns-profile-pic { width: 64px; height: 64px; border-radius: 50%; }
        .nns-history-item { border-bottom: 1px solid #444; padding: 10px 0; font-size: 0.9em; }
        .nns-history-item:last-child { border-bottom: none; }
    `;
    
    shadowRoot.appendChild(style);
    shadowRoot.appendChild(badge);
    shadowRoot.appendChild(modal);
    modal.appendChild(modalContent);

    // --- Event Listeners ---
    badge.addEventListener('click', () => {
        modal.style.display = 'block';
        const profileSection = modal.querySelector('.nns-profile-section');
        if (profileSection && !profileSection.hasAttribute('data-loaded')) {
            profileSection.setAttribute('data-loaded', 'true');
            chrome.runtime.sendMessage({ type: 'NNS_FETCH_PROFILE', pubkey: ownerPubkey }, response => {
                const profileStatus = profileSection.querySelector('.nns-profile-status');
                if (response?.event) {
                    const profile = JSON.parse(response.event.content);
                    profileSection.innerHTML = `
                        <img class="nns-profile-pic" src="${profile.picture || ''}" alt="Profile">
                        <div>
                            <p style="font-weight: bold; margin: 0;">${profile.displayName || profile.name || 'Unknown'}</p>
                            <p style="margin: 5px 0 0 0;">${profile.about || ''}</p>
                        </div>
                    `;
                } else {
                    if (profileStatus) profileStatus.textContent = 'No profile found.';
                }
            });
        }
    });

    modal.querySelector('.nns-modal-close')?.addEventListener('click', () => { modal.style.display = 'none'; });

    // Tab switching logic
    modal.querySelectorAll('.nns-tab-button').forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');
            modal.querySelectorAll('.nns-tab-button').forEach(btn => btn.classList.remove('active'));
            modal.querySelectorAll('.nns-tab-content').forEach(content => content.classList.remove('active'));
            button.classList.add('active');
            modal.querySelector(`#${tabName}`)?.classList.add('active');

            if (tabName === 'history' && !modal.querySelector('#history')?.hasAttribute('data-loaded')) {
                modal.querySelector('#history')?.setAttribute('data-loaded', 'true');
                chrome.runtime.sendMessage({ type: 'NNS_FETCH_HISTORY', name: data.name, pubkey: ownerPubkey }, response => {
                    const historyContent = modal.querySelector('#history');
                    if (historyContent) {
                        if (response?.events && response.events.length > 0) {
                            historyContent.innerHTML = response.events.map((event: any) => {
                                const date = new Date(event.created_at * 1000).toLocaleString();
                                const records = JSON.stringify(JSON.parse(event.content).records);
                                return `<div class="nns-history-item"><strong>${date}:</strong><pre>${records}</pre></div>`;
                            }).join('');
                        } else {
                            historyContent.innerHTML = '<p>No history found.</p>';
                        }
                    }
                });
            }
        });
    });
}