// --- Clear Cache Logic ---
document.getElementById('clear-cache-button')?.addEventListener('click', () => {
    chrome.storage.local.get(null, (items) => {
        const keysToRemove = Object.keys(items).filter(key => key.startsWith('nns_choice_'));
        if (keysToRemove.length > 0) {
            chrome.storage.local.remove(keysToRemove, () => {
                const status = document.getElementById('cache-status');
                if (status) status.textContent = `Cleared ${keysToRemove.length} choice(s).`;
                setTimeout(() => { if(status) status.textContent = '' }, 2000);
            });
        } else {
            const status = document.getElementById('cache-status');
            if (status) status.textContent = 'No choices to clear.';
            setTimeout(() => { if(status) status.textContent = '' }, 2000);
        }
    });
});

// --- Save Pubkey Logic ---
const pubkeyInput = document.getElementById('pubkey-input') as HTMLInputElement;
const pubkeyStatus = document.getElementById('pubkey-status');

// Load the saved pubkey when the popup opens
chrome.storage.local.get('user_pubkey', (data) => {
    if (data.user_pubkey) {
        pubkeyInput.value = data.user_pubkey;
    }
});

document.getElementById('save-pubkey-button')?.addEventListener('click', () => {
    const pubkey = pubkeyInput.value.trim();
    if (pubkey) {
        // Basic validation for npub or hex
        if (pubkey.startsWith('npub1') || /^[0-9a-fA-F]{64}$/.test(pubkey)) {
            chrome.storage.local.set({ 'user_pubkey': pubkey }, () => {
                if (pubkeyStatus) pubkeyStatus.textContent = 'Pubkey saved!';
                setTimeout(() => { if(pubkeyStatus) pubkeyStatus.textContent = '' }, 2000);
            });
        } else {
            if (pubkeyStatus) pubkeyStatus.textContent = 'Invalid pubkey format.';
            setTimeout(() => { if(pubkeyStatus) pubkeyStatus.textContent = '' }, 2000);
        }
    }
});