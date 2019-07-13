//keep alive
process.on('uncaughtException', function(err) {
  //打印出错误
  console.log(err);
  //打印出错误的调用栈方便调试
  console.log(err.stack);
});

//json
const Schema = require('./schema.js');

function cloneJson(json) {
  return JSON.parse(JSON.stringify(json));
}

function toSetUniq(arr) {
  return Array.from(new Set(arr));
}

//ws
const WebSocket = require('ws');

//crypto
const Crypto = require('crypto');

function hasherSHA512(str) {
  let sha512 = Crypto.createHash("sha512");
  sha512.update(str);
  return sha512.digest('hex');
}

function halfSHA512(str) {
  return hasherSHA512(str).toUpperCase().substr(0, 64);
}

//oxo
const oxoKeyPairs = require("oxo-keypairs");

function strToHex(str) {
  let arr = [];
  let length = str.length;
  for (let i = 0; i < length; i++) {
    arr[i] = (str.charCodeAt(i).toString(16));
  }
  return arr.join('').toUpperCase();
}

function sign(msg, sk) {
  let msgHexStr = strToHex(msg);
  let sig = oxoKeyPairs.sign(msgHexStr, sk);
  return sig;
}

function verifySignature(msg, sig, pk) {
  let hexStrMsg = strToHex(msg);
  try {
    return oxoKeyPairs.verify(hexStrMsg, sig, pk);
  } catch (e) {
    return false;
  }
}

var ActionCode = {
  ServerMessage: 0,
  Declare: 200,
  TweetRequest: 201,
  TweetForward: 202,
  TweetResponse: 203,
  DHPublicKey: 204,
  ChatMessage: 205
};

//message
var MessageCode = {
  JsonSchemaInvalid: 0, //json schema invalid...
  SignatureInvalid: 1, //signature invalid...
  TimestampInvalid: 2, //timestamp invalid...
  BalanceInsufficient: 3, //balance insufficient...
  NewConnectionOpening: 4, //address changed...
  AddressChanged: 5, //new connection with same address is opening...
  ToSelfIsForbidden: 6, //To self is forbidden...
  ToNotExist: 7, //To not exist...

  GatewayDeclareSuccess: 1000 //gateway declare success...
};

function strServerMessage(msgCode) {
  msgJson = { "Action": ActionCode.ServerMessage, "Code": msgCode };
  return JSON.stringify(msgJson);
};

function sendServerMessage(ws, msgCode) {
  ws.send(strServerMessage(msgCode));
};

//client connection
let ClientConns = {};

function fetchClientConnAddress(ws) {
  for (let address in ClientConns) {
    if (ClientConns[address] == ws) {
      return address;
    }
  }
  return null;
};

let ClientServer = null;

//>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
//client listener
function teminateClientConn(ws) {
  ws.close();
  let connAddress = fetchClientConnAddress(ws);
  if (connAddress != null) {
    console.log(`###################LOG################### client disconnect... <${connAddress}>`);
    delete ClientConns[connAddress];
  }
}

function handleClientMessage(message, json) {
  if (json["ActionCode"] == ActionCode.DHPublicKey) {
  } else if (json["ActionCode"] == ActionCode.ChatMessage) {
  } else if (json["ActionCode"] == ActionCode.TweetRequest) {
  } else if (json["ActionCode"] == ActionCode.TweetResponse) {
  } else if (json["ActionCode"] == ActionCode.TweetForward) {
  }
  if(ClientConns[json["To"]] != null){
    ClientConns[json["To"]].send(message);
  }
}

function checkClientMessage(ws, message) {
  console.log(`###################LOG################### Client Message:`);
  console.log(`${message}`);
  let json = Schema.checkClientSchema(message);
  if (json == false) {
    //========================================
    sendServerMessage(ws, MessageCode.JsonSchemaInvalid);
    teminateClientConn(ws);
  } else {
    let sig = json["Signature"];
    delete json["Signature"];
    let tmpMsg = JSON.stringify(json);
    if (verifySignature(tmpMsg, sig, json["PublicKey"])) {
      let address = oxoKeyPairs.deriveAddress(json["PublicKey"]);
      if (ClientConns[address] == ws) {
        handleClientMessage(message, json);
      } else {
        let connAddress = fetchClientConnAddress(ws);
        if (connAddress == null && ClientConns[address] == null) {
          //new connection and new address
          ClientConns[address] = ws;
          console.log(`connection established from client <${address}>`);
          handleClientMessage(message, json);
        } else if (ClientConns[address] != ws && ClientConns[address].readyState == WebSocket.OPEN) {
          //new connection kick old conection with same address
          sendServerMessage(ClientConns[address], MessageCode.NewConnectionOpening);
          ClientConns[address].close();
          ClientConns[address] = ws;
          handleClientMessage(message, json);
        } else if (connAddress != address) {
          //using different address in same connection
          sendServerMessage(ws, MessageCode.AddressChanged);
          teminateClientConn(ws);
        } else {
          ws.send("WTF...");
          teminateClientConn(ws);
        }
      }
    } else {
      //========================================
      sendServerMessage(ws, MessageCode.SignatureInvalid);
      teminateClientConn(ws);
    }
  }
}

function startClientServer() {
  if (ClientServer == null) {
    ClientServer = new WebSocket.Server({
      port: 8888, //to bind on 80, must use 'sudo node main.js'
      clientTracking: true,
      maxPayload: 1024
    });

    ClientServer.on('connection', function connection(ws) {
      ws.on('message', function incoming(message) {
        checkClientMessage(ws, message);
      });

      ws.on('close', function close() {
        let connAddress = fetchClientConnAddress(ws);
        if (connAddress != null) {
          console.log(`client <${connAddress}> disconnect...`);
          delete ClientConns[connAddress];
        }
      });
    });
  }
}

startClientServer();