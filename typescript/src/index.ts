import {
  Account,
  AbstractedAccount,
  Aptos,
  AptosConfig,
  Ed25519PrivateKey,
  Network,
  Serializer,
} from "@aptos-labs/ts-sdk";

const network = (process.env.APTOS_NETWORK as Network) ?? Network.TESTNET;
const aptos = new Aptos(new AptosConfig({ network }));

const deployerAddress = process.env.DEPLOYER_ADDRESS;
if (!deployerAddress) {
  throw new Error("Set DEPLOYER_ADDRESS to the module publisher address.");
}

const delegationSeconds = Number(process.env.DELEGATION_SECONDS ?? "600");
if (!Number.isFinite(delegationSeconds) || delegationSeconds <= 0) {
  throw new Error("DELEGATION_SECONDS must be a positive number.");
}

const loadAccount = (envKey: string, label: string) => {
  const privateKeyHex = process.env[envKey];
  if (privateKeyHex) {
    return Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(privateKeyHex),
    });
  }

  console.warn(`${label} private key not provided; generating a new account.`);
  return Account.generate();
};

const owner = loadAccount("OWNER_PRIVATE_KEY", "Owner");
const delegate = loadAccount("DELEGATE_PRIVATE_KEY", "Delegate");

const authenticationFunction = `${deployerAddress}::delegated_signer::authenticate`;

const main = async () => {
  console.log("Network:", network);
  console.log("Owner:", owner.accountAddress.toString());
  console.log("Delegate:", delegate.accountAddress.toString());
  console.log("Authenticator:", authenticationFunction);

  if (network === Network.DEVNET || network === Network.TESTNET) {
    console.log("Funding owner account on faucet...");
    await aptos.fundAccount({
      accountAddress: owner.accountAddress,
      amount: 100_000_000,
    });
  }

  console.log("Enabling account abstraction on owner...");
  const enableTransaction = await aptos.abstraction.enableAccountAbstractionTransaction({
    accountAddress: owner.accountAddress,
    authenticationFunction,
  });
  const pendingEnable = await aptos.signAndSubmitTransaction({
    signer: owner,
    transaction: enableTransaction,
  });
  await aptos.waitForTransaction({ transactionHash: pendingEnable.hash });

  console.log(`Delegating for ${delegationSeconds} seconds...`);
  const delegateTransaction = await aptos.transaction.build.simple({
    sender: owner.accountAddress,
    data: {
      function: `${deployerAddress}::delegated_signer::delegate_for_seconds`,
      typeArguments: [],
      functionArguments: [delegate.publicKey.toUint8Array(), delegationSeconds],
    },
  });
  const pendingDelegate = await aptos.signAndSubmitTransaction({
    signer: owner,
    transaction: delegateTransaction,
  });
  await aptos.waitForTransaction({ transactionHash: pendingDelegate.hash });

  const abstractedAccount = new AbstractedAccount({
    accountAddress: owner.accountAddress,
    authenticationFunction,
    signer: (digest) => {
      const serializer = new Serializer();
      delegate.publicKey.serialize(serializer);
      delegate.sign(digest).serialize(serializer);
      return serializer.toUint8Array();
    },
  });

  console.log("Submitting a transfer with delegated signature...");
  const transferTransaction = await aptos.transaction.build.simple({
    sender: abstractedAccount.accountAddress,
    data: {
      function: "0x1::coin::transfer",
      typeArguments: ["0x1::aptos_coin::AptosCoin"],
      functionArguments: [owner.accountAddress, 1],
    },
  });
  const pendingTransfer = await aptos.signAndSubmitTransaction({
    signer: abstractedAccount,
    transaction: transferTransaction,
  });
  await aptos.waitForTransaction({ transactionHash: pendingTransfer.hash });

  console.log("Transfer hash:", pendingTransfer.hash);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
