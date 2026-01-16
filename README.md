# Aptos Delegated Signer Example

This repo contains:
- A Move module that delegates signing to another public key for a bounded number of seconds.
- A TypeScript integration example using the official Aptos TS SDK.

## Install the Aptos CLI (Linux)

Use the official install script:

curl -fsSL "https://aptos.dev/scripts/install_cli.sh" | sh

## Move module

The Move package lives in `move/` and exposes three entry points:
- `delegate_for_seconds` to allow a delegate key for `X` seconds.
- `revoke_delegate` to remove the delegate key early.
- `authenticate` for Aptos account abstraction.

Publish the module (example for testnet):

cd move
aptos init --profile deployer --network testnet
aptos move publish --profile deployer --named-addresses deployer=<deployer_address>

## TypeScript example

The integration example lives in `typescript/`.

cd typescript
npm install
cp .env.example .env

Fill in the values in `.env`, then run:

npm run start

The script:
- Enables account abstraction for the owner address using `delegated_signer::authenticate`.
- Calls `delegate_for_seconds` with the delegate public key and the duration.
- Builds an `AbstractedAccount` that signs with the delegate key.
- Submits a transfer using the delegated signer.
