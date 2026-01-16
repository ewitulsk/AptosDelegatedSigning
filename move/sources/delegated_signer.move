module deployer::delegated_signer {
    use std::signer;
    use std::vector;

    use aptos_framework::auth_data::{Self, AbstractionAuthData};
    use aptos_framework::timestamp;
    use aptos_std::bcs_stream::{Self, deserialize_u8};
    use aptos_std::ed25519::{
        Self,
        new_signature_from_bytes,
        new_unvalidated_public_key_from_bytes,
        unvalidated_public_key_to_bytes
    };
    use aptos_std::smart_table::{Self, SmartTable};

    // ====== Error Codes ====== //

    const EINVALID_PUBLIC_KEY: u64 = 0x30000;
    const EPUBLIC_KEY_NOT_PERMITTED: u64 = 0x30001;
    const ENO_DELEGATIONS: u64 = 0x30002;
    const EINVALID_SIGNATURE: u64 = 0x30003;
    const EDELEGATION_EXPIRED: u64 = 0x30004;
    const EINVALID_DURATION: u64 = 0x30005;

    // ====== Data Structures ====== //

    struct Delegations has key {
        expiration_by_key: SmartTable<vector<u8>, u64>,
    }

    // ====== Authenticator ====== //

    public fun authenticate(
        account: signer,
        auth_data: AbstractionAuthData
    ): signer acquires Delegations {
        let account_addr = signer::address_of(&account);
        assert!(exists<Delegations>(account_addr), ENO_DELEGATIONS);
        let delegations = borrow_global<Delegations>(account_addr);

        // Extract the public key and signature from the authenticator
        let authenticator = *auth_data::authenticator(&auth_data);
        let stream = bcs_stream::new(authenticator);
        let public_key = new_unvalidated_public_key_from_bytes(
            bcs_stream::deserialize_vector<u8>(&mut stream, |x| deserialize_u8(x))
        );
        let signature = new_signature_from_bytes(
            bcs_stream::deserialize_vector<u8>(&mut stream, |x| deserialize_u8(x))
        );

        let public_key_bytes = unvalidated_public_key_to_bytes(&public_key);
        assert!(
            smart_table::contains(&delegations.expiration_by_key, public_key_bytes),
            EPUBLIC_KEY_NOT_PERMITTED
        );

        let expiration = *smart_table::borrow(&delegations.expiration_by_key, public_key_bytes);
        assert!(timestamp::now_seconds() <= expiration, EDELEGATION_EXPIRED);

        // Verify the signature against the transaction digest
        let digest = *auth_data::digest(&auth_data);
        assert!(
            ed25519::signature_verify_strict(&signature, &public_key, digest),
            EINVALID_SIGNATURE
        );

        account
    }

    // ====== Core Functionality ====== //

    public entry fun delegate_for_seconds(
        account: &signer,
        public_key: vector<u8>,
        seconds_valid: u64
    ) acquires Delegations {
        assert!(vector::length(&public_key) == 32, EINVALID_PUBLIC_KEY);
        assert!(seconds_valid > 0, EINVALID_DURATION);

        let account_addr = signer::address_of(account);
        if (!exists<Delegations>(account_addr)) {
            move_to(account, Delegations {
                expiration_by_key: smart_table::new(),
            });
        };

        let expiration = timestamp::now_seconds() + seconds_valid;
        let delegations = borrow_global_mut<Delegations>(account_addr);
        if (smart_table::contains(&delegations.expiration_by_key, public_key)) {
            smart_table::remove(&mut delegations.expiration_by_key, public_key);
        };

        smart_table::add(&mut delegations.expiration_by_key, public_key, expiration);
    }

    public entry fun revoke_delegate(
        account: &signer,
        public_key: vector<u8>
    ) acquires Delegations {
        let account_addr = signer::address_of(account);
        assert!(exists<Delegations>(account_addr), ENO_DELEGATIONS);

        let delegations = borrow_global_mut<Delegations>(account_addr);
        smart_table::remove(&mut delegations.expiration_by_key, public_key);
    }
}
