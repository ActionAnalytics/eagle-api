'use strict';

var dbm;
var type;
var seed;

/**
  * We receive the dbmigrate dependency from dbmigrate initially.
  * This enables us to not have to rely on NODE_PATH.
  */
exports.setup = function(options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
};

exports.up = function(db) {
  let mClient;
  return db.connection.connect(db.connectionString, { native_parser: true })
    .then((mClientInst) => {
      // mClientInst is an instance of MongoClient
      mClient = mClientInst;
      var p = mClient.collection('epic');
      p.createIndex( {
        displayName: "text",
        name: "text",
        description: "text",
        eacDecision: "text",
        location: "text",
        region: "text",
        commodity: "text",
        type: "text",
        epicProjectId: "text",
        sector: "text",
        status: "text",
        code: "text" },
        {
          name: "searchIndex"
        }
      );
      // TODO: Create a collation that does a case insensitive search
      mClient.close();
    })
    .catch((e) => {
      console.log("e:", e);
      mClient.close()
    });
};

exports.down = function(db) {
  return null;
};

exports._meta = {
  "version": 1
};