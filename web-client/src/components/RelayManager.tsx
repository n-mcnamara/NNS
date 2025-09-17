import React, { useState } from 'react';
import './RelayManager.css';

export interface Relay {
    url: string;
    status: 'connected' | 'disconnected' | 'connecting';
}

interface RelayManagerProps {
    relays: Relay[];
    onAddRelay: (url: string) => void;
    onRemoveRelay: (url: string) => void;
    onToggleSidebar: () => void;
}

const RelayManager: React.FC<RelayManagerProps> = ({ relays, onAddRelay, onRemoveRelay, onToggleSidebar }) => {
    const [newRelayUrl, setNewRelayUrl] = useState('');

    const handleAddRelay = () => {
        if (newRelayUrl && !relays.find(r => r.url === newRelayUrl)) {
            onAddRelay(newRelayUrl);
            setNewRelayUrl('');
        }
    };

    return (
        <div className="relay-manager-sidebar">
            <div className="sidebar-header">
                <h2>Relay Manager</h2>
                <button className="close-sidebar-btn" onClick={onToggleSidebar}>×</button>
            </div>
            <ul className="relay-list">
                {relays.map(relay => (
                    <li key={relay.url} className={`relay-item status-${relay.status}`}>
                        <span className="relay-status-indicator"></span>
                        <span className="relay-url">{relay.url}</span>
                        <button className="remove-relay-btn" onClick={() => onRemoveRelay(relay.url)}>×</button>
                    </li>
                ))}
            </ul>
            <div className="add-relay-form">
                <input
                    type="text"
                    value={newRelayUrl}
                    onChange={(e) => setNewRelayUrl(e.target.value)}
                    placeholder="wss://new.relay.com"
                />
                <button onClick={handleAddRelay}>Add</button>
            </div>
        </div>
    );
};

export default RelayManager;