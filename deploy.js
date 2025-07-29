const fs = require('fs');
const path = require('path');
const slh = require("@noble/post-quantum/slh-dsa");
const { mnemonicToEntropy } = require("bip39");
const { shake256 } = require("@noble/hashes/sha3");
const { keccak256 } = require("ethereum-cryptography/keccak");
const { bufferToHex } = require("@enkryptcom/utils");
const Web3EthAbi = require('web3-eth-abi');
const rlp = require('rlp');
require('dotenv').config();

// Helper to ensure minimal hex string with 0x prefix
const toHex = (val, allowEmpty = false) => {
  if ((typeof val === 'number' || typeof val === 'bigint') && val === 0 && allowEmpty) return '';
  if (typeof val === 'number' || typeof val === 'bigint') {
    if (val === 0) return '0x0';
    return '0x' + val.toString(16).replace(/^0+/, '');
  }
  if (typeof val === 'string') {
    let hex = val.startsWith('0x') ? val.slice(2) : val;
    hex = hex.replace(/^0+/, '');
    if (hex === '' && allowEmpty) return '';
    if (hex === '') return '0x0';
    return '0x' + hex;
  }
  return allowEmpty ? '' : '0x0';
};

async function fetchFromNode(method, params = []) {
  const response = await fetch(process.env.QURANIUM_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: Date.now(),
    }),
  });
  const data = await response.json();
  if (data.error) throw new Error(`RPC Error: ${data.error.message}`);
  return data.result;
}

async function generateKeypair(mnemonic) {
  const entropy = Buffer.from(mnemonicToEntropy(mnemonic), "hex");
  const seed96 = shake256.create({ dkLen: 96 }).update(entropy).digest();
  const keys = slh.slh_dsa_shake_256f.keygen(seed96);
  const originalPublicKey = Buffer.from(keys.publicKey);
  const strippedPubKey = originalPublicKey.subarray(1);
  const publicKeyHash = keccak256(strippedPubKey);
  const addressBytes = publicKeyHash.slice(-20);
  return {
    address: '0x' + Buffer.from(addressBytes).toString('hex'),
    secretKey: keys.secretKey,  // Keep as Uint8Array
    publicKey: keys.publicKey,  // Keep as Uint8Array
  };
}

async function signTransaction(transaction, keys) {
  // Helper to ensure minimal hex string with 0x prefix
  const toHex = (val, allowEmpty = false) => {
    if ((typeof val === 'number' || typeof val === 'bigint') && val === 0 && allowEmpty) return '';
    if (typeof val === 'number' || typeof val === 'bigint') {
      if (val === 0) return '0x0';
      return '0x' + val.toString(16).replace(/^0+/, '0x0');
    }
    if (typeof val === 'string') {
      let hex = val.startsWith('0x') ? val.slice(2) : val;
      hex = hex.replace(/^0+/, '');
      if (hex === '' && allowEmpty) return '';
      if (hex === '') return '0x0';
      return '0x' + hex;
    }
    return allowEmpty ? '0x0' : '0x';
  };

  // Prepare unsigned tx fields as hex strings
  const txFieldsForSigning = [
    toHex(transaction.nonce),
    toHex(transaction.gasPrice),
    toHex(transaction.gasLimit),
    transaction.to ? toHex(transaction.to) : '0x',
    transaction.value === 0 ? '' : toHex(transaction.value, true),
    toHex(transaction.data),
    toHex(transaction.chainId),
    '0x',
    '0x'
  ];

  const rlpEncoded = rlp.encode(txFieldsForSigning);
  const msgHash = keccak256(rlpEncoded);

  // Print debug info
  const publicKeyHex = Buffer.from(keys.publicKey).toString('hex');
  const senderAddress = transaction.from.toLowerCase();
  // Derive address from public key (same as generateKeypair)
  const originalPublicKey = Buffer.from(keys.publicKey);
  const strippedPubKey = originalPublicKey.subarray(1);
  const publicKeyHash = keccak256(strippedPubKey);
  const addressBytes = publicKeyHash.slice(-20);
  const derivedAddress = '0x' + Buffer.from(addressBytes).toString('hex');
  console.log('Sender address:', senderAddress);
  console.log('Derived address from public key:', derivedAddress);
  if (senderAddress !== derivedAddress) {
    console.warn('WARNING: Sender address does not match address derived from public key!');
  }
  console.log('Public key (hex, no 0x):', publicKeyHex);
  console.log('RLP fields for signing:', txFieldsForSigning);
  console.log('RLP-encoded unsigned tx (hex):', Buffer.from(rlpEncoded).toString('hex'));
  console.log('Message hash (hex):', Buffer.from(msgHash).toString('hex'));

  // Sign the hash with SLH-DSA
  const signature = slh.slh_dsa_shake_256f.sign(
    keys.secretKey,
    // keys.publicKey,
    msgHash
  );
  const signatureHex = Buffer.from(signature).toString('hex');
  const sig = signatureHex + publicKeyHex;
  console.log('Signature length:', signature.length);
  console.log('Public key length:', keys.publicKey.length);
  console.log('sig+pubkey length:', sig.length / 2);
  console.log('Signature (hex):', signatureHex);

  // Prepare final tx fields as hex strings
  const txFieldsSigned = [
    toHex(transaction.nonce),
    toHex(transaction.gasPrice),
    toHex(transaction.gasLimit),
    transaction.to ? toHex(transaction.to) : '0x',
    transaction.value === 0 ? '' : toHex(transaction.value, true),
    toHex(transaction.data),
    '0x' + sig,
    toHex(transaction.chainId)
  ];
  console.log('RLP fields for sending:', txFieldsSigned);
  const rawTx = '0x' + rlp.encode(txFieldsSigned).toString('hex');
  return rawTx;
}

async function main() {
  try {
    // Read contract bytecode and ABI
    const contractPath = path.join(__dirname, '../artifacts/contracts/HelloWorld.sol/HelloWorld.json');
    const contractArtifact = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
    const bytecode = contractArtifact.bytecode;
    const abi = contractArtifact.abi;

    // Generate keypair from mnemonic
    if (!process.env.MNEMONIC) {
      throw new Error('Please set MNEMONIC in your .env file');
    }
    const keypair = await generateKeypair(process.env.MNEMONIC);
    console.log('Deploying from address:', keypair.address);

    // Encode constructor parameters
    const initialMessage = "Hello, Quranium!";
    const constructor = abi.find(item => item.type === 'constructor');
    
    // Combine bytecode and constructor args
    let fullBytecode = bytecode;
    if (constructor && constructor.inputs.length > 0) {
      const constructorArgs = Web3EthAbi.encodeParameters(
        constructor.inputs.map(input => input.type),
        [initialMessage]
      ).slice(2); // remove '0x' prefix
      fullBytecode = bytecode + constructorArgs;
    }

    console.log("bytecode = ",bytecode.slice(20));

    // Get nonce
    const nonce = await fetchFromNode('eth_getTransactionCount', [keypair.address, 'latest']);
    console.log('Nonce:', parseInt(nonce, 16));

    // Get gas price
    const gasPrice = await fetchFromNode('eth_gasPrice');
    console.log('Gas Price:', parseInt(gasPrice, 16));

    // Estimate gas
    const gasEstimate = await fetchFromNode('eth_estimateGas', [{
      from: keypair.address,
      data: fullBytecode
    }]);
    console.log('Estimated Gas:', parseInt(gasEstimate, 16));

    // Prepare transaction
    const transaction = {
      from: keypair.address, // <-- add this line
      nonce: nonce,
      gasPrice: gasPrice,
      gasLimit: gasEstimate,
      to: null,
      value: '', // ENSURE THIS IS 0, not '0x00'
      data: fullBytecode.startsWith('0x') ? fullBytecode : '0x' + fullBytecode,
      chainId: 4062024,
    };

    // Sign the transaction
    console.log('Signing transaction...');
    const rawTx = await signTransaction(transaction, {
      secretKey: keypair.secretKey,
      publicKey: keypair.publicKey
    });

    // Send raw transaction
    console.log('Sending raw transaction...');
    const txHash = await fetchFromNode('eth_sendRawTransaction', [rawTx]);
    console.log('Transaction hash:', txHash);

    // Wait for receipt
    console.log('Waiting for receipt...');
    let receipt;
    while (!receipt) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      receipt = await fetchFromNode('eth_getTransactionReceipt', [txHash]);
      if (receipt && receipt.status !== '0x1') {
        throw new Error('Transaction failed');
      }
    }

    console.log('\n=== Contract Deployment Successful! ===');
    console.log('Contract Address:', receipt.contractAddress);
    
    console.log('\n=== Interacting with Contract ===');
    
    // Read initial message
    console.log('\n1. Reading initial message...');
    const getMessageSelector = Web3EthAbi.encodeFunctionSignature('getMessage()');
    const getMessage = await fetchFromNode('eth_call', [{
      to: receipt.contractAddress,
      data: getMessageSelector
    }, "latest"]);

    const decodedMessage = Web3EthAbi.decodeParameter('string', getMessage);
    console.log('Current message:', decodedMessage);

    // 2. Set new message
    console.log('\n2. Setting new message...');
    const newMessage = "Hey, new text here!";
    const setMessageData = Web3EthAbi.encodeFunctionCall({
      name: 'setMessage',
      type: 'function',
      inputs: [{
        type: 'string',
        name: 'message'
      }]
    }, [newMessage]);

    // Get fresh nonce
    const currentNonceHex = await fetchFromNode('eth_getTransactionCount', [keypair.address, 'latest']);
    const currentNonce = parseInt(currentNonceHex, 16);

    // Estimate gas
    const estimatedGas = await fetchFromNode('eth_estimateGas', [{
      from: keypair.address,
      to: receipt.contractAddress,
      data: setMessageData
    }]);

    const setMessageTx = {
      from: keypair.address,
      to: receipt.contractAddress,
      data: setMessageData,
      nonce: toHex(currentNonce),
      gasPrice: await fetchFromNode('eth_gasPrice'),
      gasLimit: estimatedGas,
      value: '0x0',  // Fixed here
      chainId: 4062024,
    };

    const rawSetMessageTx = await signTransaction(setMessageTx, {
      secretKey: keypair.secretKey,
      publicKey: keypair.publicKey
    });

    const setMessageTxHash = await fetchFromNode('eth_sendRawTransaction', [rawSetMessageTx]);
    console.log('Set message transaction hash:', setMessageTxHash);

    // Wait for confirmation
    console.log('Waiting for transaction confirmation...');
    let setMessageReceipt;
    while (!setMessageReceipt) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      setMessageReceipt = await fetchFromNode('eth_getTransactionReceipt', [setMessageTxHash]);
      if (setMessageReceipt && setMessageReceipt.status !== '0x1') {
        throw new Error('Set message transaction failed');
      }
    }

    // 3. Read updated message
    console.log('\n3. Reading updated message...');
    const getUpdatedMessage = await fetchFromNode('eth_call', [{
      to: receipt.contractAddress,
      data: getMessageSelector
    }, "latest"]);

    const decodedUpdatedMessage = Web3EthAbi.decodeParameter('string', getUpdatedMessage);
    console.log('Updated message:', decodedUpdatedMessage);
  } catch (error) {
    console.error('Error during deployment:', error);
  }
}

main();