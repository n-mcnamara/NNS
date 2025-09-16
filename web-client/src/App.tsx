import { useState, useEffect, useCallback } from 'react';
import NDK, { NDKEvent, NDKNip07Signer, NDKUser, NDKKind, NDKFilter } from '@nostr-dev-kit/ndk';
import './App.css';
import { debounce } from 'lodash';

const NAME_KIND = 38383 as NDKKind;

const ndk = new NDK({
    explicitRelayUrls: ['wss://relay.damus.io', 'wss://relay.primal.net', 'wss://relay.nostr.band'],
});

// --- Helper Components ---
const NameAvailability = ({ status, owners }: { status: 'checking' | 'available' | 'taken' | 'idle', owners: NDKUser[] }) => {
    if (status === 'checking') return <p className="status-checking">Checking availability...</p>;
    if (status === 'available') return <p className="status-available">✅ Name is available!</p>;
    if (status === 'taken' && owners.length > 0) {
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
    return null;
};

// --- Main App Component ---
function App() {
    const [pubkey, setPubkey] = useState<string | undefined>(undefined);
    const [ownedNames, setOwnedNames] = useState<NDKEvent[]>([]);
    
    // Registration state
    const [baseName, setBaseName] = useState('');
    const [suffix, setSuffix] = useState('.nostr');
    const [regHttpUrl, setRegHttpUrl] = useState('');
    const [regIpfs, setRegIpfs] = useState('');
    const [regLightning, setRegLightning] = useState('');
    const [regNostrDomain, setRegNostrDomain] = useState('');
    const [isRegistering, setIsRegistering] = useState(false);
    const [availability, setAvailability] = useState<'checking' | 'available' | 'taken' | 'idle'>('idle');
    const [currentOwners, setCurrentOwners] = useState<NDKUser[]>([]);

    const finalName = `${baseName}${suffix === 'none' ? '' : suffix}`;

    useEffect(() => {
        ndk.connect().catch(err => console.error("NDK connection error:", err));
    }, []);

    // Fetch owned names when user connects
    useEffect(() => {
        if (pubkey) {
            const sub = ndk.subscribe({ kinds: [NAME_KIND], authors: [pubkey] });
            sub.on('event', (event: NDKEvent) => {
                setOwnedNames(prev => {
                    const name = event.tagValue('d');
                    if (prev.find(e => e.tagValue('d') === name)) return prev;
                    return [...prev, event].sort((a, b) => (a.tagValue('d') || '').localeCompare(b.tagValue('d') || ''));
                });
            });
        }
    }, [pubkey]);

    const checkName = useCallback(debounce(async (name: string) => {
        if (name.length < 3) {
            setAvailability('idle');
            return;
        }
        setAvailability('checking');
        const filter: NDKFilter = { kinds: [NAME_KIND], '#d': [name] };
        const events = await ndk.fetchEvents(filter);
        
        if (events.length > 0) {
            const ownersMap = new Map<string, NDKUser>();
            for (const event of events) {
                // Ensure we only show the latest claim for each pubkey
                const existing = ownersMap.get(event.pubkey);
                if (!existing || event.created_at > (existing.profile?.createdAt || 0)) {
                    const owner = ndk.getUser({ pubkey: event.pubkey });
                    await owner.fetchProfile();
                    ownersMap.set(event.pubkey, owner);
                }
            }
            setCurrentOwners(Array.from(ownersMap.values()));
            setAvailability('taken');
        } else {
            setCurrentOwners([]);
            setAvailability('available');
        }
    }, 500), []);

    useEffect(() => {
        checkName(finalName);
    }, [finalName, checkName]);

    const connectWallet = async () => {
        try {
            ndk.signer = new NDKNip07Signer();
            const user = await (ndk.signer as NDKNip07Signer).user();
            setPubkey(user.pubkey);
        } catch (error) { console.error("Failed to connect NIP-07 signer:", error); }
    };

    const handleRegister = async () => {
        // ... (handleRegister logic is unchanged)
        if (!finalName) return alert("A name is required.");
        if (!ndk.signer) return alert("Please connect your wallet.");

        const records: Record<string, string> = {};
        if (regHttpUrl) records.http = regHttpUrl;
        if (regIpfs) records.ipfs = regIpfs;
        if (regLightning) records.lightning = regLightning;
        if (regNostrDomain) records.nostr = regNostrDomain;

        if (Object.keys(records).length === 0) {
            return alert("You must provide at least one record.");
        }

        setIsRegistering(true);
        try {
            const event = new NDKEvent(ndk);
            event.kind = NAME_KIND;
            event.tags = [['d', finalName]];
            event.content = JSON.stringify({ records });
            await event.publish();
            alert(`Successfully published binding for '${finalName}'!`);
            setOwnedNames(prev => [event, ...prev.filter(e => e.tagValue('d') !== finalName)].sort((a, b) => (a.tagValue('d') || '').localeCompare(b.tagValue('d') || '')));
        } catch (error) {
            console.error("Registration failed:", error);
        } finally {
            setIsRegistering(false);
        }
    };

    const handleEdit = (event: NDKEvent) => {
        // ... (handleEdit logic is unchanged)
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

        window.scrollTo({ top: document.querySelector('.card:last-child')?.getBoundingClientRect().top, behavior: 'smooth' });
    };

    return (
        <>
            <div className="header">
                <h1>Nostr Name System Registrar</h1>
                {pubkey ? <p>Connected: <code>{pubkey.substring(0, 12)}...</code></p> : <button className="connect-button" onClick={connectWallet}>Connect Wallet</button>}
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
                        <NameAvailability status={availability} owners={currentOwners} />
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

                    <button onClick={handleRegister} disabled={!pubkey || isRegistering || availability === 'checking'}>
                        {isRegistering ? 'Publishing...' : 'Publish to Nostr'}
                    </button>
                </div>
            </div>
        </>
    );
}

export default App;