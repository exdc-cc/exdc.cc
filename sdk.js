import {EXDC_UTILS} from "./util.js"

function EXDC_SDK(params = {}) {

  let categories = [
    // 'All', 'Electronics', 'Clothing', 'Books', 'Home & Garden', 'Sports'
  ];
  // Get USDT balance (replace with actual USDT contract address on BSC Testnet)
  
  const utils = new EXDC_UTILS()
  let products = [];
  let orderKey;
  let provider, signer, address;
  const n = params.n || 137
  let erc20ContractAddress = utils.exchangeTokenAddress(n);
  let decimals = 18;
  let storedJSON = {};
  const address0 = '0x0000000000000000000000000000000000000000';
  
  const getExchangeContractData = async (q) => {
    const exchangeContract = new ethers.Contract(q, utils.exchangeContractAbi, provider);
    const data = await exchangeContract.userData();
    erc20ContractAddress = await exchangeContract.wp()
    decimals = await exchangeContract.decimals()
    const json = await processExchangeContractData(data)
    storedJSON = json;
    if(json.encrypted) {
      return json;
    } else {
      initContent(json)
    }
    return json;
  }
  
  const inputPassword = async (password, json = storedJSON) => {
    const decr = await utils.decrypt(password, json)
    initContent(decr)
    return decr;
  }

  const processExchangeContractData = async (data) => {
    const abiCoder = new ethers.AbiCoder();
    try {
      const decode = await abiCoder.decode(["string"], data)
      return JSON.parse(decode);
    } catch (err) {
      console.error(err)
    }
  }

  async function rateSeller(rating) {
    const order = await getCurrentOrder()
    await (await order.rateSeller(rating)).wait(1)
  }
  
  
  const generateOrderBody = async (nload) => {
    const abiCoder = new ethers.AbiCoder();
    const aeskey = await generateAesKey();
    const keypair = await generateNewKeyPair();
    nload.publicKey = keypair.publicKey;
    const payload = await encryptPayload(aeskey.key, JSON.stringify(nload))
    localStorage.setItem("easkp", JSON.stringify(keypair))
    const encKey = await encryptAesKey(aeskey.kp, orderKey)
    const strData = JSON.stringify({ encKey, payload })
    const data = abiCoder.encode(["string"], [strData])
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(keypair, null, 2)], {
      type: "text/plain"
    }));
    a.setAttribute("download", "orderKey.json");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return data;
  }
  
  const getCurrentOrder = async (q) => {
    const signer = await provider.getSigner();
    const shop = new ethers.Contract(q, utils.exchangeServiceABI, signer);
    const prevOrder = await shop.buyerOrders(address)
    // console.info('currentOrder', prevOrder)
    if (prevOrder !== address0) {
      const contract = new ethers.Contract(prevOrder, utils.exchangeContractABI, signer);
      contract.contractAddress = prevOrder;
      return contract;
    }
    return undefined;
  }
  
  const buyItemFromShop = async (
    q,
    value,
    deliveryAddress,
    cart
  ) => {
    const signer = await provider.getSigner();
    const shop = new ethers.Contract(q, utils.exchangeServiceABI, signer);
    const coin = await shop.wp();
    const nload = {cart, deliveryAddress}
    // console.info('nload', nload)
    let contract;
    try {
      contract = await getCurrentOrder()
      if (contract) {
        const state = ethers.formatUnits(await contract.state(), 10) * 10
        if(state > 2) {
          return true;
        }
        const {contractAddress} = contract;
        const balance = ethers.formatUnits(await contract.balanceOfContract(), decimals)
        const price = ethers.formatUnits(await contract.price(), decimals)
        // console.info("balance", balance, price, contract, contractAddress)
        if (balance < price) {
          await sendCoin(coin, contractAddress, price - balance);
        }
      } else {
        // console.info('creating a new contract', value)
        const contractTx = (await (
          await (
            await shop.createBuyItemsContract(value, 1, q)
          ).wait(1)
        ));
        contract = await getCurrentOrder()
        const trx = await sendCoin(coin, contract.contractAddress, value);
      }
      const data = await generateOrderBody(nload)
      const purchase = await (await contract.confirmPurchase(data)).wait(1);
      return purchase;
    } catch (err) {
      console.error(err)
      alert(err?.data?.message || err.message || err)
    }
    
    const purchase = await contract.confirmPurchase(data);
    return trx;
  };
  
  async function sendCoin(
    coin,
    to,
    valueNum,
  ) {
    const erc20 = new ethers.Contract(coin, utils.erc20abi, await provider.getSigner());
    const amount = ethers.parseUnits(
      valueNum.toString(),
      decimals,
    );
    const tx = await (await erc20.transfer(to, amount)).wait(1);
    return tx.hash;
  }
  
  
  const byteToHex = [];
  
  for (let n = 0; n <= 0xff; ++n)
  {
      const hexOctet = n.toString(16).padStart(2, "0");
      byteToHex.push(hexOctet);
  }
  const receiveOrder = async () => {
    try {
      const order = await getCurrentOrder()
      const state = ethers.formatUnits(await order.state(), 1) * 10
      if(state < 4) {
        throw new Error("Waiting for the order to be delivered")
        return;
      }
      const abiCoder = new ethers.AbiCoder()
      const deliveryData = JSON.parse(abiCoder.decode(["string"], await order.deliveryData())[0])
      let localKey = localStorage.getItem("easkp")
  
      // console.info('deliveryData', deliveryData, localKey)
      const decryptDeliveryData = async () => {
        try {

          const key = JSON.parse(JSON.parse(localKey).privateKey)
          const decryptedKey = await utils.decryptAesKey(deliveryData.encryptedKey, key)
          const payload = JSON.parse(await utils.decryptPayload(decryptedKey, deliveryData.encryptedPayload, deliveryData.iv))
          // console.info('dec payload', payload)
          await Promise.all(payload.map(async (f, i)=>{
            let decrypted = []
            if(f.name) {
              decrypted = new File([await utils.decryptPart(f)], {name:f.name})
            } else {
              const parts  = await Promise.all(f.map(async ff=>({...ff, decrypted: await utils.decryptPart(ff)})))
              parts.sort((a,b)=>a.partId - b.partId)
              const pmap = utils.spliceBuffers(parts.map(p=>p.decrypted))
              // console.info('parts dec', pmap)
              decrypted = new File([pmap], {name: parts[0].name})
            }
  
            const file = decrypted
            const a = document.createElement("a");
            a.href = URL.createObjectURL(file);
            a.setAttribute("download", f.name || f[0].name);
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }))
          // console.info('decrypted payload', payload)
        } catch(err) {
          console.error('decrypt error', err.message)
          alert(err?.data?.message || err?.message || err)
        }
      }
      if(localKey) {
        await decryptDeliveryData()
      }
      else {
        localKey = prompt('please attach the decryption key', '')
        await decryptDeliveryData()
      }
      await order.confirmReceived()
      return {succes:true};
    } catch(err) {
      throw err
      // alert(err?.data?.message || err?.message || err)
    }
  }
  
  
  async function checkMetaMask() {
    if (typeof window.ethereum !== 'undefined') {
      console.log('MetaMask is installed!');
      try {
        // Request account access
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        provider = new ethers.BrowserProvider(window.ethereum)
        signer = await provider.getSigner();
        address = signer.address;
  
        // Switch network
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [utils.networks[n].chainId], 
          });
  
        } catch (switchError) {
          // This error code indicates that the chain has not been added to MetaMask.
          if (switchError.code === 4902) {
            try {
              await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [utils.networks[n]]
              });
            } catch (addError) {
              console.error('Failed to add the BSC Testnet:', addError);
            }
          }
        }
        return getWalletInfo()
        // await updateWalletInfo();
      } catch (error) {
        console.error('Failed to connect to MetaMask:', error);
      }
    } else {
      throw 'MetaMask is not installed!'
    }
  }

  const getStorageAddress = async () => {
    const token = await connectToExchangeToken();
    const storageCategory = await token.categories('storage', 0);
    const storageAddress = storageCategory;
    return storageAddress;
  };

  const getCryptoFansAddress = async () => {
    const token = await connectToExchangeToken();
    console.info("token", token)
    const storageCategory = await token.categories('cryptofans', 0);
    const storageAddress = storageCategory;
    return storageAddress;
  };

  const connectToExchangeToken = async () =>
    new ethers.Contract(
      utils.exchangeTokenAddress(n),
      utils.exchangeTokenABI,
      signer,
    );

  const connectToExchangeService = async (address) =>
    new ethers.Contract(
      address,
      utils.exchangeServiceABI,
      signer,
    );
  

  const connectToExchangeContract = async (address) =>
    new ethers.Contract(
      address,
      utils.exchangeContractABI,
      signer,
    );
  
  const getServicePaymentInfo = async (
    serviceAddress,
  ) => {
    const shop = await connectToExchangeService(serviceAddress);
    const coin = await shop.wp();
    const sig = signer
    const erc20 = new ethers.Contract(coin, utils.erc20abi, sig);
    const decimals = ethers.toBigInt(10) ** (await erc20.decimals());
    const price = await shop.defaultPrice();
    const subInterval = ethers.toNumber(await shop.requiresSubs());
    const value = ethers.toNumber(price / decimals);
    return {
      coinName: await erc20.symbol(),
      coinAddress: coin,
      subInterval,
      value,
    };
  };

  const checkServiceValid = async (serviceAddress) => {
    try {
      const shop = await connectToExchangeService(serviceAddress);
      const userContractAddress = await shop.userContracts(
        (
          signer
        ).address,
      );
      const isValid = await shop.validateSubscription(
        userContractAddress,
      );
      return isValid;
    } catch (err) {
      return false;
    }
  };


  const buyServiceSmart = async (serviceAddress) => {
    try {
      const shop = await connectToExchangeService(serviceAddress);
      const excd = await connectToExchangeToken();
      const coin = await shop.wp();
      const sig = signer;
      const erc20 = new ethers.Contract(coin, utils.erc20abi, sig);
      const decimals = ethers.toBigInt(10) ** (await erc20.decimals());
      const price = await shop.defaultPrice();
      const subInterval = await shop.requiresSubs();
      const value = ethers.toNumber(price / decimals);
      const key = await getPremiumKey();
      const {publicKey} = key.keyPair;
      const abiCoder = new ethers.AbiCoder();
      const keyBlob = abiCoder.encode(
        ['string'],
        [JSON.stringify({publicKey})],
      );
      const prevContractAddress = await shop.userContracts(sig.address);
      console.info('prevContractAddress', prevContractAddress);
      const createContract = async () => {
        await (
          (await excd.createServiceUserContract(
            value,
            shop.wp(),
            1,
            shop.provider(),
            shop.operator(),
            0,
            false,
            0,
            serviceAddress,
            serviceAddress,
          ))
        ).wait(1);

        const contractAddress = await shop.userContracts(sig.address);
        const contract = await connectToExchangeService(
          contractAddress,
        );
        return {contract, contractAddress};
      };
      if (prevContractAddress === address0) {
        const {contract, contractAddress} = await createContract();
        await sendCoin(coin, contractAddress, value);
        await (await contract.activateService(keyBlob)).wait(1);
      } else {
        let contract = await connectToExchangeService(
          prevContractAddress,
        );
        const contractPrice = await contract.defaultPrice();
        const contractSubInterval = await contract.requiresSubs();
        if (
          contractPrice !== price ||
          contractSubInterval !== subInterval
        ) {
          let {contract, contractAddress} = await createContract();
          await sendCoin(coin, contractAddress, value);
          await (await contract.activateService(keyBlob)).wait(1);
          return;
        }
        const balance = await contract.balanceOfContract();
        if (balance >= price) {
          await (await contract.activateService(keyBlob)).wait(1);
        } else {
          await sendCoin(coin, prevContractAddress, value);
          await (await contract.activateService(keyBlob)).wait(1);
        }
      }
    } catch (err) {
      console.error('buyservicesmart error', err);
    }
  };

  async function getWalletInfo() {
    if (address) {
      const balance = await provider.getBalance(address);
      const etherBalance = ethers.formatEther(balance);
      
      const usdtContract = new ethers.Contract(erc20ContractAddress, utils.erc20abi, provider);
      const usdtBalance = await usdtContract.balanceOf(address);
      const symbol = await usdtContract.symbol()
      const usdtBalanceFormatted = ethers.formatUnits(usdtBalance, decimals); // Assuming 18 decimals, adjust if different
  
      return {
        textContent:`Address: ${address.slice(0, 6)}...${address.slice(-4)} | ETH: ${parseFloat(etherBalance).toFixed(4)} | ${symbol}: ${parseFloat(usdtBalanceFormatted).toFixed(2)}`,
        wrapperBalance: usdtBalance,
        wrapperContract: usdtContract,
        etherBalance,
        symbol
      }
    } else {
      return {textContent: 'Wallet not connected'}
    }
  }
  
  
  function initIndex(decryptedData) {
    console.info('decrypteData', decryptedData)
    products = decryptedData.shopProducts
    categories = ["All", ...new Set(products.map(i => i.category))]
    orderKey = typeof decryptedData.ordersPubKey === "string" ? JSON.parse(decryptedData.ordersPubKey) : decryptedData.ordersPubKey
  }
  
  return {
    ...utils,
    checkMetaMask,
    initIndex,
    getWalletInfo,
    receiveOrder,
    buyItemFromShop,
    getCurrentOrder,
    rateSeller,
    getExchangeContractData,
    categories,
    products,
    buyServiceSmart,
    checkServiceValid,
    getServicePaymentInfo,
    inputPassword,
    getStorageAddress,
    getCryptoFansAddress,
    erc20ContractAddress,
    address,
    connectToExchangeContract
  };
}
window.EXDC_SDK = EXDC_SDK