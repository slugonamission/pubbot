import * as express from "express";
import * as bodyParser from "body-parser";
import { Pubbot } from "./pubbot";
import { IInstallationManager } from "./installations";

// We're going to cheat here instead, and don't bother with a class.
// Just use a method to do the proxying instead
export function createApi(bot: Pubbot, installs: IInstallationManager, verificationToken: string) {
  var router = express.Router();

  router.get("/oauth", (req, res) => {
    // Get the parameters and proxy on...
    var code = req.query.code;
    if(!code) return res.status(400).end("No code provided...");

    installs.provideCode(code, err => {
      if(err) return res.status(500).end(err);
      res.end("Ok!");
    });
  });

  router.post("/jamiego", bodyParser.urlencoded());
  router.post("/jamiego", (req, res) => {
    // Unpick...
    if(!req.body) { console.error("jamiego: no body sent"); return res.status(400).end("No body sent..."); }
    if(!req.body.token || req.body.token != verificationToken) { console.error("jamiego: verification token doesn't match"); return res.status(400).end("Verification token does not match"); }

    var team = req.body.team_id;
    var channel = req.body.channel_id;

    if(!team || !channel) { console.error("jamiego: no team/channel"); return res.status(400).end("No team or channel sent"); }

    bot.sendRequest(team, channel, 1, err => {
      if(err) { console.error("jamiego: " + err); return res.end(err) };

      res.end();
    });
  });

  router.post("/jamiestop", bodyParser.urlencoded());
  router.post("/jamiestop", (req, res) => {
    // Unpick...
    if(!req.body) { console.error("jamiestop: no body sent"); return res.status(400).end("No body sent..."); }
    if(!req.body.token || req.body.token != verificationToken) { console.error("jamiestop: verification token doesn't match"); return res.status(400).end("Verification token does not match"); }

    var team = req.body.team_id;
    var channel = req.body.channel_id;

    if(!team || !channel) { console.error("jamiestop: no team/channel"); return res.status(400).end("No team or channel sent"); }

    bot.stopAll(team, channel, err => {
      if(err) { console.error("jamiestop: " + err); return res.end(err) };

      res.end();
    });
  })

  router.post("/action", bodyParser.urlencoded());
  router.post("/action", (req, res) => {
    if(!req.body) { console.error("action: no body sent"); return res.status(400).end("No body sent..."); }

    var payload = JSON.parse(req.body.payload);

    if(!payload.token || payload.token != verificationToken) { console.error("action: verification token doesn't match"); return res.status(400).end("Verification token does not match"); }

    var team = payload.team.id;
    var channel = payload.channel.id;
    if(!team || !channel) { console.error("action: no team/channel"); return res.status(400).end("No team or channel sent"); }
    
    bot.tickRequest(team, channel, (err, pubbing) => {
      // I'm not 100% happy putting responses here, but we'll find a better place for them later.
      // Ideally, the driver would get a handle to the message, but we can't do that without
      // using the chat.send methods directly, which requires more permissions.
      if(err) {
        console.error("action: " + err);

        // Update the message. Just say it timed out
        res.json({
          text: "The pub request timed out",
          replace_original: true
        });
      };

      if(pubbing) {
        res.json({
          text: "PUB TIME!",
          replace_original: true
        });
      }
      else {
        res.end();
      }
    });
  });

  return router;
}