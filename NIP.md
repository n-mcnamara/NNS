# Nostr Name System (NNS)

## Abstract

This NIP defines a decentralized and censorship-resistant name system built on Nostr. It allows users to map human-readable names to Nostr public keys and other resources. The system is designed to be simple, robust, and to place the final authority for name resolution on the end-user, a principle we refer to as "Informed Choice."

## Kind and Event Structure

NNS records are defined as **replaceable events** of `kind: 38383`.

### Tags

-   `d`: The human-readable name being claimed (e.g., "satoshi", "satoshi.web"). This tag is required and MUST contain only one value. Names are case-insensitive but should be stored and compared in lowercase.

### Content

The `content` of the event MUST be a JSON object containing a `records` object. Each key-value pair in the `records` object represents a resource the name points to.

```json
{
  "records": {
    "http": "https://example.com",
    "ipfs": "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    "lightning": "satoshi@nakamoto.com",
    "nostr": "satoshi.nostr"
  }
}
```

Clients MAY support any record type they choose. The keys defined above are recommended starting points.

## Client Resolution Logic

The core security model of NNS is based on empowering the end-user to resolve conflicts. Clients MUST NOT automatically decide a "winner" when a name has multiple claimants.

### Step 1: Querying for a Name

To resolve a name (e.g., "satoshi"), a client should query multiple relays for events of `kind: 38383` with a `#d` tag matching the name.

### Step 2: Conflict Detection

After a reasonable timeout (e.g., 2-3 seconds), the client should collect all valid, signed events it has received. A conflict exists if events from more than one unique `pubkey` are found for the same name.

### Step 3: The "Informed Choice" Screen

If a conflict is detected, the client MUST stop the resolution process and present a dedicated user interface to the user. This screen should display a "Trust Card" for each claimant, containing, at a minimum:

1.  **Social Proof:** The claimant's Nostr profile (`kind: 0`), including their display name, picture, and bio.
2.  **History & Age:**
    *   The `created_at` timestamp of the claimant's *first* known event for this name.
    *   The `created_at` timestamp of their *most recent* event for this name.
    *   To get a full history, clients should query at least one **archival relay**.

Clients are also encouraged to display other signals, such as:

-   **Web of Trust:** A score indicating how many of the user's contacts also follow the claimant.
-   **Record Content:** The actual records being published by the claimant.

### Step 4: Caching the User's Choice

Once the user selects a claimant to trust, the client SHOULD cache this choice locally. The cache should store a mapping of the name to the trusted `pubkey` and the specific `event.id` of the record they trusted.

### Step 5: Re-verification on Change

On subsequent resolutions for the same name, the client should:
1.  Fetch the latest record for that name specifically from the trusted `pubkey`.
2.  Compare the `id` of the new event with the `id` stored in the cache.
3.  If the event `id` has changed, the cache for that name MUST be invalidated, and the user MUST be prompted to re-approve the change, ideally by showing a comparison of the old and new records.

This "re-verification tripwire" is a critical security feature to prevent silent, malicious redirects.

## High-Security `.nostr` Records

If a resolved record contains a `nostr` key (e.g., `"nostr": "satoshi.nostr"`), clients SHOULD perform a second-level resolution on the value of that key. The records from this second resolution should then be used as the final result. This allows for a chain of trust, where a memorable name can point to a more secure, less frequently changed `.nostr` name.
