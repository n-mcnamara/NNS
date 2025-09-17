import { useState, useEffect, useCallback } from 'react';
import NDK, { NDKEvent, NDKNip07Signer, NDKUser, NDKKind } from '@nostr-dev-kit/ndk';
import './App.css';
import { debounce } from 'lodash';
import RelayManager from './components/RelayManager';
import type { Relay } from './components/RelayManager';

const NAME_KIND = 38383 as NDKKind;
const defaultRelays = [
    'wss://relay.damus.io', 
    'wss://relay.nostr.band', 
    'wss://nos.lol', 
    'wss://purplepag.es',
    'wss://history.nostr.watch' // Archival relay
];

// --- Helper Functions ---
const checkRelayStatus = (url: string): Promise<Relay> => {
    return new Promise((resolve) => {
        const ws = new WebSocket(url);
        ws.onopen = () => { resolve({ url, status: 'connected' }); ws.close(); };
        ws.onerror = () => { resolve({ url, status: 'disconnected' }); ws.close(); };
        setTimeout(() => { resolve({ url, status: 'disconnected' }); ws.close(); }, 3000);
    });
};

// --- Helper Components ---
const NameAvailability = ({ isChecking, owners, connectedRelays, finalName }: { isChecking: boolean, owners: NDKUser[], connectedRelays: number, finalName: string }) => {
    if (isChecking) return <p className="status-checking">Checking availability on {connectedRelays} relays...</p>;
    if (finalName.length < 3) return null;

    if (owners.length > 0) {
        return (
            <div className="status-taken">
                <p>❌ Name has been claimed by {owners.length} user(s):</p>
                {owners.map(owner => {
                    const profile = owner.profile;
                    return (
                        <div className="profile-card" key={owner.pubkey}>
                            <img src={profile?.image} alt={profile?.displayName} />
                            <div>
                                <strong>{profile?.displayName || profile?.name}</strong>
                                <p>{profile?.about}</p>
                                <code>{owner.npub}</code>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    }

    return <p className="status-available">✅ No claims found for this name on {connectedRelays} connected relays. It's available!</p>;
};

// --- Main App Component ---
function App() {
    const [ndk] = useState<NDK>(new NDK());
    const [pubkey, setPubkey] = useState<string | undefined>(undefined);
    const [ownedNames, setOwnedNames] = useState<NDKEvent[]>([]);
    const [relayUrls, setRelayUrls] = useState<string[]>(defaultRelays);
    const [relayStatuses, setRelayStatuses] = useState<Relay[]>([]);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    
    const [baseName, setBaseName] = useState('');
    const [suffix, setSuffix] = useState('.nostr');
    const [regHttpUrl, setRegHttpUrl] = useState('');
    const [regIpfs, setRegIpfs] = useState('');
    const [regLightning, setRegLightning] = useState('');
    const [regNostrDomain, setRegNostrDomain] = useState('');
    const [isRegistering, setIsRegistering] = useState(false);
    const [isCheckingName, setIsCheckingName] = useState(false);
    const [currentOwners, setCurrentOwners] = useState<NDKUser[]>([]);

    const finalName = `${baseName}${suffix === 'none' ? '' : suffix}`;
    const connectedRelays = relayStatuses.filter(r => r.status === 'connected').length;

    useEffect(() => {
        ndk.explicitRelayUrls = relayUrls;
        ndk.connect().catch(() => console.error("Error connecting to relays"));
        setRelayStatuses(relayUrls.map(url => ({ url, status: 'connecting' })));
        Promise.all(relayUrls.map(checkRelayStatus)).then(setRelayStatuses);
    }, [relayUrls, ndk]);

    useEffect(() => {
        if (pubkey && ndk && connectedRelays > 0) {
            const sub = ndk.subscribe({ kinds: [NAME_KIND], authors: [pubkey] });
            sub.on('event', (event: NDKEvent) => {
                setOwnedNames(prev => {
                    const name = event.tagValue('d');
                    if (prev.find(e => e.tagValue('d') === name)) {
                        return prev.map(e => e.tagValue('d') === name ? event : e);
                    }
                    return [...prev, event].sort((a, b) => (a.tagValue('d') || '').localeCompare(b.tagValue('d') || ''));
                });
            });
            return () => sub.stop();
        }
    }, [pubkey, ndk, connectedRelays]);

    const checkName = useCallback(debounce(async (name: string) => {
        if (!ndk || name.length < 3) {
            setCurrentOwners([]);
            setIsCheckingName(false);
            return;
        }

        setIsCheckingName(true);
        const foundOwners = new Map<string, NDKUser>();

        const locallyOwned = ownedNames.find(e => e.tagValue('d') === name);
        if (locallyOwned && pubkey) {
            const user = ndk.getUser({ pubkey });
            await user.fetchProfile();
            foundOwners.set(user.pubkey, user);
            setCurrentOwners(Array.from(foundOwners.values()));
        } else {
            setCurrentOwners([]);
        }

        if (connectedRelays === 0) {
            setIsCheckingName(false);
            return;
        }

        const filter = { kinds: [NAME_KIND], '#d': [name] };
        const sub = ndk.subscribe(filter, { closeOnEose: false });

        sub.on('event', async (event: NDKEvent) => {
            if (foundOwners.has(event.pubkey)) return;
            const owner = ndk.getUser({ pubkey: event.pubkey });
            await owner.fetchProfile();
            foundOwners.set(owner.pubkey, owner);
            setCurrentOwners(Array.from(foundOwners.values()));
        });

        setTimeout(() => {
            sub.stop();
            setIsCheckingName(false);
        }, 2500);

    }, 500), [ndk, connectedRelays, ownedNames, pubkey]);

    useEffect(() => {
        checkName(finalName);
    }, [finalName, checkName]);

    const connectWallet = async () => {
        if (!ndk) return;
        try {
            ndk.signer = new NDKNip07Signer();
            const user = await (ndk.signer as NDKNip07Signer).user();
            setPubkey(user.pubkey);
        } catch (error) { console.error("Failed to connect NIP-07 signer:", error); }
    };

    const handleRegister = async () => {
        if (!ndk || !finalName) return alert("A name is required.");
        if (!ndk.signer) return alert("Please connect your wallet.");
        if (connectedRelays === 0) return alert("Please connect to at least one relay before publishing.");

        const records: Record<string, string> = {};
        if (regHttpUrl) records.http = regHttpUrl;
        if (regIpfs) records.ipfs = regIpfs;
        if (regLightning) records.lightning = regLightning;
        if (regNostrDomain) records.nostr = regNostrDomain;

        if (Object.keys(records).length === 0) return alert("You must provide at least one record.");

        setIsRegistering(true);
        try {
            const event = new NDKEvent(ndk);
            event.kind = NAME_KIND;
            event.tags = [['d', finalName]];
            event.content = JSON.stringify({ records });
            
            const publishedTo = await event.publish();
            alert(`Successfully published to ${publishedTo.size} of ${connectedRelays} connected relays.\n\nNote: It may take a minute for changes to appear across the network.`);
            
            setOwnedNames(prev => {
                const existing = prev.find(e => e.tagValue('d') === finalName);
                if (existing) return prev.map(e => e.tagValue('d') === finalName ? event : e);
                return [...prev, event].sort((a, b) => (a.tagValue('d') || '').localeCompare(b.tagValue('d') || ''));
            });

        } catch (error) {
            console.error("Registration failed:", error);
        } finally {
            setIsRegistering(false);
        }
    };

    const handleEdit = (event: NDKEvent) => {
        const name = event.tagValue('d') || '';
        const records = JSON.parse(event.content)?.records || {};
        const suffixMatch = name.match(/(\.[a-z]+)$/);
        const newSuffix = suffixMatch ? suffixMatch[1] : 'none';
        const newBaseName = name.replace(suffixMatch ? suffixMatch[0] : '', '');
        setBaseName(newBaseName);
        setSuffix(newSuffix);
        setRegHttpUrl(records.http || '');
        setRegIpfs(records.ipfs || '');
        setRegLightning(records.lightning || '');
        setRegNostrDomain(records.nostr || '');
        document.querySelector('.card:last-child')?.scrollIntoView({ behavior: 'smooth' });
    };

    return (
        <div className="app-container">
            <main className="main-content">
                <div className="header">
                    <h1>Nostr Name System Registrar</h1>
                    <div className="header-controls">
                        {pubkey ? <p>Connected: <code>{pubkey.substring(0, 12)}...</code></p> : <button className="connect-button" onClick={connectWallet}>Connect Wallet</button>}
                        {!isSidebarOpen && <button className="manage-relays-btn" onClick={() => setIsSidebarOpen(true)}>Manage Relays</button>}
                    </div>
                </div>

                <div className="container-vertical">
                    {pubkey && (
                        <div className="card">
                            <h2>Your Names</h2>
                            {ownedNames.length > 0 ? (
                                <ul className="name-list">
                                    {ownedNames.map(event => (
                                        <li key={event.id}>
                                            <strong>{event.tagValue('d')}</strong>
                                            <button className="edit-button" onClick={() => handleEdit(event)}>Edit</button>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p>You haven't registered any names yet.</p>
                            )}
                        </div>
                    )}

                    <div className="card">
                        <h2>Register or Update a Name</h2>
                        <div className="form-group">
                            <label>Name</label>
                            <div className="name-input-group">
                                <input type="text" placeholder="e.g., 'satoshi'" value={baseName} onChange={(e) => setBaseName(e.target.value.toLowerCase())} />
                                <select value={suffix} onChange={(e) => setSuffix(e.target.value)}>
                                    <option value=".nostr">.nostr</option>
                                    <option value=".blossom">.blossom</option>
                                    <option value=".ln">.ln</option>
                                    <option value=".web">.web</option>
                                    <option value="none">(no suffix)</option>
                                </select>
                            </div>
                            <p className="final-name-display">Full name: <strong>{finalName}</strong></p>
                            <NameAvailability isChecking={isCheckingName} owners={currentOwners} connectedRelays={connectedRelays} finalName={finalName} />
                        </div>
                        
                        <h3>Records</h3>
                        <p className="subtitle">Link this name to one or more resources.</p>

                        <div className="form-group">
                            <label>Linked `.nostr` Name (High Security)</label>
                            <input type="text" placeholder="npub1..." value={regNostrDomain} onChange={(e) => setRegNostrDomain(e.target.value)} />
                            <small>Point this name to a secure `.nostr` domain. Clients will use the records from that domain.</small>
                        </div>
                        <div className="form-group">
                            <label>HTTP URL</label>
                            <input type="text" placeholder="https://..." value={regHttpUrl} onChange={(e) => setRegHttpUrl(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label>IPFS Hash</label>
                            <input type="text" placeholder="bafy..." value={regIpfs} onChange={(e) => setRegIpfs(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label>Lightning Address</label>
                            <input type="text" placeholder="user@domain.com" value={regLightning} onChange={(e) => setRegLightning(e.target.value)} />
                        </div>

                        <button onClick={handleRegister} disabled={!pubkey || isRegistering || isCheckingName || connectedRelays === 0}>
                            {isRegistering ? 'Publishing...' : 'Publish to Nostr'}
                        </button>
                    </div>
                </div>
            </main>
            <div className={`sidebar-wrapper ${isSidebarOpen ? 'open' : ''}`}>
                <RelayManager 
                    relays={relayStatuses}
                    onAddRelay={(url) => setRelayUrls(prev => [...new Set([...prev, url])])}
                    onRemoveRelay={(url) => setRelayUrls(prev => prev.filter(r => r !== url))}
                    onToggleSidebar={() => setIsSidebarOpen(false)}
                />
            </div>
        </div>
    );
}

export default App;
