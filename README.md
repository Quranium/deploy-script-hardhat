# Deploy-script-hardhat
## Quranium Smart Contract Deployer

### Overview

This is a custom deployment and interaction script for the **[Quranium Network](https://quranium.org)** – a post-quantum blockchain built to resist future cryptographic threats.

Unlike standard Hardhat deployments, this script:

- Uses **SLH-DSA** (post-quantum digital signature scheme)
- Signs transactions manually using **SHAKE-256**
- Deploys via raw JSON-RPC and **RLP-encoded transactions**
- Interacts directly with the contract after deployment

---

###  Folder Structure

```
project-root/
├── deploy/ # Contains the deploy script
│ └── deploy.js
├── contracts/ # Your Solidity smart contracts
│ └── HelloWorld.sol
├── artifacts/ # Compiled output from Hardhat
│ └── ...
├── .env # Environment variables
└── README.md
```

---

### Prerequisites

- Node.js >= 16
- Hardhat
- Quranium RPC endpoint
- A mnemonic phrase from **[QSafe wallet](https://docs.qsafewallet.com)** (12-word BIP39)

### Installation

```bash
npm install @noble/post-quantum @noble/hashes bip39 web3-eth-abi rlp dotenv @enkryptcom/utils

```
### Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
MNEMONIC="your QSafe wallet mnemonic phrase"
QURANIUM_RPC="https://your-quranium-node-url"
QURANIUM_CHAIN_ID = "Quranium Chain ID"
```
### Customizing for own contract

Replace the following parts in the code:
```
contract_path: 
  description: "Path to the Hardhat artifact JSON file for your compiled contract"
  example: "artifacts/contracts/YourContract.sol/YourContract.json"
```
Make sure to replace or add the constructor arguments in the **main** function

```
constructor_args: 
  description: "Initial values passed to the constructor of your contract"
  example: 
    - "Hello, Quranium!" 
```

Make sure to replace the current get/set methods with the methods of your contract for interacting with it.

---

### Security Notes

- This script uses your **mnemonic phrase** to generate a post-quantum keypair using SLH-DSA.
- **Never commit your `.env` file** or expose sensitive credentials to public repositories.
- If you accidentally leak your mnemonic or private key, consider it compromised and regenerate a new wallet immediately.
- SLH-DSA and the Quranium network are **experimental** and still evolving. Use this setup cautiously in production environments.
- Always double-check the `chainId`, contract bytecode, and encoded parameters before broadcasting transactions.

---

### License

This project is licensed under the **MIT License**.

You are free to use, modify, and distribute this software for personal or commercial purposes, provided that this copyright notice and permission notice appear in all copies.


