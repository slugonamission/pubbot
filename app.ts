import * as express from "express";
import * as installs from "./installations";
import * as mongodb from "mongodb";

// Sanity check configuration
var requiredArgs = [
  "SLACK_CLIENT_ID",
  "SLACK_CLIENT_SECRET",
  "SLACK_VERIFICATION_TOKEN"
];

requiredArgs.forEach(a => {
  if(process.env[a] === undefined) {
    console.error(`Required argument ${a} missing.`);
    process.exit(1);
  }
});

// Are we running under CloudFoundry?
if(process.env['VCAP_SERVICES']) {
  var services = JSON.parse(process.env.VCAP_SERVICES);
  var MONGO_URI = services.mongodb[0].credentials.url;
  var PORT = 8080;
}
else {
  var PORT = parseInt(process.env['LISTEN_PORT']) || 8080;
  var MONGO_URI = process.env['MONGO_URI'] || "mongodb://localhost:27017";
}

var SLACK_CLIENT_ID     = process.env['SLACK_CLIENT_ID'];
var SLACK_CLIENT_SECRET = process.env['SLACK_CLIENT_SECRET'];
var SLACK_VERIFICATION_TOKEN = process.env['SLACK_VERIFICATION_TOKEN'];



// Create required bits
var db = mongodb.MongoClient.connect(MONGO_URI, (err, db) => {
  if(err) {
    console.error("Error connecting to Mongodb " + err);
    process.exit(1);
  }

  console.log("Connected to MongoDB");

  var instMgr = new installs.InstallationManager(db, SLACK_CLIENT_ID, SLACK_CLIENT_SECRET);

  // Set up Express...
  var app = express();
  app.get("/oauth", (req, res) => {
    // Get the parameters and proxy on...
    var code = req.query.code;
    if(!code) return res.status(400).end("No code provided...");

    instMgr.provideCode(code, err => {
      if(err) return res.status(500).end(err);
      res.end("Ok!");
    });
  });

  app.listen(PORT, (err: any) => {
    if(err) {
      console.error("Error listening: " + err);
      process.exit(1);
    }

    console.log("Listening on port " + PORT + "!");
  });
});
