const oxoKeyPairs = require("oxo-keypairs")

//config
//const SelfURL = "ws://127.0.0.1:3000"
//standalone server
//const Seed = oxoKeyPairs.generateSeed("obeTvR9XDbUwquA6JPQhmbgaCCaiFa2rvf", 'secp256k1')
const SelfURL = "wss://ru.oxo-chat-server.com"
const Seed = "xxJTfMGZPavnqHhcEcHw5ToPCHftw"
const OtherServer = []

//interconnect servers
//const Seed = "xp1jB6s7H1WjXrpUSUHb3fv12Fdge"
//const OtherServer = [{ "URL": "ws://127.0.0.1:3333", "Address": "o5gVGxqPFCvzTAQ5BpMnwtS8xYvnXQDJoU" }]

//keep alive
process.on('uncaughtException', function (err) {
  //打印出错误
  console.log(err)
  //打印出错误的调用栈方便调试
  console.log(err.stack)
})

//json
const Schema = require('./schema.js')

function cloneJson(json) {
  return JSON.parse(JSON.stringify(json))
}

function toSetUniq(arr) {
  return Array.from(new Set(arr))
}

//ws
const WebSocket = require('ws')

//crypto
const Crypto = require('crypto')

function hasherSHA512(str) {
  let sha512 = Crypto.createHash("sha512")
  sha512.update(str)
  return sha512.digest('hex')
}

function halfSHA512(str) {
  return hasherSHA512(str).toUpperCase().substr(0, 64)
}

function quarterSHA512(str) {
  return hasherSHA512(str).toUpperCase().substr(0, 32);
}

//oxo

function strToHex(str) {
  let arr = []
  let length = str.length
  for (let i = 0; i < length; i++) {
    arr[i] = (str.charCodeAt(i).toString(16))
  }
  return arr.join('').toUpperCase()
}

function sign(msg, sk) {
  let msgHexStr = strToHex(msg)
  let sig = oxoKeyPairs.sign(msgHexStr, sk)
  return sig
}

function verifySignature(msg, sig, pk) {
  let hexStrMsg = strToHex(msg)
  try {
    return oxoKeyPairs.verify(hexStrMsg, sig, pk)
  } catch (e) {
    return false
  }
}

function VerifyJsonSignature(json) {
  let sig = json["Signature"]
  delete json["Signature"]
  let tmpMsg = JSON.stringify(json)
  if (verifySignature(tmpMsg, sig, json.PublicKey)) {
    json["Signature"] = sig
    return true
  } else {
    console.log('signature invalid...')
    return false
  }
}

let ActionCode = {
  "Declare": 100,
  "ObjectResponse": 101,

  "BulletinRandom": 200,
  "BulletinRequest": 201,
  "BulletinFileRequest": 202,

  "ChatDH": 301,
  "ChatMessage": 302,
  "ChatSync": 303,
  "PrivateFileRequest": 304,

  "GroupRequest": 401,
  "GroupManageSync": 402,
  "GroupDH": 403,
  "GroupMessageSync": 404,
  "GroupFileRequest": 405
}

//message
const MessageCode = {
  "JsonSchemaInvalid": 0, //json schema invalid...
  "SignatureInvalid": 1, //signature invalid...
  "TimestampInvalid": 2, //timestamp invalid...
  "BalanceInsufficient": 3, //balance insufficient...
  "NewConnectionOpening": 4, //address changed...
  "AddressChanged": 5, //new connection with same address is opening...
  "ToSelfIsForbidden": 6, //To self is forbidden...
  "ToNotExist": 7, //To not exist...

  "GatewayDeclareSuccess": 1000 //gateway declare success...
}

const ObjectType = {
  "Bulletin": 101,
  "BulletinFile": 102,

  "PrivateFile": 201,

  "GroupManage": 301,
  "GroupMessage": 302,
  "GroupFile": 303
}

function strServerMessage(msgCode) {
  msgJson = { "Action": ActionCode["ServerMessage"], "Code": msgCode }
  return JSON.stringify(msgJson)
}

function sendServerMessage(ws, msgCode) {
  ws.send(strServerMessage(msgCode))
}

//client connection
let ClientConns = {}

function fetchClientConnAddress(ws) {
  for (let address in ClientConns) {
    if (ClientConns[address] == ws) {
      return address
    }
  }
  return null
}

let ClientServer = null

//>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
//client listener
function teminateClientConn(ws) {
  ws.close()
  let connAddress = fetchClientConnAddress(ws)
  if (connAddress != null) {
    console.log(`###################LOG################### client disconnect... <${connAddress}>`)
    delete ClientConns[connAddress]
  }
}

const sqlite3 = require('sqlite3')

let DB = null
let BulletinCount = 0
let PageSize = 10
let PageCount = BulletinCount / PageSize
let PageLinks = ''

let BulletinAccounts = []

function initDB() {
  //建库：数据库名为账号地址
  DB = new sqlite3.Database(`./cache.db`)
  //建表
  DB.serialize(() => {
    //为账号地址起名
    DB.run(`CREATE TABLE IF NOT EXISTS BULLETINS(
            hash VARCHAR(32) PRIMARY KEY,
            pre_hash VARCHAR(32),
            next_hash VARCHAR(32),
            address VARCHAR(35) NOT NULL,
            sequence INTEGER NOT NULL,
            content TEXT NOT NULL,
            quote TEXT NOT NULL,
            json TEXT NOT NULL,
            signed_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL)`, err => {
      if (err) {
        console.log(err)
      }
    })

    DB.run(`CREATE TABLE IF NOT EXISTS QUOTES(
      main_hash VARCHAR(32) NOT NULL,
      quote_hash VARCHAR(32) NOT NULL,
      address VARCHAR(35) NOT NULL,
      sequence INTEGER NOT NULL,
      content TEXT NOT NULL,
      signed_at INTEGER NOT NULL,
      PRIMARY KEY ( main_hash, quote_hash ) )`, err => {
      if (err) {
        console.log(err)
      }
    })
  })

  let SQL = `SELECT * FROM BULLETINS ORDER BY created_at DESC`
  DB.all(SQL, (err, items) => {
    if (err) {
      console.log(err)
    } else {
      BulletinCount = items.length
      PageCount = BulletinCount / PageSize + 1
      PageLinks = ''
      let PageLinkArray = []
      if (PageCount > 1) {
        for (let i = 1; i <= PageCount; i++) {
          PageLinkArray.push(`<a href="/bulletins?page=${i}">${i}</a>`)
        }
        PageLinks = PageLinkArray.join(' ')
      }
    }
  })

  SQL = `SELECT * FROM BULLETINS GROUP BY address`
  DB.all(SQL, (err, items) => {
    if (err) {
      console.log(err)
    } else {
      for (let i = 0; i < items.length; i++) {
        BulletinAccounts.push({ 'address': items[i].address, 'sequence': 0 })
      }
    }
  })
}

initDB()

////////hard copy from client<<<<<<<<
const crypto = require("crypto")

const keypair = oxoKeyPairs.deriveKeypair(Seed)
const Address = oxoKeyPairs.deriveAddress(keypair.publicKey)
const PublicKey = keypair.publicKey
const PrivateKey = keypair.privateKey

function sign(msg, sk) {
  let msgHexStr = strToHex(msg);
  let sig = oxoKeyPairs.sign(msgHexStr, sk);
  return sig;
}

function GenBulletinRequest(address, sequence, to) {
  let json = {
    "Action": ActionCode["BulletinRequest"],
    "Address": address,
    "Sequence": sequence,
    "To": to,
    "Timestamp": Date.now(),
    "PublicKey": PublicKey
  }
  let sig = sign(JSON.stringify(json), PrivateKey)
  json.Signature = sig
  let strJson = JSON.stringify(json)
  return strJson
}

function GenObjectResponse(object, to) {
  let json = {
    "Action": ActionCode.ObjectResponse,
    "Object": object,
    "To": to,
    "Timestamp": Date.now(),
    "PublicKey": PublicKey,
  }
  let sig = sign(JSON.stringify(json), PrivateKey)
  json.Signature = sig
  let strJson = JSON.stringify(json)
  return strJson
}

function GenDeclare() {
  //send declare to server
  let json = {
    "Action": ActionCode["Declare"],
    "Timestamp": new Date().getTime(),
    "PublicKey": PublicKey
  }
  let sig = sign(JSON.stringify(json), PrivateKey)
  json.Signature = sig
  let strJson = JSON.stringify(json)
  return strJson
}
////////hard copy from client>>>>>>>>

function CacheBulletin(bulletin) {
  let timestamp = Date.now()
  let hash = quarterSHA512(JSON.stringify(bulletin))
  let address = oxoKeyPairs.deriveAddress(bulletin.PublicKey)
  let SQL = `INSERT INTO BULLETINS (hash, pre_hash, address, sequence, content, quote, json, signed_at, created_at)
            VALUES ('${hash}', '${bulletin.PreHash}', '${address}', '${bulletin.Sequence}', '${bulletin.Content}', '${JSON.stringify(bulletin.Quote)}', '${JSON.stringify(bulletin)}', ${bulletin.Timestamp}, ${timestamp})`
  DB.run(SQL, err => {
    if (err) {
      console.log(err)
    } else {
      BulletinCount = BulletinCount + 1
      PageCount = BulletinCount / PageSize + 1
      PageLinks = ''
      let PageLinkArray = []
      if (PageCount > 1) {
        for (let i = 1; i <= PageCount; i++) {
          PageLinkArray.push(`<a href="/bulletins?page=${i}">${i}</a>`)
        }
        PageLinks = PageLinkArray.join(' ')
      }

      //update account sequence
      for (let i = 0; i < BulletinAccounts.length; i++) {
        if (BulletinAccounts[i].address == address && BulletinAccounts[i].sequence < bulletin.sequence) {
          BulletinAccounts[i].sequence = bulletin.sequence
        }
      }

      //update pre_bulletin's next_hash
      SQL = `UPDATE BULLETINS SET next_hash = '${hash}' WHERE hash = "${bulletin.PreHash}"`
      DB.run(SQL, (err) => {
        if (err) {
          console.log(err)
        }
      })

      //update quote
      bulletin.Quotes.forEach(quote => {
        SQL = `INSERT INTO QUOTES (main_hash, quote_hash, address, sequence, content, signed_at)
               VALUES ('${quote.Hash}', '${hash}', '${address}', '${bulletin.Sequence}', '${bulletin.Content}', ${bulletin.Timestamp})`
        DB.run(SQL, (err) => {
          if (err) {
            console.log(err)
          }
        })
      });

      //Brocdcast to OtherServer
      for (let i in OtherServer) {
        let ws = ClientConns[OtherServer[i]["Address"]]
        if (ws != undefined && ws.readyState == WebSocket.OPEN) {
          ws.send(GenObjectResponse(bulletin, OtherServer[i]["Address"]))
        }
      }
    }
  })
}

function handleClientMessage(message, json) {
  if (json["To"] != null && ClientConns[json["To"]] != null && ClientConns[json["To"]].readyState == WebSocket.OPEN) {
    //forward message
    ClientConns[json["To"]].send(message)

    //cache bulletin
    if (json["Action"] == ActionCode["ObjectResponse"] && json["Object"]["ObjectType"] == ObjectType["Bulletin"]) {
      //console.log(`###################LOG################### Client Message:`)
      //console.log(message)
      CacheBulletin(json["Object"])
    }
  }

  if (json["Action"] == ActionCode["BulletinRequest"]) {
    //send cache bulletin
    let SQL = `SELECT * FROM BULLETINS WHERE address = "${json["Address"]}" AND sequence = "${json["Sequence"]}"`
    DB.get(SQL, (err, item) => {
      if (err) {
        console.log(err)
      } else {
        if (item != null) {
          let address = oxoKeyPairs.deriveAddress(json["PublicKey"])
          ClientConns[address].send(item.json)
        }
      }
    })
  } else if (json["Action"] == ActionCode["BulletinRandom"]) {
    console.log("=====================random")
    //send random bulletin
    let SQL = `SELECT * FROM BULLETINS ORDER BY RANDOM() LIMIT 1`
    DB.get(SQL, (err, item) => {
      if (err) {
        console.log(err)
      } else {
        if (item != null) {
          let address = oxoKeyPairs.deriveAddress(json["PublicKey"])
          ClientConns[address].send(item.json)
        }
      }
    })
  } else if (json["To"] == Address && json["Action"] == ActionCode["ObjectResponse"] && json["Object"]["ObjectType"] == ObjectType["Bulletin"]) {
    CacheBulletin(json["Object"])
    //fetch more bulletin
    let address = oxoKeyPairs.deriveAddress(json["Object"].PublicKey)
    if (ClientConns[address] != null && ClientConns[address].readyState == WebSocket.OPEN) {
      let msg = GenBulletinRequest(address, json["Object"].Sequence + 1, address)
      ClientConns[address].send(msg)
    }
  }
}

function checkClientMessage(ws, message) {
  console.log(`###################LOG################### Client Message:`)
  console.log(`${message}`)
  let json = Schema.checkClientSchema(message)
  if (json == false) {
    //json格式不合法
    sendServerMessage(ws, MessageCode["JsonSchemaInvalid"])
    // console.log(`json格式不合法`)
    teminateClientConn(ws)
  } else {
    let address = oxoKeyPairs.deriveAddress(json["PublicKey"])
    if (ClientConns[address] == ws) {
      //连接已经通过"声明消息"校验过签名
      handleClientMessage(message, json)
    } else {
      let connAddress = fetchClientConnAddress(ws)
      if (connAddress != null && connAddress != address) {
        //using different address in same connection
        sendServerMessage(ws, MessageCode["AddressChanged"])
        teminateClientConn(ws)
      } else {
        if (!VerifyJsonSignature(json)) {
          //"声明消息"签名不合法
          sendServerMessage(ws, MessageCode["SignatureInvalid"])
          teminateClientConn(ws)
          return
        }

        if (json.Timestamp + 60000 < Date.now()) {
          //"声明消息"生成时间过早
          sendServerMessage(ws, MessageCode["TimestampInvalid"])
          teminateClientConn(ws)
          return
        }

        if (connAddress == null && ClientConns[address] == null) {
          //new connection and new address
          //当前连接无对应地址，当前地址无对应连接，全新连接
          console.log(`connection established from client <${address}>`)
          ClientConns[address] = ws
          //handleClientMessage(message, json)
          let SQL = `SELECT * FROM BULLETINS WHERE address = "${address}" ORDER BY sequence DESC`
          DB.get(SQL, (err, item) => {
            if (err) {
              console.log(err)
            } else {
              let sequence = 1
              if (item != null) {
                sequence = item.sequence + 1
              }
              let msg = GenBulletinRequest(address, sequence, address)
              ClientConns[address].send(msg)
            }
          })
        } else if (ClientConns[address] != ws && ClientConns[address].readyState == WebSocket.OPEN) {
          //new connection kick old conection with same address
          //当前地址有对应连接，断开旧连接，当前地址对应到当前连接
          sendServerMessage(ClientConns[address], MessageCode["NewConnectionOpening"])
          ClientConns[address].close()
          ClientConns[address] = ws
          //handleClientMessage(message, json)
        } else {
          ws.send("WTF...")
          teminateClientConn(ws)
        }
      }
    }
  }
}

function startClientServer() {
  if (ClientServer == null) {
    ClientServer = new WebSocket.Server({
      port: 3000, //to bind on 80, must use 'sudo node main.js'
      clientTracking: true,
      maxPayload: 150 * 1024
    })

    ClientServer.on('connection', function connection(ws) {
      ws.on('message', function incoming(message) {
        checkClientMessage(ws, message)
      })

      ws.on('close', function close() {
        let connAddress = fetchClientConnAddress(ws)
        if (connAddress != null) {
          console.log(`client <${connAddress}> disconnect...`)
          delete ClientConns[connAddress]
        }
      })
    })
  }
}

startClientServer()

function keepOtherServerConn() {
  let notConnected = []
  for (let i in OtherServer) {
    if (ClientConns[OtherServer[i]["Address"]] == undefined) {
      notConnected.push(OtherServer[i])
    }
  }

  if (notConnected.length == 0) {
    return
  }

  let random = Math.floor(Math.random() * (notConnected.length))
  let randomServerUrl = notConnected[random]["URL"]
  if (randomServerUrl != null) {
    console.log(`keepOtherServerConn connecting to StaticCounter ${randomServerUrl}`)
    try {
      var ws = new WebSocket(randomServerUrl)

      ws.on('open', function open() {
        ws.send(GenDeclare())
        ClientConns[notConnected[random]["Address"]] = ws
      })

      ws.on('message', function incoming(message) {
        checkClientMessage(ws, message)
      })

      ws.on('close', function close() {
        let connAddress = fetchClientConnAddress(ws)
        if (connAddress != null) {
          console.log(`client <${connAddress}> disconnect...`)
          delete ClientConns[connAddress]
        }
      })
    } catch (e) {
      console.log('keepOtherServerConn error...')
    }
  }
}

let OtherServerConnJob = null
if (OtherServerConnJob == null) {
  OtherServerConnJob = setInterval(keepOtherServerConn, 5000);
}


//start web server
const http = require('http')
const url = require("url")

const bulletins_reg = /^\/bulletins\?page=\d+/
const bulletin_reg = /^\/bulletin\/[0123456789ABCDEF]{32}$/
const bulletin_json_reg = /^\/bulletin\/[0123456789ABCDEF]{32}\/json$/
const account_bulletins_reg = /^\/account\/o[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{32,33}\/bulletins/
const account = /^o[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{32,33}\//

function add0(m) { return m < 10 ? '0' + m : m }

function timestamp_format(timestamp) {
  var time = new Date(timestamp);
  var y = time.getFullYear();
  var m = time.getMonth() + 1;
  var d = time.getDate();
  var h = time.getHours();
  var mm = time.getMinutes();
  var s = time.getSeconds();
  return y + '-' + add0(m) + '-' + add0(d) + ' ' + add0(h) + ':' + add0(mm) + ':' + add0(s);
}

http.createServer(function (request, response) {
  let path = url.parse(request.url).path;
  if (path == "/") {
    response.writeHeader(200, {
      "Content-Type": "text/html"
    });
    response.write(`
            <!DOCTYPE html>
            <html>
            <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
            <head>
              <title>oxo-chat-server</title>
            </head>
            <body bgcolor="#8FBC8F">
              <h1><a href="/bulletins">公告列表</a></h1>
              <h1><a href="/accounts">作者列表</a></h1>
              <h2><a href="https://github.com/oxogenesis/oxo-chat-server#deploy-with-ssl-nginx-pm2">自建/搭建本站教程</a></h2>
              <h2><a href="https://github.com/oxogenesis/oxo-chat-app/releases">App下载（on android推荐）</a></h2>
              <h2><a href="https://github.com/oxogenesis/oxo-chat-client/releases">Client下载（electron on windows不推荐）</a></h2>
              <h2>本站服务地址：${SelfURL}</h2>
              <h2>本站服务账号：${Address}</h2>
              <h3>{"URL": "${SelfURL}", "Address": "${Address}"}</h3>
            </body>
            </html>
            `);
    response.end();
  } else if (path == "/bulletins" || bulletins_reg.test(path)) {
    let page = 1
    if (path != "/bulletins") {
      page = ~~path.replace(/^\/bulletins\?page=/, '')
    }
    let SQL = `SELECT * FROM BULLETINS ORDER BY created_at DESC LIMIT ${PageSize} OFFSET ${(page - 1) * PageSize}`
    DB.all(SQL, (err, bulletins) => {
      if (err) {
        console.log(err)
      } else {
        let trs = ''
        bulletins.forEach(bulletin => {
          let title = bulletin.content.slice(0, 32).trim()
          trs = trs +
            `<tr>
            <td><a href="/account/${bulletin.address}/bulletins">${bulletin.address}</a></td>
            <td>${bulletin.sequence}</td>
            <td><a href="/bulletin/${bulletin.hash}">${title}</a></td>
            <td>${timestamp_format(bulletin.created_at)}</td>
          </tr>`
        })
        response.writeHeader(200, {
          "Content-Type": "text/html"
        });
        response.write(`
          <!DOCTYPE html>
          <html>
          <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
          <head>
            <title>oxo-chat-server</title>
          </head>
          <body bgcolor="#8FBC8F">
            <h1>公告列表</h1>
            <table border="1">
              <tr>
                <th>作者</th>
                <th>序号</th>
                <th>标题</th>
                <th>时间</th>
              </tr>
              ${trs}
            </table>
            ${PageLinks}
          </body>
          </html>
          `);
        response.end();
      }
    })
  } else if (bulletin_reg.test(path)) {
    let hash = path.replace(/^\/bulletin\//, '')
    let SQL = `SELECT * FROM BULLETINS WHERE hash = "${hash}"`
    DB.get(SQL, (err, item) => {
      if (err) {
        console.log(err)
      } else {
        if (item == null) {
          response.writeHeader(200, {
            "Content-Type": "text/html"
          });
          response.write(`
            <!DOCTYPE html>
            <html>
              <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
              <head>
                <title>oxo-chat-server</title>
              </head>
              <body bgcolor="#8FBC8F">
                <h1><a href="/bulletins">公告列表</a></h1>
                <h1>Bulletin#${hash}</h1>
                <h1>未被缓存...</h1>
              </body>
            </html>
            `)
          response.end();
        } else {
          let content = item.content.replace(/\n/g, '<br>')
          let quote = ''
          let quotes = JSON.parse(item.quote)
          if (quotes.length != '') {
            quote = '<h3>引用</h3><ul>'
            for (let i = quotes.length - 1; i >= 0; i--) {
              quote = quote + `<li><a href="/bulletin/${quotes[i].Hash}">${quotes[i].Address}#${quotes[i].Sequence}</a></li>`
            }
            quote = quote + '</ul><hr>'
          }

          let pre_bulletin = ''
          if (item.pre_hash != 'F4C2EB8A3EBFC7B6D81676D79F928D0E') {
            pre_bulletin = `<h3><a href="/bulletin/${item.pre_hash}">上一篇</a></h3>`
          }
          let next_bulletin = ""
          if (item.next_hash != null) {
            next_bulletin = `<h3><a href="/bulletin/${item.next_hash}">下一篇</a></h3>`
          }

          SQL = `SELECT * FROM QUOTES WHERE main_hash = "${hash}" ORDER BY signed_at ASC`
          DB.all(SQL, (err, is) => {
            if (err) {
              console.log(err)
            } else {
              let replys = ''
              is.forEach(i => {
                replys = replys + `<hr>
                <h4><a href="/bulletin/${i.quote_hash}">Bulletin#${i.quote_hash}</a></h4>
                <h4><a href="/account/${i.address}/bulletins">${i.address}</a>
                <a href="/bulletin/${i.quote_hash}/json">#${i.sequence}</a></h4>
                <h4> 发布@${timestamp_format(i.signed_at)}</h4>
                <h4>${i.content}</h4>`
              });
              response.writeHeader(200, {
                "Content-Type": "text/html"
              });
              response.write(`
                <!DOCTYPE html>
                <html>
                  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
                  <head>
                    <title>oxo-chat-server</title>
                  </head>
                  <body bgcolor="#8FBC8F">
                    <h1><a href="/bulletins">公告列表</a></h1>
                    <h1>Bulletin#${hash}</h1>
                    ${quote}
                    <h3><a href="/account/${item.address}/bulletins">${item.address}</a>
                    <a href="/bulletin/${hash}/json">#${item.sequence}</a></h3>
                    <h3> 发布@${timestamp_format(item.signed_at)}</h3>
                    ${pre_bulletin}${next_bulletin}
                    <h3>${content}</h3>
                    ${replys}
                  </body>
                </html>
                `);
              response.end();
            }
          })
        }
      }
    })
  } else if (path == "/accounts") {
    let trs = ''
    for (let i = 0; i < BulletinAccounts.length; i++) {
      trs = trs +
        `<tr>
        <td><li><a href="/account/${BulletinAccounts[i].address}/bulletins"><code>${BulletinAccounts[i].address}</code></a></td>
        <td>${BulletinAccounts[i].sequence}</td>
      </tr>`
    }
    response.writeHeader(200, {
      "Content-Type": "text/html"
    });
    response.write(`
      <!DOCTYPE html>
      <html>
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
      <head>
        <title>oxo-chat-server</title>
      </head>
      <body bgcolor="#8FBC8F">
        <h1>作者列表</h1>
        <table border="1">
          <tr>
            <th>作者</th>
            <th>公告数量</th>
          </tr>
          ${trs}
        </table>
      </body>
      </html>
      `);
    response.end();
  } else if (account_bulletins_reg.test(path)) {
    let address = path.replace('/account/', '')
    address = address.replace('/bulletins', '')
    let SQL = `SELECT * FROM BULLETINS WHERE address = '${address}' ORDER BY sequence DESC`
    DB.all(SQL, (err, bulletins) => {
      if (err) {
        console.log(err)
      } else {
        //update account sequence
        let sequence = 0
        if (bulletins.length > 0) {
          sequence = bulletins[0].sequence
        }
        for (let i = 0; i < BulletinAccounts.length; i++) {
          if (BulletinAccounts[i].address == address && BulletinAccounts[i].sequence < sequence) {
            BulletinAccounts[i].sequence = sequence
          }
        }

        let trs = ''
        bulletins.forEach(bulletin => {
          let title = bulletin.content.slice(0, 32).trim()
          trs = trs +
            `<tr>
            <td>${bulletin.address}</td>
            <td>${bulletin.sequence}</td>
            <td><a href="/bulletin/${bulletin.hash}">${title}</a></td>
            <td>${timestamp_format(bulletin.created_at)}</td>
          </tr>`
        })
        response.writeHeader(200, {
          "Content-Type": "text/html"
        });
        response.write(`
          <!DOCTYPE html>
          <html>
          <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
          <head>
            <title>oxo-chat-server</title>
          </head>
          <body bgcolor="#8FBC8F">
            <h1>公告列表</h1>
            <table border="1">
              <tr>
                  <th>作者</th>
                  <th>序号</th>
                  <th>标题</th>
                  <th>时间</th>
              </tr>
              ${trs}
            </table>
          </body>
          </html>
          `);
        response.end();
      }
    })
  } else if (bulletin_json_reg.test(path)) {
    let hash = path.replace(/^\/bulletin\//, '')
    hash = hash.replace(/\/json/, '')
    let SQL = `SELECT * FROM BULLETINS WHERE hash = "${hash}"`
    DB.get(SQL, (err, item) => {
      if (err) {
        console.log(err)
      } else {
        if (item == null) {
          response.writeHeader(200, {
            "Content-Type": "text/html"
          });
          response.write(`
            <!DOCTYPE html>
            <html>
              <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
              <head>
                <title>oxo-chat-server</title>
              </head>
              <body bgcolor="#8FBC8F">
                <h1><a href="/bulletins">公告列表</a></h1>
                <h1>Bulletin#${hash}</h1>
                <h1>未被缓存...</h1>
              </body>
            </html>
            `)
          response.end();
        } else {
          response.writeHeader(200, {
            "Content-Type": "application/json; charset=utf-8"
          });
          response.write(`${item.json}`);
          response.end();
        }
      }
    })
  } else {
    response.writeHeader(404, {
      "Content-Type": "text/html"
    });
    response.end();
  }
})
  .listen(8000);


// let SQL = `SELECT * FROM BULLETINS`
// DB.all(SQL, (err, bulletins) => {
//   if (err) {
//     console.log(err)
//   } else {
//     bulletins.forEach(bulletin => {
//       if (bulletin.next_hash == null) {
//         // console.log(`${bulletin.hash}`)
//         SQL = `SELECT * FROM BULLETINS WHERE pre_hash = "${bulletin.hash}"`
//         DB.get(SQL, (err, b) => {
//           if (err) {
//             console.log(err)
//           } else {
//             if (b != null) {
//               SQL = `UPDATE BULLETINS SET next_hash = '${b.hash}' WHERE hash = "${bulletin.hash}"`
//               DB.run(SQL, (err) => {
//                 if (err) {
//                   console.log(err)
//                 }
//               })
//             }
//           }
//         })
//       }
//     });
//   }
// })

// let SQL = `SELECT * FROM BULLETINS`
// DB.all(SQL, (err, bulletins) => {
//   if (err) {
//     console.log(err)
//   } else {
//     bulletins.forEach(bulletin => {
//       if (bulletin.quote != '[]') {
//         let quotes = JSON.parse(bulletin.quote)
//         quotes.forEach(quote => {
//           let SQL = `INSERT INTO QUOTES (main_hash, quote_hash, address, sequence, content, signed_at)
//                     VALUES ('${quote.Hash}', '${bulletin.hash}', '${bulletin.address}', '${bulletin.sequence}', '${bulletin.content}', ${bulletin.signed_at})`
//           DB.run(SQL, (err) => {
//             if (err) {
//               console.log(err)
//             }
//           })
//         });
//       }
//     });
//   }
// })
