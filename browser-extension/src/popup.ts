document.getElementById('clear-cache-button')?.addEventListener('click', () => {
    chrome.storage.local.get(null, (items) => {
        const keysToRemove = Object.keys(items).filter(key => key.startsWith('nns_choice_'));
        if (keysToRemove.length > 0) {
            chrome.storage.local.remove(keysToRemove, () => {
                const status = document.getElementById('status-message');
                if (status) status.textContent = `Cleared ${keysToRemove.length} choice(s).`;
            });
        }
    });
});
