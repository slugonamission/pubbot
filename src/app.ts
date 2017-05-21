import * as express from "express";
import * as pubbot from "./pubbot";
import * as pubbot_store from "./pubbot_store";
import * as incoming_api from "./slack_incoming_api";
import * as installs from "./installations";
import * as redis from "redis";
import * as bodyParser from "body-parser";

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

  var redis_host = services.redis[0].credentials.host;
  var redis_port = services.redis[0].credentials.port;
  var redis_pw = services.redis[0].credentials.password;

  var REDIS_URI = `redis://user:${redis_pw}@${redis_host}:${redis_port}/0`;

  var PORT = 8080;
}
else {
  var PORT = parseInt(process.env['LISTEN_PORT']) || 8080;
  var REDIS_URI: string = process.env['REDIS_URI'] || "redis://localhost";
}

var SLACK_CLIENT_ID     = process.env['SLACK_CLIENT_ID'];
var SLACK_CLIENT_SECRET = process.env['SLACK_CLIENT_SECRET'];
var SLACK_VERIFICATION_TOKEN = process.env['SLACK_VERIFICATION_TOKEN'];

var db = redis.createClient({ url: REDIS_URI });

db.on("error", (err: any) => {
  console.error("Redis error: " + err);
  process.exit(1);
});

// Woop. Poor man's DI :)
var instMgr = new installs.RedisInstallationManager(db, SLACK_CLIENT_ID, SLACK_CLIENT_SECRET);
var botStore = new pubbot_store.InMemoryPubbotStore();
var bot = new pubbot.SlackPubbot(botStore, instMgr);
var api = incoming_api.createApi(bot, instMgr, SLACK_VERIFICATION_TOKEN);

var app = express();
app.use("/", api);

app.listen(PORT, (err: any) => {
  if(err) {
    console.error("Error listening: " + err);
    process.exit(1);
  }

  console.log("Listening on port " + PORT + "!");
});
