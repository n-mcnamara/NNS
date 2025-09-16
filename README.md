# Nostr Name System (NNS)

NNS is a decentralized and censorship-resistant naming system built on the Nostr protocol. It allows users to map human-readable names (e.g., `satoshi`, `alice.web`) to various resources, such as websites, Lightning addresses, and other Nostr profiles (`npub`s).

The system is designed to be a secure, user-friendly layer on top of Nostr's cryptographic identity, replacing long, hard-to-remember identifiers with memorable names. The core principle is **user agency**: anyone can claim any name, and conflicts are resolved by the end-user's client, empowering them to make an informed choice based on social trust.

This repository contains the reference implementations for the NNS Registrar and Resolver.

## Core Components

1.  **NNS Registrar (`/web-client`)**: A React-based web application that serves as the primary interface for users to register and manage their names.
2.  **NNS Resolver (`/browser-extension`)**: A browser extension that seamlessly resolves NNS names, handles conflicts, and provides security feedback to the user.

## Current Features (MVP)

### Registrar (`web-client`)

*   **NIP-07 Wallet Integration:** Users can connect securely with browser wallet extensions like Alby.
*   **Live Name Availability Checker:** As a user types a name, the application queries the Nostr network in real-time to check if the name is already claimed.
*   **Conflict Display:** If a name has been claimed by multiple Nostr users, the registrar displays the profiles of all current claimants.
*   **Multi-Record Registration:** Users can create records for various resource types:
    *   HTTP URLs (for traditional websites)
    *   IPFS Hashes
    *   Lightning Addresses
    *   Linked `.nostr` Names (a high-security feature for delegating trust to a specific `npub`'s domain)
*   **Name Management:** Users can view a list of all the names they have registered and click an "Edit" button to easily update the records for any of their names.

### Resolver (`browser-extension`)

*   **Omnibox Integration:** Users can resolve names by typing the `nns` keyword followed by a name into the address bar (e.g., `nns test`).
*   **Multi-Relay Resolution:** The extension queries multiple Nostr relays in parallel to ensure resolution is fast and censorship-resistant.
*   **Conflict Resolution UI:** If a name has multiple claimants, the extension redirects the user to a secure, local page where they can review the Nostr profiles of all claimants and make an informed choice about which one to trust.
*   **Secure Choice Caching:** The user's trust decision is cached locally.
    *   **Re-verification on Change:** The cache is automatically invalidated if the trusted user updates their name record, forcing the user to re-approve the change—a critical security feature to prevent malicious redirects.
    *   **Manual Cache Clearing:** Users can clear all their saved trust decisions from the extension's popup menu.
*   **Security Badge & Profile Verification:**
    *   After a successful resolution, a badge is displayed on the destination page.
    *   Clicking the badge opens a modal that fetches and displays the Nostr profile (`kind: 0`) of the name's owner, providing clear social verification.
    *   The UI is rendered in a Shadow DOM to prevent conflicts with the host website's code (e.g., React apps).

---

*This is a work-in-progress project. The protocol specification (NIP) is not yet formalized.*
