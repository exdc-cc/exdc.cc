export function EXDC_UTILS() {

  const keyEncAlgo = {
    name: 'RSA-OAEP',
  };
  const payloadKeyEncAlgo = {
    name: 'AES-GCM',
    length: 256,
  };
  const payloadEncAlgo = {
    name: 'AES-GCM',
  };
  
  const generateNewKeyPair = async (
    seed,
  ) => {
      const keyPair = (await window.crypto.subtle.generateKey(
        algo,
        true,
        ['encrypt', 'decrypt'],
      ));
      const kp = {
        publicKey: JSON.stringify(
          await window.crypto.subtle.exportKey(
            'jwk',
            keyPair.publicKey,
          ),
        ),
        privateKey: JSON.stringify(
          await window.crypto.subtle.exportKey(
            'jwk',
            keyPair.privateKey,
          ),
        ),
      };
      return kp;
  }
  
  const getHexFromArrayBuffer = (array) => {
    const hashArray = Array.from(new Uint8Array(array));
    const digest = hashArray
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return digest;
  }
  
  const encryptAesKey = async (key, pubKey) => {
    const k = await window.crypto.subtle.importKey(
      'jwk',
      pubKey,
      algo,
      true,
      ['encrypt'],
    );
    const encoder = new TextEncoder();
    const encoded = encoder.encode(key);
    const encrypted = await window.crypto.subtle.encrypt(
      keyEncAlgo,
      k,
      encoded,
    );
    return getHexFromArrayBuffer(encrypted);
  }
  
  const decryptAesKey = async(
    key,
    privateKey,
  ) => {
    try {
      const k = await window.crypto.subtle.importKey(
        'jwk',
        privateKey,
        algo,
        true,
        ['decrypt'],
      );
      const encoded = hexToArrayBuffer(key);
      const decrypted = await window.crypto.subtle.decrypt(
        keyEncAlgo,
        k,
        encoded,
      );
      // console.info('decryptedKey', decrypted);
      const decoder = new TextDecoder();
      const decode = JSON.parse(decoder.decode(decrypted, {}));
      // console.info('textdecoder decode', decode);
      const aesKey = await window.crypto.subtle.importKey(
        'jwk',
        decode,
        payloadKeyEncAlgo,
        true,
        ['encrypt', 'decrypt'],
      );
      return aesKey;
    } catch (err) {
      console.error('decryptkey error', err);
      throw err;
    }
  }
  
  async function decryptPayload(
    k,
    payload,
    ivb,
  ) {
    const iv = hexToArrayBuffer(ivb);
    const encoded = hexToArrayBuffer(payload);
    // console.info('encoded into buffer', encoded);
    const decrypted = await window.crypto.subtle.decrypt(
      {...payloadEncAlgo, iv},
      k,
      encoded,
    );
    // console.info('decryptedPayload', decrypted);
    const decoder = new TextDecoder();
    const decode = decoder.decode(decrypted);
    return decode;
  }
  
  async function decryptPayloadRaw(
    k,
    payload,
    ivb,
  ) {
    const iv = hexToArrayBuffer(ivb);
    const encoded = payload;
    // console.info('encoded into buffer', encoded);
    const decrypted = await window.crypto.subtle.decrypt(
      {...payloadEncAlgo, iv},
      k,
      encoded,
    );
    return decrypted;
    // console.info('decryptedPayload', decrypted);
    // const decoder = new TextDecoder();
    // const decode = decoder.decode(decrypted);
    // return decode;
  }
  async function generateAesKey() {
    const key = await window.crypto.subtle.generateKey(
      payloadKeyEncAlgo,
      true,
      ['encrypt', 'decrypt'],
    );
    // console.info('aeskey', key);
    const kp = JSON.stringify(
      await window.crypto.subtle.exportKey('jwk', key),
    );
    return { kp, key };
  }
  
  async function encryptPayload(k, payload) {
    try {
      const encoder = new TextEncoder();
      const encoded = encoder.encode(payload);
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await window.crypto.subtle.encrypt(
        { ...payloadEncAlgo, iv },
        k,
        encoded,
      );
      // console.info('encrypted', encrypted);
      return {
        encryptedPayload: await getHexFromArrayBuffer(encrypted),
        iv: await getHexFromArrayBuffer(iv.buffer),
      };
    } catch (err) {
      console.error('encrypt payload err', err);
      throw err;
    }
  }
  
  const algo = {
    name: 'RSA-OAEP',
    modulusLength: 4096,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  };
  

  const getKeyMaterial = (password) => {
    const enc = new TextEncoder();
    return window.crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      "PBKDF2",
      false,
      ["deriveBits", "deriveKey"],
    );
  }

  const hexToArrayBuffer = (hex) => {
    const buff = new Uint8Array(
      (hex.match(/[\da-f]{2}/gi)).map(function (h) {
        return parseInt(h, 16);
      }),
    );
    return buff;
  }

  const decrypt = async (password, json) => {
    const dec = new TextDecoder()
    const data = hexToArrayBuffer(json.encrypted)
    const iv = hexToArrayBuffer(json.iv)
    const keyMaterial = await getKeyMaterial(password);
    const salt = hexToArrayBuffer(json.salt)
    const key = await window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
    // console.info("before decrypt", key, data, iv)
    const decrypted = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return JSON.parse(dec.decode(decrypted))
  }


  const hex = (arrayBuffer) => {
      const buff = new Uint8Array(arrayBuffer);
      const hexOctets = []; // new Array(buff.length) is even faster (preallocates necessary array size), then use hexOctets[i] instead of .push()

      for (let i = 0; i < buff.length; ++i)
          hexOctets.push(byteToHex[buff[i]]);

      return hexOctets.join("");
  }

  const decryptPart = async (f) => {
    const link = "https://ipfs.io/ipfs/"+f.fileLink.IpfsHash
    const efile = await (await fetch(link)).arrayBuffer()
    // console.info(efile)
    const decrypted = await utils.decryptPayloadRaw(decryptedKey, efile, f.iv)
    // console.info('decrypted', decrypted)
    return decrypted;
  }

  const spliceBuffers = (buffers) => {

    const len = buffers.map((buffer) => buffer.byteLength).reduce((prevLength, curr) => {return prevLength + curr}, 0);

    const tmp = new Uint8Array(len);

    let bufferOffset = 0;

    for(var i=0; i < buffers.length; i++) {
      tmp.set(new Uint8Array(buffers[i]), bufferOffset);
      bufferOffset += buffers[i].byteLength;
    }

    return tmp;
  }

  const erc20abi = [
    // Read-Only Functions
    'function balanceOf(address owner) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',

    // Authenticated Functions
    'function transfer(address to, uint amount) returns (bool)',

    // Events
    'event Transfer(address indexed from, address indexed to, uint amount)',
  ];

  const exchangeContractAbi = [
    'function userData() view returns (bytes)',
    'function wp() view returns (address)',
    'function decimals() view returns (uint8)',
    'function buyerOrders(address address) view returns (address)',
    'function createBuyItemsContract(uint contractValue, uint contractDivider, address paymentContract) external returns (address)'
  ]

  const buyContractAbi = [
    'function confirmPurchase(bytes data) external',
    'function confirmReceived() external',
    'function rateSeller(uint buyerRating) external',
    'function balanceOfContract() view returns (uint)',
    'function price() view returns (uint)',
    'function state() view returns (uint)',
    'function deliveryData() view returns (bytes)'
  ]


  const exchangeTokenAddress = (n) =>
    networkToContract[n];

  const networkToContract = {
    80002: '0x863D66d6692FE5D2e422DF771750cb14295a4D02',
    97: '0x33011291740eD60C5F083F57c38439afB30346Bc',
    137: '0xD75dc076cDB0E692214371924B6640c545F688C6',
    56: '0xAbC58cfbB3c71d92665b96125e05c20dC4aCe51A'
  };

  const networks = {
    1: {
      chainId: '0x1',
      chainName: 'Ethereum Mainnet',
      nativeCurrency: {
        name: 'Ethereum',
        symbol: 'ETH',
        decimals: 18,
      },
      rpcUrls: ['https://eth.llamarpc.com'],
      blockExplorerUrls: ['https://etherscan.io'],
    },
    137: {
      chainId: '0x89',
      chainName: 'Polygon Mainnet',
      nativeCurrency: {
        name: 'MATIC',
        symbol: 'MATIC',
        decimals: 18,
      },
      rpcUrls: ['https://polygon-mainnet.infura.io'],
      blockExplorerUrls: ['https://polygonscan.com/'],
    },
    324: {
      chainId: '0x144',
      chainName: 'zkSync Mainnet',
      nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
      },
      rpcUrls: ['https://mainnet.era.zksync.io'],
      blockExplorerUrls: ['https://era.zksync.network/'],
    },
    56: {
      chainId: '0x38',
      chainName: 'BNB Smart Chain',
      nativeCurrency: {
        name: 'BNB',
        symbol: 'BNB',
        decimals: 18,
      },
      rpcUrls: ['https://bsc-dataseed.binance.org/'],
      blockExplorerUrls: ['https://bscscan.com'],
    },
    97: {
      chainId: '0x61',
      chainName: 'BNB Smart Chain Testnet',
      nativeCurrency: {
        name: 'TBNB',
        symbol: 'TBNB',
        decimals: 18,
      },
      rpcUrls: ['https://data-seed-prebsc-1-s1.binance.org:8545/'],
      blockExplorerUrls: ['https://testnet.bscscan.com'],
    },
    80002: {
      chainId: '0x13882',
      chainName: 'Polygon Amoy Testnet',
      nativeCurrency: {
        name: 'MATIC',
        symbol: 'MATIC',
        decimals: 18,
      },
      rpcUrls: ['https://rpc-amoy.polygon.technology'],
      blockExplorerUrls: ['https://www.oklink.com/amoy'],
    },
  };

  return {
    networks,
    networkToContract,
    hex,
    hexToArrayBuffer,
    erc20abi,
    decrypt,
    exchangeContractAbi,
    buyContractAbi,
    spliceBuffers,
    encryptAesKey,
    encryptPayload,
    decryptPayload,
    decryptPayloadRaw,
    generateNewKeyPair,
    decryptPart,
    generateAesKey,
    exchangeTokenAddress
  }
}