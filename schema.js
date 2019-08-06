//client schema
//>>>declare<<<
let DeclareSchema = {
    "type": "object",
    "required": ["Action", "Timestamp", "PublicKey", "Signature"],
    "maxProperties": 4,
    "properties": {
        "Action": {
            "type": "number"
        },
        "Timestamp": {
            "type": "number"
        },
        "PublicKey": {
            "type": "string"
        },
        "Signature": {
            "type": "string"
        }
    }
};

//>>>bulletin<<<
let BulletinSchema = {
    "type": "object",
    "required": ["Action", "Sequence", "PreHash", "Quote", "Content", "Timestamp", "PublicKey", "Signature"],
    "maxProperties": 8,
    "properties": {
        "Action": {
            "type": "number"
        },
        "Sequence": {
            "type": "number"
        },
        "PreHash": {
            "type": "string"
        },
        "Quote": {
            "type": "array",
            "minItems": 0,
            "maxItems": 8,
            "items": {
                "type": "object",
                "required": ["Address", "Sequence", "Hash"],
                "properties": {
                    "Address": { "type": "string" },
                    "Sequence": { "type": "number" },
                    "Hash": { "type": "string" }
                }
            }
        },
        "Content": {
            "type": "string"
        },
        "Timestamp": {
            "type": "number"
        },
        "PublicKey": {
            "type": "string"
        },
        "Signature": {
            "type": "string"
        }
    }
};

let BulletinRequestSchema = {
    "type": "object",
    "required": ["Action", "Address", "Sequence", "To", "Timestamp", "PublicKey", "Signature"],
    "maxProperties": 7,
    "properties": {
        "Action": {
            "type": "number"
        },
        "Address": {
            "type": "string"
        },
        "Sequence": {
            "type": "number"
        },
        "To": {
            "type": "string"
        },
        "Timestamp": {
            "type": "number"
        },
        "PublicKey": {
            "type": "string"
        },
        "Signature": {
            "type": "string"
        }
    }
};

let ObjectResponseSchema = {
    "type": "object",
    "required": ["Action", "Object", "To", "Timestamp", "PublicKey", "Signature"],
    "maxProperties": 6,
    "properties": {
        "Action": {
            "type": "number"
        },
        "Object": {
            "type": "object"
        },
        "To": {
            "type": "string"
        },
        "Timestamp": {
            "type": "number"
        },
        "PublicKey": {
            "type": "string"
        },
        "Signature": {
            "type": "string"
        }
    }
};

//>>>chat<<<
let ChatMessageSchema = {
    "type": "object",
    "required": ["Action", "Sequence", "PreHash", "PairHash", "Content", "To", "Timestamp", "PublicKey", "Signature"],
    "maxProperties": 9,
    "properties": {
        "Action": {
            "type": "number"
        },
        "Sequence": {
            "type": "number"
        },
        "PreHash": {
            "type": "string"
        },
        "PairHash": {
            "type": "array",
            "minItems": 0,
            "maxItems": 8,
            "items": {
                "type": "string",
            }
        },
        "Content": {
            "type": "string"
        },
        "To": {
            "type": "string"
        },
        "Timestamp": {
            "type": "number"
        },
        "PublicKey": {
            "type": "string"
        },
        "Signature": {
            "type": "string"
        }
    }
};

let ChatSyncSchema = {
    "type": "object",
    "required": ["Action", "CurrentSequence", "To", "Timestamp", "PublicKey", "Signature"],
    "maxProperties": 6,
    "properties": {
        "Action": {
            "type": "number"
        },
        "CurrentSequence": {
            "type": "number"
        },
        "To": {
            "type": "string"
        },
        "Timestamp": {
            "type": "number"
        },
        "PublicKey": {
            "type": "string"
        },
        "Signature": {
            "type": "string"
        }
    }
};

//DH PublicKey
let DHPublicKeySchema = {
    "type": "object",
    "required": ["Action", "Division", "Sequence", "DHPublicKey", "Pair", "To", "Timestamp", "PublicKey", "Signature"],
    "maxProperties": 9,
    "properties": {
        "Action": {
            "type": "number"
        },
        "Division": {
            "type": "number"
        },
        "Sequence": {
            "type": "number"
        },
        "DHPublicKey": {
            "type": "string"
        },
        "Pair": {
            "type": "string"
        },
        "To": {
            "type": "string"
        },
        "Timestamp": {
            "type": "number"
        },
        "PublicKey": {
            "type": "string"
        },
        "Signature": {
            "type": "string"
        }
    }
};
//end client schema

var Ajv = require('ajv');
var ajv = new Ajv({ allErrors: true });

//client
var vDeclare = ajv.compile(DeclareSchema);
var vBulletinRequestSchema = ajv.compile(BulletinRequestSchema);
var vObjectResponseSchema = ajv.compile(ObjectResponseSchema);
var vChatMessageSchema = ajv.compile(ChatMessageSchema);
var vChatSyncSchema = ajv.compile(ChatSyncSchema);
var vDHPublicKeySchema = ajv.compile(DHPublicKeySchema);

function checkClientSchema(strJson) {
    if (typeof strJson == "string") {
        try {
            let json = JSON.parse(strJson);
            if (vObjectResponseSchema(json) || vBulletinRequestSchema(json) || vChatMessageSchema(json) || vChatSyncSchema(json) || vDHPublicKeySchema(json) || vDeclare(json)) {
                return json;
            } else {
                return false;
            }
        } catch (e) {
            return false;
        }
    } else {
        return false;
    }
}


module.exports = {
    checkClientSchema
}